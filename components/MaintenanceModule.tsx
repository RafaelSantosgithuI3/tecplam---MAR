import React, { useState } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { ChecklistItem, ChecklistLog, User, ChecklistData, ChecklistEvidence } from '../types';
import { getMaintenanceItems, saveLog, fileToBase64, getManausDate } from '../services/storageService';
import { ArrowLeft, Save, Camera, QrCode } from 'lucide-react';
import jsQR from 'jsqr';
import { QRStreamReader } from './QRStreamReader';

interface MaintenanceModuleProps {
    currentUser: User;
    onBack: () => void;
}

export const MaintenanceModule: React.FC<MaintenanceModuleProps> = ({ currentUser, onBack }) => {
    const [view, setView] = useState<'QR' | 'FORM'>('QR');
    const [targetCode, setTargetCode] = useState('');
    const [items, setItems] = useState<ChecklistItem[]>([]);
    const [data, setData] = useState<ChecklistData>({});
    const [evidence, setEvidence] = useState<ChecklistEvidence>({});
    const [obs, setObs] = useState('');
    const isAndroid = /Android/i.test(navigator.userAgent);
    const [showQRReader, setShowQRReader] = useState(false);

    const handleQRScanSuccess = (text: string) => {
        setShowQRReader(false);
        handleCode(text);
    };

    const handleCode = async (code: string) => {
        const loaded = await getMaintenanceItems(code);
        if (loaded.length === 0) {
            alert("Nenhum checklist para: " + code);
            return;
        }
        setTargetCode(code);
        setItems(loaded);
        const init: ChecklistData = {};
        loaded.forEach(i => init[i.id] = 'OK');
        setData(init);
        setEvidence({});
        setObs('');
        setView('FORM');
    };

    const handlePhotoScan = async (file: File) => {
        const b64 = await fileToBase64(file);
        const img = new Image();
        img.src = b64;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code) handleCode(code.data);
            else alert("QR Code não detectado.");
        };
    };

    const handleSave = async () => {
        // Same save logic as ChecklistModule...
        const ngs = Object.entries(data).filter(([_, v]) => v === 'NG');
        if (ngs.some(([id]) => !evidence[id]?.photo && !evidence[id]?.comment)) return alert("NG precisa de evidência");

        const log: ChecklistLog = {
            id: Date.now().toString(),
            userId: currentUser.matricula,
            userName: currentUser.name,
            userRole: currentUser.role,
            userShift: currentUser.shift || '1',
            line: items[0]?.category.split(' - ')[0] || 'Geral', // Infer line from category convention
            date: getManausDate().toISOString(),
            itemsCount: items.length,
            ngCount: ngs.length,
            observation: obs,
            data, evidenceData: evidence,
            type: 'MAINTENANCE',
            maintenanceTarget: targetCode
        };
        await saveLog(log);
        alert("Manutenção Salva!");
        setView('QR');
    };

    if (view === 'QR') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-6">
                <Button variant="ghost" onClick={onBack} className="self-start"><ArrowLeft /> Voltar</Button>
                <div className="bg-white dark:bg-zinc-900 p-8 rounded-2xl border border-slate-200 dark:border-zinc-800 text-center max-w-sm w-full shadow-lg">
                    <div className="w-20 h-20 bg-orange-50 dark:bg-orange-900/10 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-orange-200 dark:border-orange-500/20"><QrCode size={40} /></div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Escanear Máquina</h2>
                    <p className="text-slate-500 dark:text-zinc-400 text-sm mb-6">Tire uma foto ou leia o QR Code da máquina.</p>
                    
                    {isAndroid ? (
                        <Button 
                            className="w-full justify-center bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-lg font-bold"
                            onClick={() => setShowQRReader(true)}
                        >
                            <Camera className="mr-2" size={20} />
                            Ler QR Code
                        </Button>
                    ) : (
                        <label className="block w-full">
                            <span className="btn-primary w-full flex justify-center cursor-pointer bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-lg font-bold">Abrir Câmera</span>
                            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => {
                                if (e.target.files?.[0]) handlePhotoScan(e.target.files[0]);
                            }} />
                        </label>
                    )}

                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-zinc-800">
                        <p className="text-xs text-slate-400 dark:text-zinc-500 mb-2 uppercase font-bold">Ou digite o código</p>
                        <div className="flex gap-2">
                            <Input value={targetCode} onChange={e => setTargetCode(e.target.value)} placeholder="COD-01" />
                            <Button onClick={() => handleCode(targetCode)}>OK</Button>
                        </div>
                    </div>
                    {showQRReader && (
                        <QRStreamReader onScanSuccess={handleQRScanSuccess} onClose={() => setShowQRReader(false)} />
                    )}
                </div>
            </div>
        )
    }

    return (
        <Card className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800">
            <div className="flex justify-between items-center mb-6">
                <Button variant="ghost" onClick={() => setView('QR')}><ArrowLeft /></Button>
                <h2 className="font-bold text-lg text-slate-900 dark:text-white">Manutenção: {targetCode}</h2>
                <Button onClick={handleSave} className="bg-green-600 text-white">Finalizar</Button>
            </div>
            {/* Reusing logic - Simplified Render */}
            <div className="space-y-4">
                {items.map(item => (
                    <div key={item.id} className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-200 dark:border-zinc-900">
                        <div className="flex justify-between items-start">
                            <p className="text-slate-700 dark:text-zinc-200">{item.text}</p>
                            <button onClick={() => setData(p => ({ ...p, [item.id]: p[item.id] === 'OK' ? 'NG' : 'OK' }))} className={`px-4 py-2 rounded font-bold ${data[item.id] === 'OK' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>{data[item.id]}</button>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
};
