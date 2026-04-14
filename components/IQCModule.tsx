
import React, { useState, useEffect, useMemo, useTransition, useCallback } from 'react';
import { List, RowComponentProps } from 'react-window';
import { Card } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { User, ScrapData } from '../types';
import {
    LayoutDashboard, CheckSquare, History, BarChart3,
    ArrowLeft, Download, Filter, Truck, FileText, ChevronDown, ChevronUp, FileSpreadsheet, Box, QrCode, X, Eye
} from 'lucide-react';
import {
    getScraps, batchProcessScraps, updateScrap
} from '../services/scrapService';
import { getAllUsers } from '../services/authService';
import { getLines, getModels, getWeekNumber, subscribeToSyncStream } from '../services/storageService';
import { exportEspelhoScrapTemplate, exportExecutiveReport, exportIQCEnvioTemplate } from '../services/excelService';
import { getMaterials } from '../services/materialService';
import { MaterialsManager } from './MaterialsManager';
import { Material } from '../types';

// Import shared components
import { ScrapOperational, ScrapConsulta, ScrapDetailModal } from './ScrapModule';
import { ScrapBoxMount, ScrapBoxIdentified } from './ScrapBoxViews';

const formatCurrency = (val: number | undefined) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
};

const formatDateDisplay = (dateString: string | undefined) => {
    if (!dateString) return '-';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
};

const normalizeMetric = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value.replace(',', '.').trim());
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const normalizeDashboardDateKey = (value: unknown): string => {
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

const parseDashboardDate = (value: unknown): Date | null => {
    const dateKey = normalizeDashboardDateKey(value);
    if (!dateKey) return null;
    const [year, month, day] = dateKey.split('-').map(Number);
    const parsed = new Date(year, (month || 1) - 1, day || 1);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeDashboardScraps = (scraps: ScrapData[] = []): ScrapData[] => {
    if (!Array.isArray(scraps)) return [];

    return scraps
        .filter((scrap) => !!scrap && typeof scrap === 'object')
        .map((scrap) => {
            const safeScrap = (scrap ?? {}) as Partial<ScrapData>;
            return {
                ...safeScrap,
                date: normalizeDashboardDateKey(safeScrap?.date || ''),
                shift: String(safeScrap?.shift ?? '').trim(),
                qty: normalizeMetric(safeScrap?.qty),
                totalValue: normalizeMetric(safeScrap?.totalValue),
                unitValue: normalizeMetric(safeScrap?.unitValue),
                line: String(safeScrap?.line ?? ''),
                model: String(safeScrap?.model ?? ''),
                item: String(safeScrap?.item ?? ''),
                leaderName: String(safeScrap?.leaderName ?? ''),
            } as ScrapData;
        });
};

const resolveDashboardScrapKey = (scrap: Partial<ScrapData> | null | undefined): string => {
    if (scrap?.id !== undefined && scrap?.id !== null && String(scrap.id).trim()) {
        return String(scrap.id);
    }
    return [
        normalizeDashboardDateKey(scrap?.date || ''),
        String(scrap?.code ?? ''),
        String(scrap?.model ?? ''),
        String(scrap?.item ?? ''),
        String(scrap?.leaderName ?? '')
    ].join('|');
};

const applyDashboardSyncDelta = (current: ScrapData[], action?: string, items: any[] = [], ids: string[] = []): ScrapData[] => {
    const currentItems = normalizeDashboardScraps(current);
    const nextItems = normalizeDashboardScraps(items as ScrapData[]);

    if (action === 'replace') {
        return nextItems;
    }

    if (action === 'remove') {
        const idSet = new Set((ids || []).map(String));
        return currentItems.filter((item) => !idSet.has(String(item?.id)) && !idSet.has(resolveDashboardScrapKey(item)));
    }

    const byId = new Map<string, ScrapData>();
    currentItems.forEach((item) => byId.set(resolveDashboardScrapKey(item), item));
    nextItems.forEach((item) => byId.set(resolveDashboardScrapKey(item), item));
    return Array.from(byId.values());
};

const LoadingSpinner = ({ label = 'Carregando dados...' }: { label?: string }) => (
    <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 px-4 py-3 text-sm text-slate-600 dark:text-zinc-300 shadow-sm">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span>{label}</span>
        </div>
    </div>
);

const INITIAL_IQC_RENDER_LIMIT = 50;
const MAX_FILTER_OPTIONS = 50;
const FILTER_INPUT_DEBOUNCE_MS = 500;

const getLimitedSortedOptions = (values: Array<unknown> = [], limit = MAX_FILTER_OPTIONS): string[] => {
    return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, limit);
};

const useDebouncedText = (value: string, delay = FILTER_INPUT_DEBOUNCE_MS) => {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timeoutId = globalThis.setTimeout(() => setDebouncedValue(value), delay);
        return () => globalThis.clearTimeout(timeoutId);
    }, [value, delay]);

    return debouncedValue;
};

const useStagedHeaderReady = (enabled: boolean) => {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setIsReady(false);
            return;
        }

        if (typeof window === 'undefined') {
            setIsReady(true);
            return;
        }

        setIsReady(false);
        const rafId = window.requestAnimationFrame(() => {
            globalThis.setTimeout(() => setIsReady(true), 0);
        });

        return () => window.cancelAnimationFrame(rafId);
    }, [enabled]);

    return isReady;
};

const useDeferredUIReady = (enabled: boolean, delay = 50) => {
    const [isUIReady, setIsUIReady] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setIsUIReady(false);
            return;
        }

        if (typeof window === 'undefined') {
            setIsUIReady(true);
            return;
        }

        setIsUIReady(false);
        let rafId: number | null = null;
        let timerId: ReturnType<typeof setTimeout> | null = null;

        const revealContent = () => {
            timerId = globalThis.setTimeout(() => setIsUIReady(true), delay);
        };

        if ('requestAnimationFrame' in window) {
            rafId = window.requestAnimationFrame(revealContent);
        } else {
            revealContent();
        }

        return () => {
            if (rafId !== null) window.cancelAnimationFrame(rafId);
            if (timerId !== null) globalThis.clearTimeout(timerId);
        };
    }, [enabled, delay]);

    return isUIReady;
};

type AsyncDashboardStats = {
    totalVal: number;
    totalQty: number;
    category: Array<[string, number]>;
    model: Array<[string, number]>;
    line: Array<[string, number]>;
};

const EMPTY_DASHBOARD_STATS: AsyncDashboardStats = {
    totalVal: 0,
    totalQty: 0,
    category: [],
    model: [],
    line: []
};

const DASHBOARD_SKELETON_ROWS = [0, 1, 2, 3];

const getDashboardCategoryKey = (itemName: unknown): string => {
    const specificItems = ['FRONT', 'REAR', 'OCTA', 'CAMERA', 'BATERIA RMA', 'BATERIA SCRAP', 'PLACA'];
    const itemUpper = String(itemName || '').toUpperCase();

    if (itemUpper.includes('PLACA')) return 'PLACA';
    if (itemUpper.includes('CAMERA')) return 'CAMERA';

    const found = specificItems.find((item) => itemUpper.includes(item) && item !== 'CAMERA' && item !== 'PLACA');
    return found || 'MIUDEZAS';
};

const matchesTextFilter = (value: unknown, query: string) => {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) return true;
    return String(value || '').toLowerCase().includes(normalizedQuery);
};

const scheduleDashboardMacrotask = (work: () => void) => {
    if (typeof window === 'undefined') {
        work();
        return () => undefined;
    }

    let cancelled = false;
    let handle: number | ReturnType<typeof setTimeout> | null = null;

    const run = () => {
        if (!cancelled) work();
    };

    if ('requestIdleCallback' in window) {
        handle = (window as any).requestIdleCallback(run, { timeout: 120 }) as number;
    } else {
        handle = globalThis.setTimeout(run, 0);
    }

    return () => {
        cancelled = true;
        if (handle === null) return;

        if ('cancelIdleCallback' in window) {
            (window as any).cancelIdleCallback(handle as number);
        } else {
            globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
        }
    };
};

const calculateExecutiveDashboardData = (
    scraps: ScrapData[],
    filters: {
        period: string;
        plant: string;
        shift: string;
        status: string;
        specificDate: string;
        specificWeek: string;
        specificMonth: string;
        specificYear: string;
    }
) => {
    let filtered = [...scraps].filter(Boolean);

    if (filters.period === 'DAY' && filters.specificDate) filtered = filtered.filter(item => normalizeDashboardDateKey(item?.date || '') === filters.specificDate);
    else if (filters.period === 'WEEK' && filters.specificWeek) {
        const [y, w] = filters.specificWeek.split('-W').map(Number);
        filtered = filtered.filter(item => {
            const sd = parseDashboardDate(item?.date || '');
            if (!sd) return false;
            const normalizedDate = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
            return getWeekNumber(normalizedDate) === w && sd.getFullYear() === y;
        });
    }
    else if (filters.period === 'MONTH' && filters.specificMonth) filtered = filtered.filter(item => normalizeDashboardDateKey(item?.date || '').startsWith(filters.specificMonth));
    else if (filters.period === 'YEAR' && filters.specificYear) filtered = filtered.filter(item => normalizeDashboardDateKey(item?.date || '').startsWith(filters.specificYear));

    if (filters.plant !== 'ALL') filtered = filtered.filter(item => item?.plant === filters.plant);
    if (filters.shift !== 'ALL') filtered = filtered.filter(item => String(item?.shift ?? '') === filters.shift);
    if (filters.status !== 'ALL') {
        if (filters.status === 'SENT') filtered = filtered.filter(item => item?.situation === 'SENT');
        else filtered = filtered.filter(item => item?.situation !== 'SENT');
    }

    let totalVal = 0;
    let totalQty = 0;
    const byCategory: Record<string, number> = {
        FRONT: 0,
        REAR: 0,
        OCTA: 0,
        CAMERA: 0,
        'BATERIA RMA': 0,
        'BATERIA SCRAP': 0,
        PLACA: 0,
        MIUDEZAS: 0
    };
    const byModel: Record<string, number> = {};
    const byLine: Record<string, number> = {};

    filtered.forEach((item) => {
        const safeItem = item ?? ({} as ScrapData);
        const val = normalizeMetric(safeItem?.totalValue);
        const qty = normalizeMetric(safeItem?.qty);
        const modelKey = safeItem?.model || 'Não informado';
        const lineKey = safeItem?.line || 'Não informada';
        const categoryKey = getDashboardCategoryKey(safeItem?.item);

        totalVal += val;
        totalQty += qty;
        byCategory[categoryKey] = (byCategory[categoryKey] || 0) + val;
        byModel[modelKey] = (byModel[modelKey] || 0) + val;
        byLine[lineKey] = (byLine[lineKey] || 0) + val;
    });

    return {
        filtered,
        stats: {
            totalVal,
            totalQty,
            category: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
            model: Object.entries(byModel).sort((a, b) => b[1] - a[1]).slice(0, 10),
            line: Object.entries(byLine).sort((a, b) => b[1] - a[1])
        } as AsyncDashboardStats
    };
};

type IQCTab = 'MONITORING' | 'BATCH_PROCESS' | 'HISTORY_SENT' | 'DASHBOARD' | 'BOX_MOUNT' | 'BOX_IDENTIFIED' | 'CONSULTA' | 'MATERIALS';

export const IQCModule = ({ currentUser, onBack, hasTabAccess, initialTab }: { currentUser: User, onBack: () => void, hasTabAccess?: (m: string, t: string) => boolean, initialTab?: IQCTab }) => {
    const allTabs: IQCTab[] = ['MONITORING', 'BATCH_PROCESS', 'HISTORY_SENT', 'DASHBOARD', 'BOX_MOUNT', 'BOX_IDENTIFIED', 'CONSULTA', 'MATERIALS'];
    const IQC_ACTIVE_TAB_KEY = 'iqc_active_tab';
    
    const getDefaultTab = (): IQCTab => {
        if (initialTab && allTabs.includes(initialTab) && (!hasTabAccess || hasTabAccess('IQC', initialTab))) {
            return initialTab;
        }

        const lightweightTabs: IQCTab[] = ['MONITORING', 'BATCH_PROCESS', 'HISTORY_SENT', 'CONSULTA', 'MATERIALS'];
        const preferred = lightweightTabs.find((tab) => !hasTabAccess || hasTabAccess('IQC', tab));
        if (preferred) return preferred;
        if (!hasTabAccess) return 'MONITORING';
        const allowed = allTabs.find((tab) => hasTabAccess('IQC', tab));
        return allowed || 'MONITORING';
    };

    const [activeTab, setActiveTab] = useState<IQCTab>(() => {
        const persistedTab = typeof window !== 'undefined'
            ? window.sessionStorage.getItem(IQC_ACTIVE_TAB_KEY)
            : null;

        if (persistedTab && allTabs.includes(persistedTab as IQCTab) && (!hasTabAccess || hasTabAccess('IQC', persistedTab))) {
            return persistedTab as IQCTab;
        }

        return getDefaultTab();
    });
    const [scraps, setScraps] = useState<ScrapData[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [lines, setLines] = useState<string[]>([]);
    const [models, setModels] = useState<string[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isHydrating, startTransition] = useTransition();
    const pendingHydrationRef = React.useRef<number | ReturnType<typeof setTimeout> | null>(null);

    const cancelPendingHydration = useCallback(() => {
        if (pendingHydrationRef.current === null || typeof window === 'undefined') return;
        if ('cancelIdleCallback' in window) {
            (window as any).cancelIdleCallback(pendingHydrationRef.current as number);
        } else {
            globalThis.clearTimeout(pendingHydrationRef.current as ReturnType<typeof setTimeout>);
        }
        pendingHydrationRef.current = null;
    }, []);

    const hydrateScrapsInChunks = useCallback((nextScraps: ScrapData[]) => {
        const normalizedScraps = normalizeDashboardScraps(Array.isArray(nextScraps) ? nextScraps : []);
        const initialChunk = normalizedScraps.slice(0, INITIAL_IQC_RENDER_LIMIT);

        startTransition(() => {
            setScraps(initialChunk);
        });

        cancelPendingHydration();

        if (normalizedScraps.length <= INITIAL_IQC_RENDER_LIMIT || typeof window === 'undefined') {
            return;
        }

        const flushAllScraps = () => {
            startTransition(() => {
                setScraps(normalizedScraps);
            });
            pendingHydrationRef.current = null;
        };

        if ('requestIdleCallback' in window) {
            pendingHydrationRef.current = (window as any).requestIdleCallback(flushAllScraps, { timeout: 120 }) as number;
        } else {
            pendingHydrationRef.current = globalThis.setTimeout(flushAllScraps, 0);
        }
    }, [cancelPendingHydration, startTransition]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [s, u, l, m, mats] = await Promise.all([
                getScraps(),
                getAllUsers(),
                getLines(),
                getModels(),
                getMaterials()
            ]);
            startTransition(() => {
                setUsers(Array.isArray(u) ? u : []);
                setLines(Array.isArray(l) ? l.map(x => x.name) : []);
                setModels(Array.isArray(m) ? m : []);
                setMaterials(Array.isArray(mats) ? mats : []);
            });
            hydrateScrapsInChunks(Array.isArray(s) ? s : []);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        return () => {
            cancelPendingHydration();
        };
    }, [cancelPendingHydration, hydrateScrapsInChunks]);

    useEffect(() => {
        const unsubscribe = subscribeToSyncStream((event: any) => {
            if (event?.collection !== 'scraps') return;

            const itemsArray = Array.isArray(event?.items)
                ? event.items
                : Object.values(event?.items || {});

            startTransition(() => {
                setScraps((current) => applyDashboardSyncDelta(current, event?.action, itemsArray, event?.ids || []));
            });
        });

        return () => {
            unsubscribe?.();
        };
    }, []);

    useEffect(() => {
        sessionStorage.setItem(IQC_ACTIVE_TAB_KEY, activeTab);
    }, [activeTab]);

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [activeTab]);

    const refreshData = async () => {
        const s = await getScraps();
        hydrateScrapsInChunks(Array.isArray(s) ? s : []);
    };

    const refreshMaterials = async () => {
        const nextMaterials = await getMaterials();
        startTransition(() => {
            setMaterials(nextMaterials);
        });
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 p-4 md:p-8 space-y-6">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <Button variant="ghost" onClick={onBack} className="rounded-full w-10 h-10 p-0 flex items-center justify-center">
                        <ArrowLeft size={20} />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent flex items-center gap-2">
                            <Truck size={24} className="text-blue-600" />
                            Controle de SCRAP & Logística
                        </h1>
                        <p className="text-slate-500 dark:text-zinc-400 text-sm">Controle de envio e baixa fiscal de SCRAP</p>
                    </div>
                </div>

                <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 custom-scrollbar">
                    {(!hasTabAccess || hasTabAccess('IQC', 'MONITORING')) && (
                        <Button variant={activeTab === 'MONITORING' ? 'primary' : 'ghost'} onClick={() => setActiveTab('MONITORING')} size="sm">
                            <LayoutDashboard size={16} /> Monitoramento
                        </Button>
                    )}
                    {(!hasTabAccess || hasTabAccess('IQC', 'BATCH_PROCESS')) && (
                        <Button variant={activeTab === 'BATCH_PROCESS' ? 'primary' : 'ghost'} onClick={() => setActiveTab('BATCH_PROCESS')} size="sm">
                            <CheckSquare size={16} /> Baixa de Scrap
                        </Button>
                    )}
                    {(!hasTabAccess || hasTabAccess('IQC', 'HISTORY_SENT')) && (
                        <Button variant={activeTab === 'HISTORY_SENT' ? 'primary' : 'ghost'} onClick={() => setActiveTab('HISTORY_SENT')} size="sm">
                            <History size={16} /> Histórico de Envios
                        </Button>
                    )}
                    {(!hasTabAccess || hasTabAccess('IQC', 'DASHBOARD')) && (
                        <Button variant={activeTab === 'DASHBOARD' ? 'primary' : 'ghost'} onClick={() => setActiveTab('DASHBOARD')} size="sm">
                            <BarChart3 size={16} /> Dashboard Detalhado
                        </Button>
                    )}
                    {(!hasTabAccess || hasTabAccess('IQC', 'BOX_MOUNT')) && (
                        <Button variant={activeTab === 'BOX_MOUNT' ? 'primary' : 'ghost'} onClick={() => setActiveTab('BOX_MOUNT')} size="sm">
                            <Box size={16} /> Montar Caixa
                        </Button>
                    )}
                    {(!hasTabAccess || hasTabAccess('IQC', 'BOX_IDENTIFIED')) && (
                        <Button variant={activeTab === 'BOX_IDENTIFIED' ? 'primary' : 'ghost'} onClick={() => setActiveTab('BOX_IDENTIFIED')} size="sm">
                            <QrCode size={16} /> Associar NF
                        </Button>
                    )}
                    {(!hasTabAccess || hasTabAccess('IQC', 'CONSULTA')) && (
                        <Button variant={activeTab === 'CONSULTA' ? 'primary' : 'ghost'} onClick={() => setActiveTab('CONSULTA')} size="sm">
                            <FileText size={16} /> Consulta
                        </Button>
                    )}
                    {(!hasTabAccess || hasTabAccess('IQC', 'MATERIALS')) && (
                        <Button variant={activeTab === 'MATERIALS' ? 'primary' : 'ghost'} onClick={() => setActiveTab('MATERIALS')} size="sm">
                            <Box size={16} /> Itens de Scrap
                        </Button>
                    )}
                </div>
            </div>

            {/* CONTENT */}
            <div className="mt-6">
                {activeTab === 'MONITORING' && (
                    <ScrapOperational scraps={scraps} users={users} lines={lines} models={models} isLoading={isLoading} isHydrating={isHydrating} />
                )}

                {activeTab === 'BATCH_PROCESS' && (
                    <BatchProcessTab scraps={scraps} onProcess={refreshData} currentUser={currentUser} lines={lines} models={models} users={users} />
                )}

                {activeTab === 'HISTORY_SENT' && (
                    <HistorySentTab scraps={scraps} users={users} onRefresh={refreshData} />
                )}

                {activeTab === 'DASHBOARD' && (
                    <ExecutiveDashboard scraps={scraps} users={users} isLoading={isLoading} isHydrating={isHydrating} />
                )}

                {activeTab === 'BOX_MOUNT' && (
                    <ScrapBoxMount currentUser={currentUser} onUpdate={refreshData} />
                )}

                {activeTab === 'BOX_IDENTIFIED' && (
                    <ScrapBoxIdentified currentUser={currentUser} onUpdate={refreshData} users={users} />
                )}

                {activeTab === 'CONSULTA' && (
                    <ScrapConsulta scraps={scraps} users={users} />
                )}

                {activeTab === 'MATERIALS' && (
                    <MaterialsManager materials={materials} setMaterials={setMaterials} onRefresh={refreshMaterials} disableDelete />
                )}
            </div>
        </div>
    );
};

// --- SUB COMPONENTS ---

const ExecutiveDashboard = ({ scraps, users, isLoading = false, isHydrating = false }: { scraps: ScrapData[], users: User[], isLoading?: boolean, isHydrating?: boolean }) => {
    const [groupPreviewModal, setGroupPreviewModal] = useState({ isOpen: false, type: '', key: '', scraps: [] as ScrapData[] });
    const [detailModal, setDetailModal] = useState({ isOpen: false, scrap: null as ScrapData | null });
    const openDetailModal = (scrap: ScrapData) => setDetailModal({ isOpen: true, scrap });
    const reactiveScraps = useMemo(() => normalizeDashboardScraps(Array.isArray(scraps) ? scraps : []), [scraps]);
    const isUIReady = useDeferredUIReady(!(isLoading || isHydrating));
    const isHeaderReady = useStagedHeaderReady(isUIReady);

    const [filters, setFilters] = useState({
        period: 'MONTH',
        plant: 'ALL',
        shift: 'ALL',
        status: 'ALL', // SENT, PENDING
        specificDate: '',
        specificWeek: '',
        specificMonth: new Date().toISOString().slice(0, 7),
        specificYear: ''
    });

    const [dashboardData, setDashboardData] = useState<{ filtered: ScrapData[]; stats: AsyncDashboardStats }>({
        filtered: [],
        stats: EMPTY_DASHBOARD_STATS
    });
    const [isMetricsLoading, setIsMetricsLoading] = useState(true);

    useEffect(() => {
        if (!isUIReady) {
            setDashboardData({ filtered: [], stats: EMPTY_DASHBOARD_STATS });
            setIsMetricsLoading(true);
            return;
        }

        setIsMetricsLoading(true);
        return scheduleDashboardMacrotask(() => {
            const next = calculateExecutiveDashboardData(reactiveScraps, filters);
            setDashboardData(next);
            setIsMetricsLoading(false);
        });
    }, [reactiveScraps, filters, isUIReady]);

    const filtered = dashboardData.filtered;
    const stats = dashboardData.stats;

    const handleDashboardExport = async () => {
        if (filters.status === 'SENT') {
            const dateRef = filters.specificDate || filters.specificWeek || filters.specificMonth || filters.specificYear || undefined;
            await exportIQCEnvioTemplate(filtered, undefined, dateRef);
            return;
        }
        await exportExecutiveReport(filtered);
    };

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <h3 className="font-bold text-lg">Indicadores Detalhados</h3>
                    <div className="flex flex-wrap gap-2 items-center">
                        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                            <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none w-full md:w-auto" onChange={e => setFilters({ ...filters, period: e.target.value })} value={filters.period} disabled={!isHeaderReady}>
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

                        <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" value={filters.plant} onChange={e => setFilters({ ...filters, plant: e.target.value })} disabled={!isHeaderReady}>
                            <option value="ALL">Todas Plantas</option>
                            <option value="P81L">P81L</option>
                            <option value="P81M">P81M</option>
                            <option value="P81N">P81N</option>
                        </select>
                        <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" value={filters.shift} onChange={e => setFilters({ ...filters, shift: e.target.value })} disabled={!isHeaderReady}>
                            <option value="ALL">Todos Turnos</option>
                            <option value="1">1º Turno</option>
                            <option value="2">2º Turno</option>
                        </select>
                        <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} disabled={!isHeaderReady}>
                            <option value="ALL">Status Envio</option>
                            <option value="PENDING">Pendentes</option>
                            <option value="SENT">Enviados</option>
                        </select>

                        <Button onClick={handleDashboardExport} className="bg-green-600 hover:bg-green-700 text-white ml-2" disabled={!isHeaderReady || isMetricsLoading}>
                            <Download size={18} /> Excel (Filtrado)
                        </Button>
                    </div>
                </div>
            </Card>

            {isUIReady ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="bg-blue-900 border-blue-800 min-h-[108px]">
                            <p className="text-blue-100 text-xs font-bold uppercase">Valor Total (Filtrado)</p>
                            <div className="mt-1 flex h-10 items-center">
                                {isMetricsLoading ? (
                                    <div className="h-9 w-32 animate-pulse rounded-md bg-white/20" />
                                ) : (
                                    <p className="text-3xl font-bold text-white tabular-nums min-w-[8rem]">{formatCurrency(stats.totalVal)}</p>
                                )}
                            </div>
                        </Card>
                        <Card className="bg-slate-900 border-slate-800 min-h-[108px]">
                            <p className="text-slate-300 text-xs font-bold uppercase">Quantidade (Filtrado)</p>
                            <div className="mt-1 flex h-10 items-center">
                                {isMetricsLoading ? (
                                    <div className="h-9 w-32 animate-pulse rounded-md bg-white/10" />
                                ) : (
                                    <p className="text-3xl font-bold text-white tabular-nums min-w-[8rem]">{stats.totalQty} <span className="text-base font-normal text-slate-400">itens</span></p>
                                )}
                            </div>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="min-h-[320px]">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><LayoutDashboard size={16} className="text-purple-500" /> Por Categoria</h3>
                    <div className="space-y-3 min-h-[240px]">
                        {isMetricsLoading ? DASHBOARD_SKELETON_ROWS.map((row) => (
                            <div key={`category-${row}`} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" />
                        )) : stats.category.map(([name, val]) => (
                            <div key={name}>
                                <div className="flex justify-between items-center text-sm cursor-pointer hover:bg-slate-100 hover:text-blue-500 dark:hover:bg-zinc-800 p-2 rounded transition-colors" onClick={() => {
                                    const scrapsFiltrados = filtered.filter(s => getDashboardCategoryKey(s.item) === name);
                                    setGroupPreviewModal({ isOpen: true, type: 'category', key: name, scraps: scrapsFiltrados });
                                }}>
                                    <span className={val > 0 ? 'text-slate-900 dark:text-zinc-100' : 'text-slate-400 dark:text-zinc-600'}>{name}</span>
                                    <span className="font-bold text-slate-800 dark:text-zinc-200">{formatCurrency(val)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card className="min-h-[320px]">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Truck size={16} className="text-blue-500" /> Top Modelos</h3>
                    <div className="space-y-3 min-h-[240px]">
                        {isMetricsLoading ? DASHBOARD_SKELETON_ROWS.map((row) => (
                            <div key={`model-${row}`} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" />
                        )) : stats.model.map(([name, val], i) => (
                            <div key={name} className="flex justify-between items-center text-sm p-2 cursor-pointer hover:bg-slate-100 hover:text-blue-500 dark:hover:bg-zinc-800 rounded transition-colors" onClick={() => {
                                const scrapsFiltrados = filtered.filter(s => s.model === name);
                                setGroupPreviewModal({ isOpen: true, type: 'model', key: name, scraps: scrapsFiltrados });
                            }}>
                                <span className="text-slate-900 dark:text-zinc-100 whitespace-normal break-words w-2/3">{i + 1}. {name}</span>
                                <span className="font-bold text-blue-600 dark:text-blue-400">{formatCurrency(val)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card className="min-h-[320px]">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Filter size={16} className="text-green-500" /> Por Linha</h3>
                    <div className="space-y-3 min-h-[240px]">
                        {isMetricsLoading ? DASHBOARD_SKELETON_ROWS.map((row) => (
                            <div key={`line-${row}`} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" />
                        )) : stats.line.map(([name, val]) => (
                            <div key={name} className="flex justify-between items-center text-sm p-2 cursor-pointer hover:bg-slate-100 hover:text-blue-500 dark:hover:bg-zinc-800 rounded transition-colors" onClick={() => {
                                const scrapsFiltrados = filtered.filter(s => s.line === name);
                                setGroupPreviewModal({ isOpen: true, type: 'line', key: name, scraps: scrapsFiltrados });
                            }}>
                                <span className="text-slate-900 dark:text-zinc-100">{name}</span>
                                <span className="font-bold text-green-600 dark:text-green-400">{formatCurrency(val)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            {/* Group Preview Modal */}
            {groupPreviewModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <Card className="max-w-2xl w-full max-h-[80vh] overflow-y-auto bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg">
                                {groupPreviewModal.type === 'category' && 'Categoria: '}
                                {groupPreviewModal.type === 'model' && 'Modelo: '}
                                {groupPreviewModal.type === 'line' && 'Linha: '}
                                {groupPreviewModal.key}
                            </h3>
                            <button onClick={() => setGroupPreviewModal({ ...groupPreviewModal, isOpen: false })} className="text-slate-400 hover:text-slate-700 bg-slate-100 dark:bg-zinc-800 rounded-full w-8 h-8 flex items-center justify-center">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="space-y-2">
                            {groupPreviewModal.scraps.map(s => (
                                <div key={s.id} className="flex justify-between items-center p-2 hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer rounded border border-slate-100 dark:border-zinc-800" onClick={() => openDetailModal(s)}>
                                    <div className="text-sm cursor-pointer hover:text-blue-500">
                                        <p className="font-bold">{s.model}</p>
                                        <p className="text-xs text-slate-500">{formatDateDisplay(s.date as string)} • {s.code || '-'}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold">{formatCurrency(s.totalValue)}</p>
                                        <p className="text-xs text-slate-500">{s.qty} itens</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            )}

            <ScrapDetailModal isOpen={detailModal.isOpen} scrap={detailModal.scrap} users={users} onClose={() => setDetailModal({ isOpen: false, scrap: null })} />
                </>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="bg-blue-900 border-blue-800 min-h-[108px]">
                            <p className="text-blue-100 text-xs font-bold uppercase">Valor Total (Filtrado)</p>
                            <div className="mt-1 h-9 w-32 animate-pulse rounded-md bg-white/20" />
                        </Card>
                        <Card className="bg-slate-900 border-slate-800 min-h-[108px]">
                            <p className="text-slate-300 text-xs font-bold uppercase">Quantidade (Filtrado)</p>
                            <div className="mt-1 h-9 w-32 animate-pulse rounded-md bg-white/10" />
                        </Card>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {['Por Categoria', 'Top Modelos', 'Por Linha'].map((title) => (
                            <Card key={title} className="min-h-[320px]">
                                <h3 className="font-bold text-slate-900 dark:text-white mb-4">{title}</h3>
                                <div className="space-y-3 min-h-[240px]">
                                    {DASHBOARD_SKELETON_ROWS.map((row) => (
                                        <div key={`${title}-${row}`} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" />
                                    ))}
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const BatchProcessTab = ({ scraps, onProcess, currentUser, lines, models, users }: { scraps: ScrapData[], onProcess: () => void, currentUser: User, lines: string[], models: string[], users: User[] }) => {
    const [filters, setFilters] = useState({
        period: 'MONTH',
        specificDate: '',
        specificWeek: '',
        specificMonth: new Date().toISOString().slice(0, 7),
        specificYear: '',
        shift: 'ALL',
        qrCode: '',
        model: 'ALL',
        item: 'ALL',
        code: ''
    });

    const [selectedScrap, setSelectedScrap] = useState<ScrapData | null>(null);
    const isUIReady = useDeferredUIReady(true);
    const isHeaderReady = useStagedHeaderReady(isUIReady);
    const [itemSearch, setItemSearch] = useState('');
    const debouncedItemSearch = useDebouncedText(itemSearch);
    const [qrCodeSearch, setQrCodeSearch] = useState('');
    const [codeSearch, setCodeSearch] = useState('');
    const debouncedQrCodeSearch = useDebouncedText(qrCodeSearch);
    const debouncedCodeSearch = useDebouncedText(codeSearch);
    const availableModels = useMemo(
        () => Array.from(new Set(scraps.filter((item) => item.situation !== 'SENT').map((item) => item.model).filter(Boolean)))
            .sort((a, b) => String(a).localeCompare(String(b))),
        [scraps]
    );

    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [nfNumber, setNfNumber] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [pendingScraps, setPendingScraps] = useState<ScrapData[]>([]);
    const [isListPreparing, setIsListPreparing] = useState(true);

    useEffect(() => {
        if (!isHeaderReady) return;
        const nextItem = debouncedItemSearch.trim();
        setFilters((prev) => ({
            ...prev,
            item: nextItem || 'ALL',
            qrCode: debouncedQrCodeSearch.trim().toUpperCase(),
            code: debouncedCodeSearch.trim().toUpperCase()
        }));
    }, [debouncedItemSearch, debouncedQrCodeSearch, debouncedCodeSearch, isHeaderReady]);

    useEffect(() => {
        if (!isUIReady) {
            setPendingScraps([]);
            setIsListPreparing(true);
            return;
        }

        setIsListPreparing(true);
        return scheduleDashboardMacrotask(() => {
            let res = scraps.filter(s => s.situation !== 'SENT');

            if (filters.period === 'DAY' && filters.specificDate) res = res.filter(s => s.date === filters.specificDate);
            if (filters.period === 'WEEK' && filters.specificWeek) {
                const [y, w] = filters.specificWeek.split('-W').map(Number);
                res = res.filter(s => {
                    const sd = new Date(s.date);
                    const utcDate = new Date(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate());
                    const sw = getWeekNumber(utcDate);
                    return sw === w && sd.getFullYear() === y;
                });
            }
            if (filters.period === 'MONTH' && filters.specificMonth) res = res.filter(s => s.date.startsWith(filters.specificMonth));
            if (filters.period === 'YEAR' && filters.specificYear) res = res.filter(s => s.date.startsWith(filters.specificYear));

            if (filters.shift !== 'ALL') res = res.filter(s => String(s.shift) === filters.shift);
            if (filters.qrCode) res = res.filter(s => matchesTextFilter(s.qrCode, filters.qrCode));
            if (filters.model !== 'ALL') res = res.filter(s => matchesTextFilter(s.model, filters.model));
            if (filters.item !== 'ALL') res = res.filter(s => matchesTextFilter(s.item, filters.item));
            if (filters.code) res = res.filter(s => matchesTextFilter(s.code, filters.code));

            res = res.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setPendingScraps(res);
            setIsListPreparing(false);
        });
    }, [scraps, filters, isUIReady]);

    const handleSelect = useCallback((id: number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }, []);

    const handleSelectAll = useCallback(() => {
        if (selectedIds.length === pendingScraps.length) setSelectedIds([]);
        else setSelectedIds(pendingScraps.map(s => Number(s.id)));
    }, [pendingScraps, selectedIds.length]);

    const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    const totalSelectedValue = useMemo(() => {
        return pendingScraps
            .filter(s => selectedIdsSet.has(Number(s.id)))
            .reduce((acc, s) => acc + (s.totalValue || 0), 0);
    }, [pendingScraps, selectedIdsSet]);

    const batchListData = useMemo(() => ({
        items: pendingScraps,
        selectedIdsSet,
        onToggleSelect: handleSelect,
        onPreview: setSelectedScrap
    }), [pendingScraps, selectedIdsSet, handleSelect]);

    const BatchProcessRow = useCallback(({ index, style, items, selectedIdsSet, onToggleSelect, onPreview }: RowComponentProps<any>) => {
        const s: ScrapData = items[index];
        const isSelected = selectedIdsSet.has(Number(s.id));

        return (
            <div
                style={style}
                className={`grid grid-cols-[44px_90px_1fr_1fr_1fr_1fr_80px_120px_90px_70px] items-center border-b border-slate-100 dark:border-zinc-800 px-2 text-sm ${isSelected ? 'bg-blue-50 dark:bg-blue-900/10' : 'bg-white dark:bg-zinc-900'} hover:bg-slate-50 dark:hover:bg-zinc-800/50`}
            >
                <div className="px-2">
                    <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(Number(s.id))} />
                </div>
                <div className="px-2 text-slate-700 dark:text-zinc-300">{formatDateDisplay(s.date)}</div>
                <div className="px-2 text-slate-700 dark:text-zinc-300 truncate">{s.model}</div>
                <div className="px-2 text-slate-700 dark:text-zinc-300 truncate">{s.line}</div>
                <div className="px-2 text-slate-700 dark:text-zinc-300 truncate">{s.item}</div>
                <div className="px-2 font-mono text-slate-700 dark:text-zinc-300 truncate">{s.code || '-'}</div>
                <div className="px-2 text-slate-700 dark:text-zinc-300">{s.qty}</div>
                <div className="px-2 text-right font-mono text-slate-700 dark:text-zinc-300">{formatCurrency(s.totalValue)}</div>
                <div className="px-2 text-center">
                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded ${s.status === 'OK' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{s.status || 'NG'}</span>
                </div>
                <div className="px-2 text-center">
                    <button onClick={(e) => { e.stopPropagation(); onPreview(s); }} className="text-blue-500 hover:text-blue-700 p-1 bg-blue-50 dark:bg-blue-900/30 rounded-full transition-colors">
                        <Eye size={16} />
                    </button>
                </div>
            </div>
        );
    }, []);

    const handleProcess = async () => {
        if (!nfNumber) return alert("Digite o número da Nota Fiscal");

        setIsProcessing(true);
        try {
            await batchProcessScraps(selectedIds, nfNumber, currentUser.matricula, new Date());
            alert("Baixa realizada com sucesso!");
            setShowModal(false);
            setNfNumber('');
            setSelectedIds([]);
            onProcess();
        } catch (e) {
            alert("Erro ao processar");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <div className="flex flex-wrap items-end gap-3 w-full">
                    <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none w-auto flex-none" onChange={e => setFilters({ ...filters, period: e.target.value })} value={filters.period} disabled={!isHeaderReady}>
                        <option value="ALL">Todos os Períodos</option>
                        <option value="DAY">Dia</option>
                        <option value="WEEK">Semana</option>
                        <option value="MONTH">Mês</option>
                        <option value="YEAR">Ano</option>
                    </select>
                    {filters.period === 'DAY' && <Input type="date" value={filters.specificDate} onChange={e => setFilters({ ...filters, specificDate: e.target.value })} className="w-auto flex-none" />}
                    {filters.period === 'WEEK' && <Input type="week" value={filters.specificWeek} onChange={e => setFilters({ ...filters, specificWeek: e.target.value })} className="w-auto flex-none" />}
                    {filters.period === 'MONTH' && <Input type="month" value={filters.specificMonth} onChange={e => setFilters({ ...filters, specificMonth: e.target.value })} className="w-auto flex-none" />}
                    {filters.period === 'YEAR' && <Input type="number" placeholder="2026" value={filters.specificYear} onChange={e => setFilters({ ...filters, specificYear: e.target.value })} className="w-auto flex-none" />}

                    <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none w-auto flex-none" value={filters.shift} onChange={e => setFilters({ ...filters, shift: e.target.value })} disabled={!isHeaderReady}>
                        <option value="ALL">Todos Turnos</option>
                        <option value="1">1º Turno</option>
                        <option value="2">2º Turno</option>
                    </select>

                    <div className="flex-1 min-w-[200px] max-w-sm">
                        <Input placeholder={isHeaderReady ? "Buscar por QR Code..." : "Preparando cabeçalho..."} value={qrCodeSearch} onChange={e => setQrCodeSearch(e.target.value.toUpperCase())} className="w-full" disabled={!isHeaderReady} />
                    </div>

                    <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none w-auto flex-none" value={filters.model} onChange={e => setFilters({ ...filters, model: e.target.value })} disabled={!isHeaderReady}>
                        <option value="ALL">Todos Modelos</option>
                        {availableModels.map((model) => <option key={model} value={model}>{model}</option>)}
                    </select>

                    <input
                        type="text"
                        className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none w-auto flex-none min-h-[40px]"
                        value={itemSearch}
                        onChange={e => setItemSearch(e.target.value)}
                        placeholder={isHeaderReady ? "Buscar item..." : "Carregando filtros..."}
                        disabled={!isHeaderReady}
                    />

                    <div className="flex-1 min-w-[200px] max-w-sm">
                        <input
                            type="text"
                            placeholder="Filtrar por Código do Item"
                            className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none w-full"
                            value={codeSearch}
                            onChange={e => setCodeSearch(e.target.value.toUpperCase())}
                            disabled={!isHeaderReady}
                        />
                    </div>

                    <div className="ml-auto text-sm text-slate-500">
                        {pendingScraps.length} itens aguardando baixa
                    </div>
                </div>
            </Card>

            {isUIReady ? (
                <>
                    <div className="w-full overflow-x-auto pb-4 mb-4 touch-pan-x border border-gray-200 dark:border-zinc-800 rounded-xl min-h-[340px]">
                        <div className="min-w-[980px]">
                    <div className="grid grid-cols-[44px_90px_1fr_1fr_1fr_1fr_80px_120px_90px_70px] items-center bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800 text-sm font-medium px-2 h-12">
                        <div className="px-2">
                            <input type="checkbox" checked={selectedIds.length === pendingScraps.length && pendingScraps.length > 0} onChange={handleSelectAll} />
                        </div>
                        <div className="px-2">Data</div>
                        <div className="px-2">Modelo</div>
                        <div className="px-2">Linha</div>
                        <div className="px-2">Item</div>
                        <div className="px-2">Código</div>
                        <div className="px-2">Qtd</div>
                        <div className="px-2 text-right">Valor</div>
                        <div className="px-2 text-center">Status</div>
                        <div className="px-2 text-center">Ações</div>
                    </div>

                    {isListPreparing ? (
                        <div className="space-y-2 p-4">
                            {DASHBOARD_SKELETON_ROWS.map((row) => (
                                <div key={`batch-${row}`} className="h-11 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" />
                            ))}
                        </div>
                    ) : (
                        <List
                            rowCount={pendingScraps.length}
                            rowHeight={52}
                            rowComponent={BatchProcessRow}
                            rowProps={batchListData}
                            style={{ height: Math.min(560, Math.max(56, pendingScraps.length * 52)), width: '100%' }}
                        />
                    )}
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 p-4 shadow-lg z-40 lg:left-72">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex gap-6 items-center">
                        <div className="hidden md:block">
                            <p className="text-xs font-bold text-slate-500 uppercase">Itens Selecionados</p>
                            <p className="font-bold text-lg">{selectedIds.length}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase">Valor Total</p>
                            <p className="font-bold text-lg text-blue-600">{formatCurrency(totalSelectedValue)}</p>
                        </div>
                    </div>
                    <Button
                        disabled={selectedIds.length === 0}
                        onClick={() => setShowModal(true)}
                        size="lg"
                        className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30"
                    >
                        Gerar Baixa / Associar NF
                    </Button>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                    <Card className="max-w-md w-full bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700">
                        <h3 className="font-bold text-xl mb-4">Confirmar Baixa de SCRAP</h3>
                        <p className="text-sm text-slate-500 mb-6">
                            Você está prestes a dar baixa em <b>{selectedIds.length} itens</b> totalizando <b>{formatCurrency(totalSelectedValue)}</b>.
                        </p>

                        <div className="mb-6">
                            <Input
                                label="Número da Nota Fiscal"
                                value={nfNumber}
                                onChange={e => setNfNumber(e.target.value)}
                                placeholder="Digite a NF (Apenas números)..."
                                autoFocus
                            />
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
                            <Button onClick={handleProcess} disabled={isProcessing || !nfNumber}>
                                {isProcessing ? 'Processando...' : 'Confirmar Baixa'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            <ScrapDetailModal isOpen={!!selectedScrap} scrap={selectedScrap} users={users} onClose={() => setSelectedScrap(null)} />
                </>
            ) : (
                <LoadingSpinner label="Preparando baixa em lote..." />
            )}
        </div>
    );
};

const HistorySentTab = ({ scraps, users, onRefresh }: { scraps: ScrapData[], users: User[], onRefresh?: () => void }) => {
    const [filters, setFilters] = useState({ item: 'ALL', model: 'ALL', qrCode: '' });
    const [groupBy, setGroupBy] = useState<'NF' | 'BOX'>('NF');
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebouncedText(searchQuery);
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
    const [previewBoxNf, setPreviewBoxNf] = useState<string | null>(null);
    const [selectedScrap, setSelectedScrap] = useState<ScrapData | null>(null);
    const isUIReady = useDeferredUIReady(true);
    const isHeaderReady = useStagedHeaderReady(isUIReady);
    const [itemSearch, setItemSearch] = useState('');
    const [qrCodeSearch, setQrCodeSearch] = useState('');
    const debouncedItemSearch = useDebouncedText(itemSearch);
    const debouncedQrCodeSearch = useDebouncedText(qrCodeSearch);
    const availableModels = useMemo(
        () => Array.from(new Set(scraps.filter((item) => item.situation === 'SENT' || !!item.nfNumber || !!(item as any).nf_number).map((item) => item.model).filter(Boolean)))
            .sort((a, b) => String(a).localeCompare(String(b))),
        [scraps]
    );
    const [filteredScraps, setFilteredScraps] = useState<ScrapData[]>([]);
    const [groups, setGroups] = useState<Record<string, ScrapData[]>>({});
    const [filteredTotalValue, setFilteredTotalValue] = useState(0);
    const [isHistoryPreparing, setIsHistoryPreparing] = useState(true);

    useEffect(() => {
        if (!isHeaderReady) return;
        const nextItem = debouncedItemSearch.trim();
        setFilters((prev) => ({
            ...prev,
            item: nextItem || 'ALL',
            qrCode: debouncedQrCodeSearch.trim().toUpperCase()
        }));
    }, [debouncedItemSearch, debouncedQrCodeSearch, isHeaderReady]);

    useEffect(() => {
        if (!isUIReady) {
            setFilteredScraps([]);
            setGroups({});
            setFilteredTotalValue(0);
            setIsHistoryPreparing(true);
            return;
        }

        setIsHistoryPreparing(true);
        return scheduleDashboardMacrotask(() => {
            let result = scraps.filter(s => s.situation === 'SENT' || !!s.nfNumber || !!(s as any).nf_number);
            if (filters.item !== 'ALL') result = result.filter(s => matchesTextFilter(s.item, filters.item));
            if (filters.model !== 'ALL') result = result.filter(s => matchesTextFilter(s.model, filters.model));
            if (filters.qrCode) {
                result = result.filter(s => matchesTextFilter(s.qrCode, filters.qrCode) || matchesTextFilter(String(s.id), filters.qrCode));
            }

            const grouped: Record<string, ScrapData[]> = {};
            result.forEach(s => {
                const key = groupBy === 'NF' ? String(s.nfNumber || (s as any).nf_number || 'SEM_NF') : String(s.boxId || (s as any).box_id || 'SEM_CAIXA');
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(s);
            });

            const total = result.reduce((acc, s) => acc + Number(s.totalValue || 0), 0);
            setFilteredScraps(result);
            setGroups(grouped);
            setFilteredTotalValue(total);
            setIsHistoryPreparing(false);
        });
    }, [scraps, filters, groupBy, isUIReady]);

    return (
        <div className="space-y-4">
            <Card>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <input type="text" placeholder={isHeaderReady ? "Buscar NF ou Caixa..." : "Preparando cabeçalho..."} className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none w-full min-h-[40px]" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} disabled={!isHeaderReady} />
                    <input type="text" placeholder={isHeaderReady ? "Buscar item..." : "Carregando filtros..."} className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none min-h-[40px]" value={itemSearch} onChange={e => setItemSearch(e.target.value)} disabled={!isHeaderReady} />
                    <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none min-h-[40px]" value={filters.model} onChange={e => setFilters({ ...filters, model: e.target.value })} disabled={!isHeaderReady}>
                        <option value="ALL">Todos Modelos</option>
                        {availableModels.map((model) => <option key={model} value={model}>{model}</option>)}
                    </select>
                    <Input placeholder={isHeaderReady ? "Buscar por QR Code / ID..." : "Preparando busca..."} value={qrCodeSearch} onChange={e => setQrCodeSearch(e.target.value.toUpperCase())} className="h-fit" disabled={!isHeaderReady} />
                    <select className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm outline-none h-fit" value={groupBy} onChange={e => setGroupBy(e.target.value as 'NF' | 'BOX')} disabled={!isHeaderReady}>
                        <option value="NF">Agrupar por NF</option>
                        <option value="BOX">Agrupar por Caixa</option>
                    </select>
                </div>
                {filters.item !== 'ALL' && (
                    <div className="mt-3 inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-sm">
                        <span className="font-semibold text-blue-700 dark:text-blue-300">Total filtrado por item:</span>
                        <span className="font-mono font-bold text-blue-800 dark:text-blue-200">{formatCurrency(filteredTotalValue)}</span>
                    </div>
                )}
            </Card>
            
            {isUIReady ? (
                <>
                    {isHistoryPreparing && (
                        <div className="space-y-2">
                            {DASHBOARD_SKELETON_ROWS.map((row) => (
                                <div key={`history-${row}`} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" />
                            ))}
                        </div>
                    )}
                    {!isHistoryPreparing && Object.keys(groups).length === 0 && <p className="text-center text-slate-500 py-10">Nenhum envio registrado.</p>}

                    {!isHistoryPreparing && Object.entries(groups)
                        .filter(([key, items]) => {
                            if (!debouncedSearchQuery) return true;
                            const query = debouncedSearchQuery.toLowerCase();
                            if (key.toLowerCase().includes(query)) return true;
                            if (groupBy === 'BOX' && items[0]?.nfNumber?.toLowerCase().includes(query)) return true;
                            return false;
                        })
                        .sort((a, b) => {
                            const timeA = new Date(a[1][0]?.sentAt || 0).getTime() || 0;
                            const timeB = new Date(b[1][0]?.sentAt || 0).getTime() || 0;
                            return timeB - timeA;
                        })
                        .map(([keyVal, items]) => (
                            <HistoryGroupCard
                                key={`group-${groupBy}-${keyVal}`}
                                nf={keyVal}
                                items={items}
                                users={users}
                                groupBy={groupBy}
                                isExpanded={expandedGroups.includes(keyVal)}
                                onToggle={() => setExpandedGroups(prev => prev.includes(keyVal) ? prev.filter(k => k !== keyVal) : [...prev, keyVal])}
                                onRefresh={onRefresh}
                                onClickPreview={() => setPreviewBoxNf(keyVal)}
                                onClickScrap={(scrap: ScrapData) => setSelectedScrap(scrap)}
                            />
                        ))}

                    {/* Preview Modal for box items */}
                    {previewBoxNf && groups[previewBoxNf] && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPreviewBoxNf(null)}>
                            <Card className="max-w-2xl w-full max-h-[80vh] overflow-y-auto bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">Detalhes da NF: {previewBoxNf}</h3>
                                    <button onClick={() => setPreviewBoxNf(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 bg-slate-100 dark:bg-zinc-800 rounded-full w-8 h-8 flex items-center justify-center">
                                        <X size={16} />
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {(() => {
                                        const specificItems = ['FRONT', 'REAR', 'OCTA', 'CAMERA', 'BATERIA RMA', 'BATERIA SCRAP', 'PLACA'];
                                        const summary: Record<string, { qty: number, val: number }> = {};
                                        specificItems.forEach(k => summary[k] = { qty: 0, val: 0 });
                                        summary['MIUDEZAS'] = { qty: 0, val: 0 };
                                        const items = groups[previewBoxNf];
                                        items.forEach(s => {
                                            let key = 'MIUDEZAS';
                                            const itemUpper = (s.item || '').toUpperCase();
                                            if (itemUpper.includes('PLACA')) {
                                                key = 'PLACA';
                                            } else {
                                                const found = specificItems.find(spec => itemUpper.includes(spec));
                                                if (found) key = found;
                                            }
                                            summary[key].qty += (s.qty || 0);
                                            summary[key].val += (s.totalValue || 0);
                                        });

                                        return Object.entries(summary).filter(([, d]) => d.qty > 0).map(([key, data]) => (
                                            <div key={key} className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg p-3">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="font-bold text-slate-800 dark:text-zinc-200">{key}</span>
                                                    <span className="font-mono text-blue-600 dark:text-blue-400">{formatCurrency(data.val)}</span>
                                                </div>
                                                <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">{data.qty} unidade(s)</p>
                                                <div className="mt-2 space-y-1">
                                                    {items.filter(i => {
                                                        const iu = (i.item || '').toUpperCase();
                                                        if (key === 'PLACA') return iu.includes('PLACA');
                                                        if (key === 'CAMERA') return iu.includes('CAMERA');
                                                        if (key === 'MIUDEZAS') {
                                                            return !specificItems.some(sp => iu.includes(sp));
                                                        }
                                                        return iu.includes(key);
                                                    }).map(si => (
                                                        <div
                                                            key={si.id}
                                                            className="flex justify-between items-center text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded px-2 py-1 transition-colors"
                                                            onClick={() => { setPreviewBoxNf(null); setSelectedScrap(si); }}
                                                        >
                                                            <span className="text-slate-600 dark:text-zinc-400">{si.model} • {si.code || '-'}</span>
                                                            <span className="font-mono text-slate-700 dark:text-zinc-300">{formatCurrency(si.totalValue)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>
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
                </>
            ) : (
                <LoadingSpinner label="Preparando histórico de envios..." />
            )}
        </div>
    );
};

const HistoryGroupCard = ({ nf, items, users, groupBy = 'NF', isExpanded, onToggle, onRefresh, onClickPreview, onClickScrap }: { nf: string, items: ScrapData[], users: User[], groupBy?: 'NF' | 'BOX', isExpanded?: boolean, onToggle?: () => void, onRefresh?: () => void, onClickPreview?: () => void, onClickScrap?: (s: ScrapData) => void }) => {
    const [itemFilter, setItemFilter] = useState('');
    const [, startTransition] = useTransition();

    const filteredItems = useMemo(() => {
        return items.filter(i => !itemFilter || (i.code || '').toLowerCase().includes(itemFilter.toLowerCase()));
    }, [items, itemFilter]);

    const totalFiltrado = useMemo(() => {
        return filteredItems.reduce((acc, curr) => acc + Number(curr.totalValue || 0), 0);
    }, [filteredItems]);

    const totalValue = items.reduce((acc, s) => acc + (s.totalValue || 0), 0);
    const sentDate = items[0].sentAt ? new Date(items[0].sentAt).toLocaleDateString() : '-';
    const sentByMatricula = items[0].sentBy;
    const sentByName = users.find(u => u.matricula === sentByMatricula)?.name || sentByMatricula || '-';

    const specificItems = ['FRONT', 'REAR', 'OCTA', 'CAMERA', 'BATERIA RMA', 'BATERIA SCRAP', 'PLACA'];
    const summary = useMemo(() => {
        const groupSummary: Record<string, { qty: number, val: number }> = {};
        specificItems.forEach(k => groupSummary[k] = { qty: 0, val: 0 });
        groupSummary['MIUDEZAS'] = { qty: 0, val: 0 };

        items.forEach(s => {
            let key = 'MIUDEZAS';
            const itemUpper = (s.item || '').toUpperCase();
            if (itemUpper.includes('PLACA')) {
                key = 'PLACA';
            } else {
                const found = specificItems.find(spec => itemUpper.includes(spec));
                if (found) key = found;
            }

            groupSummary[key].qty += (s.qty || 0);
            groupSummary[key].val += (s.totalValue || 0);
        });

        return groupSummary;
    }, [items]);

    const historyListData = useMemo(() => ({
        items: filteredItems,
        onClickScrap,
        onRefresh
    }), [filteredItems, onClickScrap, onRefresh]);

    const HistoryItemRow = useCallback(({ index, style, items, onClickScrap, onRefresh }: RowComponentProps<any>) => {
        const i: ScrapData = items[index];

        return (
            <div
                style={style}
                className="grid grid-cols-[1fr_1fr_1fr_80px_120px_140px] items-center border-b border-slate-100 dark:border-zinc-800 last:border-0 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors px-2 text-xs"
                onClick={(e) => { e.stopPropagation(); if (onClickScrap) onClickScrap(i); }}
            >
                <div className="p-2 text-slate-700 dark:text-zinc-300 truncate">{i.item}</div>
                <div className="p-2 text-slate-700 dark:text-zinc-300 truncate">{i.model}</div>
                <div className="p-2 font-mono text-slate-700 dark:text-zinc-300 truncate">{i.code || '-'}</div>
                <div className="p-2 text-slate-700 dark:text-zinc-300">{i.qty}</div>
                <div className="p-2 text-right font-mono text-slate-700 dark:text-zinc-300">{formatCurrency(i.totalValue)}</div>
                <div className="p-2 flex gap-1">
                    <button onClick={async (e) => {
                        e.stopPropagation();
                        if (window.confirm('Tem certeza que deseja remover este item desta NF/Caixa?')) {
                            try {
                                await updateScrap(i.id!.toString(), { situation: 'PENDING', nfNumber: null as any, sentAt: null as any });
                                if (onRefresh) onRefresh();
                            } catch (err) {
                                alert('Erro ao remover scrap.');
                            }
                        }
                    }} className="text-red-500 hover:text-red-700">Remover</button>
                    <button onClick={async (e) => {
                        e.stopPropagation();
                        const novaNf = window.prompt('Digite o número da nova NF:');
                        if (novaNf && novaNf.trim() !== '') {
                            try {
                                await updateScrap(i.id!.toString(), { nfNumber: novaNf, situation: 'SENT', sentAt: new Date() });
                                if (onRefresh) onRefresh();
                            } catch (err) {
                                alert('Erro ao realocar scrap.');
                            }
                        }
                    }} className="text-blue-500 hover:text-blue-700">Realocar</button>
                    <Eye size={14} className="text-blue-500" />
                </div>
            </div>
        );
    }, []);

    return (
        <Card className={`border-l-4 border-l-blue-500 transition-all ${isExpanded ? 'ring-2 ring-blue-500/20' : ''}`}>
            <div className="cursor-pointer" onClick={onToggle}>
                <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2.5 rounded-lg text-blue-600 dark:text-blue-400 font-bold">
                            <FileText size={20} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                                {groupBy === 'BOX' ? `Caixa #${nf} (NF: ${items[0]?.nfNumber || 'SEM_NF'})` : `NF: ${nf}`}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-zinc-400 truncate whitespace-nowrap text-ellipsis">
                                Enviado em {sentDate} por <b>{sentByName}</b>
                            </p>
                        </div>
                    </div>
                    <div className="flex-none flex justify-center items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:bg-green-50 border border-green-200 h-10"
                            onClick={(e) => {
                                e.stopPropagation();
                                exportIQCEnvioTemplate(items, nf, items[0]?.sentAt ? String(items[0].sentAt).slice(0, 10) : undefined);
                            }}
                        >
                            <FileSpreadsheet size={16} className="mr-2" />
                            CONTROLE DE DEVOLUÇÃO
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="h-10"
                            onClick={(e) => {
                                e.stopPropagation();
                                exportEspelhoScrapTemplate(items, nf);
                            }}
                        >
                            <FileSpreadsheet size={16} className="mr-2" />
                            ESPELHO SCRAP
                        </Button>
                    </div>
                    <div className="flex-1 flex flex-col justify-center items-end min-w-0">
                        <p className="text-2xl font-bold text-slate-900 dark:text-white text-right">{formatCurrency(totalValue)}</p>
                        <p className="text-xs text-slate-500 text-right">{items.reduce((acc, s) => acc + (s.qty || 0), 0)} itens registrados</p>
                        <div>
                            {isExpanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                        </div>
                    </div>
                </div>
            </div>

            {isExpanded && (
                    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-zinc-800 animate-fadeIn">
                        <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Resumo do Envio</h4>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {Object.entries(summary).map(([key, data]) => {
                                if (data.qty === 0) return null;
                                return (
                                    <div
                                        key={key}
                                        className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded px-3 py-1.5 text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onClickPreview) onClickPreview();
                                        }}
                                    >
                                        <span className="font-bold text-slate-700 dark:text-zinc-300">{key}:</span>
                                        <span className="ml-1 text-slate-500">{data.qty}un</span>
                                        <span className="ml-1 font-mono text-blue-600 dark:text-blue-400">({formatCurrency(data.val)})</span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mb-4">
                            <div className="flex items-center gap-3 mb-2">
                                <input
                                    type="text"
                                    placeholder="Filtrar por código..."
                                    className="flex-1 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm"
                                    value={itemFilter}
                                    onChange={e => {
                                        const nextValue = e.target.value;
                                        startTransition(() => {
                                            setItemFilter(nextValue);
                                        });
                                    }}
                                />
                                <span className="flex-none bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold px-3 py-2 rounded-lg whitespace-nowrap border border-blue-200 dark:border-blue-700">
                                    {filteredItems.length} item(ns) &bull; {formatCurrency(totalFiltrado)}
                                </span>
                            </div>
                        </div>

                        <div className="w-full overflow-x-auto pb-4 mb-4 touch-pan-x border border-gray-200 dark:border-zinc-800 rounded-xl">
                            <div className="min-w-[700px]">
                                <div className="grid grid-cols-[1fr_1fr_1fr_80px_120px_140px] bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 text-xs font-medium px-2 h-9 items-center">
                                    <div className="p-2">Item</div>
                                    <div className="p-2">Modelo</div>
                                    <div className="p-2">Código</div>
                                    <div className="p-2">Qtd</div>
                                    <div className="p-2 text-right">Valor</div>
                                    <div className="p-2">Ações</div>
                                </div>
                                <List
                                    rowCount={filteredItems.length}
                                    rowHeight={44}
                                    rowComponent={HistoryItemRow}
                                    rowProps={historyListData}
                                    style={{ height: Math.min(420, Math.max(48, filteredItems.length * 44)), width: '100%' }}
                                />
                            </div>
                        </div>
                    </div>
                )}

        </Card>
    );
};
