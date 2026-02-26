import React, { useState, useEffect, useRef } from 'react';
import { Camera, Box, Package, Plus, Search, FileText, CheckCircle2 } from 'lucide-react';
import jsQR from 'jsqr';
import { Card } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { getBoxes, createBox, closeBox, associateBoxNF, linkScrapToBox } from '../services/boxService';
import { exportExecutiveReport, generateBoxLabels } from '../services/excelService';

export const QRScannerInput = ({ onScan }: { onScan: (qrCode: string, extractedCode: string) => void }) => {
    const [scanned, setScanned] = useState('');

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            processQR(scanned);
        }
    };

    const processQR = (qr: string) => {
        if (!qr) return;
        const extracted = qr.substring(0, 11);
        onScan(qr, extracted);
        setScanned(''); // Clear input after scan
    };

    return (
        <div className="flex gap-2 items-end">
            <div className="flex-1">
                <label className="block text-xs uppercase mb-1.5 font-bold text-blue-600 dark:text-blue-400">Escanear QR Code</label>
                <div className="relative">
                    <input
                        type="text"
                        className="w-full bg-blue-50/50 dark:bg-blue-900/10 border-2 border-blue-400/50 dark:border-blue-500/50 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-900 dark:text-zinc-100 transition-all placeholder-blue-300 dark:placeholder-blue-700"
                        value={scanned}
                        onChange={(e) => setScanned(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Leitor USB / Digite e tecle Enter..."
                        autoFocus
                    />
                </div>
            </div>
        </div>
    );
};

export const ScrapBoxMount = ({ currentUser, onUpdate }: any) => {
    const [boxes, setBoxes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const loadBoxes = async () => {
        try {
            const data = await getBoxes();
            setBoxes(data.filter((b: any) => b.status === 'OPEN'));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadBoxes(); }, []);

    const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

    const handleCreateBox = async () => {
        const type = prompt("Digite o Tipo da Caixa\n(REAR, FRONT, BATERIA, MIUDEZA(S)):");
        if (type && type.trim() !== '') {
            await createBox(type.toUpperCase());
            loadBoxes();
        }
    };

    const handleGenerateIdent = async (box: any) => {
        const extra = { type: box.type, volumes: '1', dynamicParam: '-' };
        if (box.type === 'BATERIA' || box.type === 'BATERIA RMA' || box.type === 'BATERIA SCRAP') {
            extra.volumes = prompt('Quantidade de volumes da bateria:') || '1';
        }
        await generateBoxLabels(box.id, box.scraps, extra);
        await closeBox(box.id);
        alert('Placa de identificação gerada e caixa vinculada ao status IDENTIFICADA.');
        loadBoxes();
        if (onUpdate) onUpdate();
    };

    const handleBindQR = async (boxId: number, qr: string) => {
        try {
            await linkScrapToBox(boxId, qr);
            loadBoxes();
            if (onUpdate) onUpdate();
        } catch (e: any) {
            alert(e.message || "Erro ao vincular QR Code");
        }
    };

    if (loading) return <div>Carregando Caixas...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Montar Caixas (Abertas)</h2>
                <Button onClick={handleCreateBox}><Plus size={16} /> Nova Caixa</Button>
            </div>

            {boxes.length === 0 && (
                <Card className="text-center p-8 bg-zinc-50 dark:bg-zinc-900 border-dashed">
                    <p className="text-zinc-500">Nenhuma caixa OPEN encontrada. Crie uma para começar a adicionar scraps.</p>
                </Card>
            )}

            <div className="grid gap-6">
                {boxes.map(box => {
                    const totalItens = box.scraps?.length || 0;
                    const valorTotal = box.scraps?.reduce((acc: number, s: any) => acc + (Number(s.totalValue) || 0), 0) || 0;

                    return (
                        <Card key={box.id} className="border-2 border-blue-500/20">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-zinc-200 dark:border-zinc-800 pb-4 gap-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Box className="text-blue-500" />
                                        <h3 className="font-bold text-lg">Caixa #{box.id}</h3>
                                        <span className="bg-slate-200 dark:bg-zinc-800 text-xs px-2 py-1 rounded font-bold">{box.type}</span>
                                    </div>
                                    <p className="text-xs text-zinc-500 mt-1">Criada em: {new Date(box.createdAt).toLocaleString()}</p>
                                </div>
                                <div className="w-full md:w-96">
                                    <QRScannerInput onScan={(qr, extracted) => handleBindQR(box.id, qr)} />
                                </div>
                            </div>

                            <div className="overflow-x-auto w-full mb-4">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs uppercase bg-zinc-100 dark:bg-zinc-900/50">
                                        <tr>
                                            <th className="px-4 py-3">Código</th>
                                            <th className="px-4 py-3">Data</th>
                                            <th className="px-4 py-3">Modelo</th>
                                            <th className="px-4 py-3">Item</th>
                                            <th className="px-4 py-3">Qtd</th>
                                            <th className="px-4 py-3 text-right">Valor ToTal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                        {box.scraps && box.scraps.length > 0 ? box.scraps.map((s: any) => (
                                            <tr key={s.id}>
                                                <td className="px-4 py-2 font-mono text-zinc-600 dark:text-zinc-400">{s.code || '-'}</td>
                                                <td className="px-4 py-2">{new Date(s.date).toLocaleDateString()}</td>
                                                <td className="px-4 py-2">{s.model}</td>
                                                <td className="px-4 py-2">{s.item}</td>
                                                <td className="px-4 py-2">{s.qty}</td>
                                                <td className="px-4 py-2 text-right font-mono text-red-500">{formatCurrency(s.totalValue)}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-6 text-center text-zinc-400">Nenhum scrap bipado para esta caixa.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex flex-col md:flex-row justify-between items-center bg-zinc-50 dark:bg-zinc-950 p-4 rounded-lg mt-4 border border-zinc-200 dark:border-zinc-800">
                                <div className="flex gap-8 mb-4 md:mb-0">
                                    <div>
                                        <span className="block text-xs uppercase font-bold text-zinc-500">Total de Itens</span>
                                        <span className="text-xl font-bold text-zinc-800 dark:text-zinc-200">{totalItens}</span>
                                    </div>
                                    <div>
                                        <span className="block text-xs uppercase font-bold text-red-500">Valor Total Refugado</span>
                                        <span className="text-xl font-bold text-red-600 dark:text-red-400">{formatCurrency(valorTotal)}</span>
                                    </div>
                                </div>
                                <div className="flex gap-2 w-full md:w-auto">
                                    <Button variant="ghost" onClick={() => { }} className="w-full md:w-auto">Continuar Depois</Button>
                                    <Button onClick={() => handleGenerateIdent(box)} className="w-full md:w-auto min-w-[200px]" disabled={totalItens === 0}>Gerar Identificação e Fechar</Button>
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};


export const ScrapBoxIdentified = ({ currentUser, onUpdate }: any) => {
    const [boxes, setBoxes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const loadBoxes = async () => {
        try {
            const data = await getBoxes();
            setBoxes(data.filter((b: any) => b.status === 'IDENTIFIED'));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadBoxes(); }, []);

    const handleAssociate = async (boxId: number) => {
        const nf = prompt("Digite o Número da Nota Fiscal (NF):");
        if (nf && nf.trim() !== '') {
            try {
                await associateBoxNF(boxId, nf);
                loadBoxes();
                if (onUpdate) onUpdate();
                alert(`NF ${nf} associada com sucesso à caixa #${boxId}`);
            } catch (e: any) {
                alert("Erro ao associar NF: " + e.message);
            }
        }
    };

    if (loading) return <div>Carregando Caixas Identificadas...</div>;

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2"><CheckCircle2 className="text-green-500" /> Caixas Aguardando NF</h2>
            {boxes.length === 0 ? (
                <Card className="text-center p-12 bg-zinc-50 dark:bg-zinc-900 border-dashed">
                    <p className="text-zinc-500">Nenhuma caixa aguardando NF no momento.</p>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {boxes.map(box => {
                        const totalItens = box.scraps?.length || 0;
                        const valorTotal = box.scraps?.reduce((acc: number, s: any) => acc + (Number(s.totalValue) || 0), 0) || 0;
                        const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

                        return (
                            <Card key={box.id} className="border-l-4 border-l-green-500 flex flex-col h-full bg-white dark:bg-zinc-950">
                                <div className="flex-1">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="font-bold text-lg">Caixa #{box.id}</h3>
                                            <span className="text-xs text-zinc-500 uppercase">{box.type}</span>
                                        </div>
                                        <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] px-2 py-1 rounded font-bold">
                                            IDENTIFICADA
                                        </div>
                                    </div>
                                    <div className="space-y-1 mb-6">
                                        <p className="text-sm font-medium">Itens na caixa: <span className="font-bold">{totalItens}</span></p>
                                        <p className="text-sm font-medium">Valor Total: <span className="font-bold text-red-500">{formatCurrency(valorTotal)}</span></p>
                                        <p className="text-xs text-zinc-400 mt-2">Fechada em: {new Date(box.closedAt).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <Button onClick={() => handleAssociate(box.id)} className="w-full mt-auto" variant="outline">
                                    <FileText size={16} className="mr-2" /> Associar N.F.
                                </Button>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    );
};
