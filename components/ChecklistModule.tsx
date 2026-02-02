import React, { useState, useEffect } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { ChecklistItem, ChecklistData, ChecklistEvidence, User, ChecklistLog } from '../types';
import { getChecklistItems, saveLog, fileToBase64, getManausDate, getWeekNumber } from '../services/storageService';
import { ArrowLeft, Save, Camera, AlertTriangle, CheckSquare } from 'lucide-react';

interface ChecklistModuleProps {
    currentUser: User;
    onBack: () => void;
    lines: { name: string, id: number | string }[];
}

export const ChecklistModule: React.FC<ChecklistModuleProps> = ({ currentUser, onBack, lines }) => {
    const [view, setView] = useState<'MENU' | 'FORM'>('MENU');
    const [currentLine, setCurrentLine] = useState('');
    const [items, setItems] = useState<ChecklistItem[]>([]);
    const [data, setData] = useState<ChecklistData>({});
    const [evidence, setEvidence] = useState<ChecklistEvidence>({});
    const [obs, setObs] = useState('');

    const handleStart = async (line: string) => {
        setCurrentLine(line);
        const loaded = await getChecklistItems('LEADER');
        setItems(loaded);
        // Init data
        const initial: ChecklistData = {};
        loaded.forEach(i => initial[i.id] = 'OK');
        setData(initial);
        setEvidence({});
        setObs('');
        setView('FORM');
    };

    const handleToggle = (id: string) => {
        setData(prev => ({
            ...prev,
            [id]: prev[id] === 'OK' ? 'NG' : (prev[id] === 'NG' ? 'N/A' : 'OK')
        }));
    };

    const handlePhoto = async (id: string, file: File) => {
        const base64 = await fileToBase64(file);
        setEvidence(prev => ({
            ...prev,
            [id]: { ...prev[id], photo: base64, comment: prev[id]?.comment || '' }
        }));
    };

    const handleComment = (id: string, text: string) => {
        setEvidence(prev => ({
            ...prev,
            [id]: { ...prev[id], comment: text }
        }));
    };

    const handleSave = async () => {
        const ngs = Object.entries(data).filter(([_, v]) => v === 'NG');
        if (ngs.length > 0) {
            const missingEvidence = ngs.some(([id]) => !evidence[id]?.photo && !evidence[id]?.comment);
            if (missingEvidence) {
                alert("Itens NG obrigam foto ou comentário.");
                return;
            }
        }

        const now = getManausDate();
        const log: ChecklistLog = {
            id: Date.now().toString(),
            userId: currentUser.matricula,
            userName: currentUser.name,
            userRole: currentUser.role,
            userShift: currentUser.shift || '1',
            line: currentLine,
            date: now.toISOString(),
            itemsCount: items.length,
            ngCount: ngs.length,
            observation: obs,
            data: data,
            evidenceData: evidence,
            type: 'PRODUCTION',
            itemsSnapshot: items
        };

        try {
            await saveLog(log);
            alert("Checklist Salvo!");
            setView('MENU');
        } catch (e) {
            alert("Erro ao salvar.");
        }
    };

    if (view === 'MENU') {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4 mb-6">
                    <Button variant="ghost" onClick={onBack}><ArrowLeft /></Button>
                    <h1 className="text-2xl font-bold text-white">Selecionar Linha</h1>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {lines.map(l => (
                        <button key={l.id} onClick={() => handleStart(l.name)} className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl hover:bg-blue-600/20 hover:border-blue-600 transition-all text-left group">
                            <span className="text-zinc-500 text-xs font-bold uppercase mb-1 block group-hover:text-blue-400">Linha</span>
                            <span className="text-xl font-bold text-white">{l.name}</span>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // GROUP BY CATEGORY
    const categories = Array.from(new Set(items.map(i => i.category)));

    return (
        <div className="max-w-4xl mx-auto pb-20">
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-zinc-950 py-4 z-10 border-b border-zinc-900">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => setView('MENU')}><ArrowLeft /></Button>
                    <div>
                        <h2 className="text-xl font-bold text-white">Checklist: {currentLine}</h2>
                        <p className="text-xs text-zinc-500">Turno {currentUser.shift} • {currentUser.name}</p>
                    </div>
                </div>
                <div className="text-right">
                    <Button size="sm" onClick={handleSave} className="bg-green-600 hover:bg-green-700">Finalizar</Button>
                </div>
            </div>

            <div className="space-y-8">
                {categories.map(cat => (
                    <Card key={cat} className="bg-zinc-900 border-zinc-800">
                        <h3 className="text-lg font-bold text-blue-400 mb-4 border-b border-zinc-800 pb-2">{cat}</h3>
                        <div className="space-y-4">
                            {items.filter(i => i.category === cat).map(item => (
                                <div key={item.id} className="bg-zinc-950 p-4 rounded-xl border border-zinc-900">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex-1">
                                            <p className="font-medium text-zinc-200 mb-2">{item.text}</p>
                                            {item.imageUrl && (
                                                <img src={item.imageUrl} className="h-24 rounded border border-zinc-800 mb-2" />
                                            )}
                                            {data[item.id] === 'NG' && (
                                                <div className="mt-2 space-y-2 animate-in slide-in-from-top-2">
                                                    <textarea
                                                        className="w-full bg-red-900/10 border border-red-900/30 rounded p-2 text-sm text-red-200 placeholder-red-900/50"
                                                        placeholder="Descreva o problema..."
                                                        value={evidence[item.id]?.comment || ''}
                                                        onChange={e => handleComment(item.id, e.target.value)}
                                                    />
                                                    <label className="flex items-center gap-2 text-xs text-red-400 cursor-pointer hover:underline">
                                                        <Camera size={14} />
                                                        {evidence[item.id]?.photo ? 'Trocar Foto' : 'Adicionar Foto'}
                                                        <input type="file" className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && handlePhoto(item.id, e.target.files[0])} />
                                                    </label>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleToggle(item.id)}
                                            className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg transition-all ${data[item.id] === 'OK' ? 'bg-green-600 text-white shadow-lg shadow-green-900/20' :
                                                    data[item.id] === 'NG' ? 'bg-red-600 text-white shadow-lg shadow-red-900/20' :
                                                        'bg-zinc-800 text-zinc-500'
                                                }`}
                                        >
                                            {data[item.id]}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                ))}

                <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                    <label className="label-text">Observações Gerais</label>
                    <textarea
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white"
                        rows={3}
                        value={obs}
                        onChange={e => setObs(e.target.value)}
                    />
                </div>

                <Button size="lg" fullWidth onClick={handleSave} className="bg-gradient-to-r from-green-600 to-emerald-600">
                    <Save size={20} className="mr-2" /> Enviar Checklist
                </Button>
            </div>
        </div>
    );
};
