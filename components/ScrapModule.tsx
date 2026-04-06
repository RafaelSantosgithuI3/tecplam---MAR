import React, { useState, useEffect, useMemo, useRef, useTransition, useCallback } from 'react';
import { List, RowComponentProps } from 'react-window';
// Vou restaurar a linha de importação completa:
import {
    LayoutDashboard, AlertTriangle, FileText, CheckCircle2,
    ArrowLeft, Save, Search, Filter, Download, Plus, X,
    History, BarChart3, Settings, Upload, Trash2, Shield, Eye, Edit3, Box, QrCode, Truck
} from 'lucide-react';
import { ScrapBoxMount, ScrapBoxIdentified, QRScannerInput } from './ScrapBoxViews';
import { Card } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { QRStreamReader } from './QRStreamReader';
import { User, ScrapData, Material } from '../types';
import {
    getModels, getLines, getStations,
    getManausDate, getWeekNumber, subscribeToSyncStream
} from '../services/storageService';
import {
    getScraps, saveScrap, updateScrap, deleteScrap, getMaterials, saveMaterials,
    SCRAP_ITEMS, SCRAP_STATUS, CAUSA_RAIZ_OPTIONS, saveBatchScraps, checkDuplicateScrap
} from '../services/scrapService';
import * as authService from '../services/authService';
import { exportScrapToExcel, exportExecutiveReport } from '../services/excelService';

const formatCurrency = (val: number | undefined) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
};

const safeRound = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

const formatDateDisplay = (dateString: string | Date | undefined): string => {
    if (!dateString) return '-';
    let ds = typeof dateString === 'string' ? dateString : dateString.toISOString();
    const datePart = ds.split('T')[0];
    const parts = datePart.split('-');
    if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
    }
    return ds;
};

const isLeadershipRole = (role: unknown): boolean => {
    const roleUp = String(role || '').toUpperCase();
    return roleUp.includes('LÍDER')
        || roleUp.includes('LIDER')
        || roleUp.includes('COORDENADOR')
        || roleUp.includes('SUPERVISOR')
        || roleUp.includes('TECNICO DE PROCESSO');
};

const sortUsersByDisplayName = (items: User[] = []): User[] => {
    return [...(Array.isArray(items) ? items : [])].sort((a, b) =>
        String((a as any)?.fullName || a?.name || '').localeCompare(String((b as any)?.fullName || b?.name || ''))
    );
};

export const getSafeDateFallback = (dateStr?: string | null): string => {
    if (!dateStr) return getManausDate().toISOString().split('T')[0];
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime()) || parsed.getFullYear() < 2000) {
        return getManausDate().toISOString().split('T')[0];
    }
    return dateStr;
};

const CRITICAL_ITEMS = ['REAR', 'FRONT', 'OCTA', 'BATERIA SCRAP', 'BATERIA RMA', 'PLACA'];
const isCriticalItem = (item?: string) => {
    if (!item) return false;
    return CRITICAL_ITEMS.includes(item.toUpperCase().trim());
};

const normalizeScrapNumber = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const normalized = Number(value.replace(',', '.').trim());
        return Number.isFinite(normalized) ? normalized : 0;
    }
    return 0;
};

const normalizeScrapDateKey = (value: unknown): string => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
        if (match) return match[1];
        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) {
            const year = parsed.getFullYear();
            const month = String(parsed.getMonth() + 1).padStart(2, '0');
            const day = String(parsed.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    return '';
};

const parseScrapDate = (value: unknown): Date | null => {
    const dateKey = normalizeScrapDateKey(value);
    if (!dateKey) return null;
    const [year, month, day] = dateKey.split('-').map(Number);
    const parsed = new Date(year, (month || 1) - 1, day || 1);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeScrapCollection = (scraps: ScrapData[] = []): ScrapData[] => {
    if (!Array.isArray(scraps)) return [];

    return scraps.map((scrap) => ({
        ...scrap,
        date: normalizeScrapDateKey(scrap?.date),
        week: normalizeScrapNumber(scrap?.week),
        shift: String(scrap?.shift ?? '').trim(),
        qty: normalizeScrapNumber(scrap?.qty),
        unitValue: normalizeScrapNumber(scrap?.unitValue),
        totalValue: normalizeScrapNumber(scrap?.totalValue),
        line: String(scrap?.line ?? ''),
        model: String(scrap?.model ?? ''),
        leaderName: String(scrap?.leaderName ?? ''),
        item: String(scrap?.item ?? ''),
    }));
};

const sortScrapCollection = (scraps: ScrapData[] = []): ScrapData[] => {
    return [...scraps].sort((a, b) => {
        const left = parseScrapDate(b?.date)?.getTime() || 0;
        const right = parseScrapDate(a?.date)?.getTime() || 0;
        if (left !== right) return left - right;
        return normalizeScrapNumber(b?.id) - normalizeScrapNumber(a?.id);
    });
};

const resolveScrapIdentity = (scrap: Partial<ScrapData> | null | undefined): string => {
    if (scrap?.id !== undefined && scrap?.id !== null && String(scrap.id).trim()) {
        return String(scrap.id);
    }
    if (scrap?.qrCode) return `qr:${scrap.qrCode}`;
    return [
        normalizeScrapDateKey(scrap?.date),
        String(scrap?.leaderName ?? ''),
        String(scrap?.model ?? ''),
        String(scrap?.item ?? ''),
        String(scrap?.code ?? '')
    ].join('|');
};

const applyScrapSyncDelta = (current: ScrapData[], action?: string, items: ScrapData[] = [], ids: string[] = []) => {
    const normalizedCurrent = normalizeScrapCollection(current);
    const normalizedItems = normalizeScrapCollection(items);

    if (action === 'replace') {
        return sortScrapCollection(normalizedItems);
    }

    if (action === 'remove') {
        const removeIds = new Set((ids || []).map(String));
        return sortScrapCollection(
            normalizedCurrent.filter((scrap) => !removeIds.has(String(scrap.id)) && !removeIds.has(resolveScrapIdentity(scrap)))
        );
    }

    const byId = new Map<string, ScrapData>();
    normalizedCurrent.forEach((scrap) => {
        byId.set(resolveScrapIdentity(scrap), scrap);
    });
    normalizedItems.forEach((scrap) => {
        byId.set(resolveScrapIdentity(scrap), scrap);
    });

    return sortScrapCollection(Array.from(byId.values()));
};

const LoadingSpinner = ({ label = 'Carregando dados...' }: { label?: string }) => (
    <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 px-4 py-3 text-sm text-slate-600 dark:text-zinc-300 shadow-sm">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span>{label}</span>
        </div>
    </div>
);

interface ScrapModuleProps {
    currentUser: User;
    onBack: () => void;
    initialTab?: Tab;
    hasTabAccess?: (moduleName: string, tabKey: string) => boolean;
}

type Tab = 'FORM' | 'PENDING' | 'HISTORY' | 'OPERATIONAL' | 'MANAGEMENT_ADVANCED' | 'EDIT_DELETE' | 'BOX_MOUNT' | 'BOX_IDENTIFIED' | 'NEW_ADVANCED' | 'CONSULTA';

export const ScrapModule: React.FC<ScrapModuleProps> = ({ currentUser, onBack, initialTab, hasTabAccess }) => {
    const allTabs: Tab[] = ['FORM', 'PENDING', 'HISTORY', 'OPERATIONAL', 'EDIT_DELETE', 'MANAGEMENT_ADVANCED', 'NEW_ADVANCED', 'CONSULTA'];
    const SCRAP_ACTIVE_TAB_KEY = 'activeTab_ScrapModule';

    const determineInitialTab = (): Tab => {
        const saved = sessionStorage.getItem(SCRAP_ACTIVE_TAB_KEY) as Tab | null;
        if (saved && allTabs.includes(saved) && (!hasTabAccess || hasTabAccess('SCRAP', saved))) {
            return saved;
        }
        if (initialTab && (!hasTabAccess || hasTabAccess('SCRAP', initialTab))) return initialTab;
        if (!hasTabAccess) return 'FORM';
        const allowed = allTabs.find(t => hasTabAccess('SCRAP', t));
        return allowed || 'FORM';
    };

    const [activeTab, setActiveTab] = useState<Tab>(determineInitialTab());
    const [scraps, setScraps] = useState<ScrapData[]>([]);

    // Config Data
    const [users, setUsers] = useState<User[]>([]);
    const [models, setModels] = useState<string[]>([]);
    const [stations, setStations] = useState<string[]>([]);
    const [lines, setLines] = useState<string[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isHydrating, startTransition] = useTransition();

    useEffect(() => {
        if (initialTab) setActiveTab(initialTab);
    }, [initialTab]);

    // Load Initial Data
    const loadData = async () => {
        setIsLoading(true);
        try {
            const [u, m, s, l, scrapData, mats] = await Promise.all([
                authService.getAllUsers(),
                getModels(),
                getStations(),
                getLines(),
                getScraps(),
                getMaterials()
            ]);

            startTransition(() => {
                setUsers(Array.isArray(u) ? u : []);
                setModels(Array.isArray(m) ? m : []);
                setStations(Array.isArray(s) ? s : []);
                setLines(Array.isArray(l) ? l.map(x => x.name) : []);
                setScraps(sortScrapCollection(normalizeScrapCollection(Array.isArray(scrapData) ? scrapData : [])));
                setMaterials(Array.isArray(mats) ? mats : []);
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeToSyncStream((event: any) => {
            if (event?.collection !== 'scraps') return;

            const sanitizedItems = Array.isArray(event?.items)
                ? event.items
                : event?.items && typeof event.items === 'object'
                    ? Object.values(event.items)
                    : [];

            startTransition(() => {
                setScraps((current) => applyScrapSyncDelta(current, event.action, sanitizedItems as ScrapData[], event.ids || []));
            });
        });

        return () => {
            unsubscribe?.();
        };
    }, []);

    useEffect(() => {
        sessionStorage.setItem(SCRAP_ACTIVE_TAB_KEY, activeTab);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [activeTab]);

    const refreshScraps = async () => {
        const s = await getScraps();
        startTransition(() => {
            setScraps(sortScrapCollection(normalizeScrapCollection(Array.isArray(s) ? s : [])));
        });
    }

    const isLeader = isLeadershipRole(currentUser.role);
    const isAdmin = currentUser.isAdmin || currentUser.role.toLowerCase().includes('admin') || currentUser.role.toLowerCase().includes('gerente');

    const canEditDelete = useMemo(() => {
        if (!currentUser) return false;

        const role = (currentUser.role || '').toLowerCase().trim();

        // Palavras-chave que liberam o acesso
        const allowedKeywords = [
            'admin',
            'ti',
            'supervisor',
            'diretor',
            'iqc inspetor'
        ];

        return currentUser.isAdmin || allowedKeywords.some(keyword => role.includes(keyword));
    }, [currentUser]);

    const shouldBlockContent = (isLoading || isHydrating) && scraps.length === 0;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 p-4 md:p-8 space-y-6 transition-colors duration-200">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <Button variant="ghost" onClick={onBack} className="rounded-full w-10 h-10 p-0 flex items-center justify-center">
                        <ArrowLeft size={20} />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-red-600 to-orange-500 dark:from-red-500 dark:to-orange-500 bg-clip-text text-transparent">
                            Gestão de Scrap
                        </h1>
                        <p className="text-gray-500 dark:text-zinc-400 text-sm">Controle de perdas e refugos</p>
                    </div>
                </div>

                <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 custom-scrollbar">
                    {(!hasTabAccess || hasTabAccess('SCRAP', 'FORM')) && (
                        <Button variant={activeTab === 'FORM' ? 'primary' : 'ghost'} onClick={() => setActiveTab('FORM')} size="sm">
                            <Plus size={16} /> Lançar
                        </Button>
                    )}

                    {/* Aba Pendências: Restrita */}
                    {(!hasTabAccess || hasTabAccess('SCRAP', 'PENDING')) && (isAdmin || ['líder', 'coordenador', 'supervisor', 'ti', 'admin'].some(r => currentUser.role.toLowerCase().includes(r))) && (
                        <Button variant={activeTab === 'PENDING' ? 'primary' : 'ghost'} onClick={() => setActiveTab('PENDING')} size="sm">
                            <AlertTriangle size={16} /> Pendências
                        </Button>
                    )}

                    {(!hasTabAccess || hasTabAccess('SCRAP', 'HISTORY')) && (
                        <Button variant={activeTab === 'HISTORY' ? 'primary' : 'ghost'} onClick={() => setActiveTab('HISTORY')} size="sm">
                            <History size={16} /> Histórico (Pessoal)
                        </Button>
                    )}

                    {(!hasTabAccess || hasTabAccess('SCRAP', 'MONITORAMENTO')) && (
                        <Button variant={activeTab === 'OPERATIONAL' ? 'primary' : 'ghost'} onClick={() => setActiveTab('OPERATIONAL')} size="sm">
                            <BarChart3 size={16} /> Monitoramento
                        </Button>
                    )}

                    {(!hasTabAccess || hasTabAccess('SCRAP', 'EDIT_DELETE')) && canEditDelete && (
                        <Button variant={activeTab === 'EDIT_DELETE' ? 'primary' : 'ghost'} onClick={() => setActiveTab('EDIT_DELETE')} size="sm">
                            <Settings size={16} /> Edição/Exclusão
                        </Button>
                    )}

                    {/* Aba Rank Geral (Antiga Gestão Avançada) */}
                    {(!hasTabAccess || hasTabAccess('SCRAP', 'MANAGEMENT_ADVANCED')) && (
                        <Button variant={activeTab === 'MANAGEMENT_ADVANCED' ? 'primary' : 'ghost'} onClick={() => setActiveTab('MANAGEMENT_ADVANCED')} size="sm">
                            <Shield size={16} /> Rank Geral
                        </Button>
                    )}

                    {/* Nova Aba Gestão Avançada (Copiada do Controle de Scrap) */}
                    {(!hasTabAccess || hasTabAccess('SCRAP', 'NEW_ADVANCED')) && (
                        <Button variant={activeTab === 'NEW_ADVANCED' ? 'primary' : 'ghost'} onClick={() => setActiveTab('NEW_ADVANCED')} size="sm">
                            <LayoutDashboard size={16} /> Gestão Avançada
                        </Button>
                    )}

                    {(!hasTabAccess || hasTabAccess('SCRAP', 'CONSULTA')) && (
                        <Button variant={activeTab === 'CONSULTA' ? 'primary' : 'ghost'} onClick={() => setActiveTab('CONSULTA')} size="sm">
                            <Search size={16} /> Consulta
                        </Button>
                    )}
                </div>
            </div>

            {/* CONTENT */}
            <div className="mt-6">
                {shouldBlockContent ? (
                    <LoadingSpinner label="Carregando Scraps..." />
                ) : (
                    <>
                        {activeTab === 'FORM' && (
                            <ScrapForm
                                users={users}
                                models={models}
                                stations={stations}
                                lines={lines}
                                materials={materials}
                                onSuccess={refreshScraps}
                                currentUser={currentUser}
                            />
                        )}
                        {activeTab === 'PENDING' && (
                            <ScrapPending
                                scraps={scraps}
                                currentUser={currentUser}
                                onUpdate={refreshScraps}
                                users={users}
                                lines={lines}
                                models={models}
                                categories={SCRAP_ITEMS}
                                statusOptions={SCRAP_STATUS}
                                rootCauseOptions={CAUSA_RAIZ_OPTIONS}
                                materials={materials}
                                stations={stations}
                            />
                        )}
                        {activeTab === 'HISTORY' && (
                            <ScrapHistory scraps={scraps} currentUser={currentUser} users={users} />
                        )}
                        {activeTab === 'OPERATIONAL' && (
                            <ScrapOperational
                                scraps={scraps}
                                users={users}
                                lines={lines}
                                models={models}
                                isLoading={isLoading}
                                isHydrating={isHydrating}
                            />
                        )}
                        {activeTab === 'EDIT_DELETE' && (
                            <ScrapEditDelete
                                scraps={scraps}
                                users={users}
                                lines={lines}
                                models={models}
                                onUpdate={refreshScraps}
                                categories={SCRAP_ITEMS}
                                statusOptions={SCRAP_STATUS}
                                rootCauseOptions={CAUSA_RAIZ_OPTIONS}
                                materials={materials}
                                stations={stations}
                                currentUser={currentUser}
                            />
                        )}
                        {activeTab === 'MANAGEMENT_ADVANCED' && (
                            <ScrapManagementAdvanced scraps={scraps} users={users} isLoading={isLoading} isHydrating={isHydrating} />
                        )}
                        {activeTab === 'NEW_ADVANCED' && (
                            <NewAdvancedDashboard scraps={scraps} users={users} isLoading={isLoading} isHydrating={isHydrating} />
                        )}
                        {activeTab === 'CONSULTA' && (
                            <ScrapConsulta scraps={scraps} users={users} />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

// --- SUB COMPONENTS ---

const ScrapForm = ({ users, models, stations, lines, materials, onSuccess, currentUser }: any) => {
    const ORIGIN_OPTIONS = [...lines];

    const getInitialDate = () => {
        const now = getManausDate();
        if (now.getHours() < 4) {
            now.setDate(now.getDate() - 1);
        }
        return now.toISOString().split('T')[0];
    };

    const getInitialState = () => ({
        date: getInitialDate(),
        week: getWeekNumber(getManausDate()),
        shift: '1',
        qty: 1,
        status: '',
        item: '',
        rootCause: '',
        leaderName: '',
        unitValue: 0,
        totalValue: 0,
        line: '',
        pqc: '',
        usedModel: '',
        code: '',
        description: '',
        responsible: '',
        reason: '',
        station: '',
        qrCode: '',
        immediateAction: ''
    });

    const [formData, setFormData] = useState<Partial<ScrapData>>(getInitialState());

    const isAndroid = /Android/i.test(navigator.userAgent);
    const [showQRReader, setShowQRReader] = useState(false);

    // Multi-scan state
    const [multiScanMode, setMultiScanMode] = useState(false);
    const [multiQRs, setMultiQRs] = useState<string[]>([]);
    const [showMultiScanPrompt, setShowMultiScanPrompt] = useState(false);
    const [pendingQR, setPendingQR] = useState<string>('');
    const [isDuplicateAlertVisible, setIsDuplicateAlertVisible] = useState(false);
    const [duplicateMessage, setDuplicateMessage] = useState('');

    // QR Code optional if origin contains LOGÍSTICA or RETRABALHO
    const originUpper = (formData.line || '').toUpperCase();
    const isQRRequired = !originUpper.includes('LOGÍSTICA') && !originUpper.includes('RETRABALHO');

    const convertQRDateToInputFormat = (qrDateStr: string) => {
        if (!qrDateStr || qrDateStr.length < 5) return '';
        const [day, month] = qrDateStr.split('/');
        const year = new Date().getFullYear();
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
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

    const handleQRScanSuccess = async (text: string) => {
        setShowQRReader(false);

        if (multiScanMode) {
            // In multi-scan mode, add to list
            if (text && !multiQRs.includes(text)) {
                // Validate duplicates in batch
                const parsed = parseQRData(text);
                const { isDuplicate } = await checkDuplicateScrap(text, formData.code, formData.qty, formData.date);
                if (isDuplicate) {
                    setDuplicateMessage(`QR Code ${text} já está registrado no sistema.`);
                    setIsDuplicateAlertVisible(true);
                    return;
                }
                setMultiQRs(prev => [...prev, text]);
            } else if (multiQRs.includes(text)) {
                setDuplicateMessage('Este QR Code já foi lido neste lote.');
                setIsDuplicateAlertVisible(true);
            }
            // Also auto-fill code/material from first scan if list is empty
            if (multiQRs.length === 0 && text) {
                const parsed = parseQRData(text);
                handleCodeChange(parsed.material);
            }
            return;
        }

        // Single-scan: validate duplicate first
        const parsed = parseQRData(text);
        const { isDuplicate } = await checkDuplicateScrap(text, formData.code, formData.qty, formData.date);
        if (isDuplicate) {
            setDuplicateMessage(`QR Code ${text} já está registrado no sistema com material, quantidade ou data correspondente.`);
            setIsDuplicateAlertVisible(true);
            return;
        }

        let extractedQty: number | undefined = undefined;
        let extractedDate = '';

        if (parsed.quantidade) {
            const parsedQty = parseInt(parsed.quantidade, 10);
            if (!isNaN(parsedQty)) {
                extractedQty = parsedQty;
            }
        }

        if (parsed.data) {
            extractedDate = convertQRDateToInputFormat(parsed.data);
            extractedDate = getSafeDateFallback(extractedDate);
        }

        setFormData((prev: any) => ({
            ...prev,
            qrCode: text,
            ...(extractedDate ? { date: extractedDate } : {}),
            ...(extractedQty !== undefined ? { qty: extractedQty } : {})
        }));

        if (text) {
            handleCodeChange(parsed.material);
        }

        // Trigger multi-scan prompt
        setPendingQR(text);
        setShowMultiScanPrompt(true);
    };

    const handleMultiScanConfirm = (accept: boolean) => {
        setShowMultiScanPrompt(false);
        if (accept) {
            setMultiScanMode(true);
            setMultiQRs([pendingQR]);
            setFormData(prev => ({ ...prev, qrCode: '' }));
        }
        setPendingQR('');
    };

    const handleRemoveQR = (qr: string) => {
        setMultiQRs(prev => prev.filter(q => q !== qr));
    };

    const handleFinishMultiScan = () => {
        // Keep multi-scan mode active, user will submit the form
    };

    // Derived Form Values
    useEffect(() => {
        if (multiScanMode) {
            setFormData(prev => ({ ...prev, qty: multiQRs.length }));
        }
    }, [multiQRs, multiScanMode]);

    useEffect(() => {
        if (formData.date) {
            const d = new Date(formData.date);
            const utcDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
            setFormData(prev => ({ ...prev, week: getWeekNumber(utcDate) }));
        }
    }, [formData.date]);

    useEffect(() => {
        const total = (formData.qty || 0) * (formData.unitValue || 0);
        const totalRounded = safeRound(total);
        setFormData(prev => ({ ...prev, totalValue: totalRounded }));
    }, [formData.qty, formData.unitValue]);

    const handleLeaderChange = (leaderName: string) => {
        const found = users.find((u: User) => u.name === leaderName);
        setFormData(prev => ({
            ...prev,
            leaderName,
            shift: found?.shift || '1' // Auto-fill shift
        }));
    };

    const handleCodeChange = (code: string) => {
        const found = materials.find((m: Material) => m.code === code);
        setFormData(prev => ({
            ...prev,
            code,
            description: found ? found.description : '',
            unitValue: found ? found.price : 0,
            usedModel: found ? found.model : prev.usedModel
        }));
    };

    const handleSubmit = async () => {
        if (!formData.leaderName || !formData.model || !formData.item || !formData.line) {
            alert("Preencha todos os campos obrigatórios (Líder, Origem, Modelo, Item)!");
            return;
        }

        // QR required validation based on origin
        if (isQRRequired && !multiScanMode && !formData.qrCode) {
            alert("QR Code obrigatório para esta origem!");
            return;
        }

        if (multiScanMode && multiQRs.length === 0) {
            alert("Nenhum QR Code foi lido no modo multi-scan!");
            return;
        }

        const safeDate = getSafeDateFallback(formData.date);
        
        const now = getManausDate();
        const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        if (multiScanMode && multiQRs.length > 0) {
            // Batch create: one record per QR
            const batchPayloads: ScrapData[] = multiQRs.map(qr => ({
                ...formData as ScrapData,
                date: safeDate,
                userId: currentUser.matricula,
                time: time,
                status: formData.status!,
                item: formData.item!,
                rootCause: formData.rootCause!,
                station: formData.station || 'ND',
                responsible: formData.responsible || currentUser.name,
                qrCode: qr
            }));

            try {
                await saveBatchScraps(batchPayloads);
                alert(`${multiQRs.length} scraps lançados com sucesso (lote)!`);
                setFormData(getInitialState());
                setMultiScanMode(false);
                setMultiQRs([]);
                onSuccess();
            } catch (e: any) {
                const errorMsg = e?.message || e?.error || "Erro ao salvar lote de scraps.";
                alert(errorMsg);
            }
        } else {
            // Single create
            const payload: ScrapData = {
                ...formData as ScrapData,
                date: safeDate,
                userId: currentUser.matricula,
                time: time,
                status: formData.status!,
                item: formData.item!,
                rootCause: formData.rootCause!,
                station: formData.station || 'ND',
                responsible: formData.responsible || currentUser.name
            };

            try {
                await saveScrap(payload);
                alert("Scrap lançado com sucesso!");
                setFormData(getInitialState());
                onSuccess();
            } catch (e: any) {
                const errorMsg = e?.message || e?.error || "Erro ao salvar scrap.";
                alert(errorMsg);
            }
        }
    };

    const normalizeStr = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const pqcUsers = users.filter((u: User) => u.status !== 'INATIVO' && normalizeStr(u.role).includes('pqc'));
    const leaderUsers = sortUsersByDisplayName(
        users.filter((u: User) => u.status !== 'INATIVO' && isLeadershipRole(u.role))
    );

    return (
        <Card className="max-w-6xl mx-auto bg-white/50 dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800 shadow-sm">
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Input type="date" label="Data" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} onBlur={e => setFormData({ ...formData, date: getSafeDateFallback(e.target.value) })} />
                    <Input label="Semana" value={formData.week} readOnly className="opacity-50" />
                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5 uppercase">Líder</label>
                        <select
                            className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-gray-900 dark:text-zinc-100 transition-colors"
                            value={formData.leaderName || ''}
                            onChange={e => handleLeaderChange(e.target.value)}
                        >
                            <option value="" disabled>Selecione...</option>
                            {leaderUsers.map((u: User) => (
                                <option key={u.matricula} value={u.name}>{u.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Origem do Scrap</label>
                        <select
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100"
                            value={formData.line || ''}
                            onChange={e => setFormData({ ...formData, line: e.target.value })}
                        >
                            <option value="" disabled>Selecione...</option>
                            {ORIGIN_OPTIONS.map((l: string) => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">PQC</label>
                        <select
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100"
                            value={formData.pqc || ''}
                            onChange={e => setFormData({ ...formData, pqc: e.target.value })}
                        >
                            <option value="" disabled>Selecione...</option>
                            {pqcUsers.map((u: User) => <option key={u.matricula} value={u.name}>{u.name}</option>)}
                        </select>
                    </div>
                    <Input label="Turno" value={formData.shift} onChange={e => setFormData({ ...formData, shift: e.target.value })} disabled={!!formData.leaderName} className={!!formData.leaderName ? "opacity-50" : ""} />
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Modelo</label>
                        <select
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100"
                            value={formData.model || ''}
                            onChange={e => setFormData({ ...formData, model: e.target.value })}
                        >
                            <option value="" disabled>Selecione...</option>
                            {models.map((m: string) => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                </div>

                <hr className="border-slate-200 dark:border-zinc-800" />

                {/* QR Code Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs uppercase mb-1.5 font-bold text-blue-600 dark:text-blue-400">
                            Leia o QR da Etiqueta do desmonte {isQRRequired ? '*' : '(Opcional)'}
                        </label>
                        {!multiScanMode ? (
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    className="w-full bg-blue-50/50 dark:bg-blue-900/10 border-2 border-blue-400/50 dark:border-blue-500/50 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-900 dark:text-zinc-100 transition-all placeholder-blue-300 dark:placeholder-blue-700"
                                    value={formData.qrCode || ''}
                                    onChange={(e) => setFormData((prev: any) => ({ ...prev, qrCode: e.target.value }))}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const qr = formData.qrCode || '';
                                            if (qr) {
                                                handleQRScanSuccess(qr);
                                            }
                                        }
                                    }}
                                    placeholder="Bipe o código..."
                                    required={isQRRequired}
                                />
                                {isAndroid && (
                                    <button type="button" onClick={() => setShowQRReader(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg flex items-center justify-center transition-colors shadow flex-shrink-0" title="Ler com a câmera">
                                        <QrCode size={20} />
                                    </button>
                                )}
                            </div>
                        ) : (
                            /* Multi-scan mode UI */
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        className="w-full bg-green-50/50 dark:bg-green-900/10 border-2 border-green-400/50 dark:border-green-500/50 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500 font-mono text-slate-900 dark:text-zinc-100 transition-all placeholder-green-400 dark:placeholder-green-700"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                const val = (e.target as HTMLInputElement).value;
                                                if (val) {
                                                    handleQRScanSuccess(val);
                                                    (e.target as HTMLInputElement).value = '';
                                                }
                                            }
                                        }}
                                        placeholder="Continue bipando QR Codes..."
                                        aria-label="Scanner multi-scan"
                                        autoFocus
                                    />
                                    {isAndroid && (
                                        <button type="button" onClick={() => setShowQRReader(true)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg flex items-center justify-center transition-colors shadow flex-shrink-0" title="Ler com a câmera">
                                            <QrCode size={20} />
                                        </button>
                                    )}
                                </div>
                                <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50 rounded-lg p-3 max-h-48 overflow-y-auto">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs font-bold text-green-700 dark:text-green-400 uppercase">QR Codes lidos</p>
                                        <span className="bg-green-600 text-white text-sm font-bold px-3 py-0.5 rounded-full">{multiQRs.length}</span>
                                    </div>
                                    {multiQRs.map((qr, idx) => (
                                        <div key={idx} className="flex items-center justify-between py-1 border-b border-green-100 dark:border-green-900/30 last:border-0">
                                            <span className="font-mono text-xs text-slate-700 dark:text-zinc-300 truncate max-w-[80%]">{qr}</span>
                                            <button type="button" onClick={() => handleRemoveQR(qr)} className="text-red-400 hover:text-red-600 p-1" title="Remover">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => { setMultiScanMode(false); setMultiQRs([]); }} className="text-red-500">
                                        <X size={14} /> Cancelar Lote
                                    </Button>
                                    <Button size="sm" onClick={handleFinishMultiScan} className="bg-green-600 hover:bg-green-700 text-white">
                                        <CheckCircle2 size={14} /> Finalizar Leitura ({multiQRs.length})
                                    </Button>
                                </div>
                            </div>
                        )}
                        {showQRReader && (
                            <QRStreamReader onScanSuccess={handleQRScanSuccess} onClose={() => setShowQRReader(false)} />
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase">Cód. Matéria Prima</label>
                        <div className="relative">
                            <input
                                list="material-codes"
                                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-gray-900 dark:text-zinc-100 transition-colors"
                                value={formData.code || ''}
                                onChange={e => handleCodeChange(e.target.value)}
                                placeholder="Digite o código..."
                            />
                            <datalist id="material-codes">
                                {materials.map((m: Material) => <option key={m.code} value={m.code}>{m.description}</option>)}
                            </datalist>
                        </div>
                    </div>
                    <div className="md:col-span-2 lg:col-span-2">
                        <Input label="Descrição do Material" value={formData.description} readOnly className="opacity-50" />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Input label="Modelo Usado" value={formData.usedModel} readOnly className="opacity-50" placeholder="Automático pelo Código" />
                    <Input label="Valor UN" value={formatCurrency(formData.unitValue)} readOnly className="opacity-50" />
                    <Input type="number" label="Quantidade" value={formData.qty} onChange={e => setFormData({ ...formData, qty: Number(e.target.value) })} />
                    <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl border border-red-200 dark:border-red-900/30 flex flex-col justify-center">
                        <label className="text-xs font-bold text-red-600 dark:text-red-400 uppercase">Valor Total</label>
                        <span className="text-2xl font-bold text-red-600 dark:text-red-500">{formatCurrency(formData.totalValue)}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Causa Raiz</label>
                        <input
                            list="causa-raiz-list"
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100"
                            value={formData.rootCause || ''}
                            onChange={e => setFormData({ ...formData, rootCause: e.target.value })}
                            placeholder="Selecione..."
                        />
                        <datalist id="causa-raiz-list">
                            {CAUSA_RAIZ_OPTIONS.map(opt => <option key={opt} value={opt} />)}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Item (Categoria)</label>
                        <input
                            list="items-list"
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100"
                            value={formData.item || ''}
                            onChange={e => setFormData({ ...formData, item: e.target.value })}
                            placeholder="Selecione..."
                        />
                        <datalist id="items-list">
                            {SCRAP_ITEMS.map(i => <option key={i} value={i} />)}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Status</label>
                        <input
                            list="status-list"
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100"
                            value={formData.status || ''}
                            onChange={e => setFormData({ ...formData, status: e.target.value })}
                            placeholder="Selecione..."
                        />
                        <datalist id="status-list">
                            {SCRAP_STATUS.map(i => <option key={i} value={i} />)}
                        </datalist>
                    </div>
                    <Input label="Responsável" value={formData.responsible} onChange={e => setFormData({ ...formData, responsible: e.target.value })} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Estação</label>
                        <input
                            list="station-list"
                            className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100"
                            value={formData.station || ''}
                            onChange={e => setFormData({ ...formData, station: e.target.value })}
                            placeholder="Selecione..."
                        />
                        <datalist id="station-list">
                            {stations.map((st: string) => <option key={st} value={st} />)}
                        </datalist>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5 uppercase">Motivo Detalhado</label>
                        <textarea
                            className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-600 min-h-[80px] text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 transition-colors"
                            value={formData.reason || ''}
                            onChange={e => setFormData({ ...formData, reason: e.target.value })}
                            placeholder="Descreva..."
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5 uppercase">Ação Imediata</label>
                        <textarea
                            className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-600 min-h-[80px] text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 transition-colors"
                            value={formData.immediateAction || ''}
                            onChange={e => setFormData({ ...formData, immediateAction: e.target.value })}
                            placeholder="Ação imediata tomada..."
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5 uppercase">Contra Medida</label>
                        <textarea
                            className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-600 min-h-[80px] text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 transition-colors"
                            value={formData.countermeasure || ''}
                            onChange={e => setFormData({ ...formData, countermeasure: e.target.value })}
                            placeholder="Ação tomada..."
                        />
                    </div>
                </div>

                <div className="pt-4 flex justify-end">
                    <Button onClick={handleSubmit} size="lg" className="w-full md:w-auto">
                        <Save size={18} /> {multiScanMode ? `Salvar ${multiQRs.length} Scraps (Lote)` : 'Salvar Scrap'}
                    </Button>
                </div>
            </div>

            {/* Multi-scan prompt modal */}
            {showMultiScanPrompt && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <Card className="max-w-sm w-full bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 space-y-4">
                        <h3 className="font-bold text-lg text-slate-900 dark:text-white">Cadastro em Lote</h3>
                        <p className="text-sm text-slate-600 dark:text-zinc-400">
                            Deseja cadastrar mais de um scrap do item que tenha o mesmo defeito?
                        </p>
                        <div className="flex gap-2 pt-2">
                            <Button variant="ghost" className="flex-1" onClick={() => handleMultiScanConfirm(false)}>Não, apenas este</Button>
                            <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => handleMultiScanConfirm(true)}>
                                <Plus size={16} /> Sim, múltiplos
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </Card>
    );
};

const ScrapPending = ({ scraps, currentUser, onUpdate, users, lines, models, categories, statusOptions, rootCauseOptions, materials, stations }: any) => {
    const pending = useMemo(() => scraps.filter((s: ScrapData) => {
        const isRelated = s.leaderName === currentUser.name || currentUser.isAdmin || currentUser.role.includes('Admin') || currentUser.role.includes('Supervisor') || currentUser.role.includes('Diretor');
        const noCountermeasure = s.countermeasure == null || s.countermeasure.trim() === '';
        return isRelated && noCountermeasure && isCriticalItem(s.item);
    }), [scraps, currentUser]);

    const [editingScrap, setEditingScrap] = useState<ScrapData | null>(null);

    const pendingListData = useMemo(() => ({
        items: pending,
        onEdit: setEditingScrap
    }), [pending]);

    const PendingRow = useCallback(({ index, style, items, onEdit }: RowComponentProps<any>) => {
        const s: ScrapData = items[index];

        return (
            <div
                style={style}
                className="grid grid-cols-[100px_1fr_80px_1fr_1fr_80px_120px_150px] items-center border-b border-slate-100 dark:border-zinc-800 px-2 text-sm hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
                <div className="p-2 text-slate-700 dark:text-zinc-300">{formatDateDisplay(s.date)}</div>
                <div className="p-2 text-slate-900 dark:text-white font-medium truncate">{s.leaderName}</div>
                <div className="p-2">{s.shift}</div>
                <div className="p-2 text-zinc-300 truncate">{s.model}</div>
                <div className="p-2 text-zinc-300 truncate">{s.item}</div>
                <div className="p-2">{s.qty}</div>
                <div className="p-2 font-mono text-red-400">{formatCurrency(s.totalValue)}</div>
                <div className="p-2 text-right">
                    <Button size="sm" onClick={() => onEdit(s)} variant="ghost"> <AlertTriangle size={14} className="text-yellow-500 mr-2" /> Tratar</Button>
                </div>
            </div>
        );
    }, []);

    return (
        <div className="space-y-4">
            {pending.length === 0 ? (
                <div className="p-12 text-center text-slate-500 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-900/30 rounded-xl border border-dashed border-slate-300 dark:border-zinc-800">
                    <CheckCircle2 size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Nenhuma pendência encontrada!</p>
                </div>
            ) : (
                <div className="w-full overflow-x-auto pb-4 mb-4 touch-pan-x border border-gray-200 dark:border-zinc-800 rounded-xl">
                    <div className="min-w-[900px]">
                        <div className="grid grid-cols-[100px_1fr_80px_1fr_1fr_80px_120px_150px] bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 font-medium border-b border-slate-200 dark:border-zinc-800 text-sm h-12 items-center px-2">
                            <div className="p-2">Data</div>
                            <div className="p-2">Líder</div>
                            <div className="p-2">Turno</div>
                            <div className="p-2">Modelo</div>
                            <div className="p-2">Item</div>
                            <div className="p-2">Qtd</div>
                            <div className="p-2">Valor</div>
                            <div className="p-2"></div>
                        </div>
                        <List
                            rowCount={pending.length}
                            rowHeight={52}
                            rowComponent={PendingRow}
                            rowProps={pendingListData}
                            style={{ height: Math.min(560, Math.max(56, pending.length * 52)), width: '100%' }}
                        />
                    </div>
                </div>
            )}

            {editingScrap && (
                <ScrapEditModal
                    scrap={editingScrap}
                    users={users}
                    lines={lines}
                    models={models}
                    categories={categories}
                    statusOptions={statusOptions}
                    rootCauseOptions={rootCauseOptions}
                    materials={materials}
                    stations={stations}
                    currentUser={currentUser}
                    readOnlyMode={true}
                    onClose={() => setEditingScrap(null)}
                    onSave={async () => {
                        await onUpdate();
                        setEditingScrap(null);
                    }}
                />
            )}
        </div>
    );
};

const ScrapHistory = ({ scraps, currentUser, users }: any) => {
    const [filters, setFilters] = useState({
        period: 'ALL', // ALL, DAY, WEEK, MONTH, YEAR
        specificDate: '',
        specificWeek: '',
        specificMonth: '',
        specificYear: ''
    });

    const [selected, setSelected] = useState<ScrapData | null>(null);

    const filtered = useMemo(() => {
        let res = scraps.filter((s: ScrapData) => s.userId === currentUser.matricula || s.leaderName === currentUser.name);

        if (filters.period !== 'ALL') {
            if (filters.period === 'DAY' && filters.specificDate) {
                res = res.filter((s: ScrapData) => s.date === filters.specificDate);
            }
            else if (filters.period === 'WEEK' && filters.specificWeek) {
                const [y, w] = filters.specificWeek.split('-W').map(Number);
                res = res.filter((s: ScrapData) => {
                    const sd = new Date(s.date);
                    const utcDate = new Date(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate());
                    const sw = getWeekNumber(utcDate);
                    return sw === w && sd.getFullYear() === y;
                });
            }
            else if (filters.period === 'MONTH' && filters.specificMonth) {
                res = res.filter((s: ScrapData) => s.date.startsWith(filters.specificMonth));
            }
            else if (filters.period === 'YEAR' && filters.specificYear) {
                res = res.filter((s: ScrapData) => s.date.startsWith(filters.specificYear));
            }
        }
        return res;
    }, [scraps, currentUser, filters]);

    const total = filtered.reduce((acc: number, curr: ScrapData) => acc + (curr.totalValue || 0), 0);
    const pendingCount = filtered.filter((s: ScrapData) => !s.countermeasure).length;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <Card className="bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-500/30">
                    <h3 className="text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase">Meu Total (Período)</h3>
                    <p className="text-3xl font-bold mt-2 text-slate-900 dark:text-zinc-100">{formatCurrency(total)}</p>
                </Card>
                <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-500/30">
                    <h3 className="text-orange-600 dark:text-orange-400 text-xs font-bold uppercase">Minhas Pendências</h3>
                    <p className="text-3xl font-bold mt-2 text-slate-900 dark:text-zinc-100">{pendingCount}</p>
                </Card>
            </div>

            <Card>
                <div className="flex gap-4 items-center flex-wrap">
                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase whitespace-nowrap sr-only md:not-sr-only">Período:</label>
                        <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded p-2 text-slate-900 dark:text-white text-sm outline-none w-full md:w-auto" value={filters.period} onChange={e => setFilters({ ...filters, period: e.target.value })}>
                            <option value="ALL">Todo o Histórico</option>
                            <option value="DAY">Dia</option>
                            <option value="WEEK">Semana</option>
                            <option value="MONTH">Mês</option>
                            <option value="YEAR">Ano</option>
                        </select>
                        {filters.period === 'DAY' && <Input type="date" value={filters.specificDate} onChange={e => setFilters({ ...filters, specificDate: e.target.value })} className="w-full md:w-auto" />}
                        {filters.period === 'WEEK' && <Input type="week" value={filters.specificWeek} onChange={e => setFilters({ ...filters, specificWeek: e.target.value })} className="w-full md:w-auto" />}
                        {filters.period === 'MONTH' && <Input type="month" value={filters.specificMonth} onChange={e => setFilters({ ...filters, specificMonth: e.target.value })} className="w-full md:w-auto" />}
                        {filters.period === 'YEAR' && <Input type="number" placeholder="2026" value={filters.specificYear} onChange={e => setFilters({ ...filters, specificYear: e.target.value })} className="w-full md:w-24" />}
                    </div>
                </div>
            </Card>

            <div>
                <div className="grid grid-cols-1 gap-2">
                    {filtered.length === 0 && <p className="text-zinc-500 text-center py-8">Nenhum registro encontrado no período.</p>}
                    {filtered.map((s: ScrapData) => (
                        <div key={s.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-4 rounded-lg flex justify-between items-center hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-sm group">
                            <div onClick={() => setSelected(s)} className="cursor-pointer flex-1">
                                <p className="font-bold text-slate-800 dark:text-zinc-200">{s.item} <span className="text-slate-500 dark:text-zinc-500 font-normal">| {s.model}</span></p>
                                <p className="text-xs text-slate-500 dark:text-zinc-500">{formatDateDisplay(s.date)} • {s.leaderName}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <p className={`font-bold ${!s.countermeasure ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{formatCurrency(s.totalValue)}</p>
                                    <span className="text-[10px] uppercase text-slate-500 dark:text-zinc-600">{s.status}</span>
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => setSelected(s)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Eye size={18} className="text-slate-500 dark:text-zinc-400 hover:text-blue-500" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <ScrapDetailModal
                isOpen={!!selected}
                scrap={selected}
                users={users}
                onClose={() => setSelected(null)}
            />
        </div>
    );
};

export const ScrapOperational = ({ scraps, users, lines, models, isLoading = false, isHydrating = false }: any) => {
    const [filters, setFilters] = useState({
        leader: '',
        line: '',
        model: '',
        period: 'ALL', // DAY, WEEK, MONTH, YEAR, ALL
        specificDate: '', // For DAY
        specificWeek: '', // For WEEK
        specificMonth: '', // For MONTH
        specificYear: '', // For YEAR
        shift: ''
    });

    const [selected, setSelected] = useState<ScrapData | null>(null);
    const reactiveScraps = useMemo(() => normalizeScrapCollection(Array.isArray(scraps) ? scraps : []), [scraps]);
    const safeUsers = useMemo(() => Array.isArray(users) ? users : [], [users]);
    const safeLines = useMemo(() => Array.isArray(lines) ? lines : [], [lines]);
    const safeModels = useMemo(() => Array.isArray(models) ? models : [], [models]);

    const filtered = useMemo(() => {
        let res = [...reactiveScraps];
        if (filters.leader) res = res.filter(s => s.leaderName === filters.leader);
        if (filters.line) res = res.filter(s => s.line === filters.line);
        if (filters.model) res = res.filter(s => s.model === filters.model);
        if (filters.shift) res = res.filter(s => String(s.shift ?? '') === filters.shift);

        const now = new Date();
        const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        if (filters.period !== 'ALL') {
            if (filters.period === 'DAY' && filters.specificDate) {
                res = res.filter(s => normalizeScrapDateKey(s.date) === filters.specificDate);
            }
            else if (filters.period === 'WEEK' && filters.specificWeek) {
                const [y, w] = filters.specificWeek.split('-W').map(Number);
                res = res.filter(s => {
                    const sd = parseScrapDate(s.date);
                    if (!sd) return false;
                    const normalizedDate = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
                    return getWeekNumber(normalizedDate) === w && sd.getFullYear() === y;
                });
            }
            else if (filters.period === 'MONTH' && filters.specificMonth) {
                res = res.filter(s => normalizeScrapDateKey(s.date).startsWith(filters.specificMonth));
            }
            else if (filters.period === 'YEAR' && filters.specificYear) {
                res = res.filter(s => normalizeScrapDateKey(s.date).startsWith(filters.specificYear));
            }
            else if (filters.period === 'MONTH' && !filters.specificMonth) {
                res = res.filter(s => normalizeScrapDateKey(s.date).startsWith(monthPrefix));
            }
        }

        return res.sort((a, b) => (parseScrapDate(b.date)?.getTime() || 0) - (parseScrapDate(a.date)?.getTime() || 0));
    }, [reactiveScraps, filters]);

    const leadersOnly = useMemo(
        () => sortUsersByDisplayName(safeUsers.filter((u: User) => isLeadershipRole(u.role))),
        [safeUsers]
    );

    if ((isLoading || isHydrating) && reactiveScraps.length === 0) {
        return <LoadingSpinner label="Sincronizando monitoramento..." />;
    }

    const downloadExcel = () => {
        exportScrapToExcel(filtered);
    };

    const operationalListData = useMemo(() => ({
        items: filtered,
        onSelect: setSelected
    }), [filtered]);

    const OperationalRow = useCallback(({ index, style, items, onSelect }: RowComponentProps<any>) => {
        const s: ScrapData = items[index];
        return (
            <div
                style={style}
                className="grid grid-cols-[100px_1fr_1fr_1fr_1fr_1fr_80px_120px] items-center border-b border-slate-100 dark:border-zinc-800 px-2 text-sm hover:bg-slate-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                onClick={() => onSelect(s)}
            >
                <div className="p-2 text-slate-700 dark:text-zinc-300">{formatDateDisplay(s.date)}</div>
                <div className="p-2 text-slate-700 dark:text-zinc-300 truncate">{s.leaderName}</div>
                <div className="p-2 text-slate-700 dark:text-zinc-300 truncate">{s.model}</div>
                <div className="p-2 text-slate-700 dark:text-zinc-300 truncate">{s.line}</div>
                <div className="p-2 text-slate-700 dark:text-zinc-300 font-mono truncate">{s.code || '-'}</div>
                <div className="p-2 text-slate-700 dark:text-zinc-300 truncate">{s.item}</div>
                <div className="p-2 text-slate-700 dark:text-zinc-300">{s.qty}</div>
                <div className="p-2 text-right font-mono text-slate-700 dark:text-zinc-300">{formatCurrency(s.totalValue)}</div>
            </div>
        );
    }, []);

    return (
        <div className="space-y-6">
            <Card>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <select className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-blue-600/50" onChange={e => setFilters({ ...filters, leader: e.target.value })} value={filters.leader}>
                        <option value="">Todos Líderes</option>
                        {leadersOnly.map((u: User) => <option key={u.matricula} value={u.name}>{u.name}</option>)}
                    </select>
                    <select className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-blue-600/50" onChange={e => setFilters({ ...filters, line: e.target.value })} value={filters.line}>
                        <option value="">Todas Linhas</option>
                        {safeLines.map((l: string) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <select className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-blue-600/50" onChange={e => setFilters({ ...filters, model: e.target.value })} value={filters.model}>
                        <option value="">Todos Modelos</option>
                        {safeModels.map((m: string) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-blue-600/50" onChange={e => setFilters({ ...filters, shift: e.target.value })} value={filters.shift}>
                        <option value="">Todos Turnos</option>
                        <option value="1">1º Turno</option>
                        <option value="2">2º Turno</option>
                    </select>
                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        <select className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-blue-600/50 w-full md:w-auto" onChange={e => setFilters({ ...filters, period: e.target.value })} value={filters.period}>
                            <option value="ALL">Todo Período</option>
                            <option value="DAY">Dia</option>
                            <option value="WEEK">Semana</option>
                            <option value="MONTH">Mês</option>
                            <option value="YEAR">Ano</option>
                        </select>
                        {filters.period === 'DAY' && <Input type="date" value={filters.specificDate} onChange={e => setFilters({ ...filters, specificDate: e.target.value })} className="w-full md:w-auto" />}
                        {filters.period === 'WEEK' && <Input type="week" value={filters.specificWeek} onChange={e => setFilters({ ...filters, specificWeek: e.target.value })} className="w-full md:w-auto" />}
                        {filters.period === 'MONTH' && <Input type="month" value={filters.specificMonth} onChange={e => setFilters({ ...filters, specificMonth: e.target.value })} className="w-full md:w-auto" />}
                        {filters.period === 'YEAR' && <Input type="number" placeholder="2026" value={filters.specificYear} onChange={e => setFilters({ ...filters, specificYear: e.target.value })} className="w-full md:w-24" />}
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/50 p-6">
                    <h3 className="text-blue-600 dark:text-blue-400 font-bold uppercase text-xs">Total Filtrado</h3>
                    <p className="text-3xl font-bold mt-2 text-slate-900 dark:text-zinc-100">{formatCurrency(filtered.reduce((a, b) => a + normalizeScrapNumber(b.totalValue), 0))}</p>
                </Card>
                <Card className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 p-6 flex flex-col justify-center items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800 shadow-sm" onClick={downloadExcel}>
                    <Download size={32} className="text-green-600 dark:text-green-500 mb-2" />
                    <span className="text-sm font-bold text-green-600 dark:text-green-400">Baixar Excel</span>
                </Card>
            </div>

            <div className="w-full overflow-x-auto bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm">
                <div className="min-w-[900px]">
                    <div className="grid grid-cols-[100px_1fr_1fr_1fr_1fr_1fr_80px_120px] bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 text-sm h-12 items-center px-2">
                        <div className="p-2">Data</div>
                        <div className="p-2">Líder</div>
                        <div className="p-2">Modelo</div>
                        <div className="p-2">Linha</div>
                        <div className="p-2">Código</div>
                        <div className="p-2">Item</div>
                        <div className="p-2">Qtd</div>
                        <div className="p-2 text-right">Valor</div>
                    </div>
                    <List
                        rowCount={filtered.length}
                        rowHeight={52}
                        rowComponent={OperationalRow}
                        rowProps={operationalListData}
                        style={{ height: Math.min(560, Math.max(56, filtered.length * 52)), width: '100%' }}
                    />
                    {filtered.length === 0 && <div className="p-8 text-center text-slate-500 dark:text-zinc-500">Nenhum registro encontrado.</div>}
                </div>
            </div>

            <ScrapDetailModal
                isOpen={!!selected}
                scrap={selected}
                users={users}
                onClose={() => setSelected(null)}
            />
        </div>
    )
}

export const ScrapManagementAdvanced = ({ scraps, users, isLoading = false, isHydrating = false }: any) => {
    const [filters, setFilters] = useState({
        period: 'ALL', // DAY, WEEK, MONTH, YEAR, ALL
        specificDate: '',
        specificWeek: '',
        specificMonth: '',
        specificYear: '',
        shift: 'ALL',
        leaderName: 'ALL',
        model: 'ALL'
    });
    const [showChartsModal, setShowChartsModal] = useState(false);
    const [chartFilters, setChartFilters] = useState({
        period: 'ALL', specificDate: '', specificWeek: '', specificMonth: '', specificYear: '',
        shift: 'ALL', leaderName: 'ALL', model: 'ALL', startDate: '', endDate: ''
    });
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [chartDrilldown, setChartDrilldown] = useState<{ label: string; scraps: ScrapData[] } | null>(null);

    const [selectedRanking, setSelectedRanking] = useState<{ type: string, name: string, items: ScrapData[] } | null>(null);
    const [selectedItem, setSelectedItem] = useState<ScrapData | null>(null);
    const [groupPreviewModal, setGroupPreviewModal] = useState<{ isOpen: boolean; type: 'shift' | 'line' | 'model' | 'leader' | 'pending'; key: string; scraps: ScrapData[] }>({ isOpen: false, type: 'shift', key: '', scraps: [] });
    const [detailModal, setDetailModal] = useState<{ isOpen: boolean; scrap: ScrapData | null }>({ isOpen: false, scrap: null });
    const reactiveScraps = useMemo(() => normalizeScrapCollection(Array.isArray(scraps) ? scraps : []), [scraps]);
    const safeUsers = useMemo(() => Array.isArray(users) ? users : [], [users]);

    const availableModels = useMemo(() => {
        let modelSource = [...reactiveScraps];

        if (filters.shift !== 'ALL') {
            modelSource = modelSource.filter(s => String(s.shift ?? '') === filters.shift);
        }

        if (filters.leaderName !== 'ALL') {
            modelSource = modelSource.filter(s => s.leaderName === filters.leaderName);
        }

        return Array.from(new Set(modelSource.map(s => s.model).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
    }, [reactiveScraps, filters.shift, filters.leaderName]);

    const formatRangeDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const applyQuickRange = (preset: 'CURRENT_WEEK' | 'CURRENT_MONTH' | 'LAST_7_DAYS' | 'CLEAR') => {
        if (preset === 'CLEAR') {
            setStartDate('');
            setEndDate('');
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let rangeStart = new Date(today);

        if (preset === 'CURRENT_WEEK') {
            const dayIndex = (today.getDay() + 6) % 7;
            rangeStart.setDate(today.getDate() - dayIndex);
        } else if (preset === 'CURRENT_MONTH') {
            rangeStart = new Date(today.getFullYear(), today.getMonth(), 1);
        } else if (preset === 'LAST_7_DAYS') {
            rangeStart.setDate(today.getDate() - 6);
        }

        setStartDate(formatRangeDate(rangeStart));
        setEndDate(formatRangeDate(today));
        setFilters(prev => ({
            ...prev,
            period: 'ALL',
            specificDate: '',
            specificWeek: '',
            specificMonth: '',
            specificYear: ''
        }));
    };

    const filtered = useMemo(() => {
        let res = [...reactiveScraps];
        const now = new Date();
        const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        if (filters.period !== 'ALL') {
            if (filters.period === 'DAY' && filters.specificDate) {
                res = res.filter(s => normalizeScrapDateKey(s.date) === filters.specificDate);
            }
            else if (filters.period === 'WEEK' && filters.specificWeek) {
                const [y, w] = filters.specificWeek.split('-W').map(Number);
                res = res.filter(s => {
                    const sd = parseScrapDate(s.date);
                    if (!sd) return false;
                    const normalizedDate = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
                    return getWeekNumber(normalizedDate) === w && sd.getFullYear() === y;
                });
            }
            else if (filters.period === 'MONTH' && filters.specificMonth) {
                res = res.filter(s => normalizeScrapDateKey(s.date).startsWith(filters.specificMonth));
            }
            else if (filters.period === 'YEAR' && filters.specificYear) {
                res = res.filter(s => normalizeScrapDateKey(s.date).startsWith(filters.specificYear));
            }
            else if (filters.period === 'MONTH' && !filters.specificMonth) {
                res = res.filter(s => normalizeScrapDateKey(s.date).startsWith(monthPrefix));
            }
        }

        if (filters.shift !== 'ALL') {
            res = res.filter(s => String(s.shift ?? '') === filters.shift);
        }

        if (filters.leaderName !== 'ALL') {
            res = res.filter(s => s.leaderName === filters.leaderName);
        }

        if (filters.model !== 'ALL') {
            res = res.filter(s => s.model === filters.model);
        }

        const parsedStart = startDate ? parseScrapDate(startDate) : null;
        const parsedEnd = endDate ? parseScrapDate(endDate) : null;
        const startTime = parsedStart ? new Date(parsedStart).setHours(0, 0, 0, 0) : null;
        const endTime = parsedEnd ? new Date(parsedEnd).setHours(23, 59, 59, 999) : null;
        const minTime = startTime !== null && endTime !== null ? Math.min(startTime, endTime) : startTime;
        const maxTime = startTime !== null && endTime !== null ? Math.max(startTime, endTime) : endTime;

        if (minTime !== null || maxTime !== null) {
            res = res.filter((item) => {
                const itemDate = parseScrapDate(item?.date || '');
                if (!itemDate) return false;
                const itemTime = itemDate.getTime();
                if (minTime !== null && itemTime < minTime) return false;
                if (maxTime !== null && itemTime > maxTime) return false;
                return true;
            });
        }

        return res;
    }, [reactiveScraps, filters, startDate, endDate]);

    const baseFiltered = useMemo(() => {
        let res = [...reactiveScraps];

        if (filters.shift !== 'ALL') {
            res = res.filter(s => String(s.shift ?? '') === filters.shift);
        }

        if (filters.leaderName !== 'ALL') {
            res = res.filter(s => s.leaderName === filters.leaderName);
        }

        if (filters.model !== 'ALL') {
            res = res.filter(s => s.model === filters.model);
        }

        return res;
    }, [reactiveScraps, filters.shift, filters.leaderName, filters.model]);

    const chartFiltered = useMemo(() => {
        let res = [...reactiveScraps];
        const now = new Date();
        const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        if (chartFilters.period !== 'ALL') {
            if (chartFilters.period === 'DAY' && chartFilters.specificDate) {
                res = res.filter(s => normalizeScrapDateKey(s.date) === chartFilters.specificDate);
            } else if (chartFilters.period === 'WEEK' && chartFilters.specificWeek) {
                const [y, w] = chartFilters.specificWeek.split('-W').map(Number);
                res = res.filter(s => {
                    const sd = parseScrapDate(s.date);
                    if (!sd) return false;
                    const normalizedDate = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
                    return getWeekNumber(normalizedDate) === w && sd.getFullYear() === y;
                });
            } else if (chartFilters.period === 'MONTH' && chartFilters.specificMonth) {
                res = res.filter(s => normalizeScrapDateKey(s.date).startsWith(chartFilters.specificMonth));
            } else if (chartFilters.period === 'YEAR' && chartFilters.specificYear) {
                res = res.filter(s => normalizeScrapDateKey(s.date).startsWith(chartFilters.specificYear));
            } else if (chartFilters.period === 'MONTH' && !chartFilters.specificMonth) {
                res = res.filter(s => normalizeScrapDateKey(s.date).startsWith(monthPrefix));
            }
        }
        if (chartFilters.shift !== 'ALL') res = res.filter(s => String(s.shift ?? '') === chartFilters.shift);
        if (chartFilters.leaderName !== 'ALL') res = res.filter(s => s.leaderName === chartFilters.leaderName);
        if (chartFilters.model !== 'ALL') res = res.filter(s => s.model === chartFilters.model);

        const parsedStart = chartFilters.startDate ? parseScrapDate(chartFilters.startDate) : null;
        const parsedEnd = chartFilters.endDate ? parseScrapDate(chartFilters.endDate) : null;
        const startTime = parsedStart ? new Date(parsedStart).setHours(0, 0, 0, 0) : null;
        const endTime = parsedEnd ? new Date(parsedEnd).setHours(23, 59, 59, 999) : null;
        const minTime = startTime !== null && endTime !== null ? Math.min(startTime, endTime) : startTime;
        const maxTime = startTime !== null && endTime !== null ? Math.max(startTime, endTime) : endTime;

        if (minTime !== null || maxTime !== null) {
            res = res.filter((item) => {
                const itemDate = parseScrapDate(item?.date || '');
                if (!itemDate) return false;
                const itemTime = itemDate.getTime();
                if (minTime !== null && itemTime < minTime) return false;
                if (maxTime !== null && itemTime > maxTime) return false;
                return true;
            });
        }

        return res;
    }, [reactiveScraps, chartFilters]);

    const chartBaseFiltered = useMemo(() => {
        let res = [...reactiveScraps];
        if (chartFilters.shift !== 'ALL') res = res.filter(s => String(s.shift ?? '') === chartFilters.shift);
        if (chartFilters.leaderName !== 'ALL') res = res.filter(s => s.leaderName === chartFilters.leaderName);
        if (chartFilters.model !== 'ALL') res = res.filter(s => s.model === chartFilters.model);

        const parsedStart = chartFilters.startDate ? parseScrapDate(chartFilters.startDate) : null;
        const parsedEnd = chartFilters.endDate ? parseScrapDate(chartFilters.endDate) : null;
        const startTime = parsedStart ? new Date(parsedStart).setHours(0, 0, 0, 0) : null;
        const endTime = parsedEnd ? new Date(parsedEnd).setHours(23, 59, 59, 999) : null;
        const minTime = startTime !== null && endTime !== null ? Math.min(startTime, endTime) : startTime;
        const maxTime = startTime !== null && endTime !== null ? Math.max(startTime, endTime) : endTime;

        if (minTime !== null || maxTime !== null) {
            res = res.filter((item) => {
                const itemDate = parseScrapDate(item?.date || '');
                if (!itemDate) return false;
                const itemTime = itemDate.getTime();
                if (minTime !== null && itemTime < minTime) return false;
                if (maxTime !== null && itemTime > maxTime) return false;
                return true;
            });
        }

        return res;
    }, [reactiveScraps, chartFilters.shift, chartFilters.leaderName, chartFilters.model, chartFilters.startDate, chartFilters.endDate]);

    const chartAvailableModels = useMemo(() => {
        let src = [...reactiveScraps];
        if (chartFilters.shift !== 'ALL') src = src.filter(s => String(s.shift ?? '') === chartFilters.shift);
        if (chartFilters.leaderName !== 'ALL') src = src.filter(s => s.leaderName === chartFilters.leaderName);
        return Array.from(new Set(src.map(s => s.model).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
    }, [reactiveScraps, chartFilters.shift, chartFilters.leaderName]);

    const rankings = useMemo(() => {
        const byLeader: Record<string, number> = {};
        const byModel: Record<string, number> = {};
        const byLine: Record<string, number> = {};
        const byShift: Record<string, number> = {};
        const pendingByLeader: Record<string, number> = {};

        filtered.forEach((s: ScrapData) => {
            const val = normalizeScrapNumber(s.totalValue);
            const leaderKey = s.leaderName || 'Não informado';
            const modelKey = s.model || 'Não informado';
            const lineKey = s.line || 'Não informada';
            const shiftKey = String(s.shift || 'N/A');

            byLeader[leaderKey] = (byLeader[leaderKey] || 0) + val;
            byModel[modelKey] = (byModel[modelKey] || 0) + val;
            byLine[lineKey] = (byLine[lineKey] || 0) + val;
            byShift[shiftKey] = (byShift[shiftKey] || 0) + val;

            if (!String(s.countermeasure || '').trim()) {
                pendingByLeader[leaderKey] = (pendingByLeader[leaderKey] || 0) + 1;
            }
        });

        return {
            leader: Object.entries(byLeader).sort((a, b) => b[1] - a[1]),
            model: Object.entries(byModel).sort((a, b) => b[1] - a[1]),
            line: Object.entries(byLine).sort((a, b) => b[1] - a[1]),
            shift: Object.entries(byShift).sort((a, b) => b[1] - a[1]),
            pending: Object.entries(pendingByLeader).sort((a, b) => b[1] - a[1]),
        };
    }, [filtered]);

    if ((isLoading || isHydrating) && reactiveScraps.length === 0) {
        return <LoadingSpinner label="Sincronizando ranking geral..." />;
    }

    const openGroupPreview = (type: 'shift' | 'line' | 'model' | 'leader' | 'pending', key: string) => {
        let groupScraps: ScrapData[] = [];
        if (type === 'shift') {
            groupScraps = filtered.filter(s => s.shift == key);
        } else if (type === 'line') {
            groupScraps = filtered.filter(s => s.line === key);
        } else if (type === 'model') {
            groupScraps = filtered.filter(s => s.model === key);
        } else if (type === 'leader') {
            groupScraps = filtered.filter(s => s.leaderName === key);
        } else if (type === 'pending') {
            groupScraps = filtered.filter(s => s.leaderName === key && !s.countermeasure);
        }
        setGroupPreviewModal({ isOpen: true, type, key, scraps: groupScraps });
    };

    const openDetailModal = (scrap: ScrapData) => {
        setDetailModal({ isOpen: true, scrap });
    };

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <h3 className="font-bold text-lg text-slate-900 dark:text-zinc-100">Dashboard de Gestão</h3>
                    <div className="flex gap-2 items-center flex-wrap">
                        <select className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-600" onChange={e => setFilters({ ...filters, period: e.target.value })} value={filters.period}>
                            <option value="ALL">Todo Período</option>
                            <option value="DAY">Dia Específico</option>
                            <option value="WEEK">Semana Específica</option>
                            <option value="MONTH">Mês Específico</option>
                            <option value="YEAR">Ano Específico</option>
                        </select>
                        {filters.period === 'DAY' && <Input type="date" value={filters.specificDate} onChange={e => setFilters({ ...filters, specificDate: e.target.value })} className="w-auto max-w-[160px]" />}
                        {filters.period === 'WEEK' && <Input type="week" value={filters.specificWeek} onChange={e => setFilters({ ...filters, specificWeek: e.target.value })} className="w-auto max-w-[160px]" />}
                        {filters.period === 'MONTH' && <Input type="month" value={filters.specificMonth} onChange={e => setFilters({ ...filters, specificMonth: e.target.value })} className="w-auto max-w-[160px]" />}
                        {filters.period === 'YEAR' && <Input type="number" placeholder="Ano (Ex: 2024)" value={filters.specificYear} onChange={e => setFilters({ ...filters, specificYear: e.target.value })} className="w-auto max-w-[160px]" />}

                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-2">
                            <span className="text-xs font-semibold uppercase text-slate-500 dark:text-zinc-400">De</span>
                            <input
                                type="date"
                                className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-600"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                            <span className="text-xs font-semibold uppercase text-slate-500 dark:text-zinc-400">Até</span>
                            <input
                                type="date"
                                className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-600"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => applyQuickRange('CURRENT_WEEK')}>Semana Atual</Button>
                            <Button variant="ghost" size="sm" onClick={() => applyQuickRange('CURRENT_MONTH')}>Mês Atual</Button>
                            <Button variant="ghost" size="sm" onClick={() => applyQuickRange('LAST_7_DAYS')}>Últimos 7 Dias</Button>
                            <Button variant="ghost" size="sm" onClick={() => applyQuickRange('CLEAR')}>Limpar</Button>
                        </div>

                        <Button variant="primary" onClick={() => { setChartFilters({ ...chartFilters, ...filters, startDate, endDate }); setShowChartsModal(true); }} size="sm" className="flex items-center gap-2 whitespace-nowrap">
                            <BarChart3 size={16} />
                            Visualizar Gráficos
                        </Button>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/50 p-6">
                    <h3 className="text-blue-600 dark:text-blue-400 font-bold uppercase text-xs">Total Filtrado (Gestão)</h3>
                    <p className="text-3xl font-bold mt-2 !text-slate-900 dark:!text-zinc-100">{formatCurrency(filtered.reduce((a, b) => a + normalizeScrapNumber(b.totalValue), 0))}</p>
                </Card>
                <Card className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 p-6 flex flex-col justify-center items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800 shadow-sm" onClick={() => exportExecutiveReport(filtered)}>
                    <Download size={32} className="text-green-600 dark:text-green-500 mb-2" />
                    <span className="text-sm font-bold text-green-600 dark:text-green-400">Baixar Relatório Detalhado (Excel)</span>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Reordered: Shift -> Line -> Model -> Leaders -> Pending */}
                <Card>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 uppercase text-sm">Ranking Turnos (R$)</h3>
                    <div className="space-y-2">
                        {rankings.shift.map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-800 p-2 rounded transition-colors" onClick={() => openGroupPreview('shift', name)}>
                                <span className="text-slate-900 dark:text-zinc-100">Turno {name}</span>
                                <span className="font-bold text-slate-800 dark:text-zinc-200">{formatCurrency(val)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 uppercase text-sm">Ranking Linhas (R$)</h3>
                    <div className="space-y-2">
                        {rankings.line.map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-800 p-2 rounded transition-colors" onClick={() => openGroupPreview('line', name)}>
                                <span className="text-slate-900 dark:text-zinc-100">{name}</span>
                                <span className="font-bold text-slate-800 dark:text-zinc-200">{formatCurrency(val)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 uppercase text-sm">Ranking Modelos (R$)</h3>
                    <div className="space-y-2">
                        {rankings.model.slice(0, 10).map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-800 p-2 rounded transition-colors" onClick={() => openGroupPreview('model', name)}>
                                <span className="text-sm truncate max-w-[150px] text-slate-900 dark:text-zinc-100">{name}</span>
                                <span className="font-mono font-bold text-slate-800 dark:text-zinc-200">{formatCurrency(val)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 uppercase text-sm">Ranking Líderes (R$)</h3>
                    <div className="space-y-2">
                        {rankings.leader.slice(0, 10).map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-800 p-2 rounded transition-colors" onClick={() => openGroupPreview('leader', name)}>
                                <span className="text-sm text-slate-500 dark:text-zinc-400"><span className="font-bold text-slate-400 dark:text-zinc-500 mr-2">#{i + 1}</span> {name}</span>
                                <span className="font-mono font-bold text-slate-800 dark:text-zinc-200">{formatCurrency(val)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 uppercase text-sm">Pendências (Qtd)</h3>
                    <div className="space-y-2">
                        {rankings.pending.slice(0, 10).map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-800 p-2 rounded transition-colors" onClick={() => openGroupPreview('pending', name)}>
                                <span className="text-sm truncate max-w-[150px] text-slate-900 dark:text-zinc-100">{name}</span>
                                <span className="font-mono font-bold text-slate-800 dark:text-zinc-200">{val}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            <RankingPreviewModal
                isOpen={!!selectedRanking}
                ranking={selectedRanking}
                onClose={() => setSelectedRanking(null)}
                onSelectItem={setSelectedItem}
            />

            <ScrapDetailModal
                isOpen={!!selectedItem}
                scrap={selectedItem}
                users={[]} // Assuming no users needed here
                onClose={() => setSelectedItem(null)}
            />

            {/* Group Preview Modal */}
            {groupPreviewModal.isOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <Card className="max-w-6xl w-full bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl">
                        <div className="flex justify-between items-start mb-6 border-b border-slate-100 dark:border-zinc-800 pb-4">
                            <div>
                                <h3 className="font-bold text-xl text-slate-900 dark:text-white">Preview do SCRAP</h3>
                                <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">
                                    {groupPreviewModal.type === 'shift' ? 'Turno' : groupPreviewModal.type === 'line' ? 'Linha' : groupPreviewModal.type === 'model' ? 'Modelo' : groupPreviewModal.type === 'leader' ? 'Líder' : 'Pendências'}: {groupPreviewModal.key}
                                </p>
                            </div>
                            <button onClick={() => setGroupPreviewModal({ ...groupPreviewModal, isOpen: false })} className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                                <X size={24} className="text-slate-500 dark:text-zinc-400" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {groupPreviewModal.scraps.map((scrap) => (
                                <div key={scrap.id} className="border border-slate-200 dark:border-zinc-700 rounded-lg p-4 hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer transition-colors" onClick={() => openDetailModal(scrap)}>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                                        <div>
                                            <span className="font-semibold text-slate-600 dark:text-zinc-400">ID:</span> {scrap.id}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-slate-600 dark:text-zinc-400">Data:</span> {formatDateDisplay(scrap.date)}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-slate-600 dark:text-zinc-400">Item:</span> {scrap.item}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-slate-600 dark:text-zinc-400">Valor:</span> {formatCurrency(scrap.totalValue)}
                                        </div>
                                        <div className="md:col-span-2">
                                            <span className="font-semibold text-slate-600 dark:text-zinc-400">Descrição:</span> {scrap.description || '-'}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-slate-600 dark:text-zinc-400">Linha:</span> {scrap.line}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-slate-600 dark:text-zinc-400">Status:</span> {scrap.status}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            )}

            {/* Detail Modal */}
            <ScrapDetailModal
                isOpen={detailModal.isOpen}
                scrap={detailModal.scrap}
                users={[]}
                onClose={() => setDetailModal({ isOpen: false, scrap: null })}
            />

            {/* Charts Modal */}
            {showChartsModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <Card className="w-full h-full max-w-7xl max-h-[95vh] bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 overflow-y-auto custom-scrollbar shadow-2xl">
                        <div className="mb-6 border-b border-slate-100 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900 z-10 p-6">
                            <div className="flex justify-between items-start gap-4">
                                <div className="space-y-4 flex-1">
                                    <h3 className="font-bold text-2xl text-slate-900 dark:text-white">Análise Gráfica Avançada</h3>
                                    <div className="flex gap-3 items-center overflow-x-auto whitespace-nowrap pb-2 w-full custom-scrollbar flex-nowrap">
                                        <select className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-600" onChange={e => setChartFilters({ ...chartFilters, period: e.target.value })} value={chartFilters.period}>
                                            <option value="ALL">Todo Período</option>
                                            <option value="DAY">Dia Específico</option>
                                            <option value="WEEK">Semana Específica</option>
                                            <option value="MONTH">Mês Específico</option>
                                            <option value="YEAR">Ano Específico</option>
                                        </select>
                                        {chartFilters.period === 'DAY' && <Input type="date" value={chartFilters.specificDate} onChange={e => setChartFilters({ ...chartFilters, specificDate: e.target.value })} className="w-auto max-w-[160px]" />}
                                        {chartFilters.period === 'WEEK' && <Input type="week" value={chartFilters.specificWeek} onChange={e => setChartFilters({ ...chartFilters, specificWeek: e.target.value })} className="w-auto max-w-[160px]" />}
                                        {chartFilters.period === 'MONTH' && <Input type="month" value={chartFilters.specificMonth} onChange={e => setChartFilters({ ...chartFilters, specificMonth: e.target.value })} className="w-auto max-w-[160px]" />}
                                        {chartFilters.period === 'YEAR' && <Input type="number" placeholder="Ano (Ex: 2024)" value={chartFilters.specificYear} onChange={e => setChartFilters({ ...chartFilters, specificYear: e.target.value })} className="w-auto max-w-[160px]" />}
                                        <select className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-600" onChange={e => setChartFilters({ ...chartFilters, shift: e.target.value, model: 'ALL' })} value={chartFilters.shift}>
                                            <option value="ALL">Turno: Todos</option>
                                            <option value="1">Turno 1</option>
                                            <option value="2">Turno 2</option>
                                        </select>
                                        <select className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-600" onChange={e => setChartFilters({ ...chartFilters, leaderName: e.target.value, model: 'ALL' })} value={chartFilters.leaderName}>
                                            <option value="ALL">Líder: Todos</option>
                                            {sortUsersByDisplayName(safeUsers.filter((u: User) => isLeadershipRole(u.role))).map((u: User) => (
                                                <option key={u.matricula} value={u.name}>{u.name}</option>
                                            ))}
                                        </select>
                                        <select className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-600" onChange={e => setChartFilters({ ...chartFilters, model: e.target.value })} value={chartFilters.model}>
                                            <option value="ALL">Modelo: Todos</option>
                                            {chartAvailableModels.map((model: string) => (
                                                <option key={model} value={model}>{model}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <button onClick={() => setShowChartsModal(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors shrink-0">
                                    <X size={28} className="text-slate-500 dark:text-zinc-400" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-8 p-6 min-h-screen">
                            {/* Top Section: Shift Comparison & Top 10 */}
                            {/* Row 1: Turnos */}
                            <div>
                                {/* Shift Comparison */}
                                <div>
                                    <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-4">Comparativo Turnos</h4>
                                    {(() => {
                                        const shift1Total = chartFiltered.filter(s => s.shift === '1').reduce((acc, s) => acc + normalizeScrapNumber(s.totalValue), 0);
                                        const shift2Total = chartFiltered.filter(s => s.shift === '2').reduce((acc, s) => acc + normalizeScrapNumber(s.totalValue), 0);
                                        const totalValue = shift1Total + shift2Total;
                                        const maxShiftValRaw = Math.max(Number(shift1Total) || 0, Number(shift2Total) || 0);
                                        const safeMaxShift = maxShiftValRaw > 0 ? maxShiftValRaw : 1;
                                        const shift1Pct = totalValue > 0 ? (shift1Total / totalValue) * 100 : 0;
                                        const shift2Pct = totalValue > 0 ? (shift2Total / totalValue) * 100 : 0;
                                        const shift1Height = (Number(shift1Total) || 0) / safeMaxShift * 100;
                                        const shift2Height = (Number(shift2Total) || 0) / safeMaxShift * 100;
                                        return (
                                            <div className="flex flex-col lg:flex-row gap-4 items-stretch">
                                                <div className="flex-1 flex items-end justify-center gap-12 h-80 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-800 dark:to-zinc-900 p-6 pt-10 rounded-lg border border-slate-200 dark:border-zinc-700">
                                                    <div className="flex flex-col items-center justify-end gap-2 h-full cursor-pointer group" onClick={() => setChartDrilldown({ label: 'Turno 1', scraps: chartFiltered.filter(s => s.shift === '1') })}>
                                                        <div className="text-center text-xs mb-2">
                                                            <p className="text-white font-bold text-sm">{formatCurrency(shift1Total)}</p>
                                                            <p className="text-green-500 font-bold">{shift1Pct.toFixed(1)}%</p>
                                                        </div>
                                                        <div className="w-20 bg-slate-300 dark:bg-zinc-700 rounded-t-md overflow-hidden shadow-md transition-all group-hover:shadow-xl group-hover:scale-105" style={{ height: `${Math.max(2, shift1Height)}%` }}>
                                                            <div className="w-full h-full bg-gradient-to-t from-cyan-600 to-cyan-500"></div>
                                                        </div>
                                                        <span className="text-xs font-semibold text-slate-600 dark:text-zinc-400 mt-1">Turno 1</span>
                                                    </div>
                                                    <div className="flex flex-col items-center justify-end gap-2 h-full cursor-pointer group" onClick={() => setChartDrilldown({ label: 'Turno 2', scraps: chartFiltered.filter(s => s.shift === '2') })}>
                                                        <div className="text-center text-xs mb-2">
                                                            <p className="text-white font-bold text-sm">{formatCurrency(shift2Total)}</p>
                                                            <p className="text-green-500 font-bold">{shift2Pct.toFixed(1)}%</p>
                                                        </div>
                                                        <div className="w-20 bg-slate-300 dark:bg-zinc-700 rounded-t-md overflow-hidden shadow-md transition-all group-hover:shadow-xl group-hover:scale-105" style={{ height: `${Math.max(2, shift2Height)}%` }}>
                                                            <div className="w-full h-full bg-gradient-to-t from-cyan-600 to-cyan-500"></div>
                                                        </div>
                                                        <span className="text-xs font-semibold text-slate-600 dark:text-zinc-400 mt-1">Turno 2</span>
                                                    </div>
                                                </div>
                                                <div className="w-full lg:w-72 flex flex-col justify-center text-center p-4 bg-slate-50 dark:bg-zinc-800/50 rounded border border-slate-200 dark:border-zinc-700 gap-4">
                                                    <div>
                                                        <span className="text-sm text-slate-600 dark:text-zinc-400">Total Filtrado:</span>
                                                        <p className="text-3xl font-bold text-slate-900 dark:text-white">{formatCurrency(totalValue)}</p>
                                                    </div>
                                                    <div className="flex flex-col gap-1 text-xs">
                                                        <div className="flex items-center gap-2 justify-center"><span className="w-3 h-3 rounded-sm bg-cyan-500 inline-block"></span><span className="text-slate-600 dark:text-zinc-400">Turno 1 — {shift1Pct.toFixed(1)}%</span></div>
                                                        <div className="flex items-center gap-2 justify-center"><span className="w-3 h-3 rounded-sm bg-cyan-600 inline-block"></span><span className="text-slate-600 dark:text-zinc-400">Turno 2 — {shift2Pct.toFixed(1)}%</span></div>
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 italic">Clique nas barras para ver o drilldown</p>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Row 2: Top 10 Items - Full Width */}
                            <div>
                                <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-4">Top 10 Itens (Torres Verticais)</h4>
                                <div className="flex items-end justify-between w-full gap-1 h-[400px] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-800 dark:to-zinc-900 p-6 pt-10 pb-20 rounded-lg border border-slate-200 dark:border-zinc-700">
                                    {(() => {
                                        const byItem: Record<string, { value: number; qty: number; codes: Set<string>; models: Set<string> }> = {};
                                        chartFiltered.forEach(s => {
                                            const itemKey = String(s.item || 'NÃO INFORMADO');
                                            if (!byItem[itemKey]) {
                                                byItem[itemKey] = { value: 0, qty: 0, codes: new Set(), models: new Set() };
                                            }
                                            byItem[itemKey].value += normalizeScrapNumber(s.totalValue);
                                            byItem[itemKey].qty += normalizeScrapNumber(s.qty);
                                            if (s.code) byItem[itemKey].codes.add(s.code);
                                            if (s.model) byItem[itemKey].models.add(s.model);
                                        });
                                        const totalValue = chartFiltered.reduce((acc, s) => acc + normalizeScrapNumber(s.totalValue), 0);
                                            const itemValuesArray = Object.values(byItem).map(v => Number(v.value) || 0);
                                            const maxItemValueRaw = Math.max(...itemValuesArray);
                                            const safeMaxItems = maxItemValueRaw > 0 ? maxItemValueRaw : 1;
                                            
                                            const getCategoryFromItem = (item: string): string => {
                                                const upper = (item || '').toUpperCase();
                                                if (upper.includes('FRONT')) return 'FRONT';
                                                if (upper.includes('PLACA')) return 'PLACA';
                                                if (upper.includes('BATERIA')) return 'BATERIA';
                                                if (upper.includes('OCTA')) return 'OCTA';
                                                if (upper.includes('REAR')) return 'REAR';                                            
                                                return upper.substring(0, 8);
                                            };
                                            
                                            return Object.entries(byItem)
                                                .map(([item, data]) => ({ item, ...data }))
                                                .sort((a, b) => b.value - a.value)
                                                .slice(0, 10)
                                                .map((entry, idx) => {
                                                    const share = totalValue > 0 ? ((entry.value / totalValue) * 100).toFixed(1) : '0.0';
                                                    const category = getCategoryFromItem(entry.item);
                                                    const firstCode = Array.from(entry.codes)[0] || '-';
                                                    const firstModel = (Array.from(entry.models)[0] || '-').substring(0, 7);
                                                    const barHeight = (Number(entry.value) || 0) / safeMaxItems * 100;
                                                    return (
                                                        <div 
                                                            key={entry.item} 
                                                            className="flex flex-col items-center justify-end gap-1 group relative h-full flex-1 cursor-pointer"
                                                            title={`${entry.item}: ${formatCurrency(entry.value)} | Qtd: ${entry.qty} | Cat: ${category} | Modelo: ${firstModel} | Código: ${firstCode}`}
                                                            onClick={() => setChartDrilldown({ label: entry.item, scraps: chartFiltered.filter(s => s.item === entry.item) })}
                                                        >
                                                            <div className="text-[10px] text-center leading-tight mb-1 w-full">
                                                                <p className="text-white font-bold">{formatCurrency(entry.value)}</p>
                                                                <p className="text-green-500 font-bold">{share}%</p>
                                                            </div>
                                                            <div 
                                                                className="w-16 bg-slate-300 dark:bg-zinc-700 rounded-t-sm overflow-hidden shadow-md transition-all group-hover:shadow-lg"
                                                                style={{ height: `${Math.max(5, barHeight)}%` }}
                                                            >
                                                                <div className="w-full h-full bg-gradient-to-t from-cyan-600 to-cyan-500 dark:from-cyan-700 dark:to-cyan-600"></div>
                                                            </div>
                                                            <div className="text-center px-1 w-[70px] mt-2 text-slate-600 dark:text-zinc-400">
                                                                <p className="text-[9px] leading-tight truncate">{category}</p>
                                                                <p className="text-[9px] leading-tight truncate">{firstModel}</p>
                                                                <span className="block text-[9px] leading-tight font-mono whitespace-nowrap truncate w-full">{firstCode}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                        })()}
                                    </div>
                                </div>

                            {/* Row 3: Temporal Analysis */}
                            {chartFilters.period === 'DAY' && <DayAnalysisChart filtered={chartFiltered} baseScraps={chartBaseFiltered} specificDate={chartFilters.specificDate} />}
                            {chartFilters.period === 'WEEK' && <WeekAnalysisChart filtered={chartFiltered} baseScraps={chartBaseFiltered} specificWeek={chartFilters.specificWeek} />}
                            {chartFilters.period === 'MONTH' && <MonthAnalysisChart filtered={chartFiltered} baseScraps={chartBaseFiltered} specificMonth={chartFilters.specificMonth} />}
                            {chartFilters.period === 'YEAR' && <YearAnalysisChart filtered={chartFiltered} baseScraps={chartBaseFiltered} specificYear={chartFilters.specificYear} />}
                            {chartFilters.period === 'ALL' && (
                                <div className="text-center p-8 bg-slate-50 dark:bg-zinc-800 rounded-lg">
                                    <p className="text-slate-600 dark:text-zinc-400">Selecione um período específico para visualizar análise temporal</p>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {/* Drilldown Modal */}
            {chartDrilldown && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setChartDrilldown(null); }}>
                    <div className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-zinc-700">
                        <div className="flex justify-between items-center p-5 border-b border-slate-200 dark:border-zinc-800 shrink-0">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Drilldown: {chartDrilldown.label}</h3>
                            <button onClick={() => setChartDrilldown(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full"><X size={22} className="text-slate-500" /></button>
                        </div>
                        <div className="overflow-y-auto flex-1 custom-scrollbar">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-slate-50 dark:bg-zinc-800">
                                    <tr className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase">
                                        <th className="text-left px-4 py-3">Data</th>
                                        <th className="text-left px-4 py-3">Item</th>
                                        <th className="text-left px-4 py-3">Código</th>
                                        <th className="text-left px-4 py-3">Modelo</th>
                                        <th className="text-left px-4 py-3">Líder</th>
                                        <th className="text-right px-4 py-3">Qtd</th>
                                        <th className="text-right px-4 py-3">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                                    {chartDrilldown.scraps.sort((a, b) => (parseScrapDate(b.date)?.getTime() || 0) - (parseScrapDate(a.date)?.getTime() || 0)).map((s, i) => (
                                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer" onClick={() => setDetailModal({ isOpen: true, scrap: s })}>
                                            <td className="px-4 py-2.5 font-mono text-slate-600 dark:text-zinc-400">{normalizeScrapDateKey(s.date)}</td>
                                            <td className="px-4 py-2.5 text-slate-800 dark:text-zinc-200 max-w-[160px] truncate">{s.item}</td>
                                            <td className="px-4 py-2.5 font-mono text-slate-600 dark:text-zinc-400">{s.code}</td>
                                            <td className="px-4 py-2.5 text-slate-600 dark:text-zinc-400">{s.model}</td>
                                            <td className="px-4 py-2.5 text-slate-600 dark:text-zinc-400">{s.leaderName}</td>
                                            <td className="px-4 py-2.5 text-right font-bold text-slate-800 dark:text-zinc-200">{normalizeScrapNumber(s.qty)}</td>
                                            <td className="px-4 py-2.5 text-right font-bold text-slate-800 dark:text-zinc-200">{formatCurrency(normalizeScrapNumber(s.totalValue))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {chartDrilldown.scraps.length === 0 && (
                                <div className="py-12 text-center text-slate-500">Nenhum dado encontrado.</div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-200 dark:border-zinc-800 flex justify-between items-center shrink-0">
                            <span className="text-xs text-slate-500">{chartDrilldown.scraps.length} registros</span>
                            <span className="font-bold text-slate-800 dark:text-zinc-200">Total: {formatCurrency(chartDrilldown.scraps.reduce((a, s) => a + normalizeScrapNumber(s.totalValue), 0))}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- DAY ANALYSIS CHART ---
const DayAnalysisChart = ({ filtered, baseScraps, specificDate }: { filtered: ScrapData[]; baseScraps: ScrapData[]; specificDate: string }) => {
    const now = new Date();
    const [yearRaw, monthRaw] = specificDate ? specificDate.split('-') : [];
    const targetYear = Number(yearRaw) || now.getFullYear();
    const targetMonth = Number(monthRaw) || now.getMonth() + 1;
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
    const targetMonthPrefix = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

    const monthSource = (baseScraps.length ? baseScraps : filtered).filter(s => normalizeScrapDateKey(s.date).startsWith(targetMonthPrefix));
    const dayData: Record<number, number> = {};
    monthSource.forEach(s => {
        const date = parseScrapDate(s.date);
        if (!date) return;
        const day = date.getDate();
        dayData[day] = (dayData[day] || 0) + normalizeScrapNumber(s.totalValue);
    });
    const dayValues = Array.from({ length: daysInMonth }).map((_, idx) => dayData[idx + 1] || 0);
    const maxValue = Math.max(...dayValues, 1);
    const nonZeroDayValues = dayValues.filter(v => v > 0);
    const minValue = nonZeroDayValues.length > 0 ? Math.min(...nonZeroDayValues) : 0;
    const avgValue = dayValues.reduce((a, b) => a + b, 0) / (dayValues.length || 1);
    const totalPeriodValue = dayValues.reduce((a, b) => a + b, 0) || 1;
    const selectedDay = specificDate ? Number((specificDate.split('-')[2] || '0')) : 0;
    const dayMaxAbs = Math.max(...dayValues, 0);

    const getDayBarColor = (day: number, value: number) => {
        if (value === 0) return 'from-cyan-600 to-cyan-500';
        if (day === selectedDay) return 'from-yellow-500 to-yellow-400';
        if (value === dayMaxAbs) return 'from-red-600 to-red-500';
        if (minValue > 0 && value === minValue) return 'from-emerald-600 to-emerald-500';
        return 'from-cyan-600 to-cyan-500';
    };
    
    return (
        <div>
            <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-3">Valores por Dia do Mês</h4>
            <div className="text-[10px] font-bold text-slate-500 flex gap-4 uppercase mb-2"><span>MAX: {formatCurrency(maxValue)}</span><span>MIN: {formatCurrency(minValue)}</span><span>MÉDIA: {formatCurrency(avgValue)}</span></div>
            <div className="h-[300px] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-800 dark:to-zinc-900 p-4 pt-10 pb-6 rounded-lg border border-slate-200 dark:border-zinc-700 overflow-x-auto overflow-y-hidden">
                <div className="flex items-end justify-start gap-2 custom-scrollbar w-full h-full">
                {Array.from({ length: daysInMonth }).map((_, idx) => {
                    const day = idx + 1;
                    const val = dayData[day] || 0;
                    const safeDayMax = maxValue > 0 ? maxValue : 1;
                    const share = ((val / totalPeriodValue) * 100).toFixed(1);
                    const dayBarColor = getDayBarColor(day, val);
                    
                    return (
                        <div key={day} className="flex flex-col items-center justify-end gap-0.5 group relative h-full min-w-[36px] w-10" title={`Dia ${day}: ${formatCurrency(val)}`}>
                            <div className="text-[7px] tracking-tighter whitespace-nowrap px-1 mb-0.5 text-center leading-tight w-full">
                                <p className="text-white font-bold">{formatCurrency(val)}</p>
                                <p className="text-green-500 font-bold">{share}%</p>
                            </div>
                            <div className="w-full bg-slate-300 dark:bg-zinc-700 rounded-t-sm overflow-hidden shadow-sm transition-all duration-300 group-hover:shadow-md relative" style={{ height: `${Math.max(5, (val / safeDayMax) * 85)}%`, minHeight: '1px' }}>
                                <div 
                                    className={`w-full h-full rounded-t-sm transition-all duration-300 bg-gradient-to-t ${dayBarColor}`}
                                    style={{ height: '100%' }}
                                ></div>
                            </div>
                            <span className="text-xs text-slate-600 dark:text-zinc-400 font-semibold absolute -bottom-8">{day}</span>
                        </div>
                    );
                })}
                </div>
            </div>
        </div>
    );
};

// --- WEEK ANALYSIS CHART ---
const WeekAnalysisChart = ({ filtered, baseScraps, specificWeek }: { filtered: ScrapData[]; baseScraps: ScrapData[]; specificWeek: string }) => {
    const isoDayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];
    const [selectedYearRaw, selectedWeekRaw] = specificWeek ? specificWeek.split('-W') : [];
    const selectedYear = Number(selectedYearRaw) || new Date().getFullYear();
    const selectedWeek = Number(selectedWeekRaw) || getWeekNumber(new Date());

    const getIsoWeekStart = (year: number, week: number) => {
        const jan4 = new Date(year, 0, 4);
        const jan4IsoDay = (jan4.getDay() + 6) % 7;
        const week1Monday = new Date(jan4);
        week1Monday.setDate(jan4.getDate() - jan4IsoDay);
        const targetMonday = new Date(week1Monday);
        targetMonday.setDate(week1Monday.getDate() + (week - 1) * 7);
        return targetMonday;
    };

    const formatShortDate = (date: Date) => {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yy = String(date.getFullYear()).slice(-2);
        return `${dd}/${mm}/${yy}`;
    };

    const monday = getIsoWeekStart(selectedYear, selectedWeek);
    const weekDays = Array.from({ length: 7 }).map((_, idx) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + idx);
        const key = date.toISOString().split('T')[0];
        return {
            idx,
            dayName: isoDayNames[idx],
            date,
            key,
            value: filtered
                .filter(s => normalizeScrapDateKey(s.date) === key)
                .reduce((acc, s) => acc + normalizeScrapNumber(s.totalValue), 0)
        };
    });

    const weekDayValues = weekDays.map(d => d.value);
    const maxValue = Math.max(...weekDayValues, 1);
    const nonZeroWeekDayValues = weekDayValues.filter(v => v > 0);
    const minValue = nonZeroWeekDayValues.length > 0 ? Math.min(...nonZeroWeekDayValues) : 0;
    const avgValue = weekDays.reduce((acc, d) => acc + d.value, 0) / (weekDays.length || 1);
    const totalWeekDays = weekDays.reduce((acc, d) => acc + d.value, 0) || 1;

    const historyWeeks = Array.from({ length: 7 }).map((_, idx) => selectedWeek - 3 + idx);
    const historyData = historyWeeks.map((week) => {
        const value = baseScraps
            .filter(s => {
                const date = parseScrapDate(s.date);
                if (!date) return false;
                return date.getFullYear() === selectedYear && getWeekNumber(date) === week;
            })
            .reduce((acc, s) => acc + normalizeScrapNumber(s.totalValue), 0);
        return { week, value };
    });

    const historyValues = historyData.map(w => w.value);
    const maxHistoryValue = Math.max(...historyValues, 1);
    const nonZeroHistoryValues = historyValues.filter(v => v > 0);
    const minHistoryValue = nonZeroHistoryValues.length > 0 ? Math.min(...nonZeroHistoryValues) : 0;
    const avgHistoryValue = historyData.reduce((acc, w) => acc + w.value, 0) / (historyData.length || 1);
    const totalHistoryValue = historyData.reduce((acc, w) => acc + w.value, 0) || 1;

    const weekDayMaxAbs = Math.max(...weekDayValues, 0);
    const historyMax = Math.max(...historyValues, 0);

    const getWeekDayBarColor = (day: typeof weekDays[number]) => {
        const value = day.value;
        if (value === 0) return 'from-cyan-600 to-cyan-500';
        if (day.idx === 0) return 'from-yellow-500 to-yellow-400';
        if (value === weekDayMaxAbs) return 'from-red-600 to-red-500';
        if (minValue > 0 && value === minValue) return 'from-emerald-600 to-emerald-500';
        return 'from-cyan-600 to-cyan-500';
    };

    const getHistoryBarColor = (week: number, value: number) => {
        if (value === 0) return 'from-cyan-600 to-cyan-500';
        if (week === selectedWeek) return 'from-yellow-500 to-yellow-400';
        if (value === historyMax) return 'from-red-600 to-red-500';
        if (minHistoryValue > 0 && value === minHistoryValue) return 'from-emerald-600 to-emerald-500';
        return 'from-cyan-600 to-cyan-500';
    };

    return (
        <div className="space-y-6">
            <div>
                <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-3">Valores por Dia da Semana</h4>
                <div className="text-[10px] font-bold text-slate-500 flex gap-4 uppercase mb-2"><span>MAX: {formatCurrency(maxValue)}</span><span>MIN: {formatCurrency(minValue)}</span><span>MÉDIA: {formatCurrency(avgValue)}</span></div>
                <div className="flex items-end justify-between w-full gap-1 h-80 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-800 dark:to-zinc-900 p-6 pt-14 pb-8 rounded-lg border border-slate-200 dark:border-zinc-700">
                    {weekDays.map((day) => {
                        const safeWeekMax = maxValue > 0 ? maxValue : 1;
                        const share = ((day.value / totalWeekDays) * 100).toFixed(1);
                        const weekDayBarColor = getWeekDayBarColor(day);

                        return (
                            <div key={day.key} className="flex flex-col items-center justify-end flex-1 gap-1 group relative h-full" title={`${day.dayName} ${formatShortDate(day.date)}: ${formatCurrency(day.value)}`}>
                                <div className="text-[10px] mb-1 text-center leading-tight w-full">
                                    <p className="text-white font-bold">{formatCurrency(day.value)}</p>
                                    <p className="text-green-500 font-bold">{share}%</p>
                                </div>
                                <div className="w-16 bg-slate-300 dark:bg-zinc-700 rounded-t-sm overflow-hidden shadow-sm transition-all duration-300 group-hover:shadow-md" style={{ height: `${Math.max(5, (day.value / safeWeekMax) * 85)}%`, minHeight: '2px' }}>
                                    <div className={`w-full h-full rounded-t-sm transition-all bg-gradient-to-t ${weekDayBarColor}`}></div>
                                </div>
                                <span className="text-xs text-slate-600 dark:text-zinc-400 font-semibold absolute -bottom-8">{day.dayName}</span>
                                <span className="text-[7px] md:text-[8px] tracking-tighter whitespace-nowrap text-slate-500 dark:text-zinc-500 absolute -bottom-12">{formatShortDate(day.date)}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div>
                <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-4">Histórico Semanal (7 Semanas)</h4>
                <div className="flex items-center gap-4 mb-2 flex-wrap">
                    <div className="text-[10px] font-bold text-slate-500 flex gap-4 uppercase"><span>MAX: {formatCurrency(maxHistoryValue)}</span><span>MIN: {formatCurrency(minHistoryValue)}</span><span>MÉDIA: {formatCurrency(avgHistoryValue)}</span></div>
                    {(() => {
                        const currIdx = historyData.findIndex(d => d.week === selectedWeek);
                        const prevIdx = currIdx - 1;
                        if (currIdx > 0 && prevIdx >= 0 && historyData[prevIdx].value > 0) {
                            const curr = historyData[currIdx].value;
                            const prev = historyData[prevIdx].value;
                            const pct = ((curr - prev) / prev) * 100;
                            const isUp = pct >= 0;
                            return (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isUp ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                                    {isUp ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% vs semana anterior
                                </span>
                            );
                        }
                        return null;
                    })()}
                </div>
                <div className="flex items-end justify-start gap-4 overflow-x-auto custom-scrollbar w-full h-80 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-800 dark:to-zinc-900 p-6 pt-14 pb-8 rounded-lg border border-slate-200 dark:border-zinc-700">
                    {historyData.map(({ week, value }) => {
                        const safeHistoryMax = maxHistoryValue > 0 ? maxHistoryValue : 1;
                        const share = ((value / totalHistoryValue) * 100).toFixed(1);
                        const historyBarColor = getHistoryBarColor(week, value);
                        return (
                            <div key={`hist-${week}`} className="flex flex-col justify-end items-center gap-1 relative h-full min-w-[40px] w-14" title={`Semana ${week}: ${formatCurrency(value)}`}>
                                <div className="text-[10px] mb-1 text-center leading-tight w-full">
                                    <p className="text-white font-bold">{formatCurrency(value)}</p>
                                    <p className="text-green-500 font-bold">{share}%</p>
                                </div>
                                <div
                                    className={`w-full bg-gradient-to-t ${historyBarColor} rounded-t-sm shadow-sm transition-all hover:shadow-md`}
                                    style={{ height: `${Math.max(5, (value / safeHistoryMax) * 85)}%` }}
                                ></div>
                                <span className="text-xs text-slate-600 dark:text-zinc-400 font-semibold absolute -bottom-8">Sem {week}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// --- MONTH ANALYSIS CHART ---
const MonthAnalysisChart = ({ filtered, baseScraps, specificMonth }: { filtered: ScrapData[]; baseScraps: ScrapData[]; specificMonth: string }) => {
    const weekData: Record<number, number> = {};
    const monthData: Record<number, number> = {};
    const selectedYear = specificMonth?.split('-')[0] || String(new Date().getFullYear());
    
    filtered.forEach(s => {
        const date = parseScrapDate(s.date);
        if (!date) return;
        const week = getWeekNumber(date);
        weekData[week] = (weekData[week] || 0) + normalizeScrapNumber(s.totalValue);
    });

    baseScraps.filter(s => normalizeScrapDateKey(s.date).startsWith(selectedYear)).forEach(s => {
        const date = parseScrapDate(s.date);
        if (!date) return;
        const month = date.getMonth();
        monthData[month] = (monthData[month] || 0) + normalizeScrapNumber(s.totalValue);
    });

    const uniqueMonthWeeks = Object.keys(weekData).map(Number).sort((a, b) => a - b);

    const weekValues = Object.values(weekData);
    const monthValuesRaw = Object.values(monthData);
    const maxWeekValue = Math.max(...weekValues, 1);
    const nonZeroWeekValues = weekValues.filter(v => v > 0);
    const minWeekValue = nonZeroWeekValues.length > 0 ? Math.min(...nonZeroWeekValues) : 0;
    const maxMonthValue = Math.max(...monthValuesRaw, 1);
    const nonZeroMonthValues = monthValuesRaw.filter(v => v > 0);
    const minMonthValue = nonZeroMonthValues.length > 0 ? Math.min(...nonZeroMonthValues) : 0;
    const avgWeekValue = Object.values(weekData).reduce((a, b) => a + b, 0) / (Object.keys(weekData).length || 1);
    const avgMonthValue = Object.values(monthData).reduce((a, b) => a + b, 0) / (Object.keys(monthData).length || 1);
    const totalMonthWeeks = Object.values(weekData).reduce((a, b) => a + b, 0) || 1;
    const totalYearMonths = Object.values(monthData).reduce((a, b) => a + b, 0) || 1;

    const selectedMonthIndex = specificMonth ? Number(specificMonth.split('-')[1]) - 1 : new Date().getMonth();
    const monthValues = Array.from({ length: 12 }).map((_, idx) => monthData[idx] || 0);
    const maxWeekAbs = Math.max(...weekValues, 0);
    const maxMonthAbs = Math.max(...monthValues, 0);

    const getWeekBarColor = (value: number) => {
        if (value === 0) return 'from-cyan-600 to-cyan-500';
        if (value === maxWeekAbs) return 'from-red-600 to-red-500';
        if (minWeekValue > 0 && value === minWeekValue) return 'from-emerald-600 to-emerald-500';
        return 'from-cyan-600 to-cyan-500';
    };

    const getMonthBarColor = (idx: number, value: number) => {
        if (value === 0) return 'from-cyan-600 to-cyan-500';
        if (idx === selectedMonthIndex) return 'from-yellow-500 to-yellow-400';
        if (value === maxMonthAbs) return 'from-red-600 to-red-500';
        if (minMonthValue > 0 && value === minMonthValue) return 'from-emerald-600 to-emerald-500';
        return 'from-cyan-600 to-cyan-500';
    };

    return (
        <div className="space-y-6">
            <div>
                <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-3">Valores por Semana do Mês</h4>
                <div className="text-[10px] font-bold text-slate-500 flex gap-4 uppercase mb-2"><span>MAX: {formatCurrency(maxWeekValue)}</span><span>MIN: {formatCurrency(minWeekValue)}</span><span>MÉDIA: {formatCurrency(avgWeekValue)}</span></div>
                <div className="flex items-end justify-between w-full gap-1 h-80 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-800 dark:to-zinc-900 p-6 pt-14 pb-8 rounded-lg border border-slate-200 dark:border-zinc-700">
                    {uniqueMonthWeeks.map((week) => {
                        const val = weekData[week] || 0;
                        const safeWeekValMax = maxWeekValue > 0 ? maxWeekValue : 1;
                        const share = ((val / totalMonthWeeks) * 100).toFixed(1);
                        const weekBarColor = getWeekBarColor(val);
                        
                        return (
                            <div key={week} className="flex flex-col items-center justify-end flex-1 gap-1 group relative h-full" title={`Semana ${week}: ${formatCurrency(val)}`}>
                                <div className="text-[10px] mb-1 text-center leading-tight w-full">
                                    <p className="text-white font-bold">{formatCurrency(val)}</p>
                                    <p className="text-green-500 font-bold">{share}%</p>
                                </div>
                                <div 
                                    className="w-16 bg-slate-300 dark:bg-zinc-700 rounded-t-sm overflow-hidden shadow-sm transition-all duration-300 group-hover:shadow-md"
                                    style={{ height: `${Math.max(5, (val / safeWeekValMax) * 85)}%`, minHeight: '2px' }}
                                >
                                    <div className={`w-full h-full rounded-t-sm transition-all bg-gradient-to-t ${weekBarColor}`}></div>
                                </div>
                                <span className="text-xs text-slate-600 dark:text-zinc-400 font-semibold absolute -bottom-8">Sem {week}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div>
                <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-3">Todos os Meses do Ano</h4>
                <div className="flex items-center gap-4 mb-2 flex-wrap">
                    <div className="text-[10px] font-bold text-slate-500 flex gap-4 uppercase"><span>MAX: {formatCurrency(maxMonthValue)}</span><span>MIN: {formatCurrency(minMonthValue)}</span><span>MÉDIA: {formatCurrency(avgMonthValue)}</span></div>
                    {(() => {
                        const prevMonthIndex = selectedMonthIndex - 1;
                        if (prevMonthIndex >= 0) {
                            const curr = monthData[selectedMonthIndex] || 0;
                            const prev = monthData[prevMonthIndex] || 0;
                            if (prev > 0) {
                                const pct = ((curr - prev) / prev) * 100;
                                const isUp = pct >= 0;
                                return (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isUp ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                                        {isUp ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% vs mês anterior
                                    </span>
                                );
                            }
                        }
                        return null;
                    })()}
                </div>
                <div className="flex items-end justify-between w-full gap-1 h-80 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-800 dark:to-zinc-900 p-6 pt-14 pb-8 rounded-lg border border-slate-200 dark:border-zinc-700">
                    {Array.from({ length: 12 }).map((_, idx) => {
                        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                        const val = monthData[idx] || 0;
                        const safeMonthMax = maxMonthValue > 0 ? maxMonthValue : 1;
                        const share = ((val / totalYearMonths) * 100).toFixed(1);
                        const monthBarColor = getMonthBarColor(idx, val);
                        
                        return (
                            <div key={idx} className="flex flex-col items-center justify-end flex-1 gap-1 group relative h-full" title={`${monthNames[idx]}: ${formatCurrency(val)}`}>
                                <div className="text-[10px] mb-1 text-center leading-tight w-full">
                                    <p className="text-white font-bold">{formatCurrency(val)}</p>
                                    <p className="text-green-500 font-bold">{share}%</p>
                                </div>
                                <div 
                                    className="w-16 bg-slate-300 dark:bg-zinc-700 rounded-t-sm overflow-hidden shadow-sm transition-all duration-300 group-hover:shadow-md"
                                    style={{ height: `${Math.max(5, (val / safeMonthMax) * 85)}%`, minHeight: '2px' }}
                                >
                                    <div className={`w-full h-full bg-gradient-to-t ${monthBarColor} rounded-t-sm transition-all`}></div>
                                </div>
                                <span className="text-xs text-slate-600 dark:text-zinc-400 font-semibold absolute -bottom-8">{monthNames[idx]}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// --- YEAR ANALYSIS CHART ---
const YearAnalysisChart = ({ filtered, baseScraps, specificYear }: { filtered: ScrapData[]; baseScraps: ScrapData[]; specificYear: string }) => {
    const monthData: Record<number, number> = {};
    const yearData: Record<number, number> = {};
    
    filtered.forEach(s => {
        const date = parseScrapDate(s.date);
        if (!date) return;
        const month = date.getMonth();
        monthData[month] = (monthData[month] || 0) + normalizeScrapNumber(s.totalValue);
    });

    baseScraps.forEach(s => {
        const date = parseScrapDate(s.date);
        if (!date) return;
        const year = date.getFullYear();
        yearData[year] = (yearData[year] || 0) + normalizeScrapNumber(s.totalValue);
    });

    const monthValues = Object.values(monthData).map(v => Number(v) || 0);
    const yearValues = Object.values(yearData).map(v => Number(v) || 0);
    const maxMonthValue = Math.max(...monthValues, 1);
    const nonZeroMonthValues = monthValues.filter(v => v > 0);
    const minMonthValue = nonZeroMonthValues.length > 0 ? Math.min(...nonZeroMonthValues) : 0;
    const maxYearValue = Math.max(...yearValues, 1);
    const nonZeroYearValues = yearValues.filter(v => v > 0);
    const minYearValue = nonZeroYearValues.length > 0 ? Math.min(...nonZeroYearValues) : 0;
    const avgMonthValue = Object.values(monthData).reduce((a, b) => a + b, 0) / (Object.keys(monthData).length || 1);
    const avgYearValue = Object.values(yearData).reduce((a, b) => a + b, 0) / (Object.keys(yearData).length || 1);
    const totalYearSelected = Object.values(monthData).reduce((a, b) => a + b, 0) || 1;
    const totalAllYears = Object.values(yearData).reduce((a, b) => a + b, 0) || 1;

    const selectedYear = Number(specificYear) || new Date().getFullYear();
    const maxMonthAbs = Math.max(...monthValues, 0);
    const maxYearAbs = Math.max(...yearValues, 0);

    const getYearMonthBarColor = (idx: number, value: number) => {
        if (value === 0) return 'from-cyan-600 to-cyan-500';
        if (value === maxMonthAbs) return 'from-red-600 to-red-500';
        if (minMonthValue > 0 && value === minMonthValue) return 'from-emerald-600 to-emerald-500';
        return 'from-cyan-600 to-cyan-500';
    };

    const getYearBarColor = (year: number, value: number) => {
        if (value === 0) return 'from-cyan-600 to-cyan-500';
        if (year === selectedYear) return 'from-yellow-500 to-yellow-400';
        if (value === maxYearAbs) return 'from-red-600 to-red-500';
        if (minYearValue > 0 && value === minYearValue) return 'from-emerald-600 to-emerald-500';
        return 'from-cyan-600 to-cyan-500';
    };

    return (
        <div className="space-y-6">
            <div>
                <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-3">Meses do Ano {specificYear}</h4>
                <div className="text-[10px] font-bold text-slate-500 flex gap-4 uppercase mb-2"><span>MAX: {formatCurrency(maxMonthValue)}</span><span>MIN: {formatCurrency(minMonthValue)}</span><span>MÉDIA: {formatCurrency(avgMonthValue)}</span></div>
                <div className="flex items-end justify-between w-full gap-1 h-80 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-800 dark:to-zinc-900 p-6 pt-14 pb-8 rounded-lg border border-slate-200 dark:border-zinc-700">
                    {Array.from({ length: 12 }).map((_, idx) => {
                        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                        const val = monthData[idx] || 0;
                        const safeMonthVal = maxMonthValue > 0 ? maxMonthValue : 1;
                        const share = ((val / totalYearSelected) * 100).toFixed(1);
                        const yearMonthBarColor = getYearMonthBarColor(idx, val);
                        
                        return (
                            <div key={idx} className="flex flex-col items-center justify-end flex-1 gap-1 group relative h-full" title={`${monthNames[idx]}: ${formatCurrency(val)}`}>
                                <div className="text-[10px] mb-1 text-center leading-tight w-full">
                                    <p className="text-white font-bold">{formatCurrency(val)}</p>
                                    <p className="text-green-500 font-bold">{share}%</p>
                                </div>
                                <div 
                                    className="w-16 bg-slate-300 dark:bg-zinc-700 rounded-t-sm overflow-hidden shadow-sm transition-all duration-300 group-hover:shadow-md"
                                    style={{ height: `${Math.max(5, (val / safeMonthVal) * 85)}%`, minHeight: '2px' }}
                                >
                                    <div className={`w-full h-full rounded-t-sm transition-all bg-gradient-to-t ${yearMonthBarColor}`}></div>
                                </div>
                                <span className="text-xs text-slate-600 dark:text-zinc-400 font-semibold absolute -bottom-8">{monthNames[idx]}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div>
                <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-3">Histórico: Todos os Anos</h4>
                <div className="text-[10px] font-bold text-slate-500 flex gap-4 uppercase mb-2"><span>MAX: {formatCurrency(maxYearValue)}</span><span>MIN: {formatCurrency(minYearValue)}</span><span>MÉDIA: {formatCurrency(avgYearValue)}</span></div>
                <div className="flex items-end justify-between w-full gap-1 h-80 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-800 dark:to-zinc-900 p-6 pt-14 pb-8 rounded-lg border border-slate-200 dark:border-zinc-700">
                    {Array.from(new Set(Object.keys(yearData).map(Number)))
                        .sort()
                        .map((year) => {
                            const val = yearData[year] || 0;
                            const safeYearMax = maxYearValue > 0 ? maxYearValue : 1;
                            const share = ((val / totalAllYears) * 100).toFixed(1);
                            const yearBarColor = getYearBarColor(year, val);
                            return (
                                <div key={year} className="flex flex-col items-center justify-end flex-1 gap-1 group relative h-full" title={`${year}: ${formatCurrency(val)}`}>
                                    <div className="text-[10px] mb-1 text-center leading-tight w-full">
                                        <p className="text-white font-bold">{formatCurrency(val)}</p>
                                        <p className="text-green-500 font-bold">{share}%</p>
                                    </div>
                                    <div 
                                        className="w-16 bg-slate-300 dark:bg-zinc-700 rounded-t-sm overflow-hidden shadow-sm transition-all duration-300 group-hover:shadow-md"
                                        style={{ height: `${Math.max(5, (val / safeYearMax) * 85)}%`, minHeight: '2px' }}
                                    >
                                        <div className={`w-full h-full bg-gradient-to-t ${yearBarColor} rounded-t-sm transition-all`}></div>
                                    </div>
                                    <span className="text-xs text-slate-600 dark:text-zinc-400 font-semibold absolute -bottom-8">{year}</span>
                                </div>
                            );
                        })}
                </div>
            </div>
        </div>
    );
};

// --- RANKING PREVIEW MODAL ---

const RankingPreviewModal = ({ isOpen, ranking, onClose, onSelectItem }: { isOpen: boolean, ranking: { type: string, name: string, items: ScrapData[] } | null, onClose: () => void, onSelectItem: (item: ScrapData) => void }) => {
    if (!isOpen || !ranking) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <Card className="w-full max-w-4xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">Itens de {ranking.type}: {ranking.name}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200">✕</button>
                </div>
                <div className="space-y-2">
                    {ranking.items.map(item => (
                        <div key={item.id} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-zinc-900 rounded border cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/10" onClick={() => onSelectItem(item)}>
                            <div>
                                <span className="font-bold">{item.item}</span> - {item.model} - Qtd: {item.qty} - Valor: {formatCurrency(item.totalValue)}
                            </div>
                            <Eye size={16} />
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};

// --- SHARED DETAIL MODAL ---

interface ScrapDetailModalProps {
    isOpen: boolean;
    scrap: ScrapData | null;
    users: User[];
    onClose: () => void;
}

export const ScrapDetailModal: React.FC<ScrapDetailModalProps> = ({ isOpen, scrap, users, onClose }) => {
    if (!isOpen || !scrap) return null;

    // Logic to find the name of the user who registered the scrap (not the responsible for the fault)
    const registeredBy = users.find(u => u.matricula === scrap.userId)?.name || scrap.userId;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <Card className="max-w-4xl w-full bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl">
                {/* Header */}
                <div className="flex justify-between items-start mb-6 border-b border-slate-100 dark:border-zinc-800 pb-4">
                    <div>
                        <h3 className="font-bold text-xl text-slate-900 dark:text-white">Detalhes do Apontamento</h3>
                        <div className="flex gap-2 mt-1">
                            <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded">ID: {scrap.id || 'N/A'}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${!scrap.countermeasure ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'}`}>
                                {scrap.status}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                        <X size={24} className="text-slate-500 dark:text-zinc-400" />
                    </button>
                </div>

                <div className="space-y-6">
                    {(scrap.situation === 'SENT' || scrap.nfNumber) && (
                        <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-200 dark:border-green-800/50 mb-6">
                            <h4 className="text-xs font-bold text-green-600 dark:text-green-400 uppercase mb-3 flex items-center gap-2">
                                <CheckCircle2 size={14} /> Dados de Expedição
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <DetailItem label="Data de Envio" value={formatDateDisplay(scrap.sentAt)} />
                                <DetailItem label="Número da NF" value={scrap.nfNumber || '-'} />
                                <DetailItem label="Caixa" value={scrap.boxId ? `#${scrap.boxId}` : '-'} />
                                <DetailItem label="Enviado Por" value={users.find(u => u.matricula === scrap.sentBy)?.name || scrap.sentBy || '-'} />
                            </div>
                        </div>
                    )}

                    {/* Bloco 1: Contexto Operacional */}
                    <div className="bg-slate-50/50 dark:bg-zinc-950/50 p-4 rounded-xl border border-slate-200/50 dark:border-zinc-800/50">
                        <h4 className="text-xs font-bold text-blue-500 uppercase mb-3 flex items-center gap-2">
                            <LayoutDashboard size={14} /> Contexto Operacional
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <DetailItem label="Data" value={formatDateDisplay(scrap.date)} />
                            <DetailItem label="Semana" value={scrap.week} />
                            <DetailItem label="Líder" value={scrap.leaderName} />
                            <DetailItem label="Linha" value={scrap.line} />
                            <DetailItem label="Turno" value={scrap.shift} />
                        </div>
                    </div>

                    {/* Bloco 2: Produto & Material */}
                    <div className="bg-slate-50/50 dark:bg-zinc-950/50 p-4 rounded-xl border border-slate-200/50 dark:border-zinc-800/50">
                        <h4 className="text-xs font-bold text-purple-500 uppercase mb-3 flex items-center gap-2">
                            <Settings size={14} /> Dados do Material
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <DetailItem label="Modelo (Produto)" value={scrap.model} />
                            <DetailItem label="Cód. Matéria Prima" value={scrap.code || '-'} />
                            <div className="md:col-span-2">
                                <DetailItem label="Descrição" value={scrap.description || '-'} />
                            </div>
                            <DetailItem label="Modelo Usado" value={scrap.usedModel || '-'} />
                            <div className="md:col-span-3">
                                <DetailItem label="QR Code" value={scrap.qrCode || '-'} breakAll />
                            </div>
                        </div>
                    </div>

                    {/* Bloco 3: Defeito & Custos */}
                    <div className="bg-slate-50/50 dark:bg-zinc-950/50 p-4 rounded-xl border border-slate-200/50 dark:border-zinc-800/50">
                        <h4 className="text-xs font-bold text-red-500 uppercase mb-3 flex items-center gap-2">
                            <BarChart3 size={14} /> Quantidades e Custos
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                            <DetailItem label="Quantidade" value={scrap.qty} className="text-lg font-bold" />
                            <DetailItem label="Item / Categoria" value={scrap.item} />
                            <DetailItem label="Valor Unitário" value={formatCurrency(scrap.unitValue)} />
                            <div className="bg-white dark:bg-zinc-900 p-2.5 rounded border border-slate-100 dark:border-zinc-800 shadow-sm border-l-4 border-l-red-500">
                                <label className="block text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase mb-1 tracking-wider">Valor Total</label>
                                <div className="text-xl font-bold text-red-600 dark:text-red-400 truncate">{formatCurrency(scrap.totalValue)}</div>
                            </div>
                        </div>
                    </div>

                    {/* Bloco 4: Rastreabilidade */}
                    <div className="bg-slate-50/50 dark:bg-zinc-950/50 p-4 rounded-xl border border-slate-200/50 dark:border-zinc-800/50">
                        <h4 className="text-xs font-bold text-orange-500 uppercase mb-3 flex items-center gap-2">
                            <Shield size={14} /> Rastreabilidade
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <DetailItem label="Causa Raiz" value={scrap.rootCause || '-'} />
                            <DetailItem label="Estação / Posto" value={scrap.station || '-'} />
                            <DetailItem label="Responsável da Falha" value={scrap.responsible || '-'} />
                        </div>
                    </div>

                    {/* Bloco 5: Autoria e Justificativas */}
                    <div className="space-y-4 pt-2">
                        <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded border border-blue-100 dark:border-blue-900/30 flex items-center justify-between">
                            <div className="flex gap-3 items-center">
                                <span className="bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200 text-xs font-bold px-2 py-0.5 rounded uppercase">Registrado Por</span>
                                <span className="text-sm font-bold text-slate-900 dark:text-zinc-100">{registeredBy}</span>
                            </div>
                            <span className="text-xs font-mono text-slate-500">{scrap.time}</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-zinc-500 mb-2 uppercase"><FileText size={14} /> Motivo Detalhado</label>
                                <div className="bg-slate-100 dark:bg-zinc-950 p-4 rounded-lg border border-slate-200 dark:border-zinc-800 text-sm min-h-[100px] text-slate-700 dark:text-zinc-300 leading-relaxed shadow-inner">
                                    {scrap.reason || <span className="italic text-slate-400">Não informado.</span>}
                                </div>
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-xs font-bold text-yellow-600 dark:text-yellow-500 mb-2 uppercase"><AlertTriangle size={14} /> Ação Imediata</label>
                                <div className="bg-yellow-50 dark:bg-yellow-900/10 p-4 rounded-lg border border-yellow-200 dark:border-yellow-900/30 text-sm min-h-[100px] text-slate-800 dark:text-zinc-200 leading-relaxed shadow-inner">
                                    {scrap.immediateAction || <span className="italic text-slate-400">Não informado.</span>}
                                </div>
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-xs font-bold text-green-600 dark:text-green-500 mb-2 uppercase"><CheckCircle2 size={14} /> Contra Medida</label>
                                <div className={`p-4 rounded-lg border text-sm min-h-[100px] shadow-inner leading-relaxed ${scrap.countermeasure ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30 text-slate-800 dark:text-zinc-200' : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-400 italic'}`}>
                                    {scrap.countermeasure || 'Nenhuma contra medida registrada.'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-zinc-800 text-center">
                    <Button variant="ghost" onClick={onClose} className="text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200">
                        Fechar Visualização
                    </Button>
                </div>
            </Card >
        </div >
    );
};

// Helper component for uniform items
export const DetailItem = ({ label, value, className = "", breakAll = false }: any) => (
    <div className="bg-white dark:bg-zinc-900 p-2.5 rounded border border-slate-100 dark:border-zinc-800 shadow-sm transition-all hover:border-blue-200 dark:hover:border-blue-800/50">
        <label className="block text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase mb-1 tracking-wider">{label}</label>
        <div className={`text-sm text-slate-700 dark:text-zinc-300 font-medium ${breakAll ? 'break-all whitespace-normal' : 'truncate'} ${className}`}>{value}</div>
    </div>
);

const ScrapEditDelete = ({ scraps, users, lines, models, onUpdate, categories, statusOptions, rootCauseOptions, materials, stations, currentUser }: any) => {
    const [filters, setFilters] = useState({
        leader: '',
        line: '',
        model: '',
        item: '',
        qrCode: '',
        period: 'MONTH', // DAY, WEEK, MONTH, YEAR, ALL
        specificDate: '',
        specificWeek: '',
        specificMonth: '',
        specificYear: ''
    });
    const isAndroid = /Android/i.test(navigator.userAgent);
    const [showQRCamera, setShowQRCamera] = useState(false);

    const [editingScrap, setEditingScrap] = useState<ScrapData | null>(null);

    const filterScraps = useMemo(() => {
        let res = [...scraps];
        if (filters.leader) res = res.filter((s: ScrapData) => s.leaderName === filters.leader);
        if (filters.line) res = res.filter((s: ScrapData) => s.line === filters.line);
        if (filters.model) res = res.filter((s: ScrapData) => s.model === filters.model);
        if (filters.item) res = res.filter((s: ScrapData) => (s.item || '').toUpperCase() === filters.item.toUpperCase());
        if (filters.qrCode) res = res.filter((s: ScrapData) => (s.qrCode || '').toUpperCase().includes(filters.qrCode.toUpperCase()));

        const now = new Date();
        const d = new Date(now);

        if (filters.period !== 'ALL') {
            if (filters.period === 'DAY' && filters.specificDate) {
                res = res.filter((s: ScrapData) => s.date === filters.specificDate);
            }
            else if (filters.period === 'WEEK' && filters.specificWeek) {
                const [y, w] = filters.specificWeek.split('-W').map(Number);
                res = res.filter((s: ScrapData) => {
                    const sd = new Date(s.date);
                    const utcDate = new Date(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate());
                    const sw = getWeekNumber(utcDate);
                    return sw === w && sd.getFullYear() === y;
                });
            }
            else if (filters.period === 'MONTH' && filters.specificMonth) {
                res = res.filter((s: ScrapData) => s.date.startsWith(filters.specificMonth));
            }
            else if (filters.period === 'YEAR' && filters.specificYear) {
                res = res.filter((s: ScrapData) => s.date.startsWith(filters.specificYear));
            }
            else if (filters.period === 'MONTH' && !filters.specificMonth) {
                const m = (d.getMonth() + 1).toString().padStart(2, '0');
                const y = d.getFullYear();
                res = res.filter((s: ScrapData) => s.date.startsWith(`${y}-${m}`));
            }
        }
        return res;
    }, [scraps, filters]);

    const handleDelete = async (id: string) => {
        if (window.confirm("Tem certeza que deseja EXCLUIR este registro? Esta ação não pode ser desfeita.")) {
            try {
                await deleteScrap(id);
                onUpdate();
                alert("Registro excluído com sucesso.");
            } catch (e) {
                alert("Erro ao excluir registro.");
            }
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <select className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" onChange={e => setFilters({ ...filters, leader: e.target.value })} value={filters.leader}>
                        <option value="">Todos Líderes</option>
                        {sortUsersByDisplayName(users.filter((u: User) => isLeadershipRole(u.role))).map((u: User) => <option key={u.matricula} value={u.name}>{u.name}</option>)}
                    </select>
                    <select className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" onChange={e => setFilters({ ...filters, line: e.target.value })} value={filters.line}>
                        <option value="">Todas Linhas</option>
                        {lines.map((l: string) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <select className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" onChange={e => setFilters({ ...filters, model: e.target.value })} value={filters.model}>
                        <option value="">Todos Modelos</option>
                        {models.map((m: string) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" onChange={e => setFilters({ ...filters, item: e.target.value })} value={filters.item}>
                        <option value="">Todos Itens</option>
                        {Array.from(new Set(filterScraps.map((s: ScrapData) => s.item).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b))).map((item: string) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <div className="flex gap-1 items-end">
                        <Input label="" placeholder="QR Code" value={filters.qrCode} onChange={e => setFilters({ ...filters, qrCode: e.target.value })} onKeyDown={e => e.key === 'Enter' && setFilters({ ...filters, qrCode: e.currentTarget.value })} className="text-sm flex-1" />
                        {isAndroid && <Button size="sm" onClick={() => { setShowQRCamera(true); }} className="flex-shrink-0" title="Câmera"><QrCode size={16} /></Button>}
                    </div>
                    {showQRCamera && <QRStreamReader onScanSuccess={(text) => { setShowQRCamera(false); setFilters({ ...filters, qrCode: text }); }} onClose={() => setShowQRCamera(false)} />}
                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        <select className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none w-full md:w-auto" onChange={e => setFilters({ ...filters, period: e.target.value })} value={filters.period}>
                            <option value="ALL">Todo Período</option>
                            <option value="DAY">Dia</option>
                            <option value="WEEK">Semana</option>
                            <option value="MONTH">Mês</option>
                            <option value="YEAR">Ano</option>
                        </select>
                        {filters.period === 'DAY' && <Input type="date" value={filters.specificDate} onChange={e => setFilters({ ...filters, specificDate: e.target.value })} className="w-full md:w-auto" />}
                        {filters.period === 'WEEK' && <Input type="week" value={filters.specificWeek} onChange={e => setFilters({ ...filters, specificWeek: e.target.value })} className="w-full md:w-auto" />}
                        {filters.period === 'MONTH' && <Input type="month" value={filters.specificMonth} onChange={e => setFilters({ ...filters, specificMonth: e.target.value })} className="w-full md:w-auto" />}
                        {filters.period === 'YEAR' && <Input type="number" placeholder="2026" value={filters.specificYear} onChange={e => setFilters({ ...filters, specificYear: e.target.value })} className="w-full md:w-24" />}
                    </div>
                </div>
            </Card>

            <div className="w-full overflow-x-auto bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm">
                <table className="w-full text-sm min-w-[900px]">
                    <thead className="bg-red-50 dark:bg-red-900/10 text-slate-500 dark:text-zinc-400 border-b border-red-100 dark:border-red-900/20">
                        <tr>
                            <th className="p-3 text-left">Data</th>
                            <th className="p-3 text-left">Líder</th>
                            <th className="p-3 text-left">Modelo</th>
                            <th className="p-3 text-left">Linha</th>
                            <th className="p-3 text-left">Item</th>
                            <th className="p-3 text-right">Valor</th>
                            <th className="p-3 text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                        {filterScraps.map((s: ScrapData) => (
                            <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                                <td className="p-3 text-slate-700 dark:text-zinc-300">{formatDateDisplay(s.date)}</td>
                                <td className="p-3 text-slate-700 dark:text-zinc-300">{s.leaderName}</td>
                                <td className="p-3 text-slate-700 dark:text-zinc-300">{s.model}</td>
                                <td className="p-3 text-slate-700 dark:text-zinc-300">{s.line}</td>
                                <td className="p-3 text-slate-700 dark:text-zinc-300">{s.item}</td>
                                <td className="p-3 text-right font-mono text-slate-700 dark:text-zinc-300">{formatCurrency(s.totalValue)}</td>
                                <td className="p-3 flex justify-center gap-2">
                                    <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-800 hover:bg-blue-100" onClick={() => setEditingScrap(s)}>
                                        <FileText size={16} />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-800 hover:bg-red-100" onClick={() => handleDelete(String(s.id))}>
                                        <Trash2 size={16} />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editingScrap && (
                <ScrapEditModal
                    scrap={editingScrap}
                    users={users}
                    lines={lines}
                    models={models}
                    categories={categories}
                    statusOptions={statusOptions}
                    rootCauseOptions={rootCauseOptions}
                    materials={materials}
                    stations={stations}
                    currentUser={currentUser}
                    onClose={() => setEditingScrap(null)}
                    onSave={async () => {
                        await onUpdate();
                        setEditingScrap(null);
                    }}
                />
            )}
        </div>
    );
};

const ScrapEditModal = ({ scrap, users, lines, models, categories, statusOptions, rootCauseOptions, materials, stations, currentUser, onClose, onSave, readOnlyMode = false }: any) => {
    const [formData, setFormData] = useState<Partial<ScrapData>>({ ...scrap });
    const isAndroid = /Android/i.test(navigator.userAgent);
    const [showQRReader, setShowQRReader] = useState(false);

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

    const handleQRScanSuccess = (text: string) => {
        setShowQRReader(false);
        const parsed = parseQRData(text);
        setFormData((prev: any) => ({ ...prev, qrCode: text }));
        if (text) {
            handleCodeChange(parsed.material);
        }
    };

    // 1. Auto-Calculate Week from Date
    useEffect(() => {
        if (formData.date) {
            const d = new Date(formData.date);
            const utcDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
            setFormData(prev => ({ ...prev, week: getWeekNumber(utcDate) }));
        }
    }, [formData.date]);

    // 2. Auto-Calculate Total
    useEffect(() => {
        const total = (formData.qty || 0) * (formData.unitValue || 0);
        const totalRounded = safeRound(total);
        setFormData(prev => ({ ...prev, totalValue: totalRounded }));
    }, [formData.qty, formData.unitValue]);

    // 3. Handle Code Change (Material)
    const handleCodeChange = (code: string) => {
        const found = materials.find((m: Material) => m.code === code);
        setFormData(prev => ({
            ...prev,
            code,
            description: found ? found.description : '',
            unitValue: found ? found.price : 0, // Keep number
            usedModel: found ? found.model : prev.usedModel
        }));
    };

    // 4. Handle Leader Change (Auto-Shift)
    const handleLeaderChange = (leaderName: string) => {
        const found = users.find((u: User) => u.name === leaderName);
        setFormData(prev => ({
            ...prev,
            leaderName,
            shift: found?.shift || '1' // Auto-fill shift
        }));
    };

    const handleSave = async () => {
        if (!scrap.id) return;
        try {
            // Inject new author (editor) into payload
            const payload = {
                ...formData,
                userId: currentUser.matricula // Force update author
            };

            await updateScrap(String(scrap.id), payload);
            alert("Scrap atualizado com sucesso!");
            onSave();
        } catch (e) {
            alert("Erro ao atualizar.");
        }
    };

    const pqcUsers = users.filter((u: User) => (u.role || '').toUpperCase().includes('PQC'));

    // Replicate ScrapForm Layout
    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <Card className="max-w-6xl w-full max-h-[90vh] overflow-y-auto bg-white/50 dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800 shadow-sm backdrop-blur-xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-xl flex items-center gap-2">
                        <FileText className={readOnlyMode ? 'text-yellow-500' : 'text-blue-500'} />
                        {readOnlyMode ? 'Tratar Scrap (Líder)' : 'Editar Scrap Completo'}
                    </h3>
                    <button onClick={onClose}><X size={24} /></button>
                </div>

                {/* Banner: Registrado Por */}
                {(() => {
                    const registeredBy = users.find((u: User) => u.matricula === scrap.userId)?.name || scrap.userId || '-';
                    return (
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-4 py-2">
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-xs font-bold uppercase text-slate-400 dark:text-zinc-500">Registrado por</span>
                                <span className="font-bold text-slate-800 dark:text-zinc-100">{registeredBy}</span>
                            </div>
                            <span className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                                {formatDateDisplay(scrap.date)} {scrap.time ? `às ${scrap.time}` : ''}
                            </span>
                        </div>
                    );
                })()}

                {readOnlyMode && (
                    <div className="mb-4 flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/40 rounded-lg px-4 py-2 text-sm text-yellow-800 dark:text-yellow-300">
                        <AlertTriangle size={16} className="shrink-0" />
                        Campos bloqueados. Preencha apenas: <strong className="ml-1">Responsável, Motivo, Ação Imediata e Contramedida.</strong>
                    </div>
                )}

                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Input type="date" label="Data" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} disabled={readOnlyMode} className={readOnlyMode ? 'opacity-50' : ''} />
                        <Input label="Semana" value={formData.week} readOnly className="opacity-50" />
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5 uppercase">Líder</label>
                            <select
                                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-gray-900 dark:text-zinc-100 transition-colors disabled:opacity-50"
                                value={formData.leaderName || ''}
                                onChange={e => handleLeaderChange(e.target.value)}
                                disabled={readOnlyMode}
                            >
                                <option value="" disabled>Selecione...</option>
                                {sortUsersByDisplayName(users.filter((u: User) => isLeadershipRole(u.role))).map((u: User) => (
                                    <option key={u.matricula} value={u.name}>{u.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Linha</label>
                            <select
                                className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100 disabled:opacity-50"
                                value={formData.line || ''}
                                onChange={e => setFormData({ ...formData, line: e.target.value })}
                                disabled={readOnlyMode}
                            >
                                <option value="" disabled>Selecione...</option>
                                {lines.map((l: string) => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">PQC</label>
                            <select
                                className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100 disabled:opacity-50"
                                value={formData.pqc || ''}
                                onChange={e => setFormData({ ...formData, pqc: e.target.value })}
                                disabled={readOnlyMode}
                            >
                                <option value="" disabled>Selecione...</option>
                                {pqcUsers.map((u: User) => <option key={u.matricula} value={u.name}>{u.name}</option>)}
                            </select>
                        </div>
                        <Input label="Turno" value={formData.shift} onChange={e => setFormData({ ...formData, shift: e.target.value })} disabled={readOnlyMode} className={readOnlyMode ? 'opacity-50' : ''} />
                        <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Modelo</label>
                            <select
                                className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100 disabled:opacity-50"
                                value={formData.model || ''}
                                onChange={e => setFormData({ ...formData, model: e.target.value })}
                                disabled={readOnlyMode}
                            >
                                <option value="" disabled>Selecione...</option>
                                {models.map((m: string) => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </div>

                    <hr className="border-slate-200 dark:border-zinc-800" />

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs uppercase mb-1.5 font-bold text-blue-600 dark:text-blue-400">Leia o QR da label do desmonte *</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    className="w-full bg-blue-50/50 dark:bg-blue-900/10 border-2 border-blue-400/50 dark:border-blue-500/50 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-900 dark:text-zinc-100 transition-all placeholder-blue-300 dark:placeholder-blue-700 disabled:opacity-50"
                                    value={formData.qrCode || ''}
                                    onChange={(e) => setFormData((prev: any) => ({ ...prev, qrCode: e.target.value }))}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const qr = formData.qrCode || '';
                                            if (qr) {
                                                const parsed = parseQRData(qr);
                                                handleCodeChange(parsed.material);
                                            }
                                        }
                                    }}
                                    placeholder="Bipe o código..."
                                    disabled={readOnlyMode}
                                />
                                {isAndroid && !readOnlyMode && (
                                    <button type="button" onClick={() => setShowQRReader(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg flex items-center justify-center transition-colors shadow flex-shrink-0" title="Ler com a câmera">
                                        <QrCode size={20} />
                                    </button>
                                )}
                            </div>
                            {showQRReader && (
                                <QRStreamReader onScanSuccess={handleQRScanSuccess} onClose={() => setShowQRReader(false)} />
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase">Cód. Matéria Prima</label>
                            <div className="relative">
                                <input
                                    list="material-codes-edit"
                                    className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-gray-900 dark:text-zinc-100 transition-colors disabled:opacity-50"
                                    value={formData.code || ''}
                                    onChange={e => handleCodeChange(e.target.value)}
                                    placeholder="Digite o código..."
                                    disabled={readOnlyMode}
                                />
                                <datalist id="material-codes-edit">
                                    {materials.map((m: Material) => <option key={m.code} value={m.code}>{m.description}</option>)}
                                </datalist>
                            </div>
                        </div>
                        <Input label="Modelo Usado" value={formData.usedModel} readOnly className="opacity-50" />
                        <div className="lg:col-span-2">
                            <Input label="Descrição do Material" value={formData.description} readOnly className="opacity-50" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Input type="number" label="Quantidade" value={formData.qty} onChange={e => setFormData({ ...formData, qty: Number(e.target.value) })} disabled={readOnlyMode} className={readOnlyMode ? 'opacity-50' : ''} />
                        <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Item (Categoria)</label>
                            <input
                                list="items-list-edit"
                                className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100 disabled:opacity-50"
                                value={formData.item || ''}
                                onChange={e => setFormData({ ...formData, item: e.target.value })}
                                placeholder="Selecione..."
                                disabled={readOnlyMode}
                            />
                            <datalist id="items-list-edit">
                                {categories.map((i: string) => <option key={i} value={i} />)}
                            </datalist>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Status</label>
                            <input
                                list="status-list-edit"
                                className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100 disabled:opacity-50"
                                value={formData.status || ''}
                                onChange={e => setFormData({ ...formData, status: e.target.value })}
                                placeholder="Selecione..."
                                disabled={readOnlyMode}
                            />
                            <datalist id="status-list-edit">
                                {statusOptions.map((i: string) => <option key={i} value={i} />)}
                            </datalist>
                        </div>
                        <Input label="Valor UN" value={formatCurrency(formData.unitValue)} readOnly className="opacity-50" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl border border-red-200 dark:border-red-900/30 flex flex-col justify-center">
                            <label className="text-xs font-bold text-red-600 dark:text-red-400 uppercase">Valor Total</label>
                            <span className="text-2xl font-bold text-red-600 dark:text-red-500">{formatCurrency(formData.totalValue)}</span>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Causa Raiz</label>
                            <select
                                className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100 disabled:opacity-50"
                                value={formData.rootCause || ''}
                                onChange={e => setFormData({ ...formData, rootCause: e.target.value })}
                                disabled={readOnlyMode}
                            >
                                <option value="" disabled>Selecione...</option>
                                {rootCauseOptions.map((c: string) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">Estação</label>
                            <select
                                className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100 disabled:opacity-50"
                                value={formData.station || ''}
                                onChange={e => setFormData({ ...formData, station: e.target.value })}
                                disabled={readOnlyMode}
                            >
                                <option value="" disabled>Selecione...</option>
                                {stations.map((c: string) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Responsável */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Input
                            label="Responsável pela Falha"
                            value={formData.responsible}
                            onChange={e => setFormData({ ...formData, responsible: e.target.value })}
                            placeholder="Nome do responsável..."
                        />
                    </div>

                    {/* Motivo | Ação Imediata | Contramedida — idêntico ao ScrapForm */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5 uppercase">Motivo Detalhado</label>
                            <textarea
                                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-600 min-h-[100px] text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 transition-colors"
                                value={formData.reason || ''}
                                onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                placeholder="Descreva o motivo..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-yellow-600 dark:text-yellow-400 mb-1.5 uppercase">Ação Imediata</label>
                            <textarea
                                className="w-full bg-yellow-50 dark:bg-yellow-900/10 border-2 border-yellow-300 dark:border-yellow-700/50 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-yellow-500 min-h-[100px] text-gray-900 dark:text-zinc-100 placeholder-yellow-400 dark:placeholder-yellow-700 transition-colors"
                                value={formData.immediateAction || ''}
                                onChange={e => setFormData({ ...formData, immediateAction: e.target.value })}
                                placeholder="Ação imediata tomada..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-green-700 dark:text-green-400 mb-1.5 uppercase">Contra Medida</label>
                            <textarea
                                className="w-full bg-slate-50 dark:bg-zinc-950 border-2 border-green-200 dark:border-green-900/50 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-green-500 min-h-[100px] text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 transition-colors"
                                value={formData.countermeasure || ''}
                                onChange={e => setFormData({ ...formData, countermeasure: e.target.value })}
                                placeholder="Descreva a ação tomada..."
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <Button onClick={handleSave} size="lg" className="w-full md:w-auto">
                            <Save size={18} /> Salvar Alterações
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};

const NewAdvancedDashboard = ({ scraps, users, isLoading = false, isHydrating = false }: { scraps: ScrapData[], users: User[], isLoading?: boolean, isHydrating?: boolean }) => {
    const [filters, setFilters] = useState({
        period: 'MONTH',
        plant: 'ALL',
        shift: 'ALL',
        model: 'ALL',
        leader: 'ALL',
        specificDate: '',
        specificWeek: '',
        specificMonth: new Date().toISOString().slice(0, 7),
        specificYear: '',
        qrCode: ''
    });
    const [showQRCamera, setShowQRCamera] = useState(false);
    const [groupPreviewModal, setGroupPreviewModal] = useState<{ isOpen: boolean; type: 'category' | 'model' | 'line'; key: string; scraps: ScrapData[] }>({ isOpen: false, type: 'category', key: '', scraps: [] });
    const [detailModal, setDetailModal] = useState<{ isOpen: boolean; scrap: ScrapData | null }>({ isOpen: false, scrap: null });
    const reactiveScraps = useMemo(() => normalizeScrapCollection(Array.isArray(scraps) ? scraps : []), [scraps]);
    const safeUsers = useMemo(() => Array.isArray(users) ? users : [], [users]);

    const availableModels = useMemo(() => {
        let modelsSource = [...reactiveScraps];
        if (filters.leader !== 'ALL') {
            modelsSource = modelsSource.filter(s => s.leaderName === filters.leader);
        }
        const uniqueModels = Array.from(new Set(modelsSource.map(s => s.model).filter(Boolean)));
        return uniqueModels.sort((a, b) => String(a).localeCompare(String(b)));
    }, [reactiveScraps, filters.leader]);

    const filtered = useMemo(() => {
        let res = [...reactiveScraps];

        if (filters.period === 'DAY' && filters.specificDate) {
            res = res.filter(s => normalizeScrapDateKey(s.date) === filters.specificDate);
        }
        else if (filters.period === 'WEEK' && filters.specificWeek) {
            const [y, w] = filters.specificWeek.split('-W').map(Number);
            res = res.filter(s => {
                const sd = parseScrapDate(s.date);
                if (!sd) return false;
                const normalizedDate = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
                return getWeekNumber(normalizedDate) === w && sd.getFullYear() === y;
            });
        }
        else if (filters.period === 'MONTH' && filters.specificMonth) {
            res = res.filter(s => normalizeScrapDateKey(s.date).startsWith(filters.specificMonth));
        }
        else if (filters.period === 'YEAR' && filters.specificYear) {
            res = res.filter(s => normalizeScrapDateKey(s.date).startsWith(filters.specificYear));
        }

        if (filters.plant !== 'ALL') res = res.filter(s => s.plant === filters.plant);
        if (filters.shift !== 'ALL') res = res.filter(s => String(s.shift ?? '') === filters.shift);
        if (filters.leader !== 'ALL') res = res.filter(s => s.leaderName === filters.leader);
        if (filters.model !== 'ALL') res = res.filter(s => s.model === filters.model);

        return res;
    }, [reactiveScraps, filters]);

    const stats = useMemo(() => {
        const totalVal = filtered.reduce((acc, s) => acc + normalizeScrapNumber(s.totalValue), 0);
        const totalQty = filtered.reduce((acc, s) => acc + normalizeScrapNumber(s.qty), 0);

        const specificItems = ['FRONT', 'REAR', 'OCTA', 'CAMERA', 'BATERIA RMA', 'BATERIA SCRAP', 'PLACA'];
        const byCategory: Record<string, number> = {};
        const byModel: Record<string, number> = {};
        const byLine: Record<string, number> = {};

        specificItems.forEach(k => byCategory[k] = 0);
        byCategory['MIUDEZAS'] = 0;

        filtered.forEach(s => {
            const val = normalizeScrapNumber(s.totalValue);
            const itemUpper = String(s.item || '').toUpperCase();

            let catKey = 'MIUDEZAS';
            if (itemUpper.includes('PLACA')) {
                catKey = 'PLACA';
            } else if (itemUpper.includes('CAMERA')) {
                catKey = 'CAMERA';
            } else {
                const found = specificItems.find(i => itemUpper.includes(i) && i !== 'CAMERA' && i !== 'PLACA');
                if (found) catKey = found;
            }

            const modelKey = s.model || 'Não informado';
            const lineKey = s.line || 'Não informada';
            byCategory[catKey] = (byCategory[catKey] || 0) + val;
            byModel[modelKey] = (byModel[modelKey] || 0) + val;
            byLine[lineKey] = (byLine[lineKey] || 0) + val;
        });

        return {
            totalVal,
            totalQty,
            category: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
            model: Object.entries(byModel).sort((a, b) => b[1] - a[1]).slice(0, 10),
            line: Object.entries(byLine).sort((a, b) => b[1] - a[1])
        };
    }, [filtered]);

    if ((isLoading || isHydrating) && reactiveScraps.length === 0) {
        return <LoadingSpinner label="Sincronizando gestão avançada..." />;
    }

    const openGroupPreview = (type: 'category' | 'model' | 'line', key: string) => {
        let groupScraps: ScrapData[] = [];
        if (type === 'category') {
            const specificItems = ['FRONT', 'REAR', 'OCTA', 'CAMERA', 'BATERIA RMA', 'BATERIA SCRAP', 'PLACA'];
            groupScraps = filtered.filter(s => {
                const itemUpper = (s.item || '').toUpperCase();
                if (key === 'MIUDEZAS') {
                    return !specificItems.some(i => itemUpper.includes(i));
                } else {
                    return itemUpper.includes(key);
                }
            });
        } else if (type === 'model') {
            groupScraps = filtered.filter(s => s.model === key);
        } else if (type === 'line') {
            groupScraps = filtered.filter(s => s.line === key);
        }
        setGroupPreviewModal({ isOpen: true, type, key, scraps: groupScraps });
    };

    const openDetailModal = (scrap: ScrapData) => {
        setDetailModal({ isOpen: true, scrap });
    };

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <h3 className="font-bold text-lg">Dashboard Geral</h3>
                    <div className="flex flex-wrap gap-2 items-center">
                        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                            <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none w-full md:w-auto" onChange={e => setFilters({ ...filters, period: e.target.value })} value={filters.period}>
                                <option value="ALL">Todo Período</option>
                                <option value="DAY">Dia</option>
                                <option value="WEEK">Semana</option>
                                <option value="MONTH">Mês</option>
                                <option value="YEAR">Ano</option>
                            </select>
                            {filters.period === 'DAY' && <Input type="date" value={filters.specificDate} onChange={e => setFilters({ ...filters, specificDate: e.target.value })} className="w-full md:w-auto" />}
                            {filters.period === 'WEEK' && <Input type="week" value={filters.specificWeek} onChange={e => setFilters({ ...filters, specificWeek: e.target.value })} className="w-full md:w-auto" />}
                            {filters.period === 'MONTH' && <Input type="month" value={filters.specificMonth} onChange={e => setFilters({ ...filters, specificMonth: e.target.value })} className="w-full md:w-auto" />}
                            {filters.period === 'YEAR' && <Input type="number" placeholder="2026" value={filters.specificYear} onChange={e => setFilters({ ...filters, specificYear: e.target.value })} className="w-full md:w-24" />}
                        </div>

                        <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" value={filters.leader} onChange={e => setFilters({ ...filters, leader: e.target.value })}>
                            <option value="ALL">Todos os Líderes</option>
                            {sortUsersByDisplayName(safeUsers.filter((u: User) => isLeadershipRole(u.role))).map((u: User) => (
                                <option key={u.matricula} value={u.name}>{u.name}</option>
                            ))}
                        </select>

                        <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" value={filters.plant} onChange={e => setFilters({ ...filters, plant: e.target.value })}>
                            <option value="ALL">Todas Plantas</option>
                            <option value="P81L">P81L</option>
                            <option value="P81M">P81M</option>
                            <option value="P81N">P81N</option>
                        </select>
                        <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" value={filters.shift} onChange={e => setFilters({ ...filters, shift: e.target.value })}>
                            <option value="ALL">Todos Turnos</option>
                            <option value="1">1º Turno</option>
                            <option value="2">2º Turno</option>
                        </select>
                        <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" value={filters.model} onChange={e => setFilters({ ...filters, model: e.target.value })}>
                            <option value="ALL">Todos os Modelos</option>
                            {availableModels.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>

                        <Button onClick={() => exportExecutiveReport(filtered)} className="bg-green-600 hover:bg-green-700 text-white ml-2">
                            <Download size={18} /> Excel (Filtrado)
                        </Button>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-blue-900 border-blue-800">
                    <p className="text-blue-100 text-xs font-bold uppercase">Valor Total (Filtrado)</p>
                    <p className="text-3xl font-bold mt-1 text-white">{formatCurrency(stats.totalVal)}</p>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                    <p className="text-slate-300 text-xs font-bold uppercase">Quantidade (Filtrado)</p>
                    <p className="text-3xl font-bold mt-1 text-white">{stats.totalQty} <span className="text-base font-normal text-slate-400">itens</span></p>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><LayoutDashboard size={16} className="text-purple-500" /> Por Categoria</h3>
                    <div className="space-y-3">
                        {stats.category.map(([name, val]) => (
                            <div key={name} className="flex justify-between items-center text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-800 p-2 rounded transition-colors" onClick={() => openGroupPreview('category', name)}>
                                <span className={val > 0 ? 'text-slate-900 dark:text-zinc-100' : 'text-slate-400 dark:text-zinc-600'}>{name}</span>
                                <span className="font-bold text-slate-800 dark:text-zinc-200">{formatCurrency(val)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Truck size={16} className="text-blue-500" /> Top Modelos</h3>
                    <div className="space-y-3">
                        {stats.model.map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-800 p-2 rounded transition-colors" onClick={() => openGroupPreview('model', name)}>
                                <span className="text-slate-900 dark:text-zinc-100 whitespace-normal break-words w-2/3">{i + 1}. {name}</span>
                                <span className="font-bold text-blue-600 dark:text-blue-400">{formatCurrency(val)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Filter size={16} className="text-green-500" /> Por Linha</h3>
                    <div className="space-y-3">
                        {stats.line.map(([name, val]) => (
                            <div key={name} className="flex justify-between items-center text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-zinc-800 p-2 rounded transition-colors" onClick={() => openGroupPreview('line', name)}>
                                <span className="text-slate-900 dark:text-zinc-100">{name}</span>
                                <span className="font-bold text-green-600 dark:text-green-400">{formatCurrency(val)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
            {showQRCamera && <QRStreamReader onScanSuccess={(text) => { setShowQRCamera(false); setFilters({ ...filters, qrCode: text }); }} onClose={() => setShowQRCamera(false)} />}

            {/* Group Preview Modal */}
            {groupPreviewModal.isOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <Card className="max-w-6xl w-full bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl">
                        <div className="flex justify-between items-start mb-6 border-b border-slate-100 dark:border-zinc-800 pb-4">
                            <div>
                                <h3 className="font-bold text-xl text-slate-900 dark:text-white">Preview do SCRAP</h3>
                                <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">
                                    {groupPreviewModal.type === 'category' ? 'Categoria' : groupPreviewModal.type === 'model' ? 'Modelo' : 'Linha'}: {groupPreviewModal.key}
                                </p>
                            </div>
                            <button onClick={() => setGroupPreviewModal({ ...groupPreviewModal, isOpen: false })} className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                                <X size={24} className="text-slate-500 dark:text-zinc-400" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {groupPreviewModal.scraps.map((scrap) => (
                                <div key={scrap.id} className="border border-slate-200 dark:border-zinc-700 rounded-lg p-4 hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer transition-colors" onClick={() => openDetailModal(scrap)}>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                                        <div>
                                            <span className="font-semibold text-slate-600 dark:text-zinc-400">ID:</span> {scrap.id}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-slate-600 dark:text-zinc-400">Data:</span> {formatDateDisplay(scrap.date)}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-slate-600 dark:text-zinc-400">Item:</span> {scrap.item}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-slate-600 dark:text-zinc-400">Valor:</span> {formatCurrency(scrap.totalValue)}
                                        </div>
                                        <div className="md:col-span-2">
                                            <span className="font-semibold text-slate-600 dark:text-zinc-400">Descrição:</span> {scrap.description || '-'}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-slate-600 dark:text-zinc-400">Linha:</span> {scrap.line}
                                        </div>
                                        <div>
                                            <span className="font-semibold text-slate-600 dark:text-zinc-400">Status:</span> {scrap.status}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            )}

            {/* Detail Modal */}
            <ScrapDetailModal
                isOpen={detailModal.isOpen}
                scrap={detailModal.scrap}
                users={users}
                onClose={() => setDetailModal({ isOpen: false, scrap: null })}
            />
        </div>
    );
};

// --- CONSULTA POR QR CODE ---
export const ScrapConsulta = ({ scraps, users }: { scraps: ScrapData[], users: User[] }) => {
    const [qrInput, setQrInput] = useState('');
    const [result, setResult] = useState<ScrapData | null | 'NOT_FOUND'>(null);
    const isAndroid = /Android/i.test(navigator.userAgent);
    const [showQRReader, setShowQRReader] = useState(false);

    const handleSearch = (val?: string) => {
        const q = (val ?? qrInput).trim();
        if (!q) return;
        const found = scraps.find(s => s.qrCode === q || String(s.id) === q);
        setResult(found || 'NOT_FOUND');
    };

    const handleQRScan = (text: string) => {
        setShowQRReader(false);
        setQrInput(text);
        handleSearch(text);
    };

    const registeredBy = result && result !== 'NOT_FOUND'
        ? users.find(u => u.matricula === result.userId)?.name || result.userId
        : null;

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <Card className="flex gap-2 items-end">
                <div className="flex-1">
                    <label className="block text-xs uppercase font-bold text-blue-600 dark:text-blue-400 mb-1.5">QR Code / ID do Scrap</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            className="flex-1 bg-blue-50/50 dark:bg-blue-900/10 border-2 border-blue-400/50 dark:border-blue-500/50 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-900 dark:text-zinc-100 transition-all"
                            placeholder="Bipe ou digite o QR Code..."
                            value={qrInput}
                            onChange={e => setQrInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
                            autoFocus
                        />
                        {isAndroid && (
                            <button
                                type="button"
                                onClick={() => setShowQRReader(true)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg flex items-center justify-center transition-colors shadow flex-shrink-0"
                                title="Ler com a câmera"
                            >
                                <QrCode size={20} />
                            </button>
                        )}
                    </div>
                    {showQRReader && (
                        <QRStreamReader onScanSuccess={handleQRScan} onClose={() => setShowQRReader(false)} />
                    )}
                </div>
                <Button onClick={() => handleSearch()}><Search size={16} /> Buscar</Button>
            </Card>

            {result === 'NOT_FOUND' && (
                <Card className="text-center p-10 border-dashed border-red-300 dark:border-red-800">
                    <AlertTriangle className="mx-auto text-red-400 mb-3" size={32} />
                    <p className="font-bold text-red-500">Nenhum scrap encontrado para este QR Code.</p>
                </Card>
            )}

            {result && result !== 'NOT_FOUND' && (
                <Card className="space-y-6 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 shadow-2xl">
                    {/* Header */}
                    <div className="flex justify-between items-start border-b border-slate-100 dark:border-zinc-800 pb-4">
                        <div>
                            <h3 className="font-bold text-xl text-slate-900 dark:text-white">Detalhes do Apontamento</h3>
                            <div className="flex gap-2 mt-1">
                                <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded">ID: {result.id || 'N/A'}</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${!result.countermeasure ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'}`}>
                                    {result.status}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {(result.situation === 'SENT' || result.nfNumber) && (
                            <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-200 dark:border-green-800/50 mb-6">
                                <h4 className="text-xs font-bold text-green-600 dark:text-green-400 uppercase mb-3 flex items-center gap-2">
                                    <CheckCircle2 size={14} /> Dados de Expedição
                                </h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <DetailItem label="Data de Envio" value={formatDateDisplay(result.sentAt)} />
                                    <DetailItem label="Número da NF" value={result.nfNumber || '-'} />
                                    <DetailItem label="Caixa" value={result.boxId ? `#${result.boxId}` : '-'} />
                                    <DetailItem label="Enviado Por" value={users.find(u => u.matricula === result.sentBy)?.name || result.sentBy || '-'} />
                                </div>
                            </div>
                        )}

                        {/* Bloco 1 */}
                        <div className="bg-slate-50/50 dark:bg-zinc-950/50 p-4 rounded-xl border border-slate-200/50 dark:border-zinc-800/50">
                            <h4 className="text-xs font-bold text-blue-500 uppercase mb-3 flex items-center gap-2"><LayoutDashboard size={14} /> Contexto Operacional</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <DetailItem label="Data" value={formatDateDisplay(result.date)} />
                                <DetailItem label="Semana" value={result.week} />
                                <DetailItem label="Líder" value={result.leaderName} />
                                <DetailItem label="Linha" value={result.line} />
                                <DetailItem label="Turno" value={result.shift} />
                            </div>
                        </div>

                        {/* Bloco 2 */}
                        <div className="bg-slate-50/50 dark:bg-zinc-950/50 p-4 rounded-xl border border-slate-200/50 dark:border-zinc-800/50">
                            <h4 className="text-xs font-bold text-purple-500 uppercase mb-3 flex items-center gap-2"><Settings size={14} /> Dados do Material</h4>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <DetailItem label="Modelo (Produto)" value={result.model} />
                                <DetailItem label="Cód. Matéria Prima" value={result.code || '-'} />
                                <div className="md:col-span-2"><DetailItem label="Descrição" value={result.description || '-'} /></div>
                                <DetailItem label="Modelo Usado" value={result.usedModel || '-'} />
                                <div className="md:col-span-3"><DetailItem label="QR Code" value={result.qrCode || '-'} breakAll /></div>
                            </div>
                        </div>

                        {/* Bloco 3 */}
                        <div className="bg-slate-50/50 dark:bg-zinc-950/50 p-4 rounded-xl border border-slate-200/50 dark:border-zinc-800/50">
                            <h4 className="text-xs font-bold text-red-500 uppercase mb-3 flex items-center gap-2"><BarChart3 size={14} /> Quantidades e Custos</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                                <DetailItem label="Quantidade" value={result.qty} className="text-lg font-bold" />
                                <DetailItem label="Item / Categoria" value={result.item} />
                                <DetailItem label="Valor Unitário" value={formatCurrency(result.unitValue)} />
                                <div className="bg-white dark:bg-zinc-900 p-2.5 rounded border border-slate-100 dark:border-zinc-800 shadow-sm border-l-4 border-l-red-500">
                                    <label className="block text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase mb-1 tracking-wider">Valor Total</label>
                                    <div className="text-xl font-bold text-red-600 dark:text-red-400 truncate">{formatCurrency(result.totalValue)}</div>
                                </div>
                            </div>
                        </div>

                        {/* Bloco 4 */}
                        <div className="bg-slate-50/50 dark:bg-zinc-950/50 p-4 rounded-xl border border-slate-200/50 dark:border-zinc-800/50">
                            <h4 className="text-xs font-bold text-orange-500 uppercase mb-3 flex items-center gap-2"><Shield size={14} /> Rastreabilidade</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <DetailItem label="Causa Raiz" value={result.rootCause || '-'} />
                                <DetailItem label="Estação / Posto" value={result.station || '-'} />
                                <DetailItem label="Responsável da Falha" value={result.responsible || '-'} />
                            </div>
                        </div>

                        {/* Bloco 5 */}
                        <div className="space-y-4 pt-2">
                            <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded border border-blue-100 dark:border-blue-900/30 flex items-center justify-between">
                                <div className="flex gap-3 items-center">
                                    <span className="bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200 text-xs font-bold px-2 py-0.5 rounded uppercase">Registrado Por</span>
                                    <span className="text-sm font-bold text-slate-900 dark:text-zinc-100">{registeredBy}</span>
                                </div>
                                <span className="text-xs font-mono text-slate-500">{result.time}</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-zinc-500 mb-2 uppercase"><FileText size={12} /> Motivo Detalhado</label>
                                    <div className="bg-slate-100 dark:bg-zinc-950 p-4 rounded-lg border border-slate-200 dark:border-zinc-800 text-sm min-h-[80px] text-slate-700 dark:text-zinc-300 leading-relaxed">
                                        {result.reason || <span className="italic text-slate-400">Não informado.</span>}
                                    </div>
                                </div>
                                <div>
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-yellow-600 dark:text-yellow-500 mb-2 uppercase"><AlertTriangle size={12} /> Ação Imediata</label>
                                    <div className="bg-yellow-50 dark:bg-yellow-900/10 p-4 rounded-lg border border-yellow-200 dark:border-yellow-900/30 text-sm min-h-[80px] text-slate-800 dark:text-zinc-200 leading-relaxed">
                                        {result.immediateAction || <span className="italic text-slate-400">Não informado.</span>}
                                    </div>
                                </div>
                                <div>
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-green-600 dark:text-green-500 mb-2 uppercase"><CheckCircle2 size={12} /> Contra Medida</label>
                                    <div className={`p-4 rounded-lg border text-sm min-h-[80px] leading-relaxed ${result.countermeasure ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30 text-slate-800 dark:text-zinc-200' : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-400 italic'}`}>
                                        {result.countermeasure || 'Nenhuma contra medida registrada.'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
};
