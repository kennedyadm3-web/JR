import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PMOCControlCenter } from './PMOCControlCenter';
import { JettingControlCenter } from './JettingControlCenter';

// Sub-módulos independentes com Lazy Loading para extrema otimização de memória no tablet do técnico
const SignaturePadModal = React.lazy(() => import('./tech-demand/SignaturePadModal'));
const EquipmentChecklistModal = React.lazy(() => import('./tech-demand/EquipmentChecklistModal'));
const DailyReportModal = React.lazy(() => import('./tech-demand/DailyReportModal'));
const ItineraryList = React.lazy(() => import('./tech-demand/ItineraryList'));
import { 
  Users, 
  Calendar, 
  Printer, 
  Search, 
  MapPin, 
  Box, 
  ChevronLeft,
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  ChevronUp, 
  ChevronDown, 
  AlertCircle, 
  AlertTriangle,
  ArrowUp, 
  ArrowDown, 
  Sparkles, 
  Check, 
  FileText,
  X,
  Camera,
  Trash2,
  Pencil,
  Image as ImageIcon,
  ClipboardCheck,
  RefreshCw,
  BookOpen,
  Plus,
  PlusCircle,
  Wrench,
  FilePlus,
  Send,
  ClipboardList,
  Filter,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  Maximize2,
  Eye,
  CloudOff,
  CheckCheck,
  Smartphone,
  RotateCcw
} from 'lucide-react';
import { ImageUploader } from './ImageUploader';
import { CompanyLogo, getCompanyConfigFromCache } from './CompanyLogo';
import { PMOCDocumentViewerModal } from './PMOCDocumentViewerModal';
import { dataService } from '../services/dataService';
import { MaintenanceRecord, Address, Client, Technician, MaintenanceStatus, UserRole, UserProfile, Equipment, EquipmentChecklistItem, DeviceSettings, ServiceOrder, ServiceOrderItem, ServiceOrderSettings } from '../types';
import { formatEquipmentOptionLabel } from './ServiceOrdersView';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ExcelJS from 'exceljs';
import { cn, generateInitialOsNumber, matchesTechnician } from '../lib/utils';
import { buildTechnicianIndex, normalizeTechString } from '../lib/technicianIndex';

const formatDateSafe = (dateStr: string | null | undefined, formatStr: string = 'dd/MM/yyyy'): string => {
  if (!dateStr) return '';
  // Se estiver solicitando horário mas a string for apenas data (sem horário), não exibir horário fake 00:00:00
  if ((formatStr.includes('HH') || formatStr.includes('mm')) && !dateStr.includes('T') && !dateStr.includes(' ') && !dateStr.includes(':')) {
    return '';
  }
  try {
    const parsed = parseISO(dateStr);
    if (isNaN(parsed.getTime())) {
      const fallbackDate = new Date(dateStr);
      if (isNaN(fallbackDate.getTime())) {
        return dateStr || '';
      }
      return format(fallbackDate, formatStr);
    }
    return format(parsed, formatStr);
  } catch (err) {
    console.warn('Erro ao formatar data de forma segura:', dateStr, err);
    return dateStr || '';
  }
};

/**
 * Utilitário para extrair e garantir com segurança os horários de finalização e assinatura do cliente
 * Faz fallback inteligente e busca horários dos checklists e fotos caso registros antigos não possuam os campos diretos
 */
export const getRecordTimestamps = (record: Partial<MaintenanceRecord> | null | undefined): { completionDate?: string; clientSignatureDate?: string } => {
  if (!record) return { completionDate: undefined, clientSignatureDate: undefined };

  const hasSignature = Boolean(record.clientSignature && typeof record.clientSignature === 'string' && record.clientSignature.trim().length > 10);

  // 1. Hora da Assinatura do Cliente (só é válida se houver assinatura digital)
  let clientSignatureDate: string | undefined = undefined;
  if (hasSignature) {
    if (record.clientSignatureDate && (record.clientSignatureDate.includes('T') || record.clientSignatureDate.includes(':'))) {
      clientSignatureDate = record.clientSignatureDate;
    } else if (record.completionDate && (record.completionDate.includes('T') || record.completionDate.includes(':'))) {
      clientSignatureDate = record.completionDate;
    }
  }

  // 2. Hora da Finalização do Atendimento (só existe se houver finalização com assinatura pelo técnico)
  let completionDate = record.completionDate;
  if (!completionDate || (!completionDate.includes('T') && !completionDate.includes(':'))) {
    if (hasSignature) {
      if (clientSignatureDate) {
        completionDate = clientSignatureDate;
      } else if (record.executionDate && (record.executionDate.includes('T') || record.executionDate.includes(':'))) {
        completionDate = record.executionDate;
      }
    } else {
      completionDate = undefined;
    }
  }

  return { completionDate, clientSignatureDate };
};

export const formatBtus = (btuVal: any): string => {
  if (!btuVal) return '-';
  const strVal = String(btuVal).replace(/\./g, '').trim();
  const num = Number(strVal);
  if (isNaN(num)) return String(btuVal);
  const adjustedNum = num < 1000 ? num * 1000 : num;
  return adjustedNum.toLocaleString('pt-BR');
};

export const isOSRecord = (r: any): boolean => {
  if (!r) return false;
  if (typeof r.id === 'string' && (r.id.includes('_os_') || r.id.startsWith('OS_') || r.id.startsWith('os_'))) return true;
  if (typeof r.notes === 'string' && (r.notes.includes('[O.S.') || r.notes.startsWith('[O.S.'))) return true;
  if (typeof r.routeNotes === 'string' && (r.routeNotes.includes('[O.S.') || r.routeNotes.startsWith('[O.S.'))) return true;
  return false;
};

export interface ItineraryItem {
  id: string;
  month: string;
  addressId: string;
  scheduledWeek: number;
  technician1?: string;
  technician2?: string;
  status: MaintenanceStatus;
  plannedDate?: string;
  itineraryOrder?: number;
  notes?: string;
  routeNotes?: string;
  itemType: 'preventive' | 'service_order';
  record?: MaintenanceRecord;
  serviceOrder?: ServiceOrder;
  address?: Address;
  client?: Client;
  checklist?: EquipmentChecklistItem[];
  rejectionReason?: string;
  isTemporaryRoute?: boolean;
  temporaryClient?: string;
  temporaryStreet?: string;
  temporaryMachines?: number;
  executionDate?: string;
  [key: string]: any;
}

export const COMPANIES_INFO = {
  lefrio: {
    key: 'lefrio',
    name: 'JR COMÉRCIO E SERVIÇOS DE CLIMATIZAÇÃO LTDA',
    shortName: 'LE FRIO',
    logoText: 'LE FRIO',
    logoSubText: 'REFRIGERAÇÃO',
    logoBgColor: 'bg-blue-600',
    cnpj: '22.731.413/0002-60',
    ie: '247308110',
    im: '901424174',
    address: 'RUA DR. ELISIO ALVES PEROBA, 103 - ANTARES - MACEIO - AL',
    email: 'atendimentomaceio@lefrio.com.br',
    phone: '(82) 3221-1031'
  },
  alclima: {
    key: 'alclima',
    name: 'AL CLIMA COMERCIO E SERVICOS LTDA',
    shortName: 'AL CLIMA',
    logoText: 'AL CLIMA',
    logoSubText: 'REFRIGERAÇÃO',
    logoBgColor: 'bg-emerald-800',
    cnpj: '38.231.188/0001-51',
    ie: '24031996-6',
    im: '901472869',
    address: 'RUA RITA DE CASSIA, 42 - GRUTA DE LOURDES - MACEIO - AL',
    email: 'atendimento@alclima.com.br',
    phone: '(82) 3435-1524'
  }
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class LocalErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("LocalErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-800 space-y-3 font-sans max-w-lg mx-auto my-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-red-600 rounded-full animate-ping shrink-0" />
            <h4 className="font-extrabold text-sm uppercase tracking-wider">Ocorreu um erro na tela</h4>
          </div>
          <p className="text-xs leading-relaxed font-medium">
            Desculpe, ocorreu um erro inesperado ao desenhar os dados desta tela. Você pode tentar reiniciar este componente para restaurar o funcionamento.
          </p>
          {this.state.error && (
            <pre className="p-3 bg-red-950 text-red-100 text-[10px] rounded-lg overflow-x-auto font-mono max-h-40">
              {this.state.error.message}
              {"\n"}
              {this.state.error.stack}
            </pre>
          )}
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs"
          >
            Tentar Novamente / Reiniciar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

interface SignaturePadProps {
  label: string;
  onChange: (base64: string) => void;
  savedValue?: string;
  disabled?: boolean;
}

function SignaturePad(props: SignaturePadProps) {
  return (
    <React.Suspense fallback={
      <div className="h-44 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center text-xs text-gray-400 font-semibold animate-pulse">
        Carregando painel de assinatura digital...
      </div>
    }>
      <SignaturePadModal {...props} />
    </React.Suspense>
  );
}

interface Props {
  userRole?: UserRole;
  managerClientId?: string;
  userProfile?: UserProfile;
}

export default function TechDemandView({ userRole, managerClientId, userProfile }: Props) {
  // Tabs State
  const [activeTab, setActiveTab] = useState<'demand' | 'itinerary' | 'approval' | 'pmoc' | 'jetting' | 'daily-schedule'>('demand');

  // Month state for Pauta view
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  
  // Daily Itinerary date (defaults to today)
  const [itineraryDate, setItineraryDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [itinerarySearch, setItinerarySearch] = useState('');

  const [selectedTech, setSelectedTech] = useState(() => {
    if (userRole === UserRole.TECHNICIAN && userProfile?.name) {
      return userProfile.name;
    }
    return localStorage.getItem('tech_demand_selected_tech') || '';
  });
  const [selectedWeek, setSelectedWeek] = useState<number | 'all'>(() => {
    const saved = localStorage.getItem('tech_demand_selected_week');
    if (saved === 'all' || !saved) return 'all';
    const parsed = parseInt(saved, 10);
    return isNaN(parsed) ? 'all' : parsed;
  });
  const [executionFilter, setExecutionFilter] = useState<'all' | 'executed' | 'pending'>('all');
  const [pautaSearchTerm, setPautaSearchTerm] = useState('');

  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [updatingOrder, setUpdatingOrder] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Monitorar se a internet caiu ou voltou para dar visibilidade de salvamento offline ao técnico
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // NEW: Checklist and Signatures states
  const [activeChecklistRecord, setActiveChecklistRecord] = useState<MaintenanceRecord | null>(null);
  const [modalChecklist, setModalChecklist] = useState<EquipmentChecklistItem[]>([]);
  const [techSignature, setTechSignature] = useState('');
  const [clientSignature, setClientSignature] = useState('');
  const [clientSignatureDate, setClientSignatureDate] = useState('');
  const [clientSigneeName, setClientSigneeName] = useState('');
  const [clientSigneeRegistration, setClientSigneeRegistration] = useState('');
  const [isPrintingChecklist, setIsPrintingChecklist] = useState<MaintenanceRecord | null>(null);
  const [isPrintingBlank, setIsPrintingBlank] = useState<boolean>(false);
  const [printPhotosOption, setPrintPhotosOption] = useState<boolean>(true);
  const [printGeneralNotesOption, setPrintGeneralNotesOption] = useState<boolean>(true);
  const [expandedEqId, setExpandedEqId] = useState<string | null>(null);
  const [checklistValidationError, setChecklistValidationError] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState<boolean>(false);
  const [criticalError, setCriticalError] = useState<string | null>(null);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  
  // Autosave states for real-time preventive maintenance checklist saving
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'offline_saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savingEquipmentId, setSavingEquipmentId] = useState<string | null>(null);

  // Approval Tab States
  const [selectedApprovalRecordId, setSelectedApprovalRecordId] = useState<string | null>(null);
  const [approvalTechFilter, setApprovalTechFilter] = useState<string | null>(null);
  const [approvalSidebarTab, setApprovalSidebarTab] = useState<'pending' | 'approved'>('pending');
  const [recentApprovedRecords, setRecentApprovedRecords] = useState<MaintenanceRecord[]>([]);
  const [approvedTechFilter, setApprovedTechFilter] = useState<string | null>(null);
  const [approvedSearchTerm, setApprovedSearchTerm] = useState('');
  const [isAddingEquipment, setIsAddingEquipment] = useState<boolean>(false);
  const [newEqLabel, setNewEqLabel] = useState('');
  const [newEqSector, setNewEqSector] = useState('');
  const [newEqName, setNewEqName] = useState('Split');
  const [newEqBrand, setNewEqBrand] = useState('');
  const [newEqBtus, setNewEqBtus] = useState('');
  const [submittingEq, setSubmittingEq] = useState(false);
  const [processingApproval, setProcessingApproval] = useState(false);
  const [showApprovalPhotos, setShowApprovalPhotos] = useState<boolean>(true);
  const [serviceOrderSettings, setServiceOrderSettings] = useState<ServiceOrderSettings | null>(null);

  // Confirmation Modals for Approval and Equipment Deletion
  const [recordToHomologate, setRecordToHomologate] = useState<MaintenanceRecord | null>(null);
  const [previewApprovalRecord, setPreviewApprovalRecord] = useState<MaintenanceRecord | null>(null);
  const [equipmentToDelete, setEquipmentToDelete] = useState<{ record: MaintenanceRecord; equipment: Equipment } | null>(null);
  const [deletingEquipmentLoading, setDeletingEquipmentLoading] = useState(false);
  const refreshedAddressIdsRef = useRef<Set<string>>(new Set());
  const fetchedRouteAddressIdsRef = useRef<Set<string>>(new Set());

  // Edit Equipment State in Approval
  const [equipmentToEdit, setEquipmentToEdit] = useState<Equipment | null>(null);
  const [editEqLabel, setEditEqLabel] = useState('');
  const [editEqSector, setEditEqSector] = useState('');
  const [editEqName, setEditEqName] = useState('Split');
  const [editEqBrand, setEditEqBrand] = useState('');
  const [editEqBtus, setEditEqBtus] = useState('');
  const [savingEquipmentEditLoading, setSavingEquipmentEditLoading] = useState(false);

  // Fullscreen Photo Lightbox Modal State
  const [previewPhotoModal, setPreviewPhotoModal] = useState<{
    src: string;
    title?: string;
    subtitle?: string;
    notes?: string;
    label?: string;
  } | null>(null);
  const [previewZoom, setPreviewZoom] = useState<number>(1);
  const [previewRotation, setPreviewRotation] = useState<number>(0);

  // Helper to open photo in full preview
  const openPhotoPreview = (photoData: { src: string; title?: string; subtitle?: string; notes?: string; label?: string }) => {
    setPreviewZoom(1);
    setPreviewRotation(0);
    setPreviewPhotoModal(photoData);
  };

  // Keyboard shortcut listener for photo modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewPhotoModal) {
        setPreviewPhotoModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewPhotoModal]);

  // Technician Add Equipment States
  const [isTechAddingEquipment, setIsTechAddingEquipment] = useState<boolean>(false);
  const [techNewEqLabel, setTechNewEqLabel] = useState('');
  const [techNewEqSector, setTechNewEqSector] = useState('');
  const [techNewEqName, setTechNewEqName] = useState('SPLIT');
  const [techNewEqBrand, setTechNewEqBrand] = useState('');
  const [techNewEqBtus, setTechNewEqBtus] = useState('');
  const [techSubmittingEq, setTechSubmittingEq] = useState(false);

  // States for Service Orders in Daily Route
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [isAddOSModalOpen, setIsAddOSModalOpen] = useState(false);
  const [osFormDate, setOsFormDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [osFormTechId, setOsFormTechId] = useState('');
  const [osFormTech2Id, setOsFormTech2Id] = useState('');
  const [osFormClientId, setOsFormClientId] = useState('');
  const [osFormAddressId, setOsFormAddressId] = useState('');
  const [osFormEquipmentId, setOsFormEquipmentId] = useState('');
  const [osFormType, setOsFormType] = useState('MANUTENÇÃO CORRETIVA CONTRATO');
  const [osFormNumber, setOsFormNumber] = useState('');
  const [osFormDescription, setOsFormDescription] = useState('');
  const [osFormInstructions, setOsFormInstructions] = useState('');
  const [osFormSubmitting, setOsFormSubmitting] = useState(false);

  // States for Technician filling out OS on Mobile/Tablet
  const [activeOSForTech, setActiveOSForTech] = useState<ServiceOrder | null>(null);
  const [techOSDiagnosis, setTechOSDiagnosis] = useState('');
  const [techOSSolution, setTechOSSolution] = useState('');
  const [techOSServices, setTechOSServices] = useState<ServiceOrderItem[]>([]);
  const [techOSProducts, setTechOSProducts] = useState<ServiceOrderItem[]>([]);
  const [techOSPhotos, setTechOSPhotos] = useState<string[]>([]);
  const [techOSTechSig, setTechOSTechSig] = useState('');
  const [techOSClientSig, setTechOSClientSig] = useState('');
  const [techOSClientRep, setTechOSClientRep] = useState('');
  const [techOSClientMatricula, setTechOSClientMatricula] = useState('');
  const [techOSSaving, setTechOSSaving] = useState(false);
  const [techOSNewServiceDesc, setTechOSNewServiceDesc] = useState('');
  const [techOSNewServiceQty, setTechOSNewServiceQty] = useState(1);
  const [techOSNewProductDesc, setTechOSNewProductDesc] = useState('');
  const [techOSNewProductQty, setTechOSNewProductQty] = useState(1);

  const addLog = (message: string) => {
    console.log(`[FINALIZE_DIAGNOSTIC] ${message}`);
    setDiagnosticLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const isReadOnly = userRole !== UserRole.ADMIN && userRole !== UserRole.ASSISTANT;

  // Validação dinâmica se o checklist está incompleto (para desabilitar o botão de finalizar)
  const isChecklistIncomplete = useMemo(() => {
    if (!activeChecklistRecord) return true;
    const addressEquips = equipments.filter(eq => eq && eq.addressId === activeChecklistRecord.addressId && eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated);
    if (addressEquips.length === 0) return false;
    
    return addressEquips.some(eq => {
      const item = modalChecklist.find(m => m && m.equipmentId === eq.id) || activeChecklistRecord.checklist?.find(m => m && m.equipmentId === eq.id);
      if (!item) return true;
      if (item.requestedRemoval) return false; // Máquina com solicitação de exclusão é considerada tratada
      const isChecked = item.checked;
      const isSkipped = item.skipped;
      if (!isChecked && !isSkipped) return true;
      if (isSkipped && (!item.justification || item.justification.trim().length < 3)) return true;
      return false;
    });
  }, [activeChecklistRecord, equipments, modalChecklist]);

  // Validação dinâmica se os dados do responsável (nome, matrícula e assinatura) estão incompletos
  const isSignaturesAndSigneeIncomplete = useMemo(() => {
    if (!activeChecklistRecord) return true;
    return !clientSigneeName.trim() || !clientSigneeRegistration.trim() || !clientSignature.trim();
  }, [activeChecklistRecord, clientSigneeName, clientSigneeRegistration, clientSignature]);

  // Ref para rastrear se o checklist está sendo inicializado ao abrir o modal (evita double-save inicial redundante)
  const isInitializingChecklistRef = useRef(false);

  // Cálculo das datas únicas de execução registradas no checklist
  const uniqueExecutionDates = useMemo(() => {
    const datesSet = new Set<string>();
    modalChecklist.forEach(item => {
      if (item && item.checkedAt) {
        try {
          const dateStr = formatDateSafe(item.checkedAt, 'dd/MM/yyyy');
          if (dateStr) datesSet.add(dateStr);
        } catch (e) {
          // ignore
        }
      }
    });
    
    // Fallback se não houver nenhuma máquina marcada ainda, mas o registro já tem uma data de execução
    if (datesSet.size === 0 && activeChecklistRecord?.executionDate) {
      datesSet.add(formatDateSafe(activeChecklistRecord.executionDate, 'dd/MM/yyyy'));
    }
    
    return Array.from(datesSet).sort();
  }, [modalChecklist, activeChecklistRecord]);

  // Tablet login and session states
  const [authTech, setAuthTech] = useState<Technician | null>(() => {
    const saved = localStorage.getItem('lefrio_tablet_auth_tech');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Sincronização automática para técnicos logados no sistema: vincula authTech e selectedTech automaticamente
  useEffect(() => {
    if (userRole === UserRole.TECHNICIAN && userProfile?.name && techs.length > 0) {
      const pName = userProfile.name.trim().toLowerCase();
      const pUid = userProfile.uid;
      const matched = techs.find(t => t.name.trim().toLowerCase() === pName || t.id === pUid);
      if (matched && (!authTech || authTech.id !== matched.id)) {
        setAuthTech(matched);
        setSelectedTech(matched.name);
        try {
          localStorage.setItem('lefrio_tablet_auth_tech', JSON.stringify(matched));
        } catch {}
      }
    }
  }, [userRole, userProfile, techs, authTech]);

  const [isTabletMode, setIsTabletMode] = useState(() => {
    const isOffice = userRole === UserRole.ADMIN || userRole === UserRole.ASSISTANT;
    return !isOffice;
  });

  // Ref para armazenar em cache a última coordenada obtida de forma assíncrona/offline
  const lastCoordinatesRef = useRef<{ latitude: number; longitude: number; accuracy: number; timestamp: number } | null>(
    (() => {
      const saved = localStorage.getItem('lefrio_last_known_location');
      try {
        return saved ? JSON.parse(saved) : null;
      } catch {
        return null;
      }
    })()
  );

  const [loginTechId, setLoginTechId] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');

  // Solicita permissão de localização no Android/Navegador logo na abertura e mantém cache atualizado
  useEffect(() => {
    if (!isTabletMode) return;

    console.log("[GPS] Rastreamento de localização ativado para os técnicos.");
    
    if (navigator.geolocation) {
      // Solicitação inicial para acionar a permissão do sistema (Android exige ativação do GPS)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          };
          lastCoordinatesRef.current = coords;
          localStorage.setItem('lefrio_last_known_location', JSON.stringify(coords));
          console.log("[GPS] Permissão de localização concedida. Coordenadas iniciais salvas em cache.");
        },
        (error) => {
          console.warn("[GPS] Aviso de permissão/GPS no início:", error.message);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );

      // Inicia rastreamento contínuo em segundo plano para manter cache atualizado (essencial para sinal ruim)
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          };
          lastCoordinatesRef.current = coords;
          localStorage.setItem('lefrio_last_known_location', JSON.stringify(coords));
        },
        (error) => {
          console.warn("[GPS] Erro no rastreamento de localização contínua:", error.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );

      return () => {
        navigator.geolocation.clearWatch(watchId);
      };
    }
  }, [isTabletMode]);

  useEffect(() => {
    if (userRole === UserRole.TECHNICIAN) {
      setActiveTab('itinerary');
      setIsTabletMode(true);
    }
  }, [userRole]);

  const handleTechLogin = (techId: string, pin: string) => {
    setLoginError('');
    if (!techId) {
      setLoginError('Selecione seu nome para continuar.');
      return;
    }
    const tech = techs.find(t => t.id === techId);
    if (!tech) {
      setLoginError('Técnico não encontrado.');
      return;
    }
    const storedPin = (tech.pin || '').trim();
    if (!storedPin) {
      setLoginError('Este técnico não possui PIN de acesso cadastrado. Peça para o administrativo configurar seu PIN.');
      setLoginPin('');
      return;
    }
    if (storedPin !== pin.trim()) {
      setLoginError('PIN incorreto. Tente novamente.');
      setLoginPin('');
      return;
    }
    
    // Sucesso!
    setAuthTech(tech);
    setSelectedTech(tech.name);
    localStorage.setItem('lefrio_tablet_auth_tech', JSON.stringify(tech));
    setLoginPin('');
    // Recarrega dados com o filtro limpo do técnico logado
    setTimeout(() => {
      loadData(true);
    }, 50);
  };

  const handleTechLogout = () => {
    setAuthTech(null);
    localStorage.removeItem('lefrio_tablet_auth_tech');
    setLoginPin('');
    setLoginTechId('');
    setTimeout(() => {
      loadData(true);
    }, 50);
  };

  // Auto-login on 4 digits
  useEffect(() => {
    if (loginPin.length === 4 && loginTechId) {
      handleTechLogin(loginTechId, loginPin);
    }
  }, [loginPin, loginTechId, techs]);

  // Track direct inputs for notes to avoid re-render lag
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  const handleUpdateRecord = async (record: MaintenanceRecord, updates: Partial<MaintenanceRecord>) => {
    setSavingId(record.id);
    try {
      await dataService.upsertRecord({ ...record, ...updates });
      setRecords(prev => {
        const newPlannedDate = updates.plannedDate;
        return prev.map(r => {
          if (r.id === record.id) {
            return { ...r, ...updates };
          }
          // REGRA MANDATÓRIA: Se o endereço recebeu novo agendamento, sai totalmente do agendamento anterior
          if (newPlannedDate && r.addressId === record.addressId) {
            return { ...r, plannedDate: undefined, plannedDates: undefined, returnDate: undefined };
          }
          return r;
        });
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSavingId(null);
    }
  };

  const handlePhotoUpload = (eqId: string, photoIndex: number, file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Redimensionar para max 600px de largura/altura para manter super leve no Firestore
        const maxDim = 600;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const base64Str = canvas.toDataURL('image/jpeg', 0.7); // Compressão de 70%
          setModalChecklist(prev => prev.map(item => {
            if (item.equipmentId === eqId) {
              const photos = [...(item.photos || [])];
              photos[photoIndex] = base64Str;
              return { ...item, photos };
            }
            return item;
          }));
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // NEW: Sync modal checklist when activeChecklistRecord changes
  useEffect(() => {
    if (activeChecklistRecord) {
      isInitializingChecklistRef.current = true;
      const addressEquips = equipments.filter(eq => eq && eq.addressId === activeChecklistRecord.addressId && eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated);
      const address = addresses.find(addr => addr && addr.id === activeChecklistRecord.addressId);
      const client = address ? clients.find(c => c && c.id === address.clientId) : null;
      const clientChecklist = client?.preventiveChecklist || [
        "Limpeza dos filtros de ar",
        "Verificação do dreno e dreno de bandeja",
        "Verificação de ruídos e vibrações",
        "Verificação da carga de fluido refrigerante",
        "Medição de corrente e tensão elétrica",
        "Reaperto das conexões elétricas",
        "Limpeza das serpentinas (evaporadora/condensadora)"
      ];
      
      const existingChecklist = activeChecklistRecord.checklist || [];
      const initialChecklist = addressEquips.map(eq => {
        const found = existingChecklist.find(item => item && item.equipmentId === eq.id);
        const savedAnswers = (found?.checklistAnswers && typeof found.checklistAnswers === 'object') ? found.checklistAnswers : {};
        
        // Ensure all customer checklist tasks exist as keys
        const checklistAnswers: Record<string, boolean> = {};
        clientChecklist.forEach(task => {
          checklistAnswers[task] = savedAnswers[task] !== undefined ? !!savedAnswers[task] : false;
        });

        return {
          equipmentId: eq.id,
          checked: found ? !!found.checked : false,
          notes: found ? (found.notes || '') : '',
          skipped: found ? (found.skipped || false) : false,
          justification: found ? (found.justification || '') : '',
          requestedRemoval: found ? !!found.requestedRemoval : false,
          removalReason: found?.removalReason,
          requestedRemovalAt: found?.requestedRemovalAt,
          checklistAnswers,
          photos: found ? (found.photos || []) : [],
          checkedAt: found?.checkedAt || undefined
        };
      });
      
      const initialTimestamps = getRecordTimestamps(activeChecklistRecord);
      setModalChecklist(initialChecklist);
      setTechSignature(activeChecklistRecord.techSignature || '');
      setClientSignature(activeChecklistRecord.clientSignature || '');
      setClientSignatureDate(activeChecklistRecord.clientSignatureDate || initialTimestamps.clientSignatureDate || (activeChecklistRecord.clientSignature ? new Date().toISOString() : ''));
      setClientSigneeName(activeChecklistRecord.clientSigneeName || '');
      setClientSigneeRegistration(activeChecklistRecord.clientSigneeRegistration || '');
      setExpandedEqId(null);
      setChecklistValidationError(null);
      setCriticalError(null);
      setDiagnosticLogs([`Modal aberto às ${new Date().toLocaleTimeString()} para o registro: ${activeChecklistRecord.id}`]);
      
      const timer = setTimeout(() => {
        isInitializingChecklistRef.current = false;
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setModalChecklist([]);
      setTechSignature('');
      setClientSignature('');
      setClientSignatureDate('');
      setClientSigneeName('');
      setClientSigneeRegistration('');
      setExpandedEqId(null);
      setChecklistValidationError(null);
      setCriticalError(null);
      setDiagnosticLogs([]);
      isInitializingChecklistRef.current = false;
    }
  }, [activeChecklistRecord, equipments, clients, addresses]);

  // NEW: Clear isPrintingChecklist when print is closed
  useEffect(() => {
    const handleAfterPrint = () => {
      setIsPrintingChecklist(null);
      setIsPrintingBlank(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  useEffect(() => {
    localStorage.setItem('tech_demand_selected_tech', selectedTech);
  }, [selectedTech]);

  useEffect(() => {
    localStorage.setItem('tech_demand_selected_week', String(selectedWeek));
  }, [selectedWeek]);

  // Load monthly records whenever the month state or itinerary date changes
  useEffect(() => {
    loadData();
  }, [month, itineraryDate]);

  // Assinatura em tempo real para o Roteiro do Dia: reflete no mesmo segundo no celular qualquer alteração no cronograma
  useEffect(() => {
    if (!itineraryDate) return;

    const unsubscribe = dataService.subscribeRecordsByPlannedDate(itineraryDate, (realtimeRecords) => {
      if (realtimeRecords && realtimeRecords.length > 0) {
        setRecords(prev => {
          const combined = [...realtimeRecords, ...prev];
          const { deduplicated } = dataService.deduplicateRecordsList(combined);
          return deduplicated;
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [itineraryDate]);

  // Sincronização automática de equipamentos caso novos equipamentos sejam cadastrados para endereços do roteiro
  useEffect(() => {
    if (!records || records.length === 0) return;
    const addressIdsToRefresh = new Set<string>();

    for (const rec of records) {
      if (!rec.addressId) continue;
      const addrId = rec.addressId;
      if (refreshedAddressIdsRef.current.has(addrId)) continue;

      const inMemoryCount = equipments.filter(eq => eq && eq.addressId === addrId && eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated).length;
      const liveAddr = addresses.find(a => a && a.id === addrId) || (rec as any).address;
      const expectedCount = liveAddr?.totalMachines || 0;
      
      if (expectedCount > inMemoryCount) {
        addressIdsToRefresh.add(addrId);
      }
    }

    if (addressIdsToRefresh.size > 0) {
      Array.from(addressIdsToRefresh).forEach(aid => refreshedAddressIdsRef.current.add(aid));

      Promise.all(
        Array.from(addressIdsToRefresh).map(aid => 
          dataService.getEquipments(aid, false).catch(() => [])
        )
      ).then(results => {
        const freshList = results.flat().filter(e => e && e.status !== 'deactivated' && e.active !== false && !e.isDeactivated);
        if (freshList.length > 0) {
          setEquipments(prev => {
            const map = new Map<string, Equipment>();
            prev.forEach(e => { if (e?.id) map.set(e.id, e); });
            freshList.forEach(e => { if (e?.id) map.set(e.id, e); });
            return Array.from(map.values());
          });
        }
      });
    }
  }, [records]);

  // Sincronização automática quando o técnico volta ao app / desbloqueia o celular
  useEffect(() => {
    const handleSyncOnVisible = () => {
      if (document.visibilityState === 'visible') {
        loadData(true);
      }
    };
    window.addEventListener('focus', handleSyncOnVisible);
    document.addEventListener('visibilitychange', handleSyncOnVisible);
    return () => {
      window.removeEventListener('focus', handleSyncOnVisible);
      document.removeEventListener('visibilitychange', handleSyncOnVisible);
    };
  }, [month, itineraryDate]);

  const loadData = async (forceBypassCache: boolean = false) => {
    setLoading(true);
    if (forceBypassCache) {
      dataService.clearCache('records_');
    }
    try {
      const activeTechFilter = isTabletMode && authTech ? authTech.name : selectedTech;
      const itineraryMonth = itineraryDate ? itineraryDate.substring(0, 7) : month;
      const monthsToFetch = new Set<string>([month, itineraryMonth]);

      // Busca dados com sincronização dedicada para o roteiro do técnico
      const itineraryFetchPromise = fetch(`/api/tech-demand/itinerary?date=${itineraryDate || ''}&tech=${encodeURIComponent(activeTechFilter || '')}&month=${itineraryMonth}`)
        .then(r => r.json())
        .catch(err => { console.warn('[Itinerary API] Erro ao buscar roteiro otimizado:', err); return null; });

      const [monthRecordsArrays, pre, appvd, a, c, t, eq, settings, rByDate, orders, apiItinerary, soSettings] = await Promise.all([
        Promise.all(Array.from(monthsToFetch).map(m => 
          dataService.getRecords(m, { lightweight: true }).catch(err => { console.error('Error loading records for month:', m, err); return []; })
        )),
        dataService.getPreCompletedRecords().catch(err => { console.error('Error loading pre-completed records:', err); return []; }),
        dataService.getRecentApprovedRecords(30).catch(err => { console.error('Error loading approved records:', err); return []; }),
        dataService.getAddresses().catch(err => { console.error('Error loading addresses:', err); return []; }),
        dataService.getClients().catch(err => { console.error('Error loading clients:', err); return []; }),
        dataService.getTechnicians().catch(err => { console.error('Error loading technicians:', err); return []; }),
        dataService.getEquipments().catch(err => { console.error('Error loading equipments:', err); return []; }),
        dataService.getDeviceSettings().catch(err => { console.error('Error loading device settings:', err); return null; }),
        itineraryDate ? dataService.getRecordsByPlannedDate(itineraryDate).catch(err => { console.error('Error loading records by date:', err); return []; }) : Promise.resolve([]),
        dataService.getServiceOrders().catch(err => { console.error('Error loading service orders:', err); return []; }),
        itineraryFetchPromise,
        dataService.getServiceOrderSettings().catch(err => { console.warn('Error loading service order settings:', err); return null; })
      ]);
      
      const flatMonthRecords = monthRecordsArrays.flat();
      const apiRecords = apiItinerary?.success ? (apiItinerary.records || []) : [];
      const allLoadedRecords = [...apiRecords, ...flatMonthRecords, ...(rByDate || []), ...(pre || []), ...(appvd || [])].filter(Boolean);
      const { deduplicated } = dataService.deduplicateRecordsList(allLoadedRecords);
      const combinedRecords = deduplicated;

      // Mescla endereços e clientes trazidos da API de itinerário se não estiverem na lista principal
      const apiAddresses = apiItinerary?.success ? (apiItinerary.addresses || []) : [];
      const apiClients = apiItinerary?.success ? (apiItinerary.clients || []) : [];
      const apiOrders = apiItinerary?.success ? (apiItinerary.serviceOrders || []) : [];
      const apiTechs = apiItinerary?.success ? (apiItinerary.techs || []) : [];
      const apiEquipments = apiItinerary?.success ? (apiItinerary.equipments || []) : [];

      const mergedAddressesMap = new Map<string, Address>();
      (a || []).forEach((addr: Address) => { if (addr?.id) mergedAddressesMap.set(addr.id, addr); });
      apiAddresses.forEach((addr: Address) => { if (addr?.id && !mergedAddressesMap.has(addr.id)) mergedAddressesMap.set(addr.id, addr); });

      const mergedClientsMap = new Map<string, Client>();
      (c || []).forEach((cli: Client) => { if (cli?.id) mergedClientsMap.set(cli.id, cli); });
      apiClients.forEach((cli: Client) => { if (cli?.id && !mergedClientsMap.has(cli.id)) mergedClientsMap.set(cli.id, cli); });

      const mergedOrdersMap = new Map<string, ServiceOrder>();
      (orders || []).forEach((os: ServiceOrder) => { if (os?.id) mergedOrdersMap.set(os.id, os); });
      apiOrders.forEach((os: ServiceOrder) => { if (os?.id && !mergedOrdersMap.has(os.id)) mergedOrdersMap.set(os.id, os); });

      const mergedTechsMap = new Map<string, Technician>();
      (t || []).forEach((tech: Technician) => { if (tech?.id) mergedTechsMap.set(tech.id, tech); });
      apiTechs.forEach((tech: Technician) => { if (tech?.id && !mergedTechsMap.has(tech.id)) mergedTechsMap.set(tech.id, tech); });

      const mergedEquipmentsMap = new Map<string, Equipment>();
      (eq || []).forEach((equip: Equipment) => { if (equip?.id) mergedEquipmentsMap.set(equip.id, equip); });
      apiEquipments.forEach((equip: Equipment) => { if (equip?.id && !mergedEquipmentsMap.has(equip.id)) mergedEquipmentsMap.set(equip.id, equip); });

      setRecords(combinedRecords);
      setRecentApprovedRecords(appvd || []);
      setAddresses(Array.from(mergedAddressesMap.values()));
      setClients(Array.from(mergedClientsMap.values()));
      setTechs(Array.from(mergedTechsMap.values()));
      setEquipments(Array.from(mergedEquipmentsMap.values()));
      setDeviceSettings(settings);
      if (soSettings) {
        setServiceOrderSettings(soSettings);
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('cached_service_order_settings', JSON.stringify(soSettings));
          }
        } catch (e) {}
      }
      setServiceOrders(Array.from(mergedOrdersMap.values()));
    } catch (error) {
      console.error('Error loading tech demand data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Synchronize monthly loader if user changes itinerary date to another month
  const handleItineraryDateChange = (dateStr: string) => {
    setItineraryDate(dateStr);
    if (dateStr) {
      const yearMonth = dateStr.substring(0, 7); // e.g. "2026-07"
      if (yearMonth !== month) {
        setMonth(yearMonth);
      }
    }
  };

  const handleOpenChecklist = async (record: MaintenanceRecord) => {
    setActiveChecklistRecord(record);
    
    // Busca garantida de equipamentos sob demanda para o endereço que está sendo aberto
    if (record.addressId) {
      dataService.getEquipments(record.addressId).then(addrEqs => {
        if (addrEqs && addrEqs.length > 0) {
          setEquipments(prev => {
            const map = new Map<string, Equipment>();
            prev.forEach(e => map.set(e.id, e));
            addrEqs.forEach(e => map.set(e.id, e));
            return Array.from(map.values());
          });
        }
      }).catch(err => console.warn('Erro ao carregar equipamentos ao abrir checklist:', err));
    }
    
    // Check if start trigger is enabled and technician is in the notified list
    if (record.status !== MaintenanceStatus.COMPLETED && deviceSettings?.startTriggerEnabled && deviceSettings?.notifiedTechnicians) {
      const activeTechFilter = isTabletMode && authTech ? authTech.name : selectedTech;
      const isTechNotified = activeTechFilter && 
        Array.isArray(deviceSettings.notifiedTechnicians) && 
        deviceSettings.notifiedTechnicians.includes(activeTechFilter);
      
      if (isTechNotified) {
        try {
          const address = addresses.find(a => a.id === record.addressId);
          const client = clients.find(c => c.id === address?.clientId);
          const clientName = client?.name || 'Cliente';
          const addressStr = address ? `${address.street}, ${address.number || ''}` : 'Endereço';
          
          await dataService.sendDeviceNotification(
            'tech_start',
            `Início de Atendimento: ${activeTechFilter}`,
            `O técnico ${activeTechFilter} iniciou o atendimento no cliente ${clientName} (${addressStr}).`,
            record.id
          );
        } catch (err) {
          console.error('Erro ao disparar notificação de início de atendimento:', err);
        }
      }
    }
  };

  // Calculate stats for weekly/monthly pauta view
  const { weekTotal, weekCompleted, monthTotal, monthCompleted } = useMemo(() => {
    let w = 0;
    let wc = 0;
    let m = 0;
    let mc = 0;
    records.forEach(r => {
      if (!r || isOSRecord(r)) return;
      const matchTech = !selectedTech || (r.technician1 === selectedTech || r.technician2 === selectedTech);
      if (matchTech) {
        const addr = addresses.find(a => a.id === r.addressId);
        const machines = addr?.totalMachines || 0;
        m += machines;
        if (r.status === MaintenanceStatus.COMPLETED) {
          mc += machines;
        }
        if (selectedWeek === 'all' || r.scheduledWeek === selectedWeek) {
          w += machines;
          if (r.status === MaintenanceStatus.COMPLETED) {
            wc += machines;
          }
        }
      }
    });
    return { weekTotal: w, weekCompleted: wc, monthTotal: m, monthCompleted: mc };
  }, [records, addresses, selectedTech, selectedWeek]);

  // Filter records for monthly/weekly demand view
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (!r || isOSRecord(r)) return false;
      const matchTech = !selectedTech || (r.technician1 === selectedTech || r.technician2 === selectedTech);
      const matchWeek = selectedWeek === 'all' || r.scheduledWeek === selectedWeek;
      
      const isExecuted = r.status === MaintenanceStatus.COMPLETED || r.status === MaintenanceStatus.PRE_COMPLETED || !!r.executionDate;
      const matchExecution = 
        executionFilter === 'all' ? true :
        executionFilter === 'executed' ? isExecuted :
        !isExecuted;

      if (!matchTech || !matchWeek || !matchExecution) return false;

      if (pautaSearchTerm.trim()) {
        const term = pautaSearchTerm.toLowerCase().trim();
        const addr = addresses.find(a => a.id === r.addressId);
        const client = clients.find(c => c.id === addr?.clientId);
        const clientMatch = client?.name?.toLowerCase().includes(term);
        const streetMatch = addr?.street?.toLowerCase().includes(term);
        const routeMatch = addr?.route?.toLowerCase().includes(term);
        const notesMatch = r.notes?.toLowerCase().includes(term);
        if (!clientMatch && !streetMatch && !routeMatch && !notesMatch) return false;
      }

      return true;
    }).map(r => {
      const addr = addresses.find(a => a.id === r.addressId);
      const client = clients.find(c => c.id === addr?.clientId);
      return { ...r, address: addr, client };
    }).sort((a, b) => {
      if (selectedWeek === 'all') {
        const weekA = a.scheduledWeek || 0;
        const weekB = b.scheduledWeek || 0;
        if (weekA !== weekB) return weekA - weekB;
      }
      const dateA = a.plannedDate ? new Date(a.plannedDate).getTime() : Infinity;
      const dateB = b.plannedDate ? new Date(b.plannedDate).getTime() : Infinity;
      return dateA - dateB;
    });
  }, [records, addresses, clients, selectedTech, selectedWeek, executionFilter, pautaSearchTerm]);

  // NEW: Filter records by expiration settings if in tablet mode to keep the system light (preventives only)
  const itineraryFilteredRecords = useMemo(() => {
    const baseRecords = records.filter(r => r && !isOSRecord(r));
    if (!isTabletMode || !deviceSettings || !deviceSettings.expirationDays) {
      return baseRecords;
    }

    const expDays = deviceSettings.expirationDays;
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    return baseRecords.filter(r => {
      // Nunca expira registros da data selecionada no roteiro
      if (r.plannedDate === itineraryDate) {
        return true;
      }

      if (r.plannedDate) {
        try {
          const recordDate = new Date(r.plannedDate + 'T12:00:00');
          if (recordDate < today) {
            const diffTime = today.getTime() - recordDate.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > expDays) {
              return false; // Expirado! Não aparece no tablet
            }
          }
        } catch (e) {
          console.error('Erro ao calcular expiração do registro:', e);
        }
      }
      return true;
    });
  }, [records, isTabletMode, deviceSettings, itineraryDate]);

  // Sistema canônico de indexação de técnicos em MAIÚSCULAS
  const techIndex = useMemo(() => buildTechnicianIndex(techs), [techs]);

  // Funções de correspondência estrita (data única e técnico correto)
  const checkRecordMatchesDate = (r: MaintenanceRecord, targetDate: string): boolean => {
    if (!r || !targetDate) return false;
    // REGRA MANDATÓRIA: Endereços têm estritamente uma única data agendada
    const rDate = (r.plannedDate || '').split('T')[0].trim();
    return rDate === targetDate.trim();
  };

  const checkRecordMatchesTech = (r: MaintenanceRecord, currentTechFilter: string): boolean => {
    const filter = (currentTechFilter || '').trim();
    if (!filter) {
      // Se for usuário com perfil de técnico ou tablet de campo, NUNCA exibe nada sem filtro ativo (bloqueio total de vazamento de dados de outros técnicos)
      if (userRole === UserRole.TECHNICIAN || isTabletMode) return false;
      return true;
    }
    return techIndex.matchesTechTitular(r.technician1, filter) || techIndex.matchesTechTitular(r.technician2, filter);
  };

  // Data efetiva para o roteiro do dia: estritamente a data selecionada pelo usuário/técnico
  const effectiveItineraryDate = useMemo(() => {
    return itineraryDate || new Date().toISOString().slice(0, 10);
  }, [itineraryDate]);

  // Filtro ativo do técnico respeitando autenticação e perfil
  const activeTechFilter = useMemo(() => {
    if (userRole === UserRole.TECHNICIAN) {
      return (authTech?.name || userProfile?.name || selectedTech || '').trim();
    }
    return (isTabletMode && authTech ? authTech.name : selectedTech || '').trim();
  }, [userRole, authTech, userProfile, isTabletMode, selectedTech]);

  // NEW: Filter & order records specifically for the daily itinerary route (preventives + service orders in full chronological sequence)
  const itineraryRecords = useMemo<ItineraryItem[]>(() => {
    if (!effectiveItineraryDate) return [];

    // Se estiver no modo tablet ou se for técnico autenticado mas sem filtro definido, não exibe dados de terceiros
    if ((userRole === UserRole.TECHNICIAN || isTabletMode) && !activeTechFilter) return [];

    // 1. Manutenções Preventivas programadas para esta data
    // Garante que cada endereço só aparece uma única vez no roteiro
    const seenAddressIds = new Set<string>();

    const preventives: ItineraryItem[] = itineraryFilteredRecords
      .filter(r => {
        if (!r || isOSRecord(r)) return false;
        const matchesDate = checkRecordMatchesDate(r, effectiveItineraryDate);
        const matchesTech = checkRecordMatchesTech(r, activeTechFilter);
        if (!matchesDate || !matchesTech) return false;

        if (r.addressId) {
          if (seenAddressIds.has(r.addressId)) return false;
          seenAddressIds.add(r.addressId);
        }

        return true;
      })
      .map(r => {
        const addr = addresses.find(a => a.id === r.addressId) || (r as any).address;
        const client = clients.find(c => c.id === addr?.clientId) || (r as any).client;
        return {
          ...r,
          itemType: 'preventive',
          record: r,
          address: addr,
          client,
          serviceOrder: undefined
        };
      });

    // 2. Ordens de Serviço programadas para esta data (sem alterar o cronograma de preventivas!)
    const ordersForDate: ItineraryItem[] = serviceOrders
      .filter(os => {
        if (!os || os.status === 'cancelada') return false;
        const osDate = (
          os.plannedDate || 
          (os.openedAt ? os.openedAt.substring(0, 10) : '') ||
          ((os as any).scheduledDate ? String((os as any).scheduledDate).substring(0, 10) : '') ||
          ((os as any).executionDate ? String((os as any).executionDate).substring(0, 10) : '')
        ).split('T')[0].trim();
        const matchesDate = osDate === effectiveItineraryDate;
        if (!matchesDate) return false;

        if (activeTechFilter) {
          // Exclusividade do técnico titular: impede que a mesma ordem apareça para ambos os técnicos
          const isOSTitular = techIndex.matchesTechTitular(os.technicianId, activeTechFilter);
          if (!isOSTitular) return false;
        }

        if (userRole === UserRole.TECHNICIAN || isTabletMode) return false;
        return true;
      })
      .map(os => {
        const addr = addresses.find(a => a.id === os.addressId);
        const client = clients.find(c => c.id === os.clientId || c.id === addr?.clientId);
        const t1 = techs.find(t => t.id === os.technicianId || (t.name && t.name.trim().toLowerCase() === (os.technicianId || '').trim().toLowerCase()));
        const t2 = techs.find(t => t.id === os.technician2Id || (t.name && t.name.trim().toLowerCase() === (os.technician2Id || '').trim().toLowerCase()));

        const synthesizedAddr: Address = addr || {
          id: os.addressId,
          clientId: os.clientId,
          street: os.addressStreet || os.clientAddress || 'Endereço',
          route: 'Sem Rota',
          totalMachines: 1
        };

        const synthesizedClient: Client = client || {
          id: os.clientId,
          name: os.clientName || 'Cliente',
          cnpj: os.clientCnpj || '',
          fullAddress: os.clientAddress || ''
        };

        const osStatusAsMaintenance = os.status === 'finalizada' ? MaintenanceStatus.COMPLETED : MaintenanceStatus.PENDING;

        return {
          id: os.id,
          month: (os.plannedDate || effectiveItineraryDate).substring(0, 7),
          addressId: os.addressId,
          scheduledWeek: 1,
          technician1: t1?.name || os.technicianId || '',
          technician2: t2?.name || os.technician2Id || '',
          status: osStatusAsMaintenance,
          plannedDate: os.plannedDate || effectiveItineraryDate,
          itineraryOrder: os.itineraryOrder !== undefined && os.itineraryOrder !== null ? os.itineraryOrder : 99999,
          notes: os.description || '',
          routeNotes: os.diagnosis ? `${os.diagnosis} | ${os.solution || ''}` : (os.solution || os.type || ''),
          itemType: 'service_order',
          serviceOrder: os,
          address: synthesizedAddr,
          client: synthesizedClient,
          record: undefined,
          checklist: undefined,
          rejectionReason: undefined,
          isTemporaryRoute: false
        };
      });

    // 3. Mescla preventivas e ordens de serviço no roteiro do dia
    const allItinerary: ItineraryItem[] = [...preventives, ...ordersForDate];

    return allItinerary
      .filter(r => {
        if (!itinerarySearch) return true;
        const s = itinerarySearch.toLowerCase();
        const osNum = r.serviceOrder?.osNumber || '';
        const osType = r.serviceOrder?.type || '';
        return (
          r.client?.name?.toLowerCase().includes(s) ||
          r.address?.street?.toLowerCase().includes(s) ||
          r.notes?.toLowerCase().includes(s) ||
          r.routeNotes?.toLowerCase().includes(s) ||
          osNum.toLowerCase().includes(s) ||
          osType.toLowerCase().includes(s)
        );
      })
      .sort((a, b) => {
        const orderA = a.itineraryOrder !== undefined && a.itineraryOrder !== null ? a.itineraryOrder : 99999;
        const orderB = b.itineraryOrder !== undefined && b.itineraryOrder !== null ? b.itineraryOrder : 99999;
        
        if (orderA !== orderB) return orderA - orderB;
        return (a.client?.name || '').localeCompare(b.client?.name || '');
      });
  }, [itineraryFilteredRecords, serviceOrders, addresses, clients, techs, selectedTech, authTech, isTabletMode, effectiveItineraryDate, itinerarySearch]);

  // NEW: Calculate stats for the daily route
  const itineraryStats = useMemo(() => {
    const totalVisits = itineraryRecords.length;
    const completedVisits = itineraryRecords.filter(r => r.status === MaintenanceStatus.COMPLETED).length;
    const totalMachines = itineraryRecords.reduce((acc, curr) => acc + (curr.address?.totalMachines || (curr.itemType === 'service_order' ? 1 : 0)), 0);
    const completedMachines = itineraryRecords.reduce((acc, curr) => {
      if (curr.status === MaintenanceStatus.COMPLETED) {
        return acc + (curr.address?.totalMachines || (curr.itemType === 'service_order' ? 1 : 0));
      }
      return acc;
    }, 0);
    
    return {
      totalVisits,
      completedVisits,
      totalMachines,
      completedMachines,
      percent: totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0
    };
  }, [itineraryRecords]);

  // Busca resiliente e sob demanda de equipamentos para todos os endereços do roteiro ativo
  useEffect(() => {
    if (!itineraryRecords || itineraryRecords.length === 0) return;
    
    // Identifica endereços no roteiro cujas máquinas ainda não estão carregadas em memória nem foram consultadas
    const neededAddressIds = Array.from(new Set(
      itineraryRecords
        .map(r => r.addressId)
        .filter((addrId): addrId is string => Boolean(addrId) && !fetchedRouteAddressIdsRef.current.has(addrId) && !equipments.some(e => e.addressId === addrId))
    ));

    if (neededAddressIds.length === 0) return;
    neededAddressIds.forEach(id => fetchedRouteAddressIdsRef.current.add(id));

    let isMounted = true;
    Promise.all(neededAddressIds.map(addrId => dataService.getEquipments(addrId).catch(() => [])))
      .then(results => {
        if (!isMounted) return;
        const newEqs = results.flat().filter(e => e && e.status !== 'deactivated' && e.active !== false && !e.isDeactivated);
        if (newEqs.length > 0) {
          setEquipments(prev => {
            const map = new Map<string, Equipment>();
            prev.forEach(e => map.set(e.id, e));
            newEqs.forEach(e => map.set(e.id, e));
            return Array.from(map.values());
          });
        }
      })
      .catch(err => console.warn('Erro ao carregar equipamentos dos endereços do roteiro:', err));

    return () => {
      isMounted = false;
    };
  }, [itineraryRecords, equipments]);

  // Calculate technicians' route counts (both primary and assistant roles) for the day to display in the sidebar
  const techStatsForDay = useMemo(() => {
    const stats: Record<string, { primary: number; assistant: number }> = {};
    techs.forEach(t => {
      stats[t.name] = { primary: 0, assistant: 0 };
    });
    // Manutenções preventivas
    records.forEach(r => {
      if (!r || isOSRecord(r)) return;
      if (r.plannedDate === itineraryDate) {
        if (r.technician1) {
          const t1 = techIndex.findTech(r.technician1);
          if (t1 && stats[t1.name]) stats[t1.name].primary += 1;
          else if (stats[r.technician1]) stats[r.technician1].primary += 1;
        }
        if (r.technician2) {
          const t2 = techIndex.findTech(r.technician2);
          if (t2 && stats[t2.name]) stats[t2.name].assistant += 1;
          else if (stats[r.technician2]) stats[r.technician2].assistant += 1;
        }
      }
    });
    // Ordens de serviço agendadas
    serviceOrders.forEach(os => {
      if (!os || os.status === 'cancelada') return;
      const osDate = os.plannedDate || (os.openedAt ? os.openedAt.substring(0, 10) : '');
      if (osDate === itineraryDate) {
        const t1 = techIndex.findTech(os.technicianId);
        const t2 = techIndex.findTech(os.technician2Id);
        if (t1 && stats[t1.name]) {
          stats[t1.name].primary += 1;
        }
        if (t2 && stats[t2.name]) {
          stats[t2.name].assistant += 1;
        }
      }
    });
    return stats;
  }, [records, serviceOrders, itineraryDate, techs, techIndex]);

  // Order technicians: those with scheduled work (primary > 0, then assistant > 0) go on top, idle techs go on bottom
  const sortedTechs = useMemo(() => {
    return [...techs].sort((a, b) => {
      const statsA = techStatsForDay[a.name] || { primary: 0, assistant: 0 };
      const statsB = techStatsForDay[b.name] || { primary: 0, assistant: 0 };
      
      const weightA = statsA.primary * 100 + statsA.assistant;
      const weightB = statsB.primary * 100 + statsB.assistant;

      if (weightA !== weightB) {
        return weightB - weightA; // Higher scheduled work first
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [techs, techStatsForDay]);

  // NEW: Move daily itinerary item (up/down reorder for both preventives and service orders)
  const handleMoveItem = async (index: number, direction: 'up' | 'down') => {
    if (isReadOnly || updatingOrder) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= itineraryRecords.length) return;

    setUpdatingOrder(true);
    try {
      // Re-order locally first for snappy UI feedback
      const reorderedList = [...itineraryRecords];
      const temp = reorderedList[index];
      reorderedList[index] = reorderedList[targetIndex];
      reorderedList[targetIndex] = temp;

      // Map sequential 1-based order index
      const promises = reorderedList.map((item, idx) => {
        const sequentialOrder = idx + 1;
        
        if (item.itemType === 'service_order' && item.serviceOrder) {
          setServiceOrders(prev => prev.map(o => o.id === item.serviceOrder!.id ? { ...o, itineraryOrder: sequentialOrder } : o));
          return dataService.updateServiceOrder(item.serviceOrder.id, {
            itineraryOrder: sequentialOrder
          });
        } else {
          setRecords(prev => prev.map(r => r.id === item.id ? { ...r, itineraryOrder: sequentialOrder } : r));
          return dataService.upsertRecord({
            ...item,
            itineraryOrder: sequentialOrder
          });
        }
      });

      await Promise.all(promises);
    } catch (e) {
      console.error('Erro ao reordenar roteiro no Firestore:', e);
    } finally {
      setUpdatingOrder(false);
    }
  };

  // Pre-completed records for the approval workflow (deduplicated by address and month)
  const preCompletedRecords = useMemo(() => {
    const raw = records.filter(r => {
      if (!r || isOSRecord(r)) return false;
      // REGRA: Deixe pendente para aprovação SOMENTE os atendimentos de ontem (28/09/2026) e hoje (29/09/2026) ou futuros.
      // Todo o restante anterior já foi formalmente homologado pelo administrativo.
      const rawDate = r.completionDate || r.clientSignatureDate || r.executionDate || r.plannedDate || '';
      const d = typeof rawDate === 'string' ? rawDate.slice(0, 10) : '';
      const isRecent = !d || d >= '2026-09-28';
      if (!isRecent) return false;

      const isApproved = Boolean(r.adminApproved || r.approvedAt || r.approvedBy);
      if (isApproved) return false;

      // REGRA INVIOLÁVEL: É IMPOSSÍVEL um atendimento estar finalizado pelo técnico sem assinatura, nome e matrícula!
      const hasSignature = Boolean(r.clientSignature && typeof r.clientSignature === 'string' && r.clientSignature.trim().length > 10);
      const hasSignee = Boolean(r.clientSigneeName && typeof r.clientSigneeName === 'string' && r.clientSigneeName.trim().length >= 3);
      const hasRegistration = Boolean(r.clientSigneeRegistration && typeof r.clientSigneeRegistration === 'string' && r.clientSigneeRegistration.trim().length >= 3);
      const isFieldFinalized = hasSignature && hasSignee && hasRegistration;

      // Sem assinatura completa pelo cliente, NUNCA entra na fila de aprovação administrativa!
      if (!isFieldFinalized) return false;

      return r.status === MaintenanceStatus.PRE_COMPLETED || isFieldFinalized;
    });
    const map = new Map<string, MaintenanceRecord>();

    raw.forEach(r => {
      const key = `${r.addressId}_${r.month}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, r);
      } else {
        // Prioriza o registro que tem horários reais de finalização/assinatura, técnico e checklist
        const existingTimestamps = getRecordTimestamps(existing);
        const currentTimestamps = getRecordTimestamps(r);

        const existingScore = (existing.completionDate ? 30 : 0) +
                              (existing.clientSignatureDate ? 25 : 0) +
                              (existingTimestamps.completionDate ? 15 : 0) +
                              (existingTimestamps.clientSignatureDate ? 10 : 0) +
                              (existing.clientSignature ? 5 : 0) +
                              (existing.technician1 || existing.technician2 ? 2 : 0);

        const currentScore = (r.completionDate ? 30 : 0) +
                             (r.clientSignatureDate ? 25 : 0) +
                             (currentTimestamps.completionDate ? 15 : 0) +
                             (currentTimestamps.clientSignatureDate ? 10 : 0) +
                             (r.clientSignature ? 5 : 0) +
                             (r.technician1 || r.technician2 ? 2 : 0);

        if (currentScore > existingScore) {
          map.set(key, r);
        }
      }
    });

    return Array.from(map.values());
  }, [records]);

  // Group technicians with pending approvals (based on technician 1)
  const pendingApprovalTechs = useMemo(() => {
    const techCounts: Record<string, number> = {};
    preCompletedRecords.forEach(r => {
      const tech = (r.technician1 || '').trim();
      if (tech) {
        techCounts[tech] = (techCounts[tech] || 0) + 1;
      } else {
        techCounts['Sem Técnico'] = (techCounts['Sem Técnico'] || 0) + 1;
      }
    });
    return Object.entries(techCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [preCompletedRecords]);

  // Filtered pre-completed records based on selected technician 1
  const filteredPreCompletedRecords = useMemo(() => {
    if (!approvalTechFilter) return preCompletedRecords;
    return preCompletedRecords.filter(r => {
      const tech = (r.technician1 || '').trim();
      if (approvalTechFilter === 'Sem Técnico') {
        return !tech;
      }
      return tech.toLowerCase() === approvalTechFilter.trim().toLowerCase();
    });
  }, [preCompletedRecords, approvalTechFilter]);

  // Top 30 approved records (sorted newest to oldest)
  const sortedApprovedRecords = useMemo(() => {
    const map = new Map<string, MaintenanceRecord>();

    const isTrulyApproved = (r: MaintenanceRecord) => {
      if (!r || r.status !== MaintenanceStatus.COMPLETED) return false;
      // Todo atendimento anterior a ontem (28/09/2026) já foi homologado pelo administrativo!
      const rawDate = r.completionDate || r.clientSignatureDate || r.executionDate || r.plannedDate || '';
      const d = typeof rawDate === 'string' ? rawDate.slice(0, 10) : '';
      if (d && d < '2026-09-28') return true;

      // Se foi finalizado recentemente em campo (tem assinatura ou conclusão pelo técnico),
      // DEVE ter sido formalmente homologado pelo administrativo para constar no histórico de aprovados
      const isFieldFinalized = Boolean(
        r.clientSignature || 
        r.clientSigneeName || 
        (r.completionDate && typeof r.completionDate === 'string' && r.completionDate.includes('T'))
      );
      if (isFieldFinalized) {
        return Boolean(r.adminApproved || r.approvedAt || r.approvedBy);
      }
      return true; // Registros administrativos sem checklist de campo
    };

    (recentApprovedRecords || []).forEach(r => {
      if (r && r.id && isTrulyApproved(r)) {
        map.set(r.id, r);
      }
    });
    (records || []).forEach(r => {
      if (r && r.id && isTrulyApproved(r)) {
        map.set(r.id, r);
      }
    });

    const list = Array.from(map.values());
    list.sort((a, b) => {
      const timeA = a.completionDate || a.clientSignatureDate || a.executionDate || (a as any).updatedAt || a.plannedDate || a.month || '';
      const timeB = b.completionDate || b.clientSignatureDate || b.executionDate || (b as any).updatedAt || b.plannedDate || b.month || '';
      return String(timeB).localeCompare(String(timeA));
    });

    return list.slice(0, 30);
  }, [recentApprovedRecords, records]);

  // Group technicians with approved records (based on technician 1)
  const approvedTechs = useMemo(() => {
    const techCounts: Record<string, number> = {};
    sortedApprovedRecords.forEach(r => {
      const tech = (r.technician1 || '').trim();
      if (tech) {
        techCounts[tech] = (techCounts[tech] || 0) + 1;
      } else {
        techCounts['Sem Técnico'] = (techCounts['Sem Técnico'] || 0) + 1;
      }
    });
    return Object.entries(techCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [sortedApprovedRecords]);

  // Filtered approved records based on technician & search term
  const filteredApprovedRecords = useMemo(() => {
    let result = sortedApprovedRecords;

    if (approvedTechFilter) {
      result = result.filter(r => {
        const tech = (r.technician1 || '').trim();
        if (approvedTechFilter === 'Sem Técnico') {
          return !tech;
        }
        return tech.toLowerCase() === approvedTechFilter.trim().toLowerCase();
      });
    }

    if (approvedSearchTerm.trim()) {
      const term = approvedSearchTerm.toLowerCase();
      result = result.filter(r => {
        const address = addresses.find(a => a.id === r.addressId);
        const client = address ? clients.find(c => c.id === address.clientId) : null;
        const clientName = (client?.name || '').toLowerCase();
        const street = (address?.street || '').toLowerCase();
        const tech1 = (r.technician1 || '').toLowerCase();
        const tech2 = (r.technician2 || '').toLowerCase();
        return clientName.includes(term) || street.includes(term) || tech1.includes(term) || tech2.includes(term);
      });
    }

    return result;
  }, [sortedApprovedRecords, approvedTechFilter, approvedSearchTerm, addresses, clients]);

  // Selected pre-completed or approved record details
  const activeApprovalRecord = useMemo(() => {
    if (!selectedApprovalRecordId) return null;
    return (records || []).find(r => r.id === selectedApprovalRecordId) 
      || (recentApprovedRecords || []).find(r => r.id === selectedApprovalRecordId) 
      || null;
  }, [records, recentApprovedRecords, selectedApprovalRecordId]);

  // Auto-recuperação e persistência inteligente de horários para registros pré-concluídos com assinatura
  useEffect(() => {
    if (!activeApprovalRecord) return;
    const hasSignature = Boolean(activeApprovalRecord.clientSignature && typeof activeApprovalRecord.clientSignature === 'string' && activeApprovalRecord.clientSignature.trim().length > 10);
    if (!hasSignature) return; // REGRA: Sem assinatura digital do cliente, NUNCA sintetiza ou persiste horários

    const { completionDate: autoComp, clientSignatureDate: autoSig } = getRecordTimestamps(activeApprovalRecord);
    const needsComp = (!activeApprovalRecord.completionDate || !activeApprovalRecord.completionDate.includes('T')) && !!autoComp;
    const needsSig = (!activeApprovalRecord.clientSignatureDate || !activeApprovalRecord.clientSignatureDate.includes('T')) && !!autoSig;

    if (needsComp || needsSig) {
      const updatesToPersist: Partial<MaintenanceRecord> = {};
      if (needsComp) updatesToPersist.completionDate = autoComp;
      if (needsSig) updatesToPersist.clientSignatureDate = autoSig;

      dataService.upsertRecord({ ...activeApprovalRecord, ...updatesToPersist }).catch(err => {
        console.warn("Erro no auto-reparo de timestamps do registro em aprovação:", err);
      });
      setRecords(prev => prev.map(r => r.id === activeApprovalRecord.id ? { ...r, ...updatesToPersist } : r));
    }
  }, [activeApprovalRecord?.id]);

  // Toggle checklist status for equipment in the active approval record
  const handleToggleApprovalMachine = async (record: MaintenanceRecord, eqId: string) => {
    const currentChecklist = record.checklist || [];
    const foundIndex = currentChecklist.findIndex(item => item && item.equipmentId === eqId);
    let updatedChecklist = [...currentChecklist];

    if (foundIndex !== -1) {
      const currentItem = currentChecklist[foundIndex];
      const willBeChecked = !currentItem.checked;
      updatedChecklist[foundIndex] = {
        ...currentItem,
        checked: willBeChecked,
        skipped: false,
        requestedRemoval: willBeChecked ? false : currentItem.requestedRemoval,
        removalReason: willBeChecked ? undefined : currentItem.removalReason,
        requestedRemovalAt: willBeChecked ? undefined : currentItem.requestedRemovalAt,
      };
    } else {
      updatedChecklist.push({
        equipmentId: eqId,
        checked: true,
        skipped: false,
        notes: '',
        checklistAnswers: {}
      });
    }

    const executedCount = updatedChecklist.filter(item => item && item.checked && !item.skipped && !item.requestedRemoval).length;
    const updates = { checklist: updatedChecklist, executedQuantity: executedCount };

    // Optimistic update: Update React state immediately for instant checkbox feedback
    setRecords(prev => prev.map(r => r.id === record.id ? { ...r, ...updates } : r));

    try {
      await dataService.upsertRecord({ ...record, ...updates });
    } catch (err) {
      console.error("Erro ao salvar status da máquina no atendimento:", err);
    }
  };

  // Toggle all equipment in active approval record (Select All / Deselect All)
  const handleToggleAllApprovalMachines = async (record: MaintenanceRecord, targetChecked: boolean) => {
    const addressEquips = equipments.filter(eq => eq && eq.addressId === record.addressId && eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated);
    const currentChecklist = record.checklist || [];
    
    const updatedChecklist: EquipmentChecklistItem[] = addressEquips.map(eq => {
      const existing = currentChecklist.find(item => item && item.equipmentId === eq.id);
      if (existing) {
        return {
          ...existing,
          checked: targetChecked,
          skipped: false,
          requestedRemoval: targetChecked ? false : existing.requestedRemoval,
          removalReason: targetChecked ? undefined : existing.removalReason,
          requestedRemovalAt: targetChecked ? undefined : existing.requestedRemovalAt,
        };
      }
      return {
        equipmentId: eq.id,
        checked: targetChecked,
        skipped: false,
        notes: '',
        checklistAnswers: {},
        requestedRemoval: false
      };
    });

    const executedCount = updatedChecklist.filter(item => item && item.checked && !item.skipped && !item.requestedRemoval).length;
    const updates = { checklist: updatedChecklist, executedQuantity: executedCount };

    // Optimistic update
    setRecords(prev => prev.map(r => r.id === record.id ? { ...r, ...updates } : r));

    try {
      await dataService.upsertRecord({ ...record, ...updates });
    } catch (err) {
      console.error("Erro ao alterar todas as máquinas na aprovação:", err);
    }
  };

  // Update specific machine notes in the active approval record
  const handleUpdateApprovalMachineNotes = async (record: MaintenanceRecord, eqId: string, notesVal: string) => {
    const currentChecklist = record.checklist || [];
    const foundIndex = currentChecklist.findIndex(item => item && item.equipmentId === eqId);
    let updatedChecklist = [...currentChecklist];

    if (foundIndex !== -1) {
      updatedChecklist[foundIndex] = {
        ...updatedChecklist[foundIndex],
        notes: notesVal
      };
    } else {
      updatedChecklist.push({
        equipmentId: eqId,
        checked: false,
        skipped: false,
        notes: notesVal,
        checklistAnswers: {}
      });
    }

    const updates = { checklist: updatedChecklist };
    setRecords(prev => prev.map(r => r.id === record.id ? { ...r, ...updates } : r));

    try {
      await dataService.upsertRecord({ ...record, ...updates });
    } catch (err) {
      console.error("Erro ao salvar notas da máquina:", err);
    }
  };

  // Delete/deactivate an equipment from client and record (with confirmation modal)
  const handleConfirmDeleteEquipment = async () => {
    if (!equipmentToDelete) return;
    const { record, equipment: eq } = equipmentToDelete;
    setDeletingEquipmentLoading(true);
    setSavingId(record.id);
    try {
      await dataService.deactivateEquipment(
        eq.id, 
        'Removido permanentemente no painel de aprovação',
        'Setor Administrativo',
        record.id
      );
      setEquipments(prev => prev.filter(e => e.id !== eq.id));

      const updatedChecklist = (record.checklist || []).filter(item => item && item.equipmentId !== eq.id);
      await dataService.upsertRecord({ ...record, checklist: updatedChecklist });
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, checklist: updatedChecklist } : r));
      setEquipmentToDelete(null);
    } catch (err) {
      console.error(err);
      alert("Erro ao remover equipamento.");
    } finally {
      setDeletingEquipmentLoading(false);
      setSavingId(null);
    }
  };

  // Aprovar solicitação de remoção feita pelo técnico
  const handleApproveRemovalOfMachine = async (record: MaintenanceRecord, eq: Equipment, reason?: string) => {
    if (!confirm(`Deseja aprovar a exclusão da máquina "${eq.label} - ${eq.name} (${eq.sector})"?\n\nEla será inativada e arquivada com segurança no banco de dados para auditoria futura.`)) {
      return;
    }
    setDeletingEquipmentLoading(true);
    try {
      await dataService.deactivateEquipment(
        eq.id, 
        reason || 'Máquina descontinuada / removida no atendimento técnico', 
        'Setor Administrativo (Aprovação)', 
        record.id
      );
      setEquipments(prev => prev.filter(e => e.id !== eq.id));
      const updatedChecklist = (record.checklist || []).filter(item => item && item.equipmentId !== eq.id);
      await dataService.upsertRecord({ ...record, checklist: updatedChecklist });
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, checklist: updatedChecklist } : r));
    } catch (err) {
      console.error("Erro ao inativar equipamento:", err);
      alert("Erro ao aprovar exclusão da máquina.");
    } finally {
      setDeletingEquipmentLoading(false);
    }
  };

  // Recusar solicitação de remoção e manter máquina ativa
  const handleRejectRemovalOfMachine = async (record: MaintenanceRecord, eqId: string) => {
    try {
      const updatedChecklist = (record.checklist || []).map(item => {
        if (item && item.equipmentId === eqId) {
          const { requestedRemoval, removalReason, requestedRemovalAt, ...rest } = item;
          return rest;
        }
        return item;
      });
      await dataService.upsertRecord({ ...record, checklist: updatedChecklist });
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, checklist: updatedChecklist } : r));
    } catch (err) {
      console.error("Erro ao recusar solicitação de exclusão:", err);
      alert("Erro ao manter máquina.");
    }
  };

  // Open Edit Equipment Modal
  const handleOpenEditEquipment = (eq: Equipment) => {
    setEquipmentToEdit(eq);
    setEditEqLabel(eq.label || eq.patrimony || '');
    setEditEqSector(eq.sector || '');
    setEditEqName(eq.name || 'Split');
    setEditEqBrand(eq.brand || '');
    setEditEqBtus(eq.btus || '');
  };

  // Save Edit Equipment Data
  const handleSaveEditEquipment = async () => {
    if (!equipmentToEdit) return;
    setSavingEquipmentEditLoading(true);
    try {
      const updatedFields: Partial<Equipment> = {
        label: editEqLabel.trim() || equipmentToEdit.label,
        patrimony: editEqLabel.trim() || equipmentToEdit.patrimony || '',
        sector: editEqSector.trim() || 'Geral',
        name: editEqName.trim() || 'Split',
        brand: editEqBrand.trim(),
        btus: editEqBtus.trim(),
      };

      await dataService.updateEquipment(equipmentToEdit.id, updatedFields);

      // Update local state
      setEquipments(prev => prev.map(e => e.id === equipmentToEdit.id ? { ...e, ...updatedFields } : e));
      setEquipmentToEdit(null);
    } catch (err) {
      console.error('Erro ao atualizar equipamento:', err);
      alert('Erro ao salvar alterações do equipamento.');
    } finally {
      setSavingEquipmentEditLoading(false);
    }
  };

  // Add brand-new equipment directly during approval phase
  const handleAddEquipmentFromApproval = async (record: MaintenanceRecord) => {
    if (submittingEq) return;
    if (!newEqSector.trim()) {
      alert("Por favor, preencha o setor/localização.");
      return;
    }
    if (!newEqBrand.trim()) {
      alert("Por favor, preencha a marca.");
      return;
    }
    if (!newEqBtus.trim()) {
      alert("Por favor, preencha a capacidade em BTUs.");
      return;
    }

    setSubmittingEq(true);
    try {
      const activeAddress = addresses.find(a => a.id === record.addressId);
      if (!activeAddress) {
        throw new Error("Endereço associado não encontrado");
      }

      // Encontrar todos os equipamentos deste endereço para calcular numeração estritamente única
      const addressEquips = equipments.filter(eq => eq && eq.addressId === record.addressId && eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated);
      const existingLabels = new Set(addressEquips.map(e => (e.label || '').trim().toLowerCase()));

      let resolvedLabel = (newEqLabel || '').trim();
      if (!resolvedLabel || existingLabels.has(resolvedLabel.toLowerCase())) {
        const numericLabels = addressEquips
          .map(e => parseInt(e.label || '', 10))
          .filter(n => !isNaN(n));
        let nextNum = numericLabels.length > 0 ? Math.max(...numericLabels) + 1 : (addressEquips.length + 1);
        while (existingLabels.has(String(nextNum).padStart(2, '0').toLowerCase()) || existingLabels.has(String(nextNum).toLowerCase())) {
          nextNum++;
        }
        resolvedLabel = String(nextNum).padStart(2, '0');
      }
      const resolvedPatrimony = (newEqLabel || '').trim(); // O campo patrimônio é o único que pode ficar em branco!

      const newEqId = await dataService.addEquipment({
        addressId: record.addressId,
        sector: newEqSector.trim(),
        name: newEqName || 'Split',
        brand: newEqBrand.trim(),
        btus: newEqBtus.trim(),
        label: resolvedLabel,
        patrimony: resolvedPatrimony
      });

      if (newEqId) {
        const newEqObj: Equipment = {
          id: newEqId,
          addressId: record.addressId,
          sector: newEqSector.trim(),
          name: newEqName || 'Split',
          brand: newEqBrand.trim(),
          btus: newEqBtus.trim(),
          label: resolvedLabel,
          patrimony: resolvedPatrimony
        };

        setEquipments(prev => [...prev, newEqObj]);

        const approvalClient = activeAddress ? clients.find(c => c.id === activeAddress.clientId) : null;
        const clientChecklist = approvalClient?.preventiveChecklist || [
          "Limpeza dos filtros de ar",
          "Verificação do dreno e dreno de bandeja",
          "Verificação de ruídos e vibrações",
          "Verificação da carga de fluido refrigerante",
          "Medição de corrente e tensão elétrica",
          "Reaperto das conexões elétricas",
          "Limpeza das serpentinas (evaporadora/condensadora)"
        ];

        const initialAnswers: Record<string, boolean> = {};
        clientChecklist.forEach(task => {
          initialAnswers[task] = true;
        });

        const updatedChecklist = [
          ...(record.checklist || []),
          {
            equipmentId: newEqId,
            checked: true,
            skipped: false,
            notes: 'Adicionado via administrativo na aprovação',
            checklistAnswers: initialAnswers,
            photos: []
          }
        ];

        await dataService.upsertRecord({ ...record, checklist: updatedChecklist });
        setRecords(prev => prev.map(r => r.id === record.id ? { ...r, checklist: updatedChecklist } : r));

        setNewEqLabel('');
        setNewEqSector('');
        setNewEqBrand('');
        setNewEqBtus('');
        setIsAddingEquipment(false);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao adicionar equipamento.");
    } finally {
      setSubmittingEq(false);
    }
  };

  // Add equipment directly by technical user during visit
  const handleAddEquipmentFromTech = async (record: MaintenanceRecord) => {
    if (techSubmittingEq) return;
    if (!techNewEqSector.trim()) {
      alert("Por favor, preencha o setor/localização.");
      return;
    }
    setTechSubmittingEq(true);
    try {
      const activeAddress = addresses.find(a => a.id === record.addressId);
      if (!activeAddress) {
        throw new Error("Endereço associado não encontrado");
      }

      // Encontrar todos os equipamentos deste endereço para calcular numeração estritamente única
      const addressEquips = equipments.filter(eq => eq && eq.addressId === record.addressId && eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated);
      const existingLabels = new Set(addressEquips.map(e => (e.label || '').trim().toLowerCase()));

      let newLabelStr = (techNewEqLabel || '').trim();
      if (!newLabelStr || existingLabels.has(newLabelStr.toLowerCase())) {
        const numericLabels = addressEquips
          .map(e => parseInt(e.label || '', 10))
          .filter(n => !isNaN(n));
        let nextNum = numericLabels.length > 0 ? Math.max(...numericLabels) + 1 : (addressEquips.length + 1);
        while (existingLabels.has(String(nextNum).padStart(2, '0').toLowerCase()) || existingLabels.has(String(nextNum).toLowerCase())) {
          nextNum++;
        }
        newLabelStr = String(nextNum).padStart(2, '0');
      }
      const newPatrimonyStr = (techNewEqLabel || '').trim(); // Patrimônio pode ficar em branco!

      const newEqId = await dataService.addEquipment({
        addressId: record.addressId,
        sector: techNewEqSector.trim(),
        name: techNewEqName || 'SPLIT',
        brand: techNewEqBrand || 'Não Definido',
        btus: techNewEqBtus || '12000',
        label: newLabelStr,
        patrimony: newPatrimonyStr,
        addedByTech: true,
        isPendingApproval: true
      });

      if (newEqId) {
        const newEqObj: Equipment = {
          id: newEqId,
          addressId: record.addressId,
          sector: techNewEqSector.trim(),
          name: techNewEqName || 'SPLIT',
          brand: techNewEqBrand || 'Não Definido',
          btus: techNewEqBtus || '12000',
          label: newLabelStr,
          patrimony: newPatrimonyStr,
          addedByTech: true,
          isPendingApproval: true
        };

        setEquipments(prev => {
          if (prev.some(eq => eq && eq.id === newEqId)) return prev;
          return [...prev, newEqObj];
        });

        const approvalClient = activeAddress ? clients.find(c => c.id === activeAddress.clientId) : null;
        const clientChecklist = approvalClient?.preventiveChecklist || [
          "Limpeza dos filtros de ar",
          "Verificação do dreno e dreno de bandeja",
          "Verificação de ruídos e vibrações",
          "Verificação da carga de fluido refrigerante",
          "Medição de corrente e tensão elétrica",
          "Reaperto das conexões elétricas",
          "Limpeza das serpentinas (evaporadora/condensadora)"
        ];

        const initialAnswers: Record<string, boolean> = {};
        clientChecklist.forEach(task => {
          initialAnswers[task] = false;
        });

        const newItem: EquipmentChecklistItem = {
          equipmentId: newEqId,
          checked: false,
          skipped: false,
          notes: 'Adicionado pelo técnico na visita',
          checklistAnswers: initialAnswers,
          photos: []
        };

        const updatedChecklist = [
          ...modalChecklist,
          newItem
        ];

        setModalChecklist(updatedChecklist);

        await dataService.upsertRecord({ ...record, checklist: updatedChecklist });
        setRecords(prev => prev.map(r => r.id === record.id ? { ...r, checklist: updatedChecklist } : r));

        setTechNewEqLabel('');
        setTechNewEqSector('');
        setTechNewEqBrand('');
        setTechNewEqBtus('');
        setIsTechAddingEquipment(false);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao adicionar equipamento pelo técnico.");
    } finally {
      setTechSubmittingEq(false);
    }
  };

  // Helper to generate a beautifully styled Excel sheet for the approved record and upload it to SharePoint
  const generateAndUploadSharepoint = async (record: MaintenanceRecord, client: Client, address?: Address) => {
    if (!client.sharepointFolderLink && !client.sharepointFolderId) {
      console.log("[SharePoint] No SharePoint configuration for client:", client.name);
      return { success: false, reason: "no_config" };
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('PMOC_Homologado');

      // Show grid lines
      worksheet.views = [{ showGridLines: true }];

      // Define columns
      worksheet.columns = [
        { key: 'colA', width: 6 },   // Item
        { key: 'colB', width: 24 },  // Equipamento
        { key: 'colC', width: 18 },  // Setor
        { key: 'colD', width: 14 },  // Marca
        { key: 'colE', width: 14 },  // BTUs
        { key: 'colF', width: 14 },  // Patrimônio
        { key: 'colG', width: 18 },  // Status
        { key: 'colH', width: 32 }   // Observações
      ];

      // Header Banner Style (Slate/Blue)
      worksheet.mergeCells('A1:H2');
      const headerCell = worksheet.getCell('A1');
      headerCell.value = 'RELATÓRIO DE MANUTENÇÃO PREVENTIVA MENSAL HOMOLOGADA';
      headerCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      headerCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' } // Navy
      };
      headerCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Metadata Cards style
      worksheet.mergeCells('A3:D3');
      worksheet.getCell('A3').value = `CLIENTE: ${String(client.fullName || client.name).toUpperCase()}`;
      worksheet.getCell('A3').font = { name: 'Arial', size: 8, bold: true };

      worksheet.mergeCells('E3:H3');
      worksheet.getCell('E3').value = `CONTRATO: ${String(client.contractNumber || 'Não especificado').toUpperCase()}`;
      worksheet.getCell('E3').font = { name: 'Arial', size: 8, bold: true };
      worksheet.getCell('E3').alignment = { horizontal: 'right' };

      worksheet.mergeCells('A4:D4');
      worksheet.getCell('A4').value = `ENDEREÇO: ${address ? `${address.street}, ${address.number || ''} - ${address.neighborhood}`.toUpperCase() : 'NÃO ESPECIFICADO'}`;
      worksheet.getCell('A4').font = { name: 'Arial', size: 8 };

      worksheet.mergeCells('E4:H4');
      worksheet.getCell('E4').value = `MÊS DE REFERÊNCIA: ${record.month}`;
      worksheet.getCell('E4').font = { name: 'Arial', size: 8, bold: true };
      worksheet.getCell('E4').alignment = { horizontal: 'right' };

      worksheet.mergeCells('A5:D5');
      worksheet.getCell('A5').value = `DATA DE EXECUÇÃO: ${record.executionDate || 'A REGISTRAR'}`;
      worksheet.getCell('A5').font = { name: 'Arial', size: 8 };

      worksheet.mergeCells('E5:H5');
      worksheet.getCell('E5').value = `STATUS DO ATENDIMENTO: HOMOLOGADO E CONCLUÍDO`;
      worksheet.getCell('E5').font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF059669' } }; // Emerald green
      worksheet.getCell('E5').alignment = { horizontal: 'right' };

      // Table Header Row
      const tableHeaders = ['Item', 'Equipamento', 'Setor', 'Marca', 'Capacidade (BTUs)', 'Patrimônio', 'Status', 'Observações'];
      tableHeaders.forEach((th, i) => {
        const cell = worksheet.getCell(7, i + 1);
        cell.value = th;
        cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF475569' } // Slate-600
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'medium', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });

      // Populate Checklist Items
      const checklist = record.checklist || [];
      let currentRow = 8;

      checklist.forEach((item, index) => {
        if (!item) return;
        const eq = (equipments || []).find(e => e && e.id === item.equipmentId);
        const row = worksheet.getRow(currentRow);
        row.getCell(1).value = index + 1;
        row.getCell(2).value = eq ? eq.name : 'Equipamento';
        row.getCell(3).value = eq ? eq.sector : '';
        row.getCell(4).value = eq ? eq.brand : '';
        row.getCell(5).value = eq ? eq.btus : '';
        row.getCell(6).value = eq ? eq.patrimony : '';
        
        let statusText = 'Pendente';
        if (item.checked) statusText = 'Concluído';
        if (item.skipped) statusText = 'Pendente / Pulado';
        
        row.getCell(7).value = statusText;
        row.getCell(8).value = item.notes || '';

        // Stylize Row Cells
        for (let col = 1; col <= 8; col++) {
          const cell = row.getCell(col);
          cell.font = { name: 'Arial', size: 8 };
          cell.alignment = { vertical: 'middle', horizontal: col === 1 || col === 7 ? 'center' : 'left' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };

          if (statusText === 'Concluído' && col === 7) {
            cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF047857' } }; // Emerald Bold
          }
        }
        currentRow++;
      });

      // Signature metadata block at the bottom
      currentRow += 2;
      worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = `Assinatura do Cliente: ${record.clientSigneeName || 'Assinado via Tablet / Mobile'}`;
      worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 8, italic: true };

      worksheet.mergeCells(`E${currentRow}:H${currentRow}`);
      worksheet.getCell(`E${currentRow}`).value = `Técnicos Executor: ${record.technician1} ${record.technician2 ? `e ${record.technician2}` : ''}`;
      worksheet.getCell(`E${currentRow}`).font = { name: 'Arial', size: 8, italic: true };
      worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'right' };

      // Write to Buffer
      const buffer = await workbook.xlsx.writeBuffer();
      
      // Convert buffer to base64
      const binaryString = Array.from(new Uint8Array(buffer))
        .map(b => String.fromCharCode(b))
        .join('');
      const base64 = btoa(binaryString);

      const cleanClientName = client.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `PMOC_Homologado_${cleanClientName}_${record.month}.xlsx`;

      console.log("[SharePoint] Iniciando envio do arquivo para a API do servidor...");
      const response = await fetch("/api/sharepoint/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName,
          fileBase64: base64,
          folderLink: client.sharepointFolderLink || "",
          folderId: client.sharepointFolderId || "",
          clientName: client.name
        })
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Ocorreu um erro desconhecido ao chamar a API.");
      }

      const result = await response.json();
      return { success: true, result };

    } catch (err: any) {
      console.error("[SharePoint Client Process Error]:", err);
      return { success: false, reason: "error", message: err.message || "Erro de rede ou permissão" };
    }
  };

  // Approve a record, marking as completed and processing jetting
  const handleApproveRecord = async (record: MaintenanceRecord) => {
    setProcessingApproval(true);
    try {
      const currentChecklist = record.checklist || [];
      const executedCount = currentChecklist.filter(item => item && item.checked && !item.skipped).length;
      const { completionDate: resolvedComp, clientSignatureDate: resolvedSig } = getRecordTimestamps(record);

      const updates: Partial<MaintenanceRecord> = {
        status: MaintenanceStatus.COMPLETED,
        routeStatus: MaintenanceStatus.COMPLETED,
        adminApproved: true,
        approvedAt: new Date().toISOString(),
        approvedBy: (userProfile?.name || 'Administrativo').trim(),
        executionDate: record.executionDate || format(new Date(), 'yyyy-MM-dd'),
        completionDate: record.completionDate || resolvedComp || new Date().toISOString(),
        clientSignatureDate: record.clientSignatureDate || resolvedSig || (record.clientSignature ? (resolvedComp || new Date().toISOString()) : undefined),
        executedQuantity: executedCount,
        rejectionReason: "" // Limpa feedback anterior de rejeição ao aprovar
      };

      await dataService.upsertRecord({ ...record, ...updates });

      // Sincronizar quaisquer registros duplicados remanescentes deste mesmo endereço e mês
      const duplicateRecords = records.filter(r => r.addressId === record.addressId && r.month === record.month && r.id !== record.id);
      if (duplicateRecords.length > 0) {
        for (const dup of duplicateRecords) {
          try {
            await dataService.upsertRecord({ ...dup, ...updates });
          } catch (e) {
            console.error('Erro ao sincronizar registro duplicado no Firestore:', e);
          }
        }
      }

      // Homologar/aprovar qualquer máquina pendente de aprovação deste endereço
      const pendingEquipsAtAddress = equipments.filter(eq => eq && eq.addressId === record.addressId && eq.isPendingApproval);
      if (pendingEquipsAtAddress.length > 0) {
        for (const eq of pendingEquipsAtAddress) {
          try {
            await dataService.updateEquipment(eq.id, { isPendingApproval: false });
          } catch (e) {
            console.error(`Erro ao homologar máquina ${eq.id}:`, e);
          }
        }
        // Atualiza estado local de equipamentos
        setEquipments(prev => prev.map(eq => {
          if (eq && eq.addressId === record.addressId && eq.isPendingApproval) {
            return { ...eq, isPendingApproval: false };
          }
          return eq;
        }));
      }

      // Processar e desativar com segurança máquinas com solicitação de exclusão do técnico
      const removalItems = currentChecklist.filter(item => item && item.requestedRemoval);
      if (removalItems.length > 0) {
        for (const item of removalItems) {
          try {
            await dataService.deactivateEquipment(
              item.equipmentId,
              item.removalReason || 'Máquina descontinuada / removida no atendimento técnico',
              'Setor Administrativo (Homologação)',
              record.id
            );
          } catch (e) {
            console.error(`Erro ao desativar máquina ${item.equipmentId}:`, e);
          }
        }
        // Remove do estado local de equipamentos ativos
        setEquipments(prev => prev.filter(eq => !removalItems.some(item => item.equipmentId === eq.id)));
      }

      try {
        await dataService.processJettingForRecord({ ...record, ...updates }, currentChecklist);
      } catch (jetErr) {
        console.error("Erro ao processar jateamento na aprovação:", jetErr);
      }

      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, ...updates } : r));
      setRecentApprovedRecords(prev => {
        const next = [{ ...record, ...updates }, ...prev.filter(r => r.id !== record.id)];
        next.sort((a, b) => {
          const timeA = a.completionDate || a.clientSignatureDate || a.executionDate || (a as any).updatedAt || a.plannedDate || a.month || '';
          const timeB = b.completionDate || b.clientSignatureDate || b.executionDate || (b as any).updatedAt || b.plannedDate || b.month || '';
          return String(timeB).localeCompare(String(timeA));
        });
        return next.slice(0, 30);
      });
      setSelectedApprovalRecordId(null);

      // Automatizar envio ao SharePoint se configurado no contrato do cliente
      const currentAddress = (addresses || []).find(a => a && a.id === record.addressId);
      const currentClient = currentAddress ? (clients || []).find(c => c && c.id === currentAddress.clientId) : null;
      let spStatusMessage = "";

      if (currentClient) {
        if (currentClient.sharepointFolderLink || currentClient.sharepointFolderId) {
          try {
            const uploadResult = await generateAndUploadSharepoint({ ...record, ...updates }, currentClient, currentAddress);
            if (uploadResult.success) {
              spStatusMessage = "\n\n🚀 A planilha foi gerada e enviada automaticamente para a pasta do SharePoint deste cliente!";
            } else if (uploadResult.reason === "error") {
              spStatusMessage = `\n\n⚠️ Atenção: Aprovado com sucesso, mas ocorreu um erro ao enviar para o SharePoint: ${uploadResult.message}`;
            }
          } catch (spErr: any) {
            console.error("Erro no fluxo do SharePoint:", spErr);
            spStatusMessage = `\n\n⚠️ Atenção: Aprovado com sucesso, mas falhou ao enviar ao SharePoint: ${spErr.message || spErr}`;
          }
        } else {
          spStatusMessage = "\n\nℹ️ Nota: Este cliente não possui uma pasta do SharePoint configurada em seu contrato. Para ativar o envio automático, configure o link da pasta na tela de Contratos.";
        }
      }

      // Preparar e acionar a visualização de impressão/salvamento do PDF automaticamente
      setIsPrintingBlank(false);
      setPrintPhotosOption(true);
      setPrintGeneralNotesOption(true);
      setIsPrintingChecklist({ ...record, ...updates });

      alert(`Atendimento homologado com sucesso! Agora consta como Concluído na Central PMOC e no Controle de Jateamento (se houver máquinas marcadas).${spStatusMessage}\n\nSua planilha em PDF será gerada e a janela de download/impressão será aberta automaticamente a seguir.`);

      setTimeout(() => {
        window.print();
      }, 500);
    } catch (err) {
      console.error(err);
      alert("Erro ao aprovar atendimento.");
    } finally {
      setProcessingApproval(false);
    }
  };

  // Reject and return to Draft/Pending
  const handleRejectRecord = async (record: MaintenanceRecord) => {
    const reason = window.prompt("Por favor, informe o motivo da rejeição/devolução deste atendimento (os técnicos verão este feedback no aplicativo):");
    if (reason === null) return; // Cancelado pelo usuário
    
    if (!reason.trim()) {
      alert("É obrigatório preencher o motivo da rejeição para devolver o atendimento aos técnicos.");
      return;
    }

    setProcessingApproval(true);
    try {
      const updates: Partial<MaintenanceRecord> = {
        status: MaintenanceStatus.PENDING,
        rejectionReason: reason.trim()
      };

      await dataService.upsertRecord({ ...record, ...updates });

      // Sincronizar registros duplicados remanescentes deste mesmo endereço e mês
      const duplicateRecords = records.filter(r => r.addressId === record.addressId && r.month === record.month && r.id !== record.id);
      if (duplicateRecords.length > 0) {
        for (const dup of duplicateRecords) {
          try {
            await dataService.upsertRecord({ ...dup, ...updates });
          } catch (e) {
            console.error('Erro ao devolver registro duplicado no Firestore:', e);
          }
        }
      }

      setRecords(prev => prev.map(r => (r.id === record.id || (r.addressId === record.addressId && r.month === record.month)) ? { ...r, ...updates } : r));
      setRecentApprovedRecords(prev => prev.filter(r => r.id !== record.id && r.addressId !== record.addressId));
      setSelectedApprovalRecordId(null);
      alert("Atendimento devolvido com sucesso! O técnico já pode visualizar o motivo no aplicativo e realizar os ajustes necessários.");
    } catch (err) {
      console.error(err);
      alert("Erro ao devolver atendimento.");
    } finally {
      setProcessingApproval(false);
    }
  };

  // Move an approved record back to pending approval workflow for re-homologation
  const handleMoveToPendingApproval = async (record: MaintenanceRecord) => {
    setProcessingApproval(true);
    try {
      const updates: Partial<MaintenanceRecord> = {
        status: MaintenanceStatus.PRE_COMPLETED,
        routeStatus: MaintenanceStatus.PRE_COMPLETED,
        adminApproved: false,
        approvedAt: undefined,
        approvedBy: undefined
      };

      await dataService.upsertRecord({ ...record, ...updates });

      setRecords(prev => prev.map(r => (r.id === record.id || (r.addressId === record.addressId && r.month === record.month)) ? { ...r, ...updates } : r));
      setRecentApprovedRecords(prev => prev.filter(r => r.id !== record.id && r.addressId !== record.addressId));
      setSelectedApprovalRecordId(record.id);
      setApprovalSidebarTab('pending');
      alert("Atendimento movido com sucesso para a fila de 'Aguardando Aprovação'!");
    } catch (err) {
      console.error(err);
      alert("Erro ao mover atendimento para aprovação.");
    } finally {
      setProcessingApproval(false);
    }
  };

  // Service Order Handlers for Daily Route Integration
  const handleOpenAddOSModal = () => {
    setOsFormDate(itineraryDate);
    const matchedTech = techs.find(t => t.name.trim().toLowerCase() === selectedTech.trim().toLowerCase());
    setOsFormTechId(matchedTech ? matchedTech.id : (techs[0]?.id || ''));
    setOsFormTech2Id('');
    setOsFormClientId('');
    setOsFormAddressId('');
    setOsFormEquipmentId('');
    setOsFormType('MANUTENÇÃO CORRETIVA CONTRATO');
    setOsFormNumber('00000');
    setOsFormDescription('');
    setOsFormInstructions('');
    setIsAddOSModalOpen(true);
  };

  const handleSaveOSIntoItinerary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!osFormClientId || !osFormAddressId) {
      alert('Por favor, selecione o Cliente e o Endereço de atendimento.');
      return;
    }
    if (!osFormTechId) {
      alert('Por favor, selecione o Técnico Responsável.');
      return;
    }

    setOsFormSubmitting(true);
    try {
      const selectedClient = clients.find(c => c.id === osFormClientId);
      const selectedAddress = addresses.find(a => a.id === osFormAddressId);
      const selectedTech1 = techs.find(t => t.id === osFormTechId);
      const selectedTech2 = techs.find(t => t.id === osFormTech2Id);
      const isOtherEquipment = osFormEquipmentId === 'OUTRO EQUIPAMENTO';
      const selectedEq = isOtherEquipment ? null : equipments.find(eq => eq.id === osFormEquipmentId);

      if (isOtherEquipment && !osFormDescription.trim()) {
        alert('Atenção: Como você selecionou "OUTRO EQUIPAMENTO", informe na descrição os detalhes da máquina atendida (marca, modelo, ambiente, capacidade) para o administrativo poder identificar a máquina correta.');
        setOsFormSubmitting(false);
        return;
      }

      const targetDate = osFormDate || itineraryDate;
      const targetMonth = targetDate.substring(0, 7);

      const newOrderId = 'OS_' + Date.now() + '_' + Math.floor(1000 + Math.random() * 9000);
      const initialOs = generateInitialOsNumber();

      const newOrder: ServiceOrder = {
        id: newOrderId,
        osNumber: initialOs,
        osNumberChanged: false,
        clientId: osFormClientId,
        clientName: selectedClient?.fullName || selectedClient?.name || '',
        clientCnpj: selectedClient?.cnpj || '',
        clientEmail: selectedClient?.email || '',
        clientPhone: selectedClient?.phone || '',
        clientAddress: selectedAddress 
          ? [
              selectedAddress.street,
              selectedAddress.number ? `Nº ${selectedAddress.number}` : '',
              selectedAddress.complement || '',
              selectedAddress.neighborhood || '',
              selectedAddress.city || '',
              selectedAddress.state || '',
              selectedAddress.cep ? `CEP: ${selectedAddress.cep}` : ''
            ].filter(Boolean).join(' - ')
          : (selectedClient?.fullAddress || ''),
        addressId: osFormAddressId,
        addressStreet: selectedAddress?.street || '',
        equipmentId: osFormEquipmentId || undefined,
        equipmentName: isOtherEquipment ? 'OUTRO EQUIPAMENTO' : (selectedEq?.name || undefined),
        equipmentBrand: isOtherEquipment ? undefined : (selectedEq?.brand || undefined),
        equipmentSector: isOtherEquipment ? undefined : (selectedEq?.sector || undefined),
        equipmentBtus: isOtherEquipment ? undefined : (selectedEq?.btus || undefined),
        equipmentPatrimony: isOtherEquipment ? undefined : (selectedEq?.patrimony || undefined),
        status: 'aberta',
        type: osFormType,
        openedAt: new Date(targetDate + 'T08:00:00').toISOString(),
        openedBy: userRole === UserRole.ADMIN ? 'ADMIN' : 'Administrativo',
        description: osFormDescription || 'Atendimento / Chamado de Ordem de Serviço',
        services: [],
        products: [],
        totalValue: 0,
        technicianId: osFormTechId,
        technician2Id: osFormTech2Id || undefined,
        authenticatedTeam: selectedTech1 ? `Técnico: ${selectedTech1.name}${selectedTech2 ? ` / ${selectedTech2.name}` : ''}` : '',
        clientRepresentative: '',
        clientRepresentativeMatricula: '',
        serviceCompany: selectedClient?.serviceCompany || 'lefrio',
        photos: [],
        plannedDate: targetDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await dataService.addServiceOrder(newOrder);

      setIsAddOSModalOpen(false);
      await loadData();
      alert(`Ordem de Serviço #${initialOs} adicionada com sucesso ao roteiro do técnico ${selectedTech1?.name || ''} para o dia ${formatDateSafe(targetDate, 'dd/MM/yyyy')}!`);
    } catch (err) {
      console.error('Erro ao adicionar O.S. ao roteiro:', err);
      alert('Erro ao salvar e enviar Ordem de Serviço para o roteiro.');
    } finally {
      setOsFormSubmitting(false);
    }
  };

  // Technician Mobile OS Modal Handler
  const handleOpenOSModalForTech = (orderOrRecord: any) => {
    let order: ServiceOrder | null = null;
    if (orderOrRecord && orderOrRecord.services !== undefined && orderOrRecord.status !== undefined) {
      order = orderOrRecord as ServiceOrder;
    } else if (orderOrRecord && orderOrRecord.serviceOrder) {
      order = orderOrRecord.serviceOrder as ServiceOrder;
    } else {
      // Find matching order in serviceOrders
      order = serviceOrders.find(os => 
        os.id === orderOrRecord.id || 
        (orderOrRecord.notes && orderOrRecord.notes.includes(os.id)) ||
        (os.addressId === orderOrRecord.addressId && os.openedAt?.startsWith(effectiveItineraryDate))
      ) || null;
    }

    if (!order && orderOrRecord) {
      // Create a temporary order representation from record if not found
      const extractedNumber = orderOrRecord.notes?.match(/\[O\.S\.\s*#?([^\]]+)\]/)?.[1] || String(Date.now()).slice(-5);
      const addr = addresses.find(a => a.id === orderOrRecord.addressId);
      const client = clients.find(c => c.id === addr?.clientId);
      order = {
        id: extractedNumber,
        osNumber: extractedNumber,
        osNumberChanged: extractedNumber !== '00000',
        clientId: client?.id || addr?.clientId || '',
        clientName: client?.fullName || client?.name || '',
        clientCnpj: client?.cnpj || '',
        clientEmail: client?.email || '',
        clientPhone: client?.phone || '',
        clientAddress: addr 
          ? [
              addr.street,
              addr.number ? `Nº ${addr.number}` : '',
              addr.complement || '',
              addr.neighborhood || '',
              addr.city || '',
              addr.state || '',
              addr.cep ? `CEP: ${addr.cep}` : ''
            ].filter(Boolean).join(' - ')
          : (client?.fullAddress || ''),
        addressId: orderOrRecord.addressId,
        addressStreet: addr?.street || '',
        status: 'aberta',
        type: 'MANUTENÇÃO CORRETIVA CONTRATO',
        openedAt: new Date().toISOString(),
        openedBy: 'Administrativo',
        description: orderOrRecord.notes || 'Atendimento de Ordem de Serviço',
        services: [],
        products: [],
        totalValue: 0,
        photos: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    if (order) {
      setActiveOSForTech(order);
      setTechOSDiagnosis(order.diagnosis || '');
      setTechOSSolution(order.solution || '');
      setTechOSServices(order.services || []);
      setTechOSProducts(order.products || []);
      setTechOSPhotos(order.photos || []);
      setTechOSTechSig(order.techSignature || '');
      setTechOSClientSig(order.clientSignature || '');
      setTechOSClientRep(order.clientRepresentative || '');
      setTechOSClientMatricula(order.clientRepresentativeMatricula || '');
    }
  };

  const handleAddTechOSService = () => {
    if (!techOSNewServiceDesc.trim()) return;
    const newItem: ServiceOrderItem = {
      code: 'SRV',
      description: techOSNewServiceDesc.trim(),
      unit: 'UN',
      quantity: Number(techOSNewServiceQty) || 1,
      unitValue: 0,
      discountPercent: 0,
      totalValue: 0
    };
    setTechOSServices(prev => [...prev, newItem]);
    setTechOSNewServiceDesc('');
    setTechOSNewServiceQty(1);
  };

  const handleRemoveTechOSService = (index: number) => {
    setTechOSServices(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddTechOSProduct = () => {
    if (!techOSNewProductDesc.trim()) return;
    const newItem: ServiceOrderItem = {
      code: 'PEC',
      description: techOSNewProductDesc.trim(),
      unit: 'UN',
      quantity: Number(techOSNewProductQty) || 1,
      unitValue: 0,
      discountPercent: 0,
      totalValue: 0
    };
    setTechOSProducts(prev => [...prev, newItem]);
    setTechOSNewProductDesc('');
    setTechOSNewProductQty(1);
  };

  const handleRemoveTechOSProduct = (index: number) => {
    setTechOSProducts(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveTechOS = async (finalize: boolean = false) => {
    if (!activeOSForTech) return;
    
    if (finalize) {
      if (!techOSDiagnosis.trim() && !techOSSolution.trim()) {
        alert('Por favor, preencha o Diagnóstico e a Solução Executada antes de finalizar.');
        return;
      }
      if (!techOSClientRep.trim() || !techOSClientMatricula.trim() || !techOSClientSig.trim()) {
        alert('É obrigatório preencher o Nome do Cliente, a Matrícula e colher a Assinatura Digital antes de finalizar o atendimento.');
        return;
      }
      if (!window.confirm('Deseja realmente finalizar o atendimento desta Ordem de Serviço?\n\nEla será enviada ao sistema administrativo com o status "Em aberto" para conferência e fechamento formal pela administração.')) {
        return;
      }
    }

    setTechOSSaving(true);
    try {
      const now = new Date();
      // REGRA: Somente o sistema administrativo tem autonomia para finalizar uma O.S.
      // Quando o técnico clica em finalizar no aplicativo de atendimento, a O.S. vai para o sistema administrativo
      // com status "aberta" (Em aberto), com a flag techFinalized: true e adminFinalized: false.
      const updatedOrder: ServiceOrder = {
        ...activeOSForTech,
        diagnosis: techOSDiagnosis,
        solution: techOSSolution,
        services: techOSServices,
        products: techOSProducts,
        photos: techOSPhotos,
        techSignature: techOSTechSig,
        clientSignature: techOSClientSig,
        clientRepresentative: techOSClientRep,
        clientRepresentativeMatricula: techOSClientMatricula,
        status: finalize ? 'aberta' : (activeOSForTech.status || 'em_andamento'),
        techFinalized: finalize ? true : Boolean(activeOSForTech.techFinalized),
        techFinalizedAt: finalize ? now.toISOString() : activeOSForTech.techFinalizedAt,
        adminFinalized: false,
        finishedAt: finalize ? now.toISOString() : activeOSForTech.finishedAt,
        createdAt: activeOSForTech.createdAt || activeOSForTech.openedAt,
        updatedAt: now.toISOString(),
      };

      // Save order
      await dataService.addServiceOrder(updatedOrder);

      await loadData();
      setActiveOSForTech(null);
      alert(finalize ? 'Atendimento concluído com sucesso!\n\nA Ordem de Serviço foi enviada para o sistema administrativo com o status "Em aberto".' : 'Rascunho da Ordem de Serviço salvo com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar O.S. pelo técnico:', err);
      alert('Erro ao salvar Ordem de Serviço. Verifique sua conexão.');
    } finally {
      setTechOSSaving(false);
    }
  };

  const handlePrint = () => {
    window.focus();
    setTimeout(() => window.print(), 200);
  };

  return (
    <>
      {!activeChecklistRecord && (
        <div className={cn("space-y-6", isPrintingChecklist ? "print:hidden" : "")}>
      
      {!isOnline && (
        <div className="bg-amber-50 border border-amber-200 text-amber-850 px-6 py-4 rounded-2xl flex items-start gap-3 shadow-xs print:hidden animate-in fade-in slide-in-from-top-1">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm">Modo de Operação Offline Ativo</h4>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              Você está sem conexão com a internet. O Le Frio armazena todos os seus dados com segurança localmente no dispositivo. Você pode preencher checklists, tirar fotos, colher assinaturas e finalizar atendimentos normalmente. Assim que você recuperar o sinal de internet, seus dados serão sincronizados automaticamente com a central.
            </p>
          </div>
        </div>
      )}
      
      {/* Tab Selector Component - Clean, high contrast */}
      {userRole !== UserRole.TECHNICIAN && (
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-200 print:hidden bg-white px-6 pt-4 rounded-t-2xl shadow-xs gap-4">
          <div className="flex gap-6 overflow-x-auto custom-scrollbar">
            <button
              onClick={() => setActiveTab('demand')}
              className={cn(
                "pb-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 outline-none whitespace-nowrap",
                activeTab === 'demand' 
                  ? "border-blue-600 text-blue-600" 
                  : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              <Users className="w-4 h-4" />
              Demandas semanal
            </button>
            <button
              onClick={() => setActiveTab('itinerary')}
              className={cn(
                "pb-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 outline-none relative whitespace-nowrap",
                activeTab === 'itinerary' 
                  ? "border-blue-600 text-blue-600" 
                  : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
              Roteiro diário
            </button>
            <button
              onClick={() => setActiveTab('approval')}
              className={cn(
                "pb-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 outline-none relative whitespace-nowrap",
                activeTab === 'approval' 
                  ? "border-amber-500 text-amber-500" 
                  : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              <ClipboardCheck className="w-4 h-4 text-amber-500" />
              Aprovação
              {preCompletedRecords.length > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black ml-1.5 animate-pulse">
                  {preCompletedRecords.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('pmoc')}
              className={cn(
                "pb-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 outline-none relative whitespace-nowrap",
                activeTab === 'pmoc' 
                  ? "border-indigo-600 text-indigo-600" 
                  : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              <BookOpen className="w-4 h-4" />
              Central PMOC
            </button>
            <button
              onClick={() => setActiveTab('jetting')}
              className={cn(
                "pb-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 outline-none relative whitespace-nowrap",
                activeTab === 'jetting' 
                  ? "border-amber-600 text-amber-600" 
                  : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              <RefreshCw className="w-4 h-4 text-amber-500 animate-spin-slow" />
              Controle de Jateamento
            </button>
            <button
              onClick={() => setActiveTab('daily-schedule')}
              className={cn(
                "pb-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 outline-none relative whitespace-nowrap",
                activeTab === 'daily-schedule' 
                  ? "border-emerald-600 text-emerald-600" 
                  : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              <Calendar className="w-4 h-4 text-emerald-500" />
              Agenda Diária
            </button>
          </div>

          {/* Visualizer mode switcher for admins/assistants to simulate the tablet */}
          {!isReadOnly && activeTab === 'itinerary' && (
            <div className="pb-4 flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400">Visualização:</span>
              <div className="bg-gray-100 p-1 rounded-xl flex gap-1">
                <button
                  onClick={() => setIsTabletMode(false)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                    !isTabletMode ? "bg-white text-gray-800 shadow-xs font-black" : "text-gray-500 hover:text-gray-800"
                  )}
                >
                  💼 Administrativo
                </button>
                <button
                  onClick={() => setIsTabletMode(true)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1",
                    isTabletMode ? "bg-white text-blue-600 shadow-xs font-black" : "text-gray-500 hover:text-gray-800"
                  )}
                >
                  📱 Tablet do Técnico
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RENDER TAB 1: MONTHLY DEMAND VIEW (EXISTING ORIGINAL VIEW) */}
      {activeTab === 'demand' && (
        <>
          {/* Filters */}
          <div className="bg-white p-6 rounded-b-2xl rounded-l-2xl border-t border-transparent border border-gray-200 shadow-sm print:hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Mês</label>
                <input 
                  type="month" 
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Técnico</label>
                <select 
                  value={selectedTech}
                  onChange={(e) => setSelectedTech(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none"
                >
                  <option value="">Todos os Técnicos</option>
                  {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Semana</label>
                <select 
                  value={selectedWeek}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedWeek(val === 'all' ? 'all' : parseInt(val, 10));
                  }}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none"
                >
                  <option value="all">Todas</option>
                  {[1,2,3,4,5].map(w => <option key={w} value={w}>Semana {w}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Execução</label>
                <select 
                  value={executionFilter}
                  onChange={(e) => setExecutionFilter(e.target.value as 'all' | 'executed' | 'pending')}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="all">Todos os Endereços</option>
                  <option value="executed">Apenas Executados</option>
                  <option value="pending">Apenas Não Executados</option>
                </select>
              </div>
              <div className="flex items-end">
                <button 
                  type="button"
                  onClick={handlePrint}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir Demanda
                </button>
              </div>
            </div>
          </div>

          {/* Demand Content */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden print:shadow-none print:border-none">
            <div className="bg-gray-900 text-white p-6 print:bg-white print:p-3 print:text-black print:border-b print:border-gray-300">
              <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3">
                <div>
                  <h2 className="text-xl md:text-2xl font-black mb-0.5 print:text-base print:mb-0 print:text-slate-900">Pauta de Atendimento Semanal</h2>
                  <p className="opacity-70 text-xs md:text-sm print:opacity-100 print:text-[10px] print:text-slate-600 print:font-medium">
                    {selectedWeek === 'all' ? 'Todas as Semanas' : `Semana ${selectedWeek}`} • {format(new Date(month + '-02'), 'MMMM yyyy', { locale: ptBR })}
                    {executionFilter === 'executed' ? ' • Apenas Executados' : executionFilter === 'pending' ? ' • Apenas Não Executados' : ''}
                  </p>
                </div>
                <div className="flex flex-col md:items-end w-full md:w-auto">
                  <p className="text-lg md:text-xl font-black text-blue-400 print:text-blue-700 print:text-sm leading-none">{selectedTech || 'Equipe Geral'}</p>
                  
                  <div className="flex gap-4 mt-2 bg-gray-800/50 p-2 px-3 rounded-xl border border-gray-700/50 print:bg-slate-50 print:border print:border-slate-200 print:rounded-lg print:p-1.5 print:mt-1.5 self-start md:self-end">
                    <div className="text-left md:text-right border-r border-gray-700/50 pr-4 print:border-slate-300">
                      <p className="text-[9px] uppercase font-black text-gray-400 print:text-[7.5px] print:text-slate-500">Máquinas (Mês)</p>
                      <div className="flex flex-col md:items-end">
                        <p className="font-extrabold text-xl leading-none text-white mt-0.5 print:text-slate-900 print:text-xs print:mt-0">{monthTotal}</p>
                        <p className="text-[10px] text-gray-400 font-bold mt-1 print:text-[7.5px] print:text-slate-600">
                          {monthCompleted} realiz. ({monthTotal > 0 ? Math.round((monthCompleted / monthTotal) * 100) : 0}%)
                        </p>
                      </div>
                    </div>
                    <div className="text-left md:text-right pl-2">
                      <p className="text-[9px] uppercase font-black text-gray-400 print:text-[7.5px] print:text-slate-500">
                        {selectedWeek === 'all' ? 'Máquinas (Todas)' : 'Máquinas (Semana)'}
                      </p>
                      <div className="flex flex-col md:items-end">
                        <p className="font-extrabold text-xl leading-none text-blue-400 mt-0.5 print:text-blue-700 print:text-xs print:mt-0">{weekTotal}</p>
                        <p className="text-[10px] text-blue-300 font-bold mt-1 print:text-[7.5px] print:text-blue-700">
                          {weekCompleted} realiz. ({weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0}%)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Barra de Busca e Resumo Rápido da Pauta */}
            <div className="bg-slate-50/90 border-b border-slate-200 px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 print:hidden">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={pautaSearchTerm}
                  onChange={(e) => setPautaSearchTerm(e.target.value)}
                  placeholder="Filtrar cliente, endereço, rota..."
                  className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-3xs"
                />
                {pautaSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setPautaSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Limpar filtro"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2.5 text-xs text-slate-600 w-full sm:w-auto justify-between sm:justify-end">
                <span className="font-semibold text-slate-700">
                  Total: <strong className="text-slate-900 font-black">{filteredRecords.length}</strong> {filteredRecords.length === 1 ? 'endereço' : 'endereços'}
                  {pautaSearchTerm && <span className="text-slate-400 font-normal ml-1">(filtrados)</span>}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md text-[11px]">
                  {filteredRecords.filter(r => r.status === MaintenanceStatus.COMPLETED).length} realizados
                </span>
                <span className="text-amber-700 font-bold bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md text-[11px]">
                  {filteredRecords.filter(r => r.status !== MaintenanceStatus.COMPLETED).length} pendentes
                </span>
              </div>
            </div>

            <div className="p-0 print:p-1">
              {filteredRecords.length === 0 ? (
                <div className="py-16 text-center">
                  <Users className="w-10 h-10 text-gray-250 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm font-medium">Nenhuma demanda encontrada para os filtros selecionados.</p>
                  {pautaSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setPautaSearchTerm('')}
                      className="mt-2 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      Limpar filtro de busca
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[760px] print:min-w-0">
                    <thead className="print:table-header-group">
                      <tr className="bg-slate-100/80 border-b border-slate-200 text-[10.5px] font-black text-slate-500 uppercase tracking-wider print:bg-slate-200/80 print:text-[8px]">
                        <th className="py-2.5 px-3 w-12 text-center">#</th>
                        <th className="py-2.5 px-3 min-w-[300px]">Cliente / Endereço</th>
                        <th className="py-2.5 px-3 w-56">Rota / Semana</th>
                        <th className="py-2.5 px-3 w-28 text-center">Máquinas</th>
                        <th className="py-2.5 px-3 w-36 text-center">Data Prevista</th>
                        <th className="py-2.5 px-3 w-28 text-center">Status</th>
                        <th className="py-2.5 px-3 min-w-[150px]">Observação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 text-xs">
                      {filteredRecords.map((record, index) => {
                        const recAddrId = String(record.addressId || '').trim();
                        const liveAddr = addresses.find(a => a && a.id === recAddrId) || record.address;
                        const targetMachines = liveAddr?.totalMachines || 0;
                        const addressEquips = equipments.filter(eq => eq && String(eq.addressId || '').trim() === recAddrId && eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated);
                        const isGenericOnly = !record.isTemporaryRoute && targetMachines > 0 && addressEquips.length === 0;
                        const isPartialEquips = !record.isTemporaryRoute && targetMachines > 0 && addressEquips.length > 0 && addressEquips.length < targetMachines;
                        const isCompleted = record.status === MaintenanceStatus.COMPLETED;

                        return (
                          <tr
                            key={record.id}
                            className={cn(
                              "hover:bg-blue-50/50 transition-colors break-inside-avoid",
                              isCompleted ? "bg-emerald-50/20" : "bg-white",
                              index % 2 === 1 && !isCompleted ? "bg-slate-50/40" : ""
                            )}
                          >
                            {/* Sequencial / Número */}
                            <td className="py-2.5 px-3 text-center align-middle font-black text-slate-400 print:text-[8px] print:py-1">
                              <span className="inline-block w-6 h-6 leading-6 rounded bg-slate-100 text-slate-600 font-black text-[11px] print:bg-transparent print:w-auto print:h-auto print:text-[8px]">
                                {String(index + 1).padStart(2, '0')}
                              </span>
                            </td>

                            {/* Cliente e Endereço */}
                            <td className="py-2.5 px-3 align-middle print:py-1">
                              <div className="font-black text-slate-800 text-xs leading-snug print:text-[9px]">
                                {record.client?.name || 'Cliente Geral'}
                              </div>
                              <div className="text-[11.5px] text-slate-600 flex items-start gap-1.5 mt-0.5 font-medium leading-tight print:text-[8px]">
                                <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5 print:w-2 print:h-2" />
                                <span className="break-words">{liveAddr?.street || record.address?.street}</span>
                              </div>
                              {isGenericOnly && (
                                <span 
                                  className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded mt-1 w-fit print:hidden" 
                                  title="Endereço possui apenas contagem genérica de máquinas. É necessário cadastrar os equipamentos individuais no menu Cadastros."
                                >
                                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                  Sem máquinas cadastradas (genérico)
                                </span>
                              )}
                              {isPartialEquips && (
                                <span 
                                  className="inline-flex items-center gap-1 text-[9px] font-bold text-sky-700 bg-sky-50 border border-sky-200/80 px-1.5 py-0.5 rounded mt-1 w-fit print:hidden" 
                                  title={`Cadastro parcial: ${addressEquips.length} de ${targetMachines} equipamentos cadastrados.`}
                                >
                                  <Box className="w-3 h-3 text-sky-600 shrink-0" />
                                  {addressEquips.length} de {targetMachines} cadastradas
                                </span>
                              )}
                            </td>

                            {/* Rota e Semana */}
                            <td className="py-2.5 px-3 align-middle print:py-1">
                              <div className="font-bold text-slate-700 text-xs leading-snug print:text-[8.5px]">
                                {liveAddr?.route || record.address?.route || 'Sem Rota'}
                              </div>
                              <div className="mt-0.5">
                                <span className="inline-block text-[9.5px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded print:bg-transparent print:border-none print:p-0 print:text-[7.5px] print:text-blue-900">
                                  Semana {record.scheduledWeek}
                                </span>
                              </div>
                            </td>

                            {/* Equipamentos */}
                            <td className="py-2.5 px-3 text-center align-middle print:py-1">
                              <div className="inline-flex items-center gap-1 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200/60 print:border-none print:bg-transparent print:p-0">
                                <Box className={cn("w-3 h-3 shrink-0 print:w-2 print:h-2", isGenericOnly ? "text-amber-500" : "text-blue-600")} />
                                <span className="text-xs font-black text-slate-800 print:text-[8.5px]">{targetMachines}</span>
                                <span className="text-[9px] text-slate-400 font-bold uppercase print:text-[7px]">Equip.</span>
                              </div>
                              {isGenericOnly && (
                                <div className="text-[8px] font-bold text-amber-700 uppercase tracking-wider mt-0.5 print:hidden">
                                  Genérico
                                </div>
                              )}
                            </td>

                            {/* Data Prevista */}
                            <td className="py-2.5 px-3 text-center align-middle print:py-1">
                              {/* Tela interativa */}
                              <div className="print:hidden flex items-center justify-center gap-1">
                                <input 
                                  type="date"
                                  disabled={isReadOnly}
                                  value={record.plannedDate || ''}
                                  onChange={(e) => handleUpdateRecord(record, { plannedDate: e.target.value })}
                                  className={cn(
                                    "text-[11px] font-bold border rounded-lg px-2 py-1 outline-none transition-all",
                                    isReadOnly 
                                      ? "cursor-not-allowed bg-slate-50 border-slate-200 text-slate-600"
                                      : record.plannedDate 
                                        ? "cursor-pointer font-bold text-blue-600 bg-blue-50/60 border-blue-200 focus:border-blue-500 hover:border-blue-300" 
                                        : "cursor-pointer font-semibold text-slate-400 bg-slate-50 border-slate-200 focus:text-blue-600 hover:border-slate-300"
                                  )}
                                />
                                {savingId === record.id && (
                                  <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                                )}
                              </div>
                              {/* Modo Impressão */}
                              <div className="hidden print:block text-[8px] font-bold text-slate-800">
                                {record.plannedDate ? formatDateSafe(record.plannedDate, 'dd/MM/yyyy') : '-'}
                              </div>
                            </td>

                            {/* Status */}
                            <td className="py-2.5 px-3 text-center align-middle print:py-1">
                              {isCompleted ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-black text-[10px] bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full print:text-[7.5px] print:bg-transparent print:border-none print:p-0">
                                  <CheckCircle2 className="w-3 h-3 print:w-2 print:h-2 text-emerald-600" /> Realizado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-slate-600 font-bold text-[10px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full print:text-[7.5px] print:bg-transparent print:border-none print:p-0">
                                  <Clock className="w-3 h-3 print:w-2 print:h-2 text-amber-500" /> Pendente
                                </span>
                              )}
                            </td>

                            {/* Observações */}
                            <td className="py-2.5 px-3 align-middle print:py-1">
                              <p className="text-[11px] text-slate-600 italic leading-tight max-w-[240px] truncate print:max-w-none print:text-[7.5px] print:leading-tight" title={record.notes}>
                                {record.notes === 'PRIORIDADE: Pendente do mês anterior' ? '-' : (record.notes || '-')}
                              </p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              
              <div className="mt-4 p-4 border-t border-gray-100 text-center print:block hidden print:mt-2 print:pt-1">
                <p className="text-xs text-gray-400 uppercase tracking-widest print:text-[8px]">Controle de Atendimento • Documento Interno • Gerado em {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* RENDER TAB 2: ROUTE SCHEDULING & SEQUENCER (DAILY ITINERARY) */}
      {activeTab === 'itinerary' && (
        <div className="space-y-6">
          {isTabletMode && !authTech ? (
            /* PIN-LOCKED LOGIN SCREEN FOR STREET TECHNICIANS */
            <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden p-8 space-y-8">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                  <Sparkles className="w-8 h-8 text-amber-500" />
                </div>
                <h2 className="text-2xl font-black text-gray-900 mt-4">Tablet de Campo</h2>
                <p className="text-sm text-gray-500">Selecione seu nome e digite seu PIN de 4 dígitos para ver as visitas de hoje.</p>
              </div>

              {/* Name Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Identificação do Técnico</label>
                <select 
                  value={loginTechId}
                  onChange={(e) => {
                    setLoginTechId(e.target.value);
                    setLoginPin('');
                    setLoginError('');
                  }}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-gray-800 text-lg cursor-pointer"
                >
                  <option value="">Selecione seu nome...</option>
                  {techs.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} {!t.pin ? ' (Sem PIN Cadastrado)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* PIN Circles Display */}
              <div className="space-y-3">
                <label className="block text-center text-xs font-black text-gray-400 uppercase tracking-widest">Senha PIN de 4 dígitos</label>
                <div className="flex justify-center gap-4 py-2">
                  {[0, 1, 2, 3].map((index) => {
                    const hasDigit = loginPin.length > index;
                    return (
                      <div 
                        key={index} 
                        className={cn(
                          "w-5 h-5 rounded-full border-2 transition-all duration-150",
                          hasDigit 
                            ? "bg-blue-600 border-blue-600 scale-110" 
                            : "border-gray-300 bg-gray-50"
                        )}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Login Error Msg */}
              {loginError && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-xs font-semibold p-3.5 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* ATM Style Numeric Keypad */}
              <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    type="button"
                    disabled={!loginTechId}
                    onClick={() => {
                      if (loginPin.length < 4) setLoginPin(prev => prev + num);
                    }}
                    className="h-14 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-xl font-bold rounded-2xl border border-gray-200 text-gray-800 transition-all flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!loginTechId || !loginPin}
                  onClick={() => setLoginPin('')}
                  className="h-14 bg-gray-100 hover:bg-gray-200 text-xs font-bold rounded-2xl text-gray-600 uppercase transition-all flex items-center justify-center cursor-pointer disabled:opacity-40"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  disabled={!loginTechId}
                  onClick={() => {
                    if (loginPin.length < 4) setLoginPin(prev => prev + '0');
                  }}
                  className="h-14 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-xl font-bold rounded-2xl border border-gray-200 text-gray-800 transition-all flex items-center justify-center cursor-pointer disabled:opacity-40"
                >
                  0
                </button>
                <button
                  type="button"
                  disabled={!loginTechId || !loginPin}
                  onClick={() => setLoginPin(prev => prev.slice(0, -1))}
                  className="h-14 bg-gray-100 hover:bg-gray-200 text-xs font-bold rounded-2xl text-gray-600 uppercase transition-all flex items-center justify-center cursor-pointer disabled:opacity-40"
                >
                  Apagar
                </button>
              </div>

              {/* Back to admin option for office staff */}
              {!isReadOnly && (
                <div className="pt-4 border-t border-gray-100 text-center">
                  <button
                    type="button"
                    onClick={() => setIsTabletMode(false)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-all"
                  >
                    💼 Voltar ao Modo Administrativo (Acesso Direto)
                  </button>
                </div>
              )}
            </div>
          ) : isTabletMode && authTech ? (
            /* TOUCH-OPTIMIZED FIELD SCREEN FOR AUTHENTICATED STREET TECHNICIANS */
            <div className="space-y-6">
              {/* Field Tech Header */}
              <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider">Técnico Conectado</span>
                    <h2 className="text-xl font-black">{authTech.name}</h2>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <span className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Roteiro do Dia</span>
                    <input 
                      type="date" 
                      value={itineraryDate}
                      onChange={(e) => handleItineraryDateChange(e.target.value)}
                      className="px-3 py-2 bg-slate-800 text-white font-bold border border-slate-700 rounded-xl outline-none text-sm cursor-pointer"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => loadData(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all self-end cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                    title="Recarregar e sincronizar roteiro com o cronograma do sistema"
                  >
                    <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    <span>{loading ? "Sincronizando..." : "Atualizar Roteiro"}</span>
                  </button>

                  <button
                    onClick={handleTechLogout}
                    className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all self-end border border-slate-700 cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-blue-400" />
                    Trocar de Técnico
                  </button>

                  <button
                    onClick={handleTechLogout}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all self-end cursor-pointer"
                  >
                    <AlertCircle className="w-4 h-4" />
                    Sair / Bloquear
                  </button>
                </div>
              </div>

              {/* Tablet KPI Mini-Panel */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs text-center">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Total</span>
                  <span className="text-2xl font-black text-gray-800 block mt-1">{itineraryStats.totalVisits}</span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs text-center">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Realizados</span>
                  <span className="text-2xl font-black text-emerald-600 block mt-1">{itineraryStats.completedVisits}</span>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs text-center">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Progresso</span>
                  <span className="text-2xl font-black text-blue-600 block mt-1">{itineraryStats.percent}%</span>
                </div>
              </div>

              {/* Touch-Optimized Itinerary Stops */}
              <div className="space-y-4">
                {loading ? (
                  <div className="py-12 text-center text-gray-500">
                    <span className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin inline-block mb-2" />
                    <p className="text-xs font-bold">Carregando roteiro do dia...</p>
                  </div>
                ) : itineraryRecords.length === 0 ? (
                  <div className="bg-white py-16 text-center rounded-2xl border border-gray-200 shadow-sm">
                    <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-400 text-sm mt-1 max-w-sm mx-auto">
                      Você não possui visitas com data definida para {formatDateSafe(itineraryDate, 'dd/MM/yyyy')}.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 relative">
                    {/* Visual timeline connector */}
                    <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gray-150 border-dashed"></div>

                    {effectiveItineraryDate !== itineraryDate && (
                      <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold p-4 rounded-2xl flex items-center gap-2.5 shadow-xs shrink-0 relative z-10">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 animate-bounce" />
                        <div>
                          Exibindo o último roteiro ativo do dia <span className="font-extrabold text-blue-700 underline">{formatDateSafe(effectiveItineraryDate, 'dd/MM/yyyy')}</span>, pois não há atendimentos agendados para hoje ({formatDateSafe(itineraryDate, 'dd/MM/yyyy')}).
                        </div>
                      </div>
                    )}

                    {itineraryRecords.map((record, index) => {
                      const mapsUrl = record.address?.coordinates 
                        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(record.address.coordinates)}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(record.address?.street || '')}`;

                      // Atendimento de Ordem de Serviço no Tablet
                      if (record.itemType === 'service_order' && record.serviceOrder) {
                        const os = record.serviceOrder;
                        const isOSFinalized = os.status === 'finalizada';
                        return (
                          <div 
                            key={record.id}
                            className={cn(
                              "relative flex flex-col gap-4 p-5 rounded-3xl border transition-all duration-200 bg-white shadow-sm",
                              isOSFinalized ? "border-emerald-200 bg-emerald-50/10" : "border-purple-200"
                            )}
                          >
                            <div className="flex items-start gap-4">
                              <div className={cn(
                                "w-12 h-12 rounded-full font-black text-lg flex items-center justify-center shadow-xs shrink-0 z-10",
                                isOSFinalized ? "bg-emerald-600 text-white" : "bg-purple-600 text-white"
                              )}>
                                {index + 1}º
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="bg-purple-100 text-purple-900 border border-purple-200 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">
                                    O.S. #{os.osNumber || os.id}
                                  </span>
                                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-100">
                                    {os.type || 'Corretiva'}
                                  </span>
                                  {isOSFinalized && (
                                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md">
                                      Finalizada
                                    </span>
                                  )}
                                </div>
                                <h3 className="font-extrabold text-lg text-gray-900 leading-tight">
                                  {record.client?.name || os.clientName || 'Cliente'}
                                </h3>
                                <p className="text-gray-500 text-sm mt-1">
                                  {record.address?.street || os.addressStreet || 'Endereço'}
                                </p>
                                <a 
                                  href={mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 font-extrabold px-3 py-2 rounded-xl mt-2 transition-all"
                                >
                                  <MapPin className="w-4 h-4 shrink-0 text-blue-500" />
                                  Abrir no Google Maps / Rota de GPS
                                </a>

                                {(os.equipmentName || os.equipmentSector) && (
                                  <div className="flex flex-wrap gap-2 mt-3">
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-lg">
                                      <Wrench className="w-3.5 h-3.5 text-purple-600" />
                                      {os.equipmentName || 'Máquina'} {os.equipmentSector ? `(${os.equipmentSector})` : ''}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Detalhes do Chamado */}
                            {os.description && (
                              <div className="bg-purple-50/50 border border-purple-200/60 rounded-2xl p-3.5 text-xs text-gray-700">
                                <span className="font-extrabold text-purple-900 uppercase text-[9.5px] block mb-0.5 tracking-wider">
                                  Descrição da Solicitação / Problema:
                                </span>
                                <p className="font-medium text-gray-800">{os.description}</p>
                              </div>
                            )}

                            {/* Botão de Abrir OS */}
                            <div className="space-y-3">
                              <button
                                type="button"
                                onClick={() => handleOpenOSModalForTech(os)}
                                className={cn(
                                  "w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer",
                                  isOSFinalized
                                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100"
                                    : "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-100"
                                )}
                              >
                                {isOSFinalized ? (
                                  <>
                                    <CheckCircle2 className="w-5 h-5 animate-pulse" />
                                    Visualizar Ordem de Serviço #{os.osNumber || os.id} (Concluída)
                                  </>
                                ) : (
                                  <>
                                    <Wrench className="w-5 h-5 animate-bounce" />
                                    Abrir Ordem de Serviço #{os.osNumber || os.id}
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      }

                      const recAddrId = String(record.addressId || '').trim();
                      const liveAddress = addresses.find(a => a && a.id === recAddrId) || record.address;
                      const recordEquipments = equipments.filter(eq => eq && String(eq.addressId || '').trim() === recAddrId && eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated);
                      const doneChecklist = record.checklist || [];
                      const officialTarget = liveAddress?.totalMachines || 0;
                      const totalMachines = officialTarget > 0 ? officialTarget : (recordEquipments.length > 0 ? recordEquipments.length : doneChecklist.length);
                      const hasEquipments = totalMachines > 0 || recordEquipments.length > 0;

                      // Sanitizar itens de checklist para não contar máquinas inexistentes ou desativadas
                      const activeEquipIds = new Set(recordEquipments.map(e => e.id));
                      const sanitizedChecklist = recordEquipments.length > 0
                        ? doneChecklist.filter(item => item && activeEquipIds.has(item.equipmentId))
                        : doneChecklist;

                      const checkedCount = sanitizedChecklist.filter(item => item && item.checked && !item.skipped && !item.requestedRemoval).length;
                      const skippedCount = sanitizedChecklist.filter(item => item && item.skipped && !item.requestedRemoval).length;
                      const removedCount = sanitizedChecklist.filter(item => item && item.requestedRemoval).length;
                      const totalProcessed = checkedCount + skippedCount + removedCount;
                      const doneCount = (record.status === MaintenanceStatus.COMPLETED || record.status === MaintenanceStatus.PRE_COMPLETED)
                        ? Math.min(totalMachines, Math.max(totalProcessed, recordEquipments.length))
                        : Math.min(totalMachines, totalProcessed);
                      const remainingCount = Math.max(0, totalMachines - doneCount);
                      const progressPercent = totalMachines > 0
                        ? Math.min(100, Math.round((doneCount / totalMachines) * 100))
                        : 0;

                      if (!hasEquipments) {
                        const hasTotalMachines = (liveAddress?.totalMachines || 0) > 0;
                        return (
                          <div 
                            key={record.id}
                            className="relative flex flex-col gap-4 p-5 rounded-3xl border border-blue-200 bg-blue-50/10 shadow-sm"
                          >
                            <div className="flex items-start gap-4">
                              {/* Stop circle */}
                              <div className="w-12 h-12 rounded-full font-black text-lg flex items-center justify-center shrink-0 z-10 bg-blue-600 text-white shadow-md shadow-blue-500/20">
                                {index + 1}º
                              </div>

                              <div className="flex-1 min-w-0">
                                <h3 className="font-extrabold text-lg text-gray-900 leading-tight">
                                  {record.client?.name || 'Cliente Sem Nome'}
                                </h3>
                                
                                <p className="text-gray-500 text-sm mt-1">
                                  {record.address?.street || 'Endereço não disponível'}
                                </p>

                                {/* Interactive Google Maps Link Button */}
                                <a 
                                  href={mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 font-extrabold px-3 py-2 rounded-xl mt-2 transition-all"
                                >
                                  <MapPin className="w-4 h-4 shrink-0 text-blue-500" />
                                  Abrir no Google Maps / Rota de GPS
                                </a>

                                  <div className="flex flex-wrap gap-2 mt-3">
                                  {hasTotalMachines ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                                      <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                                      {liveAddress?.totalMachines || record.address?.totalMachines} máquina(s) cadastrada(s)
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                                      <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                                      Sincronizando equipamentos...
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (record.addressId) {
                                    try {
                                      const addrEqs = await dataService.getEquipments(record.addressId);
                                      if (addrEqs && addrEqs.length > 0) {
                                        setEquipments(prev => {
                                          const map = new Map<string, Equipment>();
                                          prev.forEach(e => map.set(e.id, e));
                                          addrEqs.forEach(e => map.set(e.id, e));
                                          return Array.from(map.values());
                                        });
                                      }
                                    } catch (e) {
                                      console.warn('Erro ao carregar equipamentos no botão:', e);
                                    }
                                  }
                                  handleOpenChecklist(record);
                                }}
                                className="w-full py-3.5 px-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                              >
                                <ClipboardCheck className="w-4 h-4" />
                                Iniciar Atendimento / Checklist
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div 
                          key={record.id}
                          className={cn(
                            "relative flex flex-col gap-4 p-5 rounded-3xl border transition-all duration-200 bg-white",
                            record.status === MaintenanceStatus.COMPLETED 
                              ? "border-emerald-200 bg-emerald-50/10" 
                              : "border-gray-200 shadow-sm"
                          )}
                        >
                          <div className="flex items-start gap-4">
                            {/* Stop circle */}
                            <div className={cn(
                              "w-12 h-12 rounded-full font-black text-lg flex items-center justify-center shadow-xs shrink-0 z-10",
                              record.status === MaintenanceStatus.COMPLETED
                                ? "bg-emerald-600 text-white"
                                : "bg-blue-600 text-white"
                            )}>
                              {index + 1}º
                            </div>

                            <div className="flex-1 min-w-0">
                              <h3 className="font-extrabold text-lg text-gray-900 leading-tight">
                                {record.client?.name || 'Cliente Sem Nome'}
                              </h3>
                              
                              <p className="text-gray-500 text-sm mt-1">
                                {record.address?.street || 'Endereço não disponível'}
                              </p>

                              {/* Interactive Google Maps Link Button */}
                              <a 
                                href={mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 font-extrabold px-3 py-2 rounded-xl mt-2 transition-all"
                              >
                                <MapPin className="w-4 h-4 shrink-0 text-blue-500" />
                                Abrir no Google Maps / Rota de GPS
                              </a>

                              <div className="flex flex-wrap gap-2 mt-3">
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg">
                                  <Box className="w-3.5 h-3.5 text-blue-500" />
                                  {totalMachines} Equipamento(s) Cadastrado(s)
                                </span>
                                {record.address?.route && (
                                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
                                    Rota: {record.address.route}
                                  </span>
                                )}
                              </div>

                              {/* Progresso de Manutenções por Card */}
                              <div className="mt-3 bg-slate-50 border border-slate-150 rounded-2xl p-3.5">
                                <div className="flex justify-between items-center mb-1.5">
                                  <span className="text-xs font-extrabold text-slate-700">Progresso de Execução</span>
                                  <span className="text-xs font-black text-blue-600">
                                    {doneCount} de {totalMachines} Máquinas ({progressPercent}%)
                                  </span>
                                </div>
                                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                                  <div 
                                    className={cn(
                                      "h-full rounded-full transition-all duration-500",
                                      record.status === MaintenanceStatus.COMPLETED || progressPercent === 100
                                        ? "bg-emerald-500"
                                        : progressPercent > 0 
                                          ? "bg-blue-500" 
                                          : "bg-slate-300"
                                    )}
                                    style={{ width: `${progressPercent}%` }}
                                  />
                                </div>
                                <div className="flex justify-between items-center mt-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                  <span>Realizadas: {checkedCount} {skippedCount > 0 ? `(${skippedCount} puladas)` : ''}{removedCount > 0 ? ` (${removedCount} excluídas)` : ''}</span>
                                  <span>Restantes: {remainingCount}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Dispatch instructions if provided by office staff */}
                          {record.notes && (
                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-gray-700">
                              <span className="font-extrabold text-amber-800 uppercase text-[9px] block mb-0.5">Observação Administrativa / Instrução</span>
                              <p className="italic font-medium">{record.notes}</p>
                            </div>
                          )}

                          {/* Rejection Feedback if any */}
                          {record.status !== MaintenanceStatus.COMPLETED && record.status !== MaintenanceStatus.PRE_COMPLETED && record.rejectionReason && (
                            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-800 space-y-2 animate-pulse">
                              <div className="flex items-center gap-2 text-rose-600">
                                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 animate-bounce" />
                                <span className="font-black text-xs uppercase tracking-wider">Atenção: Necessita Correção</span>
                              </div>
                              <p className="font-medium text-xs">Este atendimento foi devolvido pelo administrativo com a seguinte instrução:</p>
                              <div className="bg-rose-100/60 border-l-4 border-rose-500 px-3 py-2 rounded-r-xl font-mono text-xs text-rose-950 font-extrabold italic">
                                "{record.rejectionReason}"
                              </div>
                            </div>
                          )}

                          {/* Active Equipment Checklist / Signatures Trigger */}
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={() => handleOpenChecklist((record.record || record) as unknown as MaintenanceRecord)}
                              className={cn(
                                "w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer",
                                (record.status === MaintenanceStatus.COMPLETED || record.status === MaintenanceStatus.PRE_COMPLETED)
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100"
                                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-100"
                              )}
                            >
                              {(record.status === MaintenanceStatus.COMPLETED || record.status === MaintenanceStatus.PRE_COMPLETED) ? (
                                <>
                                  <CheckCircle2 className="w-5 h-5 animate-pulse" />
                                  Visualizar Folha de Atendimento (Finalizado)
                                </>
                              ) : (
                                <>
                                  <FileText className="w-5 h-5 animate-bounce" />
                                  Abrir Checklist / Iniciar Folha de Serviço
                                </>
                              )}
                            </button>
                          </div>

                          {/* Field Technician Feedback/Report Report Area */}
                          <div className="space-y-1.5 pt-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Relato de Campo do Técnico / Observação Geral</label>
                            <textarea
                              rows={2}
                              disabled={record.status === MaintenanceStatus.COMPLETED || record.status === MaintenanceStatus.PRE_COMPLETED}
                              value={editingNotes[record.id] !== undefined ? editingNotes[record.id] : (record.routeNotes || '')}
                              onChange={(e) => setEditingNotes(prev => ({ ...prev, [record.id]: e.target.value }))}
                              onBlur={() => handleUpdateRecord(record, { routeNotes: editingNotes[record.id] !== undefined ? editingNotes[record.id] : record.routeNotes })}
                              placeholder={(record.status === MaintenanceStatus.COMPLETED || record.status === MaintenanceStatus.PRE_COMPLETED) ? "Nenhum relato adicional registrado" : "Digite aqui observações adicionais (ex: peças substituídas, limpeza realizada, pendências)..."}
                              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 font-medium text-gray-700 resize-none disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                            {editingNotes[record.id] !== undefined && !(record.status === MaintenanceStatus.COMPLETED || record.status === MaintenanceStatus.PRE_COMPLETED) && (
                              <p className="text-[9px] text-blue-600 font-bold flex items-center gap-1">
                                <Check className="w-3 h-3" /> Toque fora da caixa de texto para salvar seu relato
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* STANDARD ADMINISTRATIVE VIEW FOR OFFICE STAFF (ROUTE PLANNING & REORDER) - LAZY SUB-MODULE */
            <React.Suspense fallback={
              <div className="p-12 text-center text-slate-500 font-bold bg-white rounded-3xl border border-gray-200">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                <span>Carregando Roteiro Diário...</span>
              </div>
            }>
              <ItineraryList
                records={records}
                addresses={addresses}
                clients={clients}
                equipments={equipments}
                techs={techs}
                serviceOrders={serviceOrders}
                userRole={userRole}
                isReadOnly={isReadOnly}
                managerClientId={managerClientId}
                onOpenChecklist={(record) => handleOpenChecklist(record)}
                onOpenServiceOrder={(os) => handleOpenOSModalForTech(os)}
                onUpdateRecord={handleUpdateRecord}
                onRefreshData={loadData}
                onOpenAddOSModal={() => setIsAddOSModalOpen(true)}
              />
            </React.Suspense>
          )}
        </div>
      )}

      </div>
      )}

      {/* MODAL: AGENDAR ORDEM DE SERVIÇO DIRETAMENTE NO ROTEIRO */}
      {isAddOSModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-gray-150 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-purple-900 text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-800 flex items-center justify-center shadow-inner">
                  <Wrench className="w-5 h-5 text-purple-300" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base leading-tight">Agendar O.S. no Roteiro Diário</h3>
                  <p className="text-purple-300 text-xs mt-0.5">
                    Organize a ordem de serviço para a equipe técnica sem afetar o cronograma de preventivas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddOSModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-purple-800/80 flex items-center justify-center transition-colors text-purple-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOSIntoItinerary} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Data */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Data Programada *
                  </label>
                  <input
                    type="date"
                    required
                    value={osFormDate}
                    onChange={(e) => setOsFormDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/20 font-bold text-gray-800 text-sm"
                  />
                </div>

                {/* Tipo de O.S. */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Tipo do Atendimento *
                  </label>
                  <select
                    value={osFormType}
                    onChange={(e) => setOsFormType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/20 text-sm font-medium text-gray-800"
                  >
                    <option value="MANUTENÇÃO CORRETIVA CONTRATO">Manutenção Corretiva Contrato</option>
                    <option value="MANUTENÇÃO PREVENTIVA EXTRA">Manutenção Preventiva Extra</option>
                    <option value="INSTALAÇÃO / REMOÇÃO">Instalação / Remoção</option>
                    <option value="DESLOCAMENTO / VISTORIA">Deslocamento / Vistoria</option>
                    <option value="ORÇAMENTO">Orçamento</option>
                    <option value="OUTROS">Outros</option>
                  </select>
                </div>
              </div>

              {/* Técnicos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Técnico Responsável *
                  </label>
                  <select
                    required
                    value={osFormTechId}
                    onChange={(e) => setOsFormTechId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/20 text-sm font-medium text-gray-800"
                  >
                    <option value="">Selecione o técnico</option>
                    {techIndex.indexedTechs.map(it => (
                      <option key={it.id} value={it.originalId}>[{it.indexedCode}] {it.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Auxiliar / Ajudante (Opcional)
                  </label>
                  <select
                    value={osFormTech2Id}
                    onChange={(e) => setOsFormTech2Id(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/20 text-sm font-medium text-gray-800 uppercase"
                  >
                    <option value="">Nenhum auxiliar</option>
                    {techIndex.indexedTechs.map(it => (
                      <option key={it.id} value={it.originalId}>[{it.indexedCode}] {it.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cliente */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Cliente *
                </label>
                <select
                  required
                  value={osFormClientId}
                  onChange={(e) => {
                    const cId = e.target.value;
                    setOsFormClientId(cId);
                    const clientAddrs = addresses.filter(a => a.clientId === cId);
                    setOsFormAddressId(clientAddrs[0]?.id || '');
                    setOsFormEquipmentId('');
                  }}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/20 text-sm font-bold text-gray-800"
                >
                  <option value="">Selecione o Cliente</option>
                  {[...clients].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Endereço */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Endereço do Atendimento *
                </label>
                <select
                  required
                  disabled={!osFormClientId}
                  value={osFormAddressId}
                  onChange={(e) => {
                    setOsFormAddressId(e.target.value);
                    setOsFormEquipmentId('');
                  }}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/20 text-sm font-medium text-gray-800 disabled:opacity-50"
                >
                  <option value="">Selecione o endereço</option>
                  {addresses
                    .filter(a => a.clientId === osFormClientId)
                    .map(a => (
                      <option key={a.id} value={a.id}>
                        {a.street}{a.number ? `, Nº ${a.number}` : ''}{a.neighborhood ? ` - ${a.neighborhood}` : ''}
                      </option>
                    ))}
                </select>
              </div>

              {/* Máquina / Equipamento */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Máquina / Equipamento Relacionado (Opcional)
                </label>
                <select
                  disabled={!osFormAddressId}
                  value={osFormEquipmentId}
                  onChange={(e) => setOsFormEquipmentId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/20 text-sm font-medium text-gray-800 disabled:opacity-50"
                >
                  <option value="">Nenhuma máquina específica (Atendimento geral no local)</option>
                  <option value="OUTRO EQUIPAMENTO" className="font-bold text-amber-700 bg-amber-50">
                    ⚡ OUTRO EQUIPAMENTO
                  </option>
                  {equipments
                    .filter(eq => eq.addressId === osFormAddressId)
                    .map(eq => (
                      <option key={eq.id} value={eq.id}>
                        {eq.label || eq.name || 'Máquina'} - {eq.sector || 'Sem setor'} ({eq.brand || 'Sem marca'})
                      </option>
                    ))}
                </select>

                {osFormEquipmentId === 'OUTRO EQUIPAMENTO' && (
                  <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-relaxed">
                      <strong>Opção "OUTRO EQUIPAMENTO" selecionada:</strong> Detalhe abaixo no campo de <strong>Descrição</strong> as características desta máquina (marca, modelo, ambiente/local, capacidade) para identificação pelo setor Administrativo.
                    </p>
                  </div>
                )}
              </div>

              {/* Descrição do Chamado */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Descrição da Solicitação / Defeito Relatado
                </label>
                <textarea
                  rows={3}
                  value={osFormDescription}
                  onChange={(e) => setOsFormDescription(e.target.value)}
                  placeholder="Descreva o motivo do chamado, observações repassadas pelo cliente ou instruções para a equipe técnica..."
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/20 text-sm text-gray-700 resize-none font-medium"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-gray-150">
                <button
                  type="button"
                  onClick={() => setIsAddOSModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-100 transition-all text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={osFormSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-xs transition-all shadow-md shadow-purple-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {osFormSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Agendando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Agendar e Enviar ao Roteiro
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PREENCHIMENTO / VISUALIZAÇÃO DE O.S. PELO TÉCNICO OU ADMINISTRATIVO */}
      {activeOSForTech && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-gray-150 overflow-hidden flex flex-col max-h-[92vh] my-auto">
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-600 flex items-center justify-center shadow-md">
                  <Wrench className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-purple-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider">
                      O.S. #{activeOSForTech.osNumber || activeOSForTech.id?.slice(-5)}
                    </span>
                    <span className="text-slate-400 text-xs font-semibold uppercase">
                      {activeOSForTech.type || 'Ordem de Serviço'}
                    </span>
                  </div>
                  <h3 className="font-extrabold text-base md:text-lg text-white leading-tight mt-0.5">
                    {activeOSForTech.clientName || 'Cliente'}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveOSForTech(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-800 flex items-center justify-center transition-colors text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* Informações do Local e Máquina */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-start gap-2 text-gray-700">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <span className="font-medium">{activeOSForTech.addressStreet || activeOSForTech.clientAddress || 'Endereço'}</span>
                </div>
                {activeOSForTech.equipmentName && (
                  <div className="flex items-center gap-2 text-purple-900 font-bold pt-1 border-t border-slate-200/80">
                    <Wrench className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    {activeOSForTech.equipmentName === 'OUTRO EQUIPAMENTO' || activeOSForTech.equipmentId === 'OUTRO EQUIPAMENTO' ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                        OUTRO EQUIPAMENTO (Vincular máquina no fechamento ADM)
                      </span>
                    ) : (
                      <span>Máquina: {activeOSForTech.equipmentName} {activeOSForTech.equipmentSector ? `(${activeOSForTech.equipmentSector})` : ''} - {activeOSForTech.equipmentBrand || ''}</span>
                    )}
                  </div>
                )}
                {activeOSForTech.description && (
                  <div className="pt-2 border-t border-slate-200/80">
                    <span className="font-extrabold text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Solicitação do Cliente:</span>
                    <p className="font-medium text-gray-800">{activeOSForTech.description}</p>
                  </div>
                )}
              </div>

              {/* Diagnóstico Técnico */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-gray-700 uppercase tracking-wider block">
                  Diagnóstico Técnico / Problema Constatado *
                </label>
                <textarea
                  rows={2}
                  value={techOSDiagnosis}
                  onChange={(e) => setTechOSDiagnosis(e.target.value)}
                  placeholder="Ex: Compressor com fuga de gás refrigerante na válvula de serviço..."
                  className="w-full text-xs bg-white border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-purple-500/20 font-medium text-gray-800 resize-none"
                />
              </div>

              {/* Solução Executada */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-gray-700 uppercase tracking-wider block">
                  Solução Executada / Procedimento Realizado *
                </label>
                <textarea
                  rows={2}
                  value={techOSSolution}
                  onChange={(e) => setTechOSSolution(e.target.value)}
                  placeholder="Ex: Realizada brasagem na linha, teste de estanqueidade e recarga de fluido R410A..."
                  className="w-full text-xs bg-white border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-purple-500/20 font-medium text-gray-800 resize-none"
                />
              </div>

              {/* Peças / Peças Substituídas */}
              <div className="space-y-2">
                <label className="text-[11px] font-black text-gray-700 uppercase tracking-wider block">
                  Peças / Materiais Utilizados
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Descrição da peça ou insumo (ex: Capacitor 35uF, Gás R410A)..."
                    value={techOSNewProductDesc}
                    onChange={(e) => setTechOSNewProductDesc(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium"
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder="Qtd"
                    value={techOSNewProductQty}
                    onChange={(e) => setTechOSNewProductQty(Number(e.target.value))}
                    className="w-16 px-2 py-2 bg-white border border-gray-200 rounded-xl text-xs text-center font-bold"
                  />
                  <button
                    type="button"
                    onClick={handleAddTechOSProduct}
                    className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar
                  </button>
                </div>
                {techOSProducts.length > 0 && (
                  <div className="divide-y divide-gray-150 border border-gray-200 rounded-xl overflow-hidden bg-slate-50">
                    {techOSProducts.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2.5 text-xs">
                        <span className="font-semibold text-gray-800">{p.description} ({p.quantity} UN)</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTechOSProduct(idx)}
                          className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Fotos de Evidência */}
              <div className="space-y-2">
                <label className="text-[11px] font-black text-gray-700 uppercase tracking-wider block">
                  Fotos do Atendimento (Antes / Depois / Peças)
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  {[0, 1, 2, 3].map((slot) => (
                    <div key={slot} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Foto {slot + 1}</span>
                        {techOSPhotos[slot] && (
                          <span className="text-[8px] font-black text-emerald-700 bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 rounded uppercase">
                            Anexada
                          </span>
                        )}
                      </div>
                      <ImageUploader
                        value={techOSPhotos[slot] || ''}
                        allowUrl={false}
                        onChange={(val) => {
                          const updated = [...techOSPhotos];
                          if (val) {
                            updated[slot] = val;
                          } else {
                            updated.splice(slot, 1);
                          }
                          setTechOSPhotos(updated.filter(Boolean));
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Representante do Cliente e Assinaturas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-150">
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">
                      Nome do Representante do Cliente *
                    </label>
                    <input
                      type="text"
                      placeholder="Nome de quem acompanhou no local..."
                      value={techOSClientRep}
                      onChange={(e) => setTechOSClientRep(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">
                      Matrícula / Documento
                    </label>
                    <input
                      type="text"
                      placeholder="CPF ou Matrícula..."
                      value={techOSClientMatricula}
                      onChange={(e) => setTechOSClientMatricula(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <SignaturePad
                      label="Assinatura do Cliente / Responsável"
                      savedValue={techOSClientSig}
                      onChange={(sig) => setTechOSClientSig(sig)}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1">
                      Técnico Responsável
                    </label>
                    <input
                      type="text"
                      disabled
                      value={activeOSForTech.technicianId ? (techs.find(t => t.id === activeOSForTech.technicianId)?.name || activeOSForTech.technicianId) : (authTech?.name || 'Técnico')}
                      className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-700"
                    />
                  </div>
                  <div>
                    <SignaturePad
                      label="Assinatura do Técnico Responsável"
                      savedValue={techOSTechSig}
                      onChange={(sig) => setTechOSTechSig(sig)}
                    />
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="pt-4 flex items-center justify-between gap-3 border-t border-gray-150">
                <button
                  type="button"
                  onClick={() => setActiveOSForTech(null)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-100 text-xs cursor-pointer"
                >
                  Fechar
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={techOSSaving}
                    onClick={() => handleSaveTechOS(false)}
                    className="px-4 py-2.5 rounded-xl border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 font-bold text-xs cursor-pointer disabled:opacity-50"
                  >
                    Salvar Rascunho
                  </button>
                  <button
                    type="button"
                    disabled={techOSSaving}
                    onClick={() => handleSaveTechOS(true)}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md shadow-emerald-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {techOSSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Finalizando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Finalizar Atendimento
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-MÓDULO: CHECKLIST / SERVICE SHEET MODAL (LAZY LOADED) */}
      {activeChecklistRecord && (
        <LocalErrorBoundary>
          <React.Suspense fallback={
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white p-6 rounded-2xl shadow-xl flex items-center gap-3 text-slate-800 font-bold">
                <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                <span>Carregando Ficha de Atendimento Técnico...</span>
              </div>
            </div>
          }>
            <EquipmentChecklistModal
              activeChecklistRecord={activeChecklistRecord}
              onClose={() => setActiveChecklistRecord(null)}
              addresses={addresses}
              clients={clients}
              equipments={equipments}
              techs={techs}
              deviceSettings={deviceSettings}
              isOnline={isOnline}
              selectedTech={selectedTech}
              authTech={authTech}
              isTabletMode={isTabletMode}
              onRecordUpdated={(updated) => {
                setRecords(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
              }}
            />
          </React.Suspense>
        </LocalErrorBoundary>
      )}

      {/* RENDER TAB: APPROVAL TAB */}
      <div className={cn(isPrintingChecklist ? "print:hidden" : "")}>
        {activeTab === 'approval' && (
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              {/* LEFT SIDEBAR - APPROVAL WORKFLOW TABS */}
              <div className="w-full lg:w-80 xl:w-96 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 shrink-0 space-y-4">
                {/* SUB-TABS: AGUARDANDO APROVAÇÃO vs HISTÓRICO DOS ÚLTIMOS APROVADOS */}
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => {
                      setApprovalSidebarTab('pending');
                      if (filteredPreCompletedRecords.length > 0 && !filteredPreCompletedRecords.some(r => r.id === selectedApprovalRecordId)) {
                        setSelectedApprovalRecordId(filteredPreCompletedRecords[0].id);
                      }
                    }}
                    className={cn(
                      "flex-1 py-2 px-2.5 rounded-lg font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none",
                      approvalSidebarTab === 'pending'
                        ? "bg-white text-slate-900 shadow-xs border border-slate-200/60"
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                    )}
                  >
                    <ClipboardCheck className={cn("w-3.5 h-3.5", approvalSidebarTab === 'pending' ? "text-amber-500" : "text-slate-400")} />
                    <span className="truncate">Aguardando</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.2 rounded-full font-bold",
                      approvalSidebarTab === 'pending' ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-600"
                    )}>
                      {preCompletedRecords.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setApprovalSidebarTab('approved');
                      if (filteredApprovedRecords.length > 0 && !filteredApprovedRecords.some(r => r.id === selectedApprovalRecordId)) {
                        setSelectedApprovalRecordId(filteredApprovedRecords[0].id);
                      }
                    }}
                    className={cn(
                      "flex-1 py-2 px-2.5 rounded-lg font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none",
                      approvalSidebarTab === 'approved'
                        ? "bg-white text-slate-900 shadow-xs border border-slate-200/60"
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                    )}
                  >
                    <CheckCircle2 className={cn("w-3.5 h-3.5", approvalSidebarTab === 'approved' ? "text-emerald-600" : "text-slate-400")} />
                    <span className="truncate">Histórico Aprovados</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.2 rounded-full font-bold",
                      approvalSidebarTab === 'approved' ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                    )}>
                      {sortedApprovedRecords.length}
                    </span>
                  </button>
                </div>

                {approvalSidebarTab === 'pending' ? (
                  <>
                    <div className="border-b border-gray-150 pb-2 flex items-center justify-between">
                      <h4 className="font-extrabold text-[11px] text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        Aguardando Aprovação ({filteredPreCompletedRecords.length}{approvalTechFilter ? ` de ${preCompletedRecords.length}` : ''})
                      </h4>
                      {approvalTechFilter && (
                        <button
                          type="button"
                          onClick={() => setApprovalTechFilter(null)}
                          className="text-[10px] font-bold text-amber-600 hover:text-amber-700 underline cursor-pointer"
                        >
                          Limpar
                        </button>
                      )}
                    </div>

                    {/* FILTRO POR TÉCNICO (TAGS / CHIPS) */}
                    {pendingApprovalTechs.length > 0 && (
                      <div className="space-y-2 pb-1 border-b border-gray-100">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1">
                            <Filter className="w-3 h-3 text-amber-500" />
                            Técnico 1 Responsável:
                          </span>
                          {approvalTechFilter && (
                            <span className="text-[9px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                              Filtrado
                            </span>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-0.5">
                          <button
                            type="button"
                            onClick={() => setApprovalTechFilter(null)}
                            className={cn(
                              "text-[11px] px-2.5 py-1 rounded-xl font-black transition-all flex items-center gap-1.5 cursor-pointer border select-none",
                              !approvalTechFilter
                                ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                                : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                            )}
                          >
                            <span>Todos</span>
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.2 rounded-full font-bold",
                              !approvalTechFilter ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                            )}>
                              {preCompletedRecords.length}
                            </span>
                          </button>

                          {pendingApprovalTechs.map(({ name, count }) => {
                            const isSelected = approvalTechFilter?.toLowerCase() === name.toLowerCase();
                            return (
                              <button
                                type="button"
                                key={name}
                                onClick={() => {
                                  if (isSelected) {
                                    setApprovalTechFilter(null);
                                  } else {
                                    setApprovalTechFilter(name);
                                    const techRecords = preCompletedRecords.filter(r => {
                                      const t = (r.technician1 || '').trim();
                                      return name === 'Sem Técnico' ? !t : t.toLowerCase() === name.trim().toLowerCase();
                                    });
                                    if (techRecords.length > 0 && (!selectedApprovalRecordId || !techRecords.some(r => r.id === selectedApprovalRecordId))) {
                                      setSelectedApprovalRecordId(techRecords[0].id);
                                    }
                                  }
                                }}
                                className={cn(
                                  "text-[11px] px-2.5 py-1 rounded-xl font-black transition-all flex items-center gap-1.5 cursor-pointer border select-none",
                                  isSelected
                                    ? "bg-amber-500 text-white border-amber-600 shadow-xs ring-2 ring-amber-400/30"
                                    : "bg-white hover:bg-amber-50/70 text-slate-700 hover:text-amber-900 border-slate-200 hover:border-amber-300"
                                )}
                              >
                                <span className="truncate max-w-[120px]">{name}</span>
                                <span className={cn(
                                  "text-[9px] px-1.5 py-0.2 rounded-full font-bold",
                                  isSelected ? "bg-white/30 text-white" : "bg-amber-100 text-amber-800"
                                )}>
                                  {count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                      {preCompletedRecords.length === 0 ? (
                        <div className="py-12 text-center text-gray-400">
                          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                          <p className="font-extrabold text-sm text-gray-700">Tudo em dia!</p>
                          <p className="text-xs mt-1 max-w-[200px] mx-auto text-gray-400">
                            Nenhum atendimento pendente de aprovação no momento.
                          </p>
                        </div>
                      ) : filteredPreCompletedRecords.length === 0 ? (
                        <div className="py-10 text-center text-gray-400 bg-slate-50/60 rounded-xl border border-dashed border-gray-200 p-4">
                          <Filter className="w-8 h-8 text-amber-500/70 mx-auto mb-2" />
                          <p className="font-extrabold text-xs text-gray-700">Nenhum atendimento</p>
                          <p className="text-[11px] mt-1 text-gray-400">
                            Não há atendimentos pendentes para o técnico selecionado.
                          </p>
                          <button
                            type="button"
                            onClick={() => setApprovalTechFilter(null)}
                            className="mt-3 text-xs font-bold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                          >
                            Ver todos os técnicos
                          </button>
                        </div>
                      ) : (
                        filteredPreCompletedRecords.map(r => {
                          const rAddress = addresses.find(addr => addr.id === r.addressId);
                          const rClient = rAddress ? clients.find(c => c.id === rAddress.clientId) : null;
                          const isSelected = selectedApprovalRecordId === r.id;

                          return (
                            <button
                              type="button"
                              key={r.id}
                              onClick={() => setSelectedApprovalRecordId(r.id)}
                              className={cn(
                                "w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-2 cursor-pointer shadow-2xs",
                                isSelected
                                  ? "border-amber-500 bg-amber-50/40 text-slate-900 ring-1 ring-amber-500/20"
                                  : "border-gray-150 hover:border-gray-250 bg-white text-gray-700 hover:bg-slate-50/60"
                              )}
                            >
                              <div className="flex items-start justify-between gap-2 w-full">
                                <span className="font-black text-sm text-slate-800 line-clamp-1">
                                  {rClient?.name || 'Cliente Sem Nome'}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewApprovalRecord(r);
                                    }}
                                    className="p-1 hover:bg-amber-200/70 rounded-md text-amber-800 transition-colors cursor-pointer"
                                    title="Pré-visualizar folha de atendimento"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="bg-amber-100 text-amber-800 text-[9px] font-black uppercase px-2 py-0.5 rounded-md">
                                    Pré-Finalizado
                                  </span>
                                </div>
                              </div>

                              <div className="text-xs text-slate-500 font-semibold space-y-1">
                                <p className="flex items-center gap-1 text-[11px] text-gray-400 font-bold truncate">
                                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                                  {rAddress?.street || 'Sem Endereço'}
                                </p>
                                <p className="flex items-center gap-1 text-[11px] text-gray-400 font-bold">
                                  <Users className="w-3.5 h-3.5 shrink-0" />
                                  Téc: {r.technician1} {r.technician2 ? `+ ${r.technician2}` : ''}
                                </p>
                              </div>

                              <div className="flex items-center justify-between border-t border-slate-100 pt-2 mt-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wide">
                                <div className="flex flex-col gap-0.5">
                                  <span>Mês: {formatDateSafe(r.month, 'MM/yyyy')}</span>
                                  {(() => {
                                    const { completionDate: cDate, clientSignatureDate: sDate } = getRecordTimestamps(r);
                                    if (!cDate && !sDate) return null;
                                    return (
                                      <div className="flex items-center gap-1.5 text-[9px] font-bold">
                                        {cDate && (
                                          <span className="text-indigo-600 flex items-center gap-0.5" title="Hora da Finalização">
                                            <Clock className="w-2.5 h-2.5" /> {formatDateSafe(cDate, 'HH:mm')}
                                          </span>
                                        )}
                                        {sDate && (
                                          <span className="text-emerald-600 flex items-center gap-0.5" title="Hora da Assinatura">
                                            <Check className="w-2.5 h-2.5" /> Ass {formatDateSafe(sDate, 'HH:mm')}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                                <div className="flex items-center gap-1">
                                  {(() => {
                                    const removalsInCard = r.checklist?.filter(item => item && item.requestedRemoval).length || 0;
                                    if (removalsInCard > 0) {
                                      return (
                                        <span className="text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md text-[9px] font-black flex items-center gap-0.5">
                                          <Trash2 className="w-2.5 h-2.5" />
                                          {removalsInCard} excl.
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                  <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                                    {r.checklist?.filter(item => item && item.checked && !item.skipped && !item.requestedRemoval).length || 0} Máquinas
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {/* HISTÓRICO DOS ÚLTIMOS 30 APROVADOS */}
                    <div className="border-b border-gray-150 pb-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-extrabold text-[11px] text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Últimos Aprovados ({filteredApprovedRecords.length})
                        </h4>
                        {approvedTechFilter && (
                          <button
                            type="button"
                            onClick={() => setApprovedTechFilter(null)}
                            className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                          >
                            Limpar Filtro
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 font-medium">
                        Exibindo até 30 atendimentos • Mais recentes primeiro
                      </p>
                    </div>

                    {/* BUSCA RÁPIDA DE CLIENTE / TÉCNICO */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Buscar cliente, rua ou técnico..."
                        value={approvedSearchTerm}
                        onChange={(e) => setApprovedSearchTerm(e.target.value)}
                        className="w-full text-xs pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white text-slate-800 placeholder:text-gray-400"
                      />
                    </div>

                    {/* FILTRO POR TÉCNICO DE APROVADOS */}
                    {approvedTechs.length > 1 && (
                      <div className="space-y-1.5 pb-1 border-b border-gray-100">
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1">
                          <Filter className="w-3 h-3 text-emerald-600" />
                          Filtrar por Técnico:
                        </span>
                        <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-0.5">
                          <button
                            type="button"
                            onClick={() => setApprovedTechFilter(null)}
                            className={cn(
                              "text-[10px] px-2 py-0.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer border select-none",
                              !approvedTechFilter
                                ? "bg-emerald-800 text-white border-emerald-800"
                                : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                            )}
                          >
                            <span>Todos</span>
                            <span className={cn(
                              "text-[8px] px-1 rounded-full",
                              !approvedTechFilter ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                            )}>
                              {sortedApprovedRecords.length}
                            </span>
                          </button>
                          {approvedTechs.map(({ name, count }) => {
                            const isSelected = approvedTechFilter?.toLowerCase() === name.toLowerCase();
                            return (
                              <button
                                type="button"
                                key={name}
                                onClick={() => setApprovedTechFilter(isSelected ? null : name)}
                                className={cn(
                                  "text-[10px] px-2 py-0.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer border select-none",
                                  isSelected
                                    ? "bg-emerald-600 text-white border-emerald-600"
                                    : "bg-white hover:bg-emerald-50 text-slate-700 border-slate-200"
                                )}
                              >
                                <span className="truncate max-w-[100px]">{name}</span>
                                <span className={cn(
                                  "text-[8px] px-1 rounded-full",
                                  isSelected ? "bg-white/30 text-white" : "bg-emerald-100 text-emerald-800"
                                )}>
                                  {count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                      {sortedApprovedRecords.length === 0 ? (
                        <div className="py-12 text-center text-gray-400">
                          <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                          <p className="font-extrabold text-sm text-gray-700">Nenhum atendimento aprovado</p>
                          <p className="text-xs mt-1 max-w-[200px] mx-auto text-gray-400">
                            Os atendimentos homologados e aprovados aparecerão aqui automaticamente.
                          </p>
                        </div>
                      ) : filteredApprovedRecords.length === 0 ? (
                        <div className="py-10 text-center text-gray-400 bg-slate-50/60 rounded-xl border border-dashed border-gray-200 p-4">
                          <Search className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                          <p className="font-extrabold text-xs text-gray-700">Nenhum resultado</p>
                          <p className="text-[11px] mt-1 text-gray-400">
                            Nenhum atendimento corresponde aos filtros aplicados.
                          </p>
                          <button
                            type="button"
                            onClick={() => { setApprovedTechFilter(null); setApprovedSearchTerm(''); }}
                            className="mt-3 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                          >
                            Limpar filtros
                          </button>
                        </div>
                      ) : (
                        filteredApprovedRecords.map(r => {
                          const rAddress = addresses.find(addr => addr.id === r.addressId);
                          const rClient = rAddress ? clients.find(c => c.id === rAddress.clientId) : null;
                          const isSelected = selectedApprovalRecordId === r.id;
                          const { completionDate: cDate, clientSignatureDate: sDate } = getRecordTimestamps(r);
                          const effectiveDate = r.executionDate || cDate || r.completionDate;
                          const machinesCount = r.checklist?.filter(item => item && item.checked && !item.skipped && !item.requestedRemoval).length || r.executedQuantity || 0;

                          return (
                            <button
                              type="button"
                              key={r.id}
                              onClick={() => setSelectedApprovalRecordId(r.id)}
                              className={cn(
                                "w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-2 cursor-pointer shadow-2xs",
                                isSelected
                                  ? "border-emerald-500 bg-emerald-50/50 text-slate-900 ring-1 ring-emerald-500/30"
                                  : "border-gray-150 hover:border-emerald-250 bg-white text-gray-700 hover:bg-slate-50/60"
                              )}
                            >
                              <div className="flex items-start justify-between gap-2 w-full">
                                <span className="font-black text-sm text-slate-800 line-clamp-1">
                                  {rClient?.name || 'Cliente Sem Nome'}
                                </span>
                                <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1">
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                  Aprovado
                                </span>
                              </div>

                              <div className="text-xs text-slate-500 font-semibold space-y-1">
                                <p className="flex items-center gap-1 text-[11px] text-gray-400 font-bold truncate">
                                  <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                  {rAddress?.street || 'Sem Endereço'}
                                </p>
                                <p className="flex items-center gap-1 text-[11px] text-gray-400 font-bold">
                                  <Users className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                  Téc: {r.technician1 || 'Não informado'} {r.technician2 ? `+ ${r.technician2}` : ''}
                                </p>
                              </div>

                              <div className="flex items-center justify-between border-t border-slate-100 pt-2 mt-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wide">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-slate-600 font-bold">
                                    {effectiveDate ? formatDateSafe(effectiveDate, 'dd/MM/yyyy') : `Mês: ${formatDateSafe(r.month, 'MM/yyyy')}`}
                                  </span>
                                  {(cDate || sDate) && (
                                    <div className="flex items-center gap-1.5 text-[9px] font-bold">
                                      {cDate && (
                                        <span className="text-indigo-600 flex items-center gap-0.5" title="Hora da Finalização">
                                          <Clock className="w-2.5 h-2.5" /> {formatDateSafe(cDate, 'HH:mm')}
                                        </span>
                                      )}
                                      {sDate && (
                                        <span className="text-emerald-600 flex items-center gap-0.5" title="Hora da Assinatura">
                                          <Check className="w-2.5 h-2.5" /> Ass {formatDateSafe(sDate, 'HH:mm')}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <span className="text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md font-black">
                                  {machinesCount} {machinesCount === 1 ? 'Máquina' : 'Máquinas'}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* RIGHT CONTENT - DETAILED CARD WORKFLOW & MACHINE EDITING */}
              <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[500px] w-full">
                {!activeApprovalRecord ? (
                  <div className="py-24 text-center px-6">
                    <div className={cn(
                      "p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto border mb-4",
                      approvalSidebarTab === 'approved' ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-100"
                    )}>
                      {approvalSidebarTab === 'approved' ? (
                        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                      ) : (
                        <ClipboardCheck className="w-8 h-8 text-amber-500 animate-pulse" />
                      )}
                    </div>
                    <h3 className="text-lg font-black text-slate-800 mb-2">
                      {approvalSidebarTab === 'approved' ? 'Histórico de Atendimentos Aprovados' : 'Painel de Conferência e Homologação'}
                    </h3>
                    <p className="text-sm text-slate-400 max-w-sm mx-auto">
                      {approvalSidebarTab === 'approved'
                        ? 'Selecione um atendimento aprovado na lista à esquerda para conferir o relatório oficial, lista de máquinas executadas, assinaturas e fotos do serviço.'
                        : 'Selecione um atendimento na lista à esquerda para conferir a visita técnica, ajustar as máquinas e aprovar para conclusão oficial.'}
                    </p>
                  </div>
                ) : (() => {
                  const record = activeApprovalRecord;
                  const address = addresses.find(a => a.id === record.addressId);
                  const client = address ? clients.find(c => c.id === address.clientId) : null;
                  const addressEquips = equipments.filter(eq => eq && eq.addressId === record.addressId && eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated);

                  return (
                    <div className="divide-y divide-slate-100">
                      {/* HEADER SUMMARY CARD */}
                      <div className="p-6 bg-slate-50/50">
                        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                          <div>
                            {record.status === MaintenanceStatus.COMPLETED ? (
                              <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider bg-emerald-100 px-2.5 py-1 rounded-md flex items-center gap-1.5 w-fit">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Atendimento Homologado e Concluído
                              </span>
                            ) : (
                              <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider bg-amber-100 px-2.5 py-1 rounded-md">
                                Revisão de Atendimento Técnico
                              </span>
                            )}
                            <h3 className="text-xl font-black text-slate-800 mt-2.5">{client?.name}</h3>
                            <p className="text-xs text-slate-500 font-bold flex items-center gap-1 mt-1">
                              <MapPin className="w-4 h-4 text-slate-400" />
                              {address?.street}, {address?.number} - {address?.neighborhood}, {address?.city}
                            </p>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200/80 px-3 py-2 rounded-xl border border-slate-200 cursor-pointer transition-colors select-none">
                              <input
                                type="checkbox"
                                checked={showApprovalPhotos}
                                onChange={(e) => setShowApprovalPhotos(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500/20 cursor-pointer"
                              />
                              <span className="text-xs font-bold text-slate-700">Ver fotos do técnico</span>
                            </label>
                            {record.status === MaintenanceStatus.COMPLETED ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setPreviewApprovalRecord(record)}
                                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                                  title="Visualizar a folha de atendimento oficial na tela"
                                >
                                  <Eye className="w-3.5 h-3.5 text-slate-600" />
                                  <span>Pré-visualizar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsPrintingBlank(false);
                                    setPrintPhotosOption(true);
                                    setPrintGeneralNotesOption(true);
                                    setIsPrintingChecklist(record);
                                    setTimeout(() => window.print(), 400);
                                  }}
                                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-xs hover:shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                                >
                                  <Printer className="w-4 h-4" />
                                  Imprimir / PDF
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveToPendingApproval(record)}
                                  disabled={processingApproval}
                                  className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 hover:text-amber-900 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                                  title="Mover de volta para a fila de Aguardando Aprovação para homologação formal"
                                >
                                  <ClipboardCheck className="w-4 h-4 text-amber-600" />
                                  Mover para Aguardando Aprovação
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRejectRecord(record)}
                                  disabled={processingApproval}
                                  className="px-3.5 py-2 bg-slate-100 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-200 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                                  title="Reverter status para rascunho caso precise ser corrigido"
                                >
                                  Devolver para Rascunho
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setPreviewApprovalRecord(record)}
                                  className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 text-slate-700 hover:text-slate-900 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
                                  title="Pré-visualizar a folha de atendimento oficial antes de homologar"
                                >
                                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Pré-visualizar Folha</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRejectRecord(record)}
                                  disabled={processingApproval}
                                  className="px-4 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-black rounded-xl transition-all cursor-pointer disabled:opacity-50"
                                >
                                  Devolver como Rascunho
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRecordToHomologate(record)}
                                  disabled={processingApproval}
                                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-xs hover:shadow-sm transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  Homologar e Concluir
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* SUB DETAILS GRID */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-6 border-t border-slate-100">
                          <div>
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Equipes de Rua</span>
                            <span className="text-xs font-bold text-slate-700 block mt-0.5">
                              {record.technician1} {record.technician2 ? `e ${record.technician2}` : ''}
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Data Prevista</span>
                            <span className="text-xs font-bold text-slate-700 block mt-0.5">
                              {formatDateSafe(record.plannedDate, 'dd/MM/yyyy') || 'Não planejada'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Executado em</span>
                            <span className="text-xs font-bold text-slate-700 block mt-0.5">
                              {formatDateSafe(record.executionDate || record.completionDate, 'dd/MM/yyyy') || 'A registrar'}
                            </span>
                            {(() => {
                              const { completionDate: cDate } = getRecordTimestamps(record);
                              if (cDate && (cDate.includes('T') || cDate.includes(':'))) {
                                return (
                                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-md flex items-center gap-1 mt-1 w-fit" title="Hora exata em que a planilha foi finalizada pelo técnico">
                                    <Clock className="w-3 h-3 text-indigo-500 shrink-0" />
                                    Finalizado às {formatDateSafe(cDate, 'HH:mm:ss')}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Assinatura do Cliente</span>
                            <div className="mt-0.5 space-y-1">
                              <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                {record.clientSignature ? (
                                  <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase flex items-center gap-0.5" title={record.clientSigneeName}>
                                    <Check className="w-3.5 h-3.5" /> {record.clientSigneeName ? `Assinado (${record.clientSigneeName})` : 'Assinado'}
                                  </span>
                                ) : (
                                  <span className="text-red-500 bg-red-50 px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase flex items-center gap-0.5">
                                    <X className="w-3.5 h-3.5" /> Sem assinatura
                                  </span>
                                )}
                              </span>
                              {(() => {
                                const { clientSignatureDate: sDate } = getRecordTimestamps(record);
                                if (record.clientSignature && sDate && (sDate.includes('T') || sDate.includes(':'))) {
                                  return (
                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md flex items-center gap-1 w-fit" title="Hora exata em que o cliente assinou a planilha">
                                      <Clock className="w-3 h-3 text-emerald-500 shrink-0" />
                                      Assinado às {formatDateSafe(sDate, 'HH:mm:ss')}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Local de Finalização</span>
                            <div className="mt-0.5">
                              {record.completionLatitude && record.completionLongitude ? (
                                <div className="space-y-1">
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${record.completionLatitude},${record.completionLongitude}`}
                                    target="_blank"
                                    referrerPolicy="no-referrer"
                                    className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-black bg-blue-50 hover:bg-blue-100 border border-blue-100 px-2.5 py-1 rounded-xl w-fit transition-all text-[11px]"
                                    title="Ver local exato da finalização no Google Maps"
                                  >
                                    <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                    Ver no Mapa
                                  </a>
                                  <span className="text-[9px] text-gray-400 block font-semibold leading-tight">
                                    {record.completionLatitude.toFixed(6)}, {record.completionLongitude.toFixed(6)}
                                    {record.completionAccuracy && ` (±${Math.round(record.completionAccuracy)}m)`}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-400 bg-gray-50 border border-gray-150 px-2 py-1 rounded-xl text-[10px] font-bold italic block w-fit">
                                  Não registrada
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* PAINEL DE AUDITORIA TEMPORAL: HORA DA FINALIZAÇÃO E HORA DA ASSINATURA */}
                        <div className="mt-5 p-3.5 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-emerald-50/40 border border-slate-200/90 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-indigo-600/10 border border-indigo-200/80 flex items-center justify-center text-indigo-700 shrink-0">
                              <Clock className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Auditoria Temporal do Atendimento</span>
                              <span className="font-bold text-slate-700 text-xs">
                                Horários registrados na assinatura e finalização da planilha
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2.5">
                            {(() => {
                              const { completionDate: cDate, clientSignatureDate: sDate } = getRecordTimestamps(record);
                              return (
                                <>
                                  <div className="bg-white border border-indigo-100/90 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-2xs">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                                    <div>
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Hora da Finalização</span>
                                      <span className="font-black text-indigo-950 text-xs">
                                        {cDate && (cDate.includes('T') || cDate.includes(':')) ? (
                                          <>
                                            {formatDateSafe(cDate, 'HH:mm:ss')}{' '}
                                            <span className="text-[10px] font-normal text-slate-500">({formatDateSafe(cDate, 'dd/MM/yyyy')})</span>
                                          </>
                                        ) : (
                                          <span className="text-slate-400 font-normal italic">Não registrada</span>
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="bg-white border border-emerald-100/90 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-2xs">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                    <div>
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Hora da Assinatura (Cliente)</span>
                                      <span className="font-black text-emerald-950 text-xs">
                                        {record.clientSignature ? (
                                          sDate && (sDate.includes('T') || sDate.includes(':')) ? (
                                            <>
                                              {formatDateSafe(sDate, 'HH:mm:ss')}{' '}
                                              <span className="text-[10px] font-normal text-slate-500">({formatDateSafe(sDate, 'dd/MM/yyyy')})</span>
                                            </>
                                          ) : (
                                            <span className="text-emerald-700 font-bold">Assinado (Horário pendente)</span>
                                          )
                                        ) : (
                                          <span className="text-rose-500 font-normal italic">Sem assinatura</span>
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      {showApprovalPhotos && (
                        <div className="p-6 border-b border-slate-250 bg-amber-50/5 text-slate-800">
                          <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
                            <ImageIcon className="w-4 h-4 text-amber-500" />
                            Fotos anexadas pelo técnico neste atendimento
                          </h4>
                          {(() => {
                            const allPhotos = (record.checklist || [])
                              .filter(item => item && item.photos && item.photos.some(p => !!p))
                              .map(item => {
                                const eq = addressEquips.find(e => e.id === item.equipmentId);
                                return {
                                  equipment: eq,
                                  notes: item.notes,
                                  justification: item.justification,
                                  photos: item.photos.filter(p => !!p)
                                };
                              });

                            if (allPhotos.length === 0) {
                              return (
                                <p className="text-xs font-semibold text-slate-400 italic">
                                  Nenhuma foto anexada pelo técnico neste atendimento.
                                </p>
                              );
                            }

                            return (
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {allPhotos.map((item, idx) => (
                                  <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-2xs">
                                    <div className="border-b border-slate-100 pb-2">
                                      <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider block">
                                        Etiqueta: {item.equipment?.label || 'Sem Etiqueta'}
                                      </span>
                                      <span className="text-xs font-bold text-slate-800 block truncate" title={`${item.equipment?.sector || 'Sem Setor'} - ${item.equipment?.name}`}>
                                        {item.equipment?.sector || 'Sem Setor'} - {item.equipment?.name}
                                      </span>
                                      {item.notes && (
                                        <p className="text-[10px] text-slate-500 italic mt-1 leading-snug">
                                          Obs: {item.notes}
                                        </p>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      {item.photos.map((photo, photoIdx) => (
                                        <div 
                                          key={photoIdx} 
                                          onClick={() => openPhotoPreview({
                                            src: photo,
                                            title: item.equipment?.name ? `Equipamento: ${item.equipment.name}` : 'Equipamento',
                                            subtitle: `${item.equipment?.sector || 'Sem Setor'} • ${item.equipment?.brand || ''} ${item.equipment?.btus ? `• ${formatBtus(item.equipment.btus)} BTUs` : ''}`,
                                            notes: item.notes,
                                            label: item.equipment?.label || 'Sem Etiqueta'
                                          })}
                                          className="relative aspect-square bg-slate-100 border border-slate-200 rounded-xl overflow-hidden group cursor-pointer shadow-2xs hover:shadow-md transition-all hover:scale-[1.02]"
                                          title="Clique para ampliar a foto"
                                        >
                                          <img
                                            src={photo}
                                            alt={`Foto do Equipamento ${item.equipment?.label || ''}`}
                                            className="w-full h-full object-cover group-hover:brightness-95 transition-all"
                                            referrerPolicy="no-referrer"
                                          />
                                          <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-2">
                                            <button
                                              type="button"
                                              className="text-white font-bold text-[10px] bg-black/80 hover:bg-black px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md transform group-hover:scale-105 transition-all cursor-pointer"
                                            >
                                              <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
                                              <span>Ampliar</span>
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* MAIN EQUIPMENT MANAGEMENT BLOCK */}
                      <div className="p-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                          <div>
                            <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                              <Box className="w-4 h-4 text-blue-500" />
                              Maquinário Registrado e Checklist ({addressEquips.length} máquinas)
                            </h4>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Verifique, marque ou desmarque as máquinas atendidas na preventiva. Você também pode adicionar novos equipamentos ou desativar máquinas com preservação integral de dados para auditoria.
                            </p>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-2">
                            {addressEquips.length > 0 && (() => {
                              const attendedCount = addressEquips.filter(eq => {
                                const item = record.checklist?.find(ch => ch && ch.equipmentId === eq.id);
                                return item ? !!item.checked && !item.skipped && !item.requestedRemoval : false;
                              }).length;
                              const removalCount = addressEquips.filter(eq => {
                                const item = record.checklist?.find(ch => ch && ch.equipmentId === eq.id);
                                return item ? !!item.requestedRemoval : false;
                              }).length;

                              return (
                                <div className="flex items-center gap-1.5">
                                  <div className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                                    <strong className="text-blue-700 font-extrabold">{attendedCount}</strong> de {addressEquips.length} atendidas
                                  </div>
                                  {removalCount > 0 && (
                                    <div className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200" title="Máquinas com solicitação de remoção pelo técnico">
                                      <strong className="text-rose-600 font-bold">{removalCount}</strong> a remover
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {addressEquips.length > 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleToggleAllApprovalMachines(record, true)}
                                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                                  title="Marcar todas as máquinas como atendidas"
                                >
                                  Marcar Todas
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleAllApprovalMachines(record, false)}
                                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                                  title="Desmarcar todas as máquinas"
                                >
                                  Desmarcar Todas
                                </button>
                              </>
                            )}

                            {!isAddingEquipment && (
                              <button
                                type="button"
                                onClick={() => setIsAddingEquipment(true)}
                                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-700 text-xs font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap self-start md:self-center"
                              >
                                + Adicionar Equipamento
                              </button>
                            )}
                          </div>
                        </div>

                        {/* ADD EQUIPMENT FORM BLOCK */}
                        {isAddingEquipment && (
                          <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                            <div className="flex justify-between items-center border-b border-slate-200 pb-2 mb-2">
                              <h5 className="text-xs font-black text-slate-700 uppercase tracking-wider">Novo Equipamento para este Endereço</h5>
                              <button
                                type="button"
                                onClick={() => setIsAddingEquipment(false)}
                                className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Patrimônio (Opcional)</label>
                                <input
                                  type="text"
                                  value={newEqLabel}
                                  onChange={(e) => setNewEqLabel(e.target.value)}
                                  placeholder="Em branco se não houver"
                                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none"
                                />
                                <span className="text-[9px] text-gray-400 block mt-0.5">Único que pode ficar em branco</span>
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Setor / Localização</label>
                                <input
                                  type="text"
                                  value={newEqSector}
                                  onChange={(e) => setNewEqSector(e.target.value)}
                                  placeholder="Ex: Sala de Reunião"
                                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Tipo</label>
                                <select
                                  value={newEqName}
                                  onChange={(e) => setNewEqName(e.target.value)}
                                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none"
                                >
                                  <option value="Split">Split</option>
                                  <option value="Cassete">Cassete</option>
                                  <option value="Piso Teto">Piso Teto</option>
                                  <option value="ACJ">ACJ</option>
                                  <option value="Chiller">Chiller</option>
                                  <option value="Self Contained">Self Contained</option>
                                  <option value="Multi Split">Multi Split</option>
                                  <option value="Fancoil">Fancoil</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Marca</label>
                                <input
                                  type="text"
                                  value={newEqBrand}
                                  onChange={(e) => setNewEqBrand(e.target.value)}
                                  placeholder="Ex: Carrier"
                                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">BTUs</label>
                                <input
                                  type="text"
                                  value={newEqBtus}
                                  onChange={(e) => setNewEqBtus(e.target.value)}
                                  placeholder="Ex: 12000"
                                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none"
                                />
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => setIsAddingEquipment(false)}
                                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddEquipmentFromApproval(record)}
                                disabled={submittingEq}
                                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-lg cursor-pointer flex items-center gap-1 shadow-xs"
                              >
                                {submittingEq ? (
                                  <>
                                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                                    Adicionando...
                                  </>
                                ) : (
                                  <>Adicionar Equipamento</>
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* EQUIPMENT TABLE LIST */}
                        {addressEquips.length === 0 ? (
                          <div className="py-12 border border-slate-150 border-dashed rounded-xl text-center text-gray-400">
                            <Box className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                            <p className="font-extrabold text-xs text-slate-600">Nenhum equipamento cadastrado neste endereço</p>
                            <p className="text-[11px] mt-0.5 text-slate-400 max-w-xs mx-auto">
                              Clique no botão "+ Adicionar Equipamento" acima para cadastrar a primeira máquina e gerar a checklist correspondente.
                            </p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto border border-slate-200 rounded-xl">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-slate-50 text-slate-600 font-extrabold uppercase tracking-wider text-[10px] border-b border-slate-200">
                                  <th className="py-3 px-4 text-center w-16">
                                    <div className="flex flex-col items-center gap-1">
                                      <span>Atendida?</span>
                                      {(() => {
                                        const allChecked = addressEquips.length > 0 && addressEquips.every(eq => {
                                          const item = record.checklist?.find(ch => ch && ch.equipmentId === eq.id);
                                          return item ? !!item.checked && !item.skipped : false;
                                        });
                                        const someChecked = addressEquips.some(eq => {
                                          const item = record.checklist?.find(ch => ch && ch.equipmentId === eq.id);
                                          return item ? !!item.checked && !item.skipped : false;
                                        });
                                        return (
                                          <input
                                            type="checkbox"
                                            checked={allChecked}
                                            ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                                            onChange={(e) => handleToggleAllApprovalMachines(record, e.target.checked)}
                                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 cursor-pointer"
                                            title={allChecked ? "Desmarcar todas as máquinas" : "Marcar todas como atendidas"}
                                          />
                                        );
                                      })()}
                                    </div>
                                  </th>
                                  <th className="py-3 px-3 w-28">Etiqueta/Patrimônio</th>
                                  <th className="py-3 px-3 w-40">Setor/Local</th>
                                  <th className="py-3 px-3 min-w-[150px]">Equipamento</th>
                                  <th className="py-3 px-3 min-w-[200px]">Observações/Problemas Relatados</th>
                                  <th className="py-3 px-4 text-center w-20">Ações</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {addressEquips.map((eq) => {
                                  const item = record.checklist?.find(ch => ch && ch.equipmentId === eq.id);
                                  const isChecked = item ? !!item.checked && !item.skipped && !item.requestedRemoval : false;
                                  const isSkipped = item ? !!item.skipped && !item.requestedRemoval : false;
                                  const isRemovalRequested = item ? !!item.requestedRemoval : false;
                                  const removalReason = item?.removalReason || 'Máquina descontinuada / não existe mais no local';
                                  const notesVal = item ? item.notes : '';

                                  return (
                                    <tr key={eq.id} className={cn("hover:bg-slate-50/40 transition-colors", !isChecked && "bg-slate-50/30 text-slate-500")}>
                                      {/* ATTENDED CHECKBOX */}
                                      <td className="py-3 px-4 text-center">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => handleToggleApprovalMachine(record, eq.id)}
                                          className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 cursor-pointer transition-transform active:scale-95"
                                          title={isChecked ? "Máquina atendida (clique para desmarcar)" : "Máquina não atendida (clique para marcar)"}
                                        />
                                      </td>

                                      {/* LABEL */}
                                      <td className="py-3 px-3 font-black text-slate-800">
                                        <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-mono">
                                          {eq.label || "-"}
                                        </span>
                                      </td>

                                      {/* SECTOR */}
                                      <td className="py-3 px-3 font-semibold text-slate-700 truncate max-w-[150px]">
                                        {eq.sector || <span className="text-slate-300">Geral</span>}
                                      </td>

                                      {/* DETAILS (NAME, BRAND, BTUS) */}
                                      <td className="py-3 px-3">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className="font-bold text-slate-900 notranslate" translate="no">
                                            {eq.name} - <span className="font-normal text-slate-500">{eq.brand || 'Marca não def.'}</span>
                                          </span>
                                          {eq.addedByTech && (
                                            eq.isPendingApproval ? (
                                              <span className="bg-amber-100 text-amber-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                Adicionado no Local (Pendente)
                                              </span>
                                            ) : (
                                              <span className="bg-emerald-100 text-emerald-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                Adicionado no Local (Homologado)
                                              </span>
                                            )
                                          )}
                                          {isRemovalRequested && (
                                            <span 
                                              className="bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1"
                                              title={`Motivo informado pelo técnico: ${removalReason}`}
                                            >
                                              <Trash2 className="w-2.5 h-2.5 text-rose-500 shrink-0" />
                                              Remoção solicitada: {removalReason}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[10px] font-extrabold text-slate-400 uppercase mt-0.5">
                                          {formatBtus(eq.btus)} BTUs
                                        </div>

                                        {/* JUSTIFICATIVA DE MÁQUINA PULADA */}
                                        {!isRemovalRequested && isSkipped && (
                                          <div className="mt-1.5">
                                            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded text-[10px]">
                                              <AlertCircle className="w-3 h-3 text-amber-700 shrink-0" />
                                              <span>Pulada: {item?.justification || 'Sem justificativa'}</span>
                                            </span>
                                          </div>
                                        )}

                                        {showApprovalPhotos && item && item.photos && item.photos.some(p => !!p) && (
                                          <div className="flex flex-wrap gap-1.5 mt-2">
                                            {item.photos.filter(p => !!p).map((photo, photoIdx) => (
                                              <button
                                                key={photoIdx}
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openPhotoPreview({
                                                    src: photo,
                                                    title: `Equipamento: ${eq.name}`,
                                                    subtitle: `${eq.sector || 'Sem Setor'} • ${eq.brand || ''} ${eq.btus ? `• ${formatBtus(eq.btus)} BTUs` : ''}`,
                                                    notes: item.notes,
                                                    label: eq.label || 'Sem Etiqueta'
                                                  });
                                                }}
                                                className="relative w-9 h-9 rounded-lg border border-slate-200 overflow-hidden shrink-0 hover:scale-110 transition-transform cursor-pointer shadow-2xs hover:border-blue-400 group"
                                                title="Clique para ampliar a foto"
                                              >
                                                <img
                                                  src={photo}
                                                  alt="Foto do equipamento"
                                                  className="w-full h-full object-cover"
                                                  referrerPolicy="no-referrer"
                                                />
                                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                  <ZoomIn className="w-3.5 h-3.5 text-white" />
                                                </div>
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </td>

                                      {/* MACHINE SPECIFIC NOTES */}
                                      <td className="py-3 px-3">
                                        <input
                                          type="text"
                                          defaultValue={notesVal}
                                          onBlur={(e) => handleUpdateApprovalMachineNotes(record, eq.id, e.target.value)}
                                          placeholder="Adicionar observações para esta máquina..."
                                          className="w-full px-2.5 py-1 text-xs border border-slate-200 focus:border-blue-500 rounded-lg outline-none bg-slate-50/50 focus:bg-white transition-all font-medium"
                                        />
                                      </td>

                                      {/* ACTIONS (EDIT / TRASH) */}
                                      <td className="py-3 px-4 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => handleOpenEditEquipment(eq)}
                                            className="p-1.5 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors cursor-pointer"
                                            title="Editar dados da máquina (Nome, Setor, Marca, Potência)"
                                          >
                                            <Pencil className="w-4 h-4" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (isRemovalRequested) {
                                                handleApproveRemovalOfMachine(record, eq, removalReason);
                                              } else {
                                                setEquipmentToDelete({ record, equipment: eq });
                                              }
                                            }}
                                            className={cn(
                                              "p-1.5 rounded-lg transition-colors cursor-pointer",
                                              isRemovalRequested 
                                                ? "text-rose-600 hover:bg-rose-50 hover:text-rose-700" 
                                                : "text-slate-400 hover:bg-red-50 hover:text-red-600"
                                            )}
                                            title={isRemovalRequested ? "Confirmar inativação solicitada pelo técnico" : "Remover máquina permanentemente"}
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RENDER TAB 3: PMOC CONTROL CENTER */}
      <div className={cn(isPrintingChecklist ? "print:hidden" : "")}>
        {activeTab === 'pmoc' && (
          <PMOCControlCenter 
            records={records}
            addresses={addresses}
            clients={clients}
            equipments={equipments}
            techs={techs}
            month={month}
            onMonthChange={setMonth}
            onPrintChecklist={(record, options) => {
               setIsPrintingBlank(false);
               setPrintPhotosOption(options?.printPhotos ?? true);
               setPrintGeneralNotesOption(options?.printGeneralNotes ?? true);
               setIsPrintingChecklist(record);
               setTimeout(() => window.print(), 200);
            }}
            onPrintBlankChecklist={(record, options) => {
               setIsPrintingBlank(true);
               setPrintPhotosOption(options?.printPhotos ?? true);
               setPrintGeneralNotesOption(options?.printGeneralNotes ?? true);
               setIsPrintingChecklist(record);
               setTimeout(() => window.print(), 200);
            }}
            onUpdateRecord={handleUpdateRecord}
            userRole={userRole}
          />
        )}
      </div>

      {/* RENDER TAB 4: JETTING CONTROL CENTER */}
      <div className={cn(isPrintingChecklist ? "print:hidden" : "", "px-6 pb-6")}>
        {activeTab === 'jetting' && (
          <JettingControlCenter 
            records={records}
            onPrintChecklist={(record, options) => {
               setIsPrintingBlank(false);
               setPrintPhotosOption(options?.printPhotos ?? true);
               setPrintGeneralNotesOption(options?.printGeneralNotes ?? true);
               setIsPrintingChecklist(record);
               setTimeout(() => window.print(), 200);
            }}
          />
        )}
      </div>

      {/* RENDER TAB 5: DAILY SCHEDULE REPORT (LAZY LOADED) */}
      <div className={cn(isPrintingChecklist ? "print:hidden" : "", "px-6 pb-6")}>
        {activeTab === 'daily-schedule' && (
          <React.Suspense fallback={
            <div className="p-12 text-center text-slate-500 font-bold bg-white rounded-3xl border border-gray-200">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              <span>Carregando Relatório Diário de Agendamentos...</span>
            </div>
          }>
            <DailyReportModal managerClientId={managerClientId} />
          </React.Suspense>
        )}
      </div>

      {/* MODAL DE CONFIRMAÇÃO PARA HOMOLOGAR ATENDIMENTO */}
      {recordToHomologate && (() => {
        const targetAddress = addresses.find(a => a.id === recordToHomologate.addressId);
        const targetClient = clients.find(c => c.id === targetAddress?.clientId);
        const addressEquips = equipments.filter(eq => eq.addressId === recordToHomologate.addressId);
        const attendedCount = (recordToHomologate.checklist || []).filter(item => item && item.checked && !item.skipped && !item.requestedRemoval).length;
        const removalItems = (recordToHomologate.checklist || []).filter(item => item && item.requestedRemoval);
        const removalCount = removalItems.length;
        const execDateFormatted = formatDateSafe(recordToHomologate.executionDate || recordToHomologate.plannedDate, 'dd/MM/yyyy');

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              {/* Header com destaque esmeralda */}
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-black tracking-tight">Confirmar Homologação</h3>
                    <p className="text-xs text-emerald-100 font-medium">Revisão e conclusão oficial do atendimento técnico</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !processingApproval && setRecordToHomologate(null)}
                  disabled={processingApproval}
                  className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Corpo com resumo detalhado */}
              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  Você está prestes a homologar e marcar como <strong className="text-emerald-700 font-black">Concluído</strong> o atendimento técnico de manutenção preventiva:
                </p>

                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                    <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Cliente:</span>
                    <span className="font-black text-slate-800 text-right">{targetClient?.name || 'Cliente'}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                    <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Unidade / Endereço:</span>
                    <span className="font-semibold text-slate-700 text-right truncate max-w-[240px]" title={targetAddress?.street}>
                      {targetAddress?.neighborhood ? `${targetAddress.neighborhood} - ` : ''}{targetAddress?.street || 'Endereço'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                    <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Data de Execução:</span>
                    <span className="font-bold text-slate-800 text-right">
                      {execDateFormatted || '-'}
                      {(() => {
                        const { completionDate: hComp } = getRecordTimestamps(recordToHomologate);
                        if (hComp && (hComp.includes('T') || hComp.includes(':'))) {
                          return (
                            <span className="block text-[11px] font-bold text-indigo-700">
                              Finalizado às {formatDateSafe(hComp, 'HH:mm:ss')}
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                    <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Equipe Técnica:</span>
                    <span className="font-bold text-slate-800">
                      {recordToHomologate.technician1} {recordToHomologate.technician2 ? `e ${recordToHomologate.technician2}` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                    <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Máquinas Atendidas:</span>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-black rounded-lg text-[11px]">
                      {attendedCount} de {addressEquips.length} máquinas
                    </span>
                  </div>
                  {removalCount > 0 && (
                    <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                      <span className="text-rose-600 font-bold uppercase text-[10px] tracking-wider flex items-center gap-1">
                        <Trash2 className="w-3.5 h-3.5" /> Exclusões Solicitadas:
                      </span>
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-black rounded-lg text-[11px]">
                        {removalCount} {removalCount === 1 ? 'máquina a inativar' : 'máquinas a inativar'}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Assinatura Cliente:</span>
                    {recordToHomologate.clientSignature ? (
                      <div className="text-right">
                        <span className="text-emerald-700 font-bold flex items-center justify-end gap-1">
                          <Check className="w-3.5 h-3.5" /> Assinado ({recordToHomologate.clientSigneeName || 'Responsável'})
                        </span>
                        {(() => {
                          const { clientSignatureDate: hSig } = getRecordTimestamps(recordToHomologate);
                          if (hSig && (hSig.includes('T') || hSig.includes(':'))) {
                            return (
                              <span className="block text-[11px] font-bold text-emerald-700">
                                Assinado às {formatDateSafe(hSig, 'HH:mm:ss')}
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    ) : (
                      <span className="text-amber-600 font-bold">Sem assinatura registrada</span>
                    )}
                  </div>
                </div>

                <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3.5 text-[11px] text-emerald-900 leading-snug flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-black text-emerald-950 mb-0.5">Ações automáticas ao homologar:</strong>
                    <ul className="list-disc list-inside text-emerald-800/90 space-y-0.5 font-medium">
                      <li>Atualização no PMOC e no Controle de Jateamento</li>
                      {removalCount > 0 && (
                        <li className="text-rose-800 font-bold">
                          Inativação segura e arquivamento para auditoria de {removalCount} {removalCount === 1 ? 'máquina solicitada' : 'máquinas solicitadas'}
                        </li>
                      )}
                      <li>Envio automático ao SharePoint do cliente (caso configurado)</li>
                      <li>Geração da folha de atendimento em PDF para visualização/impressão</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Footer com botões */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setPreviewApprovalRecord(recordToHomologate)}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                  title="Conferir a folha impressa antes de homologar"
                >
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  <span>Pré-visualizar Folha</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRecordToHomologate(null)}
                    disabled={processingApproval}
                    className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await handleApproveRecord(recordToHomologate);
                      setRecordToHomologate(null);
                    }}
                    disabled={processingApproval}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-xs hover:shadow-sm transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    {processingApproval ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                        Homologando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Sim, Homologar Atendimento
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL DE PRÉ-VISUALIZAÇÃO DA FOLHA DE ATENDIMENTO (PMOC) */}
      {previewApprovalRecord && (() => {
        const previewAddress = addresses.find(a => a.id === previewApprovalRecord.addressId);
        const previewClient = previewAddress ? clients.find(c => c.id === previewAddress.clientId) : null;
        const previewEquips = equipments.filter(eq => eq && eq.addressId === previewApprovalRecord.addressId && eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated);

        return (
          <PMOCDocumentViewerModal
            record={previewApprovalRecord}
            address={previewAddress}
            client={previewClient}
            equipments={previewEquips}
            serviceOrderSettings={serviceOrderSettings}
            onClose={() => setPreviewApprovalRecord(null)}
            onPrint={() => {
              setIsPrintingBlank(false);
              setPrintPhotosOption(true);
              setPrintGeneralNotesOption(true);
              setIsPrintingChecklist(previewApprovalRecord);
              setTimeout(() => window.print(), 400);
            }}
            onHomologate={(rec) => {
              setPreviewApprovalRecord(null);
              setRecordToHomologate(rec);
            }}
          />
        );
      })()}

      {/* MODAL DE CONFIRMAÇÃO PARA EXCLUIR/DESATIVAR MÁQUINA */}
      {equipmentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header com destaque */}
            <div className="bg-gradient-to-r from-red-600 to-rose-700 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
                  <Trash2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">Desativar Equipamento</h3>
                  <p className="text-xs text-red-100 font-medium">Remoção do endereço com histórico preservado</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !deletingEquipmentLoading && setEquipmentToDelete(null)}
                disabled={deletingEquipmentLoading}
                className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo com resumo do equipamento */}
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200/80 rounded-2xl p-4">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-950 leading-relaxed font-medium">
                  <p className="font-bold mb-1 text-amber-950">Segurança de Dados e Auditoria</p>
                  Ao confirmar, esta máquina será <strong>desvinculada deste endereço</strong> e marcada como <strong>desativada</strong>. Ela <strong>NÃO</strong> é apagada permanentemente: todos os dados cadastrais, histórico de atendimentos e manutenções anteriores permanecem salvos no banco de dados para consultas e auditorias.
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2.5 text-xs">
                <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                  <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Patrimônio / Etiqueta:</span>
                  <span className="font-mono font-black text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {equipmentToDelete.equipment.label || '-'}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                  <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Setor / Local:</span>
                  <span className="font-semibold text-slate-700">
                    {equipmentToDelete.equipment.sector || 'Geral'}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                  <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Tipo & Marca:</span>
                  <span className="font-bold text-slate-800">
                    {equipmentToDelete.equipment.name} - {equipmentToDelete.equipment.brand || 'Sem marca'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Capacidade:</span>
                  <span className="font-extrabold text-slate-700">
                    {formatBtus(equipmentToDelete.equipment.btus)} BTUs
                  </span>
                </div>
              </div>
            </div>

            {/* Footer com botões */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEquipmentToDelete(null)}
                disabled={deletingEquipmentLoading}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteEquipment}
                disabled={deletingEquipmentLoading}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl shadow-xs hover:shadow-sm transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {deletingEquipmentLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                    Desativando...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Sim, Desativar Máquina
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE MÁQUINA */}
      {equipmentToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
                  <Pencil className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">Editar Dados da Máquina</h3>
                  <p className="text-xs text-blue-100 font-medium">Altere tipo/nome, setor, marca e potência diretamente</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !savingEquipmentEditLoading && setEquipmentToEdit(null)}
                disabled={savingEquipmentEditLoading}
                className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Tipo / Nome */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider">
                    Tipo / Nome do Equipamento*
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={['Split', 'Cassete', 'Piso Teto', 'ACJ', 'Chiller', 'Self Contained', 'Multi Split', 'Fancoil', 'VRF'].includes(editEqName) ? editEqName : 'Outro'}
                      onChange={(e) => {
                        if (e.target.value !== 'Outro') {
                          setEditEqName(e.target.value);
                        }
                      }}
                      className="w-1/2 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800"
                    >
                      <option value="Split">Split</option>
                      <option value="Cassete">Cassete</option>
                      <option value="Piso Teto">Piso Teto</option>
                      <option value="ACJ">ACJ</option>
                      <option value="Chiller">Chiller</option>
                      <option value="Self Contained">Self Contained</option>
                      <option value="Multi Split">Multi Split</option>
                      <option value="Fancoil">Fancoil</option>
                      <option value="VRF">VRF</option>
                      <option value="Outro">Outro (Personalizado)</option>
                    </select>
                    <input
                      type="text"
                      value={editEqName}
                      onChange={(e) => setEditEqName(e.target.value)}
                      placeholder="Ex: Split, Cassete, VRF..."
                      className="w-1/2 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800"
                    />
                  </div>
                </div>

                {/* Setor / Local */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider">
                    Setor / Localização
                  </label>
                  <input
                    type="text"
                    value={editEqSector}
                    onChange={(e) => setEditEqSector(e.target.value)}
                    placeholder="Ex: SALA 3, Recepção..."
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800"
                  />
                </div>

                {/* Etiqueta / Patrimônio */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider">
                    Etiqueta / Patrimônio
                  </label>
                  <input
                    type="text"
                    value={editEqLabel}
                    onChange={(e) => setEditEqLabel(e.target.value)}
                    placeholder="Ex: 1, 0014..."
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800 font-mono"
                  />
                </div>

                {/* Marca */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider">
                    Marca
                  </label>
                  <input
                    type="text"
                    value={editEqBrand}
                    onChange={(e) => setEditEqBrand(e.target.value)}
                    placeholder="Ex: Agratto, Carrier, Midea..."
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800"
                  />
                </div>

                {/* Potência / BTUs */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider">
                    Potência / BTUs
                  </label>
                  <input
                    type="text"
                    value={editEqBtus}
                    onChange={(e) => setEditEqBtus(e.target.value)}
                    placeholder="Ex: 12000, 24.000 BTUS..."
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEquipmentToEdit(null)}
                disabled={savingEquipmentEditLoading}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEditEquipment}
                disabled={savingEquipmentEditLoading}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-xs hover:shadow-sm transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {savingEquipmentEditLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Salvar Alterações
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN PHOTO LIGHTBOX MODAL */}
      {previewPhotoModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col justify-between p-3 sm:p-5 select-none animate-in fade-in duration-200"
          onClick={() => setPreviewPhotoModal(null)}
        >
          {/* Top Bar with Info and Actions */}
          <div 
            className="flex items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl px-4 py-3 shadow-2xl shrink-0 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {previewPhotoModal.label && (
                <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-xl text-[11px] font-black tracking-wider uppercase shrink-0">
                  Etiqueta: {previewPhotoModal.label}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-white font-black text-sm sm:text-base leading-tight truncate">
                  {previewPhotoModal.title || 'Foto do Equipamento'}
                </h3>
                {previewPhotoModal.subtitle && (
                  <p className="text-slate-300 text-xs truncate mt-0.5 font-medium">
                    {previewPhotoModal.subtitle}
                  </p>
                )}
                {previewPhotoModal.notes && (
                  <p className="text-amber-300/90 text-xs italic mt-0.5 truncate">
                    Obs: {previewPhotoModal.notes}
                  </p>
                )}
              </div>
            </div>

            {/* Controls Toolbar */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Zoom Out */}
              <button
                type="button"
                onClick={() => setPreviewZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                disabled={previewZoom <= 0.5}
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
                title="Diminuir Zoom (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              {/* Reset Zoom Indicator */}
              <button
                type="button"
                onClick={() => {
                  setPreviewZoom(1);
                  setPreviewRotation(0);
                }}
                className="px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer"
                title="Redefinir Zoom e Rotação"
              >
                {Math.round(previewZoom * 100)}%
              </button>

              {/* Zoom In */}
              <button
                type="button"
                onClick={() => setPreviewZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
                disabled={previewZoom >= 4}
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
                title="Aumentar Zoom (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              {/* Rotate */}
              <button
                type="button"
                onClick={() => setPreviewRotation((r) => (r + 90) % 360)}
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                title="Girar Foto (90°)"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Download */}
              <button
                type="button"
                onClick={() => {
                  try {
                    const link = document.createElement('a');
                    link.href = previewPhotoModal.src;
                    link.download = `foto-${(previewPhotoModal.label || 'equipamento').toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  } catch (e) {
                    console.error("Erro ao baixar imagem:", e);
                  }
                }}
                className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                title="Baixar Foto"
              >
                <Download className="w-4 h-4" />
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setPreviewPhotoModal(null)}
                className="p-2 text-white bg-rose-600/90 hover:bg-rose-600 rounded-xl transition-all ml-1 sm:ml-2 shadow-md cursor-pointer"
                title="Fechar (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Central Image Canvas / Viewer */}
          <div 
            className="flex-1 overflow-auto flex items-center justify-center p-2 min-h-0 relative my-2"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setPreviewPhotoModal(null);
              }
            }}
          >
            <img
              src={previewPhotoModal.src}
              alt={previewPhotoModal.title || 'Foto Ampliada'}
              onClick={(e) => {
                e.stopPropagation();
                setPreviewZoom((z) => (z === 1 ? 1.75 : z > 1 ? 1 : 1.75));
              }}
              style={{
                transform: `scale(${previewZoom}) rotate(${previewRotation}deg)`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out'
              }}
              className="max-h-[78vh] max-w-[92vw] object-contain rounded-2xl shadow-2xl cursor-zoom-in active:cursor-grabbing border border-slate-800/60 select-none"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Bottom Hint */}
          <div 
            className="flex items-center justify-between text-[11px] text-slate-400 px-4 py-1.5 bg-slate-900/60 border border-slate-800/80 rounded-xl shrink-0 backdrop-blur-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <span>Dica: Clique na foto para alternar o zoom ou use a roda do mouse / botões no topo.</span>
            <span className="hidden sm:inline font-mono text-slate-500">Pressione ESC para fechar</span>
          </div>
        </div>
      )}

      {/* PRINT-ONLY CHECKLIST / SERVICE SHEET */}
      {isPrintingChecklist && (() => {
        const printAddress = addresses.find(a => a.id === isPrintingChecklist.addressId);
        const printClient = printAddress ? clients.find(c => c.id === printAddress.clientId) : null;
        const printClientName = printClient?.fullName || printClient?.name || 'Cliente';
        const printAddressStreet = printAddress?.street || 'Endereço não definido';
        
        // Helpers for cycle reference
        const getMonthAbbr = (monthStr: string) => {
          const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
          try {
            const parts = monthStr.split('-');
            const mIndex = parseInt(parts[1], 10) - 1;
            if (mIndex >= 0 && mIndex < 12) {
              return `${months[mIndex]}/${parts[0]}`;
            }
          } catch (e) {}
          return monthStr;
        };

        const formatDateBRL = (dateStr?: string) => {
          if (!dateStr) return '';
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
          }
          return dateStr;
        };

        const getFormattedCycleStr = () => {
          const rawCycle = printClient?.contractCycle || isPrintingChecklist.cycle || 1;
          const num = String(rawCycle).padStart(3, '0');
          const format = printClient?.cycleRefFormat || 'number_only';
          
          const start = formatDateBRL(printClient?.cycleStartDate);
          const end = formatDateBRL(printClient?.cycleEndDate);
          const abbr = getMonthAbbr(isPrintingChecklist.month);
          
          if (format === 'full_period' && start && end) {
            return `${num} - ${start} a ${end} (${abbr})`;
          }
          if (format === 'number_month') {
            return `${num} - ${abbr}`;
          }
          if (format === 'period_only' && start && end) {
            return `${start} a ${end} (${abbr})`;
          }
          return num;
        };

        const formattedCycle = getFormattedCycleStr();

        const getFormattedCycleParts = () => {
          const rawCycle = printClient?.contractCycle || isPrintingChecklist.cycle || 1;
          const num = String(rawCycle).padStart(3, '0');
          const format = printClient?.cycleRefFormat || 'number_only';
          
          const start = formatDateBRL(printClient?.cycleStartDate);
          const end = formatDateBRL(printClient?.cycleEndDate);
          const abbr = getMonthAbbr(isPrintingChecklist.month);
          
          if (format === 'full_period' && start && end) {
            return { num, period: `${start} a ${end} (${abbr})` };
          }
          if (format === 'number_month') {
            return { num, period: abbr };
          }
          if (format === 'period_only' && start && end) {
            return { num: '', period: `${start} a ${end} (${abbr})` };
          }
          return { num, period: '' };
        };

        const cycleParts = getFormattedCycleParts();
        
        const uniqueDatesSet = new Set<string>();
        if (isPrintingChecklist && isPrintingChecklist.checklist) {
          isPrintingChecklist.checklist.forEach(item => {
            if (item && item.checkedAt) {
              try {
                const dateStr = formatDateSafe(item.checkedAt, 'dd/MM/yyyy');
                if (dateStr) uniqueDatesSet.add(dateStr);
              } catch (e) {}
            }
          });
        }
        if (uniqueDatesSet.size === 0 && isPrintingChecklist.executionDate) {
          uniqueDatesSet.add(formatDateSafe(isPrintingChecklist.executionDate, 'dd/MM/yyyy'));
        }
        const uniquePrintDates = Array.from(uniqueDatesSet).sort();
        const printDatesText = uniquePrintDates.length > 0 ? uniquePrintDates.join(', ') : format(new Date(), 'dd/MM/yyyy');
        
        const printCompanyKey = printClient?.serviceCompany || (isPrintingChecklist as any)?.serviceCompany || 'lefrio';
        const cachedCompany = getCompanyConfigFromCache(printCompanyKey);
        const anyCompanyWithLogo = serviceOrderSettings?.companies?.find((c: any) => Boolean(c.logoUrl));
        const effectiveCompanyConfig = cachedCompany || anyCompanyWithLogo || serviceOrderSettings?.companies?.[0];
        const baseCompany = COMPANIES_INFO[printCompanyKey] || COMPANIES_INFO.lefrio;
        const resolvedLogoUrl = effectiveCompanyConfig?.logoUrl || cachedCompany?.logoUrl || anyCompanyWithLogo?.logoUrl;
        const printCompany = {
          ...baseCompany,
          name: effectiveCompanyConfig?.fullName || effectiveCompanyConfig?.shortName || baseCompany.name,
          shortName: effectiveCompanyConfig?.shortName || baseCompany.shortName,
          cnpj: effectiveCompanyConfig?.cnpj || baseCompany.cnpj,
          address: effectiveCompanyConfig?.address || baseCompany.address,
          email: effectiveCompanyConfig?.email || baseCompany.email,
          phone: effectiveCompanyConfig?.phone || baseCompany.phone,
          logoUrl: resolvedLogoUrl
        };

        const headerBgColor = printCompanyKey === 'lefrio' ? '#9cbdde' : '#90EE90';

        return (
          <div className="hidden print:block p-8 print:p-0 font-sans text-xs text-black space-y-4 leading-tight bg-white print:bg-white preventive-print-wrapper" style={{ fontFamily: 'Arial, sans-serif' }}>
            {/* Regras de Impressão e Margem de Quebra de Página */}
            <style>{`
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 12mm 10mm 12mm 10mm !important;
                }
                .preventive-print-wrapper {
                  padding: 0 !important;
                  margin: 0 !important;
                  width: 100% !important;
                }
                .preventive-print-table {
                  width: 100% !important;
                  border-collapse: collapse !important;
                }
                .preventive-print-table thead {
                  display: table-row-group !important;
                }
                .preventive-print-table tr {
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                }
              }
            `}</style>

            {/* Header */}
            <div className="flex justify-between items-start border-b border-black pb-2 mb-4">
              <div className="flex items-center gap-4">
                 <CompanyLogo 
                   companyId={printCompanyKey} 
                   logoUrl={printCompany.logoUrl} 
                   className="w-24 h-16 max-w-[120px] max-h-[64px]" 
                   alt={printCompany.name} 
                 />
                 <div>
                   <h1 className="text-[11px] font-bold uppercase leading-tight">{printCompany.name}</h1>
                   <p className="text-[9px] leading-tight">CNPJ: {printCompany.cnpj}</p>
                   <p className="text-[9px] leading-tight">Endereço: {printCompany.address}</p>
                   <p className="text-[9px] leading-tight">E-mail: {printCompany.email} - Telefone: {printCompany.phone}</p>
                 </div>
              </div>
              <div className="text-right flex flex-col items-end">
                 <p className="text-[9px]">Página: 1 de 1</p>
                 <p className="text-[9px]">Mês: {isPrintingChecklist.month}</p>
              </div>
            </div>

            <h2 className="text-center font-bold text-sm mb-2.5 uppercase">RELATÓRIO DE MANUTENÇÃO PREVENTIVA MENSAL (Conforme PMOC)</h2>

            {/* Fields Box */}
            <div 
              className={cn("preventive-fields-box pmoc-fields-box border-2 border-black text-[8pt] font-bold mb-2.5 py-1 pl-2.5 pr-1 select-none font-['Arial',_sans-serif]", printCompanyKey === 'lefrio' ? 'bg-[#9cbdde] text-black' : 'bg-[#90EE90] text-black')}
              style={{
                backgroundColor: headerBgColor,
                color: '#000000',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact'
              }}
            >
              {/* Linha 1 */}
              <div className="flex justify-between items-start gap-4 mb-0.5" style={{ backgroundColor: 'transparent' }}>
                <div className="font-bold uppercase flex-1 min-w-0 truncate" style={{ backgroundColor: 'transparent', textShadow: 'none', border: 'none' }}>
                  Cliente: {printClientName}
                </div>
                <div className="font-bold uppercase text-right whitespace-nowrap shrink-0 text-[7.2pt] tracking-tighter" style={{ backgroundColor: 'transparent', textShadow: 'none', border: 'none' }}>
                  Contrato: {printClient?.contractNumber || 'S/N'}
                </div>
              </div>
              
              {/* Linha 2 */}
              <div className="flex justify-between items-end gap-4" style={{ backgroundColor: 'transparent' }}>
                <div className="uppercase font-bold leading-tight text-left flex-1 min-w-0 text-[7.5pt]" style={{ backgroundColor: 'transparent', textShadow: 'none', border: 'none' }}>
                  {printAddressStreet}{printAddress?.cep?.trim() ? ` - ${printAddress.cep.trim().toUpperCase().startsWith('CEP') ? printAddress.cep.trim() : `CEP: ${printAddress.cep.trim()}`}` : ''}
                </div>
                <div className="font-bold uppercase text-right whitespace-nowrap shrink-0 text-[7.2pt] tracking-tighter" style={{ backgroundColor: 'transparent', textShadow: 'none', border: 'none' }}>
                  Ciclo: {formattedCycle}
                </div>
              </div>
            </div>

            {/* Checklist Table */}
            <table className="w-full text-left border-collapse border border-black text-[9px] preventive-print-table" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
              <thead style={{ display: 'table-row-group', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                <tr 
                  className={cn("font-bold border-b border-black", printCompanyKey === 'lefrio' ? 'bg-[#9cbdde] text-black' : 'bg-[#90EE90] text-black')}
                  style={{
                    backgroundColor: headerBgColor,
                    color: '#000000',
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact'
                  }}
                >
                  <th className="p-1 border-r border-black text-center w-8" style={{ backgroundColor: headerBgColor, color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>Item</th>
                  <th className="p-1 border-r border-black w-40" style={{ backgroundColor: headerBgColor, color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>Setor</th>
                  <th className="p-1 border-r border-black w-20" style={{ backgroundColor: headerBgColor, color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>Equipamento</th>
                  <th className="p-1 border-r border-black w-16" style={{ backgroundColor: headerBgColor, color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>Marca</th>
                  <th className="p-1 border-r border-black w-14 text-center" style={{ backgroundColor: headerBgColor, color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>BTUs</th>
                  <th className="p-1 border-r border-black w-16 text-center" style={{ backgroundColor: headerBgColor, color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>ID/Etiqueta</th>
                  <th className="p-1 border-r border-black w-32" style={{ backgroundColor: headerBgColor, color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>Visto do Técnico</th>
                  <th className="p-1 w-24" style={{ backgroundColor: headerBgColor, color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>Obs.</th>
                </tr>
                <tr className="bg-transparent font-bold border-b border-black">
                  <td colSpan={8} className="p-1 text-center" style={{ backgroundColor: 'transparent', textShadow: 'none' }}>{printClientName}</td>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/80">
              {(() => {
                const map = new Map<string, Equipment>();
                equipments
                  .filter(eq => eq && eq.addressId === isPrintingChecklist.addressId && eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated)
                  .forEach(eq => { if (eq?.id && !map.has(eq.id)) map.set(eq.id, eq); });
                return Array.from(map.values())
                  .sort((a, b) => (a.label || '').localeCompare(b.label || '', undefined, { numeric: true, sensitivity: 'base' }))
                  .map((eq, index) => {
                  const existingChecklist = isPrintingChecklist.checklist || [];
                  const found = existingChecklist.find(item => item && item.equipmentId === eq.id);
                  const isChecked = found ? found.checked : false;
                  const isSkipped = found ? found.skipped : false;
                  const obsValue = isPrintingBlank ? '' : (found ? found.notes : '');
                  
                  let statusText = '';
                  const itemDate = found?.checkedAt 
                    ? formatDateSafe(found.checkedAt, 'dd/MM/yyyy') 
                    : (isPrintingChecklist.executionDate ? formatDateSafe(isPrintingChecklist.executionDate, 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy'));
                  
                  if (!isPrintingBlank) {
                    if (isChecked && !isSkipped) {
                      let timeText = '';
                      if (found?.checkedAt) {
                        try {
                          timeText = ' ' + formatDateSafe(found.checkedAt, 'HH:mm');
                        } catch (e) {
                          if (found.checkedAt.includes('T')) {
                            const parts = found.checkedAt.split('T')[1];
                            if (parts) {
                              timeText = ' ' + parts.substring(0, 5);
                            }
                          }
                        }
                      }
                      statusText = `(APP: ${itemDate}${timeText} ${isPrintingChecklist.technician1 || 'Técnico'})`;
                    } else if (isSkipped) {
                      const hasJustification = found?.justification && found.justification.trim().length > 0;
                      statusText = hasJustification ? `PULADO EM ${itemDate}` : '';
                    }
                  }

                  return (
                    <tr key={eq.id} className="border-b border-black" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                      <td className="p-1 border-r border-black text-center">{eq.label || index + 1}</td>
                      <td className="p-1 border-r border-black uppercase">{eq.sector || '-'}</td>
                      <td className="p-1 border-r border-black uppercase">{eq.name || '-'}</td>
                      <td className="p-1 border-r border-black uppercase">{eq.brand || '-'}</td>
                      <td className="p-1 border-r border-black text-center">{formatBtus(eq.btus)}</td>
                      <td className="p-1 border-r border-black text-center">{eq.patrimony || eq.id.slice(0,6)}</td>
                      <td className="p-1 border-r border-black text-[8px] uppercase font-normal">{statusText}</td>
                      <td className="p-1 text-[8px]">{obsValue || '-'}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>

          {/* Route general notes */}
          {printGeneralNotesOption && (
            isPrintingBlank ? (
              <div className="border border-black p-2 mt-4 text-[9px] h-14">
                <span className="font-bold uppercase">Observações do Cliente / Técnico:</span>
              </div>
            ) : (
              isPrintingChecklist.routeNotes && (
                <div className="border border-black p-2 mt-4 text-[9px]">
                  <span className="font-bold uppercase">Obs Geral: </span>
                  {isPrintingChecklist.routeNotes}
                </div>
              )
            )
          )}

          {/* Signatures */}
          <div className="mt-12 flex justify-between items-end pt-4 gap-8 mb-4" style={{ pageBreakInside: 'avoid' }}>
             {isPrintingBlank ? (
               <>
                 <div className="flex flex-col items-center justify-end w-1/2 text-center">
                   <div className="h-12 w-full border-b border-black" />
                   <span className="font-bold uppercase text-[10px] mt-1">Assinatura do Técnico Responsável</span>
                   <span className="text-[8px] text-gray-500 mt-1">Nome Legível / CPF</span>
                 </div>
                 
                 <div className="flex flex-col items-center justify-end w-1/2 text-center">
                   <div className="h-12 w-full border-b border-black" />
                   <span className="font-bold uppercase text-[10px] mt-1">Assinatura do Responsável do Cliente</span>
                   <span className="text-[8px] text-gray-500 mt-1">Nome Legível / RG / Cargo</span>
                 </div>
               </>
             ) : (
               <>
                 <div className="text-[10px] w-1/2 flex flex-col justify-end items-start text-left">
                    <p className="font-bold uppercase text-[10px] text-emerald-850">Equipe Técnica Autenticada</p>
                    <p className="font-medium mt-1">
                      {isPrintingChecklist.technician1 || '-'}
                      {isPrintingChecklist.technician2 ? ` / ${isPrintingChecklist.technician2}` : ''}
                    </p>
                    <p className="text-[8px] text-gray-500 mt-1">Autenticado via App em {printDatesText}</p>
                 </div>

                 <div className="flex flex-col items-center justify-end w-1/2 text-center">
                    {isPrintingChecklist.clientSignature ? (
                      <img 
                        src={isPrintingChecklist.clientSignature} 
                        alt="Assinatura Representante" 
                        className="h-12 object-contain border-b border-black pb-1 w-full"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-12 w-full border-b border-black" />
                    )}
                    <span className="font-bold uppercase text-[10px] mt-1">Assinatura do Responsável do Cliente</span>
                    <span className="text-[11px] font-bold text-gray-900 mt-1">
                      {isPrintingChecklist.clientSigneeName || '-'}
                      {isPrintingChecklist.clientSigneeRegistration ? " (Matrícula: " + isPrintingChecklist.clientSigneeRegistration + ")" : ""}
                    </span>
                    {(() => {
                      const { clientSignatureDate: pSig } = getRecordTimestamps(isPrintingChecklist);
                      if (pSig && (pSig.includes('T') || pSig.includes(':'))) {
                        return (
                          <p className="text-[8px] text-gray-500 mt-0.5">
                            Assinado digitalmente em {formatDateSafe(pSig, 'dd/MM/yyyy')} às {formatDateSafe(pSig, 'HH:mm:ss')}
                          </p>
                        );
                      }
                      return null;
                    })()}
                 </div>
               </>
             )}
          </div>

          {/* Photo Attachment Report */}
          {printPhotosOption && !isPrintingBlank && (() => {
            const existingChecklist = isPrintingChecklist.checklist || [];
            const equipsWithPhotos = equipments
              .filter(eq => eq.addressId === isPrintingChecklist.addressId)
              .map(eq => {
                const found = existingChecklist.find(item => item && item.equipmentId === eq.id);
                const photos = found ? (found.photos || []).filter(p => p && p.trim() !== "") : [];
                return { eq, photos };
              })
              .filter(item => item.photos.length > 0);

            if (equipsWithPhotos.length === 0) return null;

            return (
              <div className="pt-8 border-t border-black mt-8" style={{ pageBreakBefore: 'always' }}>
                <h3 className="text-center font-bold text-xs uppercase mb-4">ANEXO FOTOGRÁFICO DO ATENDIMENTO</h3>
                <div className="grid grid-cols-2 gap-4">
                  {equipsWithPhotos.map(({ eq, photos }) => (
                    <div key={eq.id} className="border border-black p-2 rounded-md flex flex-col gap-2 bg-white" style={{ pageBreakInside: 'avoid' }}>
                      <span className="font-bold text-[9px] uppercase block border-b border-black pb-1">
                        {eq.label || eq.name} - {eq.sector || 'Sem setor'} ({eq.brand || 'Sem marca'}{eq.btus ? ` - ${formatBtus(eq.btus)} BTUs` : ''})
                      </span>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {photos.map((photo, pIdx) => (
                          <div key={pIdx} className="w-full flex justify-center border border-gray-300 rounded overflow-hidden bg-gray-50 h-32">
                            <img 
                              src={photo} 
                              alt={`Foto ${pIdx + 1} - ${eq.name}`} 
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      );
    })()}

    </>
  );
}
