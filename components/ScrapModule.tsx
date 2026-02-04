import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    LayoutDashboard, AlertTriangle, FileText, CheckCircle2,
    ArrowLeft, Save, Search, Filter, Download, Plus, X,
    History, BarChart3, Settings, Upload, Trash2, Shield
} from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { User, ScrapData, Material } from '../types';
import {
    getModels, getLines, getStations,
    getManausDate, getWeekNumber
} from '../services/storageService';
import {
    getScraps, saveScrap, updateScrap, getMaterials, saveMaterials,
    SCRAP_ITEMS, SCRAP_STATUS, CAUSA_RAIZ_OPTIONS
} from '../services/scrapService';
import * as authService from '../services/authService';
import * as XLSX from 'xlsx';

interface ScrapModuleProps {
    currentUser: User;
    onBack: () => void;
    initialTab?: Tab;
}

type Tab = 'FORM' | 'PENDING' | 'HISTORY' | 'OPERATIONAL' | 'MANAGEMENT_ADVANCED';

export const ScrapModule: React.FC<ScrapModuleProps> = ({ currentUser, onBack, initialTab }) => {
    const [activeTab, setActiveTab] = useState<Tab>(initialTab || 'FORM');
    const [scraps, setScraps] = useState<ScrapData[]>([]);

    // Config Data
    const [users, setUsers] = useState<User[]>([]);
    const [models, setModels] = useState<string[]>([]);
    const [stations, setStations] = useState<string[]>([]);
    const [lines, setLines] = useState<string[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);

    useEffect(() => {
        if (initialTab) setActiveTab(initialTab);
    }, [initialTab]);

    // Load Initial Data
    const loadData = async () => {
        const u = await authService.getAllUsers();
        setUsers(u);
        const m = await getModels();
        setModels(m);
        const s = await getStations();
        setStations(s);
        const l = await getLines();
        setLines(l.map(x => x.name));

        const scrapData = await getScraps();
        setScraps(scrapData);

        const mats = await getMaterials();
        setMaterials(mats);
    };

    useEffect(() => {
        loadData();
    }, []);

    const refreshScraps = async () => {
        const s = await getScraps();
        setScraps(s);
    }

    const isLeader = currentUser.role.toLowerCase().includes('líder') || currentUser.role.toLowerCase().includes('supervisor');
    const isAdmin = currentUser.isAdmin || currentUser.role.toLowerCase().includes('admin') || currentUser.role.toLowerCase().includes('gerente');

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 space-y-6">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <Button variant="ghost" onClick={onBack} className="rounded-full w-10 h-10 p-0 flex items-center justify-center">
                        <ArrowLeft size={20} />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
                            Gestão de Scrap
                        </h1>
                        <p className="text-zinc-400 text-sm">Controle de perdas e refugos</p>
                    </div>
                </div>

                <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 custom-scrollbar">
                    <Button variant={activeTab === 'FORM' ? 'primary' : 'ghost'} onClick={() => setActiveTab('FORM')} size="sm">
                        <Plus size={16} /> Lançar
                    </Button>

                    <Button variant={activeTab === 'PENDING' ? 'primary' : 'ghost'} onClick={() => setActiveTab('PENDING')} size="sm">
                        <AlertTriangle size={16} /> Pendências
                    </Button>

                    <Button variant={activeTab === 'HISTORY' ? 'primary' : 'ghost'} onClick={() => setActiveTab('HISTORY')} size="sm">
                        <History size={16} /> Histórico (Pessoal)
                    </Button>

                    <Button variant={activeTab === 'OPERATIONAL' ? 'primary' : 'ghost'} onClick={() => setActiveTab('OPERATIONAL')} size="sm">
                        <BarChart3 size={16} /> Operacional
                    </Button>

                    {(isAdmin || currentUser.role.includes('Supervisor') || currentUser.role.includes('Coordenador') || currentUser.role.includes('Diretor')) && (
                        <Button variant={activeTab === 'MANAGEMENT_ADVANCED' ? 'primary' : 'ghost'} onClick={() => setActiveTab('MANAGEMENT_ADVANCED')} size="sm">
                            <Shield size={16} /> Gestão Avançada
                        </Button>
                    )}
                </div>
            </div>

            {/* CONTENT */}
            <div className="mt-6">
                {activeTab === 'FORM' && (
                    <ScrapForm
                        users={users}
                        models={models}
                        stations={stations}
                        lines={lines}
                        materials={materials}
                        onSuccess={refreshScraps}
                        currentUser={currentUser}
                    />
                )}
                {activeTab === 'PENDING' && (
                    <ScrapPending
                        scraps={scraps}
                        currentUser={currentUser}
                        onUpdate={refreshScraps}
                        users={users}
                    />
                )}
                {activeTab === 'HISTORY' && (
                    <ScrapHistory scraps={scraps} currentUser={currentUser} />
                )}
                {activeTab === 'OPERATIONAL' && (
                    <ScrapOperational
                        scraps={scraps}
                        users={users}
                        lines={lines}
                        models={models}
                    />
                )}
                {activeTab === 'MANAGEMENT_ADVANCED' && (
                    <ScrapManagementAdvanced scraps={scraps} />
                )}
            </div>
        </div>
    );
};

// --- SUB COMPONENTS ---

const ScrapForm = ({ users, models, stations, lines, materials, onSuccess, currentUser }: any) => {
    const initialState = {
        date: getManausDate().toISOString().split('T')[0],
        week: getWeekNumber(getManausDate()),
        shift: '1',
        qty: 1,
        status: '',
        item: '',
        rootCause: '',
        leaderName: '',
        unitValue: 0,
        totalValue: 0,
        line: '',
        pqc: '',
        usedModel: '',
        code: '',
        description: '',
        responsible: '',
        reason: '',
        station: ''
    };

    const [formData, setFormData] = useState<Partial<ScrapData>>(initialState);

    // Derived Form Values
    useEffect(() => {
        if (formData.date) {
            const d = new Date(formData.date);
            const utcDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
            setFormData(prev => ({ ...prev, week: getWeekNumber(utcDate) }));
        }
    }, [formData.date]);

    useEffect(() => {
        const total = (formData.qty || 0) * (formData.unitValue || 0);
        const totalRounded = Math.ceil(total * 100) / 100;
        setFormData(prev => ({ ...prev, totalValue: totalRounded }));
    }, [formData.qty, formData.unitValue]);

    const handleLeaderChange = (leaderName: string) => {
        const found = users.find((u: User) => u.name === leaderName);
        setFormData(prev => ({
            ...prev,
            leaderName,
            shift: found?.shift || '1' // Auto-fill shift
        }));
    };

    const handleCodeChange = (code: string) => {
        const found = materials.find((m: Material) => m.code === code);
        setFormData(prev => ({
            ...prev,
            code,
            description: found ? found.description : '',
            unitValue: found ? found.price : 0,
            usedModel: found ? found.model : prev.usedModel
        }));
    };

    const handleSubmit = async () => {
        if (!formData.leaderName || !formData.model || !formData.item || !formData.reason || !formData.line || !formData.pqc) {
            alert("Preencha todos os campos obrigatórios (Líder, Linha, PQC, Modelo, Item, Motivo)!");
            return;
        }

        const now = getManausDate();
        const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        const payload: ScrapData = {
            ...formData as ScrapData,
            userId: currentUser.matricula,
            time: time,
            status: formData.status!,
            item: formData.item!,
            rootCause: formData.rootCause!,
            station: formData.station || 'ND',
            responsible: formData.responsible || currentUser.name
        };

        await saveScrap(payload);
        alert("Scrap lançado com sucesso!");
        setFormData(initialState);
        onSuccess();
    };

    const pqcUsers = users.filter((u: User) => (u.role || '').toUpperCase().includes('PQC'));

    return (
        <Card className="max-w-6xl mx-auto bg-zinc-900/50 border-zinc-800">
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Input type="date" label="Data" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                    <Input label="Semana" value={formData.week} readOnly className="opacity-50" />
                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase">Líder</label>
                        <select
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-zinc-100"
                            value={formData.leaderName || ''}
                            onChange={e => handleLeaderChange(e.target.value)}
                        >
                            <option value="" disabled>Selecione...</option>
                            {users.filter((u: User) => u.role.includes('Líder') || u.role.includes('Supervisor')).map((u: User) => (
                                <option key={u.matricula} value={u.name}>{u.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase">Linha</label>
                        <select
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-zinc-100"
                            value={formData.line || ''}
                            onChange={e => setFormData({ ...formData, line: e.target.value })}
                        >
                            <option value="" disabled>Selecione...</option>
                            {lines.map((l: string) => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase">PQC</label>
                        <select
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-zinc-100"
                            value={formData.pqc || ''}
                            onChange={e => setFormData({ ...formData, pqc: e.target.value })}
                        >
                            <option value="" disabled>Selecione...</option>
                            {pqcUsers.map((u: User) => <option key={u.matricula} value={u.name}>{u.name}</option>)}
                        </select>
                    </div>
                    <Input label="Turno" value={formData.shift} onChange={e => setFormData({ ...formData, shift: e.target.value })} disabled={!!formData.leaderName} className={!!formData.leaderName ? "opacity-50" : ""} />
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase">Modelo</label>
                        <select
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-zinc-100"
                            value={formData.model || ''}
                            onChange={e => setFormData({ ...formData, model: e.target.value })}
                        >
                            <option value="" disabled>Selecione...</option>
                            {models.map((m: string) => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                </div>

                <hr className="border-zinc-800" />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase">Cód. Matéria Prima</label>
                        <div className="relative">
                            <input
                                list="material-codes"
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-zinc-100"
                                value={formData.code || ''}
                                onChange={e => handleCodeChange(e.target.value)}
                                placeholder="Digite o código..."
                            />
                            <datalist id="material-codes">
                                {materials.map((m: Material) => <option key={m.code} value={m.code}>{m.description}</option>)}
                            </datalist>
                        </div>
                    </div>
                    <Input label="Modelo Usado" value={formData.usedModel} readOnly className="opacity-50" placeholder="Automático pelo Código" />
                    <div className="lg:col-span-2">
                        <Input label="Descrição do Material" value={formData.description} readOnly className="opacity-50" />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Input type="number" label="Quantidade" value={formData.qty} onChange={e => setFormData({ ...formData, qty: Number(e.target.value) })} />
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase">Item (Categoria)</label>
                        <input
                            list="items-list"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-zinc-100"
                            value={formData.item || ''}
                            onChange={e => setFormData({ ...formData, item: e.target.value })}
                            placeholder="Selecione..."
                        />
                        <datalist id="items-list">
                            {SCRAP_ITEMS.map(i => <option key={i} value={i} />)}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase">Status</label>
                        <input
                            list="status-list"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-zinc-100"
                            value={formData.status || ''}
                            onChange={e => setFormData({ ...formData, status: e.target.value })}
                            placeholder="Selecione..."
                        />
                        <datalist id="status-list">
                            {SCRAP_STATUS.map(i => <option key={i} value={i} />)}
                        </datalist>
                    </div>
                    <Input label="Valor UN (R$)" value={formData.unitValue?.toFixed(2)} readOnly className="opacity-50" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-red-900/10 p-4 rounded-xl border border-red-900/30 flex flex-col justify-center">
                        <label className="text-xs font-bold text-red-400 uppercase">Valor Total (R$)</label>
                        <span className="text-2xl font-bold text-red-500">{formData.totalValue?.toFixed(2)}</span>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase">Causa Raiz</label>
                        <select
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-zinc-100"
                            value={formData.rootCause || ''}
                            onChange={e => setFormData({ ...formData, rootCause: e.target.value })}
                        >
                            <option value="" disabled>Selecione...</option>
                            {CAUSA_RAIZ_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase">Estação</label>
                        <select
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-zinc-100"
                            value={formData.station || ''}
                            onChange={e => setFormData({ ...formData, station: e.target.value })}
                        >
                            <option value="" disabled>Selecione...</option>
                            {stations.map((m: string) => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Input label="Responsável" value={formData.responsible} onChange={e => setFormData({ ...formData, responsible: e.target.value })} />
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase">Motivo Detalhado</label>
                        <textarea
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-600 min-h-[80px] text-zinc-100 placeholder-zinc-600"
                            value={formData.reason || ''}
                            onChange={e => setFormData({ ...formData, reason: e.target.value })}
                            placeholder="Descreva..."
                        />
                    </div>
                </div>

                <div className="pt-4 flex justify-end">
                    <Button onClick={handleSubmit} size="lg" className="w-full md:w-auto">
                        <Save size={18} /> Salvar Scrap
                    </Button>
                </div>
            </div>
        </Card>
    );
};

const ScrapPending = ({ scraps, currentUser, onUpdate, users }: any) => {
    const pending = scraps.filter((s: ScrapData) => {
        const isRelated = s.leaderName === currentUser.name || currentUser.isAdmin || currentUser.role.includes('Admin') || currentUser.role.includes('Supervisor') || currentUser.role.includes('Gerente');
        const noCountermeasure = !s.countermeasure || s.countermeasure.trim() === '';
        return isRelated && noCountermeasure;
    });

    const [selected, setSelected] = useState<ScrapData | null>(null);
    const [cm, setCm] = useState('');
    const [reason, setReason] = useState('');

    const openModal = (s: ScrapData) => {
        setSelected(s);
        setCm(s.countermeasure || '');
        setReason(s.reason || '');
    };

    const handleSave = async () => {
        if (selected && selected.id) {
            if (!cm.trim()) { alert("Contra Medida é obrigatória."); return; }
            await updateScrap(selected.id, { countermeasure: cm, reason: reason });
            await onUpdate();
            setSelected(null);
        }
    }

    return (
        <div className="space-y-4">
            {pending.length === 0 ? (
                <div className="p-12 text-center text-zinc-500 bg-zinc-900/30 rounded-xl border border-dashed border-zinc-800">
                    <CheckCircle2 size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Nenhuma pendência encontrada!</p>
                </div>
            ) : (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 text-sm overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-zinc-950 text-zinc-400 font-medium">
                            <tr>
                                <th className="p-4">Data</th>
                                <th className="p-4">Líder</th>
                                <th className="p-4">Turno</th>
                                <th className="p-4">Modelo</th>
                                <th className="p-4">Qtd</th>
                                <th className="p-4">Valor</th>
                                <th className="p-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                            {pending.map((s: ScrapData) => (
                                <tr key={s.id} className="hover:bg-zinc-800/50 transition-colors">
                                    <td className="p-4">{new Date(s.date).toLocaleDateString()}</td>
                                    <td className="p-4 text-white font-medium">{s.leaderName}</td>
                                    <td className="p-4">{s.shift}</td>
                                    <td className="p-4 text-zinc-300">{s.model}</td>
                                    <td className="p-4">{s.qty}</td>
                                    <td className="p-4 font-mono text-red-400">R$ {s.totalValue?.toFixed(2)}</td>
                                    <td className="p-4 text-right">
                                        <Button size="sm" onClick={() => openModal(s)} variant="ghost"> <AlertTriangle size={14} className="text-yellow-500 mr-2" /> Contra Medida</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {selected && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <Card className="max-w-6xl w-full max-h-[90vh] overflow-y-auto bg-zinc-900 border-zinc-700">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-xl">Resolver Pendência de Scrap</h3>
                            <button onClick={() => setSelected(null)}><X size={24} /></button>
                        </div>
                        <div className="space-y-6 opacity-80 pointer-events-none">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <Input label="Data" value={selected.date} readOnly />
                                <Input label="Semana" value={selected.week} readOnly />
                                <div className="md:col-span-2"><Input label="Líder" value={selected.leaderName} readOnly /></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <Input label="Linha" value={selected.line} readOnly />
                                <Input label="PQC" value={selected.pqc} readOnly />
                                <Input label="Turno" value={selected.shift} readOnly />
                                <Input label="Modelo" value={selected.model} readOnly />
                            </div>
                            <hr className="border-zinc-800" />
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <Input label="Cód. Matéria Prima" value={selected.code} readOnly />
                                <Input label="Modelo Usado" value={selected.usedModel} readOnly />
                                <div className="lg:col-span-2"><Input label="Descrição" value={selected.description} readOnly /></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <Input label="Quantidade" value={selected.qty} readOnly />
                                <Input label="Item (Categoria)" value={selected.item} readOnly />
                                <Input label="Status" value={selected.status} readOnly />
                                <Input label="Valor UN" value={selected.unitValue?.toFixed(2)} readOnly />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-red-900/10 p-4 rounded-xl border border-red-900/30 flex flex-col justify-center">
                                    <label className="text-xs font-bold text-red-400 uppercase">Valor Total (R$)</label>
                                    <span className="text-2xl font-bold text-red-500">{selected.totalValue?.toFixed(2)}</span>
                                </div>
                                <Input label="Causa Raiz" value={selected.rootCause} readOnly />
                                <Input label="Estação" value={selected.station} readOnly />
                            </div>
                        </div>
                        <div className="mt-8 pt-6 border-t border-zinc-700 grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase">Motivo Detalhado (Ajuste Opcional)</label>
                                <textarea
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-600 min-h-[120px] text-zinc-100"
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-green-400 mb-1.5 uppercase font-bold">Contra Medida (Obrigatório)</label>
                                <textarea
                                    className="w-full bg-zinc-950 border-2 border-green-900/50 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-green-500 min-h-[120px] text-zinc-100"
                                    value={cm}
                                    onChange={e => setCm(e.target.value)}
                                    placeholder="Descreva a ação tomada..."
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="flex justify-end pt-6">
                            <Button onClick={handleSave} size="lg"><Save size={18} /> Salvar Resolução</Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}

const ScrapHistory = ({ scraps, currentUser }: any) => {
    const [filters, setFilters] = useState({
        period: 'ALL', // ALL, DAY, WEEK, MONTH, YEAR
        specificDate: '',
        specificWeek: '',
        specificMonth: '',
        specificYear: ''
    });

    const [selected, setSelected] = useState<ScrapData | null>(null);

    const filtered = useMemo(() => {
        let res = scraps.filter((s: ScrapData) => s.userId === currentUser.matricula || s.leaderName === currentUser.name);

        if (filters.period !== 'ALL') {
            if (filters.period === 'DAY' && filters.specificDate) {
                res = res.filter((s: ScrapData) => s.date === filters.specificDate);
            }
            else if (filters.period === 'WEEK' && filters.specificWeek) {
                const [y, w] = filters.specificWeek.split('-W').map(Number);
                res = res.filter((s: ScrapData) => {
                    const sd = new Date(s.date);
                    const utcDate = new Date(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate());
                    const sw = getWeekNumber(utcDate);
                    return sw === w && sd.getFullYear() === y;
                });
            }
            else if (filters.period === 'MONTH' && filters.specificMonth) {
                res = res.filter((s: ScrapData) => s.date.startsWith(filters.specificMonth));
            }
            else if (filters.period === 'YEAR' && filters.specificYear) {
                res = res.filter((s: ScrapData) => s.date.startsWith(filters.specificYear));
            }
        }
        return res;
    }, [scraps, currentUser, filters]);

    const total = filtered.reduce((acc: number, curr: ScrapData) => acc + (curr.totalValue || 0), 0);
    const pendingCount = filtered.filter((s: ScrapData) => !s.countermeasure).length;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <Card className="bg-indigo-900/20 border-indigo-500/30">
                    <h3 className="text-indigo-400 text-xs font-bold uppercase">Meu Total (Período)</h3>
                    <p className="text-3xl font-bold mt-2">R$ {total.toFixed(2)}</p>
                </Card>
                <Card className="bg-orange-900/20 border-orange-500/30">
                    <h3 className="text-orange-400 text-xs font-bold uppercase">Minhas Pendências</h3>
                    <p className="text-3xl font-bold mt-2">{pendingCount}</p>
                </Card>
            </div>

            <Card>
                <div className="flex gap-4 items-end flex-wrap">
                    <div className="min-w-[150px]">
                        <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Período</label>
                        <select className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" value={filters.period} onChange={e => setFilters({ ...filters, period: e.target.value })}>
                            <option value="ALL">Todo o Histórico</option>
                            <option value="DAY">Dia Específico</option>
                            <option value="WEEK">Semana Específica</option>
                            <option value="MONTH">Mês Específico</option>
                            <option value="YEAR">Ano Específico</option>
                        </select>
                    </div>
                    {filters.period === 'DAY' && <Input type="date" value={filters.specificDate} onChange={e => setFilters({ ...filters, specificDate: e.target.value })} />}
                    {filters.period === 'WEEK' && <Input type="week" value={filters.specificWeek} onChange={e => setFilters({ ...filters, specificWeek: e.target.value })} />}
                    {filters.period === 'MONTH' && <Input type="month" value={filters.specificMonth} onChange={e => setFilters({ ...filters, specificMonth: e.target.value })} />}
                    {filters.period === 'YEAR' && <Input type="number" placeholder="Ano (Ex: 2024)" value={filters.specificYear} onChange={e => setFilters({ ...filters, specificYear: e.target.value })} />}
                </div>
            </Card>

            <div>
                <div className="grid grid-cols-1 gap-2">
                    {filtered.length === 0 && <p className="text-zinc-500 text-center py-8">Nenhum registro encontrado no período.</p>}
                    {filtered.map((s: ScrapData) => (
                        <div key={s.id} onClick={() => setSelected(s)} className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex justify-between items-center cursor-pointer hover:bg-zinc-800 transition-colors">
                            <div>
                                <p className="font-bold text-zinc-200">{s.item} <span className="text-zinc-500 font-normal">| {s.model}</span></p>
                                <p className="text-xs text-zinc-500">{new Date(s.date).toLocaleDateString()} • {s.leaderName}</p>
                            </div>
                            <div className="text-right">
                                <p className={`font-bold ${!s.countermeasure ? 'text-red-400' : 'text-green-400'}`}>R$ {s.totalValue?.toFixed(2)}</p>
                                <span className="text-[10px] uppercase text-zinc-600">{s.status}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {selected && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <Card className="max-w-2xl w-full bg-zinc-900 border-zinc-700">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-xl">Detalhes do Scrap</h3>
                            <button onClick={() => setSelected(null)}><X size={24} /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="bg-zinc-950 p-3 rounded"><strong>Data:</strong> {new Date(selected.date).toLocaleDateString()}</div>
                            <div className="bg-zinc-950 p-3 rounded"><strong>Horário:</strong> {selected.time}</div>
                            <div className="bg-zinc-950 p-3 rounded"><strong>Líder:</strong> {selected.leaderName}</div>
                            <div className="bg-zinc-950 p-3 rounded"><strong>Quem Registrou:</strong> {selected.responsible || selected.userId}</div>
                            <div className="bg-zinc-950 p-3 rounded"><strong>Modelo:</strong> {selected.model}</div>
                            <div className="bg-zinc-950 p-3 rounded"><strong>Linha:</strong> {selected.line}</div>
                            <div className="bg-zinc-950 p-3 rounded"><strong>Item:</strong> {selected.item}</div>
                            <div className="bg-zinc-950 p-3 rounded"><strong>Valor:</strong> R$ {selected.totalValue?.toFixed(2)}</div>
                            <div className="col-span-2 bg-zinc-950 p-3 rounded">
                                <strong>Motivo:</strong>
                                <p className="mt-1 text-zinc-400">{selected.reason}</p>
                            </div>
                            <div className="col-span-2 bg-zinc-950 p-3 rounded border border-green-900/30">
                                <strong className="text-green-400">Contra Medida:</strong>
                                <p className="mt-1 text-zinc-300">{selected.countermeasure || 'Pendente'}</p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

const ScrapOperational = ({ scraps, users, lines, models }: any) => {
    const [filters, setFilters] = useState({
        leader: '',
        line: '',
        model: '',
        period: 'MONTH', // DAY, WEEK, MONTH, YEAR, ALL
        specificDate: '', // For DAY
        specificWeek: '', // For WEEK
        specificMonth: '', // For MONTH
        specificYear: '', // For YEAR
        shift: ''
    });

    const [selected, setSelected] = useState<ScrapData | null>(null);

    const filtered = useMemo(() => {
        let res = [...scraps];
        if (filters.leader) res = res.filter(s => s.leaderName === filters.leader);
        if (filters.line) res = res.filter(s => s.line === filters.line);
        if (filters.model) res = res.filter(s => s.model === filters.model);
        if (filters.shift) res = res.filter(s => s.shift === filters.shift);

        const now = new Date();
        const d = new Date(now);

        if (filters.period !== 'ALL') {
            if (filters.period === 'DAY' && filters.specificDate) {
                res = res.filter(s => s.date === filters.specificDate);
            }
            else if (filters.period === 'WEEK' && filters.specificWeek) {
                const [y, w] = filters.specificWeek.split('-W').map(Number);
                res = res.filter(s => {
                    const sd = new Date(s.date);
                    const utcDate = new Date(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate());
                    const sw = getWeekNumber(utcDate);
                    return sw === w && sd.getFullYear() === y; // Simple year check (approx)
                });
            }
            else if (filters.period === 'MONTH' && filters.specificMonth) {
                res = res.filter(s => s.date.startsWith(filters.specificMonth));
            }
            else if (filters.period === 'YEAR' && filters.specificYear) {
                res = res.filter(s => s.date.startsWith(filters.specificYear));
            }
            // Fallback default
            else if (filters.period === 'MONTH' && !filters.specificMonth) {
                const m = (d.getMonth() + 1).toString().padStart(2, '0');
                const y = d.getFullYear();
                res = res.filter(s => s.date.startsWith(`${y}-${m}`));
            }
        }
        return res;
    }, [scraps, filters]);

    const leadersOnly = users.filter((u: User) => {
        const r = (u.role || '').toLowerCase();
        return r.includes('líder') || r.includes('coordenador') || r.includes('supervisor');
    });

    const downloadExcel = () => {
        const data = filtered.map(s => ({
            Data: s.date,
            Hora: s.time,
            Semana: s.week,
            Turno: s.shift,
            Líder: s.leaderName,
            Linha: s.line,
            Modelo: s.model,
            Item: s.item,
            Qtd: s.qty,
            Valor: s.totalValue,
            Motivo: s.reason,
            ContraMedida: s.countermeasure
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Scrap Operacional");
        XLSX.writeFile(wb, "Relatorio_Scrap.xlsx");
    };

    return (
        <div className="space-y-6">
            <Card>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <select className="bg-zinc-950 border border-zinc-800 p-2 rounded text-sm text-zinc-300" onChange={e => setFilters({ ...filters, leader: e.target.value })} value={filters.leader}>
                        <option value="">Todos Líderes</option>
                        {leadersOnly.map((u: User) => <option key={u.matricula} value={u.name}>{u.name}</option>)}
                    </select>
                    <select className="bg-zinc-950 border border-zinc-800 p-2 rounded text-sm text-zinc-300" onChange={e => setFilters({ ...filters, line: e.target.value })} value={filters.line}>
                        <option value="">Todas Linhas</option>
                        {lines.map((l: string) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <select className="bg-zinc-950 border border-zinc-800 p-2 rounded text-sm text-zinc-300" onChange={e => setFilters({ ...filters, model: e.target.value })} value={filters.model}>
                        <option value="">Todos Modelos</option>
                        {models.map((m: string) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select className="bg-zinc-950 border border-zinc-800 p-2 rounded text-sm text-zinc-300" onChange={e => setFilters({ ...filters, shift: e.target.value })} value={filters.shift}>
                        <option value="">Todos Turnos</option>
                        <option value="1">1º Turno</option>
                        <option value="2">2º Turno</option>
                    </select>
                    <div className="flex flex-col gap-2">
                        <select className="bg-zinc-950 border border-zinc-800 p-2 rounded text-sm text-zinc-300" onChange={e => setFilters({ ...filters, period: e.target.value })} value={filters.period}>
                            <option value="ALL">Todo Período</option>
                            <option value="DAY">Dia Específico</option>
                            <option value="WEEK">Semana Específica</option>
                            <option value="MONTH">Mês Específico</option>
                            <option value="YEAR">Ano Específico</option>
                        </select>
                        {filters.period === 'DAY' && <Input type="date" value={filters.specificDate} onChange={e => setFilters({ ...filters, specificDate: e.target.value })} />}
                        {filters.period === 'WEEK' && <Input type="week" value={filters.specificWeek} onChange={e => setFilters({ ...filters, specificWeek: e.target.value })} />}
                        {filters.period === 'MONTH' && <Input type="month" value={filters.specificMonth} onChange={e => setFilters({ ...filters, specificMonth: e.target.value })} />}
                        {filters.period === 'YEAR' && <Input type="number" placeholder="Ano (Ex: 2024)" value={filters.specificYear} onChange={e => setFilters({ ...filters, specificYear: e.target.value })} />}
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-blue-900/20 border-blue-900/50 p-6">
                    <h3 className="text-blue-400 font-bold uppercase text-xs">Total Filtrado</h3>
                    <p className="text-3xl font-bold mt-2">R$ {filtered.reduce((a, b) => a + (b.totalValue || 0), 0).toFixed(2)}</p>
                </Card>
                <Card className="bg-zinc-900 border-zinc-800 p-6 flex flex-col justify-center items-center cursor-pointer hover:bg-zinc-800" onClick={downloadExcel}>
                    <Download size={32} className="text-green-500 mb-2" />
                    <span className="text-sm font-bold text-green-400">Baixar Excel</span>
                </Card>
            </div>

            <div className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800">
                <table className="w-full text-sm">
                    <thead className="bg-zinc-950 text-zinc-400">
                        <tr>
                            <th className="p-3 text-left">Data</th>
                            <th className="p-3 text-left">Líder</th>
                            <th className="p-3 text-left">Item</th>
                            <th className="p-3 text-right">Valor</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                        {filtered.slice(0, 50).map(s => (
                            <tr key={s.id} className="hover:bg-zinc-800/50 cursor-pointer" onClick={() => setSelected(s)}>
                                <td className="p-3">{new Date(s.date).toLocaleDateString()}</td>
                                <td className="p-3 text-zinc-300">{s.leaderName}</td>
                                <td className="p-3">{s.item}</td>
                                <td className="p-3 text-right font-mono text-zinc-300">{s.totalValue?.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length > 50 && <div className="p-2 text-center text-xs text-zinc-500">Exibindo 50 de {filtered.length} itens...</div>}
            </div>

            {selected && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <Card className="max-w-2xl w-full bg-zinc-900 border-zinc-700">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-xl">Detalhes do Scrap</h3>
                            <button onClick={() => setSelected(null)}><X size={24} /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="bg-zinc-950 p-3 rounded"><strong>Data:</strong> {new Date(selected.date).toLocaleDateString()}</div>
                            <div className="bg-zinc-950 p-3 rounded"><strong>Horário:</strong> {selected.time}</div>
                            <div className="bg-zinc-950 p-3 rounded"><strong>Líder:</strong> {selected.leaderName}</div>
                            <div className="bg-zinc-950 p-3 rounded"><strong>Quem Registrou:</strong> {selected.responsible || selected.userId}</div>
                            <div className="bg-zinc-950 p-3 rounded"><strong>Modelo:</strong> {selected.model}</div>
                            <div className="bg-zinc-950 p-3 rounded"><strong>Linha:</strong> {selected.line}</div>
                            <div className="bg-zinc-950 p-3 rounded"><strong>Item:</strong> {selected.item}</div>
                            <div className="bg-zinc-950 p-3 rounded"><strong>Valor:</strong> R$ {selected.totalValue?.toFixed(2)}</div>
                            <div className="col-span-2 bg-zinc-950 p-3 rounded">
                                <strong>Motivo:</strong>
                                <p className="mt-1 text-zinc-400">{selected.reason}</p>
                            </div>
                            <div className="col-span-2 bg-zinc-950 p-3 rounded border border-green-900/30">
                                <strong className="text-green-400">Contra Medida:</strong>
                                <p className="mt-1 text-zinc-300">{selected.countermeasure || 'Pendente'}</p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    )
}

const ScrapManagementAdvanced = ({ scraps }: any) => {
    const [filters, setFilters] = useState({
        period: 'MONTH', // DAY, WEEK, MONTH, YEAR, ALL
        specificDate: '',
        specificWeek: '',
        specificMonth: '',
        specificYear: ''
    });

    const filtered = useMemo(() => {
        let res = [...scraps];
        const now = new Date();
        const d = new Date(now);

        if (filters.period !== 'ALL') {
            if (filters.period === 'DAY' && filters.specificDate) {
                res = res.filter(s => s.date === filters.specificDate);
            }
            else if (filters.period === 'WEEK' && filters.specificWeek) {
                const [y, w] = filters.specificWeek.split('-W').map(Number);
                res = res.filter(s => {
                    const sd = new Date(s.date);
                    const utcDate = new Date(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate());
                    const sw = getWeekNumber(utcDate);
                    return sw === w && sd.getFullYear() === y;
                });
            }
            else if (filters.period === 'MONTH' && filters.specificMonth) {
                res = res.filter(s => s.date.startsWith(filters.specificMonth));
            }
            else if (filters.period === 'YEAR' && filters.specificYear) {
                res = res.filter(s => s.date.startsWith(filters.specificYear));
            }
            // Fallback
            else if (filters.period === 'MONTH' && !filters.specificMonth) {
                const m = (d.getMonth() + 1).toString().padStart(2, '0');
                const y = d.getFullYear();
                res = res.filter(s => s.date.startsWith(`${y}-${m}`));
            }
        }
        return res;
    }, [scraps, filters]);

    // Generate rankings
    const rankings = useMemo(() => {
        const byLeader: Record<string, number> = {};
        const byModel: Record<string, number> = {};
        const byLine: Record<string, number> = {};
        const byShift: Record<string, number> = {};
        const pendingByLeader: Record<string, number> = {};

        filtered.forEach((s: ScrapData) => {
            const val = s.totalValue || 0;
            byLeader[s.leaderName] = (byLeader[s.leaderName] || 0) + val;
            byModel[s.model] = (byModel[s.model] || 0) + val;
            byLine[s.line] = (byLine[s.line] || 0) + val;
            byShift[s.shift] = (byShift[s.shift] || 0) + val;

            if (!s.countermeasure) {
                pendingByLeader[s.leaderName] = (pendingByLeader[s.leaderName] || 0) + 1;
            }
        });

        return {
            leader: Object.entries(byLeader).sort((a, b) => b[1] - a[1]),
            model: Object.entries(byModel).sort((a, b) => b[1] - a[1]),
            line: Object.entries(byLine).sort((a, b) => b[1] - a[1]),
            shift: Object.entries(byShift).sort((a, b) => b[1] - a[1]),
            pending: Object.entries(pendingByLeader).sort((a, b) => b[1] - a[1]),
        };
    }, [filtered]);

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <h3 className="font-bold text-lg">Dashboard de Gestão</h3>
                    <div className="flex gap-2 items-center flex-wrap">
                        <select className="bg-zinc-950 border border-zinc-800 p-2 rounded text-sm text-zinc-300" onChange={e => setFilters({ ...filters, period: e.target.value })} value={filters.period}>
                            <option value="ALL">Todo Período</option>
                            <option value="DAY">Dia Específico</option>
                            <option value="WEEK">Semana Específica</option>
                            <option value="MONTH">Mês Específico</option>
                            <option value="YEAR">Ano Específico</option>
                        </select>
                        {filters.period === 'DAY' && <Input type="date" value={filters.specificDate} onChange={e => setFilters({ ...filters, specificDate: e.target.value })} />}
                        {filters.period === 'WEEK' && <Input type="week" value={filters.specificWeek} onChange={e => setFilters({ ...filters, specificWeek: e.target.value })} />}
                        {filters.period === 'MONTH' && <Input type="month" value={filters.specificMonth} onChange={e => setFilters({ ...filters, specificMonth: e.target.value })} />}
                        {filters.period === 'YEAR' && <Input type="number" placeholder="Ano (Ex: 2024)" value={filters.specificYear} onChange={e => setFilters({ ...filters, specificYear: e.target.value })} />}
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Reordered: Shift -> Line -> Model -> Leaders -> Pending */}
                <Card>
                    <h3 className="font-bold text-emerald-400 mb-4 uppercase text-sm">Ranking Turnos (R$)</h3>
                    <div className="space-y-2">
                        {rankings.shift.map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center p-2 bg-zinc-950 rounded border border-zinc-800">
                                <span className="text-sm">Turno {name}</span>
                                <span className="font-mono font-bold text-emerald-400">R$ {val.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card>
                    <h3 className="font-bold text-purple-400 mb-4 uppercase text-sm">Ranking Linhas (R$)</h3>
                    <div className="space-y-2">
                        {rankings.line.map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center p-2 bg-zinc-950 rounded border border-zinc-800">
                                <span className="text-sm">{name}</span>
                                <span className="font-mono font-bold text-purple-400">R$ {val.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card>
                    <h3 className="font-bold text-blue-400 mb-4 uppercase text-sm">Ranking Modelos (R$)</h3>
                    <div className="space-y-2">
                        {rankings.model.slice(0, 10).map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center p-2 bg-zinc-950 rounded border border-zinc-800">
                                <span className="text-sm truncate max-w-[150px]">{name}</span>
                                <span className="font-mono font-bold text-blue-400">R$ {val.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <h3 className="font-bold text-red-400 mb-4 uppercase text-sm">Ranking Líderes (R$)</h3>
                    <div className="space-y-2">
                        {rankings.leader.slice(0, 10).map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center p-2 bg-zinc-950 rounded border border-zinc-800">
                                <span className="text-sm"><span className="font-bold text-zinc-500 mr-2">#{i + 1}</span> {name}</span>
                                <span className="font-mono font-bold text-red-400">R$ {val.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card>
                    <h3 className="font-bold text-yellow-500 mb-4 uppercase text-sm">Pendências (Qtd)</h3>
                    <div className="space-y-2">
                        {rankings.pending.slice(0, 10).map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center p-2 bg-zinc-950 rounded border border-zinc-800">
                                <span className="text-sm truncate max-w-[150px]">{name}</span>
                                <span className="font-mono font-bold text-yellow-500">{val}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
};
