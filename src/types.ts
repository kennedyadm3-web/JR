export enum MaintenanceStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
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
  attachments?: Attachment[];
  forecastDate?: string;
  // Denormalized for reports
  clientName?: string;
  addressLabel?: string;
}

export enum UserRole {
  ADMIN = 'admin',
  ASSISTANT = 'assistant',
  MANAGER = 'manager',
  SUPPORT = 'support'
}

export enum RouteType {
  VARIABLE = 'variable',
  FIXED = 'fixed',
  TEMPORARY = 'temporary'
}

export interface RouteConfiguration {
  id: string;
  routeName: string;
  type: RouteType;
  technician1?: string;
  technician2?: string;
  updatedAt: any;
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  clientId?: string; // Only for managers
  createdAt: any;
}
export interface Client {
  id: string;
  name: string;
  billingCycleInfo?: string;
  billingDay?: number;
  createdAt?: any;
}

export interface Address {
  id: string;
  clientId: string;
  street: string;
  route: string;
  totalMachines: number;
  clientName?: string; // Denormalized for easier search
  createdAt?: any;
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
  notes?: string;
  plannedDate?: string;
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
  isTemporaryRoute?: boolean;
  temporaryRouteName?: string;
  temporaryClient?: string;
  temporaryStreet?: string;
}

export interface Technician {
  id: string;
  name: string;
  createdAt?: any;
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
