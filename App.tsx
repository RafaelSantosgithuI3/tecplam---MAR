import React, { useState, useEffect, useRef } from 'react';
import { ScrapModule } from './components/ScrapModule';
import { IQCModule } from './components/IQCModule';
import { Layout } from './components/Layout';
import { getScraps } from './services/scrapService';
import { Card } from './components/Card';
import { Button } from './components/Button';
import { Input } from './components/Input';
import { User, ChecklistData, ChecklistItem, ChecklistLog, MeetingLog, ChecklistEvidence, Permission, LineStopData, ConfigItem, Material } from './types';
import { getMaterials } from './services/materialService';
import { ManagementModule } from './components/ManagementModule';
import { PreparationModule } from './components/PreparationModule';
import { MaterialsManager } from './components/MaterialsManager';
import {
    loginUser, logoutUser, getSessionUser, seedAdmin,
    getAllUsers, deleteUser, updateUser, registerUser, updateSessionUser, recoverPassword
} from './services/authService';
import { exportLogToExcel, downloadShiftExcel, exportMeetingToExcel, exportLineStopToExcel } from './services/excelService';
import {
    getChecklistItems, saveChecklistItems, saveLog, getLogs,
    getLines, addLine, deleteLine, getLogsByWeekNumber,
    getRoles, addRole, deleteRole, fileToBase64, getManausDate,
    saveMeeting, getMeetings, getMaintenanceItems,
    getAllChecklistItemsRaw, getPermissions, savePermissions,
    saveLineStop, getLineStops,
    getModels, saveModels, getStations, saveStations, getMissingLeadersForToday
} from './services/storageService';
import { saveServerUrl, getServerUrl, isServerConfigured, apiFetch } from './services/networkConfig';
import {
    CheckSquare, LogOut, UserPlus, AlertCircle,
    Save, ArrowLeft, History, Edit3, Trash2, Plus,
    Settings, Users, List, Search, Calendar, Eye, Download, Wifi, User as UserIcon, Upload, X, UserCheck, Check,
    Camera, FileText, QrCode, Hammer, AlertTriangle, Shield, LayoutDashboard, Clock, Printer, EyeOff, Briefcase, Box, Lock, CheckCircle2, Sun, Moon,
    Truck
} from 'lucide-react';
import jsQR from 'jsqr';

type ViewState = 'SETUP' | 'LOGIN' | 'REGISTER' | 'RECOVER' | 'MENU' | 'CHECKLIST_MENU' | 'AUDIT_MENU' | 'DASHBOARD' | 'ADMIN' | 'SUCCESS' | 'PERSONAL' | 'PROFILE' | 'MEETING_MENU' | 'MEETING_FORM' | 'MEETING_HISTORY' | 'MAINTENANCE_QR' | 'LINE_STOP_DASHBOARD' | 'MANAGEMENT' | 'SCRAP' | 'IQC' | 'PREPARATION';

interface LineStatus {
    status: 'OK' | 'NG' | 'PENDING';
    leaderName?: string;
    logIds: string[];
    details?: string;
}

interface LeaderStatus {
    user: User;
    statuses: { date: string, status: 'OK' | 'NG' | 'PENDING', logId?: string }[];
}

const SECTORS_LIST = [
    'GQ', 'PRODUÇÃO', 'SMD/IAC', 'PRÉ-FORMA',
    'MANUTENÇÃO', 'MATERIAIS', 'PCP',
    'ÁREA TÉCNICA', 'SAMSUNG', 'EXTERNO'
];

const MODULE_NAMES: Record<string, string> = {
    CHECKLIST: 'Checklist (Líder)',
    LINE_STOP: 'Parada de Linha',
    MEETING: 'Reuniões',
    MAINTENANCE: 'Manutenção',
    AUDIT: 'Auditoria',
    ADMIN: 'Administração',
    MANAGEMENT: 'Gestão',
    SCRAP: 'Gestão de SCRAP',
    IQC: 'Painel IQC & Logística',
    PREPARATION: 'Preparação de Linhas'
};

const toTitleCase = (str: string) => str.replace(/\b\w/g, l => l.toUpperCase());

const getWeekNumber = (d: Date) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

const calcTotalTime = (start: string, end: string) => {
    if (!start || !end) return '';
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 24 * 60; // Cross midnight
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

const App = () => {
    // --- THEME STATE ---
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('theme') || 'dark';
        }
        return 'dark';
    });

    const isDark = theme === 'dark';

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    // --- State ---
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [view, setView] = useState<ViewState>('SETUP');
    const [isLoading, setIsLoading] = useState(false);

    // Network Setup
    const [serverIp, setServerIp] = useState('');

    // Auth States
    const [loginMatricula, setLoginMatricula] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [loginError, setLoginError] = useState('');

    // Register States
    const [regName, setRegName] = useState('');
    const [regMatricula, setRegMatricula] = useState('');
    const [regRole, setRegRole] = useState('');
    const [regShift, setRegShift] = useState('1');
    const [regEmail, setRegEmail] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regConfirmPassword, setRegConfirmPassword] = useState('');
    const [regError, setRegError] = useState('');

    // Recover Password State
    // Recover Password State
    const [recoverMatricula, setRecoverMatricula] = useState('');
    const [recoverName, setRecoverName] = useState('');
    const [recoverRole, setRecoverRole] = useState('');

    // Admin Recovery State
    const [recoveryRequests, setRecoveryRequests] = useState<any[]>([]);
    const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
    const [selectedRequest, setSelectedRequest] = useState<any>(null);

    // Configs
    const [availableRoles, setAvailableRoles] = useState<ConfigItem[]>([]);
    const [lines, setLines] = useState<ConfigItem[]>([]);
    const [models, setModels] = useState<string[]>([]);
    const [stations, setStations] = useState<string[]>([]);

    // Permissions State
    const [permissions, setPermissions] = useState<Permission[]>([]);

    // Checklist
    const [items, setItems] = useState<ChecklistItem[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [checklistData, setChecklistData] = useState<ChecklistData>({});
    const [checklistEvidence, setChecklistEvidence] = useState<ChecklistEvidence>({});
    const [observation, setObservation] = useState('');
    const [currentLogId, setCurrentLogId] = useState<string | null>(null);
    const [currentLine, setCurrentLine] = useState('');
    const [showLinePrompt, setShowLinePrompt] = useState(false);

    // Line Stop
    const [lineStopData, setLineStopData] = useState<LineStopData>({
        model: '', client: '', startTime: '', endTime: '', totalTime: '',
        line: '', phase: '', productionLoss: '', standardTime: '',
        peopleStopped: '', stationStart: '', stationEnd: '',
        justification: '', motivo: '', responsibleSector: ''
    });
    const [lineStopTab, setLineStopTab] = useState<'NEW' | 'PENDING' | 'UPLOAD' | 'HISTORY'>('NEW');
    const [lineStopLogs, setLineStopLogs] = useState<ChecklistLog[]>([]);
    const [activeLineStopLog, setActiveLineStopLog] = useState<ChecklistLog | null>(null);
    const [justificationInput, setJustificationInput] = useState('');

    // Maintenance Mode & QR
    const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
    const [maintenanceTarget, setMaintenanceTarget] = useState('');
    const [maintenanceLine, setMaintenanceLine] = useState('');
    const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

    // Meeting States
    const [meetingParticipants, setMeetingParticipants] = useState<string[]>([]);
    const [newParticipant, setNewParticipant] = useState('');
    const [meetingTopics, setMeetingTopics] = useState('');
    const [meetingPhoto, setMeetingPhoto] = useState('');
    const [meetingTitle, setMeetingTitle] = useState('');
    const [meetingStartTime, setMeetingStartTime] = useState('');
    const [meetingEndTime, setMeetingEndTime] = useState('');
    const [meetingHistory, setMeetingHistory] = useState<MeetingLog[]>([]);
    const [previewMeeting, setPreviewMeeting] = useState<MeetingLog | null>(null);

    // Admin / Audit / Management
    const [adminTab, setAdminTab] = useState<'USERS' | 'PERMISSIONS' | 'RECOVERY'>('USERS');
    const [managementTab, setManagementTab] = useState<'LINES' | 'ROLES' | 'MODELS' | 'STATIONS'>('LINES');
    const [auditTab, setAuditTab] = useState<'LEADER_HISTORY' | 'MAINTENANCE_HISTORY' | 'LEADER_EDITOR' | 'MAINTENANCE_EDITOR' | 'LEADERS' | 'LINES' | 'MAINTENANCE_MATRIX'>('LEADER_HISTORY');
    const [historyLogs, setHistoryLogs] = useState<ChecklistLog[]>([]);
    const [usersList, setUsersList] = useState<User[]>([]);

    // Filters Audit
    const [historyDateFilter, setHistoryDateFilter] = useState('');
    const [historyShiftFilter, setHistoryShiftFilter] = useState('ALL');

    // Audit Editors
    const [leaderItems, setLeaderItems] = useState<ChecklistItem[]>([]);
    const [maintenanceItems, setMaintenanceItems] = useState<ChecklistItem[]>([]);

    // Admin User Edit
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [showUserEditModal, setShowUserEditModal] = useState(false);
    const [originalMatriculaEdit, setOriginalMatriculaEdit] = useState('');

    // Audit Lines Dashboard
    const [linesWeekFilter, setLinesWeekFilter] = useState<string>('');
    const [linesShiftFilter, setLinesShiftFilter] = useState('1');
    const [linesMatrix, setLinesMatrix] = useState<{ line: string, statuses: LineStatus[] }[]>([]);
    const [maintenanceMatrix, setMaintenanceMatrix] = useState<{ line: string, statuses: LineStatus[] }[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);

    // Generic Management Input
    const [newItemName, setNewItemName] = useState('');

    // Audit Leaders Dashboard
    const [leadersMatrix, setLeadersMatrix] = useState<LeaderStatus[]>([]);
    const [missingLeadersNames, setMissingLeadersNames] = useState<string[]>([]);

    // Alerts State
    const [pendingLineStopsCount, setPendingLineStopsCount] = useState(0);
    const [pendingScrapCount, setPendingScrapCount] = useState(0);

    // Preview / Personal
    const [personalLogs, setPersonalLogs] = useState<ChecklistLog[]>([]);
    const [previewLog, setPreviewLog] = useState<ChecklistLog | null>(null);

    // Profile Edit
    const [profileData, setProfileData] = useState<User | null>(null);

    // QR Logic Manual
    const [qrCodeManual, setQrCodeManual] = useState('');

    // Scrap Navigation
    const [scrapTab, setScrapTab] = useState<any>(undefined);

    // Refs
    const categoryRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
    const passwordInputRef = useRef<HTMLInputElement>(null);

    const isSuperAdmin = currentUser ? (currentUser.matricula === 'admin' || currentUser.role === 'Admin' || currentUser.isAdmin === true) : false;

    // --- PERMISSION HELPERS ---
    const hasPermission = (module: 'CHECKLIST' | 'MEETING' | 'MAINTENANCE' | 'AUDIT' | 'ADMIN' | 'LINE_STOP' | 'MANAGEMENT' | 'SCRAP' | 'IQC' | 'PREPARATION') => {
        if (!currentUser) return false;
        if (isSuperAdmin) return true;

        const perm = permissions.find(p => p.role === currentUser.role && p.module === module);
        if (perm) return perm.allowed;

        // Defaults
        if (module === 'CHECKLIST') return true;
        if (module === 'MEETING') return true;
        if (module === 'MAINTENANCE') return true;
        if (module === 'LINE_STOP') return true;
        if (module === 'SCRAP') return true;
        if (module === 'IQC') {
            const role = (currentUser.role || '').toUpperCase();
            return role.includes('QUALIDADE') || role.includes('IQC') || role.includes('SUPERVISOR') || role.includes('DIRETOR') || role.includes('GERENTE') || role.includes('ADMIN') || role.includes('FINANCEIRO');
        }
        if (module === 'AUDIT' || module === 'ADMIN' || module === 'MANAGEMENT') return false;

        return false;
    }

    // --- SAFE LOG HELPERS ---
    const getLogTitle = (log: ChecklistLog): string => {
        if (!log) return "Sem Dados";
        const data = (log.data || {}) as LineStopData;
        const model = data.model || "Modelo ND";
        const line = log.line || "Linha ND";

        let shift = (log as any).shift || (log as any).userShift || "ND";
        if (log.userRole && typeof log.userRole === 'string' && log.userRole.includes('Turno')) {
            const parts = log.userRole.split('Turno');
            if (parts[1]) shift = parts[1].trim();
        }

        return `${model} - ${line} - Turno ${shift}`;
    }

    const canUserJustify = (user: User | null, log: ChecklistLog): boolean => {
        if (!user || !log || !log.data) return false;
        const data = log.data as LineStopData;
        const sector = (data.responsibleSector || '').toUpperCase();
        const role = user.role.toUpperCase();

        // 1. Super Usuários e TI
        const generalRoles = ['DIRETOR', 'COORDENADOR', 'SUPERVISOR', 'GERENTE', 'ADMIN', 'TI'];
        if (generalRoles.some(r => role.includes(r)) || user.isAdmin) return true;

        // 2. Regras por Setor
        if (sector && role.includes(sector)) return true;

        if (sector === 'GQ' && ['LÍDER QUALIDADE', 'LÍDER DA QUALIDADE', 'OQC', 'PQC', 'AUDITOR'].some(r => role.includes(r))) return true;
        if (sector === 'ÁREA TÉCNICA' && ['LÍDER REPARO', 'TÉC. REPARO', 'REPARO'].some(r => role.includes(r))) return true;
        if (sector === 'MANUTENÇÃO' && ['TÉC. MANUTENÇÃO', 'MANUTENÇÃO'].some(r => role.includes(r))) return true;
        if (sector === 'PRODUÇÃO' && ['LÍDER DE PRODUÇÃO', 'LÍDER PRODUÇÃO'].some(r => role.includes(r))) return true;
        if (sector.includes('SMD') && role.includes('PQC')) return true;

        return false;
    };

    // --- HANDLERS ---
    const handleStartChecklist = () => {
        setCurrentLine('');
        setChecklistData({});
        setChecklistEvidence({});
        setObservation('');
        setIsMaintenanceMode(false);
        setShowLinePrompt(true);
        setView('CHECKLIST_MENU');
    };

    // --- Effects ---
    useEffect(() => {
        if (isServerConfigured()) {
            const storedIp = getServerUrl();
            if (storedIp) setServerIp(storedIp);
            initApp();
        } else {
            setServerIp('http://10.20.84:3000/');
            setView('SETUP');
        }
    }, []);

    useEffect(() => {
        const handleBack = (e: PopStateEvent) => {
            if (previewLog || previewMeeting || showUserEditModal) {
                e.preventDefault();
                setPreviewLog(null); setPreviewMeeting(null); setShowUserEditModal(false);
            } else if (view !== 'MENU' && view !== 'LOGIN' && view !== 'SETUP') {
                e.preventDefault();
                setView('MENU');
            }
        };

        if (view !== 'LOGIN' && view !== 'SETUP') {
            window.history.pushState(null, '', window.location.href);
        }

        window.addEventListener('popstate', handleBack);
        return () => window.removeEventListener('popstate', handleBack);
        window.addEventListener('popstate', handleBack);
        return () => window.removeEventListener('popstate', handleBack);
    }, [view, previewLog, previewMeeting, showUserEditModal]);

    // --- THEME INIT ---
    useEffect(() => {
        // Verifica preferência salva ou sistema
        const theme = localStorage.getItem('theme');
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        if (theme === 'dark' || (!theme && systemDark)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, []);

    useEffect(() => {
        if (view === 'AUDIT_MENU') {
            const loadAuditDefinitions = async () => {
                try {
                    const lItems = await getChecklistItems('LEADER');
                    const mItems = await getChecklistItems('MAINTENANCE');

                    setLeaderItems(lItems);
                    setMaintenanceItems(mItems);
                    setItems(lItems);
                } catch (e) {
                    console.error("Erro auditoria", e);
                }
            };
            loadAuditDefinitions();
        }

        const fetchData = async () => {
            if ((auditTab === 'LINES' || auditTab === 'MAINTENANCE_MATRIX' || auditTab === 'LEADERS') && linesWeekFilter) {
                setIsLoading(true);
                try {
                    const [y, w] = linesWeekFilter.split('-W').map(Number);
                    const weekLogs = await getLogsByWeekNumber(y, w, linesShiftFilter, usersList);

                    const simpleDate = new Date(y, 0, 1 + (w - 1) * 7);
                    const day = simpleDate.getDay();
                    const diff = simpleDate.getDate() - day + (day === 0 ? -6 : 1);
                    const monday = new Date(simpleDate.setDate(diff));
                    const weekDates = Array.from({ length: 6 }, (_, i) => {
                        const d = new Date(monday);
                        d.setDate(monday.getDate() + i);
                        return d.toISOString().split('T')[0];
                    });

                    if (auditTab === 'LEADERS') {
                        const leaders = usersList.filter(u =>
                            u.role.toLowerCase().includes('líder de produção') ||
                            u.role.toLowerCase().includes('líder do reparo/retrabalho')
                        );

                        const matrix: LeaderStatus[] = leaders.map(leader => {
                            const statuses = weekDates.map(date => {
                                const log = weekLogs.find(l =>
                                    l.userId === leader.matricula &&
                                    l.date.startsWith(date) &&
                                    (l.type === 'PRODUCTION' || !l.type)
                                );

                                if (log) {
                                    return { date, status: log.ngCount > 0 ? 'NG' : 'OK', logId: log.id } as const;
                                }
                                return { date, status: 'PENDING' } as const;
                            });
                            return { user: leader, statuses };
                        });
                        setLeadersMatrix(matrix);

                        const today = getManausDate().toISOString().split('T')[0];
                        const todayIndex = weekDates.indexOf(today);
                        if (todayIndex >= 0) {
                            const missing = matrix.filter(m => m.statuses[todayIndex].status === 'PENDING').map(m => m.user.name);
                            setMissingLeadersNames(missing);
                        } else {
                            setMissingLeadersNames([]);
                        }

                    } else {
                        const isMaint = auditTab === 'MAINTENANCE_MATRIX';
                        const targetLines = lines.map(l => l.name);

                        const matrix = targetLines.map(lineName => {
                            const statuses = weekDates.map(date => {
                                const logsForCell = weekLogs.filter(l =>
                                    l.line === lineName &&
                                    l.date.startsWith(date) &&
                                    (isMaint ? l.type === 'MAINTENANCE' : (l.type === 'PRODUCTION' || !l.type))
                                );

                                if (logsForCell.length > 0) {
                                    const hasNg = logsForCell.some(l => l.ngCount > 0);
                                    return {
                                        status: hasNg ? 'NG' : 'OK',
                                        logIds: logsForCell.map(l => l.id),
                                        leaderName: logsForCell.map(l => l.userName).join(', ')
                                    } as LineStatus;
                                }

                                return { status: 'PENDING', logIds: [] } as LineStatus;
                            });
                            return { line: lineName, statuses };
                        });

                        if (isMaint) setMaintenanceMatrix(matrix);
                        else setLinesMatrix(matrix);
                    }

                } catch (e) {
                    console.error(e);
                } finally {
                    setIsLoading(false);
                }
            } else if (auditTab === 'LEADER_HISTORY' || auditTab === 'MAINTENANCE_HISTORY') {
                setIsLoading(true);
                try {
                    const logs = await getLogs();
                    const isMaint = auditTab === 'MAINTENANCE_HISTORY';
                    let filtered = logs.filter(l => isMaint ? l.type === 'MAINTENANCE' : (l.type === 'PRODUCTION' || !l.type));

                    if (historyDateFilter) {
                        filtered = filtered.filter(l => l.date.startsWith(historyDateFilter));
                    }

                    if (historyShiftFilter !== 'ALL') {
                        filtered = filtered.filter(l => {
                            const u = usersList.find(user => user.matricula === l.userId);
                            return u?.shift === historyShiftFilter;
                        });
                    }
                    setHistoryLogs(filtered);
                } catch (e) { console.error(e); }
                finally { setIsLoading(false); }
            }
        };
        fetchData();
    }, [auditTab, linesWeekFilter, linesShiftFilter, historyDateFilter, historyShiftFilter, usersList, view]);

    useEffect(() => {
        const fetchAlerts = async () => {
            if (view === 'MENU') {
                try {
                    const stops = await getLineStops();
                    // Filter: Only show alert if user can justify the stop
                    const visibleStops = stops.filter(s =>
                        s.status === 'WAITING_JUSTIFICATION' &&
                        canUserJustify(currentUser, s)
                    );
                    setPendingLineStopsCount(visibleStops.length);

                    if (hasPermission('AUDIT') || isSuperAdmin) {
                        const all = await getAllUsers();
                        let missing = await getMissingLeadersForToday(all);

                        const now = getManausDate();
                        const currentMinutes = now.getHours() * 60 + now.getMinutes();
                        // --- ADICIONE ESTE BLOCO DE FILTRO ---
                        missing = missing.filter(leader => {
                            const role = (leader.role || '').toLowerCase();
                            // Define quais palavras-chave ativam o alerta
                            return role.includes('líder de produção') ||
                                role.includes('líder do reparo/retrabalho')
                        });
                        // -------------------------------------
                        missing = missing.filter(leader => {
                            const shift = leader.shift || '1';
                            if (shift === '1') {
                                return currentMinutes >= 450;
                            } else if (shift === '2') {
                                return currentMinutes >= 1040 || currentMinutes < 480;
                            }
                            return true;
                        });

                        setMissingLeadersNames(missing.map(u => u.name));
                    }
                } catch (e) {
                    console.error("Erro ao buscar alertas", e);
                }
            }
        };
        fetchAlerts();
    }, [view, currentUser]);

    useEffect(() => {
        const fetchAlerts = async () => {
            if (view === 'MENU') {
                // ... existing menu alerts ...
            }

            if (view === 'ADMIN' && adminTab === 'RECOVERY') {
                try {
                    const reqs = await apiFetch('/admin/recovery-requests');
                    setRecoveryRequests(reqs);
                } catch (e) { console.error(e); }
            }
        };
        fetchAlerts();
    }, [view, adminTab, currentUser]);

    const initApp = async () => {
        setIsLoading(true);
        try {
            await seedAdmin();
            const user = getSessionUser();
            const loadLines = await getLines();
            setLines(loadLines);
            if (loadLines.length > 0) setMaintenanceLine(loadLines[0].name);
            const loadRoles = await getRoles();
            setAvailableRoles(loadRoles);
            if (loadRoles.length > 0 && !user) setRegRole(loadRoles[0].name);
            const loadModels = await getModels();
            setModels(loadModels);
            const loadStations = await getStations();
            setStations(await getStations());
            setMaterials(await getMaterials());
            const perms = await getPermissions();
            setPermissions(perms);
            const users = await getAllUsers();
            setUsersList(users);
            const now = getManausDate();
            setLinesWeekFilter(`${now.getFullYear()}-W${getWeekNumber(now).toString().padStart(2, '0')}`);

            if (user) {
                setCurrentUser(user);
                setView('MENU');
                fetchInitialData(user);
            } else {
                setLoginMatricula('');
                setLoginPassword('');
                setView('LOGIN');
            }
        } catch (e) {
            console.error("Erro ao inicializar:", e);
            alert("Não foi possível conectar ao servidor. Verifique o IP.");
            setView('SETUP');
        } finally {
            setIsLoading(false);
        }
    }

    const fetchInitialData = async (user: User) => {
        const logs = await getLogs();
        const myLogs = logs.filter(l => l.userId === user.matricula);
        setPersonalLogs(myLogs);

        if (user) {
            setProfileData({ ...user });
        }

        const meetings = await getMeetings();
        setMeetingHistory(meetings);
    }

    useEffect(() => {
        const loadConfigs = async () => {
            // ... existing config load logic
        };
        loadConfigs();

        const fetchAlerts = async () => {
            if (view === 'MENU') {
                try {
                    const stops = await getLineStops();
                    // Filter: Only show alert if user can justify the stop
                    const visibleStops = stops.filter(s =>
                        s.status === 'WAITING_JUSTIFICATION' &&
                        canUserJustify(currentUser, s)
                    );
                    setPendingLineStopsCount(visibleStops.length);

                    const allScraps = await getScraps();
                    const myPending = allScraps.filter(s => s.leaderName === currentUser?.name && !s.countermeasure);
                    setPendingScrapCount(myPending.length);
                } catch (e) { console.error(e); }
            }
        };
        fetchAlerts();
    }, [view, currentUser]);

    useEffect(() => {
        if (view === 'LINE_STOP_DASHBOARD') {
            const loadLineStops = async () => {
                setIsLoading(true);
                const stops = await getLineStops();

                const normalizedStops = stops.map(s => ({
                    ...s,
                    userName: s.userName || (s as any).user_name || 'Desconhecido',
                    userRole: s.userRole || (s as any).user_role || '',
                    userId: s.userId || (s as any).user_id || ''
                }));

                setLineStopLogs(normalizedStops);
                setIsLoading(false);
            }
            loadLineStops();
        }
    }, [view, lineStopTab]);

    const handleLogout = () => {
        logoutUser();
        setCurrentUser(null);
        setProfileData(null);
        setView('LOGIN');
        setLoginMatricula('');
        setLoginPassword('');
    };

    const initMeetingForm = () => {
        setMeetingTitle('');
        setMeetingStartTime('');
        setMeetingEndTime('');
        setMeetingPhoto('');
        setMeetingParticipants([]);
        setMeetingTopics('');
        setNewParticipant('');
    };

    const handleOpenPreview = async (logId: string) => {
        setIsLoading(true);
        try {
            const logs = await getLogs();
            const log = logs.find(l => l.id === logId);
            if (log) {
                setPreviewLog(log);
            } else {
                const stops = await getLineStops();
                const stop = stops.find(l => l.id === logId || (l.id && l.id.toString() === logId));
                if (stop) {
                    stop.userName = stop.userName || (stop as any).user_name || 'Desconhecido';
                    stop.userRole = stop.userRole || (stop as any).user_role || '';
                    setPreviewLog(stop);
                } else {
                    alert("Log não encontrado ou removido.");
                }
            }
        } catch (e) {
            console.error(e);
            alert("Erro ao buscar detalhes.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownloadSheet = async (lineName: string) => {
        if (!linesWeekFilter) {
            alert("Selecione uma semana.");
            return;
        }
        setIsLoading(true);
        try {
            const itemsToUse = await getChecklistItems('LEADER');
            await downloadShiftExcel(lineName, linesShiftFilter, linesWeekFilter, itemsToUse);
        } catch (e) {
            console.error(e);
            alert("Erro ao baixar planilha.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogin = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setIsLoading(true);
        setLoginError('');
        const res = await loginUser(loginMatricula, loginPassword);
        setIsLoading(false);
        if (res.success && res.user) {
            setCurrentUser(res.user);
            setView('MENU');
            fetchInitialData(res.user);
        } else {
            setLoginError(res.message);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (regPassword !== regConfirmPassword) {
            setRegError("As senhas não coincidem.");
            return;
        }
        setIsLoading(true);
        setRegError('');
        const res = await registerUser({
            name: regName, matricula: regMatricula, role: regRole,
            shift: regShift, email: regEmail, password: regPassword
        });
        setIsLoading(false);
        if (res.success) {
            alert("Cadastro realizado com sucesso! Faça login.");
            setView('LOGIN');
        } else {
            setRegError(res.message);
        }
    };

    const handleRecover = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        const res = await recoverPassword(recoverMatricula, recoverName, recoverRole);
        setIsLoading(false);
        if (res.success) {
            alert(res.message);
            setView('LOGIN');
        } else {
            alert(res.message);
        }
    };

    const handleAdminResetPassword = async () => {
        if (!selectedRequest || !recoveryNewPassword) return;
        setIsLoading(true);
        try {
            await apiFetch('/admin/reset-password', {
                method: 'POST',
                body: JSON.stringify({
                    requestId: selectedRequest.id,
                    matricula: selectedRequest.matricula,
                    newPassword: recoveryNewPassword
                })
            });
            alert('Senha redefinida com sucesso!');
            setRecoveryRequests(prev => prev.filter(r => r.id !== selectedRequest.id));
            setSelectedRequest(null);
            setRecoveryNewPassword('');
        } catch (e: any) {
            alert(e.message || 'Erro ao redefinir');
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmLine = async () => {
        if (!currentLine) {
            alert("Selecione uma linha!");
            return;
        }
        setShowLinePrompt(false);

        const loadedItems = await getChecklistItems(isMaintenanceMode ? 'MAINTENANCE' : 'LEADER');
        setItems(loadedItems);
        setCategories(Array.from(new Set(loadedItems.map(i => i.category))));

        const initialData: ChecklistData = {};
        loadedItems.forEach(i => initialData[i.id] = 'OK');
        setChecklistData({});
        setChecklistEvidence({});
        setObservation('');
        setCurrentLogId(null);

        setView(isMaintenanceMode ? 'DASHBOARD' : 'DASHBOARD');
    };

    const handleNgComment = (itemId: string, text: string) => {
        setChecklistEvidence(prev => ({
            ...prev,
            [itemId]: { ...prev[itemId], comment: text }
        }));
    };

    const handleNgPhoto = async (itemId: string, file: File) => {
        try {
            const base64 = await fileToBase64(file);
            setChecklistEvidence(prev => ({
                ...prev,
                [itemId]: { ...prev[itemId], photo: base64 }
            }));
        } catch (e) {
            console.error(e);
        }
    };

    const handleSaveProfile = async () => {
        if (!profileData) return;
        setIsLoading(true);
        try {
            await updateUser(profileData, currentUser?.matricula);
            updateSessionUser(profileData);
            setCurrentUser(profileData);
            alert("Perfil atualizado!");
        } catch (e) {
            alert("Erro ao atualizar perfil.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleMeetingPhoto = async (file: File) => {
        const base64 = await fileToBase64(file);
        setMeetingPhoto(base64);
    };

    const handleAddParticipant = () => {
        if (newParticipant.trim()) {
            setMeetingParticipants([...meetingParticipants, newParticipant.trim()]);
            setNewParticipant('');
        }
    };

    const handleRemoveParticipant = (idx: number) => {
        setMeetingParticipants(meetingParticipants.filter((_, i) => i !== idx));
    };

    const handleSaveMeeting = async () => {
        if (!meetingTitle || !meetingStartTime || !meetingEndTime || !meetingPhoto) {
            alert("Preencha todos os campos obrigatórios e a foto.");
            return;
        }
        setIsLoading(true);
        const meeting: MeetingLog = {
            id: Date.now().toString(),
            title: meetingTitle,
            date: new Date().toISOString(),
            startTime: meetingStartTime,
            endTime: meetingEndTime,
            photoUrl: meetingPhoto,
            participants: meetingParticipants,
            topics: meetingTopics,
            createdBy: currentUser?.name || 'Desconhecido'
        };
        await saveMeeting(meeting);
        setIsLoading(false);
        alert("Ata salva com sucesso!");
        setView('MEETING_MENU');
    };

    const handleMaintenanceQrPhoto = async (file: File) => {
        setIsProcessingPhoto(true);
        try {
            const base64 = await fileToBase64(file);
            const image = new Image();
            image.src = base64;
            image.onload = async () => {
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");
                if (!context) return;
                canvas.width = image.width;
                canvas.height = image.height;
                context.drawImage(image, 0, 0);
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

                const code = jsQR(imageData.data, imageData.width, imageData.height);
                if (code) {
                    await handleMaintenanceCode(code.data);
                } else {
                    alert("QR Code não encontrado na imagem.");
                }
                setIsProcessingPhoto(false);
            };
        } catch (e) {
            setIsProcessingPhoto(false);
            alert("Erro ao processar imagem.");
        }
    };

    const handleMaintenanceCode = async (code: string) => {
        setMaintenanceTarget(code);
        setIsMaintenanceMode(true);

        const loadedItems = await getMaintenanceItems(code);
        if (loadedItems.length === 0) {
            alert("Nenhum checklist configurado para este código de máquina: " + code);
            return;
        }

        setItems(loadedItems);
        setCategories(Array.from(new Set(loadedItems.map(i => i.category))));
        setChecklistData({});
        setChecklistEvidence({});
        setObservation('');
        setCurrentLogId(null);

        setView('DASHBOARD');
    };

    const handleSaveLineStop = async () => {
        if (!lineStopData.model || !lineStopData.line || !lineStopData.motivo || !lineStopData.responsibleSector) {
            alert("Preencha todos os campos obrigatórios (Modelo, Linha, Motivo, Setor)");
            return;
        }
        if (!currentUser) return;

        setIsLoading(true);
        const log: ChecklistLog = {
            id: "", // ID vazio força INSERT no backend
            userId: currentUser.matricula,
            userName: currentUser.name,
            userRole: currentUser.role,
            userShift: currentUser.shift || '1',
            line: lineStopData.line || '',
            date: new Date().toISOString(),
            itemsCount: 0,
            ngCount: 0,
            observation: '',
            data: lineStopData as unknown as ChecklistData,
            type: 'LINE_STOP',
            status: 'WAITING_JUSTIFICATION'
        };

        await saveLineStop(log);
        setIsLoading(false);
        alert("Parada reportada com sucesso!");
        setLineStopTab('PENDING');
    };

    const handleSaveJustification = async () => {
        if (!activeLineStopLog || !justificationInput.trim()) {
            alert("Digite uma justificativa.");
            return;
        }
        if (!currentUser) return;

        const updatedData: LineStopData = {
            ...(activeLineStopLog.data as LineStopData),
            justification: justificationInput,
            justifiedBy: currentUser.name,
            justifiedAt: new Date().toISOString()
        };

        const updatedLog: ChecklistLog = {
            ...activeLineStopLog,
            data: updatedData as unknown as ChecklistData,
            status: 'WAITING_SIGNATURE'
        };

        setIsLoading(true);
        await saveLineStop(updatedLog);
        setIsLoading(false);
        alert("Justificativa salva! Agora imprima e colete as assinaturas.");
        setActiveLineStopLog(null);
        setLineStopTab('UPLOAD');
    };

    const handleUploadSignedDoc = async (file: File) => {
        if (!activeLineStopLog) return;
        try {
            setIsLoading(true);
            const base64 = await fileToBase64(file);

            const updatedLog: ChecklistLog = {
                ...activeLineStopLog,
                signedDocUrl: base64,
                status: 'COMPLETED'
            };

            await saveLineStop(updatedLog);
            setIsLoading(false);
            alert("Upload realizado com sucesso! Processo finalizado.");
            setActiveLineStopLog(null);
            setLineStopTab('HISTORY');
        } catch (e) {
            setIsLoading(false);
            alert("Erro ao fazer upload.");
        }
    };

    // --- MANAGEMENT HANDLERS ---
    const handleAddItem = async (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, saveFn: (l: string[]) => Promise<void>) => {
        if (newItemName && !list.includes(newItemName)) {
            setIsLoading(true);
            try {
                const newList = [...list, newItemName];
                setList(newList);
                await saveFn(newList);
                setNewItemName('');
            } catch (e) { alert("Erro ao salvar."); } finally { setIsLoading(false); }
        }
    }

    const handleDeleteItem = async (item: string, list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, saveFn: (l: string[]) => Promise<void>) => {
        if (confirm(`Excluir ${item}?`)) {
            setIsLoading(true);
            try {
                const newList = list.filter(x => x !== item);
                setList(newList);
                await saveFn(newList);
            } catch (e) { alert("Erro ao excluir."); } finally { setIsLoading(false); }
        }
    }

    // --- MANAGEMENT HANDLERS (CORRIGIDOS) ---

    const handleAddLine = async () => {
        if (!newItemName || !newItemName.trim()) return;
        setIsLoading(true);
        try {
            // Envia o nome limpo para o backend
            await addLine(newItemName.trim());
            // Busca a lista atualizada do banco para garantir sincronia
            const updatedList = await getLines();
            setLines(updatedList);
            setNewItemName('');
        } catch (e: any) {
            console.error("Erro ao salvar linha:", e);
            alert("Erro ao salvar linha: " + (e.message || "Verifique o console"));
        } finally {
            setIsLoading(false);
        }
    }

    const handleDeleteLine = async (id: number | string) => {
        if (!confirm("Excluir esta Linha?")) return;
        setIsLoading(true);
        try {
            await deleteLine(id);
            const updatedList = await getLines();
            setLines(updatedList);
        } catch (e: any) {
            console.error("Erro ao excluir linha:", e);
            alert("Erro ao excluir linha: " + (e.message || "Verifique o console"));
        } finally {
            setIsLoading(false);
        }
    }

    const handleAddRole = async () => {
        if (!newItemName || !newItemName.trim()) return;
        setIsLoading(true);
        try {
            await addRole(newItemName.trim());
            const updatedList = await getRoles();
            setAvailableRoles(updatedList);
            setNewItemName('');
        } catch (e: any) {
            console.error("Erro ao salvar cargo:", e);
            alert("Erro ao salvar cargo: " + (e.message || "Verifique o console"));
        } finally {
            setIsLoading(false);
        }
    }

    const handleDeleteRole = async (id: number | string) => {
        if (!confirm("Excluir este Cargo?")) return;
        setIsLoading(true);
        try {
            await deleteRole(id);
            const updatedList = await getRoles();
            setAvailableRoles(updatedList);
        } catch (e: any) {
            console.error("Erro ao excluir cargo:", e);
            alert("Erro ao excluir cargo: " + (e.message || "Verifique o console"));
        } finally {
            setIsLoading(false);
        }
    }
    const openEditModal = (user: User) => {
        setEditingUser({ ...user, password: '' });
        setOriginalMatriculaEdit(user.matricula);
        setShowUserEditModal(true);
    }

    const saveUserChanges = async () => {
        if (!editingUser) return;
        setIsLoading(true);
        try {
            await updateUser(editingUser, originalMatriculaEdit);
            setUsersList(await getAllUsers());
            setShowUserEditModal(false);
        } catch (e) {
            alert("Erro ao salvar.");
        } finally {
            setIsLoading(false);
        }
    }

    const handleTogglePermission = (role: string, module: 'CHECKLIST' | 'MEETING' | 'MAINTENANCE' | 'AUDIT' | 'ADMIN' | 'LINE_STOP' | 'MANAGEMENT') => {
        const existing = permissions.find(p => p.role === role && p.module === module);
        const newVal = existing ? !existing.allowed : true;
        const newPerm: Permission = { role, module, allowed: newVal };
        const otherPerms = permissions.filter(p => !(p.role === role && p.module === module));
        const updatedList = [...otherPerms, newPerm];
        setPermissions(updatedList);
        savePermissions(updatedList).catch(err => console.error("Falha ao salvar a permissão", err));
    }

    const handleEditorChange = (list: ChecklistItem[], setList: React.Dispatch<React.SetStateAction<ChecklistItem[]>>, id: string, field: keyof ChecklistItem, value: string) => {
        setList(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    }

    const handleEditorImage = async (list: ChecklistItem[], setList: React.Dispatch<React.SetStateAction<ChecklistItem[]>>, id: string, file: File) => {
        try {
            const base64 = await fileToBase64(file);
            setList(prev => prev.map(i => i.id === id ? { ...i, imageUrl: base64 } : i));
        } catch (e) { alert("Erro na imagem"); }
    }

    const handleEditorRemoveImage = (list: ChecklistItem[], setList: React.Dispatch<React.SetStateAction<ChecklistItem[]>>, id: string) => {
        setList(prev => prev.map(i => i.id === id ? { ...i, imageUrl: '' } : i));
    }

    const handleEditorAdd = async (list: ChecklistItem[], setList: React.Dispatch<React.SetStateAction<ChecklistItem[]>>, type: 'LEADER' | 'MAINTENANCE') => {
        const newId = Date.now().toString();
        const category = type === 'MAINTENANCE'
            ? `${maintenanceLine} - Nova Máquina`
            : 'GERAL';

        const newItem: ChecklistItem = {
            id: newId,
            category: category,
            text: 'Novo Item...',
            evidence: '',
            type: type
        };
        setList(prev => [...prev, newItem]);
    }

    const handleEditorDelete = (list: ChecklistItem[], setList: React.Dispatch<React.SetStateAction<ChecklistItem[]>>, id: string) => {
        if (confirm("Excluir item?")) {
            setList(prev => prev.filter(i => i.id !== id));
        }
    }

    const handleSaveEditor = async (targetList: ChecklistItem[], type: 'LEADER' | 'MAINTENANCE') => {
        if (confirm("Salvar alterações?")) {
            setIsLoading(true);
            try {
                const allItems = await getAllChecklistItemsRaw();
                const otherItems = allItems.filter(i => (i.type || 'LEADER') !== type);
                const merged = [...otherItems, ...targetList];
                await saveChecklistItems(merged);
                alert("Salvo com sucesso!");
            } catch (e) {
                alert("Erro ao salvar.");
            } finally {
                setIsLoading(false);
            }
        }
    }

    const printQrCode = (text: string) => {
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;
        const win = window.open('', '_blank');
        if (win) {
            win.document.write(`<html><head><title>QR Code - ${text}</title></head><body style="text-align:center; font-family:sans-serif;"><h1>${text}</h1><img src="${url}" style="width:300px;height:300px;"/><br/><br/><button onclick="window.print()">Imprimir</button></body></html>`);
            win.document.close();
        }
    }

    const renderPreviewModal = () => {
        if (!previewLog) return null;
        const lineStopDataRaw = previewLog.type === 'LINE_STOP' ? (previewLog.data as LineStopData) : null;
        const signedUrl = previewLog.signedDocUrl || (previewLog.data as any)?.signedDocUrl;
        const evidencePhoto = previewLog.evidenceData?.['signed_doc']?.photo || signedUrl;

        return (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <Card className="w-[95%] md:w-full md:max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                    <div className="flex justify-between items-center mb-6 sticky top-0 bg-white dark:bg-zinc-900 pt-2 pb-4 z-10 border-b border-slate-200 dark:border-zinc-800">
                        <div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Detalhes do Checklist</h3>
                            <p className="text-slate-500 dark:text-zinc-400 text-sm">{new Date(previewLog.date).toLocaleString()} • {previewLog.userName}</p>
                        </div>
                        <button onClick={() => setPreviewLog(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors"><X size={24} className="text-slate-500 dark:text-zinc-500" /></button>
                    </div>

                    {previewLog.type === 'LINE_STOP' && lineStopDataRaw ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="bg-slate-50 dark:bg-zinc-950 p-3 rounded border border-slate-200 dark:border-zinc-800">
                                    <span className="block text-slate-500 dark:text-zinc-500 text-xs font-bold uppercase">Linha</span>
                                    <span className="text-slate-900 dark:text-white font-medium">{previewLog.line}</span>
                                </div>
                                <div className="bg-slate-50 dark:bg-zinc-950 p-3 rounded border border-slate-200 dark:border-zinc-800">
                                    <span className="block text-slate-500 dark:text-zinc-500 text-xs font-bold uppercase">Modelo</span>
                                    <span className="text-slate-900 dark:text-white font-medium">{lineStopDataRaw.model}</span>
                                </div>
                                <div className="bg-slate-50 dark:bg-zinc-950 p-3 rounded border border-slate-200 dark:border-zinc-800">
                                    <span className="block text-slate-500 dark:text-zinc-500 text-xs font-bold uppercase">Tempo Parado</span>
                                    <span className="text-red-500 dark:text-red-400 font-bold">{lineStopDataRaw.totalTime}</span>
                                </div>
                                <div className="bg-slate-50 dark:bg-zinc-950 p-3 rounded border border-slate-200 dark:border-zinc-800">
                                    <span className="block text-slate-500 dark:text-zinc-500 text-xs font-bold uppercase">Setor</span>
                                    <span className="text-slate-900 dark:text-white font-medium">{lineStopDataRaw.responsibleSector}</span>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded border border-slate-200 dark:border-zinc-800">
                                <span className="block text-slate-500 dark:text-zinc-500 text-xs font-bold uppercase mb-2">Motivo</span>
                                <p className="text-slate-800 dark:text-zinc-300">{lineStopDataRaw.motivo}</p>
                            </div>
                            {lineStopDataRaw.justification && (
                                <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded border border-slate-200 dark:border-zinc-800">
                                    <span className="block text-slate-500 dark:text-zinc-500 text-xs font-bold uppercase mb-2">Justificativa</span>
                                    <p className="text-slate-800 dark:text-zinc-300">{lineStopDataRaw.justification}</p>
                                    <p className="text-slate-500 dark:text-zinc-500 text-xs mt-2 italic">Por {lineStopDataRaw.justifiedBy} em {new Date(lineStopDataRaw.justifiedAt || '').toLocaleString()}</p>
                                </div>
                            )}
                            {evidencePhoto && (
                                <div className="mt-4">
                                    <span className="block text-slate-500 dark:text-zinc-500 text-xs font-bold uppercase mb-2">Documento Assinado / Evidência</span>
                                    <img src={evidencePhoto} className="max-w-full rounded border border-slate-200 dark:border-zinc-700" />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex gap-4">
                                <div className="flex-1 bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 text-center">
                                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{previewLog.itemsCount}</div>
                                    <div className="text-xs text-slate-500 dark:text-zinc-500 uppercase">Itens</div>
                                </div>
                                <div className="flex-1 bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 text-center">
                                    <div className={`text-2xl font-bold ${previewLog.ngCount > 0 ? 'text-red-600 dark:text-red-500' : 'text-green-600 dark:text-green-500'}`}>{previewLog.ngCount}</div>
                                    <div className="text-xs text-slate-500 dark:text-zinc-500 uppercase">Não Conforme</div>
                                </div>
                            </div>

                            {previewLog.ngCount > 0 && (
                                <div>
                                    <h4 className="text-red-400 font-bold mb-3 flex items-center gap-2"><AlertTriangle size={16} /> Itens Reprovados</h4>
                                    <div className="space-y-3">
                                        {Object.entries(previewLog.data as ChecklistData).map(([itemId, status]) => {
                                            if (status !== 'NG') return null;
                                            const itemDef = items.find(i => i.id === itemId)
                                                || (previewLog.itemsSnapshot?.find((s: any) => s.id === itemId))
                                                || { text: `Item ID: ${itemId} (Verificar na planilha)` };

                                            const evidence = previewLog.evidenceData?.[itemId];
                                            return (
                                                <div key={itemId} className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 p-4 rounded-lg">
                                                    <p className="font-medium text-slate-900 dark:text-zinc-200 mb-2">{itemDef.text}</p>
                                                    {evidence?.comment && <p className="text-sm text-red-600 dark:text-red-300 mb-2">Obs: {evidence.comment}</p>}
                                                    {evidence?.photo && (
                                                        <img src={evidence.photo} className="h-32 rounded border border-red-200 dark:border-red-900/50" />
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {previewLog.observation && (
                                <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-200 dark:border-zinc-800">
                                    <h4 className="text-slate-500 dark:text-zinc-400 font-bold text-sm uppercase mb-2">Observações</h4>
                                    <p className="text-slate-800 dark:text-zinc-300">{previewLog.observation}</p>
                                </div>
                            )}

                            <div className="flex justify-end pt-4">
                                <Button variant="outline" onClick={() => exportLogToExcel(previewLog!, items)}><Download size={16} /> Baixar Excel</Button>
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        );
    }

    const renderMeetingPreviewModal = () => {
        if (!previewMeeting) return null;
        return (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <Card className="w-[95%] md:w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                    <div className="flex justify-between items-center mb-6 border-b border-slate-200 dark:border-zinc-800 pb-4">
                        <div className="bg-white dark:bg-zinc-900 pb-4">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Visualizar Ata</h3>
                            <p className="text-slate-500 dark:text-zinc-400 text-sm">{new Date(previewMeeting.date).toLocaleDateString()}</p>
                        </div>
                        <button onClick={() => setPreviewMeeting(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors"><X size={24} className="text-slate-500 dark:text-zinc-500" /></button>
                    </div>
                    <div className="space-y-6">
                        <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-200 dark:border-zinc-800">
                            <h4 className="text-blue-600 dark:text-blue-400 font-bold text-lg mb-1">{previewMeeting.title}</h4>
                            <p className="text-sm text-slate-500 dark:text-zinc-400">Horário: {previewMeeting.startTime} - {previewMeeting.endTime}</p>
                            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-2">Registrado por: {previewMeeting.createdBy || 'Sistema'}</p>
                        </div>

                        <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-200 dark:border-zinc-800">
                            <h5 className="font-bold text-slate-700 dark:text-zinc-300 mb-2 uppercase text-xs">Participantes</h5>
                            <div className="flex flex-wrap gap-2">
                                {previewMeeting.participants.map((p, idx) => (
                                    <span key={idx} className="bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 px-3 py-1 rounded-full text-xs border border-slate-300 dark:border-zinc-700">{p}</span>
                                ))}
                            </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-200 dark:border-zinc-800">
                            <h5 className="font-bold text-slate-700 dark:text-zinc-300 mb-2 uppercase text-xs">Assuntos Tratados</h5>
                            <p className="text-slate-800 dark:text-zinc-300 text-sm whitespace-pre-wrap">{previewMeeting.topics}</p>
                        </div>

                        {previewMeeting.photoUrl && (
                            <div>
                                <h5 className="font-bold text-slate-500 dark:text-zinc-400 mb-2 uppercase text-xs">Foto da Reunião</h5>
                                <img src={previewMeeting.photoUrl} className="w-full rounded-lg border border-slate-200 dark:border-zinc-700" alt="Reunião" />
                            </div>
                        )}

                        <div className="flex justify-end pt-2">
                            <Button onClick={() => exportMeetingToExcel(previewMeeting!)}><Download size={16} /> Baixar Excel</Button>
                        </div>
                    </div>
                </Card>
            </div>
        )
    }

    // --- Components for Sidebar ---

    const SidebarContent = () => {
        const navItemClass = (active: boolean) =>
            `flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-all ${active
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`;

        return (
            <div className="flex flex-col h-full">
                <div className="p-4 border-b border-slate-200 dark:border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-blue-900/20 overflow-hidden">
                            <img src="/logo.png" className="w-full h-full object-contain" alt="LC" />
                        </div>
                        <div>
                            <h1 className="font-bold text-slate-900 dark:text-zinc-100 leading-tight tracking-tight">TECPLAM</h1>
                            <p className="text-slate-500 dark:text-zinc-500 text-[9px] uppercase tracking-widest font-semibold leading-tight">Monitoramento</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
                    <button onClick={() => setView('MENU')} className={navItemClass(view === 'MENU')}>
                        <LayoutDashboard size={18} /> Menu Principal
                    </button>

                    {hasPermission('CHECKLIST') && (
                        <>
                            <div className="text-xs font-bold text-slate-500 dark:text-zinc-600 uppercase tracking-widest mt-6 mb-2 px-4">Operação</div>
                            <button onClick={handleStartChecklist} className={navItemClass(view === 'CHECKLIST_MENU' || view === 'DASHBOARD' || view === 'PERSONAL')}>
                                <CheckSquare size={18} /> Checklist
                            </button>
                        </>
                    )}

                    {hasPermission('LINE_STOP') && (
                        <button onClick={() => setView('LINE_STOP_DASHBOARD')} className={navItemClass(view === 'LINE_STOP_DASHBOARD')}>
                            <AlertTriangle size={18} /> Parada de Linha
                        </button>
                    )}

                    {hasPermission('MAINTENANCE') && (
                        <button onClick={() => setView('MAINTENANCE_QR')} className={navItemClass(view === 'MAINTENANCE_QR')}>
                            <Hammer size={18} /> Manutenção
                        </button>
                    )}

                    {hasPermission('MEETING') && (
                        <button onClick={() => { initMeetingForm(); setView('MEETING_MENU'); }} className={navItemClass(view === 'MEETING_MENU' || view === 'MEETING_FORM' || view === 'MEETING_HISTORY')}>
                            <FileText size={18} /> Reuniões
                        </button>
                    )}

                    {(hasPermission('AUDIT') || hasPermission('ADMIN') || hasPermission('MANAGEMENT')) && (
                        <div className="text-xs font-bold text-gray-500 dark:text-zinc-600 uppercase tracking-widest mt-6 mb-2 px-4">Gestão</div>
                    )}

                    {hasPermission('AUDIT') && (
                        <button onClick={() => { setView('AUDIT_MENU'); setAuditTab('LEADER_HISTORY'); }} className={navItemClass(view === 'AUDIT_MENU')}>
                            <Search size={18} /> Auditoria
                        </button>
                    )}

                    {hasPermission('MANAGEMENT') && (
                        <button onClick={() => setView('MANAGEMENT')} className={navItemClass(view === 'MANAGEMENT')}>
                            <Briefcase size={18} /> Gestão
                        </button>
                    )}

                    {hasPermission('ADMIN') && (
                        <button onClick={() => setView('ADMIN')} className={navItemClass(view === 'ADMIN')}>
                            <Shield size={18} /> Admin
                        </button>
                    )}

                    <button onClick={() => setView('SCRAP')} className={navItemClass(view === 'SCRAP')}>
                        <AlertTriangle size={18} /> Gestão de SCRAP
                    </button>
                    {hasPermission('IQC') && (
                        <button onClick={() => setView('IQC')} className={navItemClass(view === 'IQC')}>
                            <Truck size={18} /> Painel IQC
                        </button>
                    )}
                </nav>

                <div className="p-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50">
                    <div className="flex items-center justify-between gap-2">
                        {/* User Info */}
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('PROFILE')}>
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-zinc-700 flex items-center justify-center text-slate-700 dark:text-zinc-300 font-bold border border-slate-300 dark:border-zinc-600">
                                {currentUser?.name.charAt(0)}
                            </div>
                            <div className="block pl-2">
                                <p className="text-xs font-bold text-slate-700 dark:text-zinc-200 truncate max-w-[100px]">{currentUser?.name.split(' ')[0]}</p>
                                <p className="text-[10px] text-slate-500 dark:text-zinc-500 truncate">{currentUser?.role}</p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1">
                            <button
                                onClick={toggleTheme}
                                className="p-2 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-lg text-slate-600 dark:text-zinc-400 transition-colors"
                                title="Alternar Tema"
                            >
                                {isDark ? <Sun size={18} /> : <Moon size={18} />}
                            </button>
                            <button
                                onClick={handleLogout}
                                className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                                title="Sair"
                            >
                                <LogOut size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // --- RENDER VIEWS ---

    if (view === 'RECOVER') return (
        <Layout variant="auth" onToggleTheme={toggleTheme} isDark={isDark}>
            <div className="flex flex-col items-center justify-center min-h-screen px-4">
                <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-2xl p-8 shadow-2xl w-full max-w-md">
                    <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white text-center">Solicitar Recuperação</h2>
                    <p className="text-sm text-slate-500 dark:text-zinc-400 mb-6 text-center">Informe seus dados para solicitar o reset ao Admin.</p>
                    <form onSubmit={handleRecover} className="space-y-4">
                        <Input label="Matrícula" value={recoverMatricula} onChange={e => setRecoverMatricula(e.target.value)} icon={<UserIcon size={18} />} />
                        <Input label="Nome Completo" value={recoverName} onChange={e => setRecoverName(toTitleCase(e.target.value))} icon={<UserIcon size={18} />} />
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1.5 uppercase tracking-wide">Função</label>
                            <select className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600/50 outline-none" value={recoverRole} onChange={e => setRecoverRole(e.target.value)}>
                                <option value="">Selecione...</option>
                                {availableRoles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                            </select>
                        </div>
                        <Button fullWidth type="submit" disabled={isLoading}>{isLoading ? 'Enviando...' : 'Solicitar Reset'}</Button>
                    </form>
                    <div className="mt-4 pt-4 border-t border-zinc-800/50">
                        <Button variant="ghost" fullWidth onClick={() => setView('LOGIN')}>Voltar ao Login</Button>
                    </div>
                </div>
            </div>
        </Layout>
    );

    if (view === 'SETUP') return (
        <Layout variant="auth" onToggleTheme={toggleTheme} isDark={isDark}>
            <div className="flex flex-col items-center justify-center min-h-screen px-4">
                <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-2xl p-8 shadow-2xl w-full max-w-md">
                    <h1 className="text-2xl font-bold text-center mb-4 text-slate-900 dark:text-white">Configuração de Rede</h1>
                    <Input label="IP do Servidor" value={serverIp} onChange={e => setServerIp(e.target.value)} placeholder="http://192.168.X.X:3000" />
                    <Button onClick={async () => { if (serverIp) { saveServerUrl(serverIp); await initApp(); } }} fullWidth className="mt-6">Conectar</Button>
                </div>
            </div>
        </Layout>
    );

    if (view === 'LOGIN') {
        return (
            <Layout variant="auth" onToggleTheme={toggleTheme} isDark={isDark}>
                <div className="flex flex-col items-center justify-center min-h-screen px-4">
                    <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-2xl p-8 shadow-2xl w-full max-w-md">
                        <div className="flex justify-center mb-6">
                            <div className="w-24 h-24 rounded-2xl flex items-center justify-center overflow-hidden">
                                <img src="/logo.png" className="w-full h-full object-contain" alt="LC" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-center mb-1 text-slate-900 dark:text-white">TECPLAM</h1>
                        <p className="text-center text-slate-500 dark:text-zinc-400 mb-8 text-sm">Monitoramento Automático de Relatórios</p>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <Input
                                label="Matrícula"
                                value={loginMatricula}
                                onChange={e => setLoginMatricula(e.target.value)}
                                icon={<UserIcon size={18} />}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && passwordInputRef.current) {
                                        passwordInputRef.current.focus();
                                    }
                                }}
                            />
                            <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1.5 uppercase tracking-wide">Senha</label>
                                <div className="relative">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 pointer-events-none"><Lock size={18} /></div>
                                    <input
                                        ref={passwordInputRef}
                                        type={showLoginPassword ? "text" : "password"}
                                        className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 outline-none text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 transition-all shadow-inner text-sm"
                                        value={loginPassword}
                                        onChange={e => setLoginPassword(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleLogin(e);
                                        }}
                                    />
                                    <button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300">
                                        {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                            {loginError && <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-900/50 flex items-center gap-2"><AlertCircle size={16} /> {loginError}</div>}
                            <Button fullWidth type="submit" disabled={isLoading}>{isLoading ? 'Entrando...' : 'Entrar'}</Button>
                        </form>
                        <div className="mt-6 flex flex-col gap-3 text-center">
                            <button onClick={() => setView('REGISTER')} className="text-sm text-slate-500 dark:text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Não tem conta? Cadastre-se</button>
                            <button onClick={() => setView('RECOVER')} className="text-xs text-slate-400 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-400 transition-colors">Esqueci minha senha</button>
                            <div className="pt-4 border-t border-slate-200 dark:border-zinc-800/50 w-full">
                                <button onClick={() => setView('SETUP')} className="text-xs text-slate-400 dark:text-zinc-700 hover:text-slate-600 dark:hover:text-zinc-500 flex items-center justify-center gap-1 w-full transition-colors"><Wifi size={12} /> Configurar Servidor</button>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        );
    }

    if (view === 'REGISTER') {
        return (
            <Layout variant="auth" onToggleTheme={toggleTheme} isDark={isDark}>
                <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
                    <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-2xl p-8 shadow-2xl w-full max-w-md">
                        <h1 className="text-2xl font-bold text-center mb-1 text-slate-900 dark:text-white">Criar Conta</h1>
                        <p className="text-center text-slate-500 dark:text-zinc-400 mb-6 text-sm">Preencha seus dados</p>
                        <form onSubmit={handleRegister} className="space-y-4">
                            <Input label="Nome Completo" value={regName} onChange={e => setRegName(toTitleCase(e.target.value))} />
                            <Input label="Matrícula" value={regMatricula} onChange={e => setRegMatricula(e.target.value)} />
                            <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1.5 uppercase tracking-wide">Função</label>
                                <select className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600/50 outline-none" value={regRole} onChange={e => setRegRole(e.target.value)}>
                                    {availableRoles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1.5 uppercase tracking-wide">Turno</label>
                                <select className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600/50 outline-none" value={regShift} onChange={e => setRegShift(e.target.value)}>
                                    <option value="1">1º Turno</option>
                                    <option value="2">2º Turno</option>
                                </select>
                            </div>
                            <Input label="Email (Opcional)" value={regEmail} onChange={e => setRegEmail(e.target.value)} type="email" />
                            <Input label="Senha" value={regPassword} onChange={e => setRegPassword(e.target.value)} type="password" />
                            <Input label="Confirmar Senha" value={regConfirmPassword} onChange={e => setRegConfirmPassword(e.target.value)} type="password" />

                            {regError && <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded border border-red-900/50 flex items-center gap-2"><AlertCircle size={16} /> {regError}</div>}

                            <Button fullWidth type="submit" disabled={isLoading}>{isLoading ? 'Cadastrando...' : 'Criar Conta'}</Button>
                        </form>
                        <button onClick={() => setView('LOGIN')} className="mt-4 w-full text-sm text-zinc-500 hover:text-blue-400 transition-colors">Já tem conta? Faça Login</button>
                    </div>
                </div>
            </Layout>
        );
    }

    // --- MENU DASHBOARD ---
    if (view === 'MENU') {
        return (
            <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme} isDark={isDark}>
                <header className="mb-4 md:mb-8">
                    <h1 className="text-lg md:text-2xl font-bold mb-2 text-slate-900 dark:text-white">Bem-vindo, {currentUser?.name.split(' ')[0]}</h1>
                    <p className="text-slate-500 dark:text-zinc-400">Selecione um módulo para iniciar.</p>
                </header>

                {/* ALERTS SECTION */}
                <div className="mb-8 space-y-4">
                    {pendingScrapCount > 0 && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/50 p-4 rounded-xl flex items-center gap-4 animate-pulse">
                            <div className="p-2 bg-red-100 dark:bg-red-500 rounded-full text-red-600 dark:text-white"><AlertTriangle size={20} /></div>
                            <div className="flex-1">
                                <h3 className="font-bold text-red-800 dark:text-red-400">Pendências de Scrap</h3>
                                <p className="text-xs text-red-600 dark:text-red-300">Você possui {pendingScrapCount} itens de scrap sem contra medida.</p>
                            </div>
                            <Button size="sm" onClick={() => { setScrapTab('PENDING'); setView('SCRAP'); }}>Resolver</Button>
                        </div>
                    )}
                    {pendingLineStopsCount > 0 && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/50 p-4 rounded-xl flex items-center gap-4 animate-pulse">
                            <div className="p-2 bg-red-100 dark:bg-red-500 rounded-full text-red-600 dark:text-white"><AlertTriangle size={20} /></div>
                            <div className="flex-1">
                                <h3 className="font-bold text-red-800 dark:text-red-400">Paradas sem Justificativa</h3>
                                <p className="text-xs text-red-600 dark:text-red-300">Existem {pendingLineStopsCount} paradas de linha que requerem sua atenção.</p>
                            </div>
                            <Button size="sm" onClick={() => setView('LINE_STOP_DASHBOARD')}>Ver</Button>
                        </div>
                    )}

                    {missingLeadersNames.length > 0 && (hasPermission('AUDIT') || isSuperAdmin) && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-500/50 p-4 rounded-xl flex flex-col gap-3">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-yellow-100 dark:bg-yellow-500 rounded-full text-yellow-700 dark:text-zinc-900"><Clock size={20} /></div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-yellow-800 dark:text-yellow-400">Checklists Pendentes Hoje</h3>
                                    <p className="text-xs text-yellow-700 dark:text-yellow-300">Líderes que ainda não enviaram o relatório do turno.</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 pl-12">
                                {missingLeadersNames.map(name => (
                                    <span key={name} className="px-2 py-1 bg-yellow-100 dark:bg-yellow-500/10 text-yellow-800 dark:text-yellow-200 rounded text-xs border border-yellow-200 dark:border-yellow-500/20">{name}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {hasPermission('CHECKLIST') && (
                        // CORREÇÃO AQUI: Chama a função que prepara o modal e reseta a linha
                        <div onClick={handleStartChecklist} className="group bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-blue-600/50 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden h-40 flex flex-col justify-center shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-blue-600/10 dark:bg-blue-600/20 text-blue-600 dark:text-blue-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><CheckSquare size={24} /></div>
                                <div>
                                    <h3 className="font-bold text-xl text-slate-900 dark:text-zinc-100">Checklist</h3>
                                    <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Liderança & Operação</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {hasPermission('LINE_STOP') && (
                        <div onClick={() => setView('LINE_STOP_DASHBOARD')} className="group bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-red-600/50 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden h-40 flex flex-col justify-center shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-red-600/10 dark:bg-red-600/20 text-red-600 dark:text-red-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><AlertTriangle size={24} /></div>
                                <div>
                                    <h3 className="font-bold text-xl text-slate-900 dark:text-zinc-100">Parada de Linha</h3>
                                    <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Reporte de interrupções</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {hasPermission('MAINTENANCE') && (
                        <div onClick={() => setView('MAINTENANCE_QR')} className="group bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-orange-600/50 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden h-40 flex flex-col justify-center shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-orange-600/10 dark:bg-orange-600/20 text-orange-600 dark:text-orange-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Hammer size={24} /></div>
                                <div>
                                    <h3 className="font-bold text-xl text-slate-900 dark:text-zinc-100">Manutenção</h3>
                                    <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Inspeção de Máquinas</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {hasPermission('MEETING') && (
                        <div onClick={() => { initMeetingForm(); setView('MEETING_MENU'); }} className="group bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-emerald-600/50 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden h-40 flex flex-col justify-center shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-emerald-600/10 dark:bg-emerald-600/20 text-emerald-600 dark:text-emerald-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><FileText size={24} /></div>
                                <div>
                                    <h3 className="font-bold text-xl text-slate-900 dark:text-zinc-100">Reuniões</h3>
                                    <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Atas e Registros</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {hasPermission('PREPARATION') && (
                        <div onClick={() => setView('PREPARATION')} className="group bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-violet-600/50 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden h-40 flex flex-col justify-center shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-violet-600/10 dark:bg-violet-600/20 text-violet-600 dark:text-violet-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><FileText size={24} /></div>
                                <div>
                                    <h3 className="font-bold text-xl text-slate-900 dark:text-zinc-100">Preparação</h3>
                                    <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Lançamento e Consulta</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {hasPermission('AUDIT') && (
                        <div onClick={() => { setView('AUDIT_MENU'); setAuditTab('LEADER_HISTORY'); }} className="group bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-yellow-600/50 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden h-40 flex flex-col justify-center shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-yellow-600/10 dark:bg-yellow-600/20 text-yellow-600 dark:text-yellow-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Search size={24} /></div>
                                <div>
                                    <h3 className="font-bold text-xl text-slate-900 dark:text-zinc-100">Auditoria</h3>
                                    <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Gestão e Relatórios</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {hasPermission('MANAGEMENT') && (
                        <div onClick={() => setView('MANAGEMENT')} className="group bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-cyan-600/50 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden h-40 flex flex-col justify-center shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-cyan-600/10 dark:bg-cyan-600/20 text-cyan-600 dark:text-cyan-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Briefcase size={24} /></div>
                                <div>
                                    <h3 className="font-bold text-xl text-slate-900 dark:text-zinc-100">Gestão</h3>
                                    <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Cadastros Gerais</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {hasPermission('ADMIN') && (
                        <div onClick={() => setView('ADMIN')} className="group bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-zinc-600/50 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden h-40 flex flex-col justify-center shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-zinc-700/10 dark:bg-zinc-700/50 text-slate-700 dark:text-zinc-300 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Shield size={24} /></div>
                                <div>
                                    <h3 className="font-bold text-xl text-slate-900 dark:text-zinc-100">Admin</h3>
                                    <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Configurações do Sistema</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div onClick={() => setView('SCRAP')} className="group bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-red-500/50 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden h-40 flex flex-col justify-center shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><AlertTriangle size={24} /></div>
                            <div>
                                <h3 className="font-bold text-xl text-slate-900 dark:text-zinc-100">Gestão de SCRAP</h3>
                                <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Refugos e Perdas</p>
                            </div>
                        </div>
                    </div>

                    {hasPermission('IQC') && (
                        <div onClick={() => setView('IQC')} className="group bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-blue-500/50 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden h-40 flex flex-col justify-center shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Truck size={24} /></div>
                                <div>
                                    <h3 className="font-bold text-xl text-slate-900 dark:text-zinc-100">Painel IQC</h3>
                                    <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Logística e Fiscal</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Layout>
        );
    }

    // --- AUDIT MENU ---
    if (view === 'AUDIT_MENU') {
        if (auditTab === 'MAINTENANCE_EDITOR' || auditTab === 'LEADER_EDITOR') {
            const isMaint = auditTab === 'MAINTENANCE_EDITOR';
            const targetList = isMaint ? maintenanceItems : leaderItems;
            const setTargetList = isMaint ? setMaintenanceItems : setLeaderItems;
            const filteredList = isMaint ? targetList.filter(item => item.category.startsWith(maintenanceLine)) : targetList;

            return (
                <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme} isDark={isDark}>
                    <div className="w-full max-w-7xl mx-auto space-y-6">
                        <header className="flex flex-col gap-4 mb-4 md:mb-8 pb-4 md:pb-6 border-b border-zinc-800">
                            <div className="flex items-center justify-between">
                                <h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2"><Search className="text-yellow-500" /> Auditoria</h1>
                                <Button variant="outline" onClick={() => { setView('AUDIT_MENU'); setAuditTab('LEADER_HISTORY'); }}><ArrowLeft size={16} /> Voltar</Button>
                            </div>
                        </header>
                        <Card className="w-full md:max-w-4xl mx-auto">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-lg font-bold">{isMaint ? 'Configurar Máquinas (QR Code)' : 'Editor de Checklist (Líder)'}</h3>
                                    {isMaint && <p className="text-xs text-zinc-400">Adicione postos de manutenção para cada linha.</p>}
                                </div>
                                <Button onClick={() => handleSaveEditor(targetList, isMaint ? 'MAINTENANCE' : 'LEADER')}><Save size={16} /> Salvar Tudo</Button>
                            </div>
                            {isMaint && (
                                <div className="mb-6 bg-slate-50 dark:bg-zinc-950 p-4 rounded-lg border border-slate-200 dark:border-zinc-800">
                                    <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase mb-2 block">Selecione a Linha para Editar/Criar</label>
                                    <select className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded p-2 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-600/50" value={maintenanceLine} onChange={e => setMaintenanceLine(e.target.value)}>
                                        {lines.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="space-y-4">
                                {filteredList.map((item, idx) => (
                                    <div key={item.id} className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 p-4 rounded-lg flex flex-col gap-3">
                                        <div className="flex gap-3">
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase">Categoria / Máquina</label>
                                                <input className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-600/50" value={item.category} onChange={e => handleEditorChange(targetList, setTargetList, item.id, 'category', e.target.value)} />
                                            </div>
                                            <div className="flex-[3]">
                                                <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase">Item de Verificação</label>
                                                <input className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 p-2 rounded text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-600/50" value={item.text} onChange={e => handleEditorChange(targetList, setTargetList, item.id, 'text', e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="flex gap-3 items-end">
                                            <div className="flex-1">
                                                {item.imageUrl ? (
                                                    <div className="flex items-center gap-2">
                                                        <img src={item.imageUrl} className="h-10 w-10 object-cover rounded border border-slate-200 dark:border-zinc-700" />
                                                        <button onClick={() => handleEditorRemoveImage(targetList, setTargetList, item.id)} className="text-red-500 text-xs hover:underline">Remover Imagem Ref.</button>
                                                    </div>
                                                ) : (
                                                    <label className="cursor-pointer text-xs bg-slate-100 dark:bg-zinc-800 px-3 py-2 rounded text-slate-500 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 block text-center">
                                                        + Imagem Referência
                                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => { if (e.target.files?.[0]) handleEditorImage(targetList, setTargetList, item.id, e.target.files[0]) }} />
                                                    </label>
                                                )}
                                            </div>
                                            <button onClick={() => handleEditorDelete(targetList, setTargetList, item.id)} className="p-2 bg-red-900/20 text-red-500 rounded hover:bg-red-900/40"><Trash2 size={16} /></button>
                                        </div>
                                        {isMaint && (
                                            <div className="mt-2 pt-2 border-t border-zinc-800">
                                                <button onClick={() => printQrCode(item.category)} className="text-xs text-blue-400 hover:underline flex items-center gap-1"><QrCode size={12} /> Imprimir QR Code da Máquina ({item.category})</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <Button variant="outline" fullWidth onClick={() => handleEditorAdd(targetList, setTargetList, isMaint ? 'MAINTENANCE' : 'LEADER')}><Plus size={16} /> Adicionar Novo Item em {isMaint ? maintenanceLine : 'Geral'}</Button>
                            </div>
                        </Card>
                    </div>
                </Layout>
            )
        } else {
            return (
                <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme} isDark={isDark}>
                    <div className="w-full max-w-7xl mx-auto space-y-6">
                        <header className="flex flex-col gap-4 mb-4 md:mb-8 pb-4 md:pb-6 border-b border-zinc-800">
                            <div className="flex items-center justify-between">
                                <h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2"><Search className="text-yellow-500" /> Auditoria e Relatórios</h1>
                                <Button variant="outline" onClick={() => setView('MENU')}><ArrowLeft size={16} /> Voltar</Button>
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                <Button variant={auditTab === 'LEADER_HISTORY' ? 'primary' : 'secondary'} onClick={() => setAuditTab('LEADER_HISTORY')}>Histórico Líder</Button>
                                <Button variant={auditTab === 'MAINTENANCE_HISTORY' ? 'primary' : 'secondary'} onClick={() => setAuditTab('MAINTENANCE_HISTORY')}>Histórico Manutenção</Button>
                                <div className="w-px bg-zinc-800 mx-2"></div>
                                <Button variant={auditTab === 'LEADERS' ? 'primary' : 'secondary'} onClick={() => setAuditTab('LEADERS')}>Matriz Líderes</Button>
                                <Button variant={auditTab === 'LINES' ? 'primary' : 'secondary'} onClick={() => setAuditTab('LINES')}>Matriz Linhas</Button>
                                <Button variant={auditTab === 'MAINTENANCE_MATRIX' ? 'primary' : 'secondary'} onClick={() => setAuditTab('MAINTENANCE_MATRIX')}>Matriz Manutenção</Button>
                                <div className="w-px bg-zinc-800 mx-2"></div>
                                <Button variant="secondary" onClick={() => setAuditTab('LEADER_EDITOR')}><Edit3 size={14} /> Editor Checklist</Button>
                                <Button variant="secondary" onClick={() => setAuditTab('MAINTENANCE_EDITOR')}><Edit3 size={14} /> Editor Manutenção</Button>
                            </div>
                        </header>

                        {/* FILTERS */}
                        {(auditTab === 'LEADER_HISTORY' || auditTab === 'MAINTENANCE_HISTORY') && (
                            <Card className="mb-6">
                                <div className="flex flex-wrap gap-4 items-end">
                                    <div className="flex-1 min-w-[200px]"><Input type="date" label="Filtrar Data" value={historyDateFilter} onChange={e => setHistoryDateFilter(e.target.value)} onClick={(e) => e.currentTarget.showPicker()} /></div>
                                    <div className="flex-1 min-w-[200px]">
                                        <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Filtrar Turno</label>
                                        <select className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded p-2 text-slate-900 dark:text-white outline-none" value={historyShiftFilter} onChange={e => setHistoryShiftFilter(e.target.value)}><option value="ALL">Todos</option><option value="1">1º Turno</option><option value="2">2º Turno</option></select>
                                    </div>
                                    <Button variant="secondary" onClick={() => { setHistoryDateFilter(''); setHistoryShiftFilter('ALL'); }}>Limpar</Button>
                                </div>
                            </Card>
                        )}

                        {(auditTab === 'LEADERS' || auditTab === 'LINES' || auditTab === 'MAINTENANCE_MATRIX') && (
                            <Card className="mb-6">
                                <div className="flex flex-wrap gap-4 items-end">
                                    <div className="flex-1 min-w-[200px]"><Input type="week" label="Semana" value={linesWeekFilter} onChange={e => setLinesWeekFilter(e.target.value)} onClick={(e) => e.currentTarget.showPicker()} /></div>
                                    <div className="flex-1 min-w-[200px]">
                                        <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Turno</label>
                                        <select className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded p-2 text-slate-900 dark:text-white outline-none" value={linesShiftFilter} onChange={e => setLinesShiftFilter(e.target.value)}><option value="ALL">Todos</option><option value="1">1º Turno</option><option value="2">2º Turno</option></select>
                                    </div>
                                </div>
                            </Card>
                        )}

                        {/* CONTENT */}
                        {(auditTab === 'LEADER_HISTORY' || auditTab === 'MAINTENANCE_HISTORY') && (
                            <div className="space-y-4">
                                {historyLogs.map(log => (
                                    <div key={log.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5 flex flex-col md:flex-row justify-between items-center gap-4 hover:border-blue-500 dark:hover:border-zinc-700 transition-colors shadow-sm">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${log.ngCount > 0 ? 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-500 border border-red-200 dark:border-red-900/30' : 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-500 border border-green-200 dark:border-green-900/30'}`}>{log.ngCount > 0 ? '!' : '✓'}</div>
                                            <div>
                                                <p className="font-bold text-slate-900 dark:text-zinc-200">{log.line} {log.maintenanceTarget ? `- ${log.maintenanceTarget}` : ''} <span className="text-slate-500 dark:text-zinc-500 text-sm font-normal">• {log.userName}</span></p>
                                                <p className="text-sm text-slate-500 dark:text-zinc-400">{new Date(log.date).toLocaleString()} • {log.ngCount > 0 ? `${log.ngCount} Falhas` : '100% OK'}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="secondary" onClick={() => setPreviewLog(log)}><Eye size={16} /></Button>
                                            <Button variant="outline" onClick={() => exportLogToExcel(log, auditTab === 'MAINTENANCE_HISTORY' ? maintenanceItems : leaderItems)}><Download size={16} /> Excel</Button>
                                        </div>
                                    </div>
                                ))}
                                {historyLogs.length === 0 && <p className="text-center text-zinc-500 py-10">Nenhum registro encontrado.</p>}
                            </div>
                        )}

                        {/* MATRIX VIEWS */}
                        {(auditTab === 'LINES' || auditTab === 'MAINTENANCE_MATRIX') && (
                            <div className="overflow-x-auto pb-4">
                                <table className="w-full min-w-[600px] text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800">
                                            <th className="p-3 text-left min-w-[150px]">Linha</th>
                                            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(d => <th key={d} className="p-3 text-center">{d}</th>)}
                                            {linesShiftFilter !== 'ALL' && <th className="p-3 text-center">Ações</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                                        {(auditTab === 'LINES' ? linesMatrix : maintenanceMatrix).map((row) => (
                                            <tr key={row.line} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                                                <td className="p-3 font-bold text-slate-900 dark:text-white">{row.line}</td>
                                                {row.statuses.map((st, idx) => (
                                                    <td key={idx} className="p-3 text-center">
                                                        <div
                                                            onClick={() => {
                                                                if (linesShiftFilter !== 'ALL' && st.logIds && st.logIds.length > 0) {
                                                                    handleOpenPreview(st.logIds[0]);
                                                                }
                                                            }}
                                                            className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto text-xs font-bold border transition-transform ${linesShiftFilter !== 'ALL' ? 'cursor-pointer hover:scale-110' : 'cursor-default opacity-80'} ${st.status === 'OK' ? 'bg-green-900/20 text-green-500 border-green-900/50' : st.status === 'NG' ? 'bg-red-900/20 text-red-500 border-red-900/50' : 'bg-zinc-800 text-zinc-600 border-zinc-700'}`}
                                                            title={st.leaderName || st.details || 'Pendente'}
                                                        >
                                                            {st.status === 'OK' ? 'OK' : st.status === 'NG' ? 'NG' : '-'}
                                                        </div>
                                                    </td>
                                                ))}
                                                {linesShiftFilter !== 'ALL' && (
                                                    <td className="p-3 text-center">
                                                        <Button size="sm" variant="outline" onClick={() => handleDownloadSheet(row.line)}><Download size={14} /></Button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {auditTab === 'LEADERS' && (
                            <div className="overflow-x-auto pb-4">
                                <table className="w-full min-w-[600px] text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800">
                                            <th className="p-3 text-left min-w-[200px]">Líder / Supervisor</th>
                                            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(d => <th key={d} className="p-3 text-center">{d}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                        {leadersMatrix.map((row) => (
                                            <tr key={row.user.matricula} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                                                <td className="p-3">
                                                    <p className="font-bold text-slate-900 dark:text-white">{row.user.name}</p>
                                                    <p className="text-xs text-slate-500 dark:text-zinc-500">{row.user.role} • T{row.user.shift}</p>
                                                </td>
                                                {row.statuses.map((st, idx) => (
                                                    <td key={idx} className="p-3 text-center">
                                                        <div
                                                            onClick={() => {
                                                                if (linesShiftFilter !== 'ALL' && st.logId) {
                                                                    handleOpenPreview(st.logId);
                                                                }
                                                            }}
                                                            className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto text-xs font-bold border transition-transform ${linesShiftFilter !== 'ALL' ? 'cursor-pointer hover:scale-110' : 'cursor-default opacity-80'} ${st.status === 'OK' ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-500 border-green-200 dark:border-green-900/50' : st.status === 'NG' ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-500 border-red-200 dark:border-red-900/50' : 'bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 border-slate-200 dark:border-zinc-700'}`}
                                                        >
                                                            {st.status === 'OK' ? '✓' : st.status === 'NG' ? 'X' : '-'}
                                                        </div>
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    {renderPreviewModal()}
                </Layout >
            );
        }
    }

    // --- ADMIN VIEW ---
    if (view === 'ADMIN') {
        return (
            <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme} isDark={isDark}>
                <div className="w-full max-w-7xl mx-auto space-y-6">
                    <header className="flex items-center justify-between mb-4 md:mb-8 pb-4 md:pb-6 border-b border-slate-200 dark:border-zinc-800">
                        <h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2"><Shield className="text-slate-400 dark:text-zinc-400" /> Painel Administrativo</h1>
                    </header>
                    <div className="w-full">
                        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                            <Button variant={adminTab === 'USERS' ? 'primary' : 'secondary'} onClick={() => setAdminTab('USERS')}><Users size={16} /> Usuários</Button>
                            <Button variant={adminTab === 'PERMISSIONS' ? 'primary' : 'secondary'} onClick={() => setAdminTab('PERMISSIONS')}><Shield size={16} /> Permissões</Button>
                            <Button variant={adminTab === 'RECOVERY' ? 'primary' : 'secondary'} onClick={() => { setAdminTab('RECOVERY'); }} className="relative">
                                <AlertTriangle size={16} /> Solicitações
                                {recoveryRequests.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full animate-pulse">{recoveryRequests.length}</span>}
                            </Button>
                        </div>

                        {adminTab === 'RECOVERY' && (
                            <Card>
                                <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">Solicitações de Recuperação de Senha</h3>
                                {recoveryRequests.length === 0 ? (
                                    <p className="text-slate-500 text-center py-6">Nenhuma solicitação pendente.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {recoveryRequests.map(req => (
                                            <div key={req.id} className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-lg border border-slate-200 dark:border-zinc-800 flex justify-between items-center">
                                                <div>
                                                    <p className="font-bold text-slate-900 dark:text-white">{req.name} <span className="text-xs font-normal text-slate-500">({req.matricula})</span></p>
                                                    <p className="text-sm text-slate-600 dark:text-zinc-400">{req.role} • {new Date(req.createdAt).toLocaleString()}</p>
                                                </div>
                                                <Button onClick={() => setSelectedRequest(req)}>Redefinir</Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Card>
                        )}

                        {selectedRequest && (
                            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                                <Card className="w-full max-w-sm bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800">
                                    <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">Nova Senha para {selectedRequest.name}</h3>
                                    <Input
                                        label="Nova Senha"
                                        type="text"
                                        value={recoveryNewPassword}
                                        onChange={e => setRecoveryNewPassword(e.target.value)}
                                        autoFocus
                                    />
                                    <div className="flex gap-2 mt-4">
                                        <Button variant="secondary" fullWidth onClick={() => { setSelectedRequest(null); setRecoveryNewPassword(''); }}>Cancelar</Button>
                                        <Button fullWidth onClick={handleAdminResetPassword}>Confirmar Reset</Button>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {adminTab === 'PERMISSIONS' && (
                            <Card className="overflow-x-auto">
                                <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-white">Permissões de Acesso (Matriz Invertida)</h3>
                                <table className="w-full text-sm text-center border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800">
                                            <th className="p-3 text-left">Cargo</th>
                                            {['CHECKLIST', 'LINE_STOP', 'MEETING', 'MAINTENANCE', 'AUDIT', 'ADMIN', 'MANAGEMENT', 'SCRAP', 'IQC'].map(mod => (
                                                <th key={mod} className="p-3">{mod}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                        {availableRoles.map(role => (
                                            <tr key={role.id} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors">
                                                <td className="p-3 text-left font-bold text-slate-900 dark:text-white">{role.name}</td>
                                                {['CHECKLIST', 'LINE_STOP', 'MEETING', 'MAINTENANCE', 'AUDIT', 'ADMIN', 'MANAGEMENT', 'SCRAP', 'IQC', 'PREPARATION'].map(mod => {
                                                    const perm = permissions.find(p => p.role === role.name && p.module === (mod as any));
                                                    const isAllowed = perm ? perm.allowed : (['CHECKLIST', 'MEETING', 'MAINTENANCE', 'LINE_STOP'].includes(mod));
                                                    return (
                                                        <td key={mod} className="p-3">
                                                            <button
                                                                onClick={() => handleTogglePermission(role.name, mod as any)}
                                                                className={`w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors ${isAllowed ? 'bg-green-500 text-white' : 'bg-slate-200 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600'}`}
                                                            >
                                                                {isAllowed && <Check size={14} />}
                                                            </button>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Card>
                        )}

                        {adminTab === 'USERS' && (
                            <Card>
                                <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-slate-900 dark:text-white">Usuários</h3><Button onClick={() => setView('REGISTER')} variant="outline" size="sm"><UserPlus size={16} /> Novo</Button></div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left text-slate-700 dark:text-zinc-300">
                                        <thead className="text-xs text-slate-500 dark:text-zinc-400 uppercase bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800">
                                            <tr><th>Nome</th><th>Matrícula</th><th>Função</th><th>Admin</th><th>Ações</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                            {usersList.map(u => (
                                                <tr key={u.matricula} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors">
                                                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{u.name}</td>
                                                    <td className="px-4 py-3">{u.matricula}</td>
                                                    <td className="px-4 py-3">{u.role}</td>
                                                    <td className="px-4 py-3">{u.isAdmin ? <span className="text-green-600 dark:text-green-400 font-bold bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded text-xs border border-green-200 dark:border-green-900/50">ADMIN</span> : <span className="text-slate-400 dark:text-zinc-600">-</span>}</td>
                                                    <td className="px-4 py-3">
                                                        <button onClick={() => openEditModal(u)} className="mr-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"><Edit3 size={16} /></button>
                                                        <button onClick={async () => { if (confirm('Excluir?')) { await deleteUser(u.matricula); setUsersList(await getAllUsers()); } }} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"><Trash2 size={16} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        )}

                        {showUserEditModal && editingUser && (
                            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                                <Card className="w-full max-w-md bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800">
                                    <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">Editar Usuário</h3>
                                    <div className="space-y-3">
                                        <Input label="Nome" value={editingUser.name} onChange={e => setEditingUser({ ...editingUser, name: e.target.value })} />
                                        <Input label="Matrícula" value={editingUser.matricula} onChange={e => setEditingUser({ ...editingUser, matricula: e.target.value })} />
                                        <div><label className="text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">Função</label><select className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded p-2 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-600/50" value={editingUser.role} onChange={e => setEditingUser({ ...editingUser, role: e.target.value })}>{availableRoles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}</select></div>
                                        <div><label className="text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">Turno</label><select className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded p-2 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-600/50" value={editingUser.shift} onChange={e => setEditingUser({ ...editingUser, shift: e.target.value })}><option value="1">1º Turno</option><option value="2">2º Turno</option></select></div>
                                        <Input label="Nova Senha (Opcional)" value={editingUser.password || ''} onChange={e => setEditingUser({ ...editingUser, password: e.target.value })} />
                                        <div className="flex items-center gap-2 mt-2"><input type="checkbox" id="isAdminCheck" checked={editingUser.isAdmin || false} onChange={e => setEditingUser({ ...editingUser, isAdmin: e.target.checked })} /><label htmlFor="isAdminCheck" className="text-sm text-slate-600 dark:text-zinc-300 cursor-pointer">Acesso Admin Global</label></div>
                                        <div className="flex gap-2 mt-4"><Button variant="secondary" fullWidth onClick={() => setShowUserEditModal(false)}>Cancelar</Button><Button fullWidth onClick={saveUserChanges}>Salvar</Button></div>
                                    </div>
                                </Card>
                            </div>
                        )}
                    </div>
                </div>
            </Layout>
        );
    }

    // --- PREPARATION MODULE ---
    if (view === 'PREPARATION') {
        return (
            <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme} isDark={isDark}>
                <PreparationModule currentUser={currentUser!} onBack={() => setView('MENU')} />
            </Layout>
        );
    }

    // --- MANAGEMENT MODULE ---
    if (view === 'MANAGEMENT') {
        return (
            <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme} isDark={isDark}>
                <ManagementModule onBack={() => setView('MENU')} />
            </Layout>
        );
    }


    // --- LINE STOP DASHBOARD ---
    if (view === 'LINE_STOP_DASHBOARD') return <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme} isDark={isDark}><div className="w-full max-w-7xl mx-auto space-y-6"><header className="flex flex-col gap-4 mb-4 md:mb-8 pb-4 md:pb-6 border-b border-slate-200 dark:border-zinc-800"><h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2"><AlertTriangle className="text-red-500" /> Parada de Linha</h1><div className="flex gap-2 overflow-x-auto pb-2"><Button variant={lineStopTab === 'NEW' ? 'primary' : 'secondary'} onClick={() => setLineStopTab('NEW')}><Plus size={16} /> Novo Reporte</Button><Button variant={lineStopTab === 'PENDING' ? 'primary' : 'secondary'} onClick={() => setLineStopTab('PENDING')}><Clock size={16} /> Pendentes</Button><Button variant={lineStopTab === 'UPLOAD' ? 'primary' : 'secondary'} onClick={() => setLineStopTab('UPLOAD')}><Upload size={16} /> Upload Assinatura</Button><Button variant={lineStopTab === 'HISTORY' ? 'primary' : 'secondary'} onClick={() => setLineStopTab('HISTORY')}><History size={16} /> Histórico</Button></div></header>{lineStopTab === 'NEW' && (<div className="space-y-6 max-w-4xl mx-auto pb-20"><Card><h3 className="text-lg font-bold mb-4 border-b border-slate-200 dark:border-zinc-800 pb-2 text-slate-900 dark:text-white">Dados da Parada</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
            <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase mb-1 block">Modelo</label>
            <input list="model-list" className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 outline-none focus:ring-2 focus:ring-blue-600/50" value={lineStopData.model} onChange={e => setLineStopData({ ...lineStopData, model: e.target.value })} placeholder="Selecione ou digite..." />
            <datalist id="model-list">{models.map(m => <option key={m} value={m} />)}</datalist>
        </div>
        <Input label="Cliente" value={lineStopData.client} onChange={e => setLineStopData({ ...lineStopData, client: e.target.value })} /><div><label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase mb-1 block">Linha</label><select className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-slate-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-600/50 outline-none" value={lineStopData.line} onChange={e => setLineStopData({ ...lineStopData, line: e.target.value })}>{lines.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}</select></div><Input label="Fase" value={lineStopData.phase} onChange={e => setLineStopData({ ...lineStopData, phase: e.target.value })} /></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"><Input type="time" label="Início" value={lineStopData.startTime} onChange={e => setLineStopData({ ...lineStopData, startTime: e.target.value, totalTime: calcTotalTime(e.target.value, lineStopData.endTime) })} onClick={(e) => e.currentTarget.showPicker()} /><Input type="time" label="Término" value={lineStopData.endTime} onChange={e => setLineStopData({ ...lineStopData, endTime: e.target.value, totalTime: calcTotalTime(lineStopData.startTime, e.target.value) })} onClick={(e) => e.currentTarget.showPicker()} /><Input label="Total" readOnly value={lineStopData.totalTime} className="text-red-500 dark:text-red-400 font-bold" /><Input label="Pessoas Paradas" type="number" value={lineStopData.peopleStopped} onChange={e => setLineStopData({ ...lineStopData, peopleStopped: e.target.value })} /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Input label="Perca de Produção" value={lineStopData.productionLoss} onChange={e => setLineStopData({ ...lineStopData, productionLoss: e.target.value })} /><Input label="Tempo Padrão" value={lineStopData.standardTime} onChange={e => setLineStopData({ ...lineStopData, standardTime: e.target.value })} /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
                <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase mb-1 block">Posto (De)</label>
                <input list="station-list" className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 outline-none focus:ring-2 focus:ring-blue-600/50" value={lineStopData.stationStart} onChange={e => setLineStopData({ ...lineStopData, stationStart: e.target.value })} placeholder="Selecione ou digite..." />
                <datalist id="station-list">{stations.map(s => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
                <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase mb-1 block">Posto (Até)</label>
                <input list="station-list" className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 outline-none focus:ring-2 focus:ring-blue-600/50" value={lineStopData.stationEnd} onChange={e => setLineStopData({ ...lineStopData, stationEnd: e.target.value })} placeholder="Selecione ou digite..." />
            </div></div></Card><Card><h3 className="text-lg font-bold mb-4 border-b border-slate-200 dark:border-zinc-800 pb-2 text-slate-900 dark:text-white">Motivo e Responsabilidade</h3><div className="mb-4"><label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase mb-1 block">Setor Responsável</label><div className="grid grid-cols-2 md:grid-cols-5 gap-2">{SECTORS_LIST.map(sec => (<button key={sec} onClick={() => setLineStopData({ ...lineStopData, responsibleSector: sec })} className={`p-2 rounded text-xs font-bold border transition-colors ${lineStopData.responsibleSector === sec ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-100 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700'}`}>{sec}</button>))}</div></div><div><label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase mb-1 block">Motivo / Ocorrência Detalhada</label><textarea className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-3 h-32 text-slate-900 dark:text-zinc-100 resize-none focus:ring-2 focus:ring-blue-600/50 outline-none" value={lineStopData.motivo} onChange={e => setLineStopData({ ...lineStopData, motivo: e.target.value })} placeholder="Descreva o que aconteceu..." /></div></Card><Button fullWidth className="py-4 text-lg shadow-xl shadow-red-900/20 bg-red-600 hover:bg-red-500" onClick={handleSaveLineStop}>Salvar Reporte</Button></div>)}

        {/* PENDING TAB */}
        {lineStopTab === 'PENDING' && (<div className="space-y-4">{lineStopLogs.filter(l => l.status === 'WAITING_JUSTIFICATION').length === 0 && <p className="text-center text-slate-500 dark:text-zinc-500 py-10">Nenhum reporte pendente de justificativa.</p>}{lineStopLogs.filter(l => l.status === 'WAITING_JUSTIFICATION').map(log => {
            return (
                <div key={log.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 relative overflow-hidden shadow-sm"><div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-500"></div><div className="flex flex-col md:flex-row justify-between gap-4"><div><div className="flex items-center gap-2 mb-2"><span className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-1 rounded text-xs font-bold uppercase border border-red-200 dark:border-red-900/50">Aguardando Justificativa</span><span className="text-slate-500 dark:text-zinc-500 text-xs">{new Date(log.date).toLocaleString()}</span></div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{getLogTitle(log)}</h3>
                    <p className="text-slate-500 dark:text-zinc-400 text-sm mb-4">Setor: <strong className="text-slate-900 dark:text-white">{(log.data as LineStopData)?.responsibleSector}</strong> | Tempo: <strong className="text-red-500 dark:text-red-400">{(log.data as LineStopData)?.totalTime}</strong></p><p className="bg-slate-50 dark:bg-zinc-950 p-3 rounded border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 text-sm">{(log.data as LineStopData)?.motivo}</p></div><div className="flex flex-col justify-center gap-2 min-w-[200px]">
                        {canUserJustify(currentUser, log) ? (<Button onClick={() => { setActiveLineStopLog(log); setJustificationInput(''); }}>Justificar</Button>) : (
                            <span className="text-xs text-slate-500 dark:text-zinc-500 italic border border-slate-200 dark:border-zinc-700 px-3 py-2 rounded text-center block">
                                Aguardando {(log.data as LineStopData)?.responsibleSector || 'Setor'}
                            </span>
                        )}
                    </div></div>{activeLineStopLog?.id === log.id && (<div className="mt-6 pt-6 border-t border-slate-200 dark:border-zinc-800 animate-in slide-in-from-top-2"><label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase mb-2 block">Justificativa e Plano de Ação</label><textarea className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-3 h-32 text-slate-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-600/50 outline-none" value={justificationInput} onChange={e => setJustificationInput(e.target.value)} placeholder="Descreva a solução definitiva..." /><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setActiveLineStopLog(null)}>Cancelar</Button><Button onClick={handleSaveJustification}>Salvar e Prosseguir</Button></div></div>)}</div>
            );
        })}</div>)}

        {/* UPLOAD TAB */}
        {lineStopTab === 'UPLOAD' && (<div className="space-y-4">{lineStopLogs.filter(l => l.status === 'WAITING_SIGNATURE').length === 0 && <p className="text-center text-slate-500 dark:text-zinc-500 py-10">Nenhum reporte aguardando upload.</p>}{lineStopLogs.filter(l => l.status === 'WAITING_SIGNATURE').map(log => {
            return (
                <div key={log.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 relative overflow-hidden shadow-sm"><div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div><div className="flex flex-col md:flex-row justify-between gap-4"><div><div className="flex items-center gap-2 mb-2"><span className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded text-xs font-bold uppercase border border-blue-200 dark:border-blue-900/50">Aguardando Assinatura</span><span className="text-slate-500 dark:text-zinc-500 text-xs">{new Date(log.date).toLocaleString()}</span></div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{getLogTitle(log)}</h3>
                    <div className="mt-2 text-sm text-slate-500 dark:text-zinc-400"><p>1. Baixe a planilha gerada.</p><p>2. Imprima e colete as assinaturas.</p><p>3. Tire uma foto e faça o upload abaixo.</p></div></div><div className="flex flex-col justify-center gap-2 min-w-[200px]"><Button variant="outline" onClick={async () => {
                        try { await exportLineStopToExcel(log); } catch (e: any) { alert("Erro ao baixar: " + e.message); }
                    }}><Printer size={16} /> Baixar Planilha</Button><Button onClick={() => setActiveLineStopLog(log)}>Fazer Upload</Button></div></div>{activeLineStopLog?.id === log.id && (<div className="mt-6 pt-6 border-t border-slate-200 dark:border-zinc-800 animate-in slide-in-from-top-2"><label className="cursor-pointer flex flex-col items-center justify-center h-32 w-full border-2 border-dashed border-slate-300 dark:border-zinc-700 hover:border-blue-500 rounded-lg transition-colors"><Camera size={24} className="mb-2 text-slate-400 dark:text-zinc-500" /><span className="text-sm text-slate-500 dark:text-zinc-400">Tirar Foto da Folha Assinada</span><input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleUploadSignedDoc(e.target.files[0]) }} /></label><Button variant="ghost" fullWidth className="mt-2" onClick={() => setActiveLineStopLog(null)}>Cancelar</Button></div>)}</div>
            );
        })}</div>)}

        {/* HISTORY TAB */}
        {lineStopTab === 'HISTORY' && (<div className="space-y-4">{lineStopLogs.filter(l => l.status === 'COMPLETED').length === 0 && <p className="text-center text-zinc-500 py-10">Histórico vazio.</p>}{lineStopLogs.filter(l => l.status === 'COMPLETED').map(log => {
            return (
                <div key={log.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5 flex flex-col md:flex-row justify-between items-center gap-4 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors shadow-sm"><div className="flex items-center gap-4"><div className="w-10 h-10 bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-500 rounded-full flex items-center justify-center border border-green-200 dark:border-green-900/30"><CheckCircle2 size={20} /></div><div>
                    <p className="font-bold text-slate-900 dark:text-zinc-200">{getLogTitle(log)}</p>
                    <p className="text-sm text-slate-500 dark:text-zinc-400">{new Date(log.date).toLocaleDateString()} • {(log.data as LineStopData)?.totalTime} parado</p></div></div><div className="flex gap-2"><Button variant="secondary" onClick={() => setPreviewLog(log)}><Eye size={16} /></Button>
                        <Button variant="outline" onClick={async () => {
                            try { await exportLineStopToExcel(log); }
                            catch (e: any) { alert("Erro ao baixar: " + e.message); }
                        }}>
                            <Download size={16} />
                        </Button>
                    </div></div>
            );
        })}</div>)}</div>
        {renderPreviewModal()}
    </Layout>;

    // --- GENERIC AUTHENTICATED VIEWS ---
    if (view === 'DASHBOARD' || view === 'CHECKLIST_MENU') {
        return (
            <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme} isDark={isDark}>
                {isLoading && <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center text-white backdrop-blur-sm">Salvando...</div>}

                {showLinePrompt && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                        <Card className="w-full max-w-sm bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 shadow-2xl">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Iniciar Checklist</h3>
                            <p className="text-sm text-slate-500 dark:text-zinc-400 mb-6">Selecione a linha de produção para iniciar a verificação.</p>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase mb-2 block">Selecione a Linha</label>
                                    <select
                                        className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 outline-none"
                                        value={currentLine}
                                        onChange={e => setCurrentLine(e.target.value)}
                                    >
                                        <option value="">Selecione uma linha...</option>
                                        {lines.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="secondary" fullWidth onClick={() => { setShowLinePrompt(false); setView('MENU'); }}>Cancelar</Button>
                                    <Button fullWidth onClick={handleConfirmLine}>Confirmar</Button>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 md:mb-8">
                    <div><h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">{isMaintenanceMode ? <Hammer className="text-purple-500" /> : <CheckSquare className="text-blue-500" />} {isMaintenanceMode ? 'Manutenção' : 'Checklist Digital'}</h1><div className="flex items-center gap-2 mt-2 text-sm text-slate-500 dark:text-zinc-400"><span className="bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">{currentLine}</span><span>•</span><span>{getManausDate().toLocaleDateString()}</span></div></div>
                    <div className="flex items-center gap-3"><Button variant="outline" onClick={() => setView(isMaintenanceMode ? 'MAINTENANCE_QR' : 'MENU')}><ArrowLeft size={16} /> Voltar</Button></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="hidden md:block md:col-span-1"><div className="sticky top-8 space-y-1 max-h-[80vh] overflow-y-auto custom-scrollbar pr-2"><p className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase px-2 mb-3 tracking-wider">Navegação Rápida</p>{categories.map(cat => (<button key={cat} onClick={() => categoryRefs.current[cat]?.scrollIntoView({ behavior: 'smooth' })} className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate border-l-2 border-transparent hover:border-blue-500">{cat}</button>))}</div></div>
                    <div className="md:col-span-3 space-y-10 pb-24">
                        {categories.map(cat => (
                            <div key={cat} ref={el => { categoryRefs.current[cat] = el; }} className="scroll-mt-8">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 pl-3 border-l-4 border-blue-600 flex items-center gap-2">{cat}</h2>
                                <div className="space-y-4">{items.filter(i => i.category === cat).map(item => { const currentStatus = checklistData[item.id]; return (<div key={item.id} className="bg-white dark:bg-zinc-900/50 rounded-xl p-5 border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 transition-all shadow-sm"><div className="flex flex-col gap-4">{item.imageUrl && (<div className="w-full h-48 bg-slate-200 dark:bg-black/20 rounded-lg border border-slate-300 dark:border-zinc-800 overflow-hidden flex items-center justify-center"><img src={item.imageUrl} alt="Ref" className="max-h-full max-w-full object-contain" /></div>)}<div className="flex-1"><p className="text-slate-900 dark:text-zinc-200 font-medium mb-1.5 text-base">{item.text}</p>{item.evidence && (<p className="text-slate-500 dark:text-zinc-500 text-xs italic mb-4 flex items-center gap-1"><AlertCircle size={12} /> Ref: {item.evidence}</p>)}<div className="flex gap-3 mb-2"><button onClick={() => setChecklistData({ ...checklistData, [item.id]: 'OK' })} className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all border flex items-center justify-center gap-2 ${currentStatus === 'OK' ? 'bg-green-100 dark:bg-green-500/10 border-green-500 text-green-700 dark:text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'bg-slate-50 dark:bg-zinc-950 border-slate-300 dark:border-zinc-800 text-slate-500 dark:text-zinc-500 hover:border-slate-400 dark:hover:border-zinc-600 hover:bg-slate-100 dark:hover:bg-zinc-900'}`}>OK</button><button onClick={() => setChecklistData({ ...checklistData, [item.id]: 'NG' })} className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all border flex items-center justify-center gap-2 ${currentStatus === 'NG' ? 'bg-red-100 dark:bg-red-500/10 border-red-500 text-red-700 dark:text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'bg-slate-50 dark:bg-zinc-950 border-slate-300 dark:border-zinc-800 text-slate-500 dark:text-zinc-500 hover:border-slate-400 dark:hover:border-zinc-600 hover:bg-slate-100 dark:hover:bg-zinc-900'}`}>NG</button><button onClick={() => setChecklistData({ ...checklistData, [item.id]: 'N/A' })} className={`w-20 py-3 rounded-lg font-bold text-sm transition-all border flex items-center justify-center ${currentStatus === 'N/A' ? 'bg-yellow-100 dark:bg-yellow-500/10 border-yellow-500 text-yellow-700 dark:text-yellow-400' : 'bg-slate-50 dark:bg-zinc-950 border-slate-300 dark:border-zinc-800 text-slate-500 dark:text-zinc-500 hover:border-slate-400 dark:hover:border-zinc-600 hover:bg-slate-100 dark:hover:bg-zinc-900'}`}>N/A</button></div>{currentStatus === 'NG' && (<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-lg p-4 mt-3 animate-in fade-in slide-in-from-top-2"><p className="text-xs text-red-600 dark:text-red-400 font-bold mb-3 flex items-center gap-1 uppercase tracking-wide"><AlertTriangle size={12} /> Evidência Obrigatória</p><Input placeholder="Descreva o motivo da falha..." value={checklistEvidence[item.id]?.comment || ''} onChange={e => handleNgComment(item.id, e.target.value)} className="bg-white dark:bg-black/20 border-red-200 dark:border-red-900/30 focus:border-red-500 mb-3 text-slate-900 dark:text-white" /><div>{checklistEvidence[item.id]?.photo ? (<div className="relative inline-block group"><img src={checklistEvidence[item.id]?.photo} className="h-24 w-auto rounded-lg border border-red-200 dark:border-red-900/30 shadow-lg" /><button onClick={() => setChecklistEvidence(prev => { const n = { ...prev }; delete n[item.id].photo; return n; })} className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-500 text-white rounded-full p-1 shadow-md transition-transform hover:scale-110"><X size={12} /></button></div>) : (<label className="cursor-pointer bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 hover:text-slate-900 dark:hover:text-white text-xs text-slate-500 dark:text-zinc-400 px-4 py-2.5 rounded-lg inline-flex items-center gap-2 border border-slate-300 dark:border-zinc-700 transition-colors"><Camera size={16} /> Tirar Foto<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleNgPhoto(item.id, e.target.files[0]) }} /></label>)}</div></div>)}</div></div></div>); })}</div>
                            </div>
                        ))}
                        <Card className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800">
                            <label className="block text-sm font-bold text-slate-500 dark:text-zinc-400 mb-3 uppercase tracking-wide">Observações Gerais</label>
                            <textarea className="w-full p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-zinc-200 h-32 resize-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 outline-none transition-all placeholder-slate-400 dark:placeholder-zinc-600" placeholder="Anotações adicionais sobre o turno..." value={observation} onChange={e => setObservation(e.target.value)} />
                        </Card>
                    </div>
                </div>
                <div className="fixed bottom-0 right-0 left-0 md:left-72 p-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-t border-slate-200 dark:border-zinc-800 flex justify-between items-center z-40"><div className="hidden md:block text-xs text-slate-500 dark:text-zinc-500">{Object.keys(checklistData).length} / {items.length} itens verificados</div><Button onClick={async () => { if (!currentUser) return; setIsLoading(true); const log: ChecklistLog = { id: currentLogId || Date.now().toString(), userId: currentUser.matricula, userName: currentUser.name, userRole: currentUser.role, line: currentLine, date: getManausDate().toISOString(), itemsCount: items.length, ngCount: Object.values(checklistData).filter(v => v === 'NG').length, observation, data: checklistData, evidenceData: checklistEvidence, type: isMaintenanceMode ? 'MAINTENANCE' : 'PRODUCTION', maintenanceTarget: maintenanceTarget, itemsSnapshot: items, userShift: currentUser.shift || '1' }; await saveLog(log); setIsLoading(false); setView('SUCCESS'); }} className="w-full md:w-auto shadow-xl shadow-blue-900/30 px-8 py-3"><Save size={18} /> Finalizar Relatório</Button></div>
            </Layout>
        );
    }

    if (view === 'SUCCESS') return <Layout variant="auth" onToggleTheme={toggleTheme} isDark={isDark}><div className="flex flex-col items-center justify-center min-h-screen text-center"><div className="w-24 h-24 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mb-6 border border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.2)] animate-in zoom-in duration-300"><CheckCircle2 size={48} /></div><h2 className="text-3xl font-bold text-white mb-2">Salvo com Sucesso!</h2><p className="text-zinc-400 mb-8 max-w-md">Os dados foram registrados no sistema.</p><Button onClick={() => setView('MENU')} className="min-w-[200px]">Voltar ao Início</Button></div></Layout>;
    if (view === 'PERSONAL') return <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme} isDark={isDark}><header className="flex items-center justify-between mb-4 md:mb-8"><h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white">Meus Registros</h1></header><div className="space-y-4">{personalLogs.length === 0 && <p className="text-slate-500 dark:text-zinc-500 text-center py-12 bg-white dark:bg-zinc-900/50 rounded-xl border border-slate-200 dark:border-zinc-800">Nenhum registro encontrado.</p>}{personalLogs.map(log => (<div key={log.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5 flex flex-col md:flex-row justify-between items-center gap-4 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors shadow-sm"><div className="flex items-center gap-4"><div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${log.ngCount > 0 ? 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-500 border border-red-200 dark:border-red-900/30' : 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-500 border border-green-200 dark:border-green-900/30'}`}>{log.ngCount > 0 ? '!' : '✓'}</div><div><p className="font-bold text-slate-900 dark:text-zinc-200">{new Date(log.date).toLocaleString()}</p><p className="text-sm text-slate-500 dark:text-zinc-400">{log.line} <span className="mx-2">•</span> {log.ngCount > 0 ? `${log.ngCount} Falhas` : '100% OK'} {log.type === 'LINE_STOP' && '(Parada)'}</p></div></div><div className="flex gap-2 w-full md:w-auto"><Button variant="secondary" onClick={() => setPreviewLog(log)} className="flex-1 md:flex-none"><Eye size={16} /></Button><Button variant="outline" onClick={() => exportLogToExcel(log, items)} className="flex-1 md:flex-none"><Download size={16} /> Excel</Button></div></div>))}</div>{renderPreviewModal()}</Layout>;
    if (view === 'PROFILE') return <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme} isDark={isDark}><header className="flex items-center justify-between mb-4 md:mb-8"><h1 className="text-lg md:text-2xl font-bold text-white">Meu Perfil</h1></header><Card className="max-w-xl mx-auto"><div className="flex flex-col items-center mb-8"><div className="w-24 h-24 bg-zinc-800 rounded-full flex items-center justify-center text-3xl font-bold mb-4 text-zinc-300 border-2 border-zinc-700 shadow-xl">{profileData?.name.charAt(0)}</div><p className="text-xl font-bold text-white">{profileData?.name}</p><p className="text-zinc-500 bg-zinc-950 px-3 py-1 rounded-full text-xs mt-2 border border-zinc-800">{profileData?.role}</p></div><div className="space-y-5"><Input label="Nome" value={profileData?.name} onChange={e => setProfileData({ ...profileData!, name: e.target.value })} /><Input label="Email" value={profileData?.email} onChange={e => setProfileData({ ...profileData!, email: e.target.value })} /><Input label="Alterar Senha" type="password" placeholder="Nova senha (opcional)" value={profileData?.password || ''} onChange={e => setProfileData({ ...profileData!, password: e.target.value })} /><div className="pt-4"><Button fullWidth onClick={handleSaveProfile}>Salvar Alterações</Button></div></div></Card></Layout>;
    if (view === 'MEETING_MENU') return <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme} isDark={isDark}><header className="mb-4 md:mb-8"><h1 className="text-lg md:text-2xl font-bold mb-2 text-slate-900 dark:text-white">Atas de Reunião</h1><p className="text-slate-500 dark:text-zinc-400">Gerencie registros de reuniões operacionais.</p></header><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div onClick={() => setView('MEETING_FORM')} className="group bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-emerald-600/50 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden shadow-sm"><div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-600/20 text-emerald-600 dark:text-emerald-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Plus size={24} /></div><h3 className="font-bold text-xl text-slate-900 dark:text-zinc-100">Nova Ata</h3><p className="text-sm text-slate-500 dark:text-zinc-500 mt-2">Registrar reunião online com foto.</p></div><div onClick={() => setView('MEETING_HISTORY')} className="group bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-blue-600/50 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden shadow-sm"><div className="w-12 h-12 bg-blue-100 dark:bg-blue-600/20 text-blue-600 dark:text-blue-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><History size={24} /></div><h3 className="font-bold text-xl text-slate-900 dark:text-zinc-100">Histórico</h3><p className="text-sm text-slate-500 dark:text-zinc-500 mt-2">Acessar e imprimir atas anteriores.</p></div></div></Layout>;
    if (view === 'MEETING_FORM') return <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme} isDark={isDark}><header className="flex items-center justify-between mb-4 md:mb-8 pb-4 md:pb-6 border-b border-zinc-800"><h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-zinc-100">Nova Ata de Reunião</h1><Button variant="outline" onClick={() => setView('MEETING_MENU')}>Cancelar</Button></header><div className="space-y-6 max-w-3xl mx-auto"><Card><Input label="Título da Reunião" placeholder="Ex: Alinhamento de Turno, Qualidade, etc." value={meetingTitle} onChange={e => setMeetingTitle(e.target.value)} icon={<FileText size={18} />} /><div className="flex gap-4 mt-4"><Input type="time" label="Início" value={meetingStartTime} onChange={e => setMeetingStartTime(e.target.value)} onClick={(e) => e.currentTarget.showPicker()} /><Input type="time" label="Fim" value={meetingEndTime} onChange={e => setMeetingEndTime(e.target.value)} onClick={(e) => e.currentTarget.showPicker()} /></div></Card><Card><h3 className="text-xs font-bold text-zinc-400 uppercase mb-3">Foto da Reunião (Obrigatório)</h3>{meetingPhoto ? (<div className="relative group"><img src={meetingPhoto} alt="Reunião" className="w-full h-64 object-cover rounded-lg border border-zinc-700" /><div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg"><Button variant="danger" onClick={() => setMeetingPhoto('')}><Trash2 size={16} /> Remover</Button></div></div>) : (<div className="h-64 bg-slate-100 dark:bg-zinc-950 border-2 border-dashed border-slate-300 dark:border-zinc-800 hover:border-slate-400 dark:hover:border-zinc-700 rounded-lg flex flex-col items-center justify-center text-slate-500 dark:text-zinc-500 transition-colors"><label className="cursor-pointer flex flex-col items-center p-8 w-full h-full justify-center"><Camera size={40} className="mb-4 text-slate-400 dark:text-zinc-600" /><span className="font-medium">Tirar Foto ou Upload</span><input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleMeetingPhoto(e.target.files[0]) }} /></label></div>)}</Card><Card><h3 className="text-xs font-bold text-zinc-400 uppercase mb-3">Participantes</h3><div className="flex gap-2 mb-4"><Input placeholder="Nome do participante" value={newParticipant} onChange={e => setNewParticipant(toTitleCase(e.target.value))} list="users-list" className="bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600" /><datalist id="users-list">{usersList.map(u => <option key={u.matricula} value={u.name} />)}</datalist><Button onClick={handleAddParticipant}><Plus size={18} /></Button></div><div className="flex flex-wrap gap-2">{meetingParticipants.map((p, idx) => (<div key={idx} className="bg-slate-200 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 px-3 py-1.5 rounded-full flex items-center gap-2 text-sm">{p} {p === currentUser?.name && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-200 px-1.5 rounded border border-blue-200 dark:border-blue-800 ml-1">Relator</span>}<button onClick={() => handleRemoveParticipant(idx)} className="hover:text-red-500 dark:hover:text-red-400"><X size={14} /></button></div>))}</div></Card><Card><h3 className="text-xs font-bold text-zinc-400 uppercase mb-3">Assuntos Tratados</h3><textarea className="w-full p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-200 h-40 focus:ring-2 focus:ring-blue-600/50 outline-none placeholder-slate-400 dark:placeholder-zinc-600" placeholder="Descreva os tópicos discutidos..." value={meetingTopics} onChange={e => setMeetingTopics(e.target.value)} /></Card><Button fullWidth onClick={handleSaveMeeting} disabled={isLoading} className="py-3">{isLoading ? 'Salvando...' : 'Salvar Ata'}</Button></div></Layout>;
    if (view === 'MEETING_HISTORY') return <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme}><header className="flex items-center justify-between mb-4 md:mb-8 pb-4 md:pb-6 border-b border-slate-200 dark:border-zinc-800"><h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-zinc-100">Histórico de Atas</h1><Button variant="outline" onClick={() => setView('MEETING_MENU')}><ArrowLeft size={16} /> Voltar</Button></header><div className="space-y-4">{meetingHistory.map(m => (<div key={m.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5 flex flex-col md:flex-row justify-between items-center gap-4 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors shadow-sm"><div><p className="font-bold text-slate-900 dark:text-white text-lg">{m.title || 'Sem Título'}</p><p className="font-medium text-slate-500 dark:text-zinc-400 text-sm flex items-center gap-2"><Calendar size={14} /> {new Date(m.date).toLocaleDateString()} • {m.startTime} - {m.endTime}</p><div className="flex gap-4 mt-2"><span className="text-xs text-slate-500 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-950 px-2 py-1 rounded">Criado por: {m.createdBy}</span><span className="text-xs text-slate-500 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-950 px-2 py-1 rounded">{m.participants.length} participantes</span></div></div><div className="flex gap-2"><Button variant="secondary" onClick={() => setPreviewMeeting(m)}><Eye size={16} /></Button><Button variant="outline" onClick={() => exportMeetingToExcel(m)}><Download size={16} /> Excel</Button></div></div>))}</div>{renderMeetingPreviewModal()}</Layout>;
    if (view === 'MAINTENANCE_QR') return <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme}><header className="flex items-center justify-between mb-4 md:mb-8 pb-4 md:pb-6 border-b border-slate-200 dark:border-zinc-800"><h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-zinc-100">Ler QR Code Máquina</h1></header><div className="max-w-md mx-auto"><div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 text-center"><div id="reader-hidden" className="hidden"></div><label className="cursor-pointer flex flex-col items-center justify-center h-48 w-full border-2 border-dashed border-slate-300 dark:border-zinc-700 hover:border-blue-500 rounded-xl transition-all mb-6 bg-slate-50 dark:bg-zinc-950"><Camera size={48} className={`mb-4 ${isProcessingPhoto ? 'text-blue-500 animate-pulse' : 'text-slate-400 dark:text-zinc-500'}`} /><span className="text-lg font-bold text-slate-700 dark:text-zinc-300">{isProcessingPhoto ? 'Processando Imagem...' : 'Tirar Foto do QR Code'}</span><span className="text-sm text-slate-500 dark:text-zinc-500 mt-2">Clique aqui para abrir a câmera</span><input type="file" accept="image/*" capture="environment" className="hidden" disabled={isProcessingPhoto} onChange={(e) => { if (e.target.files?.[0]) { handleMaintenanceQrPhoto(e.target.files[0]); e.target.value = ''; } }} /></label><div className="border-t border-slate-200 dark:border-zinc-800 pt-6 mt-6"><p className="text-xs font-bold text-slate-500 dark:text-zinc-500 mb-3 uppercase">Inserção Manual</p><div className="flex gap-2"><Input placeholder="Código (Ex: PRENSA_01)" value={qrCodeManual} onChange={e => setQrCodeManual(e.target.value)} /><Button onClick={() => handleMaintenanceCode(qrCodeManual)}>Ir</Button></div></div></div></div></Layout>;

    if (view === 'SCRAP') return <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme}><ScrapModule currentUser={currentUser!} onBack={() => { setView('MENU'); setScrapTab(undefined); }} initialTab={scrapTab} /></Layout>;

    if (view === 'IQC') return <Layout sidebar={<SidebarContent />} onToggleTheme={toggleTheme}><IQCModule currentUser={currentUser!} onBack={() => setView('MENU')} /></Layout>;

    return null;
};

export default App;
