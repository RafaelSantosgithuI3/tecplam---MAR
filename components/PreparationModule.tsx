
import React, { useState, useEffect } from 'react';
import { User, ConfigModel, PreparationLog, ConfigItem } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { Download, Save, Eye, Plus, ArrowLeft, Table, FileText } from 'lucide-react';
import { getPreparationLogs, savePreparationLog } from '../services/preparationService';
import { downloadPreparationExcel } from '../services/excelService';
import { getLines, getModelsFull } from '../services/storageService';

interface PreparationModuleProps {
    currentUser: User;
    onBack: () => void;
}

export const PreparationModule: React.FC<PreparationModuleProps> = ({ currentUser, onBack }) => {
    const [tab, setTab] = useState<'LAUNCH' | 'VIEW'>('LAUNCH');
    const [lines, setLines] = useState<ConfigItem[]>([]);
    const [models, setModels] = useState<ConfigModel[]>([]);
    const [logs, setLogs] = useState<PreparationLog[]>([]);

    // Form State
    const getProductionDate = () => {
        const now = new Date();
        // 1. Get UTC time in ms
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        // 2. Apply Manaus Offset (-4h)
        const manausTime = new Date(utc + (3600000 * -4));

        // 3. Shift Rule (Before 04:00 AM counts as previous day)
        if (manausTime.getHours() < 4) {
            manausTime.setDate(manausTime.getDate() - 1);
        }

        return manausTime.toISOString().split('T')[0];
    };

    const initialForm: Partial<PreparationLog> = {
        date: getProductionDate(),
        responsible: currentUser.name,
        shift: currentUser.shift || '',
        line: '',
        model: '',
        sku: '',
        plate: '', rear: '', btFt: '', pba: '',
        currentRfCal: '', input: '', preKey: '', lcia: '',
        audio: '', radiation: '', imei: '', vct: '', revision: '',
        desmonte: '', oven: '', repair: '', observation: ''
    };

    const [form, setForm] = useState<Partial<PreparationLog>>(initialForm);
    const [loading, setLoading] = useState(false);

    // Filter State for View
    const [filterDate, setFilterDate] = useState(getProductionDate());
    const [filterShift, setFilterShift] = useState('ALL'); // '1', '2', 'ALL'

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLines(await getLines());
        setModels(await getModelsFull());
        setLogs(await getPreparationLogs());
    };

    const handleModelChange = (modelName: string) => {
        const selected = models.find(m => m.name === modelName);
        setForm(prev => ({
            ...prev,
            model: modelName,
            sku: selected?.sku || ''
        }));
    };

    const handleSubmit = async () => {
        if (!form.line || !form.model) return alert('Preencha os campos obrigatórios');

        setLoading(true);
        try {
            await savePreparationLog(form as PreparationLog);
            alert('Preparação salva com sucesso!');
            setForm({ ...initialForm, date: getProductionDate() }); // Reset preserve automated fields
            loadData();
        } catch (e) {
            alert('Erro ao salvar');
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        const filtered = logs.filter(l => {
            if (l.date !== filterDate) return false;
            if (filterShift !== 'ALL' && !l.shift.includes(filterShift)) return false;
            return true;
        });
        downloadPreparationExcel(filtered, { date: filterDate, shift: filterShift });
    };

    const filteredLogs = logs.filter(l => {
        const matchesDate = l.date === filterDate;
        const matchesShift = filterShift === 'ALL' ? true : l.shift.includes(filterShift);
        return matchesDate && matchesShift;
    });

    // Helper to render numeric fields grid in card
    const renderMetricsGrid = (log: PreparationLog) => {
        const metrics = [
            { k: 'plate', l: 'Placa' }, { k: 'rear', l: 'Rear' }, { k: 'btFt', l: 'Bt-Ft' }, { k: 'pba', l: 'Pba' },
            { k: 'currentRfCal', l: 'Corrente/RF' }, { k: 'input', l: 'Input' }, { k: 'preKey', l: 'Pré-Key' }, { k: 'lcia', l: 'LCIA' },
            { k: 'audio', l: 'Audio' }, { k: 'radiation', l: 'Radiação' }, { k: 'imei', l: 'IMEI' }, { k: 'vct', l: 'VCT' },
            { k: 'revision', l: 'Revisão' }, { k: 'desmonte', l: 'Desmonte' }, { k: 'oven', l: 'Forno' }, { k: 'repair', l: 'Reparo' }
        ];

        return (
            <div className="grid grid-cols-4 gap-2 mt-3">
                {metrics.map(m => {
                    const rawVal = log[m.k as keyof PreparationLog];
                    // Coerce to number 0 if null/undefined/empty string
                    const val = (rawVal === undefined || rawVal === null || rawVal === '') ? 0 : Number(rawVal);

                    const isZero = val === 0;

                    return (
                        <div key={m.k} className={`p-1.5 rounded flex flex-col items-center border ${isZero
                            ? 'bg-slate-50 dark:bg-zinc-900/50 border-slate-100 dark:border-zinc-800'
                            : 'bg-slate-100 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700'}`}>
                            <span className="text-[9px] text-slate-400 dark:text-zinc-500 uppercase font-bold tracking-wider">{m.l}</span>
                            <span className={`text-sm ${isZero
                                ? 'text-slate-300 dark:text-zinc-600 font-normal'
                                : 'text-slate-900 dark:text-zinc-100 font-bold'}`}>
                                {val}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="w-full max-w-7xl mx-auto space-y-6">
            <header className="flex flex-col gap-4 mb-4 md:mb-8 pb-4 md:pb-6 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                    <h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                        <FileText className="text-blue-500" /> Preparação de Linha
                    </h1>
                    <Button variant="outline" onClick={onBack}><ArrowLeft size={16} /> Voltar</Button>
                </div>
                <div className="flex gap-2">
                    <Button variant={tab === 'LAUNCH' ? 'primary' : 'secondary'} onClick={() => setTab('LAUNCH')}><Plus size={16} /> Lançamento</Button>
                    <Button variant={tab === 'VIEW' ? 'primary' : 'secondary'} onClick={() => setTab('VIEW')}><Eye size={16} /> Visualização</Button>
                </div>
            </header>

            {tab === 'LAUNCH' && (
                <div className="space-y-6 pb-20">
                    <Card>
                        <h3 className="text-lg font-bold mb-4 border-b border-slate-200 dark:border-zinc-800 pb-2 text-slate-900 dark:text-white">Informações Básicas</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Input label="Data" value={form.date} disabled />
                            <Input label="Responsável" value={form.responsible} disabled />
                            <Input label="Turno" value={form.shift} disabled />

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase">Linha</label>
                                <select
                                    className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-lg p-2.5 text-slate-900 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-blue-500"
                                    value={form.line}
                                    onChange={e => setForm({ ...form, line: e.target.value })}
                                >
                                    <option value="">Selecione...</option>
                                    {lines.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase">Modelo</label>
                                <select
                                    className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-lg p-2.5 text-slate-900 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-blue-500"
                                    value={form.model}
                                    onChange={e => handleModelChange(e.target.value)}
                                >
                                    <option value="">Selecione...</option>
                                    {models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                                </select>
                            </div>

                            <Input label="SKU" value={form.sku || ''} disabled />
                        </div>
                    </Card>

                    <Card>
                        <h3 className="text-lg font-bold mb-4 border-b border-slate-200 dark:border-zinc-800 pb-2 text-slate-900 dark:text-white">Postos (Opcionais)</h3>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <Input label="Placa" value={form.plate || ''} onChange={e => setForm({ ...form, plate: e.target.value.replace(/\D/g, '') })} />
                            <Input label="Rear" value={form.rear || ''} onChange={e => setForm({ ...form, rear: e.target.value.replace(/\D/g, '') })} />
                            <Input label="Bt-Ft" value={form.btFt || ''} onChange={e => setForm({ ...form, btFt: e.target.value.replace(/\D/g, '') })} />
                            <Input label="Pba" value={form.pba || ''} onChange={e => setForm({ ...form, pba: e.target.value.replace(/\D/g, '') })} />
                            <Input label="Vct" value={form.vct || ''} onChange={e => setForm({ ...form, vct: e.target.value.replace(/\D/g, '') })} />
                        </div>
                    </Card>

                    <Card>
                        <h3 className="text-lg font-bold mb-4 border-b border-slate-200 dark:border-zinc-800 pb-2 text-slate-900 dark:text-white">Postos (Obrigatórios)</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Numeric Fields */}
                            {[
                                { k: 'currentRfCal', label: 'Corrente/RF CAL' },
                                { k: 'input', label: 'Input' },
                                { k: 'preKey', label: 'Pré-Key' },
                                { k: 'lcia', label: 'Lcia' },
                                { k: 'audio', label: 'Audio' },
                                { k: 'radiation', label: 'Radiação' },
                                { k: 'imei', label: 'Imei' },
                                { k: 'revision', label: 'Revisão' },
                            ].map(f => (
                                <Input
                                    key={f.k}
                                    label={f.label}
                                    value={form[f.k as keyof PreparationLog] !== undefined ? String(form[f.k as keyof PreparationLog]) : ''}
                                    onChange={e => setForm({ ...form, [f.k]: e.target.value.replace(/\D/g, '') })}
                                />
                            ))}
                        </div>
                    </Card>

                    <Card>
                        <h3 className="text-lg font-bold mb-4 border-b border-slate-200 dark:border-zinc-800 pb-2 text-slate-900 dark:text-white">Postos Retrabalho (Obrigatórios)</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Numeric Fields */}
                            {[
                                { k: 'desmonte', label: 'Desmonte' },
                                { k: 'oven', label: 'Forno' },
                                { k: 'repair', label: 'Reparo' },
                            ].map(f => (
                                <Input
                                    key={f.k}
                                    label={f.label}
                                    value={form[f.k as keyof PreparationLog] !== undefined ? String(form[f.k as keyof PreparationLog]) : ''}
                                    onChange={e => setForm({ ...form, [f.k]: e.target.value.replace(/\D/g, '') })}
                                />
                            ))}
                        </div>
                    </Card>

                    <Card>
                        <h3 className="text-lg font-bold mb-4 border-b border-slate-200 dark:border-zinc-800 pb-2 text-slate-900 dark:text-white">Observações (Opcionais)</h3>
                        <textarea
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-lg p-3 text-slate-900 dark:text-zinc-200 h-24"
                            placeholder="Observações adicionais..."
                            value={form.observation}
                            onChange={e => setForm({ ...form, observation: e.target.value })}
                        />
                    </Card>

                    <div className="pt-4">
                        <Button fullWidth onClick={handleSubmit} disabled={loading} className="py-4 text-lg">
                            {loading ? 'Salvando...' : 'Salvar Preparação'}
                        </Button>
                    </div>
                </div>
            )}

            {tab === 'VIEW' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 flex flex-wrap gap-4 items-end">
                        <Input type="date" label="Data" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase">Turno</label>
                            <select
                                className="h-10 px-3 bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-zinc-200"
                                value={filterShift}
                                onChange={e => setFilterShift(e.target.value)}
                            >
                                <option value="ALL">Ambos</option>
                                <option value="1">1º Turno</option>
                                <option value="2">2º Turno</option>
                            </select>
                        </div>
                        <Button onClick={handleExport}><Download size={16} /> Exportar Excel</Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredLogs.length === 0 && <div className="col-span-full p-8 text-center text-slate-500">Nenhum registro encontrado.</div>}
                        {filteredLogs.map(l => {
                            // Helper to sum fields safely
                            const sum = (...keys: (keyof PreparationLog)[]) => {
                                return keys.reduce((acc, k) => {
                                    const val = l[k];
                                    const num = (!val || val === '') ? 0 : Number(val);
                                    return acc + (isNaN(num) ? 0 : num);
                                }, 0);
                            };

                            // Calculate Totals
                            const processoTTL = sum('currentRfCal', 'input', 'preKey', 'lcia', 'audio', 'radiation', 'imei', 'vct', 'revision');
                            const defeitosTTL = sum('desmonte', 'repair', 'oven');

                            // Placa TTL = All numeric fields EXCEPT rear
                            // All numeric: plate, rear, btFt, pba, currentRfCal, input, preKey, lcia, audio, radiation, imei, vct, revision, desmonte, oven, repair
                            // So we sum all and subtract rear? Or just sum the list excluding rear.
                            // List excluding rear:
                            const placaTTL = sum(
                                'plate', 'btFt', 'pba', // Basic
                                'currentRfCal', 'input', 'preKey', 'lcia', 'audio', 'radiation', 'imei', 'vct', 'revision', // Process
                                'desmonte', 'oven', 'repair' // Defects
                            );

                            return (
                                <div key={l.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 shadow-sm hover:border-blue-500 transition-colors">
                                    {/* Header */}
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h4 className="font-bold text-lg text-slate-900 dark:text-white leading-tight">{l.model}</h4>
                                            <p className="text-sm text-slate-500 dark:text-zinc-400">{l.line}</p>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs font-bold border ${l.shift.includes('1')
                                            ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800'
                                            : 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800'}`}>
                                            {l.shift}º Turno
                                        </span>
                                    </div>

                                    {/* Calculated Totals Summary */}
                                    <div className="grid grid-cols-3 gap-2 mb-4 bg-slate-50 dark:bg-zinc-800/50 p-2 rounded-lg border border-slate-100 dark:border-zinc-800">
                                        <div className="text-center">
                                            <span className="block text-[10px] uppercase text-slate-500 dark:text-zinc-500 font-bold mb-1">Processo TTL</span>
                                            <span className="font-bold text-lg text-blue-600 dark:text-blue-400">{processoTTL}</span>
                                        </div>
                                        <div className="text-center border-x border-slate-200 dark:border-zinc-700">
                                            <span className="block text-[10px] uppercase text-slate-500 dark:text-zinc-500 font-bold mb-1">Placa TTL</span>
                                            <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">{placaTTL}</span>
                                        </div>
                                        <div className="text-center">
                                            <span className="block text-[10px] uppercase text-slate-500 dark:text-zinc-500 font-bold mb-1">Defeitos TTL</span>
                                            <span className="font-bold text-lg text-red-500 dark:text-red-400">{defeitosTTL}</span>
                                        </div>
                                    </div>

                                    {/* Border separator before details */}
                                    <div className="border-t border-slate-100 dark:border-zinc-800 my-3"></div>

                                    {renderMetricsGrid(l)}

                                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 text-xs">
                                        <div className="flex justify-between items-center text-slate-500 dark:text-zinc-500">
                                            <span>Resp: <strong className="text-slate-700 dark:text-zinc-300">{l.responsible}</strong></span>
                                        </div>
                                        {l.observation && (
                                            <div className="mt-2 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 p-2 rounded border border-yellow-200 dark:border-yellow-900/50">
                                                ⚠️ {l.observation}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
