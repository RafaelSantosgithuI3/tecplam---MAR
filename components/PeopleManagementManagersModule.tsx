import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { Input } from './Input';
import { Shield, Plus, Search, User as UserIcon, List, ArrowLeft, CheckCircle, Clock, Save, Download, HandMetal, Scan } from 'lucide-react';
import { apiFetch } from '../services/networkConfig';
import { QRStreamReader } from './QRStreamReader';
import { exportLeaderLayout, exportModelLayout, exportGloveControl } from '../services/excelService';

import { EmployeeData, User, ConfigModel, Workstation, ConfigRole } from '../types';

interface Props {
    onBack: () => void;
    currentUser: User;
}

type Tab = 'CADASTRO' | 'CONSULTA' | 'PRESENCA' | 'LAYOUT' | 'LUVAS' | 'EDICAO';

export const PeopleManagementManagersModule: React.FC<Props> = ({ onBack, currentUser }) => {
    const [tab, setTab] = useState<Tab>('PRESENCA');
    const [employees, setEmployees] = useState<EmployeeData[]>([]);
    const [leaders, setLeaders] = useState<User[]>([]);
    const [models, setModels] = useState<ConfigModel[]>([]);
    const [unifiedModels, setUnifiedModels] = useState<ConfigModel[]>([]);
    const [workstations, setWorkstations] = useState<Workstation[]>([]);
    const [configRoles, setConfigRoles] = useState<ConfigRole[]>([]);

    // --- FILTRO GLOBAL DE LÍDER ---
    const [selectedLeaderId, setSelectedLeaderId] = useState<string>('');

    const loadBaseData = useCallback(async () => {
        try {
            const [usersList, empList, modsList, wksList, rolesList, unifiedList] = await Promise.all([
                apiFetch('/users'),
                apiFetch('/employees'),
                apiFetch('/config/models'),
                apiFetch('/workstations'),
                apiFetch('/config/roles'),
                apiFetch('/config/models/unified')
            ]);

            if (Array.isArray(usersList)) {
                const liderList = usersList.filter((u: User) => u.role && (u.role.toLowerCase().includes('lider') || u.role.toLowerCase().includes('líder') || u.role.toLowerCase().includes('supervisor')));
                setLeaders(liderList);
            }
            if (Array.isArray(empList)) setEmployees(empList);
            if (Array.isArray(modsList)) setModels(modsList);
            if (Array.isArray(wksList)) setWorkstations(wksList);
            if (Array.isArray(rolesList)) setConfigRoles(rolesList);
            if (Array.isArray(unifiedList)) setUnifiedModels(unifiedList);
        } catch (e: any) {
            alert('Erro ao carregar dados base: ' + (e.message || 'Falha de conexão.'));
        }
    }, []);

    useEffect(() => {
        loadBaseData();
    }, [loadBaseData]);

    // ── Leader selector component ──
    const LeaderFilter = () => (
        <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Visualizando equipe do líder</label>
            <select
                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-slate-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                value={selectedLeaderId}
                onChange={e => setSelectedLeaderId(e.target.value)}
            >
                <option value="">— Selecione um líder —</option>
                {leaders.map(l => (
                    <option key={l.matricula} value={l.matricula}>{l.name} ({l.matricula})</option>
                ))}
            </select>
        </div>
    );

    // ── Helper: subordinados do líder selecionado ──
    const subordinados = useMemo(() => {
        return selectedLeaderId
            ? employees.filter((e) => e.superiorId === selectedLeaderId)
            : [];
    }, [employees, selectedLeaderId]);

    // TAB 1: CADASTRO
    const [formData, setFormData] = useState({
        matricula: '', photo: '', fullName: '', shift: '', role: '', sector: '',
        superiorId: '', idlSt: '', type: '', status: '', address: '', addressNum: '', whatsapp: ''
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
                method: isEdit ? 'PUT' : 'POST',
                body: JSON.stringify({ ...formData, isEdit })
            });
            alert('Colaborador salvo com sucesso!');
            setFormData({ matricula: '', photo: '', fullName: '', shift: '', role: '', sector: '', superiorId: '', idlSt: '', type: '', status: '', address: '', addressNum: '', whatsapp: '' });
            setIsEdit(false);
            loadBaseData();
        } catch (e: any) {
            alert('Erro ao salvar colaborador: ' + (e.message || 'Dados inválidos.'));
        }
    };

    const handleMatriculaBlur = async () => {
        const mat = formData.matricula?.trim();
        if (!mat) { setIsEdit(false); return; }
        try {
            const user = await apiFetch(`/employees/search/${mat}`);
            if (user && user.matricula) {
                setFormData(prev => ({ ...prev, ...user, photo: user.photo || prev.photo, superiorId: user.superiorId || '' }));
                setIsEdit(true);
            } else {
                setIsEdit(false);
                setFormData(prev => ({ ...prev, photo: '', fullName: '', shift: '', role: '', sector: '', superiorId: '', idlSt: '', type: '', status: '', address: '', addressNum: '', whatsapp: '' }));
            }
        } catch (e: any) {
            setIsEdit(false);
            setFormData(prev => ({ ...prev, photo: '', fullName: '', shift: '', role: '', sector: '', superiorId: '', idlSt: '', type: '', status: '', address: '', addressNum: '', whatsapp: '' }));
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
                        {['PRODUÇÃO', 'LOGISTICA', 'ASG', 'MANUTENÇÃO', 'RETRABALHO', 'QUALIDADE', 'QUALIDADE RMA', 'QUALIDADE IQC', 'REPARO', 'PCP'].map(s => <option key={s} value={s}>{s}</option>)}
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
                <Input label="Status" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} />
                <Input label="Logradouro" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                <Input label="Número (Endereço)" value={formData.addressNum} onChange={e => setFormData({ ...formData, addressNum: e.target.value })} />
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
            const res = await apiFetch('/employees/search/' + encodeURIComponent(queryToUse.trim()));
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
                res.attendanceLogs?.forEach((log: any) => {
                    const d = new Date(log.date);
                    if (d.getMonth() === currentMonth && d.getFullYear() === currentYear && (log.type === 'FALTA' || log.type === 'ATESTADO')) misses++;
                });

                // Grab all workstation slots where user is allocated
                const userWorkstations = workstations.reduce((acc: any[], ws: any) => {
                    if (ws.slots) {
                        let foundSlots;
                        try {
                            foundSlots = typeof ws.slots === 'string' ? JSON.parse(ws.slots) : ws.slots;
                        } catch {
                            foundSlots = [];
                        }
                        const isAllocated = foundSlots.some((s: any) => s.matricula === res.matricula);
                        if (isAllocated) acc.push(ws.name);
                    }
                    return acc;
                }, []);

                setConsultResult({ ...res, misses, rank: Math.max(0, 10 - misses * 0.5), allocatedWorkstations: userWorkstations });
            } else {
                setConsultResult(null);
                alert('Não encontrado');
            }
        } catch (e: any) {
            setConsultResult(null);
            alert('Erro na busca: ' + (e.message || 'Falha no servidor.'));
        }
    };

    const renderConsulta = () => (
        <div className="space-y-4">
            <Card className="flex gap-2 items-end">
                <div className="flex-1"><Input label="Buscar Matrícula" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleConsult()} /></div>
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

            {consultResult && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                        <Card className="flex gap-4 items-start w-full">
                            {consultResult.photo ? (
                                <img src={consultResult.photo} alt="Colaborador" className="w-40 h-40 object-cover rounded-xl border border-slate-200" />
                            ) : (
                                <div className="w-40 h-40 bg-slate-200 dark:bg-zinc-800 rounded-xl flex items-center justify-center shrink-0">
                                    <UserIcon size={64} className="text-slate-400" />
                                </div>
                            )}
                            <div className="flex-1 flex flex-col justify-between h-full">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-800 dark:text-zinc-100 mb-1">{consultResult.fullName}</h2>
                                    <p className="inline-block bg-slate-100 dark:bg-zinc-800 px-3 py-1 rounded-full text-sm font-medium text-slate-600 dark:text-zinc-400">
                                        Matrícula: {consultResult.matricula}
                                    </p>
                                </div>
                                <div className="flex gap-3 mt-4">
                                    <div className="bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 px-4 py-2 rounded-xl text-center border border-cyan-100 dark:border-cyan-900/40">
                                        <p className="text-[10px] uppercase font-bold tracking-wider mb-1">Rank do Mês</p>
                                        <p className="text-xl font-black">{consultResult.rank.toFixed(1)}</p>
                                    </div>
                                    <button
                                        onClick={() => setShowMissesModal(true)}
                                        className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-2 rounded-xl text-center border border-red-100 dark:border-red-900/40 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors cursor-pointer flex flex-col items-center justify-center"
                                    >
                                        <p className="text-[10px] uppercase font-bold tracking-wider mb-1">Histórico Completo</p>
                                        <p className="text-xl font-black">{consultResult.misses} Ausências</p>
                                    </button>
                                </div>
                            </div>
                        </Card>
                        <Card className="flex flex-col w-full">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-100 uppercase tracking-wide border-b border-slate-100 dark:border-zinc-800 pb-2 mb-3 h-fit">Postos Habilitados</h3>
                            <div className="flex-1 overflow-y-auto max-h-40">
                                {consultResult.allocatedWorkstations && consultResult.allocatedWorkstations.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {consultResult.allocatedWorkstations.map((ws: string, i: number) => (
                                            <span key={i} className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm font-medium border border-indigo-100 dark:border-indigo-900/40">
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
                            </div>
                        </Card>

                        <Card className="space-y-3">
                            <h3 className="font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-zinc-800">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                Status & Liderança
                            </h3>
                            <div className="grid grid-cols-2 gap-y-3 text-sm">
                                <div><p className="text-xs text-slate-500 uppercase font-bold">Status Ocupacional</p><p className="font-medium text-slate-700 dark:text-zinc-300">{consultResult.status || '-'}</p></div>
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
                            </div>
                        </Card>
                    </div>

                    {consultResult.previousLeaders && (() => {
                        let hist: string[] = [];
                        try { hist = JSON.parse(consultResult.previousLeaders); } catch (e) { }
                        if (hist.length > 0) {
                            return (
                                <Card className="bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30">
                                    <p className="text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-2 uppercase tracking-wide">Histórico Recente de Líderes</p>
                                    <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                                        {hist.map((l: string, i: number) => {
                                            const leaderObj = leaders.find(ld => ld.matricula === l);
                                            const leaderName = leaderObj ? `${leaderObj.name} (${l})` : l;
                                            return <li key={i}>• <span className="font-medium">{leaderName}</span></li>;
                                        })}
                                    </ul>
                                </Card>
                            );
                        }
                        return null;
                    })()}
                    {showMissesModal && (() => {
                        const allLogs = consultResult.attendanceLogs || [];
                        const validLogs = allLogs.filter((l: any) => l.type === 'FALTA' || l.type === 'ATESTADO' || l.type === 'ATRASO');

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
                            if (log.type === 'ATESTADO') dynamicRank -= 0.5;
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
                                                                <span className="font-bold text-slate-700 dark:text-zinc-200">{new Date(log.date).toLocaleDateString('pt-BR')}</span>
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

    // TAB 3: PRESENÇA — usa selectedLeaderId
    const [attSearchQuery, setAttSearchQuery] = useState('');
    const [attSelectedEmployee, setAttSelectedEmployee] = useState<any>(null);
    const [attType, setAttType] = useState('FALTA');
    const [attDelayMinutes, setAttDelayMinutes] = useState('');

    const handleSearchSubordinado = () => {
        if (!selectedLeaderId) return alert('Selecione um líder primeiro.');
        const found = employees.find(e =>
            e.superiorId === selectedLeaderId &&
            (e.matricula.includes(attSearchQuery) || e.fullName.toLowerCase().includes(attSearchQuery.toLowerCase()))
        );
        if (found) setAttSelectedEmployee(found);
        else alert('Colaborador não encontrado na equipe do líder selecionado.');
    };

    const handleSaveAttendance = async () => {
        if (!attSelectedEmployee) return;
        try {
            const dateString = new Date().toISOString().split('T')[0];
            await apiFetch('/attendance', {
                method: 'POST',
                body: JSON.stringify({
                    employeeId: attSelectedEmployee.matricula,
                    date: dateString,
                    type: attType,
                    delayMinutes: attType === 'ATRASO' ? attDelayMinutes : null,
                    loggedById: currentUser.matricula
                })
            });
            alert('Apontamento registrado!');
            setAttSelectedEmployee(null);
            setAttSearchQuery('');
            setAttDelayMinutes('');
            loadBaseData();
        } catch (e) { alert('Erro ao salvar'); }
    };

    const renderPresenca = () => {
        const team = selectedLeaderId ? employees.filter(e => e.superiorId === selectedLeaderId) : [];
        const filteredTeam = attSearchQuery
            ? team.filter(e => e.matricula.includes(attSearchQuery) || e.fullName.toLowerCase().includes(attSearchQuery.toLowerCase()))
            : team;

        return (
            <div className="space-y-4">
                {!selectedLeaderId && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-4 text-amber-800 dark:text-amber-300 text-sm font-medium">
                        ⚠️ Selecione um líder no cabeçalho para visualizar a equipe.
                    </div>
                )}
                <Card className="flex gap-2 items-end">
                    <div className="flex-1"><Input label="Filtrar por Nome ou Matrícula" value={attSearchQuery} onChange={e => setAttSearchQuery(e.target.value)} /></div>
                    <Button onClick={handleSearchSubordinado}><Search size={16} /> Buscar</Button>
                </Card>
                {!attSelectedEmployee ? (
                    <Card>
                        <h3 className="font-bold text-slate-800 dark:text-zinc-100 mb-4">
                            Equipe de {leaders.find(l => l.matricula === selectedLeaderId)?.name || '...'} (Clique no colaborador para apontar)
                        </h3>
                        {team.length === 0 ? (
                            <p className="text-sm text-slate-500">{selectedLeaderId ? 'Nenhum subordinado encontrado para este líder.' : 'Selecione um líder.'}</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {filteredTeam.map(emp => (
                                    <div key={emp.matricula} onClick={() => setAttSelectedEmployee(emp)}
                                        className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 hover:border-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 cursor-pointer transition-all">
                                        {emp.photo ? (
                                            <img src={emp.photo} alt={emp.fullName} className="w-10 h-10 rounded-full object-cover shrink-0" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-zinc-800 flex items-center justify-center shrink-0"><UserIcon size={20} className="text-slate-400" /></div>
                                        )}
                                        <div className="overflow-hidden">
                                            <p className="font-bold text-sm text-slate-800 dark:text-zinc-100 truncate">{emp.fullName}</p>
                                            <p className="text-xs text-slate-500">{emp.matricula}</p>
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
                                    <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-zinc-800 flex items-center justify-center"><UserIcon size={32} className="text-slate-400" /></div>
                                )}
                                <div>
                                    <p className="font-bold text-lg text-slate-800 dark:text-zinc-100">{attSelectedEmployee.fullName}</p>
                                    <p className="text-slate-500">{attSelectedEmployee.matricula}</p>
                                </div>
                            </div>
                            <button onClick={() => setAttSelectedEmployee(null)} className="text-sm text-slate-500 hover:text-red-500 font-bold">Trocar Colaborador</button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-zinc-800">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Tipo de Apontamento</label>
                                <select className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100" value={attType} onChange={e => setAttType(e.target.value)}>
                                    <option value="FALTA">Falta</option>
                                    <option value="ATESTADO">Atestado</option>
                                    <option value="ATRASO">Atraso</option>
                                </select>
                            </div>
                            {attType === 'ATRASO' && (
                                <Input label="Tempo de Atraso (HH:mm)" type="time" value={attDelayMinutes} onChange={e => setAttDelayMinutes(e.target.value)} />
                            )}
                        </div>
                        <div className="flex justify-end pt-2">
                            <Button onClick={handleSaveAttendance}><CheckCircle size={16} /> Registrar Apontamento</Button>
                        </div>
                    </Card>
                )}
            </div>
        );
    };

    // TAB 4: LAYOUT — usa selectedLeaderId
    const [lineSearch, setLineSearch] = useState('');
    const [linePreview, setLinePreview] = useState<any>(null);
    const [selectedAlocationEmp, setSelectedAlocationEmp] = useState<any>(null);
    const [alocModel, setAlocModel] = useState('');
    const [alocStation, setAlocStation] = useState('');
    const [alocOrder, setAlocOrder] = useState('');

    const handleSearchLine = () => {
        const found = employees.find(e => e.matricula.includes(lineSearch) || e.fullName.toLowerCase().includes(lineSearch.toLowerCase()));
        if (found) setLinePreview(found);
        else alert('Colaborador não encontrado.');
    };

    const handleAddLine = async () => {
        if (!linePreview || !selectedLeaderId) return alert('Selecione um líder primeiro.');
        if (linePreview.superiorId && linePreview.superiorId !== selectedLeaderId) {
            if (!window.confirm('Deseja mover o colaborador para a supervisão do líder selecionado? Ele(a) já está vinculado a outro líder.')) return;
        }
        try {
            await apiFetch(`/employees/${linePreview.matricula}/transfer`, { method: 'PUT', body: JSON.stringify({ superiorId: selectedLeaderId }) });
            alert('Transferido!');
            setLinePreview(null);
            setLineSearch('');
            loadBaseData();
        } catch (e) { alert('Erro'); }
    };

    const handleRemoveLine = async (matricula: string) => {
        try {
            await apiFetch(`/employees/${matricula}/transfer`, { method: 'PUT', body: JSON.stringify({ superiorId: null }) });
            loadBaseData();
        } catch (e) { }
    };

    const handleBindStation = async () => {
        if (!selectedAlocationEmp || !alocStation || !alocModel) return alert('Selecione Modelo e Posto');
        try {
            await apiFetch(`/employees/${selectedAlocationEmp.matricula}/workstation-slots`, {
                method: 'POST',
                body: JSON.stringify({ modelText: alocModel, orderText: alocOrder, workstationName: alocStation })
            });
            alert('Vinculado com sucesso!');
            setSelectedAlocationEmp(null);
            setAlocModel(''); setAlocStation(''); setAlocOrder('');
            loadBaseData();
        } catch (e) { alert('Não foi possível vincular.'); }
    };

    const renderLayoutLinha = () => (
        <div className="space-y-6">
            {!selectedLeaderId && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-4 text-amber-800 dark:text-amber-300 text-sm font-medium">
                    ⚠️ Selecione um líder no cabeçalho para gerenciar a equipe.
                </div>
            )}
            <Card className="flex flex-col gap-4">
                <div className="flex gap-2 items-end">
                    <div className="flex-1"><Input label="Pesquisar Matrícula/Nome da fábrica" value={lineSearch} onChange={e => setLineSearch(e.target.value)} /></div>
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
                        <Button onClick={handleAddLine}><Plus size={16} /> Adicionar ao Líder Selecionado</Button>
                    </div>
                )}
            </Card>
            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-800 dark:text-zinc-100">
                        Layout de {leaders.find(l => l.matricula === selectedLeaderId)?.name || 'Líder não selecionado'}
                    </h3>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => {
                            const leaderObj = leaders.find(l => l.matricula === selectedLeaderId);
                            if (leaderObj) exportLeaderLayout(leaderObj, subordinados);
                        }}><List size={16} /> Imprimir (Líder)</Button>
                        <Button variant="secondary" onClick={() => {
                            if (!alocModel) return alert('Selecione um modelo para imprimir.');
                            exportModelLayout(alocModel, workstations, employees);
                        }}><List size={16} /> Imprimir (Modelo)</Button>
                    </div>
                </div>
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden text-sm">
                    {subordinados.length === 0 ? (
                        <p className="p-4 text-slate-500">{selectedLeaderId ? 'Nenhum colaborador nesta linha.' : 'Selecione um líder.'}</p>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-500">
                                <tr>
                                    <th className="p-4">Matrícula</th>
                                    <th className="p-4">Nome</th>
                                    <th className="p-4">Função</th>
                                    <th className="p-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                {subordinados.map(s => (
                                    <tr key={s.matricula} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50">
                                        <td className="p-4 font-mono">{s.matricula}</td>
                                        <td className="p-4 cursor-pointer text-cyan-600 font-medium" onClick={() => setSelectedAlocationEmp(s)}>{s.fullName}</td>
                                        <td className="p-4">{s.role}</td>
                                        <td className="p-4 text-right"><Button variant="danger" onClick={() => handleRemoveLine(s.matricula)}>Retirar</Button></td>
                                    </tr>
                                ))}
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
                            <button onClick={() => setSelectedAlocationEmp(null)} className="text-slate-500"><UserIcon size={20} /></button>
                        </div>
                        <p className="text-sm text-slate-500">Colaborador: {selectedAlocationEmp.fullName}</p>
                        <div className="grid grid-cols-2 gap-2 mt-4">
                            <select className="bg-slate-50 dark:bg-zinc-800 p-2 rounded" value={alocModel} onChange={e => { setAlocModel(e.target.value); setAlocStation(''); }}>
                                <option value="">Selecione Modelo</option>
                                {unifiedModels.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                            </select>
                            <select className="bg-slate-50 dark:bg-zinc-800 p-2 rounded" value={alocStation} onChange={e => setAlocStation(e.target.value)}>
                                <option value="">Selecione Posto</option>
                                {workstations.filter(w => w.modelName === alocModel || (w.modelName || '').substring(0, 7) === alocModel).map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                            </select>
                            <Input label="Ordem (Ex: 1, 2...)" value={alocOrder} onChange={e => setAlocOrder(e.target.value)} />
                        </div>
                        <Button className="w-full mt-2" onClick={handleBindStation}>Vincular Posto</Button>
                        <div className="flex justify-end mt-4"><Button variant="secondary" onClick={() => setSelectedAlocationEmp(null)}>Fechar</Button></div>
                    </Card>
                </div>
            )}
        </div>
    );

    // TAB 5: LUVAS — usa selectedLeaderId
    const renderLuvas = () => {
        const team = selectedLeaderId ? employees.filter(e => e.superiorId === selectedLeaderId) : [];
        const selfEmployee = selectedLeaderId ? employees.find(e => e.matricula === selectedLeaderId) : null;
        const displayList = selfEmployee ? [selfEmployee, ...team.filter(e => e.matricula !== selectedLeaderId)] : team;
        const leaderObj = leaders.find(l => l.matricula === selectedLeaderId);

        const handleUpdateGlove = async (matricula: string, field: 'gloveSize' | 'gloveType' | 'gloveExchanges', value: string | number) => {
            const empToUpdate = employees.find(e => e.matricula === matricula);
            if (!empToUpdate) return;
            try {
                await apiFetch('/employees', { method: 'POST', body: JSON.stringify({ ...empToUpdate, [field]: value, isEdit: true }) });
                setEmployees(prev => prev.map(e => e.matricula === matricula ? { ...e, [field]: value } : e));
            } catch (e) { alert('Erro ao atualizar luva'); }
        };

        const generateSpreadsheet = async () => {
            try { await exportGloveControl(displayList, leaderObj?.name || selectedLeaderId); }
            catch (e) { alert('Falha gerando XLSX!'); }
        };

        return (
            <Card>
                {!selectedLeaderId && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-4 text-amber-800 dark:text-amber-300 text-sm font-medium mb-4">
                        ⚠️ Selecione um líder no cabeçalho para visualizar o controle de luvas.
                    </div>
                )}
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-800 dark:text-zinc-100">
                        Controle de Luvas — Equipe de {leaderObj?.name || '...'}
                    </h3>
                    <Button onClick={generateSpreadsheet}><Download size={16} /> Exportar Planilha</Button>
                </div>
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden text-sm">
                    {displayList.length === 0 ? (
                        <p className="p-4 text-slate-500">{selectedLeaderId ? 'Nenhum colaborador nesta equipe.' : 'Selecione um líder.'}</p>
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
                                {displayList.map(s => (
                                    <tr key={s.matricula} className={`hover:bg-slate-50 dark:hover:bg-zinc-800/50 ${s.matricula === selectedLeaderId ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}>
                                        <td className="p-4 font-mono">{s.matricula}</td>
                                        <td className="p-4">{s.fullName} {s.matricula === selectedLeaderId && <span className="text-xs text-indigo-500 font-bold ml-2">(Líder)</span>}</td>
                                        <td className="p-4">{s.role}</td>
                                        <td className="p-4">
                                            <select className="bg-slate-50 dark:bg-zinc-800 p-2 rounded border border-slate-200 dark:border-zinc-700 outline-none" value={s.gloveSize || ''} onChange={e => handleUpdateGlove(s.matricula, 'gloveSize', e.target.value)}>
                                                <option value="">Vazio</option>
                                                <option value="PP">PP</option><option value="P">P</option><option value="M">M</option><option value="G">G</option>
                                            </select>
                                        </td>
                                        <td className="p-4">
                                            <select className="bg-slate-50 dark:bg-zinc-800 p-2 rounded border border-slate-200 dark:border-zinc-700 outline-none" value={s.gloveType || ''} onChange={e => handleUpdateGlove(s.matricula, 'gloveType', e.target.value)}>
                                                <option value="">Vazio</option>
                                                <option value="Palma">Palma</option><option value="Dedinho">Dedinho</option>
                                            </select>
                                        </td>
                                        <td className="p-4">
                                            <select className="bg-slate-50 dark:bg-zinc-800 p-2 rounded border border-slate-200 dark:border-zinc-700 outline-none" value={s.gloveExchanges || 0} onChange={e => handleUpdateGlove(s.matricula, 'gloveExchanges', Number(e.target.value))}>
                                                {[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
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
            const res = await apiFetch('/employees/search/' + encodeURIComponent(editQuery.trim()));
            if (res && res.matricula) {
                setFormData({ ...res, photo: res.photo || '', superiorId: res.superiorId || '' });
                setEditFound(true);
            } else {
                setEditFound(false);
                alert('Colaborador não encontrado.');
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
            <Card className="flex gap-2 items-end">
                <div className="flex-1"><Input label="Buscar Matrícula para Editar" value={editQuery} onChange={e => setEditQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEditSearch()} /></div>
                <Button onClick={handleEditSearch}><Search size={16} /> Buscar</Button>
            </Card>
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
                                {['PRODUÇÃO', 'LOGISTICA', 'ASG', 'MANUTENÇÃO', 'RETRABALHO', 'QUALIDADE', 'QUALIDADE RMA', 'QUALIDADE IQC', 'REPARO', 'PCP'].map(s => <option key={s} value={s}>{s}</option>)}
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
                        <Input label="Status" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} />
                        <Input label="Logradouro" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                        <Input label="Número (Endereço)" value={formData.addressNum} onChange={e => setFormData({ ...formData, addressNum: e.target.value })} />
                        <Input label="WhatsApp" value={formData.whatsapp} onChange={e => setFormData({ ...formData, whatsapp: e.target.value })} />
                    </div>
                    <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-zinc-800">
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
                        <UserIcon className="text-violet-500" /> Gestão de Pessoas (Gestores)
                    </h1>
                    <Button variant="outline" onClick={onBack}><ArrowLeft size={16} /> Voltar</Button>
                </div>

                {/* FILTRO GLOBAL DE LÍDER */}
                <LeaderFilter />

                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                    <Button variant={tab === 'CADASTRO' ? 'primary' : 'secondary'} onClick={() => setTab('CADASTRO')}><UserIcon size={16} /> Cadastro</Button>
                    <Button variant={tab === 'CONSULTA' ? 'primary' : 'secondary'} onClick={() => setTab('CONSULTA')}><Search size={16} /> Consulta</Button>
                    <Button variant={tab === 'EDICAO' ? 'primary' : 'secondary'} onClick={() => { setEditQuery(''); setEditFound(false); setTab('EDICAO'); }}><Save size={16} /> Edição</Button>
                    <Button variant={tab === 'PRESENCA' ? 'primary' : 'secondary'} onClick={() => setTab('PRESENCA')}><Clock size={16} /> Controle de Presença</Button>
                    <Button variant={tab === 'LAYOUT' ? 'primary' : 'secondary'} onClick={() => setTab('LAYOUT')}><List size={16} /> Layout de Linha</Button>
                    <Button variant={tab === 'LUVAS' ? 'primary' : 'secondary'} onClick={() => setTab('LUVAS')}><HandMetal size={16} /> Controle de Luvas</Button>
                </div>
            </header>

            {tab === 'CADASTRO' && renderCadastro()}
            {tab === 'CONSULTA' && renderConsulta()}
            {tab === 'EDICAO' && renderEdicao()}
            {tab === 'PRESENCA' && renderPresenca()}
            {tab === 'LAYOUT' && renderLayoutLinha()}
            {tab === 'LUVAS' && renderLuvas()}
        </div>
    );
};
