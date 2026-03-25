import React, { useState, useRef } from 'react';
import { Card } from './Card';
import { Button } from './Button';

const safeRound = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
import { Input } from './Input';
import { Download, Upload, Plus, Save, Search, Trash2, Edit2, X, CheckSquare } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Material } from '../types';
import { saveMaterialsBulk, deleteMaterial, deleteMaterialsBulk } from '../services/materialService';

interface MaterialsManagerProps {
    materials: Material[];
    setMaterials: React.Dispatch<React.SetStateAction<Material[]>>;
    onRefresh: () => void;
    disableDelete?: boolean;
}

export const MaterialsManager: React.FC<MaterialsManagerProps> = ({ materials, setMaterials, onRefresh, disableDelete = false }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    // Form State
    const [newMaterial, setNewMaterial] = useState<Material>({
        code: '', model: '', description: '', item: '', plant: '', price: 0
    });

    // Edit modal
    const [editMaterial, setEditMaterial] = useState<Material | null>(null);

    // Selection state
    const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

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

                const data = XLSX.utils.sheet_to_json(ws);

                const parsedMaterials: Material[] = [];

                data.forEach((row: any) => {
                    if (!row || typeof row !== 'object') return;

                    const getVal = (possibleKeys: string[]) => {
                        const rowKeys = Object.keys(row);
                        for (const pk of possibleKeys) {
                            const foundKey = rowKeys.find(k => k.trim().toLowerCase() === pk.toLowerCase());
                            if (foundKey) return row[foundKey];
                        }
                        return undefined;
                    };

                    const rawCode = getVal(['código', 'codigo', 'code', 'cod']);
                    if (!rawCode) return;
                    const code = String(rawCode).trim();

                    const model = String(getVal(['modelo', 'model']) || 'Geral').trim();
                    const description = String(getVal(['descrição', 'descricao', 'description', 'desc']) || '').trim();
                    const item = String(getVal(['item', 'tipo']) || '').trim();
                    const plant = String(getVal(['planta', 'plant']) || '').trim();

                    let price = 0;
                    const rawPrice = getVal(['valor', 'price', 'preço', 'preco', 'unit_value', 'custo']);

                    if (typeof rawPrice === 'number') {
                        price = safeRound(rawPrice);
                    } else if (typeof rawPrice === 'string') {
                        let cleanStr = rawPrice.replace('R$', '').trim();
                        if (cleanStr.includes(',') && cleanStr.includes('.')) {
                            if (cleanStr.indexOf('.') < cleanStr.indexOf(',')) {
                                cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
                            }
                        } else if (cleanStr.includes(',')) {
                            cleanStr = cleanStr.replace(',', '.');
                        }
                        const parsed = parseFloat(cleanStr);
                        price = isNaN(parsed) ? 0 : safeRound(parsed);
                    }

                    parsedMaterials.push({ code, model, description, item, plant, price });
                });

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

    const handleEditSave = async () => {
        if (!editMaterial || !editMaterial.code) return;
        try {
            await saveMaterialsBulk([editMaterial]);
            setEditMaterial(null);
            onRefresh();
        } catch (e) {
            alert('Erro ao atualizar material.');
        }
    };

    const handleDeleteSingle = async (code: string) => {
        if (!confirm(`Excluir o item com código "${code}"?`)) return;
        try {
            await deleteMaterial(code);
            onRefresh();
        } catch (e) {
            alert('Erro ao excluir material.');
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedCodes.size === 0) return;
        if (!confirm(`Excluir ${selectedCodes.size} iten(s) selecionado(s)?`)) return;
        try {
            await deleteMaterialsBulk(Array.from(selectedCodes));
            setSelectedCodes(new Set());
            onRefresh();
        } catch (e) {
            alert('Erro ao excluir materiais.');
        }
    };

    const toggleSelect = (code: string) => {
        setSelectedCodes(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedCodes.size === filteredMaterials.length) {
            setSelectedCodes(new Set());
        } else {
            setSelectedCodes(new Set(filteredMaterials.map(m => m.code)));
        }
    };

    const handleExportList = () => {
        const exportData = filteredMaterials.map(m => ({
            Código: m.code,
            Modelo: m.model,
            Descrição: m.description,
            Item: m.item,
            Planta: m.plant,
            Valor: m.price
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Itens de Scrap");
        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Itens_Scrap_${dateStr}.xlsx`);
    };

    // Safe Number Formatter
    const formatCurrency = (val: any) => {
        const num = Number(val);
        if (isNaN(num)) return 'R$ 0,00';
        const rounded = safeRound(num);
        return rounded.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    const allSelected = filteredMaterials.length > 0 && selectedCodes.size === filteredMaterials.length;

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Gerenciador de Itens de Scrap</h3>
                    <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                            {isUploading ? 'Processando...' : <><Upload size={16} /> Importar Excel</>}
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
                        }}><Download size={16} /> Template</Button>
                        <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleExportList}>
                            <Download size={16} /> Exportar Lista
                        </Button>
                    </div>
                </div>

                {/* Manual Form */}
                <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 mb-6">
                    <h4 className="text-sm font-bold text-slate-500 dark:text-zinc-400 uppercase mb-4">Cadastro Manual</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <Input label="Código" value={newMaterial.code} onChange={e => setNewMaterial({ ...newMaterial, code: e.target.value })} />
                        <Input label="Modelo" value={newMaterial.model} onChange={e => setNewMaterial({ ...newMaterial, model: e.target.value })} />
                        <Input label="Descrição" value={newMaterial.description} onChange={e => setNewMaterial({ ...newMaterial, description: e.target.value })} />
                        <Input label="Item (Ex: Bateria)" value={newMaterial.item} onChange={e => setNewMaterial({ ...newMaterial, item: e.target.value })} />
                        <Input label="Planta" value={newMaterial.plant} onChange={e => setNewMaterial({ ...newMaterial, plant: e.target.value })} />
                        <Input label="Valor (R$)" type="number" value={newMaterial.price} onChange={e => setNewMaterial({ ...newMaterial, price: safeRound(parseFloat(e.target.value) || 0) })} />
                    </div>
                    <Button fullWidth onClick={handleManualSave}><Save size={16} /> Adicionar / Atualizar Item</Button>
                </div>

                {/* List & Search */}
                <div className="flex gap-2 mb-4 flex-wrap items-center">
                    <div className="flex-1 relative min-w-[200px]">
                        <Search className="absolute left-3 top-3 text-slate-400 dark:text-zinc-500" size={16} />
                        <input
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg py-2 pl-10 pr-4 text-slate-900 dark:text-zinc-300 focus:outline-none focus:border-blue-500"
                            placeholder="Buscar por código, modelo ou descrição..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {selectedCodes.size > 0 && !disableDelete && (
                        <Button variant="danger" onClick={handleDeleteSelected}>
                            <Trash2 size={16} /> Excluir Selecionados ({selectedCodes.size})
                        </Button>
                    )}
                </div>

                <p className="text-xs text-slate-500 dark:text-zinc-500 mb-2">{filteredMaterials.length} iten(s) encontrado(s)</p>

                <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar border border-slate-200 dark:border-zinc-800 rounded-lg">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-600 dark:text-zinc-400 uppercase bg-slate-100 dark:bg-zinc-950 sticky top-0 border-b border-slate-200 dark:border-zinc-800">
                            <tr>
                                {!disableDelete && (
                                    <th className="px-3 py-3 w-10">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded border-slate-300 dark:border-zinc-600 accent-blue-600"
                                        />
                                    </th>
                                )}
                                <th className="px-4 py-3">Código</th>
                                <th className="px-4 py-3">Modelo</th>
                                <th className="px-4 py-3">Descrição</th>
                                <th className="px-4 py-3">Item</th>
                                <th className="px-4 py-3">Planta</th>
                                <th className="px-4 py-3 text-right">Valor</th>
                                <th className="px-4 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                            {filteredMaterials.map((m, idx) => (
                                <tr key={m.code || idx} className={`hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors ${selectedCodes.has(m.code) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                                    {!disableDelete && (
                                        <td className="px-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={selectedCodes.has(m.code)}
                                                onChange={() => toggleSelect(m.code)}
                                                className="w-4 h-4 rounded border-slate-300 dark:border-zinc-600 accent-blue-600"
                                            />
                                        </td>
                                    )}
                                    <td className="px-4 py-2 font-mono text-slate-500 dark:text-zinc-400">{m.code || '-'}</td>
                                    <td className="px-4 py-2 font-bold text-slate-900 dark:text-white">{m.model || '-'}</td>
                                    <td className="px-4 py-2 text-slate-700 dark:text-zinc-300">{m.description || '-'}</td>
                                    <td className="px-4 py-2 text-slate-700 dark:text-zinc-300">{m.item || '-'}</td>
                                    <td className="px-4 py-2 text-slate-700 dark:text-zinc-300">{m.plant || '-'}</td>
                                    <td className="px-4 py-2 text-right text-emerald-600 dark:text-emerald-400 font-medium">
                                        {formatCurrency(m.price)}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <div className="flex justify-end gap-1">
                                            <button
                                                onClick={() => setEditMaterial({ ...m })}
                                                className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 transition-colors"
                                                title="Editar"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            {!disableDelete && (
                                                <button
                                                    onClick={() => handleDeleteSingle(m.code)}
                                                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredMaterials.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="text-center py-8 text-slate-500 dark:text-zinc-500">Nenhum material encontrado.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Edit Modal */}
            {editMaterial && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditMaterial(null)}>
                    <Card className="w-full max-w-lg bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Editar Material</h3>
                            <button onClick={() => setEditMaterial(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 bg-slate-100 dark:bg-zinc-800 rounded-full w-8 h-8 flex items-center justify-center">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <Input label="Código" value={editMaterial.code} readOnly className="opacity-50" />
                            <Input label="Modelo" value={editMaterial.model} onChange={e => setEditMaterial({ ...editMaterial, model: e.target.value })} />
                            <Input label="Descrição" value={editMaterial.description} onChange={e => setEditMaterial({ ...editMaterial, description: e.target.value })} />
                            <Input label="Item" value={editMaterial.item} onChange={e => setEditMaterial({ ...editMaterial, item: e.target.value })} />
                            <Input label="Planta" value={editMaterial.plant} onChange={e => setEditMaterial({ ...editMaterial, plant: e.target.value })} />
                            <Input label="Valor (R$)" type="number" value={editMaterial.price} onChange={e => setEditMaterial({ ...editMaterial, price: safeRound(parseFloat(e.target.value) || 0) })} />
                            <div className="flex gap-2 justify-end pt-2">
                                <Button variant="outline" onClick={() => setEditMaterial(null)}>Cancelar</Button>
                                <Button onClick={handleEditSave}><Save size={16} /> Salvar</Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
