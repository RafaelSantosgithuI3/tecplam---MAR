
import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { ArrowLeft, Save, Plus, Trash2, Edit2, List, FileSpreadsheet, Box, Ban, UserX, Download, Upload, X, Search, Smartphone, User as UserIcon, Shield } from 'lucide-react';
import { ConfigItem, ConfigModel } from '../types';
import { getLines, addLine, deleteLine, getRoles, addRole, deleteRole, getStations, saveStations, getModelsFull, saveModelsFull, getLayoutWorkstations, addLayoutWorkstation, editLayoutWorkstation, deleteLayoutWorkstation, getUnifiedModels, saveLayoutWorkstationsBulk } from '../services/storageService';
import { apiFetch } from '../services/networkConfig';
import { exportWorkstationsByModel } from '../services/excelService';
import { getMaterials } from '../services/materialService';
import { MaterialsManager } from './MaterialsManager';
import * as XLSX from 'xlsx';

interface ManagementModuleProps {
    onBack: () => void;
}

type Tab = 'LINES' | 'ROLES' | 'MODELS' | 'STATIONS' | 'STATIONS_LAYOUT' | 'MATERIALS' | 'DESLIGAMENTO';

export const ManagementModule: React.FC<ManagementModuleProps> = ({ onBack }) => {
    const [tab, setTab] = useState<Tab>('LINES');
    const [lines, setLines] = useState<ConfigItem[]>([]);
    const [roles, setRoles] = useState<ConfigItem[]>([]);
    const [models, setModels] = useState<ConfigModel[]>([]);
    const [stations, setStations] = useState<string[]>([]);
    const [materials, setMaterials] = useState<any[]>([]);

    const [layoutStations, setLayoutStations] = useState<any[]>([]);
    const [unifiedModels, setUnifiedModels] = useState<ConfigModel[]>([]);
    const [selectedLayoutModel, setSelectedLayoutModel] = useState<string>('');
    const [newLayoutStationName, setNewLayoutStationName] = useState('');
    const [newLayoutPeopleNeeded, setNewLayoutPeopleNeeded] = useState('');
    const [editingStationId, setEditingStationId] = useState<number | null>(null);
    const [editStationName, setEditStationName] = useState('');
    const [editStationOrder, setEditStationOrder] = useState('');
    const [editStationPeople, setEditStationPeople] = useState('');

    const [newItem, setNewItem] = useState('');
    const [newSku, setNewSku] = useState('');
    const [newUnifiedCode, setNewUnifiedCode] = useState('');
    const [isEditing, setIsEditing] = useState<ConfigModel | null>(null);
    const [search, setSearch] = useState('');

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);

    // DESLIGAMENTO state
    const [deactivateSearch, setDeactivateSearch] = useState('');
    const [deactivatePreview, setDeactivatePreview] = useState<any>(null);
    const [allEmployees, setAllEmployees] = useState<any[]>([]);

    // PEOPLE_MANAGEMENT state
    const [peopleSearch, setPeopleSearch] = useState('');
    const [peopleSearchResults, setPeopleSearchResults] = useState<any[]>([]);
    const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
    const [isEditingEmployee, setIsEditingEmployee] = useState(false);
    const [editEmployeeData, setEditEmployeeData] = useState<any>(null);

    useEffect(() => {
        loadData();
    }, [tab]);

    const loadData = async () => {
        if (tab === 'LINES') setLines(await getLines());
        if (tab === 'ROLES') setRoles(await getRoles());
        if (tab === 'STATIONS') setStations(await getStations());
        if (tab === 'MATERIALS') setMaterials(await getMaterials());
        if (tab === 'MODELS' || tab === 'STATIONS_LAYOUT') {
            const _models = await getModelsFull();
            setModels(_models);
            if (tab === 'STATIONS_LAYOUT') {
                const ls = await getLayoutWorkstations();
                setLayoutStations(ls);
                const _unified = await getUnifiedModels();
                setUnifiedModels(_unified);
                if (!selectedLayoutModel && _unified.length > 0) {
                    setSelectedLayoutModel(_unified[0].name);
                }
            }
        }
        if (tab === 'DESLIGAMENTO') {
            try {
                const emps = await apiFetch('/employees');
                setAllEmployees(emps || []);
            } catch (e) { setAllEmployees([]); }
        }
    };

    const handleAddLine = async () => {
        if (!newItem) return;
        await addLine(newItem);
        setNewItem('');
        loadData();
    };

    const handleDeleteLine = async (id: string | number) => {
        if (window.confirm('Confirmar exclusão?')) {
            await deleteLine(id);
            loadData();
        }
    };

    const handleAddRole = async () => {
        if (!newItem) return;
        await addRole(newItem);
        setNewItem('');
        loadData();
    };

    const handleDeleteRole = async (id: string | number) => {
        if (window.confirm('Confirmar exclusão?')) {
            await deleteRole(id);
            loadData();
        }
    };

    const handleSaveModel = async () => {
        if (!newItem) return;
        // unifiedCode: usa o campo editado, senão auto-calcula pelos 7 primeiros chars
        const finalUnifiedCode = newUnifiedCode.trim() || newItem.substring(0, 7);

        let updatedModels = [...models];
        if (isEditing && isEditing.name) {
            updatedModels = updatedModels.map(m =>
                m.name === isEditing.name
                    ? { ...m, name: newItem, sku: newSku, unifiedCode: finalUnifiedCode } as any
                    : m
            );
        } else {
            if (updatedModels.find(m => m.name === newItem)) return alert('Modelo já existe');
            updatedModels.push({ id: newItem, name: newItem, sku: newSku, unifiedCode: finalUnifiedCode } as any);
        }

        await saveModelsFull(updatedModels);
        setNewItem('');
        setNewSku('');
        setNewUnifiedCode('');
        setIsEditing(null);
        loadData();
    };

    const handleDeleteModel = async (name: string) => {
        if (window.confirm('Excluir modelo?')) {
            const updated = models.filter(m => m.name !== name);
            await saveModelsFull(updated);
            loadData();
        }
    };

    const handleSaveStation = async () => {
        if (!newItem) return;
        const updated = [...stations, newItem];
        await saveStations(updated);
        setNewItem('');
        loadData(); // Stations fetch currently just returns strings
    };

    const handleDeleteStation = async (name: string) => {
        if (window.confirm('Excluir posto?')) {
            const updated = stations.filter(s => s !== name);
            await saveStations(updated);
            loadData();
        }
    };

    const renderLines = () => (
        <div className="space-y-4">
            <div className="flex gap-2">
                <Input placeholder="Nome da Linha" value={newItem} onChange={e => setNewItem(e.target.value)} />
                <Button onClick={handleAddLine}><Plus size={16} /> Adicionar</Button>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                {lines.map(l => (
                    <div key={l.id} className="p-4 border-b border-slate-200 dark:border-zinc-800 flex justify-between items-center last:border-0">
                        <span className="text-slate-900 dark:text-zinc-100 font-medium">{l.name}</span>
                        <Button variant="danger" onClick={() => handleDeleteLine(l.id)}><Trash2 size={16} /></Button>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderRoles = () => (
        <div className="space-y-4">
            <div className="flex gap-2">
                <Input placeholder="Nome do Cargo" value={newItem} onChange={e => setNewItem(e.target.value)} />
                <Button onClick={handleAddRole}><Plus size={16} /> Adicionar</Button>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                {roles.map(r => (
                    <div key={r.id} className="p-4 border-b border-slate-200 dark:border-zinc-800 flex justify-between items-center last:border-0">
                        <span className="text-slate-900 dark:text-zinc-100 font-medium">{r.name}</span>
                        <Button variant="danger" onClick={() => handleDeleteRole(r.id)}><Trash2 size={16} /></Button>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderModels = () => {
        const q = search.toLowerCase();
        const filtered = models
            .filter(m =>
                m.name.toLowerCase().includes(q) ||
                (m.sku || '').toLowerCase().includes(q) ||
                ((m as any).unifiedCode || '').toLowerCase().includes(q)
            )
            .sort((a, b) => {
                const ua = ((a as any).unifiedCode || a.name.substring(0, 7)).toLowerCase();
                const ub = ((b as any).unifiedCode || b.name.substring(0, 7)).toLowerCase();
                return ua.localeCompare(ub) || a.name.localeCompare(b.name);
            });

        return (
            <div className="space-y-4">
                <div className="flex gap-2">
                    <Input placeholder="Buscar por unificado, modelo ou SKU..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search size={16} />} />
                    <Button onClick={() => { setIsEditing({ id: '', name: '' }); setNewItem(''); setNewSku(''); setNewUnifiedCode(''); }}><Plus size={16} /> Novo Modelo</Button>
                </div>

                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-500 border-b border-slate-200 dark:border-zinc-800">
                            <tr>
                                <th className="p-3 font-medium w-28">Cód. Unificado</th>
                                <th className="p-3 font-medium">Modelo Completo</th>
                                <th className="p-3 font-medium w-32">SKU</th>
                                <th className="p-3 font-medium text-right w-24">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                            {filtered.map(m => {
                                const uCode = (m as any).unifiedCode || m.name.substring(0, 7);
                                return (
                                    <tr key={m.name} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50">
                                        <td className="p-3">
                                            <span className="inline-block bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 font-mono font-bold text-xs px-2 py-1 rounded">
                                                {uCode}
                                            </span>
                                        </td>
                                        <td className="p-3 text-slate-900 dark:text-zinc-100 font-medium">{m.name}</td>
                                        <td className="p-3 text-slate-500 dark:text-zinc-400 font-mono text-xs">{m.sku || '-'}</td>
                                        <td className="p-3 text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="secondary" onClick={() => { setIsEditing(m); setNewItem(m.name); setNewSku(m.sku || ''); setNewUnifiedCode(uCode); }}><Edit2 size={16} /></Button>
                                                <Button variant="danger" onClick={() => handleDeleteModel(m.name)}><Trash2 size={16} /></Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {isEditing !== null && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                        <Card className="w-full max-w-md">
                            <h3 className="text-lg font-bold mb-1 text-slate-900 dark:text-white">
                                {isEditing.name ? 'Editar Modelo' : 'Novo Modelo'}
                            </h3>
                            <p className="text-xs text-slate-400 mb-4">O Código Unificado é auto-gerado pelos 7 primeiros chars — mas pode ser editado manualmente.</p>
                            <div className="space-y-3">
                                <div>
                                    <Input
                                        label="Código Unificado (7 chars)"
                                        value={newUnifiedCode}
                                        onChange={e => setNewUnifiedCode(e.target.value.substring(0, 12))}
                                        placeholder="Auto (ex: SM-X400)"
                                    />
                                </div>
                                <Input
                                    label="Nome Completo do Modelo"
                                    value={newItem}
                                    onChange={e => {
                                        setNewItem(e.target.value);
                                        // Auto-preenche unifiedCode só se o campo estiver vazio (não editado)
                                        if (!newUnifiedCode || newUnifiedCode === (isEditing?.name || '').substring(0, 7)) {
                                            setNewUnifiedCode(e.target.value.substring(0, 7));
                                        }
                                    }}
                                />
                                <Input label="SKU (Opcional)" value={newSku} onChange={e => setNewSku(e.target.value)} />
                                <div className="flex gap-2 justify-end mt-4">
                                    <Button variant="outline" onClick={() => { setIsEditing(null); setNewUnifiedCode(''); }}>Cancelar</Button>
                                    <Button onClick={handleSaveModel}><Save size={16} /> Salvar</Button>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        );
    };

    const renderStations = () => (
        <div className="space-y-4">
            <div className="flex gap-2">
                <Input placeholder="Nome do Posto" value={newItem} onChange={e => setNewItem(e.target.value)} />
                <Button onClick={handleSaveStation}><Plus size={16} /> Adicionar</Button>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                {stations.map(s => (
                    <div key={s} className="p-4 border-b border-slate-200 dark:border-zinc-800 flex justify-between items-center last:border-0">
                        <span className="text-slate-900 dark:text-zinc-100 font-medium">{s}</span>
                        <Button variant="danger" onClick={() => handleDeleteStation(s)}><Trash2 size={16} /></Button>
                    </div>
                ))}
            </div>
        </div>
    );

    const handleSaveLayoutStation = async () => {
        if (!selectedLayoutModel || !newLayoutStationName || !newLayoutPeopleNeeded) return;
        const exists = layoutStations.some(s => s.modelName === selectedLayoutModel && s.name === newLayoutStationName);
        if (exists) {
            if (!window.confirm('Este posto já existe neste modelo. Deseja atualizar/sobrescrever?')) return;
            // Upsert / or simply replace, but here backend does append. Let's just alert since exact requirement asks for update.
            // If the user wants to upsert, we might need a specific edit/update API, or we rely on the backend.
            // Since we implemented editLayoutWorkstation, we should check if they want to edit.
            const existingStation = layoutStations.find(s => s.modelName === selectedLayoutModel && s.name === newLayoutStationName);
            if (existingStation) {
                await editLayoutWorkstation(existingStation.id, newLayoutStationName, selectedLayoutModel, existingStation.order, parseInt(newLayoutPeopleNeeded));
                setNewLayoutStationName('');
                setNewLayoutPeopleNeeded('');
                loadData();
                return;
            }
        }
        await addLayoutWorkstation(newLayoutStationName, selectedLayoutModel, parseInt(newLayoutPeopleNeeded));
        setNewLayoutStationName('');
        setNewLayoutPeopleNeeded('');
        loadData();
    };

    const handleEditLayoutStationSave = async (id: number) => {
        await editLayoutWorkstation(id, editStationName, selectedLayoutModel, editStationOrder, parseInt(editStationPeople));
        setEditingStationId(null);
        loadData();
    };

    const handleDeleteLayoutStation = async (id: number) => {
        if (window.confirm('Confirmar exclusão deste posto do layout?')) {
            await deleteLayoutWorkstation(id);
            loadData();
        }
    };

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

                const parsedStations: any[] = [];
                let skipEmpty = false;

                data.forEach((row: any, index: number) => {
                    const getCol = (possibleCols: string[]) => {
                        const rowKeys = Object.keys(row);
                        for (const pk of possibleCols) {
                            const foundKey = rowKeys.find(k => k.trim().toLowerCase() === pk.toLowerCase());
                            if (foundKey) return row[foundKey];
                        }
                        return undefined;
                    };

                    const rawModel = getCol(['A1', 'modelo', 'modelname', 'model', 'modelName']);
                    if (!rawModel) return;

                    const rawOrder = getCol(['B1', 'Nposto', 'nposto', 'order', 'ordem']);
                    const rawName = getCol(['C1', 'postos', 'name', 'posto', 'nome']);
                    const rawQty = getCol(['D1', 'qty pessoas', 'peopleneeded', 'qty', 'pessoas', 'quantidade']);

                    if (!rawName) return;

                    const unified = unifiedModels.find(m => (m as any).unifiedCode?.toLowerCase() === String(rawModel).trim().toLowerCase() || m.name.toLowerCase() === String(rawModel).trim().toLowerCase());
                    const finalModelName = unified ? unified.name : String(rawModel).trim();

                    parsedStations.push({
                        modelName: finalModelName,
                        order: String(rawOrder || '').trim(),
                        name: String(rawName).trim(),
                        peopleNeeded: parseInt(String(rawQty || '1').trim()) || 1
                    });
                });

                if (parsedStations.length > 0) {
                    const uniqueModelsInUpload = [...new Set(parsedStations.map(p => p.modelName))];
                    const existingInDb = uniqueModelsInUpload.some(m => layoutStations.some(s => s.modelName === m));
                    let proceed = true;
                    if (existingInDb) {
                        proceed = window.confirm('Atenção: Alguns modelos neste arquivo já possuem postos cadastrados. Ao importar, os postos antigos destes modelos serão substituídos/atualizados. Deseja prosseguir sem gerar duplicidade?');
                    } else {
                        proceed = window.confirm(`Deseja importar ${parsedStations.length} postos?`);
                    }
                    if (proceed) {
                        await saveLayoutWorkstationsBulk(parsedStations);
                        alert('Importação concluída com sucesso!');
                        loadData();
                    }
                } else {
                    alert('Nenhum dado válido encontrado.');
                }
            } catch (err) {
                console.error("Critical Import Error:", err);
                alert(`Erro ao processar arquivo.`);
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

    const generateTemplate = () => {
        const ws = XLSX.utils.json_to_sheet([{
            modelname: 'SM-X400',
            order: '1',
            name: 'Montagem 1',
            peopleneeded: 2
        }]);
        XLSX.utils.sheet_add_aoa(ws, [['modelo', 'Nposto', 'postos', 'qty pessoas']], { origin: 'A1' });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "template_layout");
        XLSX.writeFile(wb, "template_layout.xlsx");
        alert("Coloque por modelo, o numero do posto é a sequencia na linha de produção, os postos que tiverem mais de uma pessoa não precisa repetir só coloque na quantidade de pessoas o numero certo de pessoas necessárias.");
    };

    const downloadCurrentLayouts = (filterModel?: string) => {
        let exportData = layoutStations;
        if (filterModel && filterModel !== 'ALL') {
            exportData = layoutStations.filter(s => s.modelName === filterModel);
        }

        const data = exportData.map(s => ({
            modelname: s.modelName,
            order: s.order || '',
            name: s.name,
            peopleneeded: s.peopleNeeded
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.sheet_add_aoa(ws, [['modelo', 'Nposto', 'postos', 'qty pessoas']], { origin: 'A1' });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "layout_export");
        XLSX.writeFile(wb, `layout_export_${filterModel || 'ALL'}.xlsx`);
    };

    const renderStationsLayout = () => {
        const currentModelStations = layoutStations
            .filter(s => s.modelName === selectedLayoutModel)
            .sort((a, b) => {
                const orderA = parseInt(a.order || '0', 10) || 0;
                const orderB = parseInt(b.order || '0', 10) || 0;
                return orderA - orderB;
            });
        const totalPeople = currentModelStations.reduce((acc, curr) => acc + curr.peopleNeeded, 0);
        const uniqueStationNames = Array.from(new Set(layoutStations.map(s => s.name)));

        return (
            <div className="space-y-6">
                <Card className="space-y-4">
                    <h3 className="font-bold text-slate-800 dark:text-zinc-100">Cadastrar Posto</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Modelo</label>
                            <select
                                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                                value={selectedLayoutModel}
                                onChange={e => setSelectedLayoutModel(e.target.value)}
                            >
                                <option value="">Selecione...</option>
                                {unifiedModels.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-2 md:col-span-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Nome do Posto</label>
                            <input
                                list="station-names"
                                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                                value={newLayoutStationName}
                                onChange={e => setNewLayoutStationName(e.target.value)}
                                placeholder="Ex: Montagem 1"
                            />
                            <datalist id="station-names">
                                {uniqueStationNames.map(name => <option key={name} value={name} />)}
                            </datalist>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Pessoas Nesc.</label>
                            <input
                                type="number"
                                min="1"
                                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                                value={newLayoutPeopleNeeded}
                                onChange={e => setNewLayoutPeopleNeeded(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button onClick={handleSaveLayoutStation}><Plus size={16} /> Adicionar Posto</Button>
                    </div>
                </Card>

                <Card className="space-y-4">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                        <h3 className="font-bold text-slate-800 dark:text-zinc-100">Postos do Modelo: {selectedLayoutModel || 'Nenhum'}</h3>
                        <div className="flex flex-wrap gap-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".xlsx, .xls, .csv"
                                onChange={handleFileUpload}
                            />
                            <Button variant="outline" onClick={generateTemplate}><Download size={16} /> Gerar Template</Button>
                            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                                {isUploading ? 'Processando...' : <><Upload size={16} /> Importar Excel</>}
                            </Button>
                            <Button variant="secondary" onClick={() => downloadCurrentLayouts('ALL')}><List size={16} /> Baixar Todos</Button>
                            <Button variant="secondary" onClick={() => downloadCurrentLayouts(selectedLayoutModel)}><List size={16} /> Baixar Deste Modelo</Button>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-500 border-b border-slate-200 dark:border-zinc-800">
                                <tr>
                                    <th className="p-4 font-medium">Ordem</th>
                                    <th className="p-4 font-medium">Posto</th>                                    
                                    <th className="p-4 font-medium text-right">Pessoas Necessárias</th>
                                    <th className="p-4 font-medium text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                {currentModelStations.map(s => (
                                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50">
                                        <td className="p-4 text-slate-900 dark:text-zinc-100">
                                            {editingStationId === s.id ? (
                                                <input className="border p-1 rounded font-normal bg-white dark:bg-zinc-800 w-full" value={editStationName} onChange={e => setEditStationName(e.target.value)} />
                                            ) : s.name}
                                        </td>
                                        <td className="p-4 font-mono text-slate-500 text-sm">
                                            {editingStationId === s.id ? (
                                                <input className="border p-1 rounded font-normal bg-white dark:bg-zinc-800 w-16" value={editStationOrder} onChange={e => setEditStationOrder(e.target.value)} placeholder="Ord" />
                                            ) : (s.order || '-')}
                                        </td>
                                        <td className="p-4 text-right font-medium text-slate-900 dark:text-zinc-100">
                                            {editingStationId === s.id ? (
                                                <input className="border p-1 rounded font-normal bg-white dark:bg-zinc-800 w-20 text-right" type="number" value={editStationPeople} onChange={e => setEditStationPeople(e.target.value)} />
                                            ) : s.peopleNeeded}
                                        </td>
                                        <td className="p-4 text-right">
                                            {editingStationId === s.id ? (
                                                <div className="flex gap-2 justify-end">
                                                    <Button onClick={() => handleEditLayoutStationSave(s.id)}>Salvar</Button>
                                                    <Button variant="outline" onClick={() => setEditingStationId(null)}><X size={16} /></Button>
                                                </div>
                                            ) : (
                                                <div className="flex gap-2 justify-end">
                                                    <Button variant="secondary" onClick={() => { setEditingStationId(s.id); setEditStationName(s.name); setEditStationOrder(s.order || ''); setEditStationPeople(String(s.peopleNeeded)); }}><Edit2 size={16} /></Button>
                                                    <Button variant="danger" onClick={() => handleDeleteLayoutStation(s.id)}><Trash2 size={16} /></Button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 dark:bg-zinc-950">
                                <tr>
                                    <td colSpan={3} className="p-4 font-bold text-slate-900 dark:text-zinc-100 text-right">Soma Total:</td>
                                    <td className="p-4 font-bold text-slate-900 dark:text-zinc-100 text-right">{totalPeople}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Card>
            </div>
        );
    };

    const handleSearchDeactivate = () => {
        const found = allEmployees.find(e =>
            e.matricula?.includes(deactivateSearch) ||
            e.fullName?.toLowerCase().includes(deactivateSearch.toLowerCase())
        );
        if (found) setDeactivatePreview(found);
        else alert('Colaborador não encontrado.');
    };

    const handleDeactivate = async () => {
        if (!deactivatePreview) return;
        if (!window.confirm(`TEM CERTEZA QUE DESEJA DESLIGAR ${deactivatePreview.fullName}? O acesso ao sistema será bloqueado imediatamente.`)) return;
        try {
            await apiFetch(`/employees/${deactivatePreview.matricula}/deactivate`, { method: 'PUT' });
            alert('Colaborador desligado com sucesso! Acesso bloqueado.');
            setDeactivatePreview(null);
            setDeactivateSearch('');
            loadData();
        } catch (e) {
            alert('Erro ao desligar o colaborador.');
        }
    };

    const renderDesligamento = () => (
        <Card className="flex flex-col gap-4">
            <h3 className="font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                <Shield size={18} /> Processo de Desligamento
            </h3>
            <p className="text-sm text-slate-500">
                Localize o colaborador pela matrícula ou nome. Ao confirmar, o status do Employee será marcado como INATIVO e o login do usuário será bloqueado imediatamente.
            </p>
            <div className="flex gap-2 items-end">
                <div className="flex-1">
                    <input
                        className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                        placeholder="Matrícula ou Nome..."
                        value={deactivateSearch}
                        onChange={e => setDeactivateSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearchDeactivate()}
                    />
                </div>
                <Button onClick={handleSearchDeactivate}><Search size={16} /> Buscar</Button>
            </div>
            {deactivatePreview && (
                <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl flex items-center justify-between border border-red-200 dark:border-red-900/40">
                    <div className="flex flex-col gap-1">
                        <p className="font-bold text-slate-800 dark:text-zinc-100">{deactivatePreview.fullName}</p>
                        <p className="text-sm text-slate-500">Matrícula: <span className="font-mono font-bold">{deactivatePreview.matricula}</span></p>
                        <p className="text-sm text-slate-500">Função: {deactivatePreview.role}</p>
                        <p className="text-sm text-slate-500">Status Atual: <span className={`font-bold ${deactivatePreview.status === 'INATIVO' ? 'text-red-500' : 'text-emerald-500'}`}>{deactivatePreview.status || 'ATIVO'}</span></p>
                    </div>
                    <Button variant="danger" onClick={handleDeactivate}>Desligar Colaborador</Button>
                </div>
            )}
            {allEmployees.length > 0 && (
                <div className="mt-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Colaboradores Inativos</p>
                    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden text-sm max-h-64 overflow-y-auto">
                        {allEmployees.filter(e => e.status === 'INATIVO').length === 0 ? (
                            <p className="p-4 text-slate-400">Nenhum colaborador desligado.</p>
                        ) : (
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-500">
                                    <tr>
                                        <th className="p-3">Matrícula</th>
                                        <th className="p-3">Nome</th>
                                        <th className="p-3">Função</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                    {allEmployees.filter(e => e.status === 'INATIVO').map(e => (
                                        <tr key={e.matricula} className="bg-red-50/40 dark:bg-red-900/10">
                                            <td className="p-3 font-mono text-xs">{e.matricula}</td>
                                            <td className="p-3">{e.fullName}</td>
                                            <td className="p-3 text-slate-500">{e.role}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </Card>
    );

    return (
        <div className="w-full max-w-7xl mx-auto space-y-6">
            <header className="flex flex-col gap-4 mb-4 md:mb-8 pb-4 md:pb-6 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                    <h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                        <Shield className="text-cyan-500" /> Gestão Centralizada
                    </h1>
                    <Button variant="outline" onClick={onBack}><ArrowLeft size={16} /> Voltar</Button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    <Button variant={tab === 'LINES' ? 'primary' : 'secondary'} onClick={() => setTab('LINES')}><List size={16} /> Linhas</Button>
                    <Button variant={tab === 'ROLES' ? 'primary' : 'secondary'} onClick={() => setTab('ROLES')}><UserIcon size={16} /> Cargos</Button>
                    <Button variant={tab === 'MODELS' ? 'primary' : 'secondary'} onClick={() => setTab('MODELS')}><Smartphone size={16} /> Modelos & SKU</Button>
                    <Button variant={tab === 'STATIONS' ? 'primary' : 'secondary'} onClick={() => setTab('STATIONS')}><List size={16} /> Postos (Antigo)</Button>
                    <Button variant={tab === 'STATIONS_LAYOUT' ? 'primary' : 'secondary'} onClick={() => setTab('STATIONS_LAYOUT')}><List size={16} /> Postos (Layout)</Button>
                    <Button variant={tab === 'MATERIALS' ? 'primary' : 'secondary'} onClick={() => setTab('MATERIALS')}><Plus size={16} /> Itens de Scrap</Button>
                    <Button variant={tab === 'DESLIGAMENTO' ? 'primary' : 'secondary'} onClick={() => setTab('DESLIGAMENTO')}><Shield size={16} /> Desligamento</Button>
                </div>
            </header>

            {tab === 'LINES' && renderLines()}
            {tab === 'ROLES' && renderRoles()}
            {tab === 'MODELS' && renderModels()}
            {tab === 'STATIONS' && renderStations()}
            {tab === 'STATIONS_LAYOUT' && renderStationsLayout()}
            {tab === 'MATERIALS' && <MaterialsManager materials={materials} setMaterials={setMaterials} onRefresh={loadData} />}
            {tab === 'DESLIGAMENTO' && renderDesligamento()}
        </div>
    );
};
