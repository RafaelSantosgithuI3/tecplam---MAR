import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { Input } from './Input';
import { Shield, Plus, Search, User as UserIcon, List, ArrowLeft, CheckCircle, Clock, Save } from 'lucide-react';
import { apiFetch } from '../services/networkConfig';
import { exportLeaderLayout, exportModelLayout } from '../services/excelService';

interface PeopleManagementModuleProps {
    onBack: () => void;
    currentUser: any;
}

type Tab = 'CADASTRO' | 'CONSULTA' | 'PRESENCA' | 'LAYOUT';

export const PeopleManagementModule: React.FC<PeopleManagementModuleProps> = ({ onBack, currentUser }) => {
    const [tab, setTab] = useState<Tab>('CADASTRO');
    const [employees, setEmployees] = useState<any[]>([]);
    const [leaders, setLeaders] = useState<any[]>([]);
    const [models, setModels] = useState<any[]>([]);
    const [workstations, setWorkstations] = useState<any[]>([]);
    const [configRoles, setConfigRoles] = useState<any[]>([]);

    useEffect(() => {
        loadBaseData();
    }, []);

    const loadBaseData = async () => {
        try {
            const users = await apiFetch('/users');
            if (Array.isArray(users)) {
                setLeaders(users.filter(u => u.role && (u.role.toLowerCase().includes('lider') || u.role.toLowerCase().includes('líder') || u.role.toLowerCase().includes('supervisor'))));
            }
            const emp = await apiFetch('/employees');
            if (Array.isArray(emp)) setEmployees(emp);

            const mods = await apiFetch('/config/models');
            if (Array.isArray(mods)) setModels(mods);

            const wks = await apiFetch('/workstations');
            if (Array.isArray(wks)) setWorkstations(wks);

            const fetchedRoles = await apiFetch('/config/roles');
            if (Array.isArray(fetchedRoles)) setConfigRoles(fetchedRoles);
        } catch (e) {
            console.error('Erro ao carregar dados base', e);
        }
    };

    // TAB 1: CADASTRO
    const [formData, setFormData] = useState({
        matricula: '', photo: '', fullName: '', shift: '', role: '', sector: '',
        superiorId: '', idlSt: '', type: '', status: '', address: '', addressNum: '', whatsapp: ''
    });

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
                body: JSON.stringify(formData)
            });
            alert('Salvo com sucesso!');
            setFormData({
                matricula: '', photo: '', fullName: '', shift: '', role: '', sector: '',
                superiorId: '', idlSt: '', type: '', status: '', address: '', addressNum: '', whatsapp: ''
            });
            loadBaseData();
        } catch (e) {
            alert('Erro ao salvar');
        }
    };

    const handleMatriculaBlur = async () => {
        const mat = formData.matricula?.trim();
        if (!mat) return;
        try {
            const user = await apiFetch(`/users/matricula/${mat}`);
            if (user && user.matricula) {
                setFormData(prev => ({
                    ...prev,
                    fullName: prev.fullName || user.name || '',
                    role: prev.role || user.role || '',
                    shift: prev.shift || user.shift || ''
                }));
            }
        } catch (e) {
            // Se der 404, não é obrigatório mostrar erro para o usuário
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
                <Button onClick={handleSaveEmployee}><Save size={16} /> Salvar Colaborador</Button>
            </div>
        </Card>
    );

    // TAB 2: CONSULTA
    const [searchQuery, setSearchQuery] = useState('');
    const [consultResult, setConsultResult] = useState<any>(null);

    const handleConsult = async () => {
        if (!searchQuery) return;
        try {
            const res = await apiFetch(`/employees/${encodeURIComponent(searchQuery.trim())}`);
            if (res && res.matricula) {
                // Calculate rank
                const now = new Date();
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();
                let misses = 0;
                res.attendanceLogs?.forEach((log: any) => {
                    const d = new Date(log.date);
                    if (d.getMonth() === currentMonth && d.getFullYear() === currentYear && (log.type === 'FALTA' || log.type === 'ATESTADO')) {
                        misses++;
                    }
                });
                const rank = Math.max(0, 10 - misses * 0.5);
                setConsultResult({ ...res, misses, rank });
            } else {
                setConsultResult(null);
                alert('Não encontrado');
            }
        } catch (e) {
            setConsultResult(null);
            alert('Não encontrado');
        }
    };

    const renderConsulta = () => (
        <div className="space-y-4">
            <Card className="flex gap-2 items-end">
                <div className="flex-1">
                    <Input label="Buscar Matrícula" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <Button onClick={handleConsult}><Search size={16} /> Buscar</Button>
            </Card>
            {consultResult && (
                <Card className="flex gap-4 items-start">
                    {consultResult.photo ? (
                        <img src={consultResult.photo} alt="Colaborador" className="w-32 h-32 object-cover rounded-xl border border-slate-200" />
                    ) : (
                        <div className="w-32 h-32 bg-slate-200 dark:bg-zinc-800 rounded-xl flex items-center justify-center">
                            <UserIcon size={48} className="text-slate-400" />
                        </div>
                    )}
                    <div className="flex-1 space-y-2">
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-zinc-100">{consultResult.fullName}</h2>
                        <p className="text-slate-600 dark:text-zinc-400">Matrícula: {consultResult.matricula} | {consultResult.role} - {consultResult.sector}</p>
                        <div className="flex gap-4 mt-2">
                            <div className="bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 px-4 py-2 rounded-xl text-center">
                                <p className="text-xs uppercase font-bold">Rank do Mês</p>
                                <p className="text-2xl font-bold">{consultResult.rank.toFixed(1)}</p>
                            </div>
                            <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-2 rounded-xl text-center">
                                <p className="text-xs uppercase font-bold">Ausências (Mês)</p>
                                <p className="text-2xl font-bold">{consultResult.misses}</p>
                            </div>
                        </div>
                        {consultResult.previousLeaders && (() => {
                            let hist = [];
                            try { hist = JSON.parse(consultResult.previousLeaders); } catch (e) { }
                            if (hist.length === 0) return null;
                            return (
                                <div className="mt-4 p-4 border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl">
                                    <p className="text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-2 uppercase">Histórico de Líderes</p>
                                    <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                                        {hist.map((l: string, i: number) => {
                                            const leaderObj = leaders.find(ld => ld.matricula === l);
                                            const leaderName = leaderObj ? `${leaderObj.name} (${l})` : l;
                                            return <li key={i}>• {leaderName}</li>;
                                        })}
                                    </ul>
                                </div>
                            );
                        })()}
                    </div>
                </Card>
            )}
        </div>
    );

    // TAB 3: PRESENÇA
    const [attSearchQuery, setAttSearchQuery] = useState('');
    const [attSelectedEmployee, setAttSelectedEmployee] = useState<any>(null);
    const [attType, setAttType] = useState('FALTA');
    const [attDelayMinutes, setAttDelayMinutes] = useState('');

    const handleSearchSubordinado = () => {
        const found = employees.find(e => e.superiorId === currentUser.matricula && (e.matricula.includes(attSearchQuery) || e.fullName.toLowerCase().includes(attSearchQuery.toLowerCase())));
        if (found) setAttSelectedEmployee(found);
        else alert('Colaborador não encontrado ou não é seu subordinado.');
    };

    const handleSaveAttendance = async () => {
        if (!attSelectedEmployee) return;
        try {
            await apiFetch('/attendance', {
                method: 'POST',
                body: JSON.stringify({
                    employeeId: attSelectedEmployee.matricula,
                    date: new Date().toISOString(),
                    type: attType,
                    delayMinutes: attType === 'ATRASO' ? parseInt(attDelayMinutes) : null,
                    loggedById: currentUser.matricula
                })
            });
            alert('Apontamento registrado!');
            setAttSelectedEmployee(null);
            setAttSearchQuery('');
            setAttDelayMinutes('');
        } catch (e) { alert('Erro ao salvar'); }
    };

    const renderPresenca = () => (
        <div className="space-y-4">
            <Card className="flex gap-2 items-end">
                <div className="flex-1">
                    <Input label="Buscar Subordinado (Nome ou Matrícula)" value={attSearchQuery} onChange={e => setAttSearchQuery(e.target.value)} />
                </div>
                <Button onClick={handleSearchSubordinado}><Search size={16} /> Buscar</Button>
            </Card>
            {attSelectedEmployee && (
                <Card className="space-y-4">
                    <div className="flex items-center gap-4">
                        {attSelectedEmployee.photo && <img src={attSelectedEmployee.photo} alt="Colaborador" className="w-16 h-16 object-cover rounded-full" />}
                        <div>
                            <p className="font-bold text-lg text-slate-800 dark:text-zinc-100">{attSelectedEmployee.fullName}</p>
                            <p className="text-slate-500">{attSelectedEmployee.matricula}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Tipo de Apontamento</label>
                            <select className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100" value={attType} onChange={e => setAttType(e.target.value)}>
                                <option value="FALTA">Falta</option>
                                <option value="ATESTADO">Atestado</option>
                                <option value="ATRASO">Atraso</option>
                            </select>
                        </div>
                        {attType === 'ATRASO' && (
                            <Input label="Tempo (Minutos)" type="number" value={attDelayMinutes} onChange={e => setAttDelayMinutes(e.target.value)} />
                        )}
                    </div>
                    <div className="flex justify-end">
                        <Button onClick={handleSaveAttendance}><CheckCircle size={16} /> Registrar</Button>
                    </div>
                </Card>
            )}
        </div>
    );

    // TAB 4: LAYOUT DE LINHA
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

    const handleBindStation = async () => {
        if (!selectedAlocationEmp || !alocStation || !alocModel) return alert('Selecione Modelo e Posto');
        try {
            await apiFetch(`/employees/${selectedAlocationEmp.matricula}/workstation-slots`, {
                method: 'POST',
                body: JSON.stringify({
                    modelText: alocModel,
                    orderText: alocOrder,
                    workstationName: alocStation
                })
            });
            alert('Vinculado com sucesso!');
            setSelectedAlocationEmp(null);
            setAlocModel('');
            setAlocStation('');
            setAlocOrder('');
            loadBaseData();
        } catch (e) {
            alert('Não foi possível vincular. (Todos os 6 slots podem estar cheios?)');
        }
    };
    const subordinados = employees.filter(e => e.superiorId === currentUser.matricula);

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
                        <Button variant="secondary" onClick={() => {
                            if (!alocModel) return alert('Selecione primeiro qual modelo abaixo. (Atualmente filtrado durante alocação)');
                            exportModelLayout(alocModel, workstations, employees);
                        }}><List size={16} /> Imprimir (Modelo)</Button>
                    </div>
                </div>
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden text-sm">
                    {subordinados.length === 0 ? (
                        <p className="p-4 text-slate-500">Nenhum colaborador na sua linha.</p>
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
                                        <td className="p-4 text-right">
                                            <Button variant="danger" onClick={() => handleRemoveLine(s.matricula)}>Retirar</Button>
                                        </td>
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
                                {models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                            </select>
                            <select className="bg-slate-50 dark:bg-zinc-800 p-2 rounded" value={alocStation} onChange={e => setAlocStation(e.target.value)}>
                                <option value="">Selecione Posto</option>
                                {workstations.filter(w => w.modelName === alocModel).map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                            </select>
                            <Input label="Ordem (Ex: 1, 2...)" value={alocOrder} onChange={e => setAlocOrder(e.target.value)} />
                        </div>
                        <Button className="w-full mt-2" onClick={handleBindStation}>Vincular Posto</Button>
                        <div className="flex justify-end mt-4">
                            <Button variant="secondary" onClick={() => setSelectedAlocationEmp(null)}>Fechar</Button>
                        </div>
                    </Card>
                </div>
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
                    <Button variant={tab === 'CADASTRO' ? 'primary' : 'secondary'} onClick={() => setTab('CADASTRO')}><UserIcon size={16} /> Cadastro</Button>
                    <Button variant={tab === 'CONSULTA' ? 'primary' : 'secondary'} onClick={() => setTab('CONSULTA')}><Search size={16} /> Consulta</Button>
                    <Button variant={tab === 'PRESENCA' ? 'primary' : 'secondary'} onClick={() => setTab('PRESENCA')}><Clock size={16} /> Controle de Presença</Button>
                    <Button variant={tab === 'LAYOUT' ? 'primary' : 'secondary'} onClick={() => setTab('LAYOUT')}><List size={16} /> Layout de Linha</Button>
                </div>
            </header>

            {tab === 'CADASTRO' && renderCadastro()}
            {tab === 'CONSULTA' && renderConsulta()}
            {tab === 'PRESENCA' && renderPresenca()}
            {tab === 'LAYOUT' && renderLayoutLinha()}
        </div>
    );
};
