
import { apiFetch } from './networkConfig';
import { PreparationLog } from '../types';

export const getPreparationLogs = async (): Promise<PreparationLog[]> => {
    return await apiFetch('/preparation-logs', { useCache: true });
};

export const savePreparationLog = async (log: PreparationLog): Promise<void> => {
    await apiFetch('/preparation-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
    });
};

export const updatePreparationLog = async (id: number, data: any): Promise<void> => {
    try {
        await apiFetch(`/preparation-logs/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.error("Erro ao atualizar log de preparação:", e);
        throw e;
    }
};

export const deletePreparationLog = async (id: number): Promise<void> => {
    try {
        await apiFetch(`/preparation-logs/${id}`, {
            method: 'DELETE'
        });
    } catch (e) {
        console.error("Erro ao deletar log de preparação:", e);
        throw e;
    }
};
