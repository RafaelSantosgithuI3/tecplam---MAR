// @ts-nocheck
import { ChecklistItem, ChecklistLog, User, MeetingLog, Permission, ConfigItem, LineStopData, ConfigModel } from '../types';
import { CHECKLIST_ITEMS } from '../constants';
import { apiFetch, clearApiCache, isServerConfigured, getServerUrl } from './networkConfig';

const fetchUncachedCollection = async <T>(endpoint: string): Promise<T> => {
    return apiFetch(endpoint, { useCache: false });
};

export const invalidateApiCollectionsCache = async () => {
    await clearApiCache();
};

type HeavyCollectionKey = 'logs' | 'meetings' | 'line-stops';

const HEAVY_CACHE_DB_NAME = 'tecplam-heavy-collections';
const HEAVY_CACHE_DB_VERSION = 1;
const HEAVY_CACHE_STORE_NAME = 'collections';
const HEAVY_CACHE_TTL = 15 * 60 * 1000;

type HeavyCacheRecord<T> = {
    key: HeavyCollectionKey;
    data: T;
    updatedAt: number;
};

let heavyCacheDbPromise: Promise<IDBDatabase> | null = null;
let syncEventSource: EventSource | null = null;
let syncReconnectTimer: number | null = null;
const syncListeners = new Set<(event: any) => void>();

const runInBackground = (task: () => Promise<void>) => {
    const executeTask = () => {
        void task().catch((error) => {
            console.error('Erro em tarefa de background:', error);
        });
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(executeTask, { timeout: 1200 });
        return;
    }

    setTimeout(executeTask, 0);
};

const openHeavyCacheDb = (): Promise<IDBDatabase> => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
        return Promise.reject(new Error('IndexedDB não disponível neste ambiente.'));
    }

    if (!heavyCacheDbPromise) {
        heavyCacheDbPromise = new Promise((resolve, reject) => {
            const request = window.indexedDB.open(HEAVY_CACHE_DB_NAME, HEAVY_CACHE_DB_VERSION);

            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(HEAVY_CACHE_STORE_NAME)) {
                    database.createObjectStore(HEAVY_CACHE_STORE_NAME, { keyPath: 'key' });
                }
            };

            request.onsuccess = () => {
                const database = request.result;
                database.onversionchange = () => {
                    database.close();
                    heavyCacheDbPromise = null;
                };
                resolve(database);
            };

            request.onerror = () => {
                heavyCacheDbPromise = null;
                reject(request.error || new Error('Falha ao abrir cache de coleções pesadas.'));
            };
        });
    }

    return heavyCacheDbPromise;
};

const readHeavyCache = async <T>(key: HeavyCollectionKey): Promise<T | null> => {
    const database = await openHeavyCacheDb();

    return new Promise((resolve, reject) => {
        const tx = database.transaction(HEAVY_CACHE_STORE_NAME, 'readonly');
        const request = tx.objectStore(HEAVY_CACHE_STORE_NAME).get(key);

        request.onsuccess = () => {
            const record = request.result as HeavyCacheRecord<T> | undefined;
            if (!record) {
                resolve(null);
                return;
            }

            if (Date.now() - record.updatedAt > HEAVY_CACHE_TTL) {
                resolve(null);
                return;
            }

            resolve(record.data);
        };

        request.onerror = () => {
            reject(request.error || new Error('Falha ao ler cache de coleções pesadas.'));
        };
    });
};

const writeHeavyCache = async <T>(key: HeavyCollectionKey, data: T): Promise<void> => {
    const database = await openHeavyCacheDb();

    await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(HEAVY_CACHE_STORE_NAME, 'readwrite');
        const record: HeavyCacheRecord<T> = {
            key,
            data,
            updatedAt: Date.now()
        };

        tx.objectStore(HEAVY_CACHE_STORE_NAME).put(record);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Falha ao salvar cache de coleções pesadas.'));
        tx.onabort = () => reject(tx.error || new Error('Transação abortada no cache de coleções pesadas.'));
    });
};

const sortHeavyCollectionItems = <T extends Record<string, any>>(items: T[]): T[] => {
    return [...items].sort((a, b) => {
        const left = new Date(b?.sentAt || b?.createdAt || b?.date || 0).getTime();
        const right = new Date(a?.sentAt || a?.createdAt || a?.date || 0).getTime();
        return left - right;
    });
};

const resolveHeavyItemId = (item: Record<string, any>) => {
    if (item?.id !== undefined && item?.id !== null) return String(item.id);
    if (item?.code !== undefined && item?.code !== null) return String(item.code);
    return null;
};

const applyHeavyCacheDelta = async (key: HeavyCollectionKey, action: string, items: any[] = [], ids: string[] = []) => {
    const current = (await readHeavyCache<any[]>(key)) || [];
    let next = current;

    if (action === 'replace') {
        next = Array.isArray(items) ? items : [];
    } else if (action === 'upsert') {
        const nextMap = new Map<string, any>();
        current.forEach((item) => {
            const id = resolveHeavyItemId(item);
            if (id) nextMap.set(id, item);
        });
        items.forEach((item) => {
            const id = resolveHeavyItemId(item);
            if (id) nextMap.set(id, item);
        });
        next = Array.from(nextMap.values());
    } else if (action === 'remove') {
        const removeSet = new Set((ids || []).map(String));
        next = current.filter((item) => {
            const id = resolveHeavyItemId(item);
            return !id || !removeSet.has(id);
        });
    }

    const sorted = sortHeavyCollectionItems(next);
    await writeHeavyCache(key, sorted);
    return sorted;
};

const emitSyncEvent = (event: any) => {
    syncListeners.forEach((listener) => {
        try {
            listener(event);
        } catch (error) {
            console.error('Erro ao processar listener de sync:', error);
        }
    });
};

const scheduleSyncReconnect = () => {
    if (typeof window === 'undefined' || syncReconnectTimer !== null) return;
    syncReconnectTimer = window.setTimeout(() => {
        syncReconnectTimer = null;
        connectToSyncStream();
    }, 3000);
};

const connectToSyncStream = () => {
    if (typeof window === 'undefined' || syncEventSource) return;

    const baseUrl = getServerUrl() || window.location.origin;
    if (!baseUrl) return;

    try {
        syncEventSource = new EventSource(`${baseUrl}/api/sync-stream`);

        syncEventSource.onmessage = (message) => {
            let payload: any = null;

            try {
                payload = JSON.parse(message.data || '{}');
            } catch (error) {
                console.error('Erro ao interpretar evento SSE:', error);
                return;
            }

            if (!payload?.collection) return;

            if (payload.collection === 'logs' || payload.collection === 'meetings' || payload.collection === 'line-stops') {
                runInBackground(async () => {
                    const snapshot = await applyHeavyCacheDelta(
                        payload.collection as HeavyCollectionKey,
                        payload.action,
                        payload.items || [],
                        payload.ids || []
                    );

                    emitSyncEvent({ ...payload, snapshot });
                });
                return;
            }

            emitSyncEvent(payload);
        };

        syncEventSource.onerror = () => {
            if (syncEventSource) {
                syncEventSource.close();
                syncEventSource = null;
            }
            if (syncListeners.size > 0) {
                scheduleSyncReconnect();
            }
        };
    } catch (error) {
        console.error('Erro ao conectar no sync-stream:', error);
        syncEventSource = null;
        scheduleSyncReconnect();
    }
};

export const subscribeToSyncStream = (listener: (event: any) => void) => {
    syncListeners.add(listener);
    connectToSyncStream();

    return () => {
        syncListeners.delete(listener);

        if (syncListeners.size === 0) {
            if (syncEventSource) {
                syncEventSource.close();
                syncEventSource = null;
            }
            if (syncReconnectTimer !== null && typeof window !== 'undefined') {
                window.clearTimeout(syncReconnectTimer);
                syncReconnectTimer = null;
            }
        }
    };
};

const fetchHeavyCollectionWithCache = async <T>(key: HeavyCollectionKey, endpoint: string): Promise<T> => {
    try {
        const data = await fetchUncachedCollection<T>(endpoint);
        void writeHeavyCache(key, data);
        return data;
    } catch (error) {
        const cachedData = await readHeavyCache<T>(key);
        if (cachedData) return cachedData;
        throw error;
    }
};

export const getCachedLogs = async (): Promise<ChecklistLog[]> => {
    try {
        return (await readHeavyCache<ChecklistLog[]>('logs')) || [];
    } catch {
        return [];
    }
};

export const getCachedMeetings = async (): Promise<MeetingLog[]> => {
    try {
        return (await readHeavyCache<MeetingLog[]>('meetings')) || [];
    } catch {
        return [];
    }
};

export const hydrateHeavyCollectionsInBackground = () => {
    runInBackground(async () => {
        await Promise.allSettled([
            fetchUncachedCollection<ChecklistLog[]>('/logs').then(data => writeHeavyCache('logs', data)),
            fetchUncachedCollection<MeetingLog[]>('/meetings').then(data => writeHeavyCache('meetings', data)),
            fetchUncachedCollection<ChecklistLog[]>('/line-stops').then(data => writeHeavyCache('line-stops', data))
        ]);
    });
};

// --- TIMEZONE UTIL ---
export const getManausDate = (): Date => {
    const now = new Date();
    const manausTimeStr = now.toLocaleString("en-US", { timeZone: "America/Manaus" });
    return new Date(manausTimeStr);
};

// --- CONFIGURAÇÃO DO CHECKLIST ---

export const getChecklistItems = async (type: 'LEADER' | 'MAINTENANCE' = 'LEADER'): Promise<ChecklistItem[]> => {
    try {
        const items = await apiFetch('/config/items', { useCache: true });
        if (!items || items.length === 0) {
            if (type === 'LEADER') return CHECKLIST_ITEMS.map(i => ({ ...i, type: 'LEADER' }));
            return [];
        }
        const filtered = items.filter((i: ChecklistItem) => (i.type || 'LEADER') === type);
        if (type === 'LEADER' && filtered.length === 0) return CHECKLIST_ITEMS.map(i => ({ ...i, type: 'LEADER' }));
        return filtered;
    } catch (e) {
        if (type === 'LEADER') return CHECKLIST_ITEMS.map(i => ({ ...i, type: 'LEADER' }));
        return [];
    }
};

export const getAllChecklistItemsRaw = async (): Promise<ChecklistItem[]> => {
    try { return await apiFetch('/config/items', { useCache: true }); } catch (e) { return []; }
}

export const saveChecklistItems = async (items: ChecklistItem[]) => {
    try { await apiFetch('/config/items', { method: 'POST', body: JSON.stringify({ items }) }); } catch (e) { console.error("Erro ao salvar itens", e); }
};

export const resetChecklistToDefault = async () => {
    try { await apiFetch('/config/items/reset', { method: 'POST' }); } catch (e) { console.error(e); }
    return CHECKLIST_ITEMS;
};

// --- PERMISSIONS ---

export const getPermissions = async (): Promise<Permission[]> => {
    try { return await apiFetch('/config/permissions', { useCache: true }); } catch (e) { return []; }
}

export const savePermissions = async (permissions: Permission[]) => {
    try { await apiFetch('/config/permissions', { method: 'POST', body: JSON.stringify({ permissions }) }); } catch (e) { console.error(e); }
}

// --- LINHAS DE PRODUÇÃO (CRUD com IDs) ---

export const getLines = async (): Promise<ConfigItem[]> => {
    try {
        if (isServerConfigured()) {
            // Backend retorna [{ id: 1, name: "Linha 1" }, ...]
            const lines = await apiFetch('/config/lines', { useCache: true });
            if (Array.isArray(lines) && lines.length > 0) return lines;
        }
        // Fallback local se servidor offline ou vazio
        return [
            { id: 1, name: 'TP_TNP-01' }, { id: 2, name: 'TP_TNP-02' },
            { id: 3, name: 'TP_TNP-03' }, { id: 4, name: 'TP_SEC-01' }, { id: 5, name: 'TP_SEC-02' }
        ];
    } catch (e) {
        console.error("Erro ao buscar linhas", e);
        return [
            { id: 1, name: 'TP_TNP-01' }, { id: 2, name: 'TP_TNP-02' },
            { id: 3, name: 'TP_TNP-03' }, { id: 4, name: 'TP_SEC-01' }, { id: 5, name: 'TP_SEC-02' }
        ];
    }
};

export const addLine = async (lineName: string) => {
    try {
        // Envia 'name' conforme esperado pelo backend corrigido
        await apiFetch('/config/lines', { method: 'POST', body: JSON.stringify({ name: lineName }) });
    } catch (e) { console.error(e); throw e; }
}

export const deleteLine = async (id: string | number) => {
    try {
        await apiFetch(`/config/lines/${id}`, { method: 'DELETE' });
    } catch (e) { console.error(e); throw e; }
}

// --- CARGOS (ROLES) (CRUD com IDs) ---

export const getRoles = async (): Promise<ConfigItem[]> => {
    try {
        if (isServerConfigured()) {
            const roles = await apiFetch('/config/roles', { useCache: true });
            if (Array.isArray(roles) && roles.length > 0) return roles;
        }
        return [
            { id: 1, name: 'Diretor' }, { id: 2, name: 'TI' }, { id: 3, name: 'Supervisor' }, { id: 4, name: 'Líder' }
        ];
    } catch (e) {
        return [
            { id: 1, name: 'Diretor' }, { id: 2, name: 'TI' }, { id: 3, name: 'Supervisor' }, { id: 4, name: 'Líder' }
        ];
    }
};

export const addRole = async (roleName: string) => {
    try {
        await apiFetch('/config/roles', { method: 'POST', body: JSON.stringify({ name: roleName }) });
    } catch (e) { console.error(e); throw e; }
}

export const deleteRole = async (id: string | number) => {
    try {
        await apiFetch(`/config/roles/${id}`, { method: 'DELETE' });
    } catch (e) { console.error(e); throw e; }
}


// --- MODELOS E POSTOS (Genéricos ainda) ---

export const getModels = async (): Promise<string[]> => {
    try { const models = await apiFetch('/config/models', { useCache: true }); if (Array.isArray(models)) return models.map((m: any) => m.name); return []; } catch (e) { return []; }
};

export const saveModels = async (models: string[]) => {
    try { await apiFetch('/config/models', { method: 'POST', body: JSON.stringify({ items: models }) }); } catch (e) { console.error(e); }
};

export const getModelsFull = async (): Promise<ConfigModel[]> => {
    try {
        const models = await apiFetch('/config/models', { useCache: true });
        if (Array.isArray(models)) return models;
        return [];
    } catch (e) { return []; }
};

export const saveModelsFull = async (models: ConfigModel[]) => {
    try {
        await apiFetch('/config/models', {
            method: 'POST',
            body: JSON.stringify({ items: models })
        });
    } catch (e) { console.error(e); }
};

export const getUnifiedModels = async (): Promise<ConfigModel[]> => {
    try {
        const models = await apiFetch('/config/models/unified', { useCache: true });
        if (Array.isArray(models)) return models;
        return [];
    } catch (e) { return []; }
};

export const getStations = async (): Promise<string[]> => {
    try { const stations = await apiFetch('/config/stations', { useCache: true }); if (Array.isArray(stations)) return stations.map((s: any) => s.name); return []; } catch (e) { return []; }
};

export const saveStations = async (stations: string[]) => {
    try { await apiFetch('/config/stations', { method: 'POST', body: JSON.stringify({ items: stations }) }); } catch (e) { console.error(e); }
};

export const getLayoutWorkstations = async (): Promise<any[]> => {
    try {
        const ws = await apiFetch('/workstations', { useCache: true });
        return Array.isArray(ws) ? ws : [];
    } catch (e) { return []; }
};

export const addLayoutWorkstation = async (name: string, modelName: string, peopleNeeded: number, order?: string) => {
    try {
        return await apiFetch('/workstations', {
            method: 'POST',
            body: JSON.stringify({ name, modelName, peopleNeeded, order })
        });
    } catch (e) { console.error(e); throw e; }
};

export const editLayoutWorkstation = async (id: number, name: string, modelName: string, order: string, peopleNeeded: number) => {
    try {
        await apiFetch(`/workstations/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ name, modelName, order, peopleNeeded })
        });
    } catch (e) {
        console.error(e);
        throw e;
    }
};

export const deleteLayoutWorkstation = async (id: number) => {
    try {
        await apiFetch(`/workstations/${id}`, {
            method: 'DELETE'
        });
    } catch (e) {
        console.error(e);
        throw e;
    }
};

export const saveLayoutWorkstationsBulk = async (workstations: any[]) => {
    try {
        return await apiFetch('/workstations/bulk', {
            method: 'POST',
            body: JSON.stringify({ items: workstations })
        });
    } catch (e) { console.error(e); throw e; }
};

// --- LOGS ---

export const saveLog = async (log: ChecklistLog) => {
    try { await apiFetch('/logs', { method: 'POST', body: JSON.stringify(log) }); } catch (e) { console.error("Erro ao salvar log", e); throw e; }
};

export const getLogs = async (): Promise<ChecklistLog[]> => {
    try {
        return await fetchHeavyCollectionWithCache<ChecklistLog[]>('logs', '/logs');
    } catch (e) {
        console.error("Erro ao buscar logs", e);
        return [];
    }
};

export const getTodayLogForUser = async (matricula: string): Promise<ChecklistLog | undefined> => {
    try {
        const logs = await getLogs();
        const today = getManausDate().toISOString().split('T')[0];
        return logs.find(l => l.userId === matricula && l.date.startsWith(today));
    } catch (e) { return undefined; }
};

export const getMissingLeadersForToday = async (allUsers: User[]): Promise<User[]> => {
    const logs = await getLogs();
    const today = getManausDate().toISOString().split('T')[0];

    const leaders = allUsers.filter(u =>
        u.role.toLowerCase().includes('lider') ||
        u.role.toLowerCase().includes('líder') ||
        u.role.toLowerCase().includes('supervisor')
    );

    return leaders.filter(lider => {
        const hasLog = logs.some(log => log.userId === lider.matricula && log.date.startsWith(today) && log.type !== 'MAINTENANCE' && log.type !== 'LINE_STOP');
        return !hasLog;
    });
};

// --- PARADA DE LINHA ---

export const getLineStops = async (): Promise<ChecklistLog[]> => {
    try {
        return await fetchHeavyCollectionWithCache<ChecklistLog[]>('line-stops', '/line-stops');
    } catch (e) {
        console.error("Erro ao buscar paradas", e);
        return [];
    }
}

export const saveLineStop = async (log: ChecklistLog) => {
    try {
        await apiFetch('/line-stops', {
            method: 'POST',
            body: JSON.stringify({ ...log, shift: log.userShift })
        });
    } catch (e) {
        console.error("Erro ao salvar parada", e);
        throw e;
    }
}

// --- ATA DE REUNIÃO ---

export const saveMeeting = async (meeting: MeetingLog) => {
    try { await apiFetch('/meetings', { method: 'POST', body: JSON.stringify(meeting) }); } catch (e) { console.error("Erro ao salvar ata", e); throw e; }
}

export const getMeetings = async (): Promise<MeetingLog[]> => {
    try {
        return await fetchHeavyCollectionWithCache<MeetingLog[]>('meetings', '/meetings');
    } catch (e) {
        console.error("Erro ao buscar atas", e);
        return [];
    }
}

// --- MAINTENANCE ITEMS ---
export const getMaintenanceItems = async (machineId: string): Promise<ChecklistItem[]> => {
    const items = await getChecklistItems('MAINTENANCE');
    return items.filter(i => i.category.toLowerCase() === machineId.toLowerCase());
}

// --- RELATÓRIOS ---

export const getWeekNumber = (d: Date) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

export const getLogsByWeekNumber = async (year: number, week: number, shift: string, allUsers: User[]): Promise<ChecklistLog[]> => {
    const logs = await getLogs();

    return logs.filter(log => {
        if (log.type === 'MAINTENANCE' || log.type === 'LINE_STOP') return false;

        const logDate = new Date(log.date);
        const logYear = logDate.getFullYear();
        const logWeek = getWeekNumber(logDate);

        if (logYear !== year || logWeek !== week) return false;

        const user = allUsers.find(u => u.matricula === log.userId);
        const userShift = user ? user.shift : '';

        if (shift && shift !== 'ALL') {
            if (userShift !== shift) return false;
        }
        return true;
    });
}

export const getLogsByWeekSyncStrict = (
    logs: ChecklistLog[],
    refDate: Date,
    line: string,
    shift: string,
    allUsers: User[]
): ChecklistLog[] => {
    const current = new Date(refDate);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);

    const monday = new Date(current.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return logs.filter(log => {
        if (log.type === 'MAINTENANCE' || log.type === 'LINE_STOP') return false;

        const logD = new Date(log.date);

        const user = allUsers.find(u => u.matricula === log.userId);
        const logShift = user ? user.shift : '??';
        if (shift && shift !== 'ALL' && logShift !== shift) return false;

        return (log.line === line) &&
            logD >= monday &&
            logD <= sunday;
    });
};

export const saveBackupToServer = async (fileName: string, fileData: string) => {
    try { await apiFetch('/backup/save', { method: 'POST', body: JSON.stringify({ fileName, fileData }) }); } catch (e) { console.error("Erro backup", e); throw e; }
}

export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};