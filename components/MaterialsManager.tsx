import React, { useState, useRef } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { Download, Upload, Plus, Save, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Material } from '../types';
import { saveMaterialsBulk } from '../services/materialService';

interface MaterialsManagerProps {
    materials: Material[];
    setMaterials: React.Dispatch<React.SetStateAction<Material[]>>;
    onRefresh: () => void;
}

export const MaterialsManager: React.FC<MaterialsManagerProps> = ({ materials, setMaterials, onRefresh }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    // Form State
    const [newMaterial, setNewMaterial] = useState<Material>({
        code: '', model: '', description: '', item: '', plant: '', price: 0
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Filter with safety check (ensure materials is an array)
    const safeMaterials = Array.isArray(materials) ? materials : [];
    const filteredMaterials = safeMaterials.filter(m =>
        (m.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.model || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.plant || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const reader = new FileReader();

        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];

                // Read as array of arrays first to avoid header issues, then precise mapping? 
                // Using sheet_to_json is fine if we are robust.
                const data = XLSX.utils.sheet_to_json(ws);
                console.log("Raw Excel Data:", data);

                const parsedMaterials: Material[] = [];

                data.forEach((row: any) => {
                    if (!row || typeof row !== 'object') return;

                    // Helper to find key case-insensitively
                    const getVal = (possibleKeys: string[]) => {
                        const rowKeys = Object.keys(row);
                        for (const pk of possibleKeys) {
                            const foundKey = rowKeys.find(k => k.trim().toLowerCase() === pk.toLowerCase());
                            if (foundKey) return row[foundKey];
                        }
                        return undefined;
                    };

                    // 1. Parse Code (Mandatory)
                    const rawCode = getVal(['código', 'codigo', 'code', 'cod']);
                    if (!rawCode) return; // Skip lines without code
                    const code = String(rawCode).trim();

                    // 2. Parse Model
                    const model = String(getVal(['modelo', 'model']) || 'Geral').trim();

                    // 3. Parse Description
                    const description = String(getVal(['descrição', 'descricao', 'description', 'desc']) || '').trim();

                    // 4. Parse Item
                    const item = String(getVal(['item', 'tipo']) || '').trim();

                    // 5. Parse Plant
                    const plant = String(getVal(['planta', 'plant']) || '').trim();

                    // 6. Parse Price (Critical)
                    let price = 0;
                    const rawPrice = getVal(['valor', 'price', 'preço', 'preco', 'unit_value', 'custo']);

                    if (typeof rawPrice === 'number') {
                        price = rawPrice;
                    } else if (typeof rawPrice === 'string') {
                        // "R$ 1.200,50" -> "1200.50"
                        // Remove "R$", trim spaces
                        let cleanStr = rawPrice.replace('R$', '').trim();

                        // Check format: "1.200,50" (Brazilian) vs "1,200.50" (US) vs "1200.50"
                        if (cleanStr.includes(',') && cleanStr.includes('.')) {
                            // Assume format like 1.000,00 -> remove dots, replace comma with dot
                            if (cleanStr.indexOf('.') < cleanStr.indexOf(',')) {
                                cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
                            }
                        } else if (cleanStr.includes(',')) {
                            // "10,50" -> "10.50"
                            cleanStr = cleanStr.replace(',', '.');
                        }

                        const parsed = parseFloat(cleanStr);
                        price = isNaN(parsed) ? 0 : parsed;
                    }

                    parsedMaterials.push({
                        code,
                        model,
                        description,
                        item,
                        plant,
                        price
                    });
                });

                console.log("Parsed Materials:", parsedMaterials);

                if (parsedMaterials.length > 0) {
                    if (confirm(`Encontrados ${parsedMaterials.length} itens válidos. Deseja importar?`)) {
                        await saveMaterialsBulk(parsedMaterials);
                        alert('Importação concluída com sucesso!');
                        onRefresh();
                    }
                } else {
                    alert('Nenhum dado válido encontrado. Verifique se a planilha possui colunas como "Código", "Modelo", etc.');
                }
            } catch (err) {
                console.error("Critical Import Error:", err);
                alert(`Erro ao processar arquivo: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
            } finally {
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };

        reader.onerror = () => {
            alert("Erro de leitura do arquivo.");
            setIsUploading(false);
        }

        reader.readAsBinaryString(file);
    };

    const handleManualSave = async () => {
        if (!newMaterial.code || !newMaterial.model) {
            alert('Código e Modelo são obrigatórios.');
            return;
        }

        try {
            await saveMaterialsBulk([newMaterial]);
            setNewMaterial({ code: '', model: '', description: '', item: '', plant: '', price: 0 });
            onRefresh();
            alert('Material salvo!');
        } catch (e) {
            alert('Erro ao salvar material.');
        }
    };

    // Safe Number Formatter
    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return 'R$ 0,00';
        const rounded = Math.ceil(num * 100) / 100;
        return rounded.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold">Gerenciador de Itens de Scrap</h3>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                            {isUploading ? 'Processando...' : <><Upload size={16} /> Importar Excel (.xlsx)</>}
                        </Button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept=".xlsx, .xls, .csv"
                            onChange={handleFileUpload}
                        />
                        <Button variant="outline" onClick={() => {
                            const ws = XLSX.utils.json_to_sheet([{ código: '123', modelo: 'MOD01', descrição: 'Exemplo', item: 'BATERIA', planta: 'MANAUS', valor: 10.50 }]);
                            const wb = XLSX.utils.book_new();
                            XLSX.utils.book_append_sheet(wb, ws, "Template");
                            XLSX.writeFile(wb, "Template_Materiais.xlsx");
                        }}><Download size={16} /> Baixar Modelo</Button>
                    </div>
                </div>

                {/* Manual Form */}
                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 mb-6">
                    <h4 className="text-sm font-bold text-zinc-400 uppercase mb-4">Cadastro Manual</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <Input label="Código" value={newMaterial.code} onChange={e => setNewMaterial({ ...newMaterial, code: e.target.value })} />
                        <Input label="Modelo" value={newMaterial.model} onChange={e => setNewMaterial({ ...newMaterial, model: e.target.value })} />
                        <Input label="Descrição" value={newMaterial.description} onChange={e => setNewMaterial({ ...newMaterial, description: e.target.value })} />
                        <Input label="Item (Ex: Bateria)" value={newMaterial.item} onChange={e => setNewMaterial({ ...newMaterial, item: e.target.value })} />
                        <Input label="Planta" value={newMaterial.plant} onChange={e => setNewMaterial({ ...newMaterial, plant: e.target.value })} />
                        <Input label="Valor (R$)" type="number" value={newMaterial.price} onChange={e => setNewMaterial({ ...newMaterial, price: parseFloat(e.target.value) })} />
                    </div>
                    <Button fullWidth onClick={handleManualSave}><Save size={16} /> Adicionar / Atualizar Item</Button>
                </div>

                {/* List & Search */}
                <div className="flex gap-2 mb-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-3 text-zinc-500" size={16} />
                        <input
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-2 pl-10 pr-4 text-zinc-300 focus:outline-none focus:border-blue-500"
                            placeholder="Buscar por código, modelo ou descrição..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-sm text-left text-zinc-300">
                        <thead className="text-xs text-zinc-400 uppercase bg-zinc-950 sticky top-0">
                            <tr>
                                <th className="px-4 py-3">Código</th>
                                <th className="px-4 py-3">Modelo</th>
                                <th className="px-4 py-3">Descrição</th>
                                <th className="px-4 py-3">Item</th>
                                <th className="px-4 py-3">Planta</th>
                                <th className="px-4 py-3 text-right">Valor</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                            {filteredMaterials.map((m, idx) => (
                                <tr key={m.code || idx} className="hover:bg-zinc-900/50">
                                    <td className="px-4 py-2 font-mono text-zinc-400">{m.code || '-'}</td>
                                    <td className="px-4 py-2 font-bold text-white">{m.model || '-'}</td>
                                    <td className="px-4 py-2">{m.description || '-'}</td>
                                    <td className="px-4 py-2">{m.item || '-'}</td>
                                    <td className="px-4 py-2">{m.plant || '-'}</td>
                                    <td className="px-4 py-2 text-right text-emerald-400">
                                        {formatCurrency(m.price)}
                                    </td>
                                </tr>
                            ))}
                            {filteredMaterials.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-8 text-zinc-500">Nenhum material encontrado.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
