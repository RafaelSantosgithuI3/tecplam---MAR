import { ScrapData } from '../types';
import { apiFetch } from './networkConfig';

export const getScraps = async (): Promise<ScrapData[]> => {
    try {
        return await apiFetch('/scraps');
    } catch (e) {
        console.error("Erro ao buscar scraps", e);
        return [];
    }
};

export const saveScrap = async (scrap: ScrapData) => {
    try {
        await apiFetch('/scraps', {
            method: 'POST',
            body: JSON.stringify(scrap)
        });
    } catch (e) {
        console.error("Erro ao salvar scrap", e);
        throw e;
    }
};

export const updateScrapCountermeasure = async (id: string, countermeasure: string) => {
    try {
        await apiFetch(`/scraps/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ countermeasure })
        });
    } catch (e) {
        console.error("Erro ao atualizar scrap", e);
        throw e;
    }
};

export const updateScrap = async (id: string, updates: Partial<ScrapData>) => {
    try {
        await apiFetch(`/scraps/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    } catch (e) {
        console.error("Erro ao atualizar scrap", e);
        throw e;
    }
};

export const getMaterials = async (): Promise<{ id: string, code: string, description: string, price: number }[]> => {
    try {
        return await apiFetch('/materials');
    } catch (e) {
        console.error("Erro ao buscar materiais", e);
        return [];
    }
};

export const saveMaterial = async (data: { code: string, description: string, unitValue: number }) => {
    try {
        await apiFetch('/materials', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.error("Erro ao salvar material", e);
        throw e;
    }
};

export const SCRAP_ITEMS = [
    'BATERIA', 'REAR', 'TAPE', 'CAMERA RW1', 'CAMERA FW1', 'CAMERA RB1',
    'BAG', 'SIMTRAY', 'CAIXA MASTER', 'CAIXA GIFT', 'FRONT', 'OCTA',
    'CABO COAXIAL', 'CABO FLAT', 'BRACKET', 'BACK COVER', 'PARAFUSO',
    'SUB PBA', 'SPK', 'RCV', 'BLINDAGEM'
];

export const SCRAP_STATUS = [
    'QUEBRADO', 'TRINCADO', 'DANIFICADO', 'BATIDO', 'RISCADO',
    'ALTERADO', 'TRILHA ROMPIDA', 'EXCESSO DE RETRABALHO'
];

export const CAUSA_RAIZ_OPTIONS = [
    'MÁQUINA', 'OPERACIONAL', 'MATERIAL', 'MATERIAL-FORNECEDOR'
];
