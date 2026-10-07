export enum MaintenanceStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  PRE_COMPLETED = 'pre_completed',
  COMPLETED = 'completed'
}

export enum ServiceCallStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CANCELLED = 'cancelled'
}

export enum ServiceCallPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export interface Attachment {
  id: string;
  url: string; // Base64 string or external URL
  name: string;
  type?: 'image' | 'pdf' | 'link';
}

export interface ServiceCallComment {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  content: string;
  createdAt: any;
}

export interface ServiceCall {
  id: string;
  clientId: string;
  addressId: string;
  maintenanceRecordId?: string; // Optional link to origin maintenance
  description: string;
  status: ServiceCallStatus;
  priority: ServiceCallPriority;
  createdAt: any;
  resolvedAt?: any;
  resolvedBy?: string;
  resolutionNotes?: string;
  attachmentUrl?: string; // Legacy
  attachmentUrl1?: string;
  attachmentUrl2?: string;
  linkUrl?: string;
  attachments?: Attachment[];
  forecastDate?: string;
  comments?: ServiceCallComment[];
  // Denormalized for reports
  clientName?: string;
  addressLabel?: string;
}

export enum UserRole {
  ADMIN = 'admin',
  ASSISTANT = 'assistant',
  MANAGER = 'manager',
  SUPPORT = 'support',
  TECHNICIAN = 'technician'
}

export enum RouteType {
  VARIABLE = 'variable',
  FIXED = 'fixed',
  TEMPORARY = 'temporary'
}

export interface RouteConfiguration {
  id: string;
  routeNumber?: string;
  routeName: string;
  type: RouteType;
  technician1?: string;
  technician2?: string;
  updatedAt: any;
}

export interface NotificationPreferences {
  notifyNewCall: boolean;
  notifyNewComment: boolean;
  notifyCallResolved: boolean;
  notifyTaskAssigned?: boolean;
  notifyTaskComment?: boolean;
  notifyTaskAttachment?: boolean;
  notifyShowPopups?: boolean;
  notifySoundEnabled?: boolean;
  notificationSoundVolume?: number;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: 'new_call' | 'new_comment' | 'call_resolved' | 'task_assigned' | 'task_comment' | 'task_attachment' | 'tech_start' | 'tech_finish';
  callId?: string;
  taskId?: string;
  recordId?: string;
  read: boolean;
  createdAt: any;
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  clientId?: string; // Only for managers
  createdAt: any;
  phone?: string;
  avatarUrl?: string;
  notificationPreferences?: NotificationPreferences;
  lastLogin?: any;
  lastActive?: any;
}
export interface Client {
  id: string;
  name: string;
  fullName?: string;
  billingCycleInfo?: string;
  billingDay?: number;
  createdAt?: any;
  status?: 'active' | 'inactive';
  deletedAt?: any;
  cnpj?: string;
  phone?: string;
  stateRegistration?: string;
  cityRegistration?: string;
  fullAddress?: string;
  contractNumber?: string;
  processNumber?: string;
  pricePerMachine?: number;
  pricePerCorrective?: number;
  contractCycle?: number;
  preventiveChecklist?: string[];
  serviceCompany?: 'lefrio' | 'alclima';
  cycleMonth?: string;
  cycleStartDate?: string;
  cycleEndDate?: string;
  cyclePeriod?: 'monthly' | 'bimonthly' | 'quarterly' | 'custom';
  cycleRefFormat?: 'number_only' | 'full_period' | 'number_month' | 'period_only';
  sharepointFolderLink?: string;
  sharepointFolderId?: string;
  email?: string;
}

export interface Address {
  id: string;
  clientId: string;
  street: string;
  route: string;
  totalMachines: number;
  clientName?: string; // Denormalized for easier search
  coordinates?: string;
  createdAt?: any;
  name?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
  status?: 'active' | 'inactive';
  active?: boolean;
  isInactive?: boolean;
  deactivatedAt?: string;
  deactivatedReason?: string;
  deactivatedBy?: string;
  reactivatedAt?: string;
  notes?: string;
}

export interface Equipment {
  id: string; // Auto-generated string ID: e.g. "0001", "0002", etc.
  addressId: string;
  name: string;
  sector: string;
  patrimony: string;
  label: string; // Column order / priority label on tablet
  brand?: string;
  btus?: string;
  createdAt?: any;
  addedByTech?: boolean;
  isPendingApproval?: boolean;
  status?: 'active' | 'deactivated';
  active?: boolean;
  isDeactivated?: boolean;
  deactivatedAt?: string;
  deactivatedReason?: string;
  deactivatedBy?: string;
  deactivatedFromRecordId?: string;
  deactivatedAddressName?: string;
  deactivatedClientName?: string;
  reactivatedAt?: string;
}

export interface MaintenanceRecord {
  id: string;
  month: string; // YYYY-MM
  addressId: string; // Will be set to 'TEMPORARY' for temp routes
  scheduledWeek: number; // 1, 2, 3, 4, 5
  technician1?: string;
  technician2?: string;
  executionDate?: string;
  executedQuantity?: number;
  attachmentUrl?: string; // Legacy
  attachments?: Attachment[];
  status: MaintenanceStatus;
  routeStatus?: MaintenanceStatus;
  notes?: string;
  plannedDate?: string;
  plannedDates?: string[];
  returnDate?: string;
  routeNotes?: string;
  routeColor?: string;
  routeEstimatedCost?: number;
  routeActualCost?: number;
  routeServiceOrdersCount?: number;
  routeServicesValue?: number;
  routeAttachmentUrl?: string; // Legacy
  routeAttachments?: Attachment[];
  routePreventiveCount?: number;
  itineraryOrder?: number;
  routeMap1Url?: string;
  routeMap2Url?: string;
  isTemporaryRoute?: boolean;
  temporaryRouteName?: string;
  temporaryClient?: string;
  temporaryStreet?: string;
  temporaryMachines?: number;
  routeCostItems?: RouteCostItem[];
  assignedRoute?: string;
  originalRoute?: string; // Rota original de cadastro quando o endereço é alocado em rota temporária
  routeCardId?: string;
  checklist?: EquipmentChecklistItem[];
  techSignature?: string;
  clientSignature?: string;
  clientSignatureDate?: string; // Data e hora exata em que o cliente assinou a planilha
  completionDate?: string; // Data e hora exata em que a planilha foi finalizada pelo técnico
  clientSigneeName?: string;
  clientSigneeRegistration?: string;
  cycle?: number;
  completionLatitude?: number;
  completionLongitude?: number;
  completionAccuracy?: number;
  rejectionReason?: string;
  adminApproved?: boolean;
  approvedAt?: string;
  approvedBy?: string;
}

export interface RouteMonthlyPlanning {
  id: string; // "month_routeName"
  month: string;
  routeName: string;
  plannedDate?: string;
  returnDate?: string;
  routeNotes?: string;
  routeColor?: string;
  routeStatus?: MaintenanceStatus;
  routeEstimatedCost?: number;
  routeActualCost?: number;
  routeServiceOrdersCount?: number;
  routeServicesValue?: number;
  routePreventiveCount?: number;
  routeAttachmentUrl?: string;
  routeMap1Url?: string;
  routeMap2Url?: string;
  routeCostItems?: RouteCostItem[];
  routeCardId?: string;
}

export interface EquipmentChecklistItem {
  equipmentId: string;
  checked: boolean;
  notes?: string;
  skipped?: boolean;
  justification?: string;
  checklistAnswers?: Record<string, boolean>;
  photos?: string[];
  checkedAt?: string;
  requestedRemoval?: boolean;
  removalReason?: string;
  requestedRemovalAt?: string;
}

export interface TravelCard {
  id: string;
  lastFourDigits: string;
  bank: string;
  holderName: string;
  createdAt?: any;
}

export interface RouteCostItem {
  id: string;
  description: string;
  value: number;
  date?: string;
  category?: string;
}

export type RouteExpenseStatus = 'pending' | 'approved' | 'rejected';

export interface RouteExpense {
  id: string;
  routeName: string;
  month: string; // YYYY-MM
  technicianId?: string;
  technicianName: string;
  plannedCostItemId?: string; // Optional link to a planned RouteCostItem id
  category?: 'Alimentação' | 'Hospedagem' | 'Combustível' | 'Pedágio' | 'Peças / Emergência' | 'Outros' | string;
  description: string;
  actualValue: number;
  expenseDate: string; // YYYY-MM-DD
  receiptUrl?: string; // photo/file URL or base64
  receiptAttachment?: Attachment;
  status: RouteExpenseStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: any;
  reviewNotes?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface Technician {
  id: string;
  name: string;
  createdAt?: any;
  pricePerMachine?: number;
  serviceOrderPrices?: Record<string, number>;
  pricePerCorrectiveOS?: number;
  pricePerJettingOS?: number;
  pin?: string;
}

export interface Adjustment {
  id: string;
  technicianName: string;
  month: string;
  description: string;
  value: number;
  type: 'discount' | 'bonus';
  createdAt?: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed'
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export interface TaskComment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
}

export interface TaskAttachment {
  name: string;
  url: string;
  type: 'link' | 'document';
  addedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  taggedUserIds: string[];
  createdBy: string;
  createdByName?: string;
  createdAt: any;
  updatedAt?: any;
  comments?: TaskComment[];
  attachments?: TaskAttachment[];
}

export interface MuralPost {
  id: string;
  content: string;
  createdBy: string;
  createdByName?: string;
  createdAt: any;
  month: string; // bound to the active month e.g., '2026-06'
}

export interface Inspection {
  id: string;
  addressId: string;
  addressStreet?: string;
  clientId: string;
  clientName?: string;
  maintenanceRecordId?: string;
  maintenanceDate?: string; // date format yyyy-mm-dd
  month: string; // yyyy-mm
  inspectorId?: string;
  inspectorName?: string;
  status: 'pending' | 'completed';
  ratingEmoji?: string; // 😞, 😐, 🙂, 😍
  ratingComments?: string;
  photos?: string[];
  assignedAt: any;
  inspectedAt?: any;
}

export interface ContractPerformance {
  id?: string;
  clientId: string;
  month: string; // YYYY-MM
  openedOrders: number;
  closedOrders: number;
  sandblastings: number;
  totalValue: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface DeviceSettings {
  id?: string;
  shortcutText: string;
  expirationDays: number;
  startTriggerEnabled: boolean;
  finishTriggerEnabled: boolean;
  soundAlertEnabled?: boolean;
  notifiedTechnicians: string[]; // array of technician IDs or names
}

export interface JettingControl {
  id?: string;
  addressId: string;
  clientName: string;
  addressStreet: string;
  equipmentsText: string; // details of the machines needing washing/jetting
  status: 'Pendente' | 'Em Andamento' | 'Concluído';
  serviceOrders: string; // O.S. numbers
  notes: string; // description
  updatedAt: any; // timestamp or ISO string
  recordId?: string;
  month?: string;
  technicianName?: string;
  checkedEquipments?: Record<string, { checked: boolean; os: string; }>;
}

export interface ServiceOrderItem {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unitValue: number;
  discountPercent: number;
  totalValue: number;
}

export interface ServiceOrder {
  id: string; // Unique system-generated identifier, never changes and cannot be duplicated
  osNumber: string; // The user-facing O.S. number (default "00000", editable only once)
  osNumberChanged?: boolean; // Tracking if the O.S. number has been edited once from "00000"
  initialOsNumber?: string; // Original ID generated by the system before user manual edition
  osNumberChangedAt?: string; // Timestamp ISO when the number was manually edited
  osNumberResetUsed?: boolean; // Whether the single-use 24h reset has been consumed
  osNumberResetAt?: string; // Timestamp ISO when the reset was consumed
  clientId: string;
  clientName: string;
  clientCnpj?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  addressId: string;
  addressStreet?: string;
  
  // Related Equipment
  equipmentId?: string;
  equipmentName?: string;
  equipmentBrand?: string;
  equipmentSector?: string;
  equipmentBtus?: string;
  equipmentPatrimony?: string;
  
  status: 'aberta' | 'em_andamento' | 'pre_finalizada' | 'finalizada' | 'cancelada';
  type: string; // Ex: "MANUTENCAO CORRETIVA CONTRATO", "AVULSA", etc.
  
  openedAt: any; // data/hora de abertura
  openedBy: string; // usuário que abriu
  finishedAt?: any; // data/hora de finalização
  externalOs?: string; // OS Externa
  plannedDate?: string; // Data agendada para atendimento (YYYY-MM-DD)
  
  description: string; // Descrição do problema
  diagnosis?: string; // Diagnóstico
  solution?: string; // Solução
  
  services: ServiceOrderItem[];
  products: ServiceOrderItem[];
  totalValue: number;
  
  technicianId?: string; // ID do técnico responsável
  technician2Id?: string; // ID do segundo técnico (opcional)
  authenticatedTeam?: string; // Ex: "Equipe autenticada no aplicativo JDSmartOS..."
  clientRepresentative?: string; // Nome do representante (ex: ALUÍSIO MELO SIMÕES FILHO)
  clientRepresentativeMatricula?: string; // Matrícula do representante (ex: 0813)
  serviceCompany?: string; // ID da empresa prestadora configurada
  
  photos?: string[]; // fotos anexadas do app
  techSignature?: string; // Assinatura digital do Técnico (Base64)
  clientSignature?: string; // Assinatura digital do Representante do Cliente (Base64)
  clientSignatureDate?: string; // Data e hora exata da assinatura do cliente
  techFinalized?: boolean; // Finalizada pelo técnico em campo
  techFinalizedAt?: string; // Data e hora em que o técnico finalizou em campo
  adminFinalized?: boolean; // Finalizada formalmente pelo Administrativo
  adminFinalizedAt?: string; // Data e hora em que o administrativo finalizou formalmente
  itineraryOrder?: number; // Ordem cronológica da visita no Roteiro Diário
  createdAt: any;
  updatedAt?: any;
}

export const isOSRecord = (r: any): boolean => {
  if (!r) return false;
  if (typeof r.id === 'string' && (r.id.includes('_os_') || r.id.startsWith('OS_') || r.id.startsWith('os_'))) return true;
  if (typeof r.notes === 'string' && (r.notes.includes('[O.S.') || r.notes.startsWith('[O.S.'))) return true;
  if (typeof r.routeNotes === 'string' && (r.routeNotes.includes('[O.S.') || r.routeNotes.startsWith('[O.S.'))) return true;
  return false;
};

export interface TechOSDraft {
  id: string; // Ex: 'draft_1726912345678'
  savedAt: string;
  clientId: string;
  clientName?: string;
  addressId: string;
  addressStreet?: string;
  equipmentId?: string;
  equipmentName?: string;
  equipmentBrand?: string;
  equipmentSector?: string;
  equipmentBtus?: string;
  equipmentPatrimony?: string;
  type: string;
  openedAt: string;
  openedBy: string;
  plannedDate?: string;
  description: string;
  diagnosis?: string;
  solution?: string;
  services: ServiceOrderItem[];
  products: ServiceOrderItem[];
  technicianId?: string;
  technician2Id?: string;
  authenticatedTeam?: string;
  clientRepresentative?: string;
  clientRepresentativeMatricula?: string;
  serviceCompany?: string;
  photos: string[];
  techSignature?: string;
  clientSignature?: string;
  clientSignatureDate?: string;
}

export interface ServiceCompanyConfig {
  id: string;
  shortName: string;
  fullName: string;
  cnpj: string;
  ie: string;
  im: string;
  address: string;
  email: string;
  phone: string;
  logoUrl?: string; // Logotipo personalizado em Base64 ou URL
}

export interface ServiceOrderSettings {
  id: string; // Ex: "os_settings"
  maintenanceTypes: string[];
  companies: ServiceCompanyConfig[];
}

export interface ClientPriceOverride {
  price: number;
  discountPercent?: number;
}

export interface ServiceCatalogItem {
  id: string;
  code: string;
  description: string;
  type: 'product' | 'service';
  category?: string; // Categoria do produto/serviço (ex: Gases Refrigerantes, Peças, Elétrica, etc.)
  unit: string;
  defaultPrice: number;
  defaultDiscountPercent?: number;
  clientPrices?: Record<string, ClientPriceOverride>; // clientId -> { price: number, discountPercent?: number }
  active?: boolean;
  order?: number; // Ordem de exibição personalizada (drag and drop)
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
}



