import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    LayoutDashboard, AlertTriangle, FileText, CheckCircle2,
    ArrowLeft, Save, Search, Filter, Download, Plus, X,
    History, BarChart3, Settings, Upload, Trash2, Shield, Eye
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
import { exportScrapToExcel } from '../services/excelService';

const formatCurrency = (val: number | undefined) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
};

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
        <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 p-4 md:p-8 space-y-6 transition-colors duration-200">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <Button variant="ghost" onClick={onBack} className="rounded-full w-10 h-10 p-0 flex items-center justify-center">
                        <ArrowLeft size={20} />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-red-600 to-orange-500 dark:from-red-500 dark:to-orange-500 bg-clip-text text-transparent">
                            Gestão de Scrap
                        </h1>
                        <p className="text-gray-500 dark:text-zinc-400 text-sm">Controle de perdas e refugos</p>
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
                    <ScrapHistory scraps={scraps} currentUser={currentUser} users={users} />
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
        if (!formData.leaderName || !formData.model || !formData.item || !formData.line) {
            alert("Preencha todos os campos obrigatórios (Líder, Linha, Modelo, Item)!");
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
        <Card className="max-w-6xl mx-auto bg-white/50 dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800 shadow-sm">
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Input type="date" label="Data" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                    <Input label="Semana" value={formData.week} readOnly className="opacity-50" />
                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5 uppercase">Líder</label>
                        <select
                            className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-gray-900 dark:text-zinc-100 transition-colors"
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
                        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Linha</label>
                        <select
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100"
                            value={formData.line || ''}
                            onChange={e => setFormData({ ...formData, line: e.target.value })}
                        >
                            <option value="" disabled>Selecione...</option>
                            {lines.map((l: string) => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">PQC</label>
                        <select
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100"
                            value={formData.pqc || ''}
                            onChange={e => setFormData({ ...formData, pqc: e.target.value })}
                        >
                            <option value="" disabled>Selecione...</option>
                            {pqcUsers.map((u: User) => <option key={u.matricula} value={u.name}>{u.name}</option>)}
                        </select>
                    </div>
                    <Input label="Turno" value={formData.shift} onChange={e => setFormData({ ...formData, shift: e.target.value })} disabled={!!formData.leaderName} className={!!formData.leaderName ? "opacity-50" : ""} />
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Modelo</label>
                        <select
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100"
                            value={formData.model || ''}
                            onChange={e => setFormData({ ...formData, model: e.target.value })}
                        >
                            <option value="" disabled>Selecione...</option>
                            {models.map((m: string) => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                </div>

                <hr className="border-slate-200 dark:border-zinc-800" />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase">Cód. Matéria Prima</label>
                        <div className="relative">
                            <input
                                list="material-codes"
                                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-gray-900 dark:text-zinc-100 transition-colors"
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
                        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Item (Categoria)</label>
                        <input
                            list="items-list"
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100"
                            value={formData.item || ''}
                            onChange={e => setFormData({ ...formData, item: e.target.value })}
                            placeholder="Selecione..."
                        />
                        <datalist id="items-list">
                            {SCRAP_ITEMS.map(i => <option key={i} value={i} />)}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Status</label>
                        <input
                            list="status-list"
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100"
                            value={formData.status || ''}
                            onChange={e => setFormData({ ...formData, status: e.target.value })}
                            placeholder="Selecione..."
                        />
                        <datalist id="status-list">
                            {SCRAP_STATUS.map(i => <option key={i} value={i} />)}
                        </datalist>
                    </div>
                    <Input label="Valor UN" value={formatCurrency(formData.unitValue)} readOnly className="opacity-50" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl border border-red-200 dark:border-red-900/30 flex flex-col justify-center">
                        <label className="text-xs font-bold text-red-600 dark:text-red-400 uppercase">Valor Total</label>
                        <span className="text-2xl font-bold text-red-600 dark:text-red-500">{formatCurrency(formData.totalValue)}</span>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Causa Raiz</label>
                        <select
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100"
                            value={formData.rootCause || ''}
                            onChange={e => setFormData({ ...formData, rootCause: e.target.value })}
                        >
                            <option value="" disabled>Selecione...</option>
                            {CAUSA_RAIZ_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Estação</label>
                        <select
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100"
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
                        <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5 uppercase">Motivo Detalhado</label>
                        <textarea
                            className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-600 min-h-[80px] text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 transition-colors"
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
    const [responsible, setResponsible] = useState('');

    const openModal = (s: ScrapData) => {
        setSelected(s);
        setCm(s.countermeasure || '');
        setReason(s.reason || '');
        setResponsible(s.responsible || '');
    };

    const handleSave = async () => {
        if (selected && selected.id) {
            if (!cm.trim()) { alert("Contra Medida é obrigatória."); return; }
            await updateScrap(selected.id, { countermeasure: cm, reason: reason, responsible: responsible });
            await onUpdate();
            setSelected(null);
        }
    }

    return (
        <div className="space-y-4">
            {pending.length === 0 ? (
                <div className="p-12 text-center text-slate-500 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-900/30 rounded-xl border border-dashed border-slate-300 dark:border-zinc-800">
                    <CheckCircle2 size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Nenhuma pendência encontrada!</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 text-sm overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 font-medium border-b border-slate-200 dark:border-zinc-800">
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
                        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                            {pending.map((s: ScrapData) => (
                                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                                    <td className="p-4 text-slate-700 dark:text-zinc-300">{new Date(s.date).toLocaleDateString()}</td>
                                    <td className="p-4 text-slate-900 dark:text-white font-medium">{s.leaderName}</td>
                                    <td className="p-4">{s.shift}</td>
                                    <td className="p-4 text-zinc-300">{s.model}</td>
                                    <td className="p-4">{s.qty}</td>
                                    <td className="p-4 font-mono text-red-400">{formatCurrency(s.totalValue)}</td>
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
                    <Card className="max-w-6xl w-full max-h-[90vh] overflow-y-auto bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-xl">Resolver Pendência de Scrap</h3>
                            <button onClick={() => setSelected(null)}><X size={24} /></button>
                        </div>
                        <div className="space-y-6 opacity-80">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <Input label="Data" value={selected.date} readOnly />
                                <Input label="Semana" value={selected.week} readOnly />
                                <Input label="Líder" value={selected.leaderName} readOnly />
                                <Input label="Responsável (Falha/Estação)" value={responsible} onChange={e => setResponsible(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <Input label="Linha" value={selected.line} readOnly />
                                <Input label="PQC" value={selected.pqc} readOnly />
                                <Input label="Turno" value={selected.shift} readOnly />
                                <Input label="Modelo" value={selected.model} readOnly />
                            </div>
                            <hr className="border-slate-200 dark:border-zinc-800" />
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <Input label="Cód. Matéria Prima" value={selected.code} readOnly />
                                <Input label="Modelo Usado" value={selected.usedModel} readOnly />
                                <div className="lg:col-span-2"><Input label="Descrição" value={selected.description} readOnly /></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <Input label="Quantidade" value={selected.qty} readOnly />
                                <Input label="Item (Categoria)" value={selected.item} readOnly />
                                <Input label="Status" value={selected.status} readOnly />
                                <Input label="Valor UN" value={formatCurrency(selected.unitValue)} readOnly />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-red-900/10 p-4 rounded-xl border border-red-900/30 flex flex-col justify-center">
                                    <label className="text-xs font-bold text-red-400 uppercase">Valor Total</label>
                                    <span className="text-2xl font-bold text-red-500">{formatCurrency(selected.totalValue)}</span>
                                </div>
                                <Input label="Causa Raiz" value={selected.rootCause} readOnly />
                                <Input label="Estação" value={selected.station} readOnly />
                            </div>
                        </div>
                        <div className="mt-8 pt-6 border-t border-zinc-700 grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Motivo Detalhado (Ajuste Opcional)</label>
                                <textarea
                                    className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-600 min-h-[120px] text-slate-900 dark:text-zinc-100"
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-green-700 dark:text-green-400 mb-1.5 uppercase font-bold">Contra Medida (Obrigatório)</label>
                                <textarea
                                    className="w-full bg-slate-50 dark:bg-zinc-950 border-2 border-green-200 dark:border-green-900/50 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-green-500 min-h-[120px] text-slate-900 dark:text-zinc-100"
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

const ScrapHistory = ({ scraps, currentUser, users }: any) => {
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
                    <p className="text-3xl font-bold mt-2">{formatCurrency(total)}</p>
                </Card>
                <Card className="bg-orange-900/20 border-orange-500/30">
                    <h3 className="text-orange-400 text-xs font-bold uppercase">Minhas Pendências</h3>
                    <p className="text-3xl font-bold mt-2">{pendingCount}</p>
                </Card>
            </div>

            <Card>
                <div className="flex gap-4 items-end flex-wrap">
                    <div className="min-w-[150px]">
                        <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase mb-1 block">Período</label>
                        <select className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded p-2 text-slate-900 dark:text-white" value={filters.period} onChange={e => setFilters({ ...filters, period: e.target.value })}>
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
                        <div key={s.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-4 rounded-lg flex justify-between items-center hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-sm group">
                            <div onClick={() => setSelected(s)} className="cursor-pointer flex-1">
                                <p className="font-bold text-slate-800 dark:text-zinc-200">{s.item} <span className="text-slate-500 dark:text-zinc-500 font-normal">| {s.model}</span></p>
                                <p className="text-xs text-slate-500 dark:text-zinc-500">{new Date(s.date).toLocaleDateString()} • {s.leaderName}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <p className={`font-bold ${!s.countermeasure ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{formatCurrency(s.totalValue)}</p>
                                    <span className="text-[10px] uppercase text-slate-500 dark:text-zinc-600">{s.status}</span>
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => setSelected(s)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Eye size={18} className="text-slate-500 dark:text-zinc-400 hover:text-blue-500" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <ScrapDetailModal
                isOpen={!!selected}
                scrap={selected}
                users={users}
                onClose={() => setSelected(null)}
            />
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
        exportScrapToExcel(filtered);
    };

    return (
        <div className="space-y-6">
            <Card>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <select className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-blue-600/50" onChange={e => setFilters({ ...filters, leader: e.target.value })} value={filters.leader}>
                        <option value="">Todos Líderes</option>
                        {leadersOnly.map((u: User) => <option key={u.matricula} value={u.name}>{u.name}</option>)}
                    </select>
                    <select className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-blue-600/50" onChange={e => setFilters({ ...filters, line: e.target.value })} value={filters.line}>
                        <option value="">Todas Linhas</option>
                        {lines.map((l: string) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <select className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-blue-600/50" onChange={e => setFilters({ ...filters, model: e.target.value })} value={filters.model}>
                        <option value="">Todos Modelos</option>
                        {models.map((m: string) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-blue-600/50" onChange={e => setFilters({ ...filters, shift: e.target.value })} value={filters.shift}>
                        <option value="">Todos Turnos</option>
                        <option value="1">1º Turno</option>
                        <option value="2">2º Turno</option>
                    </select>
                    <div className="flex flex-col gap-2">
                        <select className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-blue-600/50" onChange={e => setFilters({ ...filters, period: e.target.value })} value={filters.period}>
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
                    <p className="text-3xl font-bold mt-2">{formatCurrency(filtered.reduce((a, b) => a + (b.totalValue || 0), 0))}</p>
                </Card>
                <Card className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 p-6 flex flex-col justify-center items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800 shadow-sm" onClick={downloadExcel}>
                    <Download size={32} className="text-green-600 dark:text-green-500 mb-2" />
                    <span className="text-sm font-bold text-green-600 dark:text-green-400">Baixar Excel</span>
                </Card>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 shadow-sm">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800">
                        <tr>
                            <th className="p-3 text-left">Data</th>
                            <th className="p-3 text-left">Líder</th>
                            <th className="p-3 text-left">Modelo</th>
                            <th className="p-3 text-left">Linha</th>
                            <th className="p-3 text-left">Item</th>
                            <th className="p-3 text-right">Valor</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                        {filtered.map(s => (
                            <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors" onClick={() => setSelected(s)}>
                                <td className="p-3 text-slate-700 dark:text-zinc-300">{new Date(s.date).toLocaleDateString()}</td>
                                <td className="p-3 text-slate-700 dark:text-zinc-300">{s.leaderName}</td>
                                <td className="p-3 text-slate-700 dark:text-zinc-300">{s.model}</td>
                                <td className="p-3 text-slate-700 dark:text-zinc-300">{s.line}</td>
                                <td className="p-3 text-slate-700 dark:text-zinc-300">{s.item}</td>
                                <td className="p-3 text-right font-mono text-slate-700 dark:text-zinc-300">{formatCurrency(s.totalValue)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length === 0 && <div className="p-8 text-center text-slate-500 dark:text-zinc-500">Nenhum registro encontrado.</div>}
            </div>

            <ScrapDetailModal
                isOpen={!!selected}
                scrap={selected}
                users={users}
                onClose={() => setSelected(null)}
            />
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
                        <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-blue-600" onChange={e => setFilters({ ...filters, period: e.target.value })} value={filters.period}>
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
                            <div key={name} className="flex justify-between items-center p-2 bg-slate-50 dark:bg-zinc-950 rounded border border-slate-200 dark:border-zinc-800">
                                <span className="text-sm text-slate-700 dark:text-zinc-300">Turno {name}</span>
                                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(val)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card>
                    <h3 className="font-bold text-purple-400 mb-4 uppercase text-sm">Ranking Linhas (R$)</h3>
                    <div className="space-y-2">
                        {rankings.line.map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center p-2 bg-slate-50 dark:bg-zinc-950 rounded border border-slate-200 dark:border-zinc-800">
                                <span className="text-sm text-slate-700 dark:text-zinc-300">{name}</span>
                                <span className="font-mono font-bold text-purple-600 dark:text-purple-400">{formatCurrency(val)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card>
                    <h3 className="font-bold text-blue-400 mb-4 uppercase text-sm">Ranking Modelos (R$)</h3>
                    <div className="space-y-2">
                        {rankings.model.slice(0, 10).map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center p-2 bg-slate-50 dark:bg-zinc-950 rounded border border-slate-200 dark:border-zinc-800">
                                <span className="text-sm truncate max-w-[150px] text-slate-700 dark:text-zinc-300">{name}</span>
                                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{formatCurrency(val)}</span>
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
                            <div key={name} className="flex justify-between items-center p-2 bg-slate-50 dark:bg-zinc-950 rounded border border-slate-200 dark:border-zinc-800">
                                <span className="text-sm text-slate-700 dark:text-zinc-300"><span className="font-bold text-slate-500 dark:text-zinc-500 mr-2">#{i + 1}</span> {name}</span>
                                <span className="font-mono font-bold text-red-600 dark:text-red-400">{formatCurrency(val)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card>
                    <h3 className="font-bold text-yellow-500 mb-4 uppercase text-sm">Pendências (Qtd)</h3>
                    <div className="space-y-2">
                        {rankings.pending.slice(0, 10).map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center p-2 bg-slate-50 dark:bg-zinc-950 rounded border border-slate-200 dark:border-zinc-800">
                                <span className="text-sm truncate max-w-[150px] text-slate-700 dark:text-zinc-300">{name}</span>
                                <span className="font-mono font-bold text-yellow-600 dark:text-yellow-500">{val}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
};

// --- SHARED DETAIL MODAL ---

interface ScrapDetailModalProps {
    isOpen: boolean;
    scrap: ScrapData | null;
    users: User[];
    onClose: () => void;
}

const ScrapDetailModal: React.FC<ScrapDetailModalProps> = ({ isOpen, scrap, users, onClose }) => {
    if (!isOpen || !scrap) return null;

    // Logic to find the name of the user who registered the scrap (not the responsible for the fault)
    const registeredBy = users.find(u => u.matricula === scrap.userId)?.name || scrap.userId;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <Card className="max-w-4xl w-full bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl">
                {/* Header */}
                <div className="flex justify-between items-start mb-6 border-b border-slate-100 dark:border-zinc-800 pb-4">
                    <div>
                        <h3 className="font-bold text-xl text-slate-900 dark:text-white">Detalhes do Apontamento</h3>
                        <div className="flex gap-2 mt-1">
                            <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded">ID: {scrap.id || 'N/A'}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${!scrap.countermeasure ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'}`}>
                                {scrap.status}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                        <X size={24} className="text-slate-500 dark:text-zinc-400" />
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Bloco 1: Contexto Operacional */}
                    <div className="bg-slate-50/50 dark:bg-zinc-950/50 p-4 rounded-xl border border-slate-200/50 dark:border-zinc-800/50">
                        <h4 className="text-xs font-bold text-blue-500 uppercase mb-3 flex items-center gap-2">
                            <LayoutDashboard size={14} /> Contexto Operacional
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <DetailItem label="Data" value={new Date(scrap.date).toLocaleDateString()} />
                            <DetailItem label="Semana" value={scrap.week} />
                            <DetailItem label="Líder" value={scrap.leaderName} />
                            <DetailItem label="Linha" value={scrap.line} />
                            <DetailItem label="Turno" value={scrap.shift} />
                        </div>
                    </div>

                    {/* Bloco 2: Produto & Material */}
                    <div className="bg-slate-50/50 dark:bg-zinc-950/50 p-4 rounded-xl border border-slate-200/50 dark:border-zinc-800/50">
                        <h4 className="text-xs font-bold text-purple-500 uppercase mb-3 flex items-center gap-2">
                            <Settings size={14} /> Dados do Material
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <DetailItem label="Modelo (Produto)" value={scrap.model} />
                            <DetailItem label="Cód. Matéria Prima" value={scrap.code || '-'} />
                            <div className="md:col-span-2">
                                <DetailItem label="Descrição" value={scrap.description || '-'} />
                            </div>
                            <DetailItem label="Modelo Usado" value={scrap.usedModel || '-'} />
                        </div>
                    </div>

                    {/* Bloco 3: Defeito & Custos */}
                    <div className="bg-slate-50/50 dark:bg-zinc-950/50 p-4 rounded-xl border border-slate-200/50 dark:border-zinc-800/50">
                        <h4 className="text-xs font-bold text-red-500 uppercase mb-3 flex items-center gap-2">
                            <BarChart3 size={14} /> Quantidades e Custos
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                            <DetailItem label="Quantidade" value={scrap.qty} className="text-lg font-bold" />
                            <DetailItem label="Item / Categoria" value={scrap.item} />
                            <DetailItem label="Valor Unitário" value={formatCurrency(scrap.unitValue)} />
                            <div className="bg-white dark:bg-zinc-900 p-2.5 rounded border border-slate-100 dark:border-zinc-800 shadow-sm border-l-4 border-l-red-500">
                                <label className="block text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase mb-1 tracking-wider">Valor Total</label>
                                <div className="text-xl font-bold text-red-600 dark:text-red-400 truncate">{formatCurrency(scrap.totalValue)}</div>
                            </div>
                        </div>
                    </div>

                    {/* Bloco 4: Rastreabilidade */}
                    <div className="bg-slate-50/50 dark:bg-zinc-950/50 p-4 rounded-xl border border-slate-200/50 dark:border-zinc-800/50">
                        <h4 className="text-xs font-bold text-orange-500 uppercase mb-3 flex items-center gap-2">
                            <Shield size={14} /> Rastreabilidade
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <DetailItem label="Causa Raiz" value={scrap.rootCause || '-'} />
                            <DetailItem label="Estação / Posto" value={scrap.station || '-'} />
                            <DetailItem label="Responsável da Falha" value={scrap.responsible || '-'} />
                        </div>
                    </div>

                    {/* Bloco 5: Autoria e Justificativas */}
                    <div className="space-y-4 pt-2">
                        <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded border border-blue-100 dark:border-blue-900/30 flex items-center justify-between">
                            <div className="flex gap-3 items-center">
                                <span className="bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200 text-xs font-bold px-2 py-0.5 rounded uppercase">Registrado Por</span>
                                <span className="text-sm font-bold text-slate-900 dark:text-zinc-100">{registeredBy}</span>
                            </div>
                            <span className="text-xs font-mono text-slate-500">{scrap.time}</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-zinc-500 mb-2 uppercase flex items-center gap-2"><FileText size={14} /> Motivo Detalhado</label>
                                <div className="bg-slate-100 dark:bg-zinc-950 p-4 rounded-lg border border-slate-200 dark:border-zinc-800 text-sm min-h-[100px] text-slate-700 dark:text-zinc-300 leading-relaxed shadow-inner">
                                    {scrap.reason}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-green-600 dark:text-green-500 mb-2 uppercase flex items-center gap-2"><CheckCircle2 size={14} /> Contra Medida</label>
                                <div className={`p-4 rounded-lg border text-sm min-h-[100px] shadow-inner leading-relaxed ${scrap.countermeasure ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30 text-slate-800 dark:text-zinc-200' : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-400 italic'}`}>
                                    {scrap.countermeasure || 'Nenhuma contra medida registrada.'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-zinc-800 text-center">
                    <Button variant="ghost" onClick={onClose} className="text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200">
                        Fechar Visualização
                    </Button>
                </div>
            </Card>
        </div>
    );
};

// Helper component for uniform items
const DetailItem = ({ label, value, className = "" }: any) => (
    <div className="bg-white dark:bg-zinc-900 p-2.5 rounded border border-slate-100 dark:border-zinc-800 shadow-sm transition-all hover:border-blue-200 dark:hover:border-blue-800/50">
        <label className="block text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase mb-1 tracking-wider">{label}</label>
        <div className={`text-sm text-slate-700 dark:text-zinc-300 font-medium truncate ${className}`}>{value}</div>
    </div>
);
