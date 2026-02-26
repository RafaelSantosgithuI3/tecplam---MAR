
import React, { useState, useEffect, useMemo } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { User, ScrapData } from '../types';
import {
    LayoutDashboard, CheckSquare, History, BarChart3,
    ArrowLeft, Download, Filter, Truck, FileText, ChevronDown, ChevronUp, FileSpreadsheet, Box, QrCode
} from 'lucide-react';
import {
    getScraps, batchProcessScraps
} from '../services/scrapService';
import { getAllUsers } from '../services/authService';
import { getLines, getModels, getWeekNumber } from '../services/storageService';
import { exportExecutiveReport, exportInvoiceReport } from '../services/excelService';

// Import shared components
import { ScrapOperational } from './ScrapModule';
import { ScrapBoxMount, ScrapBoxIdentified } from './ScrapBoxViews';

const formatCurrency = (val: number | undefined) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
};

const formatDateDisplay = (dateString: string | undefined) => {
    if (!dateString) return '-';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
};

type IQCTab = 'MONITORING' | 'BATCH_PROCESS' | 'HISTORY_SENT' | 'DASHBOARD' | 'BOX_MOUNT' | 'BOX_IDENTIFIED';

export const IQCModule = ({ currentUser, onBack }: { currentUser: User, onBack: () => void }) => {
    const [activeTab, setActiveTab] = useState<IQCTab>('MONITORING');
    const [scraps, setScraps] = useState<ScrapData[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [lines, setLines] = useState<string[]>([]);
    const [models, setModels] = useState<string[]>([]);

    const loadData = async () => {
        const [s, u, l, m] = await Promise.all([
            getScraps(),
            getAllUsers(),
            getLines(),
            getModels()
        ]);
        setScraps(s);
        setUsers(u);
        setLines(l.map(x => x.name));
        setModels(m);
    };

    useEffect(() => {
        loadData();
    }, []);

    const refreshData = async () => {
        const s = await getScraps();
        setScraps(s);
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 p-4 md:p-8 space-y-6">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <Button variant="ghost" onClick={onBack} className="rounded-full w-10 h-10 p-0 flex items-center justify-center">
                        <ArrowLeft size={20} />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent flex items-center gap-2">
                            <Truck size={24} className="text-blue-600" />
                            Controle de SCRAP & Logística
                        </h1>
                        <p className="text-slate-500 dark:text-zinc-400 text-sm">Controle de envio e baixa fiscal de SCRAP</p>
                    </div>
                </div>

                <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 custom-scrollbar">
                    <Button variant={activeTab === 'MONITORING' ? 'primary' : 'ghost'} onClick={() => setActiveTab('MONITORING')} size="sm">
                        <LayoutDashboard size={16} /> Monitoramento
                    </Button>
                    <Button variant={activeTab === 'BATCH_PROCESS' ? 'primary' : 'ghost'} onClick={() => setActiveTab('BATCH_PROCESS')} size="sm">
                        <CheckSquare size={16} /> Baixa de Scrap
                    </Button>
                    <Button variant={activeTab === 'HISTORY_SENT' ? 'primary' : 'ghost'} onClick={() => setActiveTab('HISTORY_SENT')} size="sm">
                        <History size={16} /> Histórico de Envios
                    </Button>
                    <Button variant={activeTab === 'DASHBOARD' ? 'primary' : 'ghost'} onClick={() => setActiveTab('DASHBOARD')} size="sm">
                        <BarChart3 size={16} /> Dashboard Detalhado
                    </Button>
                    <Button variant={activeTab === 'BOX_MOUNT' ? 'primary' : 'ghost'} onClick={() => setActiveTab('BOX_MOUNT')} size="sm">
                        <Box size={16} /> Montar Caixa
                    </Button>
                    <Button variant={activeTab === 'BOX_IDENTIFIED' ? 'primary' : 'ghost'} onClick={() => setActiveTab('BOX_IDENTIFIED')} size="sm">
                        <QrCode size={16} /> Associar NF
                    </Button>
                </div>
            </div>

            {/* CONTENT */}
            <div className="mt-6">
                {activeTab === 'MONITORING' && (
                    <ScrapOperational scraps={scraps} users={users} lines={lines} models={models} />
                )}

                {activeTab === 'BATCH_PROCESS' && (
                    <BatchProcessTab scraps={scraps} onProcess={refreshData} currentUser={currentUser} lines={lines} />
                )}

                {activeTab === 'HISTORY_SENT' && (
                    <HistorySentTab scraps={scraps} users={users} />
                )}

                {activeTab === 'DASHBOARD' && (
                    <ExecutiveDashboard scraps={scraps} />
                )}

                {activeTab === 'BOX_MOUNT' && (
                    <ScrapBoxMount currentUser={currentUser} onUpdate={refreshData} />
                )}

                {activeTab === 'BOX_IDENTIFIED' && (
                    <ScrapBoxIdentified currentUser={currentUser} onUpdate={refreshData} />
                )}
            </div>
        </div>
    );
};

// --- SUB COMPONENTS ---

const ExecutiveDashboard = ({ scraps }: { scraps: ScrapData[] }) => {
    const [filters, setFilters] = useState({
        period: 'MONTH',
        plant: 'ALL',
        shift: 'ALL',
        status: 'ALL', // SENT, PENDING
        specificDate: '',
        specificWeek: '',
        specificMonth: new Date().toISOString().slice(0, 7),
        specificYear: ''
    });

    const filtered = useMemo(() => {
        let res = [...scraps];

        // Date Filter
        if (filters.period === 'DAY' && filters.specificDate) res = res.filter(s => s.date === filters.specificDate);
        else if (filters.period === 'WEEK' && filters.specificWeek) {
            const [y, w] = filters.specificWeek.split('-W').map(Number);
            res = res.filter(s => {
                const sd = new Date(s.date);
                const utcDate = new Date(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate());
                const sw = getWeekNumber(utcDate);
                return sw === w && sd.getFullYear() === y;
            });
        }
        else if (filters.period === 'MONTH' && filters.specificMonth) res = res.filter(s => s.date.startsWith(filters.specificMonth));
        else if (filters.period === 'YEAR' && filters.specificYear) res = res.filter(s => s.date.startsWith(filters.specificYear));

        // Other Filters
        if (filters.plant !== 'ALL') res = res.filter(s => s.plant === filters.plant);
        if (filters.shift !== 'ALL') res = res.filter(s => String(s.shift) === filters.shift);
        if (filters.status !== 'ALL') {
            if (filters.status === 'SENT') res = res.filter(s => s.situation === 'SENT');
            else res = res.filter(s => s.situation !== 'SENT');
        }

        return res;
    }, [scraps, filters]);

    const stats = useMemo(() => {
        const totalVal = filtered.reduce((acc, s) => acc + (s.totalValue || 0), 0);
        const totalQty = filtered.reduce((acc, s) => acc + (s.qty || 0), 0);

        const specificItems = ['FRONT', 'REAR', 'OCTA', 'CAMERA', 'BATERIA RMA', 'BATERIA SCRAP'];
        const byCategory: Record<string, number> = {};
        const byModel: Record<string, number> = {};
        const byLine: Record<string, number> = {};

        // Initialize categories
        specificItems.forEach(k => byCategory[k] = 0);
        byCategory['MIUDEZAS'] = 0;

        filtered.forEach(s => {
            const val = s.totalValue || 0;
            const itemUpper = (s.item || '').toUpperCase();

            // --- CATEGORIZATION LOGIC ---
            let catKey = 'MIUDEZAS';
            if (itemUpper.includes('CAMERA')) {
                catKey = 'CAMERA';
            } else {
                const found = specificItems.find(i => itemUpper.includes(i) && i !== 'CAMERA'); // Exclude CAMERA here as it's already handled
                if (found) catKey = found;
            }
            // ----------------------------

            byCategory[catKey] = (byCategory[catKey] || 0) + val;

            // Model
            byModel[s.model] = (byModel[s.model] || 0) + val;

            // Line
            byLine[s.line] = (byLine[s.line] || 0) + val;
        });

        return {
            totalVal,
            totalQty,
            category: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
            model: Object.entries(byModel).sort((a, b) => b[1] - a[1]).slice(0, 10),
            line: Object.entries(byLine).sort((a, b) => b[1] - a[1])
        };
    }, [filtered]);

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <h3 className="font-bold text-lg">Indicadores Detalhados</h3>
                    <div className="flex flex-wrap gap-2 items-center">
                        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                            <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none w-full md:w-auto" onChange={e => setFilters({ ...filters, period: e.target.value })} value={filters.period}>
                                <option value="ALL">Todo Período</option>
                                <option value="DAY">Dia</option>
                                <option value="WEEK">Semana</option>
                                <option value="MONTH">Mês</option>
                                <option value="YEAR">Ano</option>
                            </select>
                            {filters.period === 'DAY' && <Input type="date" value={filters.specificDate} onChange={e => setFilters({ ...filters, specificDate: e.target.value })} className="w-full md:w-auto" />}
                            {filters.period === 'WEEK' && <Input type="week" value={filters.specificWeek} onChange={e => setFilters({ ...filters, specificWeek: e.target.value })} className="w-full md:w-auto" />}
                            {filters.period === 'MONTH' && <Input type="month" value={filters.specificMonth} onChange={e => setFilters({ ...filters, specificMonth: e.target.value })} className="w-full md:w-auto" />}
                            {filters.period === 'YEAR' && <Input type="number" placeholder="2026" value={filters.specificYear} onChange={e => setFilters({ ...filters, specificYear: e.target.value })} className="w-full md:w-24" />}
                        </div>

                        <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" value={filters.plant} onChange={e => setFilters({ ...filters, plant: e.target.value })}>
                            <option value="ALL">Todas Plantas</option>
                            <option value="P81L">P81L</option>
                            <option value="P81M">P81M</option>
                            <option value="P81N">P81N</option>
                        </select>
                        <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" value={filters.shift} onChange={e => setFilters({ ...filters, shift: e.target.value })}>
                            <option value="ALL">Todos Turnos</option>
                            <option value="1">1º Turno</option>
                            <option value="2">2º Turno</option>
                        </select>
                        <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
                            <option value="ALL">Status Envio</option>
                            <option value="PENDING">Pendentes</option>
                            <option value="SENT">Enviados</option>
                        </select>

                        <Button onClick={() => exportExecutiveReport(filtered)} className="bg-green-600 hover:bg-green-700 text-white ml-2">
                            <Download size={18} /> Excel (Filtrado)
                        </Button>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-blue-900 text-white border-blue-800">
                    <p className="text-blue-200 text-xs font-bold uppercase">Valor Total (Filtrado)</p>
                    <p className="text-3xl font-bold mt-1">{formatCurrency(stats.totalVal)}</p>
                </Card>
                <Card className="bg-slate-900 text-white border-slate-800">
                    <p className="text-slate-400 text-xs font-bold uppercase">Quantidade (Filtrado)</p>
                    <p className="text-3xl font-bold mt-1">{stats.totalQty} <span className="text-base font-normal text-slate-500">itens</span></p>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><LayoutDashboard size={16} className="text-purple-500" /> Por Categoria</h3>
                    <div className="space-y-3">
                        {stats.category.map(([name, val]) => (
                            <div key={name} className="flex justify-between items-center text-sm">
                                <span className={val > 0 ? 'text-slate-700 dark:text-zinc-300' : 'text-slate-400 dark:text-zinc-600'}>{name}</span>
                                <span className="font-bold">{formatCurrency(val)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Truck size={16} className="text-blue-500" /> Top Modelos</h3>
                    <div className="space-y-3">
                        {stats.model.map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center text-sm">
                                <span className="text-slate-700 dark:text-zinc-300 whitespace-normal break-words w-2/3">{i + 1}. {name}</span>
                                <span className="font-bold text-blue-600 dark:text-blue-400">{formatCurrency(val)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Filter size={16} className="text-green-500" /> Por Linha</h3>
                    <div className="space-y-3">
                        {stats.line.map(([name, val]) => (
                            <div key={name} className="flex justify-between items-center text-sm">
                                <span className="text-slate-700 dark:text-zinc-300">{name}</span>
                                <span className="font-bold text-green-600 dark:text-green-400">{formatCurrency(val)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
};

const BatchProcessTab = ({ scraps, onProcess, currentUser, lines }: { scraps: ScrapData[], onProcess: () => void, currentUser: User, lines: string[] }) => {
    const [filters, setFilters] = useState({
        period: 'ALL',
        specificDate: '',
        specificWeek: '',
        specificMonth: '',
        specificYear: '',
        shift: 'ALL',
        line: 'ALL'
    });

    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [nfNumber, setNfNumber] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const pendingScraps = useMemo(() => {
        let res = scraps.filter(s => s.situation !== 'SENT');

        if (filters.period === 'DAY' && filters.specificDate) res = res.filter(s => s.date === filters.specificDate);
        if (filters.period === 'WEEK' && filters.specificWeek) {
            const [y, w] = filters.specificWeek.split('-W').map(Number);
            res = res.filter(s => {
                const sd = new Date(s.date);
                const utcDate = new Date(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate());
                const sw = getWeekNumber(utcDate);
                return sw === w && sd.getFullYear() === y;
            });
        }
        if (filters.period === 'MONTH' && filters.specificMonth) res = res.filter(s => s.date.startsWith(filters.specificMonth));
        if (filters.period === 'YEAR' && filters.specificYear) res = res.filter(s => s.date.startsWith(filters.specificYear));

        if (filters.shift !== 'ALL') res = res.filter(s => String(s.shift) === filters.shift);
        if (filters.line !== 'ALL') res = res.filter(s => s.line === filters.line);

        return res.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [scraps, filters]);

    const handleSelect = (id: number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleSelectAll = () => {
        if (selectedIds.length === pendingScraps.length) setSelectedIds([]);
        else setSelectedIds(pendingScraps.map(s => Number(s.id)));
    };

    const totalSelectedValue = pendingScraps
        .filter(s => selectedIds.includes(Number(s.id)))
        .reduce((acc, s) => acc + (s.totalValue || 0), 0);

    const handleProcess = async () => {
        if (!nfNumber) return alert("Digite o número da Nota Fiscal");

        setIsProcessing(true);
        try {
            await batchProcessScraps(selectedIds, nfNumber, currentUser.matricula, new Date());
            alert("Baixa realizada com sucesso!");
            setShowModal(false);
            setNfNumber('');
            setSelectedIds([]);
            onProcess();
        } catch (e) {
            alert("Erro ao processar");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <div className="flex gap-4 items-center flex-wrap">
                    <Filter size={18} className="text-slate-400" />
                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none w-full md:w-auto" onChange={e => setFilters({ ...filters, period: e.target.value })} value={filters.period}>
                            <option value="ALL">Todos os Períodos</option>
                            <option value="DAY">Dia</option>
                            <option value="WEEK">Semana</option>
                            <option value="MONTH">Mês</option>
                            <option value="YEAR">Ano</option>
                        </select>
                        {filters.period === 'DAY' && <Input type="date" value={filters.specificDate} onChange={e => setFilters({ ...filters, specificDate: e.target.value })} className="w-full md:w-auto" />}
                        {filters.period === 'WEEK' && <Input type="week" value={filters.specificWeek} onChange={e => setFilters({ ...filters, specificWeek: e.target.value })} className="w-full md:w-auto" />}
                        {filters.period === 'MONTH' && <Input type="month" value={filters.specificMonth} onChange={e => setFilters({ ...filters, specificMonth: e.target.value })} className="w-full md:w-auto" />}
                        {filters.period === 'YEAR' && <Input type="number" placeholder="2026" value={filters.specificYear} onChange={e => setFilters({ ...filters, specificYear: e.target.value })} className="w-full md:w-24" />}
                    </div>

                    <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" value={filters.shift} onChange={e => setFilters({ ...filters, shift: e.target.value })}>
                        <option value="ALL">Todos Turnos</option>
                        <option value="1">1º Turno</option>
                        <option value="2">2º Turno</option>
                    </select>

                    <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" value={filters.line} onChange={e => setFilters({ ...filters, line: e.target.value })}>
                        <option value="ALL">Todas Linhas</option>
                        {lines.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>

                    <div className="ml-auto text-sm text-slate-500">
                        {pendingScraps.length} itens aguardando baixa
                    </div>
                </div>
            </Card>

            {/* Container Responsivo para Mobile */}
            <div className="w-full overflow-x-auto pb-4 mb-4 touch-pan-x border border-gray-200 dark:border-zinc-800 rounded-xl">
                <table className="w-full text-sm min-w-[800px]">
                    {/* ... (mantendo o conteúdo da tabela) ... */}
                    <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800">
                        <tr>
                            <th className="p-3 w-10">
                                <input type="checkbox" checked={selectedIds.length === pendingScraps.length && pendingScraps.length > 0} onChange={handleSelectAll} />
                            </th>
                            <th className="p-3 text-left">Data</th>
                            <th className="p-3 text-left">Modelo</th>
                            <th className="p-3 text-left">Linha</th>
                            <th className="p-3 text-left">Item</th>
                            <th className="p-3 text-left">Qtd</th>
                            <th className="p-3 text-right">Valor</th>
                            <th className="p-3 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                        {pendingScraps.map(s => (
                            <tr key={s.id} className={`hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors ${selectedIds.includes(Number(s.id)) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                                <td className="p-3">
                                    <input type="checkbox" checked={selectedIds.includes(Number(s.id))} onChange={() => handleSelect(Number(s.id))} />
                                </td>
                                <td className="p-3 text-slate-700 dark:text-zinc-300">{formatDateDisplay(s.date)}</td>
                                <td className="p-3 text-slate-700 dark:text-zinc-300">{s.model}</td>
                                <td className="p-3 text-slate-700 dark:text-zinc-300">{s.line}</td>
                                <td className="p-3 text-slate-700 dark:text-zinc-300">{s.item}</td>
                                <td className="p-3 text-slate-700 dark:text-zinc-300">{s.qty}</td>
                                <td className="p-3 text-right font-mono text-slate-700 dark:text-zinc-300">{formatCurrency(s.totalValue)}</td>
                                <td className="p-3 text-center">
                                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded ${s.status === 'OK' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{s.status || 'NG'}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 p-4 shadow-lg z-40 lg:left-72">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex gap-6 items-center">
                        <div className="hidden md:block">
                            <p className="text-xs font-bold text-slate-500 uppercase">Itens Selecionados</p>
                            <p className="font-bold text-lg">{selectedIds.length}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase">Valor Total</p>
                            <p className="font-bold text-lg text-blue-600">{formatCurrency(totalSelectedValue)}</p>
                        </div>
                    </div>
                    <Button
                        disabled={selectedIds.length === 0}
                        onClick={() => setShowModal(true)}
                        size="lg"
                        className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30"
                    >
                        Gerar Baixa / Associar NF
                    </Button>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <Card className="max-w-md w-full bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700">
                        <h3 className="font-bold text-xl mb-4">Confirmar Baixa de SCRAP</h3>
                        <p className="text-sm text-slate-500 mb-6">
                            Você está prestes a dar baixa em <b>{selectedIds.length} itens</b> totalizando <b>{formatCurrency(totalSelectedValue)}</b>.
                        </p>

                        <div className="mb-6">
                            <Input
                                label="Número da Nota Fiscal"
                                value={nfNumber}
                                onChange={e => setNfNumber(e.target.value)}
                                placeholder="Digite a NF (Apenas números)..."
                                autoFocus
                            />
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
                            <Button onClick={handleProcess} disabled={isProcessing || !nfNumber}>
                                {isProcessing ? 'Processando...' : 'Confirmar Baixa'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

const HistorySentTab = ({ scraps, users }: { scraps: ScrapData[], users: User[] }) => {
    const sentScraps = useMemo(() => scraps.filter(s => s.situation === 'SENT'), [scraps]);

    const groups = useMemo(() => {
        const g: Record<string, ScrapData[]> = {};
        sentScraps.forEach(s => {
            const nf = s.nfNumber || 'SEM_NF';
            if (!g[nf]) g[nf] = [];
            g[nf].push(s);
        });
        return g;
    }, [sentScraps]);

    return (
        <div className="space-y-4">
            {Object.keys(groups).length === 0 && <p className="text-center text-slate-500 py-10">Nenhum envio registrado.</p>}

            {Object.entries(groups)
                .sort((a, b) => new Date(b[1][0].sentAt || '').getTime() - new Date(a[1][0].sentAt || '').getTime())
                .map(([nf, items]) => (
                    <HistoryGroupCard key={nf} nf={nf} items={items} users={users} />
                ))}
        </div>
    );
};

const HistoryGroupCard = ({ nf, items, users }: { nf: string, items: ScrapData[], users: User[] }) => {
    const [expanded, setExpanded] = useState(false);

    const totalValue = items.reduce((acc, s) => acc + (s.totalValue || 0), 0);
    const sentDate = items[0].sentAt ? new Date(items[0].sentAt).toLocaleDateString() : '-';
    const sentByMatricula = items[0].sentBy;
    const sentByName = users.find(u => u.matricula === sentByMatricula)?.name || sentByMatricula || '-';

    const specificItems = ['FRONT', 'REAR', 'OCTA', 'CAMERA', 'BATERIA RMA', 'BATERIA SCRAP'];
    const summary: Record<string, { qty: number, val: number }> = {};

    specificItems.forEach(k => summary[k] = { qty: 0, val: 0 });
    summary['MIUDEZAS'] = { qty: 0, val: 0 };

    items.forEach(s => {
        let key = 'MIUDEZAS';
        const itemUpper = (s.item || '').toUpperCase();
        const found = specificItems.find(spec => itemUpper.includes(spec));
        if (found) key = found;

        summary[key].qty += (s.qty || 0);
        summary[key].val += (s.totalValue || 0);
    });

    return (
        <Card className={`border-l-4 border-l-blue-500 transition-all ${expanded ? 'ring-2 ring-blue-500/20' : ''}`}>
            <div className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
                <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2.5 rounded-lg text-blue-600 dark:text-blue-400 font-bold">
                            <FileText size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">NF: {nf}</h3>
                            <p className="text-xs text-slate-500 dark:text-zinc-400">
                                Enviado em {sentDate} por <b>{sentByName}</b>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:bg-green-50 border border-green-200 h-10"
                            onClick={(e) => {
                                e.stopPropagation();
                                exportInvoiceReport(items, nf);
                            }}
                        >
                            <FileSpreadsheet size={16} className="mr-2" />
                            Excel
                        </Button>
                        <div className="text-right">
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(totalValue)}</p>
                            <p className="text-xs text-slate-500">{items.length} itens registrados</p>
                        </div>
                    </div>
                    <div>
                        {expanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                    </div>
                </div>

                {expanded && (
                    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-zinc-800 animate-fadeIn">
                        <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Resumo do Envio</h4>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {Object.entries(summary).map(([key, data]) => {
                                if (data.qty === 0) return null;
                                return (
                                    <div key={key} className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded px-3 py-1.5 text-xs">
                                        <span className="font-bold text-slate-700 dark:text-zinc-300">{key}:</span>
                                        <span className="ml-1 text-slate-500">{data.qty}un</span>
                                        <span className="ml-1 font-mono text-blue-600 dark:text-blue-400">({formatCurrency(data.val)})</span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="w-full overflow-x-auto pb-4 mb-4 touch-pan-x border border-gray-200 dark:border-zinc-800 rounded-xl">
                            <table className="w-full text-xs text-left min-w-[600px]">
                                <thead className="bg-slate-100 dark:bg-zinc-900 text-slate-500">
                                    <tr>
                                        <th className="p-2">Item</th>
                                        <th className="p-2">Modelo</th>
                                        <th className="p-2">Qtd</th>
                                        <th className="p-2 text-right">Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(i => (
                                        <tr key={i.id} className="border-b border-slate-100 dark:border-zinc-800 last:border-0">
                                            <td className="p-2">{i.item}</td>
                                            <td className="p-2">{i.model}</td>
                                            <td className="p-2">{i.qty}</td>
                                            <td className="p-2 text-right font-mono">{formatCurrency(i.totalValue)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
};
