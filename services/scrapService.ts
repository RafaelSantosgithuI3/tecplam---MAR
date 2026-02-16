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

export const deleteScrap = async (id: string) => {
    try {
        await apiFetch(`/scraps/${id}`, {
            method: 'DELETE'
        });
    } catch (e) {
        console.error("Erro ao deletar scrap", e);
        throw e;
    }
};

export const getMaterials = async (): Promise<import('../types').Material[]> => {
    try {
        return await apiFetch('/materials');
    } catch (e) {
        console.error("Erro ao buscar materiais", e);
        return [];
    }
};

export const saveMaterials = async (materials: import('../types').Material[]) => {
    try {
        await apiFetch('/materials/bulk', {
            method: 'POST',
            body: JSON.stringify({ materials })
        });
    } catch (e) {
        console.error("Erro ao salvar materiais", e);
        throw e;
    }
};

export const SCRAP_ITEMS = [
    'BATERIA SCRAP', 'BATERIA RMA', 'REAR', 'OCTA', 'FRONT', 'CAMERA RW1', 'CAMERA FW1', 'CAMERA RB1',
    'MIUDEZA(S)', 'BAG', 'SIMTRAY', 'CAIXA MASTER', 'CAIXA GIFT', 'TAPE',
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

export const batchProcessScraps = async (scrapIds: number[], nfNumber: string, userId: string, sentAt: Date) => {
    try {
        await apiFetch('/scraps/batch-process', {
            method: 'POST',
            body: JSON.stringify({ scrapIds, nfNumber, userId, sentAt })
        });
    } catch (e) {
        console.error("Erro ao processar lote de scraps", e);
        throw e;
    }
};
