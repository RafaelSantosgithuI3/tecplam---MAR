import React, { useState, useEffect, useRef } from 'react';
import { ScrapModule } from './components/ScrapModule';
import { Layout } from './components/Layout';
import { getScraps } from './services/scrapService';
import { Card } from './components/Card';
import { Button } from './components/Button';
import { Input } from './components/Input';
import { User, ChecklistData, ChecklistItem, ChecklistLog, MeetingLog, ChecklistEvidence, Permission, LineStopData, ConfigItem, Material } from './types';
import { getMaterials } from './services/materialService';
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
    Settings, Users, List, Search, Calendar, Eye, Download, Wifi, User as UserIcon, Upload, X, UserCheck,
    Camera, FileText, QrCode, Hammer, AlertTriangle, Shield, LayoutDashboard, Clock, Printer, EyeOff, Briefcase, Box, Lock, CheckCircle2
} from 'lucide-react';
import jsQR from 'jsqr';

type ViewState = 'SETUP' | 'LOGIN' | 'REGISTER' | 'RECOVER' | 'MENU' | 'CHECKLIST_MENU' | 'AUDIT_MENU' | 'DASHBOARD' | 'ADMIN' | 'SUCCESS' | 'PERSONAL' | 'PROFILE' | 'MEETING_MENU' | 'MEETING_FORM' | 'MEETING_HISTORY' | 'MAINTENANCE_QR' | 'LINE_STOP_DASHBOARD' | 'MANAGEMENT' | 'SCRAP';

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
    LINE_STOP: 'Parada de Linha',
    MEETING: 'Reuniões',
    ADMIN: 'Administração',
    MANAGEMENT: 'Gestão',
    SCRAP: 'Card de Scrap'
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
    const [recoverMatricula, setRecoverMatricula] = useState('');
    const [recoverEmail, setRecoverEmail] = useState('');
    const [recoverName, setRecoverName] = useState('');
    const [recoverNewPassword, setRecoverNewPassword] = useState('');

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

    // Scrap State
    const [scrapInitialTab, setScrapInitialTab] = useState<"FORM" | "PENDING" | "HISTORY" | "OPERATIONAL" | "MY_RESULTS" | "ADVANCED" | undefined>(undefined);

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
    const [adminTab, setAdminTab] = useState<'USERS' | 'PERMISSIONS'>('USERS');
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

    // Refs
    const categoryRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
    const passwordInputRef = useRef<HTMLInputElement>(null);

    const isSuperAdmin = currentUser ? (currentUser.matricula === 'admin' || currentUser.role === 'Admin' || currentUser.isAdmin === true) : false;

    // --- PERMISSION HELPERS ---
    const hasPermission = (module: 'CHECKLIST' | 'MEETING' | 'MAINTENANCE' | 'AUDIT' | 'ADMIN' | 'LINE_STOP' | 'MANAGEMENT' | 'SCRAP') => {
        if (!currentUser) return false;
        if (isSuperAdmin) return true;

        const perm = permissions.find(p => p.role === currentUser.role && p.module === module);
        if (perm) return perm.allowed;

        // Defaults
        if (module === 'LINE_STOP') return true;
        if (module === 'MEETING') return true;
        if (module === 'SCRAP') return true;
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
    }, [view, previewLog, previewMeeting, showUserEditModal]);

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
                    setPendingLineStopsCount(stops.filter(s => s.status === 'WAITING_JUSTIFICATION').length);

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
                    setPendingLineStopsCount(stops.filter(s => s.status === 'WAITING_JUSTIFICATION').length);

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
        const res = await recoverPassword(recoverEmail, recoverMatricula);
        setIsLoading(false);
        if (res.success) {
            alert("Senha redefinida com sucesso!");
            setView('LOGIN');
        } else {
            alert(res.message);
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
                <Card className="w-[95%] md:w-full md:max-w-4xl max-h-[90vh] overflow-y-auto bg-zinc-900 border border-zinc-800">
                    <div className="flex justify-between items-center mb-6 sticky top-0 bg-zinc-900 pt-2 pb-4 z-10 border-b border-zinc-800">
                        <div>
                            <h3 className="text-xl font-bold text-white">Detalhes do Checklist</h3>
                            <p className="text-zinc-400 text-sm">{new Date(previewLog.date).toLocaleString()} • {previewLog.userName}</p>
                        </div>
                        <button onClick={() => setPreviewLog(null)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors"><X size={24} /></button>
                    </div>

                    {previewLog.type === 'LINE_STOP' && lineStopDataRaw ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
                                    <span className="block text-zinc-500 text-xs font-bold uppercase">Linha</span>
                                    <span className="text-white font-medium">{previewLog.line}</span>
                                </div>
                                <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
                                    <span className="block text-zinc-500 text-xs font-bold uppercase">Modelo</span>
                                    <span className="text-white font-medium">{lineStopDataRaw.model}</span>
                                </div>
                                <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
                                    <span className="block text-zinc-500 text-xs font-bold uppercase">Tempo Parado</span>
                                    <span className="text-red-400 font-bold">{lineStopDataRaw.totalTime}</span>
                                </div>
                                <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
                                    <span className="block text-zinc-500 text-xs font-bold uppercase">Setor</span>
                                    <span className="text-white font-medium">{lineStopDataRaw.responsibleSector}</span>
                                </div>
                            </div>
                            <div className="bg-zinc-950 p-4 rounded border border-zinc-800">
                                <span className="block text-zinc-500 text-xs font-bold uppercase mb-2">Motivo</span>
                                <p className="text-zinc-300">{lineStopDataRaw.motivo}</p>
                            </div>
                            {lineStopDataRaw.justification && (
                                <div className="bg-zinc-950 p-4 rounded border border-zinc-800">
                                    <span className="block text-zinc-500 text-xs font-bold uppercase mb-2">Justificativa</span>
                                    <p className="text-zinc-300">{lineStopDataRaw.justification}</p>
                                    <p className="text-zinc-500 text-xs mt-2 italic">Por {lineStopDataRaw.justifiedBy} em {new Date(lineStopDataRaw.justifiedAt || '').toLocaleString()}</p>
                                </div>
                            )}
                            {evidencePhoto && (
                                <div className="mt-4">
                                    <span className="block text-zinc-500 text-xs font-bold uppercase mb-2">Documento Assinado / Evidência</span>
                                    <img src={evidencePhoto} className="max-w-full rounded border border-zinc-700" />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex gap-4">
                                <div className="flex-1 bg-zinc-950 p-4 rounded-xl border border-zinc-800 text-center">
                                    <div className="text-2xl font-bold text-white">{previewLog.itemsCount}</div>
                                    <div className="text-xs text-zinc-500 uppercase">Itens</div>
                                </div>
                                <div className="flex-1 bg-zinc-950 p-4 rounded-xl border border-zinc-800 text-center">
                                    <div className={`text-2xl font-bold ${previewLog.ngCount > 0 ? 'text-red-500' : 'text-green-500'}`}>{previewLog.ngCount}</div>
                                    <div className="text-xs text-zinc-500 uppercase">Não Conforme</div>
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
                                                <div key={itemId} className="bg-red-900/10 border border-red-900/30 p-4 rounded-lg">
                                                    <p className="font-medium text-zinc-200 mb-2">{itemDef.text}</p>
                                                    {evidence?.comment && <p className="text-sm text-red-300 mb-2">Obs: {evidence.comment}</p>}
                                                    {evidence?.photo && (
                                                        <img src={evidence.photo} className="h-32 rounded border border-red-900/50" />
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {previewLog.observation && (
                                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                                    <h4 className="text-zinc-400 font-bold text-sm uppercase mb-2">Observações</h4>
                                    <p className="text-zinc-300">{previewLog.observation}</p>
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
                <Card className="w-[95%] md:w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-zinc-900 border border-zinc-800">
                    <div className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4">
                        <div>
                            <h3 className="text-xl font-bold text-white">Visualizar Ata</h3>
                            <p className="text-zinc-400 text-sm">{new Date(previewMeeting.date).toLocaleDateString()}</p>
                        </div>
                        <button onClick={() => setPreviewMeeting(null)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors"><X size={24} /></button>
                    </div>
                    <div className="space-y-6">
                        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                            <h4 className="text-blue-400 font-bold text-lg mb-1">{previewMeeting.title}</h4>
                            <p className="text-sm text-zinc-400">Horário: {previewMeeting.startTime} - {previewMeeting.endTime}</p>
                            <p className="text-xs text-zinc-500 mt-2">Registrado por: {previewMeeting.createdBy}</p>
                        </div>

                        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                            <h5 className="font-bold text-zinc-300 mb-2 uppercase text-xs">Participantes</h5>
                            <div className="flex flex-wrap gap-2">
                                {previewMeeting.participants.map((p, idx) => (
                                    <span key={idx} className="bg-zinc-800 text-zinc-300 px-3 py-1 rounded-full text-xs border border-zinc-700">{p}</span>
                                ))}
                            </div>
                        </div>

                        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                            <h5 className="font-bold text-zinc-300 mb-2 uppercase text-xs">Assuntos Tratados</h5>
                            <p className="text-zinc-300 text-sm whitespace-pre-wrap">{previewMeeting.topics}</p>
                        </div>

                        {previewMeeting.photoUrl && (
                            <div>
                                <h5 className="font-bold text-zinc-300 mb-2 uppercase text-xs">Foto da Reunião</h5>
                                <img src={previewMeeting.photoUrl} className="w-full rounded-lg border border-zinc-700" alt="Reunião" />
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
            `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${active
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
            }`;

        return (
            <>
                <div className="p-6 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-blue-900/20 overflow-hidden">
                            <img src="/logo.png" className="w-full h-full object-contain" alt="LC" />
                        </div>
                        <div>
                            <h1 className="font-bold text-zinc-100 leading-tight tracking-tight">TECPLAM</h1>
                            <p className="text-zinc-500 text-[9px] uppercase tracking-widest font-semibold leading-tight">Monitoramento Automático</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
                    <button onClick={() => setView('MENU')} className={navItemClass(view === 'MENU')}>
                        <LayoutDashboard size={18} /> Menu Principal
                    </button>



                    {hasPermission('LINE_STOP') && (
                        <button onClick={() => setView('LINE_STOP_DASHBOARD')} className={navItemClass(view === 'LINE_STOP_DASHBOARD')}>
                            <AlertTriangle size={18} /> Parada de Linha
                        </button>
                    )}



                    {hasPermission('MEETING') && (
                        <button onClick={() => { initMeetingForm(); setView('MEETING_MENU'); }} className={navItemClass(view === 'MEETING_MENU' || view === 'MEETING_FORM' || view === 'MEETING_HISTORY')}>
                            <FileText size={18} /> Reuniões
                        </button>
                    )}

                    {hasPermission('SCRAP') && (
                        <button onClick={() => setView('SCRAP')} className={navItemClass(view === 'SCRAP')}>
                            <AlertTriangle size={18} /> Scrap
                        </button>
                    )}

                    {(hasPermission('AUDIT') || hasPermission('ADMIN') || hasPermission('MANAGEMENT')) && (
                        <div className="text-xs font-bold text-zinc-600 uppercase tracking-widest mt-6 mb-2 px-4">Gestão</div>
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
                </nav>

                <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
                    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer" onClick={() => setView('PROFILE')}>
                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 font-bold border border-zinc-600">
                            {currentUser?.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-200 truncate">{currentUser?.name}</p>
                            <p className="text-xs text-zinc-500 truncate">{currentUser?.role}</p>
                        </div>
                        <Settings size={14} className="text-zinc-500" />
                    </div>
                    <button onClick={handleLogout} className="mt-2 w-full flex items-center justify-center gap-2 text-xs text-red-400 hover:text-red-300 py-2 rounded hover:bg-red-900/10 transition-colors">
                        <LogOut size={14} /> Sair do Sistema
                    </button>
                </div>
            </>
        )
    }

    // --- RENDER VIEWS ---

    if (view === 'RECOVER') return (
        <Layout variant="auth">
            <div className="flex flex-col items-center justify-center min-h-screen px-4">
                <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 shadow-2xl w-full max-w-md">
                    <h2 className="text-xl font-bold mb-4 text-white text-center">Recuperar Senha</h2>
                    <p className="text-sm text-zinc-400 mb-6 text-center">Digite seus dados completos para redefinir a senha.</p>
                    <form onSubmit={handleRecover} className="space-y-4">
                        <Input label="Matrícula" value={recoverMatricula} onChange={e => setRecoverMatricula(e.target.value)} icon={<UserIcon size={18} />} />
                        <Input label="Nome Completo" value={recoverName} onChange={e => setRecoverName(toTitleCase(e.target.value))} icon={<UserIcon size={18} />} />
                        <Input label="Email" type="email" value={recoverEmail} onChange={e => setRecoverEmail(e.target.value)} icon={<Briefcase size={18} />} />
                        <Input label="Nova Senha" type="password" value={recoverNewPassword} onChange={e => setRecoverNewPassword(e.target.value)} icon={<Lock size={18} />} />
                        <Button fullWidth type="submit" disabled={isLoading}>{isLoading ? 'Enviando...' : 'Redefinir Senha'}</Button>
                    </form>
                    <div className="mt-4 pt-4 border-t border-zinc-800/50">
                        <Button variant="ghost" fullWidth onClick={() => setView('LOGIN')}>Voltar ao Login</Button>
                    </div>
                </div>
            </div>
        </Layout>
    );

    if (view === 'SETUP') return (
        <Layout variant="auth">
            <div className="flex flex-col items-center justify-center min-h-screen px-4">
                <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 shadow-2xl w-full max-w-md">
                    <h1 className="text-2xl font-bold text-center mb-4 text-white">Configuração de Rede</h1>
                    <Input label="IP do Servidor" value={serverIp} onChange={e => setServerIp(e.target.value)} placeholder="http://192.168.X.X:3000" />
                    <Button onClick={async () => { if (serverIp) { saveServerUrl(serverIp); await initApp(); } }} fullWidth className="mt-6">Conectar</Button>
                </div>
            </div>
        </Layout>
    );

    if (view === 'LOGIN') {
        return (
            <Layout variant="auth">
                <div className="flex flex-col items-center justify-center min-h-screen px-4">
                    <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 shadow-2xl w-full max-w-md">
                        <div className="flex justify-center mb-6">
                            <div className="w-24 h-24 rounded-2xl flex items-center justify-center overflow-hidden">
                                <img src="/logo.png" className="w-full h-full object-contain" alt="LC" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-center mb-1 text-white">TECPLAM</h1>
                        <p className="text-center text-zinc-400 mb-8 text-sm">Monitoramento Automático de Relatórios</p>
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
                                <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">Senha</label>
                                <div className="relative">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"><Lock size={18} /></div>
                                    <input
                                        ref={passwordInputRef}
                                        type={showLoginPassword ? "text" : "password"}
                                        className="w-full pl-10 pr-10 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 outline-none text-zinc-100 placeholder-zinc-600 transition-all shadow-inner text-sm"
                                        value={loginPassword}
                                        onChange={e => setLoginPassword(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleLogin(e);
                                        }}
                                    />
                                    <button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                                        {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                            {loginError && <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded border border-red-900/50 flex items-center gap-2"><AlertCircle size={16} /> {loginError}</div>}
                            <Button fullWidth type="submit" disabled={isLoading}>{isLoading ? 'Entrando...' : 'Entrar'}</Button>
                        </form>
                        <div className="mt-6 flex flex-col gap-3">
                            <button onClick={() => setView('REGISTER')} className="text-sm text-zinc-500 hover:text-blue-400 transition-colors">Não tem conta? Cadastre-se</button>
                            <button onClick={() => setView('RECOVER')} className="text-xs text-zinc-600 hover:text-zinc-400">Esqueci minha senha</button>
                            <div className="pt-4 border-t border-zinc-800/50">
                                <button onClick={() => setView('SETUP')} className="text-xs text-zinc-700 hover:text-zinc-500 flex items-center justify-center gap-1 w-full"><Wifi size={12} /> Configurar Servidor</button>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        );
    }

    if (view === 'REGISTER') {
        return (
            <Layout variant="auth">
                <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
                    <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 shadow-2xl w-full max-w-md">
                        <h1 className="text-2xl font-bold text-center mb-1 text-white">Criar Conta</h1>
                        <p className="text-center text-zinc-400 mb-6 text-sm">Preencha seus dados</p>
                        <form onSubmit={handleRegister} className="space-y-4">
                            <Input label="Nome Completo" value={regName} onChange={e => setRegName(toTitleCase(e.target.value))} />
                            <Input label="Matrícula" value={regMatricula} onChange={e => setRegMatricula(e.target.value)} />
                            <div>
                                <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">Função</label>
                                <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-600/50 outline-none" value={regRole} onChange={e => setRegRole(e.target.value)}>
                                    {availableRoles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">Turno</label>
                                <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-600/50 outline-none" value={regShift} onChange={e => setRegShift(e.target.value)}>
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
            <Layout sidebar={<SidebarContent />}>
                <header className="mb-8">
                    <h1 className="text-2xl font-bold mb-2 text-white">Bem-vindo, {currentUser?.name.split(' ')[0]}</h1>
                    <p className="text-zinc-400">Selecione um módulo para iniciar.</p>
                </header>

                {/* ALERTS SECTION */}
                <div className="mb-8 space-y-4">
                    {pendingScrapCount > 0 && (hasPermission('SCRAP')) && (
                        <div className="bg-red-900/20 border border-red-500/50 p-4 rounded-xl flex items-center gap-4 animate-pulse cursor-pointer hover:bg-red-900/30 transition-colors"
                            onClick={() => { setScrapInitialTab('PENDING'); setView('SCRAP'); }}>
                            <div className="p-2 bg-red-500 rounded-full text-white"><AlertTriangle size={20} /></div>
                            <div className="flex-1">
                                <h3 className="font-bold text-red-400">PENDÊNCIAS DE SCRAP</h3>
                                <p className="text-xs text-red-300">Você possui {pendingScrapCount} scraps aguardando contra medida.</p>
                            </div>
                            <Button size="sm" className="bg-red-600 hover:bg-red-700 border-none text-white" onClick={(e) => { e.stopPropagation(); setScrapInitialTab('PENDING'); setView('SCRAP'); }}>RESOLVER</Button>
                        </div>
                    )}
                    {pendingLineStopsCount > 0 && (
                        <div className="bg-red-900/20 border border-red-500/50 p-4 rounded-xl flex items-center gap-4 animate-pulse">
                            <div className="p-2 bg-red-500 rounded-full text-white"><AlertTriangle size={20} /></div>
                            <div className="flex-1">
                                <h3 className="font-bold text-red-400">Paradas sem Justificativa</h3>
                                <p className="text-xs text-red-300">Existem {pendingLineStopsCount} paradas de linha que requerem sua atenção.</p>
                            </div>
                            <Button size="sm" onClick={() => setView('LINE_STOP_DASHBOARD')}>Ver</Button>
                        </div>
                    )}

                    {missingLeadersNames.length > 0 && (hasPermission('AUDIT') || isSuperAdmin) && (
                        <div className="bg-yellow-900/20 border border-yellow-500/50 p-4 rounded-xl flex flex-col gap-3">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-yellow-500 rounded-full text-zinc-900"><Clock size={20} /></div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-yellow-400">Checklists Pendentes Hoje</h3>
                                    <p className="text-xs text-yellow-300">Líderes que ainda não enviaram o relatório do turno.</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 pl-12">
                                {missingLeadersNames.map(name => (
                                    <span key={name} className="px-2 py-1 bg-yellow-500/10 text-yellow-200 rounded text-xs border border-yellow-500/20">{name}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">


                    {hasPermission('LINE_STOP') && (
                        <div onClick={() => setView('LINE_STOP_DASHBOARD')} className="group bg-zinc-900 p-6 rounded-2xl border border-zinc-800 hover:border-red-600/50 hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden h-40 flex flex-col justify-center">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-red-600/20 text-red-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><AlertTriangle size={24} /></div>
                                <div>
                                    <h3 className="font-bold text-xl text-zinc-100">Parada de Linha</h3>
                                    <p className="text-xs text-zinc-500 mt-1">Reporte de interrupções</p>
                                </div>
                            </div>
                        </div>
                    )}



                    {hasPermission('MEETING') && (
                        <div onClick={() => { initMeetingForm(); setView('MEETING_MENU'); }} className="group bg-zinc-900 p-6 rounded-2xl border border-zinc-800 hover:border-emerald-600/50 hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden h-40 flex flex-col justify-center">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-emerald-600/20 text-emerald-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><FileText size={24} /></div>
                                <div>
                                    <h3 className="font-bold text-xl text-zinc-100">Reuniões</h3>
                                    <p className="text-xs text-zinc-500 mt-1">Atas e Registros</p>
                                </div>
                            </div>
                        </div>
                    )}



                    {hasPermission('MANAGEMENT') && (
                        <div onClick={() => setView('MANAGEMENT')} className="group bg-zinc-900 p-6 rounded-2xl border border-zinc-800 hover:border-cyan-600/50 hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden h-40 flex flex-col justify-center">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-cyan-600/20 text-cyan-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Briefcase size={24} /></div>
                                <div>
                                    <h3 className="font-bold text-xl text-zinc-100">Gestão</h3>
                                    <p className="text-xs text-zinc-500 mt-1">Cadastros Gerais</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {hasPermission('ADMIN') && (
                        <div onClick={() => setView('ADMIN')} className="group bg-zinc-900 p-6 rounded-2xl border border-zinc-800 hover:border-zinc-600/50 hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden h-40 flex flex-col justify-center">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-zinc-700/50 text-zinc-300 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Shield size={24} /></div>
                                <div>
                                    <h3 className="font-bold text-xl text-zinc-100">Admin</h3>
                                    <p className="text-xs text-zinc-500 mt-1">Configurações do Sistema</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div onClick={() => setView('SCRAP')} className="group bg-zinc-900 p-6 rounded-2xl border border-zinc-800 hover:border-red-500/50 hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden h-40 flex flex-col justify-center">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-red-500/20 text-red-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><AlertTriangle size={24} /></div>
                            <div>
                                <h3 className="font-bold text-xl text-zinc-100">Card de Scrap</h3>
                                <p className="text-xs text-zinc-500 mt-1">Refugos e Perdas</p>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        );
    }

    // --- AUDIT MENU ---

    // --- ADMIN VIEW ---
    if (view === 'ADMIN') {
        return (
            <Layout sidebar={<SidebarContent />}>
                <div className="w-full max-w-7xl mx-auto space-y-6">
                    <header className="flex items-center justify-between mb-8 pb-6 border-b border-zinc-800">
                        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2"><Shield className="text-zinc-400" /> Painel Administrativo</h1>
                    </header>
                    <div className="w-full">
                        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                            <Button variant={adminTab === 'USERS' ? 'primary' : 'secondary'} onClick={() => setAdminTab('USERS')}><Users size={16} /> Usuários</Button>
                            <Button variant={adminTab === 'PERMISSIONS' ? 'primary' : 'secondary'} onClick={() => setAdminTab('PERMISSIONS')}><Shield size={16} /> Permissões</Button>
                        </div>

                        {adminTab === 'PERMISSIONS' && (
                            <Card className="overflow-x-auto">
                                <h3 className="text-lg font-bold mb-4">Permissões de Acesso (Matriz Invertida)</h3>
                                <table className="w-full text-sm text-center border-collapse">
                                    <thead>
                                        <tr className="bg-zinc-950 text-zinc-400">
                                            <th className="p-3 text-left">Cargo</th>
                                            {['CHECKLIST', 'LINE_STOP', 'MEETING', 'MAINTENANCE', 'AUDIT', 'ADMIN', 'MANAGEMENT'].map(mod => (
                                                <th key={mod} className="p-3 min-w-[100px] text-xs uppercase">{MODULE_NAMES[mod] || mod}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800">
                                        {availableRoles.map(role => (
                                            <tr key={role.id} className="hover:bg-zinc-900">
                                                <td className="p-3 text-left font-bold text-white">{role.name}</td>
                                                {['CHECKLIST', 'LINE_STOP', 'MEETING', 'MAINTENANCE', 'AUDIT', 'ADMIN', 'MANAGEMENT'].map((module: any) => {
                                                    const perm = permissions.find(p => p.role === role.name && p.module === module);
                                                    const isAllowed = perm ? perm.allowed : (['CHECKLIST', 'MEETING', 'MAINTENANCE', 'LINE_STOP'].includes(module));
                                                    return (
                                                        <td key={module} className="p-3">
                                                            <input type="checkbox" checked={isAllowed} onChange={() => handleTogglePermission(role.name, module)} className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-blue-600/50" />
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Card>
                        )}

                        {adminTab === 'USERS' && (
                            <Card>
                                <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold">Usuários</h3><Button onClick={() => setView('REGISTER')} variant="outline" size="sm"><UserPlus size={16} /> Novo</Button></div>
                                <div className="overflow-x-auto"><table className="w-full text-sm text-left text-zinc-300"><thead className="text-xs text-zinc-400 uppercase bg-zinc-950"><tr><th>Nome</th><th>Matrícula</th><th>Função</th><th>Admin</th><th>Ações</th></tr></thead><tbody className="divide-y divide-zinc-800">{usersList.map(u => (<tr key={u.matricula}><td className="px-4 py-3">{u.name}</td><td className="px-4 py-3">{u.matricula}</td><td className="px-4 py-3">{u.role}</td><td className="px-4 py-3">{u.isAdmin ? <span className="text-green-400 font-bold bg-green-900/30 px-2 py-1 rounded text-xs border border-green-900/50">ADMIN</span> : <span className="text-zinc-600">-</span>}</td><td className="px-4 py-3"><button onClick={() => openEditModal(u)} className="mr-2 text-blue-400"><Edit3 size={16} /></button><button onClick={async () => { if (confirm('Excluir?')) { await deleteUser(u.matricula); setUsersList(await getAllUsers()); } }} className="text-red-400"><Trash2 size={16} /></button></td></tr>))}</tbody></table></div>
                            </Card>
                        )}

                        {showUserEditModal && editingUser && (
                            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                                <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
                                    <h3 className="text-xl font-bold mb-4">Editar Usuário</h3>
                                    <div className="space-y-3">
                                        <Input label="Nome" value={editingUser.name} onChange={e => setEditingUser({ ...editingUser, name: e.target.value })} />
                                        <Input label="Matrícula" value={editingUser.matricula} onChange={e => setEditingUser({ ...editingUser, matricula: e.target.value })} />
                                        <div><label className="text-xs font-medium text-zinc-400 mb-1">Função</label><select className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" value={editingUser.role} onChange={e => setEditingUser({ ...editingUser, role: e.target.value })}>{availableRoles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}</select></div>
                                        <div><label className="text-xs font-medium text-zinc-400 mb-1">Turno</label><select className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" value={editingUser.shift} onChange={e => setEditingUser({ ...editingUser, shift: e.target.value })}><option value="1">1º Turno</option><option value="2">2º Turno</option></select></div>
                                        <Input label="Nova Senha (Opcional)" value={editingUser.password || ''} onChange={e => setEditingUser({ ...editingUser, password: e.target.value })} />
                                        <div className="flex items-center gap-2 mt-2"><input type="checkbox" id="isAdminCheck" checked={editingUser.isAdmin || false} onChange={e => setEditingUser({ ...editingUser, isAdmin: e.target.checked })} /><label htmlFor="isAdminCheck" className="text-sm text-zinc-300">Acesso Admin Global</label></div>
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

    // --- MANAGEMENT MODULE (UPDATED WITH ID SUPPORT) ---
    if (view === 'MANAGEMENT') {
        const renderGenericList = (title: string, list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, saveFn: (l: string[]) => Promise<void>) => (
            <Card>
                <h3 className="text-lg font-bold mb-4">{title}</h3>
                <div className="flex gap-2 mb-6"><Input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder={`Novo ${title}`} /><Button onClick={() => handleAddItem(list, setList, saveFn)}>Add</Button></div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{list.map(l => <div key={l} className="bg-zinc-950 p-3 rounded flex justify-between items-center border border-zinc-800 text-sm">{l}<button onClick={() => handleDeleteItem(l, list, setList, saveFn)} className="text-red-500 hover:bg-red-900/20 p-1 rounded"><X size={14} /></button></div>)}</div>
            </Card>
        );

        // Render específico para itens com ID (Linhas e Cargos)
        const renderConfigList = (title: string, list: ConfigItem[], addFn: () => void, deleteFn: (id: number | string) => void) => (
            <Card>
                <h3 className="text-lg font-bold mb-4">{title}</h3>
                <div className="flex gap-2 mb-6"><Input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder={`Novo ${title}`} /><Button onClick={addFn}>Add</Button></div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{list.map(l => <div key={l.id} className="bg-zinc-950 p-3 rounded flex justify-between items-center border border-zinc-800 text-sm"><span className="truncate mr-2">{l.name}</span><button onClick={() => deleteFn(l.id)} className="text-red-500 hover:bg-red-900/20 p-1 rounded"><X size={14} /></button></div>)}</div>
            </Card>
        );

        return (
            <Layout sidebar={<SidebarContent />}>
                <div className="w-full max-w-7xl mx-auto space-y-6">
                    <header className="flex items-center justify-between mb-8 pb-6 border-b border-zinc-800">
                        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2"><Briefcase className="text-cyan-500" /> Gestão Centralizada</h1>
                    </header>
                    <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                        <Button variant={managementTab === 'LINES' ? 'primary' : 'secondary'} onClick={() => setManagementTab('LINES')}><List size={16} /> Linhas</Button>
                        <Button variant={managementTab === 'ROLES' ? 'primary' : 'secondary'} onClick={() => setManagementTab('ROLES')}><UserCheck size={16} /> Cargos</Button>
                        <Button variant={managementTab === 'MODELS' ? 'primary' : 'secondary'} onClick={() => setManagementTab('MODELS')}><Box size={16} /> Modelos</Button>
                        <Button variant={managementTab === 'STATIONS' ? 'primary' : 'secondary'} onClick={() => setManagementTab('STATIONS')}><Hammer size={16} /> Postos</Button>
                    </div>
                    {managementTab === 'LINES' && renderConfigList('Linhas de Produção', lines, handleAddLine, handleDeleteLine)}
                    {managementTab === 'ROLES' && renderConfigList('Cargos e Funções', availableRoles, handleAddRole, handleDeleteRole)}
                    {managementTab === 'MODELS' && (
                        <div className="space-y-8">
                            {renderGenericList('Modelos de Produção', models, setModels, saveModels)}
                            <hr className="border-zinc-800" />
                            <MaterialsManager
                                materials={materials}
                                setMaterials={setMaterials}
                                onRefresh={async () => setMaterials(await getMaterials())}
                            />
                        </div>
                    )}
                    {managementTab === 'STATIONS' && renderGenericList('Postos de Trabalho', stations, setStations, saveStations)}
                </div>
            </Layout>
        );
    }

    // --- LINE STOP DASHBOARD ---
    if (view === 'LINE_STOP_DASHBOARD') return <Layout sidebar={<SidebarContent />}><div className="w-full max-w-7xl mx-auto space-y-6"><header className="flex flex-col gap-4 mb-8 pb-6 border-b border-zinc-800"><h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2"><AlertTriangle className="text-red-500" /> Parada de Linha</h1><div className="flex gap-2 overflow-x-auto pb-2"><Button variant={lineStopTab === 'NEW' ? 'primary' : 'secondary'} onClick={() => setLineStopTab('NEW')}><Plus size={16} /> Novo Reporte</Button><Button variant={lineStopTab === 'PENDING' ? 'primary' : 'secondary'} onClick={() => setLineStopTab('PENDING')}><Clock size={16} /> Pendentes</Button><Button variant={lineStopTab === 'UPLOAD' ? 'primary' : 'secondary'} onClick={() => setLineStopTab('UPLOAD')}><Upload size={16} /> Upload Assinatura</Button><Button variant={lineStopTab === 'HISTORY' ? 'primary' : 'secondary'} onClick={() => setLineStopTab('HISTORY')}><History size={16} /> Histórico</Button></div></header>{lineStopTab === 'NEW' && (<div className="space-y-6 max-w-4xl mx-auto pb-20"><Card><h3 className="text-lg font-bold mb-4 border-b border-zinc-800 pb-2">Dados da Parada</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
            <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Modelo</label>
            <input list="model-list" className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" value={lineStopData.model} onChange={e => setLineStopData({ ...lineStopData, model: e.target.value })} placeholder="Selecione ou digite..." />
            <datalist id="model-list">{models.map(m => <option key={m} value={m} />)}</datalist>
        </div>
        <Input label="Cliente" value={lineStopData.client} onChange={e => setLineStopData({ ...lineStopData, client: e.target.value })} /><div><label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Linha</label><select className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" value={lineStopData.line} onChange={e => setLineStopData({ ...lineStopData, line: e.target.value })}>{lines.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}</select></div><Input label="Fase" value={lineStopData.phase} onChange={e => setLineStopData({ ...lineStopData, phase: e.target.value })} /></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"><Input type="time" label="Início" value={lineStopData.startTime} onChange={e => setLineStopData({ ...lineStopData, startTime: e.target.value, totalTime: calcTotalTime(e.target.value, lineStopData.endTime) })} onClick={(e) => e.currentTarget.showPicker()} /><Input type="time" label="Término" value={lineStopData.endTime} onChange={e => setLineStopData({ ...lineStopData, endTime: e.target.value, totalTime: calcTotalTime(lineStopData.startTime, e.target.value) })} onClick={(e) => e.currentTarget.showPicker()} /><Input label="Total" readOnly value={lineStopData.totalTime} className="text-red-400 font-bold" /><Input label="Pessoas Paradas" type="number" value={lineStopData.peopleStopped} onChange={e => setLineStopData({ ...lineStopData, peopleStopped: e.target.value })} /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Input label="Perca de Produção" value={lineStopData.productionLoss} onChange={e => setLineStopData({ ...lineStopData, productionLoss: e.target.value })} /><Input label="Tempo Padrão" value={lineStopData.standardTime} onChange={e => setLineStopData({ ...lineStopData, standardTime: e.target.value })} /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
                <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Posto (De)</label>
                <input list="station-list" className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" value={lineStopData.stationStart} onChange={e => setLineStopData({ ...lineStopData, stationStart: e.target.value })} placeholder="Selecione ou digite..." />
                <datalist id="station-list">{stations.map(s => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
                <label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Posto (Até)</label>
                <input list="station-list" className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-white" value={lineStopData.stationEnd} onChange={e => setLineStopData({ ...lineStopData, stationEnd: e.target.value })} placeholder="Selecione ou digite..." />
            </div></div></Card><Card><h3 className="text-lg font-bold mb-4 border-b border-zinc-800 pb-2">Motivo e Responsabilidade</h3><div className="mb-4"><label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Setor Responsável</label><div className="grid grid-cols-2 md:grid-cols-5 gap-2">{SECTORS_LIST.map(sec => (<button key={sec} onClick={() => setLineStopData({ ...lineStopData, responsibleSector: sec })} className={`p-2 rounded text-xs font-bold border ${lineStopData.responsibleSector === sec ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}>{sec}</button>))}</div></div><div><label className="text-xs font-bold text-zinc-500 uppercase mb-1 block">Motivo / Ocorrência Detalhada</label><textarea className="w-full bg-zinc-950 border border-zinc-800 rounded p-3 h-32 text-white" value={lineStopData.motivo} onChange={e => setLineStopData({ ...lineStopData, motivo: e.target.value })} placeholder="Descreva o que aconteceu..." /></div></Card><Button fullWidth className="py-4 text-lg shadow-xl shadow-red-900/20 bg-red-600 hover:bg-red-500" onClick={handleSaveLineStop}>Salvar Reporte</Button></div>)}

        {/* PENDING TAB */}
        {lineStopTab === 'PENDING' && (<div className="space-y-4">{lineStopLogs.filter(l => l.status === 'WAITING_JUSTIFICATION').length === 0 && <p className="text-center text-zinc-500 py-10">Nenhum reporte pendente de justificativa.</p>}{lineStopLogs.filter(l => l.status === 'WAITING_JUSTIFICATION').map(log => {
            return (
                <div key={log.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 relative overflow-hidden"><div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-500"></div><div className="flex flex-col md:flex-row justify-between gap-4"><div><div className="flex items-center gap-2 mb-2"><span className="bg-red-900/30 text-red-400 px-2 py-1 rounded text-xs font-bold uppercase border border-red-900/50">Aguardando Justificativa</span><span className="text-zinc-500 text-xs">{new Date(log.date).toLocaleString()}</span></div>
                    <h3 className="text-xl font-bold text-white mb-1">{getLogTitle(log)}</h3>
                    <p className="text-zinc-400 text-sm mb-4">Setor: <strong className="text-white">{(log.data as LineStopData)?.responsibleSector}</strong> | Tempo: <strong className="text-red-400">{(log.data as LineStopData)?.totalTime}</strong></p><p className="bg-zinc-950 p-3 rounded border border-zinc-800 text-zinc-300 text-sm">{(log.data as LineStopData)?.motivo}</p></div><div className="flex flex-col justify-center gap-2 min-w-[200px]">
                        {canUserJustify(currentUser, log) ? (<Button onClick={() => { setActiveLineStopLog(log); setJustificationInput(''); }}>Justificar</Button>) : (
                            <span className="text-xs text-zinc-500 italic border border-zinc-700 px-3 py-2 rounded text-center block">
                                Aguardando {(log.data as LineStopData)?.responsibleSector || 'Setor'}
                            </span>
                        )}
                    </div></div>{activeLineStopLog?.id === log.id && (<div className="mt-6 pt-6 border-t border-zinc-800 animate-in slide-in-from-top-2"><label className="text-xs font-bold text-zinc-500 uppercase mb-2 block">Justificativa e Plano de Ação</label><textarea className="w-full bg-zinc-950 border border-zinc-800 rounded p-3 h-32 text-white mb-4" value={justificationInput} onChange={e => setJustificationInput(e.target.value)} placeholder="Descreva a solução definitiva..." /><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setActiveLineStopLog(null)}>Cancelar</Button><Button onClick={handleSaveJustification}>Salvar e Prosseguir</Button></div></div>)}</div>
            );
        })}</div>)}

        {/* UPLOAD TAB */}
        {lineStopTab === 'UPLOAD' && (<div className="space-y-4">{lineStopLogs.filter(l => l.status === 'WAITING_SIGNATURE').length === 0 && <p className="text-center text-zinc-500 py-10">Nenhum reporte aguardando upload.</p>}{lineStopLogs.filter(l => l.status === 'WAITING_SIGNATURE').map(log => {
            return (
                <div key={log.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 relative overflow-hidden"><div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div><div className="flex flex-col md:flex-row justify-between gap-4"><div><div className="flex items-center gap-2 mb-2"><span className="bg-blue-900/30 text-blue-400 px-2 py-1 rounded text-xs font-bold uppercase border border-blue-900/50">Aguardando Assinatura</span><span className="text-zinc-500 text-xs">{new Date(log.date).toLocaleString()}</span></div>
                    <h3 className="text-xl font-bold text-white mb-1">{getLogTitle(log)}</h3>
                    <div className="mt-2 text-sm text-zinc-400"><p>1. Baixe a planilha gerada.</p><p>2. Imprima e colete as assinaturas.</p><p>3. Tire uma foto e faça o upload abaixo.</p></div></div><div className="flex flex-col justify-center gap-2 min-w-[200px]"><Button variant="outline" onClick={async () => {
                        try { await exportLineStopToExcel(log); } catch (e: any) { alert("Erro ao baixar: " + e.message); }
                    }}><Printer size={16} /> Baixar Planilha</Button><Button onClick={() => setActiveLineStopLog(log)}>Fazer Upload</Button></div></div>{activeLineStopLog?.id === log.id && (<div className="mt-6 pt-6 border-t border-zinc-800 animate-in slide-in-from-top-2"><label className="cursor-pointer flex flex-col items-center justify-center h-32 w-full border-2 border-dashed border-zinc-700 hover:border-blue-500 rounded-lg transition-colors"><Camera size={24} className="mb-2 text-zinc-500" /><span className="text-sm text-zinc-400">Tirar Foto da Folha Assinada</span><input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleUploadSignedDoc(e.target.files[0]) }} /></label><Button variant="ghost" fullWidth className="mt-2" onClick={() => setActiveLineStopLog(null)}>Cancelar</Button></div>)}</div>
            );
        })}</div>)}

        {/* HISTORY TAB */}
        {lineStopTab === 'HISTORY' && (<div className="space-y-4">{lineStopLogs.filter(l => l.status === 'COMPLETED').length === 0 && <p className="text-center text-zinc-500 py-10">Histórico vazio.</p>}{lineStopLogs.filter(l => l.status === 'COMPLETED').map(log => {
            return (
                <div key={log.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col md:flex-row justify-between items-center gap-4 hover:border-zinc-700 transition-colors"><div className="flex items-center gap-4"><div className="w-10 h-10 bg-green-900/20 text-green-500 rounded-full flex items-center justify-center border border-green-900/30"><CheckCircle2 size={20} /></div><div>
                    <p className="font-bold text-zinc-200">{getLogTitle(log)}</p>
                    <p className="text-sm text-zinc-400">{new Date(log.date).toLocaleDateString()} • {(log.data as LineStopData)?.totalTime} parado</p></div></div><div className="flex gap-2"><Button variant="secondary" onClick={() => setPreviewLog(log)}><Eye size={16} /></Button>
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

    if (view === 'SUCCESS') return <Layout variant="auth"><div className="flex flex-col items-center justify-center min-h-screen text-center"><div className="w-24 h-24 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mb-6 border border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.2)] animate-in zoom-in duration-300"><CheckCircle2 size={48} /></div><h2 className="text-3xl font-bold text-white mb-2">Salvo com Sucesso!</h2><p className="text-zinc-400 mb-8 max-w-md">Os dados foram registrados no sistema.</p><Button onClick={() => setView('MENU')} className="min-w-[200px]">Voltar ao Início</Button></div></Layout>;
    if (view === 'PERSONAL') return <Layout sidebar={<SidebarContent />}><header className="flex items-center justify-between mb-8"><h1 className="text-2xl font-bold text-white">Meus Registros</h1></header><div className="space-y-4">{personalLogs.length === 0 && <p className="text-zinc-500 text-center py-12 bg-zinc-900/50 rounded-xl border border-zinc-800">Nenhum registro encontrado.</p>}{personalLogs.map(log => (<div key={log.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col md:flex-row justify-between items-center gap-4 hover:border-zinc-700 transition-colors"><div className="flex items-center gap-4"><div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${log.ngCount > 0 ? 'bg-red-900/20 text-red-500 border border-red-900/30' : 'bg-green-900/20 text-green-500 border border-green-900/30'}`}>{log.ngCount > 0 ? '!' : '✓'}</div><div><p className="font-bold text-zinc-200">{new Date(log.date).toLocaleString()}</p><p className="text-sm text-zinc-400">{log.line} <span className="mx-2">•</span> {log.ngCount > 0 ? `${log.ngCount} Falhas` : '100% OK'} {log.type === 'LINE_STOP' && '(Parada)'}</p></div></div><div className="flex gap-2 w-full md:w-auto"><Button variant="secondary" onClick={() => setPreviewLog(log)} className="flex-1 md:flex-none"><Eye size={16} /></Button><Button variant="outline" onClick={() => exportLogToExcel(log, items)} className="flex-1 md:flex-none"><Download size={16} /> Excel</Button></div></div>))}</div>{renderPreviewModal()}</Layout>;
    if (view === 'PROFILE') return <Layout sidebar={<SidebarContent />}><header className="flex items-center justify-between mb-8"><h1 className="text-2xl font-bold text-white">Meu Perfil</h1></header><Card className="max-w-xl mx-auto"><div className="flex flex-col items-center mb-8"><div className="w-24 h-24 bg-zinc-800 rounded-full flex items-center justify-center text-3xl font-bold mb-4 text-zinc-300 border-2 border-zinc-700 shadow-xl">{profileData?.name.charAt(0)}</div><p className="text-xl font-bold text-white">{profileData?.name}</p><p className="text-zinc-500 bg-zinc-950 px-3 py-1 rounded-full text-xs mt-2 border border-zinc-800">{profileData?.role}</p></div><div className="space-y-5"><Input label="Nome" value={profileData?.name} onChange={e => setProfileData({ ...profileData!, name: e.target.value })} /><Input label="Email" value={profileData?.email} onChange={e => setProfileData({ ...profileData!, email: e.target.value })} /><Input label="Alterar Senha" type="password" placeholder="Nova senha (opcional)" value={profileData?.password || ''} onChange={e => setProfileData({ ...profileData!, password: e.target.value })} /><div className="pt-4"><Button fullWidth onClick={handleSaveProfile}>Salvar Alterações</Button></div></div></Card></Layout>;
    if (view === 'MEETING_MENU') return <Layout sidebar={<SidebarContent />}><header className="mb-8"><h1 className="text-2xl font-bold mb-2 text-white">Atas de Reunião</h1><p className="text-zinc-400">Gerencie registros de reuniões operacionais.</p></header><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div onClick={() => setView('MEETING_FORM')} className="group bg-zinc-900 p-6 rounded-2xl border border-zinc-800 hover:border-emerald-600/50 hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden"><div className="w-12 h-12 bg-emerald-600/20 text-emerald-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Plus size={24} /></div><h3 className="font-bold text-xl text-zinc-100">Nova Ata</h3><p className="text-sm text-zinc-500 mt-2">Registrar reunião online com foto.</p></div><div onClick={() => setView('MEETING_HISTORY')} className="group bg-zinc-900 p-6 rounded-2xl border border-zinc-800 hover:border-blue-600/50 hover:bg-zinc-800 transition-all cursor-pointer relative overflow-hidden"><div className="w-12 h-12 bg-blue-600/20 text-blue-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><History size={24} /></div><h3 className="font-bold text-xl text-zinc-100">Histórico</h3><p className="text-sm text-zinc-500 mt-2">Acessar e imprimir atas anteriores.</p></div></div></Layout>;
    if (view === 'MEETING_FORM') return <Layout sidebar={<SidebarContent />}><header className="flex items-center justify-between mb-8 pb-6 border-b border-zinc-800"><h1 className="text-2xl font-bold text-zinc-100">Nova Ata de Reunião</h1><Button variant="outline" onClick={() => setView('MEETING_MENU')}>Cancelar</Button></header><div className="space-y-6 max-w-3xl mx-auto"><Card><Input label="Título da Reunião" placeholder="Ex: Alinhamento de Turno, Qualidade, etc." value={meetingTitle} onChange={e => setMeetingTitle(e.target.value)} icon={<FileText size={18} />} /><div className="flex gap-4 mt-4"><Input type="time" label="Início" value={meetingStartTime} onChange={e => setMeetingStartTime(e.target.value)} onClick={(e) => e.currentTarget.showPicker()} /><Input type="time" label="Fim" value={meetingEndTime} onChange={e => setMeetingEndTime(e.target.value)} onClick={(e) => e.currentTarget.showPicker()} /></div></Card><Card><h3 className="text-xs font-bold text-zinc-400 uppercase mb-3">Foto da Reunião (Obrigatório)</h3>{meetingPhoto ? (<div className="relative group"><img src={meetingPhoto} alt="Reunião" className="w-full h-64 object-cover rounded-lg border border-zinc-700" /><div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg"><Button variant="danger" onClick={() => setMeetingPhoto('')}><Trash2 size={16} /> Remover</Button></div></div>) : (<div className="h-64 bg-zinc-950 border-2 border-dashed border-zinc-800 hover:border-zinc-700 rounded-lg flex flex-col items-center justify-center text-zinc-500 transition-colors"><label className="cursor-pointer flex flex-col items-center p-8 w-full h-full justify-center"><Camera size={40} className="mb-4 text-zinc-600" /><span className="font-medium">Tirar Foto ou Upload</span><input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleMeetingPhoto(e.target.files[0]) }} /></label></div>)}</Card><Card><h3 className="text-xs font-bold text-zinc-400 uppercase mb-3">Participantes</h3><div className="flex gap-2 mb-4"><Input placeholder="Nome do participante" value={newParticipant} onChange={e => setNewParticipant(toTitleCase(e.target.value))} list="users-list" className="bg-zinc-950" /><datalist id="users-list">{usersList.map(u => <option key={u.matricula} value={u.name} />)}</datalist><Button onClick={handleAddParticipant}><Plus size={18} /></Button></div><div className="flex flex-wrap gap-2">{meetingParticipants.map((p, idx) => (<div key={idx} className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1.5 rounded-full flex items-center gap-2 text-sm">{p} {p === currentUser?.name && <span className="text-[10px] bg-blue-900/50 text-blue-200 px-1.5 rounded border border-blue-800 ml-1">Relator</span>}<button onClick={() => handleRemoveParticipant(idx)} className="hover:text-red-400"><X size={14} /></button></div>))}</div></Card><Card><h3 className="text-xs font-bold text-zinc-400 uppercase mb-3">Assuntos Tratados</h3><textarea className="w-full p-4 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 h-40 focus:ring-2 focus:ring-blue-600/50 outline-none placeholder-zinc-600" placeholder="Descreva os tópicos discutidos..." value={meetingTopics} onChange={e => setMeetingTopics(e.target.value)} /></Card><Button fullWidth onClick={handleSaveMeeting} disabled={isLoading} className="py-3">{isLoading ? 'Salvando...' : 'Salvar Ata'}</Button></div></Layout>;
    if (view === 'MEETING_HISTORY') return <Layout sidebar={<SidebarContent />}><header className="flex items-center justify-between mb-8 pb-6 border-b border-zinc-800"><h1 className="text-2xl font-bold text-zinc-100">Histórico de Atas</h1><Button variant="outline" onClick={() => setView('MEETING_MENU')}><ArrowLeft size={16} /> Voltar</Button></header><div className="space-y-4">{meetingHistory.map(m => (<div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col md:flex-row justify-between items-center gap-4 hover:border-zinc-700 transition-colors"><div><p className="font-bold text-white text-lg">{m.title || 'Sem Título'}</p><p className="font-medium text-zinc-400 text-sm flex items-center gap-2"><Calendar size={14} /> {new Date(m.date).toLocaleDateString()} • {m.startTime} - {m.endTime}</p><div className="flex gap-4 mt-2"><span className="text-xs text-zinc-500 bg-zinc-950 px-2 py-1 rounded">Criado por: {m.createdBy}</span><span className="text-xs text-zinc-500 bg-zinc-950 px-2 py-1 rounded">{m.participants.length} participantes</span></div></div><div className="flex gap-2"><Button variant="secondary" onClick={() => setPreviewMeeting(m)}><Eye size={16} /></Button><Button variant="outline" onClick={() => exportMeetingToExcel(m)}><Download size={16} /> Excel</Button></div></div>))}</div>{renderMeetingPreviewModal()}</Layout>;

    if (view === 'SCRAP') return <Layout sidebar={<SidebarContent />}><ScrapModule currentUser={currentUser!} onBack={() => { setView('MENU'); setScrapInitialTab(undefined); }} initialTab={scrapInitialTab} /></Layout>;

    return null;
};

export default App;
