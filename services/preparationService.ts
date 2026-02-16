
import { apiFetch } from './networkConfig';
import { PreparationLog } from '../types';

export const getPreparationLogs = async (): Promise<PreparationLog[]> => {
    return await apiFetch('/preparation-logs');
};

export const savePreparationLog = async (log: PreparationLog): Promise<void> => {
    await apiFetch('/preparation-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
    });
};
