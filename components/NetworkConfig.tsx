import React, { useState, useEffect } from 'react';
import { Wifi, Save, RotateCw, CheckCircle2, AlertTriangle, Cloud, Server } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { saveServerUrl, getServerUrl, isServerConfigured, apiFetch } from '../services/networkConfig';

interface NetworkConfigProps {
    onConfigured: () => void;
}

export const NetworkConfig: React.FC<NetworkConfigProps> = ({ onConfigured }) => {
    const [ip, setIp] = useState('');
    const [status, setStatus] = useState<'IDLE' | 'CHECKING' | 'SUCCESS' | 'ERROR'>('IDLE');
    const [msg, setMsg] = useState('');

    useEffect(() => {
        const saved = getServerUrl();
        if (saved) {
            // Remove protocol/port for display if desired, or keep full
            setIp(saved.replace('http://', '').replace(':3000', ''));
        }
    }, []);

    const handleSave = async () => {
        setStatus('CHECKING');
        setMsg('Testando conexão...');

        // Basic sanitization
        let cleanIp = ip.trim();
        if (!cleanIp) {
            setStatus('ERROR');
            setMsg('Digite um IP válido.');
            return;
        }

        // Construct full URL
        const url = `http://${cleanIp}:3000`;

        try {
            // Save temporarily to test
            saveServerUrl(url);

            // Ping check (health endpoint)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            try {
                const res = await fetch(`${url}/health`, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (res.ok) {
                    setStatus('SUCCESS');
                    setMsg('Conectado com sucesso!');
                    setTimeout(() => {
                        onConfigured();
                    }, 800);
                } else {
                    throw new Error('Servidor respondeu com erro.');
                }
            } catch (inner) {
                throw new Error('Sem resposta do servidor. Verifique o IP e se o servidor está rodando.');
            }

        } catch (e) {
            setStatus('ERROR');
            setMsg('Falha ao conectar.');
        }
    };

    return (
        <div className="w-full flex-1 flex flex-col items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
            <Card className="w-full max-w-md bg-white/80 dark:bg-zinc-900/80 backdrop-blur border-slate-200 dark:border-zinc-700 shadow-2xl">
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4 relative">
                        <Wifi size={32} className="text-blue-500" />
                        <div className="absolute inset-0 rounded-full border border-blue-500/30 animate-ping opacity-20" />
                    </div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                        Conexão do Servidor
                    </h2>
                    <p className="text-zinc-400 text-sm mt-2">
                        Configure o IP do servidor local para acessar o sistema.
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="bg-slate-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 flex items-center gap-3">
                        <Server size={20} className="text-zinc-500" />
                        <div className="flex-1">
                            <label className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">Endereço IP (Ex: 192.168.0.10)</label>
                            <input
                                type="text"
                                className="w-full bg-transparent border-none p-0 text-slate-900 dark:text-zinc-100 font-mono focus:ring-0 placeholder:text-slate-400 dark:placeholder:text-zinc-700"
                                placeholder="192.168.X.X"
                                value={ip}
                                onChange={e => setIp(e.target.value)}
                            />
                        </div>
                    </div>

                    {status === 'ERROR' && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
                            <AlertTriangle size={16} />
                            {msg}
                        </div>
                    )}

                    {status === 'SUCCESS' && (
                        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm flex items-center gap-2">
                            <CheckCircle2 size={16} />
                            {msg}
                        </div>
                    )}

                    <Button
                        onClick={handleSave}
                        disabled={status === 'CHECKING' || status === 'SUCCESS'}
                        className={`w-full h-12 text-base ${status === 'SUCCESS' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                    >
                        {status === 'CHECKING' ? (
                            <><RotateCw className="animate-spin mr-2" /> Conectando...</>
                        ) : status === 'SUCCESS' ? (
                            <><CheckCircle2 className="mr-2" /> Tudo Pronto!</>
                        ) : (
                            <><Cloud className="mr-2" /> Salvar e Conectar</>
                        )}
                    </Button>
                </div>

                <div className="mt-6 text-center">
                    <p className="text-xs text-zinc-600">
                        Certifique-se que o dispositivo está na mesma rede Wi-Fi.
                    </p>
                </div>
            </Card>
        </div>
    );
};
