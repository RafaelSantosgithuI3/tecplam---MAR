
import { ChecklistItem, ChecklistLog, User, MeetingLog, Permission } from '../types';
import { CHECKLIST_ITEMS } from '../constants';
import { apiFetch } from './networkConfig';

// --- TIMEZONE UTIL ---
export const getManausDate = (): Date => {
    // Cria data atual
    const now = new Date();
    // Converte para string no fuso de Manaus
    const manausTimeStr = now.toLocaleString("en-US", { timeZone: "America/Manaus" });
    // Cria novo objeto Date baseado nessa string (que agora tem o horário de Manaus)
    return new Date(manausTimeStr);
};

// --- CONFIGURAÇÃO DO CHECKLIST ---

// Agora aceita um type opcional para filtrar
export const getChecklistItems = async (type: 'LEADER' | 'MAINTENANCE' = 'LEADER'): Promise<ChecklistItem[]> => {
    try {
        const items = await apiFetch('/config/items');
        if (!items || items.length === 0) {
            // Se estiver vazio e for LEADER, retorna default
            if(type === 'LEADER') return CHECKLIST_ITEMS.map(i => ({...i, type: 'LEADER'}));
            return [];
        }
        
        // Filtra pelo tipo solicitado
        const filtered = items.filter((i: ChecklistItem) => (i.type || 'LEADER') === type);
        
        // Se for LEADER e filtrado estiver vazio, retorna default (fallback de segurança)
        if(type === 'LEADER' && filtered.length === 0) return CHECKLIST_ITEMS.map(i => ({...i, type: 'LEADER'}));
        
        return filtered;
    } catch (e) {
        console.warn("Usando itens locais (offline/erro)", e);
        if(type === 'LEADER') return CHECKLIST_ITEMS.map(i => ({...i, type: 'LEADER'}));
        return [];
    }
};

// Pega TODOS os itens (para o editor salvar todos de volta)
export const getAllChecklistItemsRaw = async (): Promise<ChecklistItem[]> => {
    try {
        return await apiFetch('/config/items');
    } catch(e) {
        return [];
    }
}

export const saveChecklistItems = async (items: ChecklistItem[]) => {
    try {
        await apiFetch('/config/items', {
            method: 'POST',
            body: JSON.stringify({ items })
        });
    } catch (e) {
        console.error("Erro ao salvar itens", e);
    }
};

export const resetChecklistToDefault = async () => {
    try {
        await apiFetch('/config/items/reset', { method: 'POST' });
    } catch (e) {
        console.error(e);
    }
    return CHECKLIST_ITEMS;
};

// --- PERMISSIONS ---

export const getPermissions = async (): Promise<Permission[]> => {
    try {
        return await apiFetch('/config/permissions');
    } catch(e) {
        return [];
    }
}

export const savePermissions = async (permissions: Permission[]) => {
    try {
        await apiFetch('/config/permissions', {
            method: 'POST',
            body: JSON.stringify({ permissions })
        });
    } catch(e) {
        console.error(e);
    }
}

// --- LINHAS DE PRODUÇÃO ---

export const getLines = async (): Promise<string[]> => {
    try {
        const lines = await apiFetch('/config/lines');
        if (Array.isArray(lines) && lines.length > 0) {
            return lines.map((l: any) => l.name);
        }
        return ['TP_TNP-01', 'TP_TNP-02', 'TP_TNP-03', 'TP_SEC-01', 'TP_SEC-02'];
    } catch (e) {
        return ['TP_TNP-01', 'TP_TNP-02', 'TP_TNP-03', 'TP_SEC-01', 'TP_SEC-02'];
    }
};

export const saveLines = async (lines: string[]) => {
    try {
        await apiFetch('/config/lines', {
            method: 'POST',
            body: JSON.stringify({ lines })
        });
    } catch (e) {
        console.error(e);
        throw e;
    }
};

// --- CARGOS (ROLES) ---

export const getRoles = async (): Promise<string[]> => {
    try {
        const roles = await apiFetch('/config/roles');
        if (Array.isArray(roles) && roles.length > 0) {
            return roles.map((r: any) => r.name);
        }
        return [
            'Diretor', 'TI', 'Supervisor', 'Coordenador', 'Técnico de processo', 
            'Líder de produção', 'Líder do reparo/retrabalho', 'Líder da Qualidade(OQC)', 
            'Auditor', 'PQC Analista', 'Assistente de processo', 'Operador multifuncional'
        ];
    } catch (e) {
        return [
            'Diretor', 'TI', 'Supervisor', 'Coordenador', 'Técnico de processo', 
            'Líder de produção', 'Líder do reparo/retrabalho', 'Líder da Qualidade(OQC)', 
            'Auditor', 'PQC Analista', 'Assistente de processo', 'Operador multifuncional'
        ];
    }
};

export const saveRoles = async (roles: string[]) => {
    try {
        await apiFetch('/config/roles', {
            method: 'POST',
            body: JSON.stringify({ roles })
        });
    } catch (e) {
        console.error(e);
        throw e;
    }
};

// --- HISTÓRICO DE AUDITORIAS ---

export const saveLog = async (log: ChecklistLog) => {
    try {
        await apiFetch('/logs', {
            method: 'POST',
            body: JSON.stringify(log)
        });
    } catch (e) {
        console.error("Erro ao salvar log", e);
        throw e;
    }
};

export const getLogs = async (): Promise<ChecklistLog[]> => {
    try {
        return await apiFetch('/logs');
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
    } catch (e) {
        return undefined;
    }
};

export const getMissingLeadersForToday = async (allUsers: User[]): Promise<User[]> => {
    const logs = await getLogs();
    const today = getManausDate().toISOString().split('T')[0];
    
    // Filtro mais abrangente para Líderes
    const leaders = allUsers.filter(u => 
        u.role.toLowerCase().includes('lider') || 
        u.role.toLowerCase().includes('líder') ||
        u.role.toLowerCase().includes('supervisor')
    );
    
    return leaders.filter(lider => {
        const hasLog = logs.some(log => log.userId === lider.matricula && log.date.startsWith(today));
        return !hasLog;
    });
};

// --- ATA DE REUNIÃO ---

export const saveMeeting = async (meeting: MeetingLog) => {
    try {
        await apiFetch('/meetings', {
            method: 'POST',
            body: JSON.stringify(meeting)
        });
    } catch (e) {
        console.error("Erro ao salvar ata", e);
        throw e;
    }
}

export const getMeetings = async (): Promise<MeetingLog[]> => {
    try {
        return await apiFetch('/meetings');
    } catch (e) {
        console.error("Erro ao buscar atas", e);
        return [];
    }
}

// --- MAINTENANCE ITEMS ---
export const getMaintenanceItems = async (machineId: string): Promise<ChecklistItem[]> => {
    const items = await getChecklistItems('MAINTENANCE');
    // Filtra itens cuja categoria seja igual ao ID da máquina (para simplificar, no editor o usuário cadastra a categoria como o nome da máquina)
    return items.filter(i => i.category.toLowerCase() === machineId.toLowerCase());
}


// --- RELATÓRIOS ---

const getWeek = (d: Date) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

export const getLogsByWeekNumber = async (year: number, week: number, shift: string, allUsers: User[]): Promise<ChecklistLog[]> => {
    const logs = await getLogs();
    
    return logs.filter(log => {
        // Ignorar logs de manutenção E Parada de Linha na contagem de checklist de produção
        if (log.type === 'MAINTENANCE' || log.type === 'LINE_STOP') return false;

        const logDate = new Date(log.date);
        const logYear = logDate.getFullYear();
        const logWeek = getWeek(logDate);
        
        // Match exato de Semana e Ano
        if (logYear !== year || logWeek !== week) return false;

        // Se o filtro de turno for especificado e não for "Todos"
        // Prioridade: turno salvo no log (se existir no futuro), fallback para user.shift
        const user = allUsers.find(u => u.matricula === log.userId);
        const userShift = user ? user.shift : '';
        
        if (shift && shift !== 'ALL') {
             if (userShift !== shift) return false;
        }
        return true;
    });
}

/**
 * Filtra logs sincronizados por semana, turno e linha.
 */
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
    monday.setHours(0,0,0,0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23,59,59,999);

    return logs.filter(log => {
        // Ignorar manutenção e Parada de Linha
        if (log.type === 'MAINTENANCE' || log.type === 'LINE_STOP') return false;

        const logD = new Date(log.date);
        
        // Filtro de Turno rigoroso
        const user = allUsers.find(u => u.matricula === log.userId);
        const logShift = user ? user.shift : '??';
        if (shift && shift !== 'ALL' && logShift !== shift) return false;

        return (log.line === line) && 
               logD >= monday && 
               logD <= sunday;
    });
};

// --- BACKUP SERVIDOR ---

export const saveBackupToServer = async (fileName: string, fileData: string) => {
    try {
        return await apiFetch('/backup/save', {
            method: 'POST',
            body: JSON.stringify({ fileName, fileData })
        });
    } catch (e) {
        console.error("Erro ao enviar backup para servidor", e);
        throw e;
    }
}

// --- UTILS ---
export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};