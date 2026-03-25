import { apiFetch } from './networkConfig';
import { Material } from '../types';

export const getMaterials = async (): Promise<Material[]> => {
    try {
        return await apiFetch('/materials', { useCache: true });
    } catch (e) {
        console.error("Erro ao buscar materiais", e);
        return [];
    }
};

export const saveMaterialsBulk = async (materials: Material[]) => {
    try {
        const res = await apiFetch('/materials/bulk', {
            method: 'POST',
            body: JSON.stringify({ materials })
        });
        return res;
    } catch (e) {
        console.error("Erro ao salvar materiais em massa", e);
        throw e;
    }
};

export const deleteMaterial = async (code: string) => {
    return apiFetch(`/materials/${encodeURIComponent(code)}`, { method: 'DELETE' });
};

export const deleteMaterialsBulk = async (codes: string[]) => {
    return apiFetch('/materials/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ codes })
    });
};
