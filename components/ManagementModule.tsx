
import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { Plus, Trash2, Edit2, Save, X, Search, Smartphone, List, User as UserIcon, Shield, ArrowLeft } from 'lucide-react';
import { ConfigItem, ConfigModel } from '../types';
import { getLines, addLine, deleteLine, getRoles, addRole, deleteRole, getStations, saveStations, getModelsFull, saveModelsFull, getLayoutWorkstations, addLayoutWorkstation } from '../services/storageService';
import { apiFetch } from '../services/networkConfig';
import { exportWorkstationsByModel } from '../services/excelService';
import { getMaterials } from '../services/materialService';
import { MaterialsManager } from './MaterialsManager';

interface ManagementModuleProps {
    onBack: () => void;
}

type Tab = 'LINES' | 'ROLES' | 'MODELS' | 'STATIONS' | 'STATIONS_LAYOUT' | 'MATERIALS';

export const ManagementModule: React.FC<ManagementModuleProps> = ({ onBack }) => {
    const [tab, setTab] = useState<Tab>('LINES');
    const [lines, setLines] = useState<ConfigItem[]>([]);
    const [roles, setRoles] = useState<ConfigItem[]>([]);
    const [models, setModels] = useState<ConfigModel[]>([]);
    const [stations, setStations] = useState<string[]>([]);
    const [materials, setMaterials] = useState<any[]>([]);

    const [layoutStations, setLayoutStations] = useState<any[]>([]);
    const [selectedLayoutModel, setSelectedLayoutModel] = useState<string>('');
    const [newLayoutStationName, setNewLayoutStationName] = useState('');
    const [newLayoutPeopleNeeded, setNewLayoutPeopleNeeded] = useState('');

    const [newItem, setNewItem] = useState('');
    const [newSku, setNewSku] = useState('');
    const [isEditing, setIsEditing] = useState<ConfigModel | null>(null);
    const [search, setSearch] = useState('');

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
                if (!selectedLayoutModel && _models.length > 0) {
                    setSelectedLayoutModel(_models[0].name);
                }
            }
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

        let updatedModels = [...models];
        if (isEditing && isEditing.name) {
            updatedModels = updatedModels.map(m => m.name === isEditing.name ? { ...m, name: newItem, sku: newSku } : m);
        } else {
            if (updatedModels.find(m => m.name === newItem)) return alert('Modelo já existe');
            updatedModels.push({ id: newItem, name: newItem, sku: newSku });
        }

        await saveModelsFull(updatedModels);
        setNewItem('');
        setNewSku('');
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
        const filtered = models.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || (m.sku || '').toLowerCase().includes(search.toLowerCase()));

        return (
            <div className="space-y-4">
                <div className="flex gap-2">
                    <Input placeholder="Buscar modelo ou SKU..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search size={16} />} />
                    <Button onClick={() => { setIsEditing({ id: '', name: '' }); setNewItem(''); setNewSku(''); }}><Plus size={16} /> Novo Modelo</Button>
                </div>

                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-500 border-b border-slate-200 dark:border-zinc-800">
                            <tr>
                                <th className="p-4 font-medium">Modelo</th>
                                <th className="p-4 font-medium">SKU</th>
                                <th className="p-4 font-medium text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                            {filtered.map(m => (
                                <tr key={m.name} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50">
                                    <td className="p-4 text-slate-900 dark:text-zinc-100 font-medium">{m.name}</td>
                                    <td className="p-4 text-slate-500 dark:text-zinc-400 font-mono">{m.sku || '-'}</td>
                                    <td className="p-4 text-right flex justify-end gap-2">
                                        <Button variant="secondary" onClick={() => { setIsEditing(m); setNewItem(m.name); setNewSku(m.sku || ''); }}><Edit2 size={16} /></Button>
                                        <Button variant="danger" onClick={() => handleDeleteModel(m.name)}><Trash2 size={16} /></Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {isEditing !== null && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                        <Card className="w-full max-w-md">
                            <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">
                                {isEditing.name ? 'Editar Modelo' : 'Novo Modelo'}
                            </h3>
                            <div className="space-y-4">
                                <Input label="Nome do Modelo" value={newItem} onChange={e => setNewItem(e.target.value)} />
                                <Input label="SKU (Opcional)" value={newSku} onChange={e => setNewSku(e.target.value)} />
                                <div className="flex gap-2 justify-end mt-4">
                                    <Button variant="outline" onClick={() => setIsEditing(null)}>Cancelar</Button>
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
        await addLayoutWorkstation(newLayoutStationName, selectedLayoutModel, parseInt(newLayoutPeopleNeeded));
        setNewLayoutStationName('');
        setNewLayoutPeopleNeeded('');
        loadData();
    };

    const renderStationsLayout = () => {
        const currentModelStations = layoutStations.filter(s => s.modelName === selectedLayoutModel);
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
                                {models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
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
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 dark:text-zinc-100">Postos do Modelo: {selectedLayoutModel || 'Nenhum'}</h3>
                        <Button variant="secondary" onClick={() => exportWorkstationsByModel(currentModelStations)}><List size={16} /> Exportar Excel</Button>
                    </div>

                    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-500 border-b border-slate-200 dark:border-zinc-800">
                                <tr>
                                    <th className="p-4 font-medium">Posto</th>
                                    <th className="p-4 font-medium text-right">Pessoas Necessárias</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                {currentModelStations.map(s => (
                                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50">
                                        <td className="p-4 text-slate-900 dark:text-zinc-100">{s.name}</td>
                                        <td className="p-4 text-right font-medium text-slate-900 dark:text-zinc-100">{s.peopleNeeded}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 dark:bg-zinc-950">
                                <tr>
                                    <td className="p-4 font-bold text-slate-900 dark:text-zinc-100 text-right">Soma Total:</td>
                                    <td className="p-4 font-bold text-slate-900 dark:text-zinc-100 text-right">{totalPeople}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Card>
            </div>
        );
    };

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
                </div>
            </header>

            {tab === 'LINES' && renderLines()}
            {tab === 'ROLES' && renderRoles()}
            {tab === 'MODELS' && renderModels()}
            {tab === 'STATIONS' && renderStations()}
            {tab === 'STATIONS_LAYOUT' && renderStationsLayout()}
            {tab === 'MATERIALS' && <MaterialsManager materials={materials} setMaterials={setMaterials} onRefresh={loadData} />}
        </div>
    );
};
