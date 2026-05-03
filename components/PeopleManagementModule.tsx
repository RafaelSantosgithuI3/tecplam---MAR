import React, { useState, useEffect, useMemo } from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { Input } from './Input';
import { Shield, Plus, Search, User as UserIcon, List, ArrowLeft, CheckCircle, Clock, Save, Download, HandMetal, Scan, X, Hand, Pencil, Trash2 } from 'lucide-react';
import { apiFetch } from '../services/networkConfig';
import { QRStreamReader } from './QRStreamReader';
import { ExcelFidelityPreview } from './ExcelFidelityPreview';
import { exportLeaderLayout, exportModelLayout, exportGloveControl, downloadAttendanceExcel, getAttendanceExcelBuffer } from '../services/excelService';

interface PeopleManagementModuleProps {
    onBack: () => void;
    currentUser: any;
    hasTabAccess?: (moduleName: string, tabKey: string) => boolean;
}

type Tab = 'CADASTRO' | 'CONSULTA' | 'PRESENCA' | 'LAYOUT' | 'LUVAS' | 'EDICAO';

export const PeopleManagementModule = ({ onBack, currentUser, hasTabAccess }: PeopleManagementModuleProps) => {
    const PEOPLE_MANAGEMENT_ACTIVE_TAB_KEY = 'activeTab_PeopleManagementModule';
    const sortByLocale = <T,>(items: T[], getValue: (item: T) => unknown) => {
        return [...(Array.isArray(items) ? items : [])].sort((a, b) => String(getValue(a) ?? '').localeCompare(String(getValue(b) ?? '')));
    };
    const isLeadershipRole = (role: unknown) => {
        const roleUp = String(role || '').toUpperCase();
        return roleUp.includes('LÍDER')
            || roleUp.includes('LIDER')
            || roleUp.includes('COORDENADOR')
            || roleUp.includes('SUPERVISOR')
            || roleUp.includes('TECNICO DE PROCESSO')
            || roleUp.includes('TÉCNICO DE PROCESSO');
    };
    const getLayoutRolePriority = (role: string) => {
        const normalizedRole = (role || '').toLowerCase();
        if (normalizedRole.includes('desmonte')) return 0;
        if (normalizedRole.includes('alimentador')) return 1;
        if (normalizedRole.includes('montador')) return 2;
        return 3;
    };

    const getGloveRolePriority = (role: string) => {
        const normalizedRole = (role || '').toLowerCase();
        if (normalizedRole.includes('lider') || normalizedRole.includes('líder')) return 0;
        if (normalizedRole.includes('desmonte')) return 1;
        if (normalizedRole.includes('alimentador')) return 2;
        if (normalizedRole.includes('montador')) return 3;
        return 4;
    };

    const isActiveEmployee = (employee: any) => {
        const status = String(employee?.status || '').trim().toUpperCase();
        if (!status) return true;
        return status !== 'DESLIGADO' && status !== 'INATIVO';
    };

    const allTabs: Tab[] = ['CADASTRO', 'CONSULTA', 'EDICAO', 'PRESENCA', 'LAYOUT', 'LUVAS'];
    const determineInitialTab = (): Tab => {
        const saved = sessionStorage.getItem(PEOPLE_MANAGEMENT_ACTIVE_TAB_KEY) as Tab | null;
        if (saved && allTabs.includes(saved) && (!hasTabAccess || hasTabAccess('PEOPLE_MANAGEMENT', saved))) {
            return saved;
        }
        if (!hasTabAccess) return 'CADASTRO';
        const allowed = allTabs.find(t => hasTabAccess('PEOPLE_MANAGEMENT', t));
        return allowed || 'CADASTRO';
    };
    const [tab, setTab] = useState<Tab>(determineInitialTab());
    const [employees, setEmployees] = useState<any[]>([]);
    const [leaders, setLeaders] = useState<any[]>([]);
    const [models, setModels] = useState<any[]>([]);
    const [workstations, setWorkstations] = useState<any[]>([]);
    const [configRoles, setConfigRoles] = useState<any[]>([]);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [unifiedModels, setUnifiedModels] = useState<any[]>([]);
    const [printSelectedModel, setPrintSelectedModel] = useState('');
    const [layoutMasterModel, setLayoutMasterModel] = useState('');
    const [viewMode, setViewMode] = useState<'posto' | 'colaborador'>('colaborador');
    const [showInactive, setShowInactive] = useState(false);

    useEffect(() => {
        loadBaseData();
    }, []);

    useEffect(() => {
        sessionStorage.setItem(PEOPLE_MANAGEMENT_ACTIVE_TAB_KEY, tab);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [tab]);

    useEffect(() => {
        loadLayoutsByModel(layoutMasterModel);
    }, [layoutMasterModel]);

    // Reset states when tab changes
    useEffect(() => {
        setFormData({
            matricula: '', photo: '', fullName: '', shift: '', role: '', sector: '',
            superiorId: '', idlSt: '', type: '', status: '', address: '', addressNum: '', whatsapp: '', neighborhood: ''
        });
        setIsEdit(false);
        setSearchQuery('');
        setConsultResult(null);
        setShowMissesModal(false);
        setEditQuery('');
        setEditFound(false);
        setAttSearchQuery('');
        setAttSelectedEmployee(null);
        setLineSearch('');
        setLinePreview(null);
    }, [tab]);

    const loadBaseData = async () => {
        try {
            const users = await apiFetch('/users', { useCache: true });
            if (Array.isArray(users)) {
                setLeaders(
                    sortByLocale(
                        users.filter(u => isLeadershipRole(u?.role) && isActiveEmployee(u)),
                        (u: any) => u?.fullName || u?.name
                    )
                );
            }
            const emp = await apiFetch(`/employees?superiorId=${currentUser.matricula}`);
            if (Array.isArray(emp)) setEmployees(sortByLocale(emp, (employee: any) => employee?.fullName));

            const mods = await apiFetch('/config/models', { useCache: true });
            if (Array.isArray(mods)) setModels(sortByLocale(mods, (model: any) => model?.name));

            const wks = await apiFetch('/workstations', { useCache: true });
            if (Array.isArray(wks)) setWorkstations(sortByLocale(wks, (workstation: any) => workstation?.name));

            const unifiedList = await apiFetch('/config/models/unified', { useCache: true });
            if (Array.isArray(unifiedList)) setUnifiedModels(sortByLocale(unifiedList, (item: any) => item?.name || item?.modelName || item?.model || item));

            const fetchedRoles = await apiFetch('/config/roles', { useCache: true });
            if (Array.isArray(fetchedRoles)) setConfigRoles(sortByLocale(fetchedRoles, (role: any) => role?.name || role?.id));
        } catch (e) {
            console.error('Erro ao carregar dados base', e);
        }
    };

    // TAB 1: CADASTRO
    const [formData, setFormData] = useState({
        matricula: '', photo: '', fullName: '', shift: '', role: '', sector: '',
        superiorId: '', idlSt: '', type: '', status: '', address: '', addressNum: '', whatsapp: '', neighborhood: ''
    });
    const [isEdit, setIsEdit] = useState(false);

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (ev.target?.result) setFormData(prev => ({ ...prev, photo: ev.target!.result as string }));
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const handleSaveEmployee = async () => {
        if (!formData.matricula || !formData.fullName || !formData.shift || !formData.role || !formData.sector) return alert('Matrícula, Nome, Turno, Função e Setor são obrigatórios.');
        try {
            await apiFetch('/employees', {
                method: 'POST',
                body: JSON.stringify({ ...formData, isEdit })
            });
            alert('Salvo!');
            setFormData({
                matricula: '', photo: '', fullName: '', shift: '', role: '', sector: '',
                superiorId: '', idlSt: '', type: '', status: '', address: '', addressNum: '', whatsapp: '', neighborhood: ''
            });
            setIsEdit(false);
            loadBaseData();
        } catch (e) {
            alert('Erro ao salvar (Matrícula duplicada?)');
        }
    };

    const handleMatriculaBlur = async () => {
        const mat = formData.matricula?.trim();
        if (!mat) {
            setIsEdit(false);
            return;
        }
        try {
            const user = await apiFetch(`/employees/search/${mat}`);
            if (user && user.matricula) {
                setFormData(prev => ({
                    ...prev,
                    ...user, // Populate all fields from fetched user
                    photo: user.photo || prev.photo, // Keep existing photo if not in fetched user
                    superiorId: user.superiorId || '' // Ensure superiorId is set or empty
                }));
                setIsEdit(true);
            } else {
                setIsEdit(false);
                // Clear fields if not found, except matricula
                setFormData(prev => ({
                    ...prev,
                    photo: '', fullName: '', shift: '', role: '', sector: '',
                    superiorId: '', idlSt: '', type: '', status: '', address: '', addressNum: '', whatsapp: '', neighborhood: ''
                }));
            }
        } catch (e) {
            setIsEdit(false);
            // Clear fields if error, except matricula
            setFormData(prev => ({
                ...prev,
                photo: '', fullName: '', shift: '', role: '', sector: '',
                superiorId: '', idlSt: '', type: '', status: '', address: '', addressNum: '', whatsapp: '', neighborhood: ''
            }));
        }
    };

    const renderCadastro = () => (
        <Card className="space-y-4">
            <h3 className="text-lg font-bold text-slate-800 dark:text-zinc-100">Cadastro de Colaborador</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Foto</label>
                    <input type="file" accept="image/*" onChange={handlePhotoChange} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100 dark:file:bg-zinc-800 dark:file:text-cyan-400" />
                    {formData.photo && <img src={formData.photo} alt="Preview" className="h-20 w-20 object-cover rounded mt-2" />}
                </div>
                <Input label="Matrícula" value={formData.matricula} onChange={e => setFormData({ ...formData, matricula: e.target.value })} onBlur={handleMatriculaBlur} />
                <Input label="Nome Completo" value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Turno</label>
                    <select className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100" value={formData.shift} onChange={e => setFormData({ ...formData, shift: e.target.value })}>
                        <option value="">Selecione o turno</option>
                        <option value="1º TURNO">1º TURNO</option>
                        <option value="2º TURNO">2º TURNO</option>
                    </select>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Função</label>
                    <select className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                        <option value="">Selecione...</option>
                        {configRoles.map(r => <option key={r.name || r.id} value={r.name || r.id}>{r.name || r.id}</option>)}
                    </select>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Setor</label>
                    <select className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100" value={formData.sector} onChange={e => setFormData({ ...formData, sector: e.target.value })}>
                        <option value="">Selecione...</option>
                        {['PRODUÇÃO', 'LOGISTICA', 'ASG', 'MANUTENÇÃO', 'RETRABALHO', 'QUALIDADE', 'QUALIDADE PQC', 'QUALIDADE RMA', 'QUALIDADE IQC', 'QUALIDADE OQC', 'REPARO', 'PCP'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Superior Imediato</label>
                    <select className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100" value={formData.superiorId} onChange={e => setFormData({ ...formData, superiorId: e.target.value })}>
                        <option value="">Selecione um Líder...</option>
                        {leaders.map(l => <option key={l.matricula} value={l.matricula}>{l.name} ({l.matricula})</option>)}
                    </select>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">IDL-ST</label>
                    <select className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100" value={formData.idlSt} onChange={e => setFormData({ ...formData, idlSt: e.target.value })}>
                        <option value="">Selecione...</option>
                        <option value="DIRETO">DIRETO</option>
                        <option value="INDIRETO">INDIRETO</option>
                    </select>
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Tipo</label>
                    <select className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                        <option value="">Selecione...</option>
                        <option value="EFETIVO">EFETIVO</option>
                        <option value="TEMPORARIO">TEMPORARIO</option>
                        <option value="APRENDIZ">APRENDIZ</option>
                        <option value="ESTAGIARIO">ESTAGIARIO</option>
                        <option value="GRAVIDA">GRAVIDA</option>
                        <option value="LICENÇA INSS">LICENÇA INSS</option>
                        <option value="PCD">PCD</option>
                    </select>
                </div>
                <Input label="Logradouro" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                <Input label="Número (Endereço)" value={formData.addressNum} onChange={e => setFormData({ ...formData, addressNum: e.target.value })} />
                <Input label="Bairro" value={formData.neighborhood} onChange={e => setFormData({ ...formData, neighborhood: e.target.value })} />
                <Input label="WhatsApp" value={formData.whatsapp} onChange={e => setFormData({ ...formData, whatsapp: e.target.value })} />
            </div>
            <div className="flex justify-end mt-4">
                <Button onClick={handleSaveEmployee}><Save size={16} /> {isEdit ? 'Atualizar Colaborador' : 'Salvar Colaborador'}</Button>
            </div>
        </Card>
    );

    // TAB 2: CONSULTA
    const [searchQuery, setSearchQuery] = useState('');
    const [consultResult, setConsultResult] = useState<any>(null);
    const [showMissesModal, setShowMissesModal] = useState(false);

    // Filters for modal
    const [historyFilterType, setHistoryFilterType] = useState<'semana' | 'mes' | 'ano' | 'todos'>('mes');
    const [historyFilterWeek, setHistoryFilterWeek] = useState<string>(''); // YYYY-Www
    const [historyFilterMonth, setHistoryFilterMonth] = useState<string>(''); // YYYY-MM
    const [historyFilterYear, setHistoryFilterYear] = useState<string>(''); // YYYY

    const [showScanner, setShowScanner] = useState(false);
    const isAndroid = navigator.userAgent.toLowerCase().includes('android');

    const handleConsult = async (overrideQuery?: string | React.MouseEvent) => {
        const queryToUse = typeof overrideQuery === 'string' ? overrideQuery : searchQuery;
        if (!queryToUse) return;
        try {
            const res = await apiFetch(`/employees/search/${encodeURIComponent(queryToUse.trim())}?superiorId=${currentUser.matricula}`);
            if (res && res.matricula) {
                // Initialize current dates
                const now = new Date();

                // Initialize current filters correctly
                const yyyy = now.getFullYear();
                const mm = String(now.getMonth() + 1).padStart(2, '0');

                // Get ISO week
                const tempDate = new Date(now.valueOf());
                const dayn = (now.getDay() + 6) % 7;
                tempDate.setDate(tempDate.getDate() - dayn + 3);
                const firstThursday = tempDate.valueOf();
                tempDate.setMonth(0, 1);
                if (tempDate.getDay() !== 4) {
                    tempDate.setMonth(0, 1 + ((4 - tempDate.getDay()) + 7) % 7);
                }
                const ww = String(1 + Math.ceil((firstThursday - tempDate.valueOf()) / 604800000)).padStart(2, '0');

                setHistoryFilterWeek(`${yyyy}-W${ww}`);
                setHistoryFilterMonth(`${yyyy}-${mm}`);
                setHistoryFilterYear(`${yyyy}`);

                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();
                let misses = 0;
                let rank = 10;
                res.attendanceLogs?.forEach((log: any) => {
                    const d = new Date(log.date);
                    if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                        const logType = String(log.type || '').toUpperCase();
                        if (['FALTA', 'ATESTADO', 'ATRASO', 'SAIDA'].includes(logType)) {
                            misses++;
                            if (logType === 'FALTA') rank -= 1;
                            if (logType === 'ATESTADO' || logType === 'ATRASO' || logType === 'SAIDA') rank -= 0.5;
                        }
                    }
                });

                // Carregando layouts do colaborador
                const layouts = await apiFetch(`/layout?matricula=${res.matricula}`);
                const allocatedWorkstations = Array.isArray(layouts) ? layouts.map((l: any) => `${l.modelo} — ${l.ordemPosto}`) : [];

                setConsultResult({ ...res, misses, rank: Math.max(0, rank), allocatedWorkstations });


            } else {
                setConsultResult(null);
                alert('Não encontrado');
            }
        } catch (e: any) {
            setConsultResult(null);
            alert('Erro na busca: ' + (e.message || 'Falha no servidor. Verifique a consola.'));
        }
    };

    const renderConsulta = () => (
        <div className="space-y-4">
            <Card className="flex gap-2 items-end">
                <div className="flex-1">
                    <Input label="Buscar Matrícula" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleConsult()} />
                </div>
                {isAndroid && (
                    <Button variant="secondary" onClick={() => setShowScanner(true)}>
                        <Scan size={16} /> Ler QR Code
                    </Button>
                )}
                <Button onClick={handleConsult}><Search size={16} /> Buscar</Button>
            </Card>

            {showScanner && (
                <QRStreamReader
                    onScanSuccess={(text) => {
                        setShowScanner(false);
                        setSearchQuery(text);
                        handleConsult(text);
                    }}
                    onClose={() => setShowScanner(false)}
                />
            )}

            {!consultResult && (
                <div className="mt-4">
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-2">Colaboradores da sua equipe</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {subordinados
                            .filter(e => !searchQuery || e.matricula.toLowerCase().includes(searchQuery.toLowerCase()) || e.fullName.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(emp => (
                                <div key={emp.matricula} onClick={() => { setSearchQuery(emp.matricula); handleConsult(emp.matricula); }} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-cyan-500 cursor-pointer">
                                    {emp.photo ? <img src={emp.photo} className="w-10 h-10 rounded-full object-cover shrink-0" /> : <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><UserIcon size={20} className="text-slate-400" /></div>}
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm text-slate-800 dark:text-zinc-100 truncate">{emp.fullName}</p>
                                        <p className="text-xs text-slate-500 font-mono truncate">{emp.matricula}</p>
                                        <p className="text-xs text-slate-500 truncate">{emp.role} • {emp.shift}</p>
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {consultResult && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                        <Card className="flex flex-col items-center text-center w-full">
                            {consultResult.photo ? (
                                <img src={consultResult.photo} alt="Colaborador" className="w-52 h-52 object-cover rounded-2xl border border-slate-200 mx-auto" />
                            ) : (
                                <div className="w-52 h-52 bg-slate-200 dark:bg-zinc-800 rounded-full flex items-center justify-center shrink-0 mx-auto">
                                    <UserIcon size={80} className="text-slate-400" />
                                </div>
                            )}
                            <div className="flex flex-col justify-center items-center w-full mt-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-800 dark:text-zinc-100 mb-1">{consultResult.fullName}</h2>
                                    <p className="inline-block bg-slate-100 dark:bg-zinc-800 px-3 py-1 rounded-full text-sm font-medium text-slate-600 dark:text-zinc-400">
                                        Matrícula: {consultResult.matricula}
                                    </p>
                                </div>
                                <div className="flex flex-row justify-center gap-6 items-center w-full mt-4">
                                    <div className="flex-1 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 px-4 py-2 rounded-xl text-center border border-cyan-100 dark:border-cyan-900/40">
                                        <p className="text-[10px] uppercase font-bold tracking-wider mb-1">Rank do Mês</p>
                                        <p className="text-xl font-black">{consultResult.rank.toFixed(1)}</p>
                                    </div>
                                    <button
                                        onClick={() => setShowMissesModal(true)}
                                        className="flex-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-2 rounded-xl text-center border border-red-100 dark:border-red-900/40 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors cursor-pointer flex flex-col items-center justify-center"
                                    >
                                        <p className="text-[10px] uppercase font-bold tracking-wider mb-1 whitespace-nowrap">Histórico Completo</p>
                                        <p className="text-xl font-black">{consultResult.misses} Ausências</p>
                                    </button>
                                </div>
                                <button
                                    onClick={() => { setConsultResult(null); setSearchQuery(''); }}
                                    className="mt-4 px-4 py-2 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
                                >
                                    <ArrowLeft size={14} className="inline mr-2" /> Voltar para Lista
                                </button>
                            </div>
                        </Card>
                        <Card className="flex flex-col w-full">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-100 uppercase tracking-wide border-b border-slate-100 dark:border-zinc-800 pb-2 mb-3 h-fit">Postos Habilitados</h3>
                            <div className="flex-1 overflow-y-auto max-h-40">
                                {consultResult.allocatedWorkstations && consultResult.allocatedWorkstations.length > 0 ? (
                                    <div className="flex flex-col gap-2">
                                        {consultResult.allocatedWorkstations.map((ws: string, i: number) => (
                                            <span key={i} className="px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-bold border border-indigo-100 dark:border-indigo-900/40">
                                                {ws}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-full text-slate-400 text-sm font-medium italic">
                                        Não alocado em nenhum posto
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-0">
                        <Card className="rounded-t-none md:rounded-tr-xl border-t-0 space-y-3">
                            <h3 className="font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-zinc-800">
                                <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                                Dados Pessoais & Empresa
                            </h3>
                            <div className="grid grid-cols-2 gap-y-3 text-sm">
                                <div><p className="text-xs text-slate-500 uppercase font-bold">Função</p><p className="font-medium text-slate-700 dark:text-zinc-300">{consultResult.role}</p></div>
                                <div><p className="text-xs text-slate-500 uppercase font-bold">Setor</p><p className="font-medium text-slate-700 dark:text-zinc-300">{consultResult.sector}</p></div>
                                <div><p className="text-xs text-slate-500 uppercase font-bold">Turno</p><p className="font-medium text-slate-700 dark:text-zinc-300">{consultResult.shift}</p></div>
                            </div>
                        </Card>

                        <Card className="space-y-3">
                            <h3 className="font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-zinc-800">
                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                Contato & Localização
                            </h3>
                            <div className="grid grid-cols-1 gap-y-3 text-sm">
                                <div><p className="text-xs text-slate-500 uppercase font-bold">WhatsApp</p><p className="font-medium text-slate-700 dark:text-zinc-300">{consultResult.whatsapp || 'Não informado'}</p></div>
                                <div><p className="text-xs text-slate-500 uppercase font-bold">Endereço</p><p className="font-medium text-slate-700 dark:text-zinc-300">{consultResult.address || 'Não informado'}, {consultResult.addressNum || ''}</p></div>
                                <div><p className="text-xs text-slate-500 uppercase font-bold">Bairro</p><p className="font-medium text-slate-700 dark:text-zinc-300">{consultResult.neighborhood || 'Não informado'}</p></div>
                            </div>
                        </Card>

                        <Card className="space-y-3">
                            <h3 className="font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-zinc-800">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                Status & Liderança
                            </h3>
                            <div className="grid grid-cols-2 gap-y-3 text-sm">
                                <div><p className="text-xs text-slate-500 uppercase font-bold">STATUS</p><p className="font-medium text-slate-700 dark:text-zinc-300">{consultResult.status || '-'}</p></div>
                                <div><p className="text-xs text-slate-500 uppercase font-bold">Tipo</p><p className="font-medium text-slate-700 dark:text-zinc-300">{consultResult.type || '-'}</p></div>
                                <div><p className="text-xs text-slate-500 uppercase font-bold">IDL-ST</p><p className="font-medium text-slate-700 dark:text-zinc-300">{consultResult.idlSt || '-'}</p></div>
                                <div className="col-span-2"><p className="text-xs text-slate-500 uppercase font-bold">Líder Atual</p><p className="font-medium text-slate-700 dark:text-zinc-300">{leaders.find(l => l.matricula === consultResult.superiorId)?.name || consultResult.superiorId || '-'}</p></div>
                            </div>
                        </Card>

                        <Card className="space-y-3 h-full">
                            <h3 className="font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-zinc-800">
                                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                EPIs (Luvas)
                            </h3>
                            <div className="grid grid-cols-2 gap-y-3 text-sm">
                                <div><p className="text-xs text-slate-500 uppercase font-bold">Tamanho da Luva</p><p className="font-medium text-slate-700 dark:text-zinc-300">{consultResult.gloveSize || 'Não definido'}</p></div>
                                <div><p className="text-xs text-slate-500 uppercase font-bold">Tipo da Luva</p><p className="font-medium text-slate-700 dark:text-zinc-300">{consultResult.gloveType || 'Não definido'}</p></div>
                                <div className="col-span-2"><p className="text-xs text-slate-500 uppercase font-bold">Trocas a mais por semana</p><p className="font-medium text-slate-700 dark:text-zinc-300">{consultResult.gloveExchanges || '0'}</p></div>
                            </div>
                        </Card>
                    </div>

                    {consultResult.previousLeaders && (() => {
                        let hist = [];
                        try { hist = JSON.parse(consultResult.previousLeaders); } catch (e) { }
                        if (hist.length > 0) {
                            return (
                                <Card className="bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30">
                                    <p className="text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-2 uppercase tracking-wide">Histórico Recente de Líderes</p>
                                    <div className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap overflow-hidden text-ellipsis">
                                        {hist.map((l: string, i: number) => {
                                            const leaderObj = leaders.find(ld => ld.matricula === l);
                                            const leaderName = leaderObj ? `${leaderObj.name} (${l})` : l;
                                            return <span key={i}>• <span className="font-medium">{leaderName}</span>{i < hist.length - 1 ? ' | ' : ''}</span>;
                                        })}
                                    </div>
                                </Card>
                            );
                        }
                        return null;
                    })()}

                    {showMissesModal && (() => {
                        const allLogs = consultResult.attendanceLogs || [];
                        const validLogs = allLogs.filter((l: any) => l.type === 'FALTA' || l.type === 'ATESTADO' || l.type === 'ATRASO' || l.type === 'SAIDA');

                        const filteredLogs = validLogs.filter((log: any) => {
                            const d = new Date(log.date);
                            if (historyFilterType === 'semana') {
                                if (!historyFilterWeek) return true;
                                const tempDate = new Date(d.valueOf());
                                const dayn = (d.getDay() + 6) % 7;
                                tempDate.setDate(tempDate.getDate() - dayn + 3);
                                const firstThursday = tempDate.valueOf();
                                tempDate.setMonth(0, 1);
                                if (tempDate.getDay() !== 4) {
                                    tempDate.setMonth(0, 1 + ((4 - tempDate.getDay()) + 7) % 7);
                                }
                                const ww = String(1 + Math.ceil((firstThursday - tempDate.valueOf()) / 604800000)).padStart(2, '0');
                                const logWeek = `${tempDate.getFullYear()}-W${ww}`;
                                return logWeek === historyFilterWeek;
                            }
                            if (historyFilterType === 'mes') {
                                if (!historyFilterMonth) return true;
                                const logMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                                return logMonth === historyFilterMonth;
                            }
                            if (historyFilterType === 'ano') {
                                if (!historyFilterYear) return true;
                                return String(d.getFullYear()) === historyFilterYear;
                            }
                            return true;
                        });

                        let dynamicRank = 10;
                        filteredLogs.forEach((log: any) => {
                            if (log.type === 'FALTA') dynamicRank -= 1;
                            if (log.type === 'ATESTADO' || log.type === 'ATRASO' || log.type === 'SAIDA') dynamicRank -= 0.5;
                        });
                        dynamicRank = Math.max(0, dynamicRank);

                        return (
                            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowMissesModal(false) }}>
                                <Card className="w-full max-w-lg space-y-4 max-h-[80vh] flex flex-col shadow-2xl border-0 ring-1 ring-white/10 relative">
                                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-zinc-800/50 pb-3 shrink-0">
                                        <h3 className="font-bold text-lg text-slate-800 dark:text-zinc-100 flex items-center gap-2">
                                            <Clock size={16} className="text-red-500" /> Histórico Completo
                                        </h3>
                                        <button onClick={() => setShowMissesModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors bg-slate-100 dark:bg-zinc-800 rounded-full w-8 h-8 flex items-center justify-center">×</button>
                                    </div>

                                    <div className="flex flex-col gap-3 bg-slate-50 dark:bg-zinc-900/50 p-3 rounded-xl shrink-0">
                                        <div className="flex items-center gap-2">
                                            <select
                                                className="bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm font-medium outline-none flex-1"
                                                value={historyFilterType} onChange={e => setHistoryFilterType(e.target.value as any)}
                                            >
                                                <option value="semana">Por Semana</option>
                                                <option value="mes">Por Mês</option>
                                                <option value="ano">Por Ano</option>
                                                <option value="todos">Todo o Período</option>
                                            </select>

                                            {historyFilterType === 'semana' && (
                                                <input type="week" value={historyFilterWeek} onChange={e => setHistoryFilterWeek(e.target.value)} className="bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm font-medium outline-none flex-1" />
                                            )}
                                            {historyFilterType === 'mes' && (
                                                <input type="month" value={historyFilterMonth} onChange={e => setHistoryFilterMonth(e.target.value)} className="bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm font-medium outline-none flex-1" />
                                            )}
                                            {historyFilterType === 'ano' && (
                                                <input type="number" min="2000" max="2100" step="1" value={historyFilterYear} onChange={e => setHistoryFilterYear(e.target.value)} placeholder="YYYY" className="bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm font-medium outline-none w-24 text-center" />
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between border-t border-slate-200 dark:border-zinc-800 pt-3 mt-1">
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rank do Período</p>
                                            <p className={`text-2xl font-black ${dynamicRank >= 9 ? 'text-emerald-500' : dynamicRank >= 7 ? 'text-amber-500' : 'text-red-500'}`}>
                                                {dynamicRank.toFixed(1)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                                        {filteredLogs.length > 0 ? (
                                            <ul className="space-y-2">
                                                {filteredLogs
                                                    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                                    .map((log: any, i: number) => (
                                                        <li key={i} className="flex justify-between items-center p-3 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="font-bold text-slate-700 dark:text-zinc-200">{formatAttendanceDisplayDate(log.date)}</span>
                                                                <span className="text-[10px] uppercase text-slate-400">Por: {log.loggedById}</span>
                                                            </div>
                                                            <span className={`px-3 py-1 text-[10px] uppercase font-black tracking-wider rounded-lg ${log.type === 'FALTA' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border border-red-100 dark:border-red-900/30' :
                                                                log.type === 'ATRASO' ? 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400 border border-orange-100 dark:border-orange-900/30' :
                                                                    'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30'
                                                                }`}>
                                                                {log.type}
                                                            </span>
                                                        </li>
                                                    ))}
                                            </ul>
                                        ) : (
                                            <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
                                                <CheckCircle size={32} className="text-emerald-500" />
                                                <p className="text-slate-500 font-medium">Nenhum apontamento neste período.</p>
                                            </div>
                                        )}
                                    </div>
                                    <Button className="w-full mt-2" onClick={() => setShowMissesModal(false)} variant="secondary">Fechar Janela</Button>
                                </Card>
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );

    // TAB 3: PRESENÇA
    const [attSearchQuery, setAttSearchQuery] = useState('');
    const [attSelectedEmployee, setAttSelectedEmployee] = useState<any>(null);
    const [attType, setAttType] = useState('FALTA');
    const [attTime, setAttTime] = useState('');
    const todayAttendanceDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(() => todayAttendanceDate());
    const [endDate, setEndDate] = useState(() => todayAttendanceDate());
    const [attendanceShiftFilter, setAttendanceShiftFilter] = useState<'ALL' | '1º TURNO' | '2º TURNO'>('ALL');
    const [attEditingLog, setAttEditingLog] = useState<any>(null);
    const [attDate, setAttDate] = useState(() => todayAttendanceDate());
    const [previewBuffer, setPreviewBuffer] = useState<ArrayBuffer | null>(null);

    const formatAttendanceTime = (value: unknown) => {
        const raw = String(value ?? '').trim();
        return raw || '-';
    };

    const normalizeAttendanceDate = (value: unknown) => {
        if (!value) return '';
        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) return '';
            const year = value.getFullYear();
            const month = String(value.getMonth() + 1).padStart(2, '0');
            const day = String(value.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        const rawValue = String(value).trim();
        if (!rawValue) return '';

        const matchedDate = rawValue.match(/^(\d{4}-\d{2}-\d{2})/);
        if (matchedDate) return matchedDate[1];

        const parsed = new Date(rawValue);
        if (Number.isNaN(parsed.getTime())) return '';

        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const formatAttendanceDisplayDate = (value: unknown) => {
        const normalized = normalizeAttendanceDate(value);
        if (!normalized) return '-';
        const [year, month, day] = normalized.split('-');
        if (!year || !month || !day) return normalized;
        return `${day}/${month}/${year}`;
    };

    const shouldShowAttTimeInput = attType === 'ATRASO' || attType === 'SAIDA';
    const attTimeLabel = attType === 'SAIDA' ? 'Horário de Saída' : 'Horário de Chegada';

    const filteredAttendanceLogs = useMemo(() => {
        const team = employees.filter((employee: any) => employee.superiorId === currentUser.matricula && isActiveEmployee(employee));
        const normalizedStartDate = String(startDate || '').trim();
        const normalizedEndDate = String(endDate || '').trim();

        return team
            .flatMap((employee: any) =>
                (Array.isArray(employee?.attendanceLogs) ? employee.attendanceLogs : []).map((log: any) => ({
                    ...log,
                    matricula: employee.matricula,
                    fullName: employee.fullName,
                    shift: employee.shift,
                    role: employee.role,
                }))
            )
            .filter((log: any) => ['FALTA', 'ATRASO', 'ATESTADO', 'SAIDA'].includes(String(log?.type || '').toUpperCase()))
            .filter((log: any) => {
                const logDate = String(log?.date || '').substring(0, 10);
                const isAfterStart = !normalizedStartDate || logDate >= normalizedStartDate;
                const isBeforeEnd = !normalizedEndDate || logDate <= normalizedEndDate;
                return Boolean(logDate) && isAfterStart && isBeforeEnd;
            })
            .filter((log: any) => attendanceShiftFilter === 'ALL' || log.shift === attendanceShiftFilter)
            .sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')));
    }, [employees, startDate, endDate, attendanceShiftFilter]);

    const handleSearchSubordinado = () => {
        const found = employees
            .filter(e => e.superiorId === currentUser.matricula && isActiveEmployee(e) && (attendanceShiftFilter === 'ALL' || e.shift === attendanceShiftFilter))
            .find(e => e.matricula.includes(attSearchQuery) || e.fullName.toLowerCase().includes(attSearchQuery.toLowerCase()));

        if (found) {
            setAttSelectedEmployee(found);
            setAttEditingLog(null);
            setAttType('FALTA');
            setAttTime('');
            setAttDate(todayAttendanceDate());
        } else {
            alert('Colaborador não encontrado ou não é seu subordinado.');
        }
    };

    const handleEditAttendanceLog = (log: any) => {
        const employee = employees.find((item: any) => item.matricula === log.matricula || item.matricula === log.employeeId);
        if (!employee) {
            alert('Colaborador do apontamento não encontrado.');
            return;
        }

        const normalizedType = String(log?.type || 'FALTA').toUpperCase();
        setAttSelectedEmployee(employee);
        setAttEditingLog(log);
        setAttSearchQuery(employee.matricula || '');
        setAttType(normalizedType);
        setAttTime(['ATRASO', 'SAIDA'].includes(normalizedType) ? String(log?.delayMinutes || '') : '');
        setAttDate(normalizeAttendanceDate(log?.date) || todayAttendanceDate());
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeleteAttendance = async (log: any) => {
        const logId = Number(log?.id);
        if (!Number.isInteger(logId) || logId <= 0) {
            alert('Apontamento inválido para exclusão.');
            return;
        }

        const shouldDelete = window.confirm(`Deseja realmente excluir o apontamento de ${log.fullName} em ${formatAttendanceDisplayDate(log.date)}?`);
        if (!shouldDelete) return;

        try {
            await apiFetch(`/attendance/${logId}`, { method: 'DELETE' });
            if (Number(attEditingLog?.id) === logId) {
                setAttEditingLog(null);
                setAttSelectedEmployee(null);
                setAttType('FALTA');
                setAttTime('');
                setAttDate(todayAttendanceDate());
            }
            await loadBaseData();
            alert('Apontamento excluído!');
        } catch (e) {
            alert('Erro ao excluir apontamento.');
        }
    };

    const handleExportAttendance = async () => {
        if (!filteredAttendanceLogs.length) {
            alert('Nenhum registro encontrado para exportação.');
            return;
        }

        try {
            const safeShift = (attendanceShiftFilter === 'ALL' ? 'todos_os_turnos' : attendanceShiftFilter).replace(/[^a-zA-Z0-9_-]+/g, '_');
            await downloadAttendanceExcel(
                filteredAttendanceLogs.map((log: any) => ({
                    matricula: log.matricula,
                    fullName: log.fullName,
                    shift: log.shift,
                    role: log.role,
                    type: log.type,
                    date: formatAttendanceDisplayDate(log.date),
                    time: ['ATRASO', 'SAIDA'].includes(String(log?.type || '').toUpperCase()) ? formatAttendanceTime(log.delayMinutes) : '-',
                })),
                {
                    startDate,
                    endDate,
                    shift: attendanceShiftFilter,
                    fileName: `controle_presenca_${startDate}_${endDate}_${safeShift}.xlsx`
                }
            );
        } catch (e) {
            alert('Erro ao exportar a planilha.');
        }
    };

    const handleDownloadAttendanceJpg = async () => {
        if (!filteredAttendanceLogs.length) {
            alert('Nenhum registro encontrado para gerar a prévia.');
            return;
        }

        try {
            const buffer = await getAttendanceExcelBuffer(
                filteredAttendanceLogs.map((log: any) => ({
                    matricula: log.matricula,
                    fullName: log.fullName,
                    shift: log.shift,
                    role: log.role,
                    type: log.type,
                    date: formatAttendanceDisplayDate(log.date),
                    time: ['ATRASO', 'SAIDA'].includes(String(log?.type || '').toUpperCase()) ? formatAttendanceTime(log.delayMinutes) : '-',
                })),
                {
                    startDate,
                    endDate,
                    shift: attendanceShiftFilter,
                }
            );
            setPreviewBuffer(buffer);
        } catch (error) {
            console.error('Erro ao gerar preview da presença:', error);
            alert('Erro ao gerar a prévia da planilha.');
        }
    };

    const handleSaveAttendance = async () => {
        if (!attSelectedEmployee) return;
        try {
            const normalizedAttType = String(attType || '').toUpperCase();
            const attendanceTime = ['ATRASO', 'SAIDA'].includes(normalizedAttType) ? attTime : null;
            const dateString = normalizeAttendanceDate(attDate);

            if (!dateString) {
                alert('Informe a data da ocorrência.');
                return;
            }

            if (['ATRASO', 'SAIDA'].includes(normalizedAttType) && !attendanceTime) {
                alert(`Informe o ${normalizedAttType === 'SAIDA' ? 'horário de saída' : 'horário de chegada'}.`);
                return;
            }
            const existingLog = (Array.isArray(attSelectedEmployee?.attendanceLogs) ? attSelectedEmployee.attendanceLogs : [])
                .find((log: any) => normalizeAttendanceDate(log?.date) === dateString);

            if (existingLog && Number(existingLog.id) !== Number(attEditingLog?.id)) {
                const existingType = String(existingLog?.type || '').toUpperCase();
                const nextType = normalizedAttType;

                if (existingType === nextType) {
                    alert('Este apontamento já foi registrado para este colaborador nesta data.');
                    return;
                }

                const shouldUpdate = window.confirm(`Já existe um apontamento de ${existingType} nesta data. Deseja alterar para ${nextType}?`);
                if (!shouldUpdate) return;
            }

            await apiFetch('/attendance', {
                method: 'POST',
                body: JSON.stringify({
                    id: attEditingLog?.id,
                    employeeId: attSelectedEmployee.matricula,
                    date: dateString,
                    type: normalizedAttType,
                    delayMinutes: attendanceTime,
                    loggedById: currentUser.matricula
                })
            });
            alert(attEditingLog ? 'Apontamento atualizado!' : 'Apontamento registrado!');
            setAttEditingLog(null);
            setAttSelectedEmployee(null);
            setAttSearchQuery('');
            setAttType('FALTA');
            setAttTime('');
            setAttDate(todayAttendanceDate());
            loadBaseData(); // Reload data to update attendance logs
        } catch (e) { alert('Erro ao salvar'); }
    };

    const renderPresenca = () => {
        const team = employees.filter(e => e.superiorId === currentUser.matricula && isActiveEmployee(e) && (attendanceShiftFilter === 'ALL' || e.shift === attendanceShiftFilter));
        const filteredTeam = attSearchQuery
            ? team.filter(e => e.matricula.includes(attSearchQuery) || e.fullName.toLowerCase().includes(attSearchQuery.toLowerCase()))
            : team;
        const totalFaltas = filteredAttendanceLogs.filter((log: any) => log.type === 'FALTA').length;
        const totalAtrasos = filteredAttendanceLogs.filter((log: any) => log.type === 'ATRASO').length;
        const totalAtestados = filteredAttendanceLogs.filter((log: any) => log.type === 'ATESTADO').length;
        const totalSaidas = filteredAttendanceLogs.filter((log: any) => log.type === 'SAIDA').length;

        return (
            <div className="space-y-4">
                <Card className="flex flex-col gap-3 xl:flex-row xl:items-end">
                    <div className="flex-1">
                        <Input label="Filtrar Subordinado na Lista (Nome ou Matrícula)" value={attSearchQuery} onChange={e => setAttSearchQuery(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-[320px]">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Data Inicial</label>
                            <input
                                type="date"
                                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-slate-900 dark:text-zinc-100 text-sm"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value || '')}
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Data Final</label>
                            <input
                                type="date"
                                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-slate-900 dark:text-zinc-100 text-sm"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value || '')}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 min-w-[180px]">
                        <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Turno</label>
                        <select className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-slate-900 dark:text-zinc-100 text-sm" value={attendanceShiftFilter} onChange={e => setAttendanceShiftFilter(e.target.value as 'ALL' | '1º TURNO' | '2º TURNO')}>
                            <option value="ALL">Todos</option>
                            <option value="1º TURNO">1º TURNO</option>
                            <option value="2º TURNO">2º TURNO</option>
                        </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={handleSearchSubordinado}><Search size={16} /> Buscar Externo</Button>
                        <Button variant="secondary" onClick={handleExportAttendance}><Download size={16} /> Exportar Excel</Button>
                        <Button variant="secondary" onClick={handleDownloadAttendanceJpg}><Download size={16} /> Baixar JPG</Button>
                    </div>
                </Card>

                <Card className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-red-600 dark:text-red-400">Total de Faltas</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-zinc-100 mt-2">{totalFaltas}</p>
                        </div>
                        <div className="rounded-xl border border-orange-200 dark:border-orange-900/40 bg-orange-50 dark:bg-orange-900/10 p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">Total de Atrasos</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-zinc-100 mt-2">{totalAtrasos}</p>
                        </div>
                        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">Total de Atestados</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-zinc-100 mt-2">{totalAtestados}</p>
                        </div>
                        <div className="rounded-xl border border-cyan-200 dark:border-cyan-900/40 bg-cyan-50 dark:bg-cyan-900/10 p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-cyan-600 dark:text-cyan-400">Total de Saídas</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-zinc-100 mt-2">{totalSaidas}</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        {filteredAttendanceLogs.length === 0 ? (
                            <p className="text-sm text-slate-500">Nenhuma ocorrência encontrada para os filtros selecionados.</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400">
                                    <tr>
                                        <th className="p-3 text-left">Matrícula</th>
                                        <th className="p-3 text-left">Nome do Colaborador</th>
                                        <th className="p-3 text-left">Turno</th>
                                        <th className="p-3 text-left">Função</th>
                                        <th className="p-3 text-left">Tipo de Ocorrência</th>
                                        <th className="p-3 text-left">Data da Ocorrência</th>
                                        <th className="p-3 text-left">Horário Informado</th>
                                        <th className="p-3 text-left">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                    {filteredAttendanceLogs.map((log: any, index: number) => (
                                        <tr key={`${log.matricula}-${log.date}-${log.type}-${index}`} className="bg-white dark:bg-zinc-900">
                                            <td className="p-3 font-mono text-slate-700 dark:text-zinc-300">{log.matricula}</td>
                                            <td className="p-3 text-slate-700 dark:text-zinc-300">{log.fullName}</td>
                                            <td className="p-3 text-slate-700 dark:text-zinc-300">{log.shift}</td>
                                            <td className="p-3 text-slate-700 dark:text-zinc-300">{log.role}</td>
                                            <td className="p-3 text-slate-700 dark:text-zinc-300">{log.type}</td>
                                            <td className="p-3 text-slate-700 dark:text-zinc-300">{formatAttendanceDisplayDate(log.date)}</td>
                                            <td className="p-3 text-slate-700 dark:text-zinc-300">{['ATRASO', 'SAIDA'].includes(String(log.type || '').toUpperCase()) ? formatAttendanceTime(log.delayMinutes) : '-'}</td>
                                            <td className="p-3 text-slate-700 dark:text-zinc-300">
                                                <div className="flex flex-wrap gap-2">
                                                    <button onClick={() => handleEditAttendanceLog(log)} className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 px-2.5 py-1 text-xs font-bold text-cyan-700 hover:bg-cyan-50 dark:border-cyan-900/40 dark:text-cyan-300 dark:hover:bg-cyan-900/20">
                                                        <Pencil size={12} /> Editar
                                                    </button>
                                                    <button onClick={() => handleDeleteAttendance(log)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20">
                                                        <Trash2 size={12} /> Excluir
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </Card>

                {!attSelectedEmployee ? (
                    <Card>
                        <h3 className="font-bold text-slate-800 dark:text-zinc-100 mb-4">Sua Equipe (Clique no colaborador para realizar o apontamento)</h3>
                        {filteredTeam.length === 0 ? (
                            <p className="text-sm text-slate-500">Nenhum subordinado encontrado.</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {filteredTeam.map(emp => (
                                    <div
                                        key={emp.matricula}
                                        onClick={() => {
                                            setAttSelectedEmployee(emp);
                                            setAttEditingLog(null);
                                            setAttType('FALTA');
                                            setAttTime('');
                                            setAttDate(todayAttendanceDate());
                                        }}
                                        className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-cyan-500 cursor-pointer transition-all"
                                    >
                                        {emp.photo ? (
                                            <img src={emp.photo} alt={emp.fullName} className="w-10 h-10 rounded-full object-cover shrink-0" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                                <UserIcon size={20} className="text-slate-400" />
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="font-bold text-sm text-slate-800 dark:text-zinc-100 truncate">{emp.fullName}</p>
                                            <p className="text-xs text-slate-500 font-mono truncate">{emp.matricula}</p>
                                            <p className="text-xs text-slate-500 truncate">{emp.role} • {emp.shift}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                ) : (
                    <Card className="space-y-4 border-cyan-200 dark:border-cyan-900">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-4">
                                {attSelectedEmployee.photo ? (
                                    <img src={attSelectedEmployee.photo} alt="Colaborador" className="w-16 h-16 object-cover rounded-full" />
                                ) : (
                                    <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-zinc-800 flex items-center justify-center">
                                        <UserIcon size={32} className="text-slate-400" />
                                    </div>
                                )}
                                <div>
                                    <p className="font-bold text-lg text-slate-800 dark:text-zinc-100">{attSelectedEmployee.fullName}</p>
                                    <p className="text-slate-500">{attSelectedEmployee.matricula}</p>
                                </div>
                            </div>
                            <button onClick={() => {
                                setAttSelectedEmployee(null);
                                setAttEditingLog(null);
                                setAttType('FALTA');
                                setAttTime('');
                                setAttDate(todayAttendanceDate());
                            }} className="text-sm text-slate-500 hover:text-red-500 font-bold">Trocar Colaborador</button>
                        </div>

                        {attEditingLog && (
                            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
                                <span>Editando apontamento de {formatAttendanceDisplayDate(attEditingLog.date)}.</span>
                                <button onClick={() => {
                                    setAttEditingLog(null);
                                    setAttType('FALTA');
                                    setAttTime('');
                                    setAttDate(todayAttendanceDate());
                                }} className="font-bold underline underline-offset-2">Cancelar edição</button>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-zinc-800">
                            <Input label="Data da Ocorrência" type="date" value={attDate} onChange={e => setAttDate(e.target.value)} />
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Tipo de Apontamento</label>
                                <select
                                    className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100"
                                    value={attType}
                                    onChange={e => {
                                        const nextType = e.target.value;
                                        setAttType(nextType);
                                        if (!['ATRASO', 'SAIDA'].includes(nextType)) setAttTime('');
                                    }}
                                >
                                    <option value="FALTA">Falta</option>
                                    <option value="ATESTADO">Atestado</option>
                                    <option value="ATRASO">Atraso</option>
                                    <option value="SAIDA">Saída Antecipada</option>
                                </select>
                            </div>
                            {shouldShowAttTimeInput && (
                                <Input label={attTimeLabel} type="time" value={attTime} onChange={e => setAttTime(e.target.value)} />
                            )}
                        </div>
                        <div className="flex justify-end pt-2">
                            <Button onClick={handleSaveAttendance}><CheckCircle size={16} /> {attEditingLog ? 'Salvar Edição' : 'Registrar Apontamento'}</Button>
                        </div>
                    </Card>
                )}
            {previewBuffer && (
                <ExcelFidelityPreview
                    buffer={previewBuffer}
                    onClose={() => setPreviewBuffer(null)}
                    title={`absenteísmos (turno: ${attendanceShiftFilter})`}
                />
            )}
            </div>
        );
    };

    // TAB 4: LAYOUT DE LINHA
    const [lineSearch, setLineSearch] = useState('');
    const [linePreview, setLinePreview] = useState<any>(null);
    const [selectedAlocationEmp, setSelectedAlocationEmp] = useState<any>(null);
    const [alocModel, setAlocModel] = useState('');
    const [alocStation, setAlocStation] = useState('');
    const [layoutsList, setLayoutsList] = useState<any[]>([]);

    const handleSearchLine = () => {
        const found = employees
            .filter(isActiveEmployee)
            .find(e => e.matricula.includes(lineSearch) || e.fullName.toLowerCase().includes(lineSearch.toLowerCase()));
        if (found) setLinePreview(found);
        else alert('Colaborador não encontrado.');
    };

    const handleAddLine = async () => {
        if (!linePreview) return;
        if (linePreview.superiorId && linePreview.superiorId !== currentUser.matricula) {
            if (!window.confirm('Deseja mover o colaborador para sua supervisão? Ele(a) já está vinculado a outro líder.')) return;
        }
        try {
            await apiFetch(`/employees/${linePreview.matricula}/transfer`, {
                method: 'PUT',
                body: JSON.stringify({ superiorId: currentUser.matricula })
            });
            alert('Transferido!');
            setLinePreview(null);
            setLineSearch('');
            loadBaseData();
        } catch (e) { alert('Erro'); }
    };

    const handleRemoveLine = async (matricula: string) => {
        try {
            await apiFetch(`/employees/${matricula}/transfer`, {
                method: 'PUT',
                body: JSON.stringify({ superiorId: null })
            });
            loadBaseData();
        } catch (e) { }
    };

    const loadLayoutsByModel = async (modelo: string) => {
        if (!modelo) {
            setLayoutsList([]);
            return;
        }
        try {
            const layouts = await apiFetch(`/layout?modelo=${modelo}`);
            if (Array.isArray(layouts)) {
                // Filtrar apenas os layouts dos subordinados
                const subordinadoMatriculas = subordinados.map(s => s.matricula);
                setLayoutsList(layouts.filter(l => subordinadoMatriculas.includes(l.matricula)));
            }
        } catch (e) {
            console.error('Erro ao carregar layouts:', e);
        }
    };

    const handleRemoveLayoutEntry = async (layoutId: number) => {
        try {
            await apiFetch(`/layout/${layoutId}`, { method: 'DELETE' });
            loadLayoutsByModel(layoutMasterModel);
        } catch (e) {
            alert('Erro ao remover posto');
        }
    };

    const handleUpdatePostoAtual = async (layoutId: number) => {
        try {
            await apiFetch(`/layout/${layoutId}`, {
                method: 'PUT',
                body: JSON.stringify({ postoAtual: true })
            });
            loadLayoutsByModel(layoutMasterModel);
        } catch (e) {
            alert('Erro ao atualizar posto atual');
        }
    };

    const handleBindStation = async () => {
        if (!selectedAlocationEmp || !alocStation || !alocModel) return alert('Selecione Modelo e Posto');

        const isDuplicate = selectedAlocationEmp.allocatedWorkstations?.some((ws: string) =>
            ws.toLowerCase().includes(alocModel.toLowerCase()) && ws.toLowerCase().includes(alocStation.toLowerCase())
        );

        if (isDuplicate) {
            return alert('Erro! O colaborador já está alocado neste posto.');
        }

        try {
            await apiFetch(`/employees/${selectedAlocationEmp.matricula}/workstation-slots`, {
                method: 'POST',
                body: JSON.stringify({
                    modelText: alocModel,
                    workstationName: alocStation
                })
            });
            alert('Vinculado com sucesso!');
            setSelectedAlocationEmp(null);
            setAlocModel('');
            setAlocStation('');
            loadBaseData();
        } catch (e) {
            alert('Não foi possível vincular. (Todos os 6 slots podem estar cheios?)');
        }
    };

    const [showEditStation, setShowEditStation] = useState<any>(null);
    const [editingStation, setEditingStation] = useState<any>(null);
    const [showLayoutUpdateModal, setShowLayoutUpdateModal] = useState(false);
    const [pendingLayoutUpdate, setPendingLayoutUpdate] = useState<any>(null);
    const subordinados = useMemo(
        () => employees
            .filter(e => e.superiorId === currentUser.matricula)
            .filter(isActiveEmployee)
            .filter(e => !layoutMasterModel || String(e?.role || '').toUpperCase().includes('MONTADOR'))
            .sort((a, b) => {
                const priorityDiff = getLayoutRolePriority(String(a?.role || '')) - getLayoutRolePriority(String(b?.role || ''));
                if (priorityDiff !== 0) return priorityDiff;
                return String(a?.fullName || '').localeCompare(String(b?.fullName || ''));
            }),
        [employees, currentUser.matricula, layoutMasterModel]
    );

    const workstationMatchesModel = (workstation: any, model: string) => {
        const workstationModel = String(workstation?.modelName || '');
        const targetModel = String(model || '');
        return workstationModel === targetModel || workstationModel.substring(0, 7) === targetModel;
    };

    const updatePostoAtualFlag = async (layoutId: number, postoAtual: boolean) => {
        await apiFetch(`/layout/${layoutId}`, {
            method: 'PUT',
            body: JSON.stringify({ postoAtual })
        });
    };

    const handleAssignPostoSlot = async (postoName: string, slotIndex: number, selectedMatricula: string) => {
        try {
            const currentInPosto = layoutsList
                .filter(layout => layout.postoAtual && String(layout.ordemPosto || '') === postoName)
                .sort((a, b) => {
                    const employeeA = subordinados.find(s => s.matricula === a.matricula);
                    const employeeB = subordinados.find(s => s.matricula === b.matricula);
                    return String(employeeA?.fullName || '').localeCompare(String(employeeB?.fullName || ''));
                });

            const slotOccupant = currentInPosto[slotIndex];

            if (!selectedMatricula) {
                if (slotOccupant?.id) {
                    await updatePostoAtualFlag(slotOccupant.id, false);
                    await loadLayoutsByModel(layoutMasterModel);
                }
                return;
            }

            let selectedLayout = layoutsList.find(
                layout => String(layout.matricula) === selectedMatricula && String(layout.ordemPosto || '') === postoName
            );

            if (slotOccupant?.id && String(slotOccupant.matricula) !== selectedMatricula) {
                await updatePostoAtualFlag(slotOccupant.id, false);
            }

            if (!selectedLayout?.id) {
                await apiFetch(`/employees/${selectedMatricula}/workstation-slots`, {
                    method: 'POST',
                    body: JSON.stringify({ modelText: layoutMasterModel, workstationName: postoName })
                });

                const novosLayouts = await apiFetch(`/layout?modelo=${encodeURIComponent(layoutMasterModel)}`).catch(() => []);
                if (Array.isArray(novosLayouts)) {
                    selectedLayout = novosLayouts.find(
                        (l: any) => String(l.matricula) === selectedMatricula && String(l.ordemPosto || '') === postoName
                    );
                }
            }

            const oldLayout = layoutsList.find(
                layout =>
                    String(layout.matricula) === selectedMatricula &&
                    !!layout.postoAtual &&
                    String(layout.ordemPosto || '') !== postoName
            );
            if (oldLayout?.id) {
                await updatePostoAtualFlag(oldLayout.id, false);
            }

            if (selectedLayout?.id) {
                await updatePostoAtualFlag(selectedLayout.id, true);
            }
            await loadLayoutsByModel(layoutMasterModel);
        } catch (e) {
            alert('Erro ao atualizar vagas por posto.');
        }
    };

    const renderLayoutLinha = () => (
        <div className="space-y-6">
            <Card className="flex flex-col gap-4">
                <div className="flex gap-2 items-end">
                    <div className="flex-1">
                        <Input label="Pesquisar Matrícula/Nome da fábrica" value={lineSearch} onChange={e => setLineSearch(e.target.value)} />
                    </div>
                    <Button onClick={handleSearchLine}><Search size={16} /> Buscar</Button>
                </div>
                {linePreview && (
                    <div className="p-4 bg-slate-50 dark:bg-zinc-800 rounded-xl flex items-center justify-between border border-slate-200 dark:border-zinc-700">
                        <div className="flex items-center gap-4">
                            {linePreview.photo && <img src={linePreview.photo} className="w-12 h-12 rounded-full" />}
                            <div>
                                <p className="font-bold text-slate-800 dark:text-zinc-100">{linePreview.fullName}</p>
                                <p className="text-sm text-slate-500">{linePreview.matricula} | {linePreview.shift}</p>
                            </div>
                        </div>
                        <Button onClick={handleAddLine}><Plus size={16} /> Adicionar</Button>
                    </div>
                )}
            </Card>

            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-800 dark:text-zinc-100">Meu Layout de Linha</h3>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => exportLeaderLayout(currentUser, subordinados)}><List size={16} /> Imprimir (Líder)</Button>
                        <Button variant="secondary" onClick={() => setShowPrintModal(true)}><List size={16} /> Imprimir (Modelo)</Button>
                    </div>
                </div>
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4">
                    <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                        <div className="flex-1">
                            <label className="text-sm font-bold text-slate-700 dark:text-zinc-300 block mb-2">Filtro Mestre de Modelo</label>
                            <select
                                className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-3 outline-none"
                                value={layoutMasterModel}
                                onChange={(e) => setLayoutMasterModel(e.target.value)}
                            >
                                <option value="">Selecione um Modelo para Filtrar...</option>
                                {unifiedModels.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                            </select>
                        </div>
                        {layoutMasterModel && (
                            <div>
                                <label className="text-sm font-bold text-slate-700 dark:text-zinc-300 block mb-2">Visualização</label>
                                <div className="inline-flex rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden">
                                    <button
                                        type="button"
                                        className={`px-4 py-2 text-sm font-semibold ${viewMode === 'posto' ? 'bg-cyan-600 text-white' : 'bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'}`}
                                        onClick={() => setViewMode('posto')}
                                    >
                                        Por Posto
                                    </button>
                                    <button
                                        type="button"
                                        className={`px-4 py-2 text-sm font-semibold ${viewMode === 'colaborador' ? 'bg-cyan-600 text-white' : 'bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'}`}
                                        onClick={() => setViewMode('colaborador')}
                                    >
                                        Por Colaborador
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Dashboard: Resumo por Função */}
                <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-800 mb-6 mt-4">
                    <h3 className="text-sm font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider mb-3">Resumo por Função</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
                        {Object.entries(
                            (()=>{
                                const displayList = currentUser ? [{...currentUser, role: currentUser.role || 'Líder de Produção'}, ...subordinados] : subordinados;
                                return displayList.reduce((acc, emp) => {
                                    const role = emp.role || 'Não Definida';
                                    acc[role] = (acc[role] || 0) + 1;
                                    return acc;
                                }, {} as Record<string, number>);
                            })()
                        )
                        .sort(([roleA], [roleB]) => roleA.localeCompare(roleB))
                        .map(([role, count]) => (
                            <div key={role} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-zinc-800 rounded-lg border border-slate-100 dark:border-zinc-700">
                                <span className="text-xs text-slate-600 dark:text-zinc-400 font-semibold">{role}</span>
                                <span className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{count as React.ReactNode}</span>
                            </div>
                        ))}
                        
                        {/* Card Totalizador */}
                        <div className="flex justify-between items-center p-3 bg-cyan-50 dark:bg-cyan-900/30 rounded-lg border border-cyan-200 dark:border-cyan-800/50 shadow-sm">
                            <span className="text-sm text-cyan-800 dark:text-cyan-300 font-black uppercase">TOTAL</span>
                            <span className="text-xl font-black text-cyan-700 dark:text-cyan-400">{subordinados.length + 1}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden text-sm mt-4">
                    {subordinados.length === 0 ? (
                        <p className="p-4 text-slate-500">Nenhum colaborador na sua linha.</p>
                    ) : viewMode === 'posto' && !layoutMasterModel ? (
                        <p className="p-4 text-slate-500">Selecione um modelo para visualizar as vagas por posto.</p>
                    ) : viewMode === 'posto' ? (
                        <div className="p-4 space-y-4">
                            {(() => {
                                const modelWorkstations = workstations
                                    .filter(w => workstationMatchesModel(w, layoutMasterModel))
                                    .sort((a, b) => (Number((a as any)?.order) || 0) - (Number((b as any)?.order) || 0));

                                const currentByMatricula = new Map<string, any>();
                                layoutsList
                                    .filter(layout => layout.postoAtual)
                                    .forEach(layout => currentByMatricula.set(String(layout.matricula), layout));

                                if (modelWorkstations.length === 0) {
                                    return <p className="text-slate-500">Nenhum posto encontrado para este modelo.</p>;
                                }

                                return modelWorkstations.map((posto) => {
                                    const postoName = String(posto?.name || '');
                                    const peopleNeeded = Math.max(0, Number(posto?.peopleNeeded || 0));
                                    const currentInPosto = layoutsList
                                        .filter(layout => layout.postoAtual && String(layout.ordemPosto || '') === postoName)
                                        .sort((a, b) => {
                                            const employeeA = subordinados.find(s => s.matricula === a.matricula);
                                            const employeeB = subordinados.find(s => s.matricula === b.matricula);
                                            return String(employeeA?.fullName || '').localeCompare(String(employeeB?.fullName || ''));
                                        });

                                    const filledSlots = Math.min(currentInPosto.length, peopleNeeded);
                                    const availableSlots = Math.max(0, peopleNeeded - filledSlots);

                                    return (
                                        <div key={posto.id || postoName} className="rounded-xl border border-slate-200 dark:border-zinc-700 p-4 bg-slate-50 dark:bg-zinc-900/70">
                                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                                                <h4 className="text-base font-bold text-slate-900 dark:text-zinc-100">{postoName}</h4>
                                                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                                                    Vagas: {filledSlots}/{peopleNeeded} Disponíveis
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {Array.from({ length: peopleNeeded }).map((_, slotIdx) => {
                                                    const occupantLayout = currentInPosto[slotIdx];
                                                    const occupantMatricula = String(occupantLayout?.matricula || '');
                                                    const assignedThisPost = currentInPosto.map(layout => String(layout.matricula || ''));
                                                    const usedInOtherSlots = assignedThisPost.filter((mat, idx) => idx !== slotIdx && !!mat);

                                                    const options = subordinados
                                                        .filter((emp: any) => {
                                                            const matricula = String(emp?.matricula || '');
                                                            if (matricula === occupantMatricula) return true;
                                                            if (usedInOtherSlots.includes(matricula)) return false;
                                                            if (!currentByMatricula.has(matricula)) return true;
                                                            return layoutsList.some(
                                                                l => String(l?.matricula || '') === matricula && String(l?.ordemPosto || '') === postoName
                                                            );
                                                        })
                                                        .sort((a: any, b: any) => String(a?.fullName || '').localeCompare(String(b?.fullName || '')));

                                                    return (
                                                        <div key={`${postoName}-${slotIdx}`} className="space-y-1">
                                                            <label className="text-xs font-bold text-slate-600 dark:text-zinc-300">Vaga {slotIdx + 1}</label>
                                                            <select
                                                                className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none"
                                                                value={occupantMatricula}
                                                                onChange={(e) => handleAssignPostoSlot(postoName, slotIdx, e.target.value)}
                                                            >
                                                                <option value="">Não alocado</option>
                                                                {options.map((emp: any) => (
                                                                    <option key={emp.matricula} value={emp.matricula}>
                                                                        {emp.fullName} ({emp.matricula})
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {availableSlots > 0 && (
                                                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-3">{availableSlots} vaga(s) sem alocação.</p>
                                            )}
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    ) : !layoutMasterModel ? (
                        <div className="divide-y divide-slate-200 dark:divide-zinc-800">
                            {subordinados.map(s => (
                                <div
                                    key={s.matricula}
                                    onClick={() => setSelectedAlocationEmp(s)}
                                    className="p-4 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 cursor-pointer flex justify-between items-center border-b last:border-b-0 transition-colors"
                                >
                                    <div className="flex-1">
                                        <p className="font-mono text-sm text-slate-600 dark:text-zinc-400">{s.matricula}</p>
                                        <p className="font-bold text-slate-900 dark:text-zinc-100">{s.fullName}</p>
                                        <p className="text-xs text-slate-500">{s.role}</p>
                                    </div>
                                    <Button variant="danger" onClick={(e) => { e.stopPropagation(); handleRemoveLine(s.matricula); }}>Retirar</Button>
                                </div>
                            ))}
                        </div>
                    ) : !layoutMasterModel ? (
                        <div className="divide-y divide-slate-200 dark:divide-zinc-800">
                            {subordinados.map(s => (
                                <div
                                    key={s.matricula}
                                    onClick={() => setSelectedAlocationEmp(s)}
                                    className="p-4 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 cursor-pointer flex justify-between items-center border-b last:border-b-0 transition-colors"
                                >
                                    <div className="flex-1">
                                        <p className="font-mono text-sm text-slate-600 dark:text-zinc-400">{s.matricula}</p>
                                        <p className="font-bold text-slate-900 dark:text-zinc-100">{s.fullName}</p>
                                        <p className="text-xs text-slate-500">{s.role}</p>
                                    </div>
                                    <Button variant="danger" onClick={(e) => { e.stopPropagation(); handleRemoveLine(s.matricula); }}>Retirar</Button>
                                </div>
                            ))}
                        </div>
                    ) : layoutsList.length === 0 ? (
                        <p className="p-4 text-slate-500">Nenhum colaborador capacitado neste modelo na sua linha.</p>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-500">
                                <tr>
                                    <th className="p-4">Matrícula</th>
                                    <th className="p-4">Nome</th>
                                    <th className="p-4">Função</th>
                                    <th className="p-4">Postos</th>
                                    <th className="p-4">Selecionar Posto Atual</th>
                                    <th className="p-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                {(() => {
                                    const groupedByEmployee: { [key: string]: any[] } = {};
                                    layoutsList.forEach(layout => {
                                        if (!groupedByEmployee[layout.matricula]) {
                                            groupedByEmployee[layout.matricula] = [];
                                        }
                                        groupedByEmployee[layout.matricula].push(layout);
                                    });

                                    const capacityByPosto = new Map<string, number>();
                                    workstations
                                        .filter(w => workstationMatchesModel(w, layoutMasterModel))
                                        .forEach(w => {
                                            const capacity = Number(w?.peopleNeeded || 0);
                                            capacityByPosto.set(String(w?.name || ''), Number.isFinite(capacity) ? capacity : 0);
                                        });

                                    const allocatedByPosto = new Map<string, number>();
                                    layoutsList
                                        .filter(layout => layout.postoAtual)
                                        .forEach(layout => {
                                            const posto = String(layout?.ordemPosto || '');
                                            allocatedByPosto.set(posto, (allocatedByPosto.get(posto) || 0) + 1);
                                        });

                                    return Object.entries(groupedByEmployee)
                                        .sort(([matA], [matB]) => {
                                            const aEmployee = subordinados.find(s => s.matricula === matA);
                                            const bEmployee = subordinados.find(s => s.matricula === matB);
                                            const priorityDiff = getLayoutRolePriority(String(aEmployee?.role || '')) - getLayoutRolePriority(String(bEmployee?.role || ''));
                                            if (priorityDiff !== 0) return priorityDiff;
                                            return String(aEmployee?.fullName || '').localeCompare(String(bEmployee?.fullName || ''));
                                        })
                                        .map(([matricula, layouts]) => {
                                        const employee = subordinados.find(s => s.matricula === matricula);
                                        if (!employee) return null;

                                        const postoAtualLayout = layouts.find(l => l.postoAtual);
                                        const postoAtualId = postoAtualLayout?.id;

                                        return (
                                            <tr key={matricula} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50">
                                                <td className="p-4 font-mono">{matricula}</td>
                                                <td className="p-4 font-medium text-slate-900 dark:text-zinc-100">{employee.fullName}</td>
                                                <td className="p-4">{employee.role}</td>
                                                <td className="p-4 text-xs text-slate-600">
                                                    <div className="flex flex-col gap-1">
                                                        {layouts.map((layout, idx) => (
                                                            <div key={idx} className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-zinc-800 px-2 py-1 rounded">
                                                                <span>{layout.ordemPosto}</span>
                                                                <button
                                                                    onClick={() => handleRemoveLayoutEntry(layout.id)}
                                                                    className="text-xs text-red-500 hover:text-red-700 font-bold"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-xs text-slate-600">
                                                    <select
                                                        className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded px-2 py-1 text-xs outline-none"
                                                        value={postoAtualLayout?.id || ''}
                                                        onChange={(e) => {
                                                            if (e.target.value) {
                                                                handleUpdatePostoAtual(parseInt(e.target.value));
                                                            }
                                                        }}
                                                    >
                                                        <option value="">Nenhum</option>
                                                        {layouts
                                                            .filter(layout => {
                                                                const posto = String(layout?.ordemPosto || '');
                                                                const capacity = capacityByPosto.get(posto);
                                                                if (!capacity || capacity <= 0) return true;

                                                                const allocated = allocatedByPosto.get(posto) || 0;
                                                                const isCurrentEmployeePosto = layout.id === postoAtualId;
                                                                return isCurrentEmployeePosto || allocated < capacity;
                                                            })
                                                            .map((layout) => (
                                                                <option key={layout.id} value={layout.id}>
                                                                    {layout.ordemPosto}
                                                                </option>
                                                            ))}
                                                    </select>
                                                </td>
                                                <td className="p-4 text-right flex justify-end gap-2">
                                                    <Button variant="danger" onClick={() => handleRemoveLine(matricula)}>Retirar Colaborador</Button>
                                                </td>
                                            </tr>
                                        );
                                    });
                                })()}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>

            {selectedAlocationEmp && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <Card className="w-full max-w-lg space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Alocação de Postos</h3>
                            <button onClick={() => setSelectedAlocationEmp(null)} className="text-slate-500"><X size={20} /></button>
                        </div>
                        <p className="text-sm text-slate-500">Colaborador: {selectedAlocationEmp.fullName}</p>

                        <div className="flex flex-col gap-3 mt-4">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Modelo</label>
                                <select className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 p-2 rounded outline-none focus:ring-2 focus:ring-cyan-500" value={alocModel} onChange={e => { setAlocModel(e.target.value); setAlocStation(''); }}>
                                    <option value="">Selecione Modelo</option>
                                    {models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Posto</label>
                                <select className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 p-2 rounded outline-none focus:ring-2 focus:ring-cyan-500" value={alocStation} onChange={e => setAlocStation(e.target.value)}>
                                    <option value="">Selecione Posto</option>
                                    {workstations.filter(w => w.modelName === alocModel).sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))).map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <Button className="w-full mt-2" onClick={handleBindStation}>Vincular Posto</Button>
                        <div className="flex justify-end mt-4">
                            <Button variant="secondary" onClick={() => setSelectedAlocationEmp(null)}>Fechar</Button>
                        </div>
                    </Card>
                </div>
            )}

            {showLayoutUpdateModal && pendingLayoutUpdate && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <Card className="w-full max-w-lg space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Atenção!</h3>
                            <button onClick={() => { setShowLayoutUpdateModal(false); setPendingLayoutUpdate(null); }} className="text-slate-500"><X size={20} /></button>
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm text-slate-600">Este modelo já possui postos configurados. Deseja atualizar?</p>
                            <p className="text-xs text-slate-500 italic">Nota: Ao confirmar, os postos antigos serão removidos e os novos serão criados.</p>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <Button variant="secondary" className="flex-1" onClick={() => { setShowLayoutUpdateModal(false); setPendingLayoutUpdate(null); }}>Cancelar</Button>
                            <Button className="flex-1" onClick={async () => {
                                try {
                                    await apiFetch('/api/workstations/bulk', {
                                        method: 'POST',
                                        body: JSON.stringify({ items: pendingLayoutUpdate })
                                    });
                                    alert('Layout atualizado com sucesso!');
                                    setShowLayoutUpdateModal(false);
                                    setPendingLayoutUpdate(null);
                                    loadBaseData();
                                } catch (e) {
                                    alert('Erro ao atualizar layout');
                                }
                            }}>Atualizar</Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );

    const gloveDashboardData = useMemo(() => {
        const team = employees.filter(employee => employee.superiorId === currentUser.matricula && isActiveEmployee(employee));
        const leaderSource = leaders.find(leader => leader.matricula === currentUser.matricula) || currentUser;
        const normalizedLeaderName = leaderSource?.fullName || leaderSource?.name || currentUser?.name || currentUser?.fullName || 'Colaborador Sem Nome';
        const selfEmployee = employees.find(employee => employee.matricula === currentUser.matricula && isActiveEmployee(employee)) || (leaderSource ? {
            ...leaderSource,
            matricula: leaderSource.matricula || currentUser.matricula,
            fullName: normalizedLeaderName,
            name: normalizedLeaderName,
            gloveSize: leaderSource.gloveSize ?? currentUser.gloveSize ?? '',
            gloveType: leaderSource.gloveType ?? currentUser.gloveType ?? '',
            gloveExchanges: Number(leaderSource.gloveExchanges ?? currentUser.gloveExchanges ?? 0),
            role: leaderSource.role || currentUser.role || '',
            superiorId: leaderSource.superiorId || currentUser.superiorId || currentUser.matricula,
            status: leaderSource.status || currentUser.status || 'ATIVO',
        } : null);
        const baseList = selfEmployee ? [selfEmployee, ...team.filter(employee => employee.matricula !== currentUser.matricula)] : team;
        const processedList = [...baseList].sort((a, b) => {
            const priorityDiff = getGloveRolePriority(a?.role || '') - getGloveRolePriority(b?.role || '');
            if (priorityDiff !== 0) return priorityDiff;
            return String(a?.fullName || '').localeCompare(String(b?.fullName || ''));
        });

        const sizeTotals = new Map<string, number>();
        const roleTotals = new Map<string, number>();
        let totalQty = 0;

        processedList.forEach((employee) => {
            const extraExchanges = Number(employee?.gloveExchanges || 0);
            const qty = 1 + (Number.isFinite(extraExchanges) ? extraExchanges : 0);
            const gloveType = String(employee?.gloveType || '').toLowerCase();
            const gloveSize = String(employee?.gloveSize || '').trim();
            const role = String(employee?.role || '').trim();
            const sizeLabel = gloveSize ? `${gloveSize}${gloveType.includes('dedinho') ? ' (D)' : ''}` : '';

            totalQty += qty;

            if (sizeLabel) {
                sizeTotals.set(sizeLabel, (sizeTotals.get(sizeLabel) || 0) + qty);
            }

            if (role) {
                roleTotals.set(role, (roleTotals.get(role) || 0) + 1);
            }
        });

        return {
            processedList,
            sizeSummary: Array.from(sizeTotals.entries()),
            roleSummary: Array.from(roleTotals.entries()),
            totalQty,
        };
    }, [employees, leaders, currentUser]);

    const renderLuvas = () => {
        const { processedList, sizeSummary, roleSummary, totalQty } = gloveDashboardData;
        const totalRoles = roleSummary.reduce((acc, [, qty]) => acc + qty, 0);

        const handleUpdateGlove = async (matricula: string, field: 'gloveSize' | 'gloveType' | 'gloveExchanges', value: string | number) => {
            const empToUpdate = employees.find(e => e.matricula === matricula)
                || leaders.find(e => e.matricula === matricula)
                || (currentUser?.matricula === matricula ? currentUser : null);
            if (!empToUpdate) return;
            const updatedProfile = { ...empToUpdate, [field]: value };

            try {
                const response = await apiFetch('/employees', {
                    method: 'POST',
                    body: JSON.stringify({ ...updatedProfile, fullName: empToUpdate.fullName || empToUpdate.name || currentUser?.name, sector: empToUpdate.sector || "PRODUÇÃO", isEdit: true })
                });
                const savedProfile = response?.employee ? { ...updatedProfile, ...response.employee } : updatedProfile;
                const normalizedProfile = {
                    ...savedProfile,
                    fullName: savedProfile.fullName || savedProfile.name || 'Colaborador Sem Nome',
                    name: savedProfile.fullName || savedProfile.name || 'Colaborador Sem Nome',
                };
                setEmployees(prev => (
                    prev.some(e => e.matricula === matricula)
                        ? prev.map(e => e.matricula === matricula ? { ...e, ...normalizedProfile } : e)
                        : [...prev, normalizedProfile]
                ));
                setLeaders(prev => {
                    const exists = prev.some(e => e.matricula === matricula);
                    if (exists) {
                        return prev.map(e => e.matricula === matricula ? { ...e, ...normalizedProfile } : e);
                    }
                    return matricula === currentUser?.matricula || isLeadershipRole(normalizedProfile?.role)
                        ? [...prev, normalizedProfile]
                        : prev;
                });
            } catch (e) {
                alert('Erro ao atualizar luva');
            }
        };

        const generateSpreadsheet = async () => {
            try {
                await exportGloveControl(processedList, currentUser?.fullName || currentUser?.name || 'Geral');
            } catch (e) {
                console.error("Erro export", e);
                alert("Falha gerando XLSX!");
            }
        };

        return (
            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-800 dark:text-zinc-100">Controle de Luvas (Sua Equipe)</h3>
                    <Button onClick={generateSpreadsheet}><Download size={16} /> Exportar Planilha</Button>
                </div>
                {processedList.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/80 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-100">Resumo por Tamanho</h4>
                                <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Qtd</span>
                            </div>
                            <div className="space-y-2 text-sm">
                                {sizeSummary.length === 0 ? (
                                    <p className="text-slate-500 dark:text-zinc-400">Sem tamanhos informados.</p>
                                ) : (
                                    sizeSummary.map(([size, qty]) => (
                                        <div key={size} className="flex items-center justify-between rounded-xl bg-white dark:bg-zinc-950 px-3 py-2 border border-slate-200/80 dark:border-zinc-800">
                                            <span className="font-medium text-slate-700 dark:text-zinc-200">{size}</span>
                                            <span className="font-semibold text-slate-900 dark:text-zinc-100">{qty}</span>
                                        </div>
                                    ))
                                )}
                                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-zinc-800 font-bold text-slate-900 dark:text-zinc-100">
                                    <span>TOTAL</span>
                                    <span>{totalQty}</span>
                                </div>
                            </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/80 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-100">Resumo por Função</h4>
                                <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Qtd</span>
                            </div>
                            <div className="space-y-2 text-sm">
                                {roleSummary.length === 0 ? (
                                    <p className="text-slate-500 dark:text-zinc-400">Sem funções informadas.</p>
                                ) : (
                                    roleSummary.map(([role, qty]) => (
                                        <div key={role} className="flex items-center justify-between rounded-xl bg-white dark:bg-zinc-950 px-3 py-2 border border-slate-200/80 dark:border-zinc-800">
                                            <span className="font-medium text-slate-700 dark:text-zinc-200">{role}</span>
                                            <span className="font-semibold text-slate-900 dark:text-zinc-100">{qty}</span>
                                        </div>
                                    ))
                                )}
                                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-zinc-800 font-bold text-slate-900 dark:text-zinc-100">
                                    <span>TOTAL</span>
                                    <span>{totalRoles}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden text-sm">
                    {processedList.length === 0 ? (
                        <p className="p-4 text-slate-500">Nenhum colaborador na sua equipe.</p>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-500">
                                <tr>
                                    <th className="p-4">Matrícula</th>
                                    <th className="p-4">Nome</th>
                                    <th className="p-4">Função</th>
                                    <th className="p-4">Tamanho</th>
                                    <th className="p-4">Tipo</th>
                                    <th className="p-4">Trocas (Semana)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                {processedList.map(s => (
                                    <tr key={s.matricula} className={`hover:bg-slate-50 dark:hover:bg-zinc-800/50 ${s.matricula === currentUser.matricula ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}>
                                        <td className="p-4 font-mono">{s.matricula}</td>
                                        <td className="p-4">{s.fullName || s.name || 'Colaborador Sem Nome'} {s.matricula === currentUser.matricula && <span className="text-xs text-indigo-500 font-bold ml-2">(Você)</span>}</td>
                                        <td className="p-4">{s.role}</td>
                                        <td className="p-4">
                                            <select
                                                className="bg-slate-50 dark:bg-zinc-800 p-2 rounded border border-slate-200 dark:border-zinc-700 outline-none"
                                                value={s.gloveSize || ''}
                                                onChange={(e) => handleUpdateGlove(s.matricula, 'gloveSize', e.target.value)}
                                            >
                                                <option value="">Vazio</option>
                                                <option value="PP">PP</option>
                                                <option value="P">P</option>
                                                <option value="M">M</option>
                                                <option value="G">G</option>
                                            </select>
                                        </td>
                                        <td className="p-4">
                                            <select
                                                className="bg-slate-50 dark:bg-zinc-800 p-2 rounded border border-slate-200 dark:border-zinc-700 outline-none"
                                                value={s.gloveType || ''}
                                                onChange={(e) => handleUpdateGlove(s.matricula, 'gloveType', e.target.value)}
                                            >
                                                <option value="">Vazio</option>
                                                <option value="Palma">Palma</option>
                                                <option value="Dedinho">Dedinho</option>
                                            </select>
                                        </td>
                                        <td className="p-4">
                                            <select
                                                className="bg-slate-50 dark:bg-zinc-800 p-2 rounded border border-slate-200 dark:border-zinc-700 outline-none"
                                                value={s.gloveExchanges || 0}
                                                onChange={(e) => handleUpdateGlove(s.matricula, 'gloveExchanges', Number(e.target.value))}
                                            >
                                                <option value={0}>0</option>
                                                <option value={1}>1</option>
                                                <option value={2}>2</option>
                                                <option value={3}>3</option>
                                                <option value={4}>4</option>
                                                <option value={5}>5</option>
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>
        );
    };
    // TAB 6: EDIÇÃO
    const [editQuery, setEditQuery] = useState('');
    const [editFound, setEditFound] = useState(false);
    const [editSaving, setEditSaving] = useState(false);

    const handleEditSearch = async () => {
        if (!editQuery.trim()) return;
        try {
            const res = await apiFetch(`/employees/search/${encodeURIComponent(editQuery.trim())}?superiorId=${currentUser.matricula}`);
            if (res && res.matricula && (showInactive || isActiveEmployee(res))) {
                setFormData({ ...res, photo: res.photo || '', superiorId: res.superiorId || '' });
                setEditFound(true);
            } else {
                setEditFound(false);
                alert(showInactive ? 'Colaborador não encontrado.' : 'Colaborador não encontrado ou está desligado.');
            }
        } catch { setEditFound(false); alert('Erro na busca.'); }
    };

    const handleUpdateEmployee = async () => {
        if (!formData.matricula || !formData.fullName || !formData.shift || !formData.role || !formData.sector) return alert('Preencha os campos obrigatórios.');
        setEditSaving(true);
        try {
            await apiFetch('/employees', { method: 'POST', body: JSON.stringify({ ...formData, isEdit: true }) });
            alert('Colaborador atualizado com sucesso!');
            loadBaseData();
        } catch { alert('Erro ao atualizar.'); }
        setEditSaving(false);
    };

    const renderEdicao = () => (
        <div className="space-y-4">
            <Card className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1"><Input label="Buscar Matrícula para Editar" value={editQuery} onChange={e => setEditQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEditSearch()} /></div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-zinc-300 select-none">
                    <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
                    Mostrar Desligados
                </label>
                <Button onClick={handleEditSearch}><Search size={16} /> Buscar</Button>
            </Card>

            {!editFound && (
                <Card>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">Selecione um colaborador para editar</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {employees
                            .filter(e => e.superiorId === currentUser.matricula)
                            .filter(e => showInactive || isActiveEmployee(e))
                            .filter(e => !editQuery || e.matricula.toLowerCase().includes(editQuery.toLowerCase()) || e.fullName.toLowerCase().includes(editQuery.toLowerCase()))
                            .map(emp => (
                                <div
                                    key={emp.matricula}
                                    onClick={() => {
                                        setFormData({ ...emp, photo: emp.photo || '' });
                                        setEditFound(true);
                                    }}
                                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-cyan-500 cursor-pointer transition-all"
                                >
                                    {emp.photo ? <img src={emp.photo} className="w-10 h-10 rounded-full object-cover shrink-0" /> : <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0"><UserIcon size={20} className="text-slate-400" /></div>}
                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold text-sm text-slate-800 dark:text-zinc-100 truncate">{emp.fullName}</p>
                                        <p className="text-xs text-slate-500 font-mono truncate">{emp.matricula}</p>
                                        <p className="text-xs text-slate-500 truncate">{emp.role} • {emp.shift}</p>
                                    </div>
                                </div>
                            ))}
                    </div>
                </Card>
            )}

            {editFound && (
                <Card className="space-y-4">
                    <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800">
                        {formData.photo && <img src={formData.photo} className="w-14 h-14 rounded-xl object-cover border" />}
                        <div>
                            <p className="font-bold text-lg text-slate-800 dark:text-zinc-100">{formData.fullName || '—'}</p>
                            <p className="text-sm text-slate-500">Matrícula: {formData.matricula}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Foto</label>
                            <input type="file" accept="image/*" onChange={handlePhotoChange} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100 dark:file:bg-zinc-800 dark:file:text-cyan-400" />
                            {formData.photo && <img src={formData.photo} alt="Preview" className="h-20 w-20 object-cover rounded mt-2" />}
                        </div>
                        <Input label="Nome Completo" value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Turno</label>
                            <select className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100" value={formData.shift} onChange={e => setFormData({ ...formData, shift: e.target.value })}>
                                <option value="">Selecione o turno</option>
                                <option value="1º TURNO">1º TURNO</option>
                                <option value="2º TURNO">2º TURNO</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Função</label>
                            <select className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                                <option value="">Selecione...</option>
                                {configRoles.map(r => <option key={r.name || r.id} value={r.name || r.id}>{r.name || r.id}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Setor</label>
                            <select className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100" value={formData.sector} onChange={e => setFormData({ ...formData, sector: e.target.value })}>
                                <option value="">Selecione...</option>
                                {['PRODUÇÃO', 'LOGISTICA', 'ASG', 'MANUTENÇÃO', 'RETRABALHO', 'QUALIDADE', 'QUALIDADE PQC', 'QUALIDADE RMA', 'QUALIDADE IQC', 'QUALIDADE OQC', 'REPARO', 'PCP'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Superior Imediato</label>
                            <select className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100" value={formData.superiorId} onChange={e => setFormData({ ...formData, superiorId: e.target.value })}>
                                <option value="">Selecione um Líder...</option>
                                {leaders.map(l => <option key={l.matricula} value={l.matricula}>{l.name} ({l.matricula})</option>)}
                            </select>
                        </div>
                        <Input label="IDL-ST" value={formData.idlSt} onChange={e => setFormData({ ...formData, idlSt: e.target.value })} />
                        <Input label="Tipo" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} />
                        <Input label="Logradouro" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                        <Input label="Número (Endereço)" value={formData.addressNum} onChange={e => setFormData({ ...formData, addressNum: e.target.value })} />
                        <Input label="Bairro" value={formData.neighborhood} onChange={e => setFormData({ ...formData, neighborhood: e.target.value })} />
                        <Input label="WhatsApp" value={formData.whatsapp} onChange={e => setFormData({ ...formData, whatsapp: e.target.value })} />
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-zinc-800">
                        <Button variant="secondary" onClick={() => { setEditFound(false); setEditQuery(''); }}><ArrowLeft size={16} /> Voltar</Button>
                        <Button onClick={handleUpdateEmployee} disabled={editSaving}><Save size={16} /> {editSaving ? 'Salvando...' : 'Salvar Alterações'}</Button>
                    </div>
                </Card>
            )}
        </div>
    );


    return (
        <div className="w-full max-w-7xl mx-auto space-y-6">
            <header className="flex flex-col gap-4 mb-4 md:mb-8 pb-4 md:pb-6 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                    <h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                        <UserIcon className="text-cyan-500" /> Gestão de Pessoas
                    </h1>
                    <Button variant="outline" onClick={onBack}><ArrowLeft size={16} /> Voltar</Button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    {(!hasTabAccess || hasTabAccess('PEOPLE_MANAGEMENT', 'CADASTRO')) && <Button variant={tab === 'CADASTRO' ? 'primary' : 'secondary'} onClick={() => setTab('CADASTRO')}><UserIcon size={16} /> Cadastro</Button>}
                    {(!hasTabAccess || hasTabAccess('PEOPLE_MANAGEMENT', 'CONSULTA')) && <Button variant={tab === 'CONSULTA' ? 'primary' : 'secondary'} onClick={() => setTab('CONSULTA')}><Search size={16} /> Consulta</Button>}
                    {(!hasTabAccess || hasTabAccess('PEOPLE_MANAGEMENT', 'EDICAO')) && <Button variant={tab === 'EDICAO' ? 'primary' : 'secondary'} onClick={() => { setEditQuery(''); setEditFound(false); setTab('EDICAO'); }}><Save size={16} /> Edição</Button>}
                    {(!hasTabAccess || hasTabAccess('PEOPLE_MANAGEMENT', 'PRESENCA')) && <Button variant={tab === 'PRESENCA' ? 'primary' : 'secondary'} onClick={() => setTab('PRESENCA')}><Clock size={16} /> Controle de Presença</Button>}
                    {(!hasTabAccess || hasTabAccess('PEOPLE_MANAGEMENT', 'LAYOUT')) && <Button variant={tab === 'LAYOUT' ? 'primary' : 'secondary'} onClick={() => setTab('LAYOUT')}><List size={16} /> Layout de Linha</Button>}
                    {(!hasTabAccess || hasTabAccess('PEOPLE_MANAGEMENT', 'LUVAS')) && <Button variant={tab === 'LUVAS' ? 'primary' : 'secondary'} onClick={() => setTab('LUVAS')}><Hand size={16} /> Controle de Luvas</Button>}
                </div>
            </header>

            {tab === 'CADASTRO' && renderCadastro()}
            {tab === 'CONSULTA' && renderConsulta()}
            {tab === 'EDICAO' && renderEdicao()}
            {tab === 'PRESENCA' && renderPresenca()}
            {tab === 'LAYOUT' && renderLayoutLinha()}
            {tab === 'LUVAS' && renderLuvas()}
            {showPrintModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <Card className="w-full max-w-sm space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Imprimir Layout</h3>
                            <button onClick={() => setShowPrintModal(false)} className="text-slate-500 hover:text-red-500"><X size={20} /></button>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Escolha o Modelo</label>
                            <select
                                className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100 focus:ring-2 focus:ring-cyan-500"
                                value={printSelectedModel}
                                onChange={e => setPrintSelectedModel(e.target.value)}
                            >
                                <option value="">Selecione...</option>
                                {unifiedModels.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                            </select>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <Button variant="outline" className="flex-1" onClick={() => setShowPrintModal(false)}>Cancelar</Button>
                            <Button className="flex-1" onClick={() => {
                                if (!printSelectedModel) return alert('Selecione um modelo');
                                exportModelLayout(printSelectedModel, workstations, employees.filter(isActiveEmployee), currentUser?.fullName || currentUser?.name || 'LIDER');
                                setShowPrintModal(false);
                            }}>Gerar Excel</Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
