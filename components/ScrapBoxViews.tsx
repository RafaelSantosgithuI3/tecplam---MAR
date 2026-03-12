import React, { useState, useEffect, useRef } from 'react';
import { Camera, Box, Package, Plus, Search, FileText, CheckCircle2, Trash2, X, Eye } from 'lucide-react';
import jsQR from 'jsqr';
import { Card } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { getBoxes, createBox, closeBox, associateBoxNF, linkScrapToBox, deleteBox, reopenBox } from '../services/boxService';
import { exportExecutiveReport, generateBoxLabels } from '../services/excelService';
import { apiFetch } from '../services/networkConfig';
import { ScrapDetailModal } from './ScrapModule';
import { User, ScrapData } from '../types';

export const QRScannerInput = ({ onScan }: { onScan: (qrCode: string, extractedCode: string) => void }) => {
    const [scanned, setScanned] = useState('');

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            processQR(scanned);
        }
    };

    const parseQRData = (qr: string) => {
        // Validate input
        if (!qr || typeof qr !== 'string' || qr.trim().length === 0) {
            return { material: '', quantidade: '', data: '' };
        }

        // 1. Extract first 11 characters as material code (pad with spaces if shorter)
        const materialCode = qr.substring(0, 11).padEnd(11, ' ');

        // 2. Find last occurrence of "ASSY" (case-insensitive)
        const upperQr = qr.toUpperCase();
        const assyLastIndex = upperQr.lastIndexOf('ASSY');
        if (assyLastIndex === -1) {
            return { material: materialCode.trim(), quantidade: '', data: '' };
        }

        // 3. From ASSY position, search backwards for letter "Q" (case-insensitive)
        let qIndex = -1;
        for (let i = assyLastIndex - 1; i >= 0; i--) {
            if (upperQr[i] === 'Q') {
                qIndex = i;
                break;
            }
        }

        if (qIndex === -1) {
            return { material: materialCode.trim(), quantidade: '', data: '' };
        }

        // 4. Extract quantity: characters between Q and ASSY (preserve spacing)
        const quantidade = qr.substring(qIndex + 1, assyLastIndex);

        // 5. Extract date: 4 characters before Q, format as XX/XX (validate digits)
        let data = '';
        if (qIndex >= 4) {
            const dateRaw = qr.substring(qIndex - 4, qIndex);
            if (dateRaw.length === 4 && /^\d{4}$/.test(dateRaw)) {
                data = `${dateRaw.substring(0, 2)}/${dateRaw.substring(2, 4)}`;
            }
        }

        return { material: materialCode.trim(), quantidade: quantidade.trim(), data };
    };

    const processQR = (qr: string) => {
        if (!qr) return;
        const parsed = parseQRData(qr);
        onScan(qr, parsed.material);
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

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newBoxType, setNewBoxType] = useState('REAR');

    // Modal de Pré-Impressão
    const [showLabelModal, setShowLabelModal] = useState(false);
    const [labelPara, setLabelPara] = useState('');
    const [labelStatus, setLabelStatus] = useState('SCRAP');
    const [selectedBox, setSelectedBox] = useState<any>(null);

    const handleCreateBox = async () => {
        setShowCreateModal(true);
    };

    const handleConfirmCreate = async () => {
        if (!newBoxType) return;
        await createBox(newBoxType);
        setShowCreateModal(false);
        setNewBoxType('REAR');
        loadBoxes();
    };

    const handleRemoveScrap = async (boxId: number, scrapId: any) => {
        if (!confirm('Remover este scrap da caixa? Ele ficará disponível para ser bipado novamente.')) return;
        try {
            await apiFetch(`/boxes/${boxId}/scraps/${scrapId}`, { method: 'DELETE' });
            loadBoxes();
            if (onUpdate) onUpdate();
        } catch (e: any) {
            alert(e.message || 'Erro ao remover scrap.');
        }
    };

    const handleGenerateIdent = (box: any) => {
        setSelectedBox(box);
        setShowLabelModal(true);
    };

    const confirmGenerateIdent = async () => {
        if (!selectedBox) return;
        const box = selectedBox;
        setLoading(true);

        const extra = {
            type: box.type,
            volumes: '1',
            dynamicParam: '-',
            para: labelPara,
            statusMaterial: labelStatus,
            userName: currentUser?.name || 'Sistema'
        };

        if (box.type === 'BATERIA' || box.type === 'BATERIA RMA' || box.type === 'BATERIA SCRAP') {
            extra.volumes = prompt('Quantidade de volumes da bateria:') || '1';
        }

        try {
            await generateBoxLabels(box.id, box.scraps, extra);
            await closeBox(box.id);
            alert('Placa de identificação gerada e caixa vinculada ao status IDENTIFICADA.');
            setShowLabelModal(false);
            setLabelPara('');
            setLabelStatus('SCRAP');
            setSelectedBox(null);
            loadBoxes();
            if (onUpdate) onUpdate();
        } catch (e: any) {
            alert(e.message || 'Erro ao gerar placa.');
            setLoading(false);
        }
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

            {/* MODAL CRIAR CAIXA */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowCreateModal(false); }}>
                    <Card className="w-full max-w-sm space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-zinc-800 pb-3">
                            <h3 className="font-bold text-lg">Nova Caixa</h3>
                            <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 bg-slate-100 dark:bg-zinc-800 rounded-full w-8 h-8 flex items-center justify-center"><X size={16} /></button>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Tipo da Caixa</label>
                            <select
                                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100 font-medium"
                                value={newBoxType}
                                onChange={e => setNewBoxType(e.target.value)}
                            >
                                <option value="REAR">REAR</option>
                                <option value="FRONT/OCTA">FRONT/OCTA</option>
                                <option value="BATERIA">BATERIA</option>
                                <option value="PLACA">PLACA</option>
                                <option value="MIUDEZA(S)">MIUDEZA(S)</option>
                            </select>
                            <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Somente scraps do mesmo tipo poderão ser bipados nesta caixa.</p>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <Button variant="secondary" className="flex-1" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
                            <Button className="flex-1" onClick={handleConfirmCreate}>Criar Caixa</Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* MODAL PRÉ-IMPRESSÃO (PLACA DE IDENTIFICAÇÃO) */}
            {showLabelModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowLabelModal(false); }}>
                    <Card className="w-full max-w-sm space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-zinc-800 pb-3">
                            <h3 className="font-bold text-lg">Gerar Placa de Identificação</h3>
                            <button onClick={() => setShowLabelModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 bg-slate-100 dark:bg-zinc-800 rounded-full w-8 h-8 flex items-center justify-center"><X size={16} /></button>
                        </div>
                        <div className="flex flex-col gap-4">
                            <Input
                                label="PARA (Destinatário/Setor)"
                                value={labelPara}
                                onChange={e => setLabelPara(e.target.value)}
                                placeholder="Ex: Qualidade, Descarte..."
                            />
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Status do Material</label>
                                <select
                                    className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-slate-900 dark:text-zinc-100 font-medium"
                                    value={labelStatus}
                                    onChange={e => setLabelStatus(e.target.value)}
                                >
                                    <option value="SCRAP">SCRAP</option>
                                    <option value="RMA">RMA</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-2 pt-2 mt-2">
                            <Button variant="secondary" className="flex-1" onClick={() => setShowLabelModal(false)}>Cancelar</Button>
                            <Button className="flex-1" onClick={confirmGenerateIdent}>Confirmar</Button>
                        </div>
                    </Card>
                </div>
            )}

            {boxes.length === 0 && (
                <Card className="text-center p-8 bg-zinc-50 dark:bg-zinc-900 border-dashed">
                    <p className="text-zinc-500">Nenhuma caixa OPEN encontrada. Crie uma para começar a adicionar scraps.</p>
                </Card>
            )}

            <div className="grid gap-6">
                {boxes.map(box => {
                    const totalItens = box.scraps?.reduce((acc: number, s: any) => acc + (Number(s.qty) || 0), 0) || 0;
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
                                            <th className="px-4 py-3 text-right">Valor Total</th>
                                            <th className="px-4 py-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                        {box.scraps && box.scraps.length > 0 ? box.scraps.map((s: any) => (
                                            <tr key={s.id} className="hover:bg-red-50/30 dark:hover:bg-red-900/10 transition-colors">
                                                <td className="px-4 py-2 font-mono text-zinc-600 dark:text-zinc-400">{s.code || '-'}</td>
                                                <td className="px-4 py-2">{new Date(s.date).toLocaleDateString()}</td>
                                                <td className="px-4 py-2">{s.model}</td>
                                                <td className="px-4 py-2">{s.item}</td>
                                                <td className="px-4 py-2">{s.qty}</td>
                                                <td className="px-4 py-2 text-right font-mono text-red-500">{formatCurrency(s.totalValue)}</td>
                                                <td className="px-4 py-2 text-right">
                                                    <button
                                                        onClick={() => handleRemoveScrap(box.id, s.id)}
                                                        title="Remover da caixa"
                                                        className="text-red-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-6 text-center text-zinc-400">Nenhum scrap bipado para esta caixa.</td>
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
                                    <Button variant="ghost" onClick={async () => {
                                        if (!confirm(`Excluir caixa #${box.id} permanentemente? Os scraps serão desvinculados.`)) return;
                                        try {
                                            await deleteBox(box.id);
                                            loadBoxes();
                                            if (onUpdate) onUpdate();
                                        } catch (e: any) { alert(e.message || 'Erro ao excluir caixa.'); }
                                    }} className="w-full md:w-auto text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20">Excluir Caixa</Button>
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


export const ScrapBoxIdentified = ({ currentUser, onUpdate, users = [] }: { currentUser: any, onUpdate?: () => void, users?: User[] }) => {
    const [boxes, setBoxes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [previewBox, setPreviewBox] = useState<any | null>(null);
    const [selectedScrap, setSelectedScrap] = useState<ScrapData | null>(null);
    const [qrSearchInput, setQrSearchInput] = useState('');
    const isAndroid = /Android/i.test(navigator.userAgent);
    const [showQRCamera, setShowQRCamera] = useState(false);

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

    const handleQRInput = (qrCode: string) => {
        if (qrCode.trim()) {
            const found = boxes.find(box => box.scraps?.some((s: any) => s.qrCode === qrCode));
            if (found) {
                setPreviewBox(found);
                setQrSearchInput('');
            } else {
                alert('QR Code não encontrado nesta lista');
                setQrSearchInput('');
            }
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

    const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

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

                        return (
                            <Card key={box.id} className="border-l-4 border-l-green-500 flex flex-col h-full bg-white dark:bg-zinc-950">
                                <div className="flex-1">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Caixa #{box.id}</h3>
                                            <span className="text-xs text-zinc-500 uppercase">{box.type}</span>
                                        </div>
                                        <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] px-2 py-1 rounded font-bold">
                                            IDENTIFICADA
                                        </div>
                                    </div>
                                    <div className="space-y-1 mb-6">
                                        <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                                            Itens na caixa: <span className="font-bold">{totalItens}</span>
                                        </p>
                                        <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                                            Valor Total: <span className="font-bold text-red-500">{formatCurrency(valorTotal)}</span>
                                        </p>
                                        <p className="text-xs text-zinc-400 mt-2">Fechada em: {new Date(box.closedAt).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Button onClick={() => setPreviewBox(box)} variant="ghost" className="w-full text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                                        <Eye size={16} className="mr-2" /> Ver Itens da Caixa
                                    </Button>
                                    <Button onClick={() => handleAssociate(box.id)} className="w-full mt-auto" variant="outline">
                                        <FileText size={16} className="mr-2" /> Associar N.F.
                                    </Button>
                                    <Button onClick={async () => {
                                        if (!confirm(`Voltar caixa #${box.id} para edição? A placa será invalidada.`)) return;
                                        try {
                                            await reopenBox(box.id);
                                            loadBoxes();
                                            if (onUpdate) onUpdate();
                                        } catch (e: any) { alert(e.message || 'Erro ao reabrir caixa.'); }
                                    }} className="w-full" variant="ghost">
                                        Voltar para Edição
                                    </Button>
                                </div>
                            </Card>
                        )
                    })}
                </div>
            )}

            {/* Box items preview modal */}
            {previewBox && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPreviewBox(null)}>
                    <Card className="max-w-2xl w-full max-h-[80vh] overflow-y-auto bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="font-bold text-lg text-slate-900 dark:text-white">Caixa #{previewBox.id} — {previewBox.type}</h3>
                                <p className="text-xs text-slate-500 dark:text-zinc-500">{previewBox.scraps?.length || 0} itens • {formatCurrency(previewBox.scraps?.reduce((a: number, s: any) => a + (Number(s.totalValue) || 0), 0) || 0)}</p>
                            </div>
                            <button onClick={() => setPreviewBox(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 bg-slate-100 dark:bg-zinc-800 rounded-full w-8 h-8 flex items-center justify-center">
                                <X size={16} />
                            </button>
                        </div>
                        {previewBox.scraps && previewBox.scraps.length > 0 ? (
                            <div className="w-full overflow-x-auto border border-slate-200 dark:border-zinc-800 rounded-xl">
                                <table className="w-full text-xs text-left min-w-[500px]">
                                    <thead className="bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400">
                                        <tr>
                                            <th className="p-2.5">Item</th>
                                            <th className="p-2.5">Modelo</th>
                                            <th className="p-2.5">Código</th>
                                            <th className="p-2.5 text-right">Valor</th>
                                            <th className="p-2.5"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewBox.scraps.map((s: any) => (
                                            <tr
                                                key={s.id}
                                                className="border-b border-slate-100 dark:border-zinc-800 last:border-0 hover:bg-blue-50/60 dark:hover:bg-blue-900/10 cursor-pointer transition-colors"
                                                onClick={() => { setPreviewBox(null); setSelectedScrap(s as ScrapData); }}
                                            >
                                                <td className="p-2.5 text-slate-700 dark:text-zinc-300 font-medium">{s.item}</td>
                                                <td className="p-2.5 text-slate-600 dark:text-zinc-400">{s.model}</td>
                                                <td className="p-2.5 font-mono text-slate-500 dark:text-zinc-500">{s.code || '-'}</td>
                                                <td className="p-2.5 text-right font-mono text-slate-700 dark:text-zinc-300">{formatCurrency(Number(s.totalValue) || 0)}</td>
                                                <td className="p-2.5"><Eye size={14} className="text-blue-500" /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-center text-slate-400 py-8">Nenhum item nesta caixa.</p>
                        )}
                    </Card>
                </div>
            )}

            {/* Scrap Detail Modal */}
            <ScrapDetailModal
                isOpen={!!selectedScrap}
                scrap={selectedScrap}
                users={users}
                onClose={() => setSelectedScrap(null)}
            />
        </div>
    );
};
