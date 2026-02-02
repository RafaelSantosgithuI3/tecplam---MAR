import { apiFetch } from './networkConfig';
import { Material } from '../types';

export const getMaterials = async (): Promise<Material[]> => {
    try {
        return await apiFetch('/materials');
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
