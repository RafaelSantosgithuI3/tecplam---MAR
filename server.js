const express = require('express');
const https = require('https');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const os = require('os');
const { PrismaClient } = require('@prisma/client');
// const sqlite3 = require('sqlite3').verbose(); // Removed

const compression = require('compression');

const app = express();
const prisma = new PrismaClient({
    log: ['error', 'warn'], // Optional: Add 'query' for debugging
});

// OTIMIZAÇÃO 1: SQLite WAL Mode (Evita travamentos em HD lento)
async function enableWAL() {
    try {
        await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
        await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;'); // Menos flush no disco
        console.log('⚡ SQLite WAL Mode Enabled (Optimized for HDD)');
    } catch (e) {
        console.error('Failed to enable WAL', e);
    }
}
enableWAL();

const CACHE_KEYS = Object.freeze({
    USERS: 'users',
    LOGS: 'logs',
    CONFIG_ITEMS: 'config-items',
    LINE_STOPS: 'line-stops',
    ROLES: 'roles',
    LINES: 'lines',
    MODELS: 'models',
    STATIONS: 'stations',
    PERMISSIONS: 'permissions',
    NOTICES: 'notices',
    MEETINGS: 'meetings',
    SCRAPS: 'scraps',
    MATERIALS: 'materials',
    EMPLOYEES: 'employees',
    BOXES: 'boxes',
    WORKSTATIONS: 'workstations',
    PRODUCTION_MODELS: 'production-models',
    LAYOUTS: 'layouts'
});

const GLOBAL_RAM_CACHE = new Map();
const SSE_CLIENTS = new Set();
let SCRAP_CACHE = [];

const normalizeMoney = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
};

const safeJsonParse = (value, fallback) => {
    try {
        return typeof value === 'string' ? JSON.parse(value) : (value ?? fallback);
    } catch (e) {
        return fallback;
    }
};

const safeDateValue = (value) => {
    const parsed = new Date(value || 0).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

const sendSseMessage = (client, payload) => {
    client.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const broadcastSyncDelta = (collection, action, payload = {}) => {
    const message = {
        collection,
        action,
        timestamp: Date.now(),
        ...payload
    };

    SSE_CLIENTS.forEach((client) => {
        try {
            sendSseMessage(client, message);
        } catch (error) {
            console.error('Erro ao enviar delta SSE:', error);
            SSE_CLIENTS.delete(client);
        }
    });
};

const resolveCacheId = (collection, item) => {
    if (!item) return null;

    switch (collection) {
        case CACHE_KEYS.USERS:
        case CACHE_KEYS.EMPLOYEES:
            return item.matricula != null ? String(item.matricula) : null;
        case CACHE_KEYS.MATERIALS:
            return item.code != null ? String(item.code) : null;
        case CACHE_KEYS.ROLES:
        case CACHE_KEYS.LINES:
        case CACHE_KEYS.MODELS:
        case CACHE_KEYS.STATIONS:
            return item.id != null ? String(item.id) : (item.name != null ? String(item.name) : null);
        case CACHE_KEYS.PERMISSIONS:
            return `${item.role || ''}::${item.module || ''}::${item.tab || ''}`;
        default:
            return item.id != null ? String(item.id) : (item.name != null ? String(item.name) : null);
    }
};

const sortCacheItems = (collection, items = []) => {
    const list = Array.isArray(items) ? [...items] : [];

    switch (collection) {
        case CACHE_KEYS.LOGS:
        case CACHE_KEYS.LINE_STOPS:
        case CACHE_KEYS.MEETINGS:
        case CACHE_KEYS.SCRAPS:
            return list.sort((a, b) => safeDateValue(b.sentAt || b.createdAt || b.date) - safeDateValue(a.sentAt || a.createdAt || a.date));
        case CACHE_KEYS.NOTICES:
            return list.sort((a, b) => safeDateValue(b.createdAt) - safeDateValue(a.createdAt));
        case CACHE_KEYS.USERS:
            return list.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
        case CACHE_KEYS.EMPLOYEES:
            return list.sort((a, b) => String(a?.fullName || '').localeCompare(String(b?.fullName || '')));
        case CACHE_KEYS.ROLES:
        case CACHE_KEYS.LINES:
        case CACHE_KEYS.MODELS:
        case CACHE_KEYS.STATIONS:
            return list.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
        default:
            return list;
    }
};

const syncRamCollection = (collection, items = []) => {
    const sortedList = sortCacheItems(collection, items);
    const byId = new Map();

    sortedList.forEach((item) => {
        const id = resolveCacheId(collection, item);
        if (id !== null && id !== undefined) {
            byId.set(String(id), item);
        }
    });

    GLOBAL_RAM_CACHE.set(collection, {
        list: sortedList,
        byId,
        updatedAt: Date.now()
    });

    if (collection === CACHE_KEYS.SCRAPS) {
        SCRAP_CACHE = sortedList;
    }

    return sortedList;
};

const getRamCollection = (collection) => {
    return GLOBAL_RAM_CACHE.get(collection)?.list || [];
};

const getRamItem = (collection, id) => {
    return GLOBAL_RAM_CACHE.get(collection)?.byId?.get(String(id)) || null;
};

const upsertRamItems = (collection, incoming = []) => {
    const items = Array.isArray(incoming) ? incoming : [incoming];
    const currentItems = getRamCollection(collection);
    const nextMap = new Map();

    currentItems.forEach((item) => {
        const id = resolveCacheId(collection, item);
        if (id !== null && id !== undefined) nextMap.set(String(id), item);
    });

    items.forEach((item) => {
        const id = resolveCacheId(collection, item);
        if (id !== null && id !== undefined) nextMap.set(String(id), item);
    });

    return syncRamCollection(collection, Array.from(nextMap.values()));
};

const removeRamItems = (collection, ids = []) => {
    const removeSet = new Set((Array.isArray(ids) ? ids : [ids]).map((id) => String(id)));
    const nextItems = getRamCollection(collection).filter((item) => {
        const itemId = resolveCacheId(collection, item);
        return itemId === null || !removeSet.has(String(itemId));
    });

    return syncRamCollection(collection, nextItems);
};

const formatSafeUser = (user) => ({
    matricula: user.matricula,
    name: user.name,
    role: user.role,
    shift: user.shift,
    email: user.email,
    isAdmin: !!user.isAdmin,
    status: user.status
});

const formatChecklistItemRecord = (item, type) => ({
    id: item.id.toString(),
    category: item.category,
    text: item.text,
    evidence: item.evidence,
    imageUrl: item.imageUrl,
    type
});

const formatLogRecord = (record, type) => {
    const parsedData = safeJsonParse(record.data || '{}', {});
    const parsedSnapshot = safeJsonParse(record.itemsSnapshot || '[]', []);

    return {
        id: record.id.toString(),
        userId: record.userId,
        userName: record.userName,
        userRole: record.userRole,
        line: record.line,
        date: record.date,
        itemsCount: record.itemsCount,
        ngCount: record.ngCount,
        observation: record.observation,
        data: parsedData.answers || parsedData,
        evidenceData: parsedData.evidence || {},
        type,
        maintenanceTarget: record.maintenanceTarget || parsedData.maintenanceTarget,
        itemsSnapshot: parsedSnapshot
    };
};

const formatLineStopRecord = (record) => ({
    ...record,
    id: record.id.toString(),
    type: 'LINE_STOP',
    data: safeJsonParse(record.data || '{}', {}),
    itemsCount: 0,
    ngCount: 0,
    observation: record.observation || ''
});

const formatMeetingRecord = (meeting) => ({
    ...meeting,
    participants: typeof meeting.participants === 'string'
        ? safeJsonParse(meeting.participants || '[]', [])
        : (meeting.participants || [])
});

const formatPermissionRecord = (permission) => ({
    role: permission.role,
    module: permission.module,
    tab: permission.tab || '',
    allowed: permission.allowed === 1 || permission.allowed === true
});

const CACHE_LOADERS = {
    [CACHE_KEYS.USERS]: async () => {
        const users = await prisma.user.findMany({
            select: {
                matricula: true,
                name: true,
                role: true,
                shift: true,
                email: true,
                isAdmin: true,
                status: true
            }
        });
        return users.map(formatSafeUser);
    },
    [CACHE_KEYS.LOGS]: async () => {
        const [liderLogs, maintLogs] = await Promise.all([
            prisma.log.findMany({ orderBy: { date: 'desc' } }),
            prisma.maintenanceLog.findMany({ orderBy: { date: 'desc' } })
        ]);

        return [
            ...liderLogs.map((log) => formatLogRecord(log, 'PRODUCTION')),
            ...maintLogs.map((log) => formatLogRecord(log, 'MAINTENANCE'))
        ].sort((a, b) => safeDateValue(b.date) - safeDateValue(a.date));
    },
    [CACHE_KEYS.CONFIG_ITEMS]: async () => {
        const [liderItems, maintItems] = await Promise.all([
            prisma.checklistItem.findMany(),
            prisma.maintenanceChecklistItem.findMany()
        ]);

        return [
            ...liderItems.map((item) => formatChecklistItemRecord(item, 'LEADER')),
            ...maintItems.map((item) => formatChecklistItemRecord(item, 'MAINTENANCE'))
        ];
    },
    [CACHE_KEYS.LINE_STOPS]: async () => {
        const stops = await prisma.lineStop.findMany({ orderBy: { date: 'desc' } });
        return stops.map(formatLineStopRecord);
    },
    [CACHE_KEYS.ROLES]: async () => {
        const roles = await prisma.configRole.findMany();
        return roles.map((role) => ({ id: role.name, name: role.name }));
    },
    [CACHE_KEYS.LINES]: async () => {
        const lines = await prisma.configLine.findMany();
        return lines.map((line) => ({ id: line.name, name: line.name }));
    },
    [CACHE_KEYS.MODELS]: async () => prisma.configModel.findMany(),
    [CACHE_KEYS.STATIONS]: async () => prisma.configStation.findMany(),
    [CACHE_KEYS.PERMISSIONS]: async () => {
        const perms = await prisma.configPermission.findMany();
        return perms.map(formatPermissionRecord);
    },
    [CACHE_KEYS.NOTICES]: async () => prisma.notice.findMany({
        where: { expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' }
    }),
    [CACHE_KEYS.MEETINGS]: async () => {
        const meetings = await prisma.meeting.findMany({ orderBy: { date: 'desc' } });
        return meetings.map(formatMeetingRecord);
    },
    [CACHE_KEYS.SCRAPS]: async () => prisma.scrapLog.findMany({
        orderBy: [{ date: 'desc' }, { time: 'desc' }]
    }),
    [CACHE_KEYS.MATERIALS]: async () => prisma.material.findMany({
        orderBy: { model: 'asc' }
    }),
    [CACHE_KEYS.EMPLOYEES]: async () => prisma.employee.findMany({
        select: {
            matricula: true,
            fullName: true,
            shift: true,
            role: true,
            sector: true,
            superiorId: true,
            idlSt: true,
            type: true,
            status: true,
            gloveSize: true,
            gloveType: true,
            gloveExchanges: true,
            attendanceLogs: true
        }
    }),
    [CACHE_KEYS.BOXES]: async () => prisma.scrapBox.findMany({
        include: { scraps: true },
        orderBy: { createdAt: 'desc' }
    }),
    [CACHE_KEYS.WORKSTATIONS]: async () => prisma.workstation.findMany({
        include: { productionModel: true }
    }),
    [CACHE_KEYS.PRODUCTION_MODELS]: async () => prisma.productionModel.findMany(),
    [CACHE_KEYS.LAYOUTS]: async () => prisma.layout.findMany({
        include: {
            employee: {
                select: {
                    matricula: true,
                    fullName: true,
                    role: true,
                    shift: true,
                    sector: true
                }
            }
        },
        orderBy: { ordemPosto: 'asc' }
    })
};

const refreshRamCollection = async (collection) => {
    const loader = CACHE_LOADERS[collection];
    if (!loader) return [];
    const items = await loader();
    return syncRamCollection(collection, items);
};

const ensureRamCollection = async (collection) => {
    if (GLOBAL_RAM_CACHE.has(collection)) {
        return getRamCollection(collection);
    }
    return refreshRamCollection(collection);
};

const warmRamCache = async () => {
    console.log('🔄 Carregando coleções para o cache global em RAM...');
    const cacheKeys = Object.values(CACHE_KEYS);
    const results = await Promise.allSettled(cacheKeys.map((cacheKey) => refreshRamCollection(cacheKey)));
    const loaded = results.filter((result) => result.status === 'fulfilled').length;
    console.log(`✅ RAM Cache aquecido: ${loaded}/${cacheKeys.length} coleções prontas.`);
    return GLOBAL_RAM_CACHE;
};

const loadScrapCache = async () => {
    console.log('🔄 Recarregando cache de scraps na RAM...');
    try {
        const scraps = await refreshRamCollection(CACHE_KEYS.SCRAPS);
        console.log(`✅ Cache de scraps carregado: ${scraps.length} registros.`);
        return scraps;
    } catch (e) {
        console.error('❌ Erro ao carregar cache de scraps:', e);
        SCRAP_CACHE = [];
        return SCRAP_CACHE;
    }
};

const PORT = 3000;
const SALT_ROUNDS = 10;
const apiCompression = compression({
    threshold: 0,
    filter: (req, res) => {
        if (req.path === '/sync-stream') return false;
        return compression.filter(req, res);
    }
});

// Middleware
app.use('/api', apiCompression); // Garante compressão mesmo para payloads JSON pequenos nas rotas de API.
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

const sseHeartbeat = setInterval(() => {
    SSE_CLIENTS.forEach((client) => {
        try {
            client.write(': ping\n\n');
        } catch (error) {
            SSE_CLIENTS.delete(client);
        }
    });
}, 25000);
if (typeof sseHeartbeat.unref === 'function') {
    sseHeartbeat.unref();
}

app.get('/api/sync-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
    }

    SSE_CLIENTS.add(res);
    res.write('retry: 3000\n\n');
    sendSseMessage(res, { collection: 'server', action: 'connected', timestamp: Date.now() });

    req.on('close', () => {
        SSE_CLIENTS.delete(res);
        res.end();
    });
});

// --- ROTAS DE USUÁRIOS ---

app.post('/api/login', async (req, res) => {
    const { matricula, password } = req.body;
    try {
        const user = await prisma.user.findUnique({
            where: { matricula: String(matricula) }
        });

        if (!user) return res.status(401).json({ error: "Usuário não encontrado" });

        // Trava de segurança: bloqueia login de colaboradores desligados
        if (user.status === 'INATIVO') {
            return res.status(403).json({ error: "Acesso bloqueado: Colaborador desligado" });
        }

        // Double-check via tabela Employee
        const employee = await prisma.employee.findUnique({
            where: { matricula: String(matricula) },
            select: { status: true }
        });
        if (employee && employee.status === 'INATIVO') {
            return res.status(403).json({ error: "Acesso bloqueado: Colaborador desligado" });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: "Senha incorreta" });

        const userResponse = { ...user, isAdmin: !!user.isAdmin };
        delete userResponse.password; // Remove password from response

        res.json({ user: userResponse });
    } catch (e) {
        console.error("Login Error:", e);
        res.status(500).json({ error: e.message });
    }
});


app.post('/api/register', async (req, res) => {
    const { matricula, name, role, shift, email, password } = req.body;
    try {
        const existing = await prisma.user.findUnique({ where: { matricula: String(matricula) } });
        if (existing) return res.status(400).json({ error: "Erro: Matrícula já cadastrada no sistema (Ativa ou Inativa)." });

        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        const createdUser = await prisma.user.create({
            data: {
                matricula: String(matricula),
                name,
                role,
                shift,
                email,
                password: hash,
                isAdmin: false
            },
            select: {
                matricula: true,
                name: true,
                role: true,
                shift: true,
                email: true,
                isAdmin: true,
                status: true
            }
        });

        const safeUser = formatSafeUser(createdUser);
        upsertRamItems(CACHE_KEYS.USERS, [safeUser]);
        broadcastSyncDelta(CACHE_KEYS.USERS, 'upsert', { items: [safeUser] });

        res.json({ message: "Criado" });
    } catch (e) {
        console.error("Register Error:", e);
        res.status(400).json({ error: "Erro cadastro (matricula já existe?)" });
    }
});

app.post('/api/recover', async (req, res) => {
    const { matricula, name, role } = req.body;
    try {
        const user = await prisma.user.findUnique({
            where: { matricula: String(matricula) }
        });

        if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

        await prisma.recoveryRequest.create({
            data: {
                matricula: String(matricula),
                name,
                role,
                status: 'PENDING'
            }
        });

        res.json({ message: "Solicitação enviada ao Administrador. Aguarde o contato." });
    } catch (e) {
        console.error("Recover Request Error:", e);
        res.status(500).json({ error: "Erro ao enviar solicitação" });
    }
});

app.put('/api/users', async (req, res) => {
    const { matricula, name, role, shift, email, password, isAdmin, originalMatricula } = req.body;
    const target = originalMatricula || matricula;

    try {
        const data = {
            matricula,
            name,
            role,
            shift,
            email,
            isAdmin: !!isAdmin
        };

        if (password && password !== '******') {
            data.password = await bcrypt.hash(password, SALT_ROUNDS);
        }

        const updatedUser = await prisma.user.update({
            where: { matricula: String(target) },
            data,
            select: {
                matricula: true,
                name: true,
                role: true,
                shift: true,
                email: true,
                isAdmin: true,
                status: true
            }
        });

        const safeUser = formatSafeUser(updatedUser);
        upsertRamItems(CACHE_KEYS.USERS, [safeUser]);
        broadcastSyncDelta(CACHE_KEYS.USERS, 'upsert', { items: [safeUser] });

        res.json({ message: "Atualizado" });
    } catch (e) {
        console.error("Update User Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const safeUsers = await ensureRamCollection(CACHE_KEYS.USERS);
        res.json(safeUsers);
    } catch (e) {
        res.status(500).json({ error: "Erro interno ao listar usuários" });
    }
});

app.get('/api/users/matricula/:matricula', async (req, res) => {
    try {
        await ensureRamCollection(CACHE_KEYS.USERS);
        const safeUser = getRamItem(CACHE_KEYS.USERS, req.params.matricula);
        if (!safeUser) return res.status(404).json({ error: "Usuário não encontrado." });

        res.json(safeUser);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await prisma.user.delete({
            where: { matricula: req.params.id }
        });
        removeRamItems(CACHE_KEYS.USERS, req.params.id);
        broadcastSyncDelta(CACHE_KEYS.USERS, 'remove', { ids: [String(req.params.id)] });
        res.json({ message: "Deletado" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ADMIN RECOVERY ROUTES
app.get('/api/admin/recovery-requests', async (req, res) => {
    try {
        const requests = await prisma.recoveryRequest.findMany({
            where: { status: 'PENDING' },
            orderBy: { createdAt: 'desc' }
        });
        res.json(requests);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/reset-password', async (req, res) => {
    const { requestId, matricula, newPassword } = req.body;
    try {
        const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);

        // Transaction to update user password and close request
        await prisma.$transaction([
            prisma.user.update({
                where: { matricula: String(matricula) },
                data: { password: hash }
            }),
            prisma.recoveryRequest.update({
                where: { id: requestId },
                data: { status: 'COMPLETED' }
            })
        ]);

        res.json({ message: "Senha redefinida com sucesso" });
    } catch (e) {
        console.error("Admin Reset Error:", e);
        res.status(500).json({ error: "Erro ao redefinir senha" });
    }
});

// --- LOGS & CHECKLISTS ---

app.get('/api/logs', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
        const allLogs = await ensureRamCollection(CACHE_KEYS.LOGS);
        res.json(allLogs.slice(0, limit));
    } catch (e) {
        console.error("Get Logs Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/logs', async (req, res) => {
    const { userId, userName, userRole, line, date, itemsCount, ngCount, observation, data, evidenceData, type, maintenanceTarget, itemsSnapshot } = req.body;

    const storageObject = { answers: data, evidence: evidenceData, type: type || 'PRODUCTION', maintenanceTarget };
    const dataStr = JSON.stringify(storageObject);
    const snapshotStr = itemsSnapshot ? JSON.stringify(itemsSnapshot) : '[]';

    try {
        let createdRecord;

        if (type === 'MAINTENANCE') {
            createdRecord = await prisma.maintenanceLog.create({
                data: {
                    userId, userName, userRole, line, date,
                    itemsCount, ngCount, observation,
                    data: dataStr,
                    maintenanceTarget,
                    itemsSnapshot: snapshotStr
                }
            });
        } else {
            createdRecord = await prisma.log.create({
                data: {
                    userId, userName, userRole, line, date,
                    itemsCount, ngCount, observation,
                    data: dataStr,
                    itemsSnapshot: snapshotStr
                }
            });
        }

        const formattedLog = formatLogRecord(createdRecord, type === 'MAINTENANCE' ? 'MAINTENANCE' : 'PRODUCTION');
        upsertRamItems(CACHE_KEYS.LOGS, [formattedLog]);
        broadcastSyncDelta(CACHE_KEYS.LOGS, 'upsert', { items: [formattedLog] });

        res.json({ message: "Salvo" });
    } catch (e) {
        console.error("Save Log Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- ITEMS DE CONFIGURAÇÃO DO CHECKLIST ---

app.get('/api/config/items', async (req, res) => {
    try {
        const items = await ensureRamCollection(CACHE_KEYS.CONFIG_ITEMS);
        res.json(items);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/config/items', async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: "Invalid items format" });

    try {
        await prisma.$transaction(async (tx) => {
            // Delete all existing items
            await tx.checklistItem.deleteMany();
            await tx.maintenanceChecklistItem.deleteMany();

            // Insert new items
            for (const i of items) {
                const itemData = {
                    category: i.category,
                    text: i.text,
                    evidence: i.evidence || '',
                    imageUrl: i.imageUrl || ''
                };

                if (i.type === 'MAINTENANCE') {
                    await tx.maintenanceChecklistItem.create({ data: itemData });
                } else {
                    await tx.checklistItem.create({ data: itemData });
                }
            }
        });

        const cachedItems = await refreshRamCollection(CACHE_KEYS.CONFIG_ITEMS);
        broadcastSyncDelta(CACHE_KEYS.CONFIG_ITEMS, 'replace', { items: cachedItems });
        res.json({ message: "Salvo" });
    } catch (e) {
        console.error("Save Config Items Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- PARADA DE LINHA (LINE STOPS) ---

app.get('/api/line-stops', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
        const stops = await ensureRamCollection(CACHE_KEYS.LINE_STOPS);
        res.json(stops.slice(0, limit));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/line-stops', async (req, res) => {
    const { id, userId, userName, userRole, line, date, status, data, signedDocUrl } = req.body;
    const dataStr = typeof data === 'object' ? JSON.stringify(data) : data;
    const finalStatus = status || 'WAITING_JUSTIFICATION';

    try {
        // Since sqlite doesn't support easy 'upsert' with non-unique non-id fields easily if ID is auto-increment but passed manually...
        // Actually ID in LineStop is auto-increment Int.
        // Frontend sends string ID sometimes (timestamp). 
        // Need to check schema. ID is Int @default(autoincrement()).
        // If frontend sends 'id' and it expects to update, we need to handle that.
        // If frontend sends 'id' as a timestamp string, this will fail on Int column.

        // CHECK MIGRATION: The legacy code created table with 'id INTEGER PRIMARY KEY AUTOINCREMENT'.
        // But the legacy POST route logic was: `const newId = id || Date.now().toString();` and inserted it.
        // SQLite allows inserting integers into PK manually.
        // The issue is types. If 'id' from body is string date '1738...', it fits in BigInt/Int potentially but Prisma maps Int to JS number.
        // Let's assume ID is number.

        // ID is now String (UUID) handled by Prisma @default(uuid()) or passed as string
        // If updating, 'id' is passed.

        if (id) {
            const existing = await prisma.lineStop.findUnique({ where: { id: String(id) } });
            if (existing) {
                const updatedStop = await prisma.lineStop.update({
                    where: { id: String(id) },
                    data: {
                        line,
                        status: finalStatus,
                        data: dataStr,
                        signedDocUrl: signedDocUrl || null
                    }
                });

                const formattedStop = formatLineStopRecord(updatedStop);
                upsertRamItems(CACHE_KEYS.LINE_STOPS, [formattedStop]);
                broadcastSyncDelta(CACHE_KEYS.LINE_STOPS, 'upsert', { items: [formattedStop] });
                return res.json({ message: "Salvo com sucesso" });
            }
        }

        // Create new
        const createdStop = await prisma.lineStop.create({
            data: {
                // Let autoincrement handle ID unless we need to force it.
                // Legacy code forced ID. For Prisma, better to let DB handle it.
                userId, userName, userRole, line, date,
                shift: req.body.shift, // Salva o turno
                status: finalStatus,
                data: dataStr,
                signedDocUrl: signedDocUrl || null
            }
        });

        const formattedStop = formatLineStopRecord(createdStop);
        upsertRamItems(CACHE_KEYS.LINE_STOPS, [formattedStop]);
        broadcastSyncDelta(CACHE_KEYS.LINE_STOPS, 'upsert', { items: [formattedStop] });

        res.json({ message: "Salvo com sucesso" });
    } catch (e) {
        console.error("Save Stop Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- CONFIGS (Roles, Lines, etc) ---

// Roles
app.get('/api/config/roles', async (req, res) => {
    try {
        const roles = await ensureRamCollection(CACHE_KEYS.ROLES);
        res.json(roles);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/config/roles', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Nome obrigatório" });
    try {
        await prisma.configRole.create({ data: { name } });
        const roleItem = { id: name, name };
        upsertRamItems(CACHE_KEYS.ROLES, [roleItem]);
        broadcastSyncDelta(CACHE_KEYS.ROLES, 'upsert', { items: [roleItem] });
        res.json({ message: "Cargo salvo" });
    } catch (e) {
        // Unique constraint violation?
        res.json({ message: "Cargo salvo/já existe" });
    }
});

app.delete('/api/config/roles/:id', async (req, res) => {
    try {
        // ID passed is actually the name
        await prisma.configRole.delete({
            where: { name: req.params.id }
        });
        removeRamItems(CACHE_KEYS.ROLES, req.params.id);
        broadcastSyncDelta(CACHE_KEYS.ROLES, 'remove', { ids: [String(req.params.id)] });
        res.json({ message: "Cargo deletado" });
    } catch (e) {
        res.status(500).json({ error: "Erro ao deletar: " + e.message });
    }
});

// Lines
app.get('/api/config/lines', async (req, res) => {
    try {
        const lines = await ensureRamCollection(CACHE_KEYS.LINES);
        res.json(lines);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config/lines', async (req, res) => {
    const { name } = req.body;
    try {
        await prisma.configLine.create({ data: { name } });
        const lineItem = { id: name, name };
        upsertRamItems(CACHE_KEYS.LINES, [lineItem]);
        broadcastSyncDelta(CACHE_KEYS.LINES, 'upsert', { items: [lineItem] });
        res.json({ message: "Linha salva" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/config/lines/:id', async (req, res) => {
    try {
        await prisma.configLine.delete({
            where: { name: req.params.id }
        });
        removeRamItems(CACHE_KEYS.LINES, req.params.id);
        broadcastSyncDelta(CACHE_KEYS.LINES, 'remove', { ids: [String(req.params.id)] });
        res.json({ message: "Linha deletada" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Generic Configs (Models, Stations)
const createConfigRoutes = (modelDelegate, pathName) => {
    app.get(`/api/config/${pathName}`, async (req, res) => {
        try {
            const items = await modelDelegate.findMany();
            res.json(items);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post(`/api/config/${pathName}`, async (req, res) => {
        const { items } = req.body;
        try {
            await prisma.$transaction(async (tx) => {
                // This helper logic is tricky with delegates.
                // We'll just use manual code since we can't easily pass delegate model generic in JS
                // Actually we can pass 'prisma.configModel'
                // But replace 'tx' usage
                // Let's just hardcode the logic inside the route handler closure

                // Get the correct delegate from transaction client 'tx'
                const delegate = tx[modelDelegate]; // modelDelegate should be string name like 'configModel'

                await delegate.deleteMany();
                for (const item of items) {
                    await delegate.create({ data: { name: item } });
                }
            });
            res.json({ message: "Salvo" });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
};

// We need to define routes manually to use the string key for model
app.get('/api/config/models', async (req, res) => {
    const models = await ensureRamCollection(CACHE_KEYS.MODELS);
    res.json(models);
});
// POST: salva lista completa e calcula unifiedCode automaticamente
app.post('/api/config/models', async (req, res) => {
    try {
        await prisma.$transaction(async tx => {
            await tx.configModel.deleteMany();
            for (const i of req.body.items) {
                const name = typeof i === 'string' ? i : i.name;
                const sku = typeof i === 'object' ? i.sku : undefined;
                const unifiedCode = (typeof i === 'object' && i.unifiedCode)
                    ? i.unifiedCode
                    : (name || '').substring(0, 7);
                await tx.configModel.create({ data: { name, sku, unifiedCode } });
            }
        });
        const models = await refreshRamCollection(CACHE_KEYS.MODELS);
        broadcastSyncDelta(CACHE_KEYS.MODELS, 'replace', { items: models });
        res.json({ message: "Salvo" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET: retorna modelos agrupados — um por unifiedCode distinto (para selects de Layout)
app.get('/api/config/models/unified', async (req, res) => {
    try {
        const all = await ensureRamCollection(CACHE_KEYS.MODELS);
        const seen = new Set();
        const unified = [];
        for (const m of all) {
            const code = m.unifiedCode || (m.name || '').substring(0, 7);
            if (!seen.has(code)) {
                seen.add(code);
                unified.push({ name: code, sku: m.sku, unifiedCode: code });
            }
        }
        res.json(unified);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/config/stations', async (req, res) => {
    const stations = await ensureRamCollection(CACHE_KEYS.STATIONS);
    res.json(stations);
});
app.post('/api/config/stations', async (req, res) => {
    try {
        await prisma.$transaction(async tx => {
            await tx.configStation.deleteMany();
            for (const i of req.body.items) await tx.configStation.create({ data: { name: i } });
        });
        const stations = await refreshRamCollection(CACHE_KEYS.STATIONS);
        broadcastSyncDelta(CACHE_KEYS.STATIONS, 'replace', { items: stations });
        res.json({ message: "Salvo" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


app.get('/api/config/permissions', async (req, res) => {
    try {
        const perms = await ensureRamCollection(CACHE_KEYS.PERMISSIONS);
        res.json(perms);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config/permissions', async (req, res) => {
    const { permissions } = req.body;
    try {
        await prisma.$transaction(async tx => {
            await tx.configPermission.deleteMany();
            for (const p of permissions) {
                await tx.configPermission.create({
                    data: {
                        role: p.role,
                        module: p.module,
                        tab: p.tab || '',
                        allowed: p.allowed ? 1 : 0
                    }
                });
            }
        });
        const perms = await refreshRamCollection(CACHE_KEYS.PERMISSIONS);
        broadcastSyncDelta(CACHE_KEYS.PERMISSIONS, 'replace', { items: perms });
        res.json({ message: "Salvo" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- NOTICES ---

app.post('/api/notices', async (req, res) => {
    const { message, targetRoles, durationDays, createdBy } = req.body;

    if (!message || !Array.isArray(targetRoles) || targetRoles.length === 0 || !durationDays || !createdBy) {
        return res.status(400).json({ error: 'Dados inválidos para criar comunicado.' });
    }

    try {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + Number(durationDays));

        const notice = await prisma.notice.create({
            data: {
                message,
                targetRoles: JSON.stringify(targetRoles),
                expiresAt,
                createdBy
            }
        });

        upsertRamItems(CACHE_KEYS.NOTICES, [notice]);
        broadcastSyncDelta(CACHE_KEYS.NOTICES, 'upsert', { items: [notice] });

        res.json(notice);
    } catch (e) {
        console.error('Create Notice Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/notices', async (req, res) => {
    try {
        const notices = await ensureRamCollection(CACHE_KEYS.NOTICES);
        res.json(notices);
    } catch (e) {
        console.error('Get Notices Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/notices/:id', async (req, res) => {
    try {
        await prisma.notice.delete({
            where: { id: parseInt(req.params.id) }
        });

        removeRamItems(CACHE_KEYS.NOTICES, req.params.id);
        broadcastSyncDelta(CACHE_KEYS.NOTICES, 'remove', { ids: [String(req.params.id)] });

        res.json({ message: 'Comunicado excluido.' });
    } catch (e) {
        console.error('Delete Notice Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- MEETINGS ---

app.get('/api/meetings', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
        const offset = Math.max(parseInt(req.query.skip, 10) || 0, 0);
        const meetings = await ensureRamCollection(CACHE_KEYS.MEETINGS);
        res.json(meetings.slice(offset, offset + limit));
    } catch (error) {
        console.error("❌ ERRO CRÍTICO EM MEETINGS:", error);
        res.status(500).json({ error: "Erro interno ao buscar reuniões." });
    }
});

app.post('/api/meetings', async (req, res) => {
    const { id, title, date, startTime, endTime, photoUrl, participants, topics, createdBy } = req.body;
    try {
        const createdMeeting = await prisma.meeting.create({
            data: {
                id,
                title: title || '',
                date,
                startTime,
                endTime,
                photoUrl,
                participants: JSON.stringify(participants),
                topics,
                createdBy
            }
        });

        const formattedMeeting = formatMeetingRecord(createdMeeting);
        upsertRamItems(CACHE_KEYS.MEETINGS, [formattedMeeting]);
        broadcastSyncDelta(CACHE_KEYS.MEETINGS, 'upsert', { items: [formattedMeeting] });

        res.json({ message: "Ata Salva" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- PREPARATION LOG ---

app.get('/api/preparation-logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 500;
        const offset = parseInt(req.query.skip) || 0;

        const logs = await prisma.preparationLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset
        });
        res.json(logs);
    } catch (e) {
        console.error("Get Preparation Logs Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/preparation-logs', async (req, res) => {
    try {
        const { id, current, rfCal, ...data } = req.body;

        const parseIntOrNull = (val) => (val === "" || val === null || val === undefined) ? null : parseInt(val);
        const parseFloatOrNull = (val) => (val === "" || val === null || val === undefined) ? null : parseFloat(val);

        // Map and parse
        const cleanData = {};
        const intFields = ['plate', 'rear', 'btFt', 'pba', 'input', 'preKey', 'lcia', 'audio', 'radiation', 'imei', 'vct', 'revision', 'desmonte', 'oven', 'repair'];

        // Loop over remaining fields
        for (const key in data) {
            if (intFields.includes(key)) {
                cleanData[key] = parseIntOrNull(data[key]);
            } else if (key === 'currentRfCal') {
                cleanData[key] = parseFloatOrNull(data[key]);
            } else if (key === 'observation' || key === 'model' || key === 'line' || key === 'date' || key === 'shift' || key === 'responsible' || key === 'sku') {
                // Keep as is (string) but sanitize empty if nullable? Sku/observation are nullable.
                if (key === 'sku' || key === 'observation') {
                    cleanData[key] = (data[key] === "") ? null : data[key];
                } else {
                    cleanData[key] = data[key];
                }
            }
        }

        // Handle legacy current/rfCal mapping if needed (or just use correct field)
        if (cleanData.currentRfCal === undefined || cleanData.currentRfCal === null) {
            // Look for 'current' or 'rfCal' in original body just in case
            if (current) cleanData.currentRfCal = parseFloatOrNull(current);
            else if (rfCal) cleanData.currentRfCal = parseFloatOrNull(rfCal);
        }

        await prisma.preparationLog.create({
            data: {
                ...cleanData,
                date: data.date,
                shift: data.shift,
                line: data.line,
                model: data.model,
                sku: data.sku || null, // Ensure sku is passed
                responsible: data.responsible,
                createdAt: new Date()
            }
        });
        res.json({ message: "Salvo" });
    } catch (e) {
        console.error("Save Preparation Log Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- SCRAP BOXES ---
app.get('/api/boxes', async (req, res) => {
    try {
        const boxes = await ensureRamCollection(CACHE_KEYS.BOXES);
        res.json(boxes);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/boxes', async (req, res) => {
    try {
        const { type, plant } = req.body;
        const newBox = await prisma.scrapBox.create({
            data: { type, plant, status: 'OPEN' },
            include: { scraps: true }
        });
        upsertRamItems(CACHE_KEYS.BOXES, [newBox]);
        broadcastSyncDelta(CACHE_KEYS.BOXES, 'upsert', { items: [newBox] });
        res.json(newBox);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/boxes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, nfNumber, userId } = req.body;
        const dataToUpdate = {};
        if (status !== undefined) {
            dataToUpdate.status = status;
            if (status !== 'OPEN') {
                dataToUpdate.closedAt = new Date();
            } else {
                dataToUpdate.closedAt = null;
            }
        }
        if (nfNumber !== undefined) dataToUpdate.nfNumber = nfNumber;

        const updatedBox = await prisma.scrapBox.update({
            where: { id: parseInt(id) },
            data: dataToUpdate,
            include: { scraps: true }
        });

        if (nfNumber !== undefined) {
            const sentAt = new Date();
            await prisma.scrapLog.updateMany({
                where: { boxId: parseInt(id) },
                data: { nfNumber, situation: 'SENT', sentAt, sentBy: userId }
            });
            await refreshRamCollection(CACHE_KEYS.SCRAPS);
            const changedScraps = getRamCollection(CACHE_KEYS.SCRAPS).filter((scrap) => scrap.boxId === parseInt(id));
            if (changedScraps.length > 0) {
                broadcastSyncDelta(CACHE_KEYS.SCRAPS, 'upsert', { items: changedScraps });
            }
        }

        await refreshRamCollection(CACHE_KEYS.BOXES);
        const cachedBox = getRamItem(CACHE_KEYS.BOXES, updatedBox.id);
        broadcastSyncDelta(CACHE_KEYS.BOXES, 'upsert', { items: [cachedBox || updatedBox] });

        res.json(updatedBox);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/boxes/:id/scraps', async (req, res) => {
    try {
        const { id } = req.params;
        const { qrCode } = req.body;

        if (!qrCode) return res.status(400).json({ error: "QR Code obrigatório" });

        // Encontra a caixa para checar o tipo
        const box = await prisma.scrapBox.findUnique({ where: { id: parseInt(id) } });
        if (!box) return res.status(404).json({ error: "Caixa não encontrada." });
        if (box.status !== 'OPEN') return res.status(400).json({ error: "Caixa não está aberta." });

        // Encontra o scrap para vincular
        const scrap = await prisma.scrapLog.findFirst({
            where: { qrCode: String(qrCode), boxId: null }
        });

        if (!scrap) return res.status(404).json({ error: "Scrap não encontrado com este QR Code ou já vinculado a uma caixa." });

        // ---- VALIDAÇÃO DE CATEGORIA ----
        const itemUp = (scrap.item || '').toUpperCase();
        const boxType = (box.type || '').toUpperCase();
        let categoryMatch = false;
        if (boxType === 'REAR') {
            categoryMatch = itemUp.includes('REAR');
        } else if (boxType === 'FRONT/OCTA' || boxType === 'FRONT' || boxType === 'OCTA') {
            categoryMatch = itemUp.includes('FRONT') || itemUp.includes('OCTA');
        } else if (boxType === 'BATERIA') {
            categoryMatch = itemUp.includes('BATERIA') || itemUp.includes('BATTERY');
        } else if (boxType === 'PLACA') {
            categoryMatch = itemUp.includes('PLACA');
        } else if (boxType.includes('MIUDEZA')) {
            // Miudezas aceita tudo que não é REAR, FRONT, OCTA, BATERIA, nem PLACA
            const isMainCategory = itemUp.includes('REAR') || itemUp.includes('FRONT') || itemUp.includes('OCTA') || itemUp.includes('BATERIA') || itemUp.includes('PLACA');
            categoryMatch = !isMainCategory;
        } else {
            categoryMatch = true; // tipo desconhecido: aceita qualquer item
        }

        if (!categoryMatch) {
            return res.status(400).json({
                error: `Item '${scrap.item}' não pertence à categoria '${box.type}'. Verifique a caixa correta.`
            });
        }
        
        if (box.plant && scrap.plant !== box.plant) {
            return res.status(400).json({
                error: `A planta do item (${scrap.plant || 'Não definida'}) não corresponde à planta da caixa (${box.plant}).`
            });
        }
        // ---- FIM VALIDAÇÃO ----

        const updatedScrap = await prisma.scrapLog.update({
            where: { id: scrap.id },
            data: { boxId: parseInt(id) }
        });

        upsertRamItems(CACHE_KEYS.SCRAPS, [updatedScrap]);
        await refreshRamCollection(CACHE_KEYS.BOXES);
        broadcastSyncDelta(CACHE_KEYS.SCRAPS, 'upsert', { items: [updatedScrap] });

        res.json({ message: "Scrap vinculado com sucesso", scrap: updatedScrap });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/boxes/:boxId/scraps/:scrapId', async (req, res) => {
    try {
        const { boxId, scrapId } = req.params;

        const scrap = await prisma.scrapLog.findUnique({ where: { id: parseInt(scrapId) } });
        if (!scrap) return res.status(404).json({ error: "Scrap não encontrado." });
        if (scrap.boxId !== parseInt(boxId)) return res.status(400).json({ error: "Scrap não pertence a esta caixa." });

        const updated = await prisma.scrapLog.update({
            where: { id: parseInt(scrapId) },
            data: { boxId: null }
        });

        upsertRamItems(CACHE_KEYS.SCRAPS, [updated]);
        await refreshRamCollection(CACHE_KEYS.BOXES);
        broadcastSyncDelta(CACHE_KEYS.SCRAPS, 'upsert', { items: [updated] });

        res.json({ message: "Scrap desvinculado com sucesso.", scrap: updated });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// --- SCRAP ---

app.get('/api/scraps', async (req, res) => {
    try {
        const scraps = await ensureRamCollection(CACHE_KEYS.SCRAPS);
        res.json(scraps);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/scraps/check-duplicate', async (req, res) => {
    try {
        const { qrCode, code, qty, date } = req.body;

        if (!qrCode) return res.status(400).json({ isDuplicate: false });

        // Query precisa: busca exato QR Code OU combinação material+quantidade+data
        const existing = await prisma.scrapLog.findFirst({
            where: {
                OR: [
                    { qrCode: String(qrCode) },
                    {
                        AND: [
                            { code: code ? String(code) : undefined },
                            { qty: qty ? Number(qty) : undefined },
                            { date: date ? String(date) : undefined }
                        ].filter(c => Object.values(c).some(v => v !== undefined))
                    }
                ]
            }
        });

        res.status(existing ? 409 : 200).json({ isDuplicate: !!existing });
    } catch (e) {
        console.error("Check Duplicate Error:", e);
        res.status(500).json({ error: e.message, isDuplicate: false });
    }
});

app.post('/api/scraps', async (req, res) => {
    try {
        const { id, ...rest } = req.body; // Remove ID to let DB autoincrement

        // ---- VALIDAÇÃO QR CODE ÚNICO ----
        if (rest.qrCode) {
            const existing = await prisma.scrapLog.findFirst({ where: { qrCode: String(rest.qrCode) } });
            if (existing) return res.status(409).json({ error: "Esta etiqueta já está atrelada a outro scrap." });
        }
        // ---- FIM VALIDAÇÃO ----

        // Logic: Find Plant from Material
        // Logic: Find Plant from Material (Always prioritize DB)
        let plantToSave = 'ND';
        if (rest.code) {
            const material = await prisma.material.findUnique({ where: { code: String(rest.code) } });
            if (material && material.plant) {
                plantToSave = material.plant;
            } else if (rest.plant) {
                plantToSave = rest.plant; // Fallback to provided plant if validation fails or code not found
            }
        } else if (rest.plant) {
            plantToSave = rest.plant;
        }

        const unitValue = normalizeMoney(rest.unitValue);
        const totalValue = normalizeMoney(rest.totalValue);

        const newScrap = await prisma.scrapLog.create({
            data: {
                userId: rest.userId,
                date: rest.date,
                time: rest.time,
                week: Number(rest.week) || null,
                shift: rest.shift ? String(rest.shift) : null,
                leaderName: rest.leaderName,
                pqc: rest.pqc,
                model: rest.model,
                qty: Number(rest.qty) || 0,
                item: rest.item,
                status: rest.status,
                code: rest.code,
                description: rest.description,
                unitValue,
                totalValue,
                usedModel: rest.usedModel,
                responsible: rest.responsible,
                station: rest.station,
                reason: rest.reason,
                rootCause: rest.rootCause,
                countermeasure: rest.countermeasure || null,
                immediateAction: rest.immediateAction || null,
                line: rest.line,
                plant: plantToSave,
                qrCode: rest.qrCode || null,
                situation: 'PENDING'
            }
        });

        upsertRamItems(CACHE_KEYS.SCRAPS, [newScrap]);
        broadcastSyncDelta(CACHE_KEYS.SCRAPS, 'upsert', { items: [newScrap] });

        res.json({ message: "Scrap salvo" });
    } catch (e) {
        console.error("Scrap Create Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- SCRAP BATCH CREATE (multi-scan) ---
app.post('/api/scraps/batch-create', async (req, res) => {
    const { scraps } = req.body;

    if (!Array.isArray(scraps) || scraps.length === 0) {
        return res.status(400).json({ error: "Array de scraps vazio." });
    }

    try {
        // Validate all QR codes are unique in DB
        for (const s of scraps) {
            if (s.qrCode) {
                const existing = await prisma.scrapLog.findFirst({ where: { qrCode: String(s.qrCode) } });
                if (existing) {
                    return res.status(400).json({ error: `A etiqueta ${s.qrCode} já está atrelada a outro scrap.` });
                }
            }
        }

        const created = [];
        await prisma.$transaction(async (tx) => {
            for (const s of scraps) {
                let plantToSave = 'ND';
                if (s.code) {
                    const material = await tx.material.findUnique({ where: { code: String(s.code) } });
                    if (material && material.plant) {
                        plantToSave = material.plant;
                    } else if (s.plant) {
                        plantToSave = s.plant;
                    }
                } else if (s.plant) {
                    plantToSave = s.plant;
                }

                const newScrap = await tx.scrapLog.create({
                    data: {
                        userId: s.userId,
                        date: s.date,
                        time: s.time,
                        week: Number(s.week) || null,
                        shift: s.shift ? String(s.shift) : null,
                        leaderName: s.leaderName,
                        pqc: s.pqc,
                        model: s.model,
                        qty: 1, // Forçar qty=1 por registro individual no lote
                        item: s.item,
                        status: s.status,
                        code: s.code,
                        description: s.description,
                        unitValue: normalizeMoney(s.unitValue),
                        totalValue: normalizeMoney(s.unitValue), // qty=1, logo totalValue = unitValue
                        usedModel: s.usedModel,
                        responsible: s.responsible,
                        station: s.station,
                        reason: s.reason,
                        rootCause: s.rootCause,
                        countermeasure: s.countermeasure || null,
                        immediateAction: s.immediateAction || null,
                        line: s.line,
                        plant: plantToSave,
                        qrCode: s.qrCode || null,
                        situation: 'PENDING'
                    }
                });
                created.push(newScrap);
            }
        });

        upsertRamItems(CACHE_KEYS.SCRAPS, created);
        broadcastSyncDelta(CACHE_KEYS.SCRAPS, 'upsert', { items: created });

        res.json({ message: `${created.length} scraps salvos com sucesso.` });
    } catch (e) {
        console.error("Batch Scrap Create Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/scraps/:id', async (req, res) => {
    const { id } = req.params;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) return res.status(400).json({ error: "Invalid ID" });

    const updates = req.body;
    const dataToUpdate = {};

    // Fields mapping and type conversion
    if (updates.date !== undefined) dataToUpdate.date = updates.date;
    if (updates.time !== undefined) dataToUpdate.time = updates.time;
    if (updates.week !== undefined) dataToUpdate.week = Number(updates.week);
    if (updates.shift !== undefined) dataToUpdate.shift = String(updates.shift);
    if (updates.leaderName !== undefined) dataToUpdate.leaderName = updates.leaderName;
    if (updates.pqc !== undefined) dataToUpdate.pqc = updates.pqc;
    if (updates.model !== undefined) dataToUpdate.model = updates.model;
    if (updates.qty !== undefined) dataToUpdate.qty = Number(updates.qty);
    if (updates.item !== undefined) dataToUpdate.item = updates.item;
    if (updates.status !== undefined) dataToUpdate.status = updates.status;
    if (updates.code !== undefined) dataToUpdate.code = updates.code;
    if (updates.description !== undefined) dataToUpdate.description = updates.description;
    if (updates.unitValue !== undefined) dataToUpdate.unitValue = normalizeMoney(updates.unitValue);
    if (updates.totalValue !== undefined) dataToUpdate.totalValue = normalizeMoney(updates.totalValue);
    if (updates.usedModel !== undefined) dataToUpdate.usedModel = updates.usedModel;
    if (updates.responsible !== undefined) dataToUpdate.responsible = updates.responsible;
    if (updates.station !== undefined) dataToUpdate.station = updates.station;
    if (updates.reason !== undefined) dataToUpdate.reason = updates.reason;
    if (updates.rootCause !== undefined) dataToUpdate.rootCause = updates.rootCause;
    if (updates.countermeasure !== undefined) dataToUpdate.countermeasure = updates.countermeasure;
    if (updates.immediateAction !== undefined) dataToUpdate.immediateAction = updates.immediateAction;
    if (updates.line !== undefined) dataToUpdate.line = updates.line;
    if (updates.plant !== undefined) dataToUpdate.plant = updates.plant;
    if (updates.nfNumber !== undefined) dataToUpdate.nfNumber = updates.nfNumber;
    if (updates.sentBy !== undefined) dataToUpdate.sentBy = updates.sentBy;
    if (updates.sentAt !== undefined) dataToUpdate.sentAt = new Date(updates.sentAt);
    if (updates.qrCode !== undefined) dataToUpdate.qrCode = updates.qrCode;

    // Handle snake_case inputs if coming from raw JSON manually
    if (updates.leader_name !== undefined) dataToUpdate.leaderName = updates.leader_name;
    if (updates.total_value !== undefined) dataToUpdate.totalValue = normalizeMoney(updates.total_value);

    // If nothing to update, return early
    // EXCEPTION: If we are saving from Edit Modal, we might want to force update even if no fields changed, 
    // but usually fields change. However, for the 'tracking' requirement, we always update time/user if requested.

    // NEW RULE: Traceability & Edit Override
    // If userId is provided in updates, it means we are editing and want to override author.
    // Also update time to current server time.
    if (updates.userId) {
        dataToUpdate.userId = updates.userId;
        const now = new Date();
        // Server time HH:MM
        dataToUpdate.time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }

    if (Object.keys(dataToUpdate).length === 0) return res.json({ message: "Nada a atualizar" });

    try {
        const updatedScrap = await prisma.scrapLog.update({
            where: { id: numericId },
            data: dataToUpdate
        });

        upsertRamItems(CACHE_KEYS.SCRAPS, [updatedScrap]);
        broadcastSyncDelta(CACHE_KEYS.SCRAPS, 'upsert', { items: [updatedScrap] });

        res.json({ message: "Scrap atualizado" });
    } catch (e) {
        console.error("Update Scrap Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/scraps/:id', async (req, res) => {
    const { id } = req.params;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) return res.status(400).json({ error: "Invalid ID" });

    try {
        await prisma.scrapLog.delete({
            where: { id: numericId }
        });

        removeRamItems(CACHE_KEYS.SCRAPS, numericId);
        broadcastSyncDelta(CACHE_KEYS.SCRAPS, 'remove', { ids: [String(numericId)] });

        res.json({ message: "Scrap deletado" });
    } catch (e) {
        console.error("Delete Scrap Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- SCRAP BATCH PROCESS ---
app.post('/api/scraps/batch-process', async (req, res) => {
    const { scrapIds, nfNumber, userId, sentAt } = req.body;

    if (!Array.isArray(scrapIds) || scrapIds.length === 0) {
        return res.status(400).json({ error: "Nenhum ID fornecido." });
    }

    // Validate NF (Numeric, at least 1 digit)
    if (!nfNumber || !/^\d+$/.test(nfNumber)) {
        return res.status(400).json({ error: "Número da NF inválido. Apenas números são permitidos." });
    }

    try {
        const updateData = {
            nfNumber: nfNumber,
            sentBy: userId,
            sentAt: sentAt ? new Date(sentAt) : new Date(),
            situation: 'SENT'
        };

        const result = await prisma.scrapLog.updateMany({
            where: {
                id: { in: scrapIds }
            },
            data: updateData
        });

        await refreshRamCollection(CACHE_KEYS.SCRAPS);
        const changedScraps = getRamCollection(CACHE_KEYS.SCRAPS).filter((scrap) => scrapIds.includes(scrap.id));
        if (changedScraps.length > 0) {
            broadcastSyncDelta(CACHE_KEYS.SCRAPS, 'upsert', { items: changedScraps });
        }

        res.json({ message: `${result.count} registros atualizados com a NF ${nfNumber}` });
    } catch (e) {
        console.error("Batch Process Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- SCRAP MATERIALS ---

app.get('/api/materials', async (req, res) => {
    try {
        const materials = await ensureRamCollection(CACHE_KEYS.MATERIALS);
        res.json(materials);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/materials/bulk', async (req, res) => {
    const { materials } = req.body;
    if (!materials || !Array.isArray(materials)) {
        return res.status(400).json({ error: 'Array de materiais obrigatório' });
    }

    try {
        await prisma.$transaction(async (tx) => {
            // Upsert each material
            for (const m of materials) {
                await tx.material.upsert({
                    where: { code: String(m.code) },
                    update: {
                        model: m.model,
                        description: m.description,
                        item: m.item,
                        plant: m.plant,
                        price: normalizeMoney(m.price)
                    },
                    create: {
                        code: String(m.code),
                        model: m.model,
                        description: m.description,
                        item: m.item,
                        plant: m.plant,
                        price: normalizeMoney(m.price)
                    }
                });
            }
        });
        const cachedMaterials = await refreshRamCollection(CACHE_KEYS.MATERIALS);
        broadcastSyncDelta(CACHE_KEYS.MATERIALS, 'replace', { items: cachedMaterials });
        res.json({ success: true, count: materials.length });
    } catch (e) {
        console.error("Bulk Material Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- FILES & BACKUP ---

// --- MATERIAL DELETE (single) ---
app.delete('/api/materials/:code', async (req, res) => {
    const { code } = req.params;
    try {
        await prisma.material.delete({ where: { code: String(code) } });
        removeRamItems(CACHE_KEYS.MATERIALS, code);
        broadcastSyncDelta(CACHE_KEYS.MATERIALS, 'remove', { ids: [String(code)] });
        res.json({ success: true });
    } catch (e) {
        console.error("Material Delete Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- MATERIAL DELETE (bulk) ---
app.post('/api/materials/bulk-delete', async (req, res) => {
    const { codes } = req.body;
    if (!Array.isArray(codes) || codes.length === 0) {
        return res.status(400).json({ error: 'Array de códigos obrigatório.' });
    }
    try {
        const result = await prisma.material.deleteMany({
            where: { code: { in: codes.map(c => String(c)) } }
        });
        removeRamItems(CACHE_KEYS.MATERIALS, codes.map((code) => String(code)));
        broadcastSyncDelta(CACHE_KEYS.MATERIALS, 'remove', { ids: codes.map((code) => String(code)) });
        res.json({ success: true, deleted: result.count });
    } catch (e) {
        console.error("Bulk Material Delete Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/backup/save', (req, res) => {
    const { fileName, fileData } = req.body;
    const backupsDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);
    const filePath = path.join(backupsDir, fileName);
    const base64Data = fileData.split(';base64,').pop();
    fs.writeFile(filePath, base64Data, { encoding: 'base64' }, (err) => {
        if (err) return res.status(500).json({ error: "Erro no servidor" });
        res.json({ message: "Salvo", path: filePath });
    });
});

app.get('/api/admin/backup', (req, res) => {
    const dbPath = path.join(__dirname, 'prisma', 'lidercheck.db');
    if (fs.existsSync(dbPath)) res.download(dbPath, 'lidercheck_backup.db');
    else res.status(404).json({ error: "DB não encontrado" });
});

// --- STATIC SERVER (OTIMIZAÇÃO 3: Cache Estático Longo) ---
const distPath = path.join(__dirname, 'dist');

// Servir arquivos estáticos com Cache Longo (1 ano) para aliviar o HD
// Configuração de Cache Inteligente
const setCustomCacheControl = (res, path) => {
    if (express.static.mime.lookup(path) === 'text/html') {
        // Para HTML (index.html): Nunca fazer cache.
        // Isso garante que o usuário sempre pegue a versão mais nova do JS/CSS.
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    } else {
        // Para JS, CSS, Imagens (Assets do Vite): Cache Longo (1 ano)
        // O Vite muda o nome do arquivo se o conteúdo mudar, então é seguro.
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
};



function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

// --- PEOPLE MANAGEMENT & WORKSTATIONS ---

app.get('/api/employees', async (req, res) => {
    try {
        const { superiorId } = req.query;
        const employees = await ensureRamCollection(CACHE_KEYS.EMPLOYEES);
        const filteredEmployees = superiorId
            ? employees.filter((employee) => employee.superiorId === String(superiorId))
            : employees;
        res.json(filteredEmployees);
    } catch (e) {
        res.status(500).json({ error: "Erro interno no servidor ao buscar colaboradores" });
    }
});

app.post('/api/employees', async (req, res) => {
    try {
        const { matricula, photo, fullName, shift, role, sector, superiorId, idlSt, type, status, address, addressNum, whatsapp, neighborhood, gloveSize, gloveType, gloveExchanges, isEdit } = req.body;

        if (!isEdit) {
            const existing = await prisma.employee.findUnique({ where: { matricula: String(matricula) } });
            if (existing) return res.status(400).json({ error: "Erro: Matrícula já cadastrada no sistema (Ativa ou Inativa)." });
        }

        const employee = await prisma.employee.upsert({
            where: { matricula: String(matricula) },
            update: { photo, fullName, shift, role, sector, superiorId, idlSt, type, status, address, addressNum, neighborhood, whatsapp, gloveSize, gloveType, gloveExchanges: gloveExchanges ? Number(gloveExchanges) : null },
            create: { matricula: String(matricula), photo, fullName, shift, role, sector, superiorId, idlSt, type, status: status || 'ATIVO', address, addressNum, neighborhood, whatsapp, gloveSize, gloveType, gloveExchanges: gloveExchanges ? Number(gloveExchanges) : null }
        });
        await refreshRamCollection(CACHE_KEYS.EMPLOYEES);
        broadcastSyncDelta(CACHE_KEYS.EMPLOYEES, 'upsert', { items: [getRamItem(CACHE_KEYS.EMPLOYEES, employee.matricula) || employee] });
        res.json({ message: "Salvo com sucesso", employee });
    } catch (e) {
        console.error("Save Employee Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/employees/upload-photo/:matricula', async (req, res) => {
    try {
        const matricula = String(req.params.matricula).trim().toUpperCase();
        const { photo } = req.body;
        
        const employee = await prisma.employee.findUnique({ where: { matricula } });
        if (!employee) return res.status(404).json({ error: "Matrícula não encontrada" });

        await prisma.employee.update({
            where: { matricula },
            data: { photo }
        });
        
        res.json({ message: "Foto atualizada com sucesso" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/employees/search/:matricula', async (req, res) => {
    try {
        const queryMatricula = String(req.params.matricula).trim().toUpperCase();
        const { superiorId } = req.query;

        const whereClause = { matricula: queryMatricula };
        if (superiorId) {
            whereClause.superiorId = String(superiorId);
        }

        const employee = await prisma.employee.findFirst({
            where: whereClause,
            include: { attendanceLogs: true }
        });

        if (!employee) return res.status(404).json({ error: "Colaborador não encontrado ou você não tem permissão." });
        res.json(employee);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/employees/:matricula/deactivate', async (req, res) => {
    try {
        const mat = String(req.params.matricula).trim();
        let found = false;
        await prisma.$transaction(async (tx) => {
            const emp = await tx.employee.findUnique({ where: { matricula: mat } });
            if (emp) {
                await tx.employee.update({ where: { matricula: mat }, data: { status: 'INATIVO' } });
                found = true;
            }
            const user = await tx.user.findUnique({ where: { matricula: mat } });
            if (user) {
                await tx.user.update({ where: { matricula: mat }, data: { status: 'INATIVO' } });
                found = true;
            }
        });

        if (!found) {
            return res.status(404).json({ error: "Colaborador não localizado em nenhuma das bases (Employees/Users)." });
        }

        await Promise.all([
            refreshRamCollection(CACHE_KEYS.EMPLOYEES),
            refreshRamCollection(CACHE_KEYS.USERS)
        ]);
        broadcastSyncDelta(CACHE_KEYS.EMPLOYEES, 'replace', { items: getRamCollection(CACHE_KEYS.EMPLOYEES) });
        broadcastSyncDelta(CACHE_KEYS.USERS, 'replace', { items: getRamCollection(CACHE_KEYS.USERS) });

        res.json({ message: "Desligado com sucesso" });
    } catch (e) {
        console.error("Deactivate Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/employees/:matricula/transfer', async (req, res) => {
    try {
        const { superiorId } = req.body;
        const employee = await prisma.employee.findUnique({ where: { matricula: String(req.params.matricula) } });
        if (!employee) return res.status(404).json({ error: "Colaborador não encontrado" });

        let history = [];
        try { history = JSON.parse(employee.previousLeaders || "[]"); } catch (e) { }

        if (employee.superiorId) {
            history.unshift(employee.superiorId);
            if (history.length > 2) history.pop();
        }

        const updated = await prisma.employee.update({
            where: { matricula: String(req.params.matricula) },
            data: { superiorId, previousLeaders: JSON.stringify(history) }
        });
        await refreshRamCollection(CACHE_KEYS.EMPLOYEES);
        broadcastSyncDelta(CACHE_KEYS.EMPLOYEES, 'upsert', { items: [getRamItem(CACHE_KEYS.EMPLOYEES, updated.matricula) || updated] });
        res.json({ message: "Transferência realizada", employee: updated });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/attendance', async (req, res) => {
    try {
        const { employeeId, date, type, delayMinutes, loggedById } = req.body;
        const normalizedEmployeeId = String(employeeId);
        const normalizedDate = String(date);

        const existingLog = await prisma.attendanceLog.findFirst({
            where: {
                employeeId: normalizedEmployeeId,
                date: normalizedDate
            }
        });

        const payload = {
            employeeId: normalizedEmployeeId,
            date: normalizedDate,
            type,
            delayMinutes: delayMinutes ? String(delayMinutes) : null,
            loggedById
        };

        const log = existingLog
            ? await prisma.attendanceLog.update({
                where: { id: existingLog.id },
                data: payload
            })
            : await prisma.attendanceLog.create({
                data: payload
            });

        await refreshRamCollection(CACHE_KEYS.EMPLOYEES);
        broadcastSyncDelta(CACHE_KEYS.EMPLOYEES, 'replace', { items: getRamCollection(CACHE_KEYS.EMPLOYEES) });

        res.json({ message: existingLog ? "Apontamento atualizado" : "Apontamento salvo", log });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/workstations', async (req, res) => {
    try {
        const workstations = await ensureRamCollection(CACHE_KEYS.WORKSTATIONS);
        res.json(workstations);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/production-models', async (req, res) => {
    try {
        const models = await ensureRamCollection(CACHE_KEYS.PRODUCTION_MODELS);
        res.json(models);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/production-models', async (req, res) => {
    try {
        const { name } = req.body;
        const pModel = await prisma.productionModel.create({
            data: { name }
        });
        upsertRamItems(CACHE_KEYS.PRODUCTION_MODELS, [pModel]);
        broadcastSyncDelta(CACHE_KEYS.PRODUCTION_MODELS, 'upsert', { items: [pModel] });
        res.json({ message: "Modelo criado", model: pModel });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/workstations', async (req, res) => {
    try {
        const { name, modelName, order, peopleNeeded, productionModelId } = req.body;
        const workstation = await prisma.workstation.create({
            data: {
                name,
                modelName,
                order: order || null,
                peopleNeeded: parseInt(peopleNeeded),
                productionModelId: productionModelId ? parseInt(productionModelId) : null
            },
            include: { productionModel: true }
        });
        upsertRamItems(CACHE_KEYS.WORKSTATIONS, [workstation]);
        broadcastSyncDelta(CACHE_KEYS.WORKSTATIONS, 'upsert', { items: [workstation] });
        res.json({ message: "Posto criado", workstation });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/workstations/bulk', async (req, res) => {
    try {
        const { items } = req.body;
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "Lista de postos vazia ou inválida." });
        }

        const configModels = await prisma.configModel.findMany();

        const findUnifiedModel = (rawModel) => {
            if (!rawModel) return rawModel;
            const up = rawModel.toUpperCase();

            let match = configModels.find(cm => cm.unifiedCode && cm.unifiedCode.toUpperCase().includes(up));
            if (match && match.unifiedCode) return match.unifiedCode;

            match = configModels.find(cm => cm.name && cm.name.toUpperCase().includes(up));
            if (match && match.name) return match.name;

            return rawModel;
        };

        const mappedItems = items.map(i => ({
            ...i,
            modelName: findUnifiedModel(i.modelName)
        }));

        const uniqueModels = [...new Set(mappedItems.map(i => i.modelName))];

        await prisma.$transaction(async (tx) => {
            await tx.workstation.deleteMany({
                where: { modelName: { in: uniqueModels } }
            });

            await tx.workstation.createMany({
                data: mappedItems.map(i => ({
                    name: i.name,
                    modelName: i.modelName,
                    order: i.order || null,
                    peopleNeeded: parseInt(i.peopleNeeded) || 1
                }))
            });
        });

        const workstations = await refreshRamCollection(CACHE_KEYS.WORKSTATIONS);
        broadcastSyncDelta(CACHE_KEYS.WORKSTATIONS, 'replace', { items: workstations });

        res.json({ message: "Layouts importados com sucesso" });
    } catch (e) {
        console.error("Bulk Workstation Import Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/workstations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, modelName, order, peopleNeeded } = req.body;

        const updated = await prisma.workstation.update({
            where: { id: parseInt(id) },
            data: {
                name: name || undefined,
                modelName: modelName || undefined,
                order: order || null,
                peopleNeeded: peopleNeeded ? parseInt(peopleNeeded) : undefined
            },
            include: { productionModel: true }
        });

        upsertRamItems(CACHE_KEYS.WORKSTATIONS, [updated]);
        broadcastSyncDelta(CACHE_KEYS.WORKSTATIONS, 'upsert', { items: [updated] });

        res.json({ message: "Posto atualizado com sucesso", workstation: updated });
    } catch (e) {
        console.error("Workstation Update Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/workstations/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await prisma.workstation.delete({
            where: { id: parseInt(id) }
        });

        removeRamItems(CACHE_KEYS.WORKSTATIONS, parseInt(id));
        broadcastSyncDelta(CACHE_KEYS.WORKSTATIONS, 'remove', { ids: [String(id)] });

        res.json({ message: "Posto deletado com sucesso" });
    } catch (e) {
        console.error("Workstation Delete Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/layout', async (req, res) => {
    try {
        const { matricula, modelo, ordemPosto, postoAtual } = req.body;

        if (!matricula || !modelo || !ordemPosto) {
            return res.status(400).json({ error: "Matrícula, modelo e ordemPosto são obrigatórios" });
        }

        // Validar que colaborador existe
        const employee = await prisma.employee.findUnique({
            where: { matricula: String(matricula) }
        });
        if (!employee) {
            return res.status(404).json({ error: "Colaborador não encontrado" });
        }

        // Validar duplicata
        const existing = await prisma.layout.findFirst({
            where: { 
                matricula: String(matricula), 
                modelo: String(modelo),
                ordemPosto: String(ordemPosto)
            }
        });
        if (existing) {
            return res.status(400).json({ error: "Este posto já está alocado para este colaborador neste modelo" });
        }

        const layout = await prisma.layout.create({
            data: {
                matricula: String(matricula),
                modelo: String(modelo),
                ordemPosto: String(ordemPosto),
                postoAtual: !!postoAtual
            },
            include: {
                employee: {
                    select: {
                        matricula: true,
                        fullName: true,
                        role: true,
                        shift: true,
                        sector: true
                    }
                }
            }
        });

        upsertRamItems(CACHE_KEYS.LAYOUTS, [layout]);
        broadcastSyncDelta(CACHE_KEYS.LAYOUTS, 'upsert', { items: [layout] });

        res.json({ message: "Posto vinculado com sucesso", layout });
    } catch (e) {
        console.error("Create Layout Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/layout', async (req, res) => {
    try {
        const { matricula, modelo } = req.query;
        const layouts = await ensureRamCollection(CACHE_KEYS.LAYOUTS);
        const filteredLayouts = layouts.filter((layout) => {
            if (matricula && layout.matricula !== String(matricula)) return false;
            if (modelo && layout.modelo !== String(modelo)) return false;
            return true;
        });

        res.json(filteredLayouts);
    } catch (e) {
        console.error("Get Layout Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/layout/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { postoAtual, modelo, ordemPosto } = req.body;

        const dataToUpdate = {};
        if (postoAtual !== undefined) dataToUpdate.postoAtual = !!postoAtual;
        if (modelo) dataToUpdate.modelo = String(modelo);
        if (ordemPosto) dataToUpdate.ordemPosto = String(ordemPosto);

        // Se atualizando postoAtual para true, desativar os outros postos do mesmo colaborador
        if (postoAtual === true) {
            const layout = await prisma.layout.findUnique({
                where: { id: parseInt(id) }
            });
            if (layout) {
                await prisma.layout.updateMany({
                    where: { matricula: layout.matricula, id: { not: parseInt(id) } },
                    data: { postoAtual: false }
                });
            }
        }

        const updated = await prisma.layout.update({
            where: { id: parseInt(id) },
            data: dataToUpdate,
            include: {
                employee: {
                    select: {
                        matricula: true,
                        fullName: true,
                        role: true
                    }
                }
            }
        });

        upsertRamItems(CACHE_KEYS.LAYOUTS, [updated]);
        broadcastSyncDelta(CACHE_KEYS.LAYOUTS, 'upsert', { items: [updated] });

        res.json({ message: "Posto atualizado com sucesso", layout: updated });
    } catch (e) {
        console.error("Update Layout Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/layout/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const deleted = await prisma.layout.delete({
            where: { id: parseInt(id) }
        });

        removeRamItems(CACHE_KEYS.LAYOUTS, parseInt(id));
        broadcastSyncDelta(CACHE_KEYS.LAYOUTS, 'remove', { ids: [String(id)] });

        res.json({ message: "Posto removido com sucesso", layout: deleted });
    } catch (e) {
        console.error("Delete Layout Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/employees/:matricula/workstation-slots', async (req, res) => {
    try {
        const { modelText, workstationName } = req.body;
        const matricula = String(req.params.matricula);
        
        if (!modelText || !workstationName) {
            return res.status(400).json({ error: "Modelo e Posto são obrigatórios" });
        }

        // Validar que colaborador existe
        const employee = await prisma.employee.findUnique({
            where: { matricula }
        });
        if (!employee) {
            return res.status(404).json({ error: "Colaborador não encontrado" });
        }

        // Validar duplicata
        const existing = await prisma.layout.findFirst({
            where: { 
                matricula,
                modelo: String(modelText),
                ordemPosto: String(workstationName)
            }
        });
        if (existing) {
            return res.status(400).json({ error: "Este posto já está alocado para este colaborador neste modelo" });
        }

        const layout = await prisma.layout.create({
            data: {
                matricula,
                modelo: String(modelText),
                ordemPosto: String(workstationName),
                postoAtual: false
            },
            include: {
                employee: {
                    select: {
                        matricula: true,
                        fullName: true,
                        role: true,
                        shift: true,
                        sector: true
                    }
                }
            }
        });

        upsertRamItems(CACHE_KEYS.LAYOUTS, [layout]);
        broadcastSyncDelta(CACHE_KEYS.LAYOUTS, 'upsert', { items: [layout] });

        res.json({ message: "Posto vinculado com sucesso", layout });
    } catch (e) {
        console.error("Workstation Slots Error:", e);
        res.status(500).json({ error: e.message });
    }
});

console.log("🚀 Iniciando servidor...");
// Warm-up do cache global em RAM antes de expor o app
warmRamCache().then(() => {
    app.use(express.static(distPath, {
        setHeaders: setCustomCacheControl
    }));
    app.get('*', (req, res) => {
        const indexFile = path.join(distPath, 'index.html');
        if (fs.existsSync(indexFile)) res.sendFile(indexFile);
        else res.send('Frontend não buildado (npm run build).');
    });

    try {
        const certDir = path.join(__dirname, 'sslcert');
        const key = fs.readFileSync(path.join(certDir, 'server.key'));
        const cert = fs.readFileSync(path.join(certDir, 'server.crt'));
        https.createServer({ key, cert }, app).listen(PORT, '0.0.0.0', () => {
            console.log(`✅ SERVIDOR RODANDO EM HTTPS! (Prisma ORM | RAM Cache Enabled)`);
            console.log(`--------------------------------------------------`);
            console.log(`💻 ACESSO LOCAL:     https://localhost:${PORT}`);
            console.log(`📱 ACESSO NA REDE:   https://${getLocalIp()}:${PORT}`);
            console.log(`--------------------------------------------------`);
            console.log(`Conectado ao database via Prisma.`);
        });
    } catch (e) {
        console.log('⚠️ Certificados SSL não encontrados ou erro ao ler (Fallback HTTP)...');
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ SERVIDOR RODANDO EM HTTP! (Prisma ORM | RAM Cache Enabled)`);
            console.log(`--------------------------------------------------`);
            console.log(`💻 ACESSO LOCAL:     http://localhost:${PORT}`);
            console.log(`📱 ACESSO NA REDE:   http://${getLocalIp()}:${PORT}`);
            console.log(`--------------------------------------------------`);
            console.log(`Conectado ao database via Prisma.`);
        });
    }
});