
export type ResponseType = 'OK' | 'NG' | 'N/A';

export interface User {
  name: string;
  matricula: string;
  role: string; // Função
  shift?: string; // Turno (Novo)
  email?: string; // Optional
  password?: string; // Stored securely in real app, simulated here
  isAdmin?: boolean; // Novo campo para controle explícito de admin
  permissions?: string[]; // Array de strings, ex: ['VIEW_SCRAP', 'EDIT_PREPARATION']
}

// Constantes de Permissão
export const PERMISSIONS = {
  VIEW_SCRAP: 'view_scrap',
  VIEW_PREPARATION: 'view_preparation',
  VIEW_AUDIT: 'view_audit',
  VIEW_IQC: 'view_iqc',
  VIEW_MANAGEMENT: 'view_management', // Gestão de Modelos/Linhas
  VIEW_DASHBOARD: 'view_dashboard',   // Dashboard Geral
  VIEW_ADMIN: 'view_admin_panel',      // Aba de Permissões/Usuários
  VIEW_LINE_STOP: 'view_line_stop',
  VIEW_MAINTENANCE: 'view_maintenance',
  VIEW_MEETING: 'view_meeting',
  VIEW_CHECKLIST: 'view_checklist',
  VIEW_PEOPLE_MANAGEMENT: 'view_people_management'
};

export interface ConfigItem {
  id: number | string;
  name: string;
}

export interface ChecklistItem {
  id: string;
  category: string; // Maps to 'Posto'
  text: string;     // Maps to 'Item'
  evidence?: string; // Maps to 'Evidencia'
  imageUrl?: string; // URL da imagem ilustrativa (Base64)
  type?: 'LEADER' | 'MAINTENANCE'; // Novo: Tipo de item
}

export interface ChecklistData {
  [key: string]: ResponseType;
}

export interface ChecklistEvidence {
  [key: string]: {
    comment: string;
    photo?: string;
  }
}

// Interface específica para Parada de Linha
export interface LineStopData {
  model: string;
  client: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  totalTime: string; // Calculado
  line: string;
  phase: string;
  productionLoss: string; // Perca de produção
  standardTime: string;   // Tempo padrão
  peopleStopped: string;  // Qtde pessoas
  stationStart: string;   // Posto parado De
  stationEnd: string;     // Posto parado Até

  // Novo fluxo
  motivo: string; // A7:J11 (Obrigatório na criação)
  responsibleSector: string; // Setor Responsável

  // Segunda etapa
  justification?: string; // Preenchido depois pelo responsável
  justifiedBy?: string;   // Quem justificou
  justifiedAt?: string;   // Data da justificativa
}

export type LogStatus = 'OPEN' | 'WAITING_JUSTIFICATION' | 'WAITING_SIGNATURE' | 'COMPLETED';

// Histórico para o Admin visualizar
export interface ChecklistLog {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  userShift: string;
  line: string; // Linha de produção
  date: string; // ISO String
  ngCount: number;
  observation: string;
  itemsCount: number;
  data: ChecklistData | LineStopData; // Pode ser Checklist ou Parada
  evidenceData?: ChecklistEvidence; // Evidências de NG
  type?: 'PRODUCTION' | 'MAINTENANCE' | 'LINE_STOP'; // Tipo de checklist
  maintenanceTarget?: string; // Se for manutenção, qual máquina

  // Controle de fluxo Parada de Linha
  status?: LogStatus;
  signedDocUrl?: string; // URL da foto da folha assinada

  // Snapshot dos itens no momento do checklist para versionamento
  itemsSnapshot?: ChecklistItem[];
}

export interface MeetingLog {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  photoUrl: string;
  participants: string[];
  topics: string;
  createdBy: string;
}

export interface Permission {
  role: string;
  module: 'CHECKLIST' | 'MEETING' | 'MAINTENANCE' | 'AUDIT' | 'ADMIN' | 'LINE_STOP' | 'MANAGEMENT' | 'PEOPLE_MANAGEMENT' | 'SCRAP' | 'IQC' | 'PREPARATION';
  allowed: boolean;
}

export interface ScrapData {
  id?: string;
  userId: string; // USER
  date: string; // DATA
  time: string; // HORARIO
  week: number; // SEMANA
  shift: string; // TURNO
  leaderName: string; // LIDER
  pqc: string; // PQC
  model: string; // MODELO
  qty: number; // QTY
  item: string; // ITEM
  status: string; // STATUS
  code: string; // CODIGO
  description: string; // DESCRICAO
  unitValue: number; // V_UN
  totalValue: number; // VALOR_TTL
  usedModel: string; // MODELO_USADO
  responsible: string; // RESPONSAVEL
  station: string; // ESTACAO
  reason: string; // MOTIVO
  rootCause: string; // CAUSA_RAIZ
  countermeasure?: string; // CONTRA_MEDIDA (Pode ser nulo)
  immediateAction?: string; // ACAO_IMEDIATA
  qrCode?: string; // QR Code do material lido

  line: string; // Nova Linha (Select)

  // Campos IQC
  nfNumber?: string;
  sentBy?: string;
  sentAt?: Date | string;
  plant?: string;
  situation?: string; // PENDING | SENT
}

export interface Material {
  id?: string;
  code: string;
  model: string;
  description: string;
  item: string;
  plant: string;
  price: number;
}


export interface ConfigModel {
  id: string; // name
  name: string;
  sku?: string;
}

export interface PreparationLog {
  id?: number;
  date: string;
  shift: string;
  line: string;
  model: string;
  sku?: string;
  plate?: string;
  rear?: string;
  btFt?: string;
  pba?: string;
  currentRfCal?: string;
  input?: string;
  preKey?: string;
  lcia?: string;
  audio?: string;
  radiation?: string;
  imei?: string;
  vct?: string;
  revision?: string;
  desmonte?: string;
  oven?: string;
  repair?: string;
  observation?: string;
  responsible?: string;
  createdAt?: Date | string;
}

export interface LineStatus {
  status: 'OK' | 'NG' | 'PENDING';
  logIds: string[];
  leaderName?: string;
}

export interface LeaderStatus {
  user: User;
  statuses: {
    date: string;
    status: 'OK' | 'NG' | 'PENDING';
    logId?: string;
  }[];
}
