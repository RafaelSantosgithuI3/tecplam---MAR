import { apiFetch } from './networkConfig';

export const getBoxes = async () => { return await apiFetch('/boxes'); };
export const createBox = async (type: string, plant?: string) => {
    return await apiFetch('/boxes', { method: 'POST', body: JSON.stringify({ type, plant }) });
};
export const closeBox = async (id: number) => {
    return await apiFetch(`/boxes/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'IDENTIFIED' }) });
};
export const associateBoxNF = async (id: number, nfNumber: string) => {
    return await apiFetch(`/boxes/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'INVOICED', nfNumber }) });
};
export const linkScrapToBox = async (id: number, qrCode: string) => {
    return await apiFetch(`/boxes/${id}/scraps`, { method: 'POST', body: JSON.stringify({ qrCode }) });
};
export const deleteBox = async (id: number) => {
    return await apiFetch(`/boxes/${id}`, { method: 'DELETE' });
};
export const reopenBox = async (id: number) => {
    return await apiFetch(`/boxes/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'OPEN' }) });
};
