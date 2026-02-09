import React, { useState, useEffect } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { LineStopData, ChecklistLog, User } from '../types';
import { saveLineStop, getLineStops, fileToBase64, getManausDate } from '../services/storageService';
import { ArrowLeft, Clock, Save, FileText, Upload, CheckCircle2 } from 'lucide-react';

interface LineStopModuleProps {
    currentUser: User;
    onBack: () => void;
    lines: { name: string }[];
    models: string[];
}

export const LineStopModule: React.FC<LineStopModuleProps> = ({ currentUser, onBack, lines, models }) => {
    const [tab, setTab] = useState<'NEW' | 'PENDING' | 'UPLOAD' | 'HISTORY'>('NEW');
    const [form, setForm] = useState<Partial<LineStopData>>({
        line: '', model: '', motif: '', responsibleSector: '',
        startTime: '', endTime: ''
    } as any);
    const [logs, setLogs] = useState<ChecklistLog[]>([]);
    const [activeLog, setActiveLog] = useState<ChecklistLog | null>(null);
    const [justification, setJustification] = useState('');

    useEffect(() => { loadLogs(); }, []);

    const loadLogs = async () => {
        const all = await getLineStops();
        setLogs(all);
    };

    const handleSave = async () => {
        if (!form.line || !form.model || !form.motivo || !form.responsibleSector) {
            alert("Preencha campos obrigatórios"); return;
        }

        // Calculate Time
        let total = '00:00';
        if (form.startTime && form.endTime) {
            const [sh, sm] = form.startTime.split(':').map(Number);
            const [eh, em] = form.endTime.split(':').map(Number);
            const diffMin = (eh * 60 + em) - (sh * 60 + sm);
            const h = Math.floor(diffMin / 60);
            const m = diffMin % 60;
            total = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        }

        const log: ChecklistLog = {
            id: Date.now().toString(),
            userId: currentUser.matricula,
            userName: currentUser.name,
            userRole: currentUser.role,
            userShift: currentUser.shift || '1',
            line: form.line!,
            date: getManausDate().toISOString(),
            itemsCount: 0,
            ngCount: 0,
            observation: '',
            type: 'LINE_STOP',
            data: { ...form, totalTime: total } as LineStopData,
            status: 'WAITING_JUSTIFICATION'
        };

        await saveLineStop(log);
        alert("Parada Registrada!");
        setForm({});
        setTab('PENDING');
        loadLogs();
    };

    const handleJustify = async () => {
        if (!activeLog || !justification) return;
        const newData = { ...(activeLog.data as LineStopData), justification, justifiedBy: currentUser.name, justifiedAt: new Date().toISOString() };
        const updated = { ...activeLog, data: newData as any, status: 'WAITING_SIGNATURE' as const };
        await saveLineStop(updated);
        setActiveLog(null);
        setJustification('');
        loadLogs();
        setTab('UPLOAD');
    };

    const handleUpload = async (file: File) => {
        if (!activeLog) return;
        const b64 = await fileToBase64(file);
        const updated = { ...activeLog, signedDocUrl: b64, status: 'COMPLETED' as const };
        await saveLineStop(updated);
        setActiveLog(null);
        alert("Upload concluído!");
        loadLogs();
        setTab('HISTORY');
    };

    // --- RENDER ---
    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <Button variant="ghost" onClick={onBack}><ArrowLeft /></Button>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">Parada de Linha</h1>
            </header>

            <div className="flex gap-2 bg-slate-100 dark:bg-zinc-900 p-2 rounded-xl w-fit border border-slate-200 dark:border-zinc-800">
                <Button variant={tab === 'NEW' ? 'primary' : 'ghost'} onClick={() => setTab('NEW')}>Nova Parada</Button>
                <Button variant={tab === 'PENDING' ? 'primary' : 'ghost'} onClick={() => setTab('PENDING')}>Justificar</Button>
                <Button variant={tab === 'UPLOAD' ? 'primary' : 'ghost'} onClick={() => setTab('UPLOAD')}>Upload Assinado</Button>
                <Button variant={tab === 'HISTORY' ? 'primary' : 'ghost'} onClick={() => setTab('HISTORY')}>Histórico</Button>
            </div>

            {tab === 'NEW' && (
                <Card className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase mb-1 block">Linha</label>
                            <select className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-600/50" value={form.line} onChange={e => setForm({ ...form, line: e.target.value })}>{lines.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}</select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase mb-1 block">Modelo</label>
                            <select className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-600/50" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })}>{models.map(m => <option key={m} value={m}>{m}</option>)}</select>
                        </div>
                        <Input type="time" label="Início" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
                        <Input type="time" label="Fim" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
                        <div>
                            <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase mb-1 block">Setor Responsável</label>
                            <select className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-600/50" value={form.responsibleSector} onChange={e => setForm({ ...form, responsibleSector: e.target.value })}><option value="">Select</option><option>Manutenção</option><option>Produção</option><option>Qualidade</option><option>Engenharia</option></select>
                        </div>
                        <div className="md:col-span-2"><Input label="Motivo (A7:J11)" value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} /></div>
                    </div>
                    <Button className="mt-4" onClick={handleSave}><Save className="mr-2" /> Salvar Parada</Button>
                </Card>
            )}

            {tab === 'PENDING' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {logs.filter(l => l.status === 'WAITING_JUSTIFICATION').map(l => (
                        <div key={l.id} className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-l-4 border-l-red-500 border-slate-200 dark:border-zinc-800 cursor-pointer shadow-sm hover:shadow-md transition-all" onClick={() => setActiveLog(l)}>
                            <h4 className="font-bold text-slate-900 dark:text-white">{l.line} - {(l.data as LineStopData).totalTime}</h4>
                            <p className="text-sm text-slate-500 dark:text-zinc-400">Motivo: {(l.data as LineStopData).motivo}</p>
                        </div>
                    ))}
                    {activeLog && (
                        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
                            <Card className="w-full max-w-md bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800">
                                <h3 className="font-bold mb-4 text-slate-900 dark:text-white">Justificar Parada</h3>
                                <textarea className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-3 text-slate-900 dark:text-white rounded-lg mb-4 outline-none focus:ring-2 focus:ring-blue-600/50" rows={5} placeholder="Justifique..." value={justification} onChange={e => setJustification(e.target.value)} />
                                <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setActiveLog(null)}>Cancelar</Button><Button onClick={handleJustify}>Salvar</Button></div>
                            </Card>
                        </div>
                    )}
                </div>
            )}

            {tab === 'UPLOAD' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {logs.filter(l => l.status === 'WAITING_SIGNATURE').map(l => (
                        <div key={l.id} className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-l-4 border-l-yellow-500 border-slate-200 dark:border-zinc-800 cursor-pointer shadow-sm hover:shadow-md transition-all" onClick={() => setActiveLog(l)}>
                            <h4 className="font-bold text-slate-900 dark:text-white">{l.line} - {(l.data as LineStopData).justifiedBy}</h4>
                            <p className="text-sm text-slate-500 dark:text-zinc-400">Clique para anexar foto assinada</p>
                        </div>
                    ))}
                    {activeLog && (
                        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
                            <Card className="w-full max-w-md bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800">
                                <h3 className="font-bold mb-4 text-slate-900 dark:text-white">Anexar Documento Assinado</h3>
                                <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} className="block w-full text-sm text-slate-500 dark:text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700" />
                                <Button className="mt-4 w-full" variant="ghost" onClick={() => setActiveLog(null)}>Cancelar</Button>
                            </Card>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
