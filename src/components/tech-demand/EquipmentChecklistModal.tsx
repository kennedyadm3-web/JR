import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FileText, 
  ChevronLeft, 
  CheckCircle2, 
  CloudOff, 
  AlertCircle, 
  Clock, 
  ClipboardCheck, 
  Plus, 
  X, 
  Camera, 
  Trash2, 
  ImageIcon, 
  Check, 
  CheckCheck, 
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Search,
  CheckSquare,
  Square,
  PenTool,
  AlertTriangle,
  ListChecks,
  SlidersHorizontal,
  Zap,
  MapPin,
  Tag
} from 'lucide-react';
import { SignaturePadModal } from './SignaturePadModal';
import { dataService } from '../../services/dataService';
import { 
  MaintenanceRecord, 
  Address, 
  Client, 
  Technician, 
  Equipment, 
  EquipmentChecklistItem, 
  DeviceSettings, 
  MaintenanceStatus 
} from '../../types';
import { format, parseISO } from 'date-fns';
import { cn } from '../../lib/utils';

export interface EquipmentChecklistModalProps {
  activeChecklistRecord: MaintenanceRecord | null;
  onClose: () => void;
  addresses: Address[];
  clients: Client[];
  equipments: Equipment[];
  techs: Technician[];
  deviceSettings: DeviceSettings | null;
  isOnline: boolean;
  selectedTech?: string;
  authTech?: Technician | null;
  isTabletMode?: boolean;
  onRecordUpdated?: (record: MaintenanceRecord) => void;
}

const DEFAULT_CHECKLIST_TASKS = [
  "Limpeza dos filtros de ar",
  "Verificação do dreno e dreno de bandeja",
  "Verificação de ruídos e vibrações",
  "Verificação da carga de fluido refrigerante",
  "Medição de corrente e tensão elétrica",
  "Reaperto das conexões elétricas",
  "Limpeza das serpentinas (evaporadora/condensadora)"
];

const formatDateSafe = (dateStr: string | null | undefined, formatStr: string = 'dd/MM/yyyy'): string => {
  if (!dateStr) return '';
  if ((formatStr.includes('HH') || formatStr.includes('mm')) && !dateStr.includes('T') && !dateStr.includes(' ') && !dateStr.includes(':')) {
    return '';
  }
  try {
    const parsed = parseISO(dateStr);
    if (isNaN(parsed.getTime())) {
      const fallbackDate = new Date(dateStr);
      if (isNaN(fallbackDate.getTime())) return dateStr || '';
      return format(fallbackDate, formatStr);
    }
    return format(parsed, formatStr);
  } catch {
    return dateStr || '';
  }
};

const formatBtus = (btus?: number | string) => {
  if (!btus) return '-';
  const num = typeof btus === 'string' ? parseInt(btus.replace(/\D/g, ''), 10) : btus;
  if (isNaN(num)) return String(btus);
  // Se foi cadastrado em milhares abreviados (ex: 9, 12, 18, 24, 30, 36, 48, 60)
  const fullNum = num > 0 && num < 100 ? num * 1000 : num;
  return fullNum.toLocaleString('pt-BR');
};

export function EquipmentChecklistModal({
  activeChecklistRecord,
  onClose,
  addresses,
  clients,
  equipments,
  techs,
  deviceSettings,
  isOnline,
  selectedTech = '',
  authTech = null,
  isTabletMode = false,
  onRecordUpdated
}: EquipmentChecklistModalProps) {
  if (!activeChecklistRecord) return null;

  const modalAddress = addresses.find(addr => addr && addr.id === activeChecklistRecord.addressId);
  const modalClient = modalAddress ? clients.find(c => c && c.id === modalAddress.clientId) : null;
  const isRecordCompleted = activeChecklistRecord.status === MaintenanceStatus.COMPLETED || activeChecklistRecord.status === MaintenanceStatus.PRE_COMPLETED;

  // Lista padrão de tarefas de checklist da preventiva (do cliente ou padrão PMOC)
  const clientChecklist: string[] = useMemo(() => {
    if (modalClient?.preventiveChecklist && Array.isArray(modalClient.preventiveChecklist) && modalClient.preventiveChecklist.length > 0) {
      return modalClient.preventiveChecklist;
    }
    return DEFAULT_CHECKLIST_TASKS;
  }, [modalClient]);

  // Busca interna de contingência caso os equipamentos ainda não tenham chegado pelas props
  const [internalEquips, setInternalEquips] = useState<Equipment[]>([]);
  const [loadingInternalEquips, setLoadingInternalEquips] = useState(false);

  useEffect(() => {
    if (activeChecklistRecord?.addressId) {
      const hasInProps = equipments.some(eq => eq && eq.addressId === activeChecklistRecord.addressId);
      if (!hasInProps) {
        setLoadingInternalEquips(true);
        dataService.getEquipments(activeChecklistRecord.addressId)
          .then(items => {
            if (items && items.length > 0) {
              setInternalEquips(items);
            }
          })
          .catch(err => console.warn('Erro ao carregar equipamentos internamente no modal:', err))
          .finally(() => setLoadingInternalEquips(false));
      }
    }
  }, [activeChecklistRecord?.addressId, equipments]);

  // Lista consolidada de equipamentos ativos deste endereço
  const addressEquips = useMemo(() => {
    const map = new Map<string, Equipment>();
    equipments.forEach(eq => { if (eq?.id) map.set(eq.id, eq); });
    internalEquips.forEach(eq => { if (eq?.id && !map.has(eq.id)) map.set(eq.id, eq); });

    return Array.from(map.values())
      .filter(eq => eq && eq.addressId === activeChecklistRecord.addressId && eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated)
      .sort((a, b) => {
        const labelA = a.label || '';
        const labelB = b.label || '';
        return labelA.localeCompare(labelB, undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [equipments, internalEquips, activeChecklistRecord.addressId]);

  // Estado inicial sincronizado do checklist com respostas individuais para cada tarefa
  const [modalChecklist, setModalChecklist] = useState<EquipmentChecklistItem[]>(() => {
    const existing = activeChecklistRecord.checklist || [];
    return addressEquips.map(eq => {
      const found = existing.find(item => item && item.equipmentId === eq.id);
      const savedAnswers = (found?.checklistAnswers && typeof found.checklistAnswers === 'object') ? found.checklistAnswers : {};
      
      const checklistAnswers: Record<string, boolean> = {};
      clientChecklist.forEach(task => {
        if (savedAnswers[task] !== undefined) {
          checklistAnswers[task] = !!savedAnswers[task];
        } else if (found?.checked) {
          checklistAnswers[task] = true;
        } else {
          checklistAnswers[task] = false;
        }
      });

      return {
        equipmentId: eq.id,
        checked: found ? !!found.checked : false,
        notes: found?.notes || '',
        skipped: found ? !!found.skipped : false,
        justification: found?.justification || '',
        requestedRemoval: found ? !!found.requestedRemoval : false,
        removalReason: found?.removalReason,
        requestedRemovalAt: found?.requestedRemovalAt,
        checklistAnswers,
        photos: found?.photos || [],
        checkedAt: found?.checkedAt
      };
    });
  });

  // Sincroniza reativamente modalChecklist quando os equipamentos forem carregados assincronamente
  useEffect(() => {
    if (!addressEquips || addressEquips.length === 0) return;

    setModalChecklist(prev => {
      const existingMap = new Map(prev.map(item => [item.equipmentId, item]));
      const recordExisting = activeChecklistRecord.checklist || [];

      // Se todas as máquinas já estão presentes no checklist, não altera
      const allPresent = addressEquips.every(eq => existingMap.has(eq.id));
      if (allPresent && prev.length === addressEquips.length) return prev;

      return addressEquips.map(eq => {
        if (existingMap.has(eq.id)) {
          return existingMap.get(eq.id)!;
        }

        const found = recordExisting.find(item => item && item.equipmentId === eq.id);
        const savedAnswers = (found?.checklistAnswers && typeof found.checklistAnswers === 'object') ? found.checklistAnswers : {};
        
        const checklistAnswers: Record<string, boolean> = {};
        clientChecklist.forEach(task => {
          if (savedAnswers[task] !== undefined) {
            checklistAnswers[task] = !!savedAnswers[task];
          } else if (found?.checked) {
            checklistAnswers[task] = true;
          } else {
            checklistAnswers[task] = false;
          }
        });

        return {
          equipmentId: eq.id,
          checked: found ? !!found.checked : false,
          notes: found?.notes || '',
          skipped: found ? !!found.skipped : false,
          justification: found?.justification || '',
          requestedRemoval: found ? !!found.requestedRemoval : false,
          removalReason: found?.removalReason,
          requestedRemovalAt: found?.requestedRemovalAt,
          checklistAnswers,
          photos: found?.photos || [],
          checkedAt: found?.checkedAt
        };
      });
    });
  }, [addressEquips, clientChecklist, activeChecklistRecord.checklist]);

  const [techSignature, setTechSignature] = useState(activeChecklistRecord.techSignature || '');
  const [clientSignature, setClientSignature] = useState(activeChecklistRecord.clientSignature || '');
  const [clientSignatureDate, setClientSignatureDate] = useState(activeChecklistRecord.clientSignatureDate || '');
  const [clientSigneeName, setClientSigneeName] = useState(activeChecklistRecord.clientSigneeName || '');
  const [clientSigneeRegistration, setClientSigneeRegistration] = useState(activeChecklistRecord.clientSigneeRegistration || '');
  const [routeNotes, setRouteNotes] = useState(activeChecklistRecord.routeNotes || '');

  // Controle de expansão dos cards (recolhidos por padrão para máxima compacidade e organização em telas móveis)
  const [expandedEqIds, setExpandedEqIds] = useState<Set<string>>(() => new Set());

  // Filtros de busca e status na lista de equipamentos
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'attended' | 'skipped'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [checklistValidationError, setChecklistValidationError] = useState<string | null>(null);
  const [validationAttempted, setValidationAttempted] = useState<boolean>(false);
  const [isFinalizing, setIsFinalizing] = useState<boolean>(false);
  const [criticalError, setCriticalError] = useState<string | null>(null);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);

  const validationAlertRef = useRef<HTMLDivElement>(null);
  const clientInfoRef = useRef<HTMLDivElement>(null);

  // Status de salvamento em tempo real
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'offline_saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savingEquipmentId, setSavingEquipmentId] = useState<string | null>(null);

  // Refs síncronos para garantir que operações em segundo plano acessem sempre os valores mais recentes
  const routeNotesRef = useRef(routeNotes);
  routeNotesRef.current = routeNotes;
  const clientSigneeNameRef = useRef(clientSigneeName);
  clientSigneeNameRef.current = clientSigneeName;
  const clientSigneeRegistrationRef = useRef(clientSigneeRegistration);
  clientSigneeRegistrationRef.current = clientSigneeRegistration;
  const clientSignatureRef = useRef(clientSignature);
  clientSignatureRef.current = clientSignature;
  const clientSignatureDateRef = useRef(clientSignatureDate);
  clientSignatureDateRef.current = clientSignatureDate;
  const techSignatureRef = useRef(techSignature);
  techSignatureRef.current = techSignature;
  const modalChecklistRef = useRef(modalChecklist);
  modalChecklistRef.current = modalChecklist;

  // Autosave contínuo e automático para campos de texto (Observações, Nome do Cliente, Matrícula/CPF e Assinaturas)
  const isInitialMount = useRef(true);
  const textDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (isRecordCompleted || isFinalizing) return;

    if (textDebounceTimerRef.current) {
      clearTimeout(textDebounceTimerRef.current);
    }

    setAutosaveStatus('saving');

    textDebounceTimerRef.current = setTimeout(async () => {
      try {
        const executedCount = modalChecklistRef.current.filter(it => it && it.checked && !it.skipped && !it.requestedRemoval).length;
        const updates: Partial<MaintenanceRecord> = {
          checklist: modalChecklistRef.current,
          executedQuantity: executedCount,
          routeNotes,
          clientSigneeName,
          clientSigneeRegistration,
          clientSignature,
          clientSignatureDate: clientSignatureDate || (clientSignature ? new Date().toISOString() : undefined),
          techSignature
        };

        await dataService.upsertRecord({
          ...activeChecklistRecord,
          ...updates
        });

        setAutosaveStatus(isOnline ? 'saved' : 'offline_saved');
        setLastSavedAt(new Date());
        if (onRecordUpdated) {
          onRecordUpdated({ ...activeChecklistRecord, ...updates });
        }
      } catch (err) {
        console.error('Erro no autosave contínuo dos dados gerais:', err);
        setAutosaveStatus('error');
      }
    }, 600);

    return () => {
      if (textDebounceTimerRef.current) {
        clearTimeout(textDebounceTimerRef.current);
      }
    };
  }, [routeNotes, clientSigneeName, clientSigneeRegistration, clientSignature, techSignature]);

  // Inclusão de nova máquina pelo técnico em campo
  const [isTechAddingEquipment, setIsTechAddingEquipment] = useState<boolean>(false);
  const [techNewEqLabel, setTechNewEqLabel] = useState('');
  const [techNewEqSector, setTechNewEqSector] = useState('');
  const [techNewEqName, setTechNewEqName] = useState('SPLIT');
  const [techNewEqBrand, setTechNewEqBrand] = useState('');
  const [techNewEqBtus, setTechNewEqBtus] = useState('12000');
  const [isSubmittingTechEq, setIsSubmittingTechEq] = useState(false);

  const addLog = (message: string) => {
    console.log(`[CHECKLIST_MODAL] ${message}`);
    setDiagnosticLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const toggleExpand = (eqId: string) => {
    setExpandedEqIds(prev => {
      const next = new Set(prev);
      if (next.has(eqId)) {
        next.delete(eqId);
      } else {
        next.add(eqId);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedEqIds(new Set(addressEquips.map(eq => eq.id)));
  };

  const handleCollapseAll = () => {
    setExpandedEqIds(new Set());
  };

  // Salvar item individual em tempo real com persistência imediata
  const saveChecklistItemRealtime = async (updatedItem: EquipmentChecklistItem) => {
    setSavingEquipmentId(updatedItem.equipmentId);
    setAutosaveStatus('saving');

    try {
      const nextChecklist = modalChecklistRef.current.map(it => {
        if (it && it.equipmentId === updatedItem.equipmentId) {
          return updatedItem;
        }
        return it;
      });

      if (!nextChecklist.some(it => it && it.equipmentId === updatedItem.equipmentId)) {
        nextChecklist.push(updatedItem);
      }
      setModalChecklist(nextChecklist);
      modalChecklistRef.current = nextChecklist;

      const executedCount = nextChecklist.filter(it => it && it.checked && !it.skipped && !it.requestedRemoval).length;
      const updates: Partial<MaintenanceRecord> = {
        checklist: nextChecklist,
        executedQuantity: executedCount,
        routeNotes: routeNotesRef.current,
        techSignature: techSignatureRef.current,
        clientSignature: clientSignatureRef.current,
        clientSignatureDate: clientSignatureDateRef.current || (clientSignatureRef.current ? new Date().toISOString() : undefined),
        clientSigneeName: clientSigneeNameRef.current,
        clientSigneeRegistration: clientSigneeRegistrationRef.current
      };

      await dataService.upsertRecord({
        ...activeChecklistRecord,
        ...updates
      });

      setAutosaveStatus(isOnline ? 'saved' : 'offline_saved');
      setLastSavedAt(new Date());
      if (onRecordUpdated) {
        onRecordUpdated({ ...activeChecklistRecord, ...updates });
      }
    } catch (e) {
      console.error('Erro no autosave do equipamento:', e);
      setAutosaveStatus('error');
    } finally {
      setSavingEquipmentId(null);
    }
  };

  // Alterna resposta de uma tarefa específica do checklist da máquina
  const handleToggleChecklistAnswer = (eqId: string, task: string) => {
    if (isRecordCompleted) return;
    const existing = modalChecklist.find(it => it.equipmentId === eqId);
    const nowISO = new Date().toISOString();

    const currentAnswers: Record<string, boolean> = { ...(existing?.checklistAnswers || {}) };
    const currentVal = !!currentAnswers[task];
    const newVal = !currentVal;
    currentAnswers[task] = newVal;

    // Se todas as tarefas do checklist forem marcadas como 'true', marca a máquina como Atendida
    const allChecked = clientChecklist.every(t => !!currentAnswers[t]);
    // Se pelo menos uma for marcada, considera em andamento / atendida
    const hasAnyChecked = clientChecklist.some(t => !!currentAnswers[t]);

    const updated: EquipmentChecklistItem = {
      equipmentId: eqId,
      checked: allChecked || hasAnyChecked,
      notes: existing?.notes || '',
      skipped: false,
      justification: '',
      requestedRemoval: existing?.requestedRemoval || false,
      removalReason: existing?.removalReason,
      requestedRemovalAt: existing?.requestedRemovalAt,
      checklistAnswers: currentAnswers,
      photos: existing?.photos || [],
      checkedAt: hasAnyChecked ? (existing?.checkedAt || nowISO) : undefined
    };

    saveChecklistItemRealtime(updated);
  };

  // Marca ou desmarca todas as tarefas do checklist de uma máquina
  const handleCheckAllTasks = (eqId: string, checkAll: boolean) => {
    if (isRecordCompleted) return;
    const existing = modalChecklist.find(it => it.equipmentId === eqId);
    const nowISO = new Date().toISOString();

    const nextAnswers: Record<string, boolean> = {};
    clientChecklist.forEach(task => {
      nextAnswers[task] = checkAll;
    });

    const updated: EquipmentChecklistItem = {
      equipmentId: eqId,
      checked: checkAll,
      notes: existing?.notes || '',
      skipped: false,
      justification: checkAll ? '' : (existing?.justification || ''),
      requestedRemoval: checkAll ? false : (existing?.requestedRemoval || false),
      removalReason: checkAll ? undefined : existing?.removalReason,
      requestedRemovalAt: checkAll ? undefined : existing?.requestedRemovalAt,
      checklistAnswers: nextAnswers,
      photos: existing?.photos || [],
      checkedAt: checkAll ? (existing?.checkedAt || nowISO) : undefined
    };

    saveChecklistItemRealtime(updated);
  };

  // Botão rápido para atender a máquina inteira (marca todos os itens)
  const handleToggleCheck = (eqId: string) => {
    if (isRecordCompleted) return;
    const existing = modalChecklist.find(it => it.equipmentId === eqId);
    const isCurrentlyChecked = existing ? !!existing.checked : false;

    // Se já estava atendida, desmarca; se não estava, marca todas as tarefas
    handleCheckAllTasks(eqId, !isCurrentlyChecked);
  };

  // Pular máquina com justificativa
  const handleToggleSkip = (eqId: string) => {
    if (isRecordCompleted) return;
    const existing = modalChecklist.find(it => it.equipmentId === eqId);
    const nowISO = new Date().toISOString();
    const willBeSkipped = !existing?.skipped;

    // Ao pular, desmarca tarefas
    const resetAnswers: Record<string, boolean> = {};
    clientChecklist.forEach(t => { resetAnswers[t] = false; });

    const updated: EquipmentChecklistItem = {
      equipmentId: eqId,
      checked: false,
      skipped: willBeSkipped,
      justification: willBeSkipped ? (existing?.justification || '') : '',
      notes: existing?.notes || '',
      requestedRemoval: false,
      checklistAnswers: resetAnswers,
      photos: existing?.photos || [],
      checkedAt: willBeSkipped ? nowISO : undefined
    };

    saveChecklistItemRealtime(updated);
    if (willBeSkipped) {
      setExpandedEqIds(prev => new Set(prev).add(eqId));
    }
  };

  const itemNotesDebounceRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Atualiza observação de uma máquina com debounce de salvamento
  const handleUpdateItemNotes = (eqId: string, notes: string) => {
    if (isRecordCompleted) return;
    const existing = modalChecklistRef.current.find(it => it.equipmentId === eqId);
    const updated: EquipmentChecklistItem = existing 
      ? { ...existing, notes }
      : { 
          equipmentId: eqId, 
          checked: false, 
          notes, 
          photos: [], 
          checklistAnswers: clientChecklist.reduce((acc, t) => ({ ...acc, [t]: false }), {}) 
        };

    // Atualiza estado local imediatamente para digitação fluida
    const nextList = modalChecklistRef.current.map(it => it.equipmentId === eqId ? updated : it);
    if (!nextList.some(it => it.equipmentId === eqId)) nextList.push(updated);
    setModalChecklist(nextList);
    modalChecklistRef.current = nextList;

    // Debounce na gravação persistente
    if (itemNotesDebounceRef.current[eqId]) {
      clearTimeout(itemNotesDebounceRef.current[eqId]);
    }
    setAutosaveStatus('saving');
    itemNotesDebounceRef.current[eqId] = setTimeout(() => {
      saveChecklistItemRealtime(updated);
    }, 600);
  };

  // Atualiza justificativa de pulo com debounce de salvamento
  const handleUpdateJustification = (eqId: string, justification: string) => {
    if (isRecordCompleted) return;
    const existing = modalChecklistRef.current.find(it => it.equipmentId === eqId);
    const updated: EquipmentChecklistItem = existing 
      ? { ...existing, justification }
      : { 
          equipmentId: eqId, 
          checked: false, 
          skipped: true, 
          justification, 
          notes: '', 
          photos: [], 
          checklistAnswers: clientChecklist.reduce((acc, t) => ({ ...acc, [t]: false }), {}) 
        };

    // Atualiza estado local imediatamente
    const nextList = modalChecklistRef.current.map(it => it.equipmentId === eqId ? updated : it);
    if (!nextList.some(it => it.equipmentId === eqId)) nextList.push(updated);
    setModalChecklist(nextList);
    modalChecklistRef.current = nextList;

    // Debounce na gravação persistente
    if (itemNotesDebounceRef.current[eqId]) {
      clearTimeout(itemNotesDebounceRef.current[eqId]);
    }
    setAutosaveStatus('saving');
    itemNotesDebounceRef.current[eqId] = setTimeout(() => {
      saveChecklistItemRealtime(updated);
    }, 600);
  };

  // Solicitar remoção / inativação de máquina que não existe mais
  const handleToggleRemoval = (eqId: string) => {
    if (isRecordCompleted) return;
    const existing = modalChecklist.find(it => it.equipmentId === eqId);
    const willBeRemoval = !existing?.requestedRemoval;

    const resetAnswers: Record<string, boolean> = {};
    clientChecklist.forEach(t => { resetAnswers[t] = false; });

    const updated: EquipmentChecklistItem = existing
      ? { 
          ...existing, 
          requestedRemoval: willBeRemoval,
          checked: false,
          skipped: false,
          checklistAnswers: willBeRemoval ? resetAnswers : existing.checklistAnswers,
          requestedRemovalAt: willBeRemoval ? new Date().toISOString() : undefined
        }
      : { 
          equipmentId: eqId, 
          checked: false, 
          requestedRemoval: true, 
          notes: '', 
          photos: [],
          checklistAnswers: resetAnswers,
          requestedRemovalAt: new Date().toISOString()
        };
    saveChecklistItemRealtime(updated);
  };

  // Upload de foto por equipamento
  const handlePhotoUpload = (eqId: string, photoIndex: number, file: File) => {
    if (!file || isRecordCompleted) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
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
          const base64Str = canvas.toDataURL('image/jpeg', 0.7);
          const existing = modalChecklist.find(it => it.equipmentId === eqId);
          const photos = [...(existing?.photos || [])];
          photos[photoIndex] = base64Str;
          const updated: EquipmentChecklistItem = existing
            ? { ...existing, photos }
            : { equipmentId: eqId, checked: false, photos, checklistAnswers: {} };
          saveChecklistItemRealtime(updated);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = (eqId: string, photoIndex: number) => {
    if (isRecordCompleted) return;
    const existing = modalChecklist.find(it => it.equipmentId === eqId);
    if (!existing || !existing.photos) return;
    const photos = [...existing.photos];
    photos.splice(photoIndex, 1);
    const updated: EquipmentChecklistItem = { ...existing, photos };
    saveChecklistItemRealtime(updated);
  };

  // Inclusão de nova máquina pelo técnico em campo
  const handleAddTechEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingTechEq) return;
    if (!techNewEqSector.trim()) {
      alert('Informe o setor/localização da máquina.');
      return;
    }
    setIsSubmittingTechEq(true);
    try {
      // REGRA: O label é a numeração sequencial estritamente única da máquina no endereço (01, 02, 03...),
      // evitando qualquer duplicidade. O campo patrimônio é o ÚNICO que pode ficar em branco no cadastro.
      const existingLabels = new Set(addressEquips.map(eq => (eq.label || '').trim().toLowerCase()));
      const numericLabels = addressEquips
        .map(eq => parseInt(eq.label || '', 10))
        .filter(n => !isNaN(n));
      let nextNum = numericLabels.length > 0 ? Math.max(...numericLabels) + 1 : (addressEquips.length + 1);
      while (existingLabels.has(String(nextNum).padStart(2, '0').toLowerCase()) || existingLabels.has(String(nextNum).toLowerCase())) {
        nextNum++;
      }
      const resolvedLabel = String(nextNum).padStart(2, '0');
      const resolvedPatrimony = techNewEqLabel.trim();

      const newEqId = await dataService.addEquipment({
        addressId: activeChecklistRecord.addressId,
        name: techNewEqName.trim() || 'SPLIT',
        label: resolvedLabel,
        patrimony: resolvedPatrimony, // Deixa vazio se não possuir numeração de patrimônio
        sector: techNewEqSector.trim() || 'Geral',
        brand: techNewEqBrand.trim() || 'Não informada',
        btus: techNewEqBtus.trim() || '12000',
        addedByTech: true,
        isPendingApproval: true,
        status: 'active',
        active: true
      });

      if (newEqId) {
        // Inicializa item do checklist para a nova máquina
        const initialAnswers: Record<string, boolean> = {};
        clientChecklist.forEach(t => { initialAnswers[t] = false; });
        const newItem: EquipmentChecklistItem = {
          equipmentId: newEqId,
          checked: false,
          notes: 'Adicionado pelo técnico na visita',
          checklistAnswers: initialAnswers,
          photos: []
        };
        const nextList = [...modalChecklist, newItem];
        setModalChecklist(nextList);
        await dataService.upsertRecord({
          ...activeChecklistRecord,
          checklist: nextList
        });
      }

      setTechNewEqLabel('');
      setTechNewEqSector('');
      setTechNewEqBrand('');
      setTechNewEqBtus('12000');
      setIsTechAddingEquipment(false);
      alert('Equipamento registrado com sucesso! O administrativo homologará junto com a folha.');
    } catch (err: any) {
      console.error('Erro ao adicionar equipamento no local:', err);
      alert('Erro ao cadastrar equipamento: ' + (err?.message || err));
    } finally {
      setIsSubmittingTechEq(false);
    }
  };

  // Validação e Finalização do Atendimento Técnico
  const handleFinalizeService = async () => {
    if (isFinalizing) return;
    setIsFinalizing(true);
    setChecklistValidationError(null);
    setCriticalError(null);
    setDiagnosticLogs([]);
    setValidationAttempted(true);

    addLog("Iniciando processo de finalização do atendimento...");

    const missingIdentification: string[] = [];
    if (!clientSigneeName.trim()) {
      missingIdentification.push("Nome do Responsável / Recebedor (Cliente) é obrigatório");
    } else if (clientSigneeName.trim().length < 3) {
      missingIdentification.push("Nome do Responsável / Recebedor deve conter no mínimo 3 caracteres");
    }

    if (!clientSigneeRegistration.trim()) {
      missingIdentification.push("Matrícula ou CPF do Responsável é obrigatório");
    } else if (clientSigneeRegistration.trim().length < 3) {
      missingIdentification.push("Matrícula ou CPF do Responsável deve conter no mínimo 3 caracteres");
    }

    if (!clientSignature || !clientSignature.trim() || clientSignature.trim().length < 10) {
      missingIdentification.push("Assinatura Digital do Representante do Cliente é obrigatória");
    }

    const invalidEquips: string[] = [];
    addressEquips.forEach(eq => {
      if (!eq) return;
      const item = modalChecklistRef.current.find(m => m && m.equipmentId === eq.id);
      if (!item) {
        invalidEquips.push(`${eq.name} (${eq.sector || 'Sem Setor'}) - Sem informações`);
        return;
      }
      if (item.requestedRemoval) return; // Máquinas com solicitação de remoção são isentas

      if (!item.checked && !item.skipped) {
        invalidEquips.push(`${eq.name} (${eq.sector || 'Sem Setor'}) - Pendente de checklist ou atendimento`);
      } else if (item.skipped && (!item.justification || item.justification.trim().length < 3)) {
        invalidEquips.push(`${eq.name} (${eq.sector || 'Sem Setor'}) - Justificativa obrigatória ausente`);
      }
    });

    if (missingIdentification.length > 0 || invalidEquips.length > 0) {
      addLog("Validação falhou. Campos obrigatórios ou máquinas pendentes.");
      const errorSections: string[] = [];

      if (missingIdentification.length > 0) {
        errorSections.push(
          "IDENTIFICAÇÃO E ASSINATURA OBRIGATÓRIAS:\n" +
          missingIdentification.map(field => `• ${field}`).join('\n')
        );
      }

      if (invalidEquips.length > 0) {
        errorSections.push(
          "MÁQUINAS PENDENTES:\n" +
          "Você precisa atender ou justificar individualmente todas as máquinas listadas (máquinas marcadas para remoção são isentas):\n" +
          invalidEquips.map(err => `• ${err}`).join('\n')
        );
      }

      setChecklistValidationError(
        `Não é possível finalizar o atendimento.\n\n` + errorSections.join('\n\n')
      );
      setIsFinalizing(false);

      setTimeout(() => {
        if (missingIdentification.length > 0 && clientInfoRef.current) {
          clientInfoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (validationAlertRef.current) {
          validationAlertRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      return;
    }

    const currentRecord = { ...activeChecklistRecord };
    const nowISO = new Date().toISOString();
    const executedQuantity = modalChecklistRef.current.filter(item => item && item.checked && !item.skipped && !item.requestedRemoval).length;
    const totalCount = addressEquips.filter(eq => {
      const item = modalChecklistRef.current.find(m => m && m.equipmentId === eq.id);
      return !item?.requestedRemoval;
    }).length;

    const isPartial = executedQuantity < totalCount;

    // REGRA CRÍTICA: Ao ser finalizado pelo técnico, o atendimento DEVE OBRIGATORIAMENTE
    // ir para o status PRE_COMPLETED ("Aguardando Aprovação") para conferência e homologação
    // pelo setor administrativo, NUNCA pulando diretamente para COMPLETED.
    const updates: Partial<MaintenanceRecord> = {
      checklist: modalChecklistRef.current,
      executedQuantity,
      techSignature: techSignatureRef.current,
      clientSignature: clientSignatureRef.current,
      clientSignatureDate: clientSignatureDateRef.current || nowISO,
      clientSigneeName: clientSigneeNameRef.current,
      clientSigneeRegistration: clientSigneeRegistrationRef.current,
      routeNotes: routeNotesRef.current,
      status: MaintenanceStatus.PRE_COMPLETED,
      routeStatus: MaintenanceStatus.PRE_COMPLETED,
      completionDate: activeChecklistRecord.completionDate || nowISO,
      executionDate: activeChecklistRecord.executionDate || nowISO.split('T')[0],
      adminApproved: false,
      approvedAt: undefined,
      approvedBy: undefined
    };

    const updatedRecord: MaintenanceRecord = { ...currentRecord, ...updates };
    const isRealAddressRecord = Boolean(updatedRecord.addressId && !String(updatedRecord.addressId).startsWith('TEMP_ADDR_'));
    if (isRealAddressRecord && updatedRecord.month && updatedRecord.addressId) {
      updatedRecord.id = `${updatedRecord.month}_${updatedRecord.addressId}`;
    }

    onClose();
    setIsFinalizing(false);

    if (onRecordUpdated) {
      onRecordUpdated(updatedRecord);
    }

    try {
      await dataService.upsertRecord(updatedRecord);

      // Disparar notificação se configurada
      if (deviceSettings?.finishTriggerEnabled && deviceSettings?.notifiedTechnicians) {
        const activeTechFilter = isTabletMode && authTech ? authTech.name : selectedTech;
        if (activeTechFilter && deviceSettings.notifiedTechnicians.includes(activeTechFilter)) {
          const clientName = modalClient?.name || 'Cliente';
          const addressStr = modalAddress ? `${modalAddress.street}, ${modalAddress.number || ''}` : 'Endereço';
          dataService.sendDeviceNotification(
            'tech_finish',
            `Atendimento Concluído: ${activeTechFilter}`,
            `O técnico ${activeTechFilter} finalizou o atendimento no cliente ${clientName} (${addressStr}).`,
            currentRecord.id
          ).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Erro na persistência em segundo plano ao finalizar:', err);
    }
  };

  const handleSaveDraft = async () => {
    if (isFinalizing) return;
    setIsFinalizing(true);

    const executedQuantity = modalChecklist.filter(item => item && item.checked && !item.skipped && !item.requestedRemoval).length;
    const updates: Partial<MaintenanceRecord> = {
      checklist: modalChecklist,
      executedQuantity,
      techSignature,
      clientSignature,
      clientSignatureDate: clientSignatureDate || (clientSignature ? new Date().toISOString() : undefined),
      clientSigneeName,
      clientSigneeRegistration,
      routeNotes,
      status: activeChecklistRecord.status === MaintenanceStatus.COMPLETED ? MaintenanceStatus.COMPLETED : MaintenanceStatus.PENDING,
      routeStatus: activeChecklistRecord.routeStatus === MaintenanceStatus.COMPLETED ? MaintenanceStatus.COMPLETED : MaintenanceStatus.PENDING
    };

    onClose();
    setIsFinalizing(false);

    if (onRecordUpdated) {
      onRecordUpdated({ ...activeChecklistRecord, ...updates });
    }

    try {
      await dataService.upsertRecord({
        ...activeChecklistRecord,
        ...updates
      });
    } catch (err) {
      console.error('Erro ao salvar rascunho:', err);
    }
  };

  // Filtragem da lista de equipamentos exibida (por busca)
  const filteredEquips = useMemo(() => {
    if (!searchQuery.trim()) return addressEquips;
    const q = searchQuery.toLowerCase();
    return addressEquips.filter(eq => {
      const nameMatch = (eq.name || '').toLowerCase().includes(q);
      const sectorMatch = (eq.sector || '').toLowerCase().includes(q);
      const brandMatch = (eq.brand || '').toLowerCase().includes(q);
      const labelMatch = (eq.label || '').toLowerCase().includes(q);
      const patMatch = (eq.patrimony || '').toLowerCase().includes(q);
      return nameMatch || sectorMatch || brandMatch || labelMatch || patMatch;
    });
  }, [addressEquips, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 pb-16 font-sans animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-5xl mx-auto rounded-3xl shadow-md border border-gray-200 overflow-hidden flex flex-col my-3 sm:my-6">
        
        {/* Cabeçalho Superior Escuro Compacto */}
        <div className="bg-slate-900 text-white p-3 sm:p-4 flex flex-wrap justify-between items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors cursor-pointer shrink-0"
              title="Voltar ao itinerário"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base leading-tight flex items-center gap-2 flex-wrap truncate">
                <span>{modalClient?.name || 'Cliente'}</span>
                {!isOnline && (
                  <span className="bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded animate-pulse uppercase tracking-wider">
                    OFFLINE
                  </span>
                )}
                {isRecordCompleted && (
                  <span className="bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                    CONCLUÍDO
                  </span>
                )}
              </h3>
              <p className="text-slate-400 text-xs truncate mt-0.5">
                {modalAddress?.street || 'Endereço'} {modalAddress?.neighborhood ? `• ${modalAddress.neighborhood}` : ''} • Ref: {activeChecklistRecord.month}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isRecordCompleted && (
              <div className="flex items-center text-xs">
                {autosaveStatus === 'saving' && (
                  <div className="flex items-center gap-1 bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2.5 py-1 rounded-full text-[11px] font-bold animate-pulse">
                    <RefreshCw className="w-3 h-3 text-blue-300 animate-spin" />
                    <span>Salvando...</span>
                  </div>
                )}
                {autosaveStatus === 'saved' && (
                  <div className="flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-1 rounded-full text-[11px] font-bold">
                    <Check className="w-3 h-3 text-emerald-300" />
                    <span>Salvo</span>
                  </div>
                )}
                {autosaveStatus === 'offline_saved' && (
                  <div className="flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2.5 py-1 rounded-full text-[11px] font-bold">
                    <Clock className="w-3 h-3 text-amber-300" />
                    <span>Offline</span>
                  </div>
                )}
                {autosaveStatus === 'error' && (
                  <div className="flex items-center gap-1 bg-rose-500/20 text-rose-300 border border-rose-400/30 px-2.5 py-1 rounded-full text-[11px] font-bold">
                    <AlertCircle className="w-3 h-3 text-rose-300" />
                    <span>Erro</span>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo Principal do Atendimento */}
        <div className="p-3 sm:p-5 space-y-3">

          {/* Banner de Justificativa de Reprovação (se aplicável) */}
          {activeChecklistRecord.status !== MaintenanceStatus.COMPLETED && activeChecklistRecord.status !== MaintenanceStatus.PRE_COMPLETED && activeChecklistRecord.rejectionReason && (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-3 flex items-start gap-2.5 shadow-2xs animate-pulse">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-black text-rose-900 text-xs uppercase tracking-wider">
                  Atendimento Reprovado pelo Administrativo:
                </h4>
                <div className="mt-1 bg-rose-100/70 border-l-4 border-rose-500 px-2.5 py-1.5 rounded-r-lg font-mono text-xs text-rose-950 font-bold italic leading-relaxed">
                  "{activeChecklistRecord.rejectionReason}"
                </div>
              </div>
            </div>
          )}

          {/* Formulário para Adicionar Máquina em Campo */}
          {isTechAddingEquipment && (
            <form onSubmit={handleAddTechEquipment} className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 space-y-4 animate-in slide-in-from-top-2 duration-200">
              <div className="flex justify-between items-center border-b border-amber-200 pb-2">
                <h5 className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-amber-600" /> Nova Máquina Encontrada no Local
                </h5>
                <button
                  type="button"
                  onClick={() => setIsTechAddingEquipment(false)}
                  className="text-amber-600 hover:text-amber-800 p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-amber-900 uppercase tracking-wider mb-1">
                    Patrimônio (Opcional)
                  </label>
                  <input
                    type="text"
                    value={techNewEqLabel}
                    onChange={(e) => setTechNewEqLabel(e.target.value)}
                    placeholder="Em branco se não possuir"
                    className="w-full px-3 py-2 text-xs bg-white border border-amber-300 focus:border-amber-500 rounded-xl outline-none font-bold text-slate-800"
                  />
                  <p className="text-[9px] text-amber-800 font-semibold mt-1">Único campo que pode ficar em branco</p>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-amber-900 uppercase tracking-wider mb-1">
                    Nome Completo do Setor *
                  </label>
                  <input
                    type="text"
                    required
                    value={techNewEqSector}
                    onChange={(e) => setTechNewEqSector(e.target.value)}
                    placeholder="Ex: Sala de Reunião 2º Andar"
                    className="w-full px-3 py-2 text-xs bg-white border border-amber-300 focus:border-amber-500 rounded-xl outline-none font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-amber-900 uppercase tracking-wider mb-1">
                    Tipo de Máquina
                  </label>
                  <select
                    value={techNewEqName}
                    onChange={(e) => setTechNewEqName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-amber-300 focus:border-amber-500 rounded-xl outline-none font-bold text-slate-800"
                  >
                    <option value="SPLIT HI-WALL">SPLIT HI-WALL</option>
                    <option value="SPLIT">SPLIT</option>
                    <option value="ACJ">ACJ (Janela)</option>
                    <option value="PISO TETO">PISO TETO</option>
                    <option value="CASSETE">CASSETE</option>
                    <option value="MULTI SPLIT">MULTI SPLIT</option>
                    <option value="FANCOIL">FANCOIL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-amber-900 uppercase tracking-wider mb-1">
                    Marca
                  </label>
                  <input
                    type="text"
                    value={techNewEqBrand}
                    onChange={(e) => setTechNewEqBrand(e.target.value)}
                    placeholder="Ex: Carrier, Elgin, Midea"
                    className="w-full px-3 py-2 text-xs bg-white border border-amber-300 focus:border-amber-500 rounded-xl outline-none font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-amber-900 uppercase tracking-wider mb-1">
                    Capacidade (BTUs)
                  </label>
                  <input
                    type="text"
                    value={techNewEqBtus}
                    onChange={(e) => setTechNewEqBtus(e.target.value)}
                    placeholder="Ex: 12000"
                    className="w-full px-3 py-2 text-xs bg-white border border-amber-300 focus:border-amber-500 rounded-xl outline-none font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTechAddingEquipment(false)}
                  className="px-4 py-2 bg-white border border-amber-300 text-amber-900 text-xs font-bold rounded-xl cursor-pointer hover:bg-amber-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTechEq}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  {isSubmittingTechEq ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Salvar Nova Máquina
                </button>
              </div>
            </form>
          )}

          {/* Barra Compacta de Ações Rápidas e Busca */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            {/* Botões de Ação Rápida */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {!isRecordCompleted && (
                <button
                  type="button"
                  onClick={() => setIsTechAddingEquipment(prev => !prev)}
                  className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                  title="Cadastrar nova máquina encontrada no local"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Máquina</span>
                </button>
              )}
            </div>

            {/* Busca */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar máquina ou setor..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-lg outline-none font-semibold text-slate-800"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* LISTA COMPLETA DAS MÁQUINAS COM SEUS CHECKLISTS E NOMES COMPLETOS (LAYOUT COMPACTO) */}
          <div className="space-y-2 sm:space-y-2.5">
            {filteredEquips.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                <AlertCircle className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                <p className="text-xs font-bold text-slate-600">Nenhuma máquina encontrada com os filtros atuais.</p>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="mt-1.5 text-xs font-extrabold text-blue-600 hover:underline cursor-pointer"
                  >
                    Limpar busca
                  </button>
                )}
              </div>
            ) : (
              filteredEquips.map((eq, idx) => {
                const item = modalChecklist.find(it => it && it.equipmentId === eq.id);
                const isChecked = item ? !!item.checked : false;
                const isSkipped = item ? !!item.skipped && !item.requestedRemoval : false;
                const isRemoval = !!item?.requestedRemoval;
                const isExpanded = expandedEqIds.has(eq.id);
                const isSavingThis = savingEquipmentId === eq.id;

                // Número de ordenamento da máquina na planilha de atendimento (1, 2, 3...)
                const orderIndex = addressEquips.findIndex(e => e.id === eq.id);
                const machineOrderNumber = orderIndex !== -1 ? orderIndex + 1 : idx + 1;

                // Contagem de tarefas concluídas no checklist desta máquina
                const completedTasksCount = clientChecklist.filter(task => !!item?.checklistAnswers?.[task]).length;

                // Dinâmica de cores do preenchimento do número de ordenamento:
                // - Rosa suave: marcado para remoção na planilha
                // - Verde: checklist preenchido / atendida
                // - Âmbar: máquina pulada
                // - Azul padrão: pendente
                let orderBadgeColorClass = "bg-sky-500 text-white";
                if (isRemoval) {
                  orderBadgeColorClass = "bg-rose-100 text-rose-700 border border-rose-300";
                } else if (isChecked || completedTasksCount > 0) {
                  orderBadgeColorClass = "bg-emerald-500 text-white";
                } else if (isSkipped) {
                  orderBadgeColorClass = "bg-amber-500 text-white";
                }

                return (
                  <div
                    key={eq.id}
                    className={cn(
                      "rounded-xl border transition-all duration-150 overflow-hidden shadow-2xs notranslate",
                      isRemoval && "border-rose-200 bg-rose-50/40",
                      !isRemoval && isChecked && "border-emerald-300 bg-white ring-1 ring-emerald-400/25",
                      !isRemoval && isSkipped && "border-amber-300 bg-white ring-1 ring-amber-400/25",
                      !isRemoval && !isChecked && !isSkipped && "border-slate-200 bg-white hover:border-slate-300"
                    )}
                  >
                    {/* CABEÇALHO RECOLHÍVEL DO EQUIPAMENTO (Clicável para expandir/recolher) */}
                    <div 
                      onClick={() => toggleExpand(eq.id)}
                      className={cn(
                        "p-2.5 sm:p-3 cursor-pointer select-none transition-colors",
                        isRemoval
                          ? (isExpanded ? "bg-rose-50/70 border-b border-rose-100" : "hover:bg-rose-50/40")
                          : (isExpanded ? "bg-slate-50/90 border-b border-slate-200" : "hover:bg-slate-50/60")
                      )}
                    >
                      {/* ESTRUTURA PRINCIPAL: NÚMERO DE ORDENAMENTO + DUAS LINHAS LIVRES */}
                      <div className="flex items-start gap-2.5 w-full">
                        {/* Selo do Número de Ordenamento da Máquina (Azul leve padrão -> Verde preenchido -> Rosa suave remoção) */}
                        <div className={cn(
                          "w-7 h-7 sm:w-8 sm:h-8 rounded-lg font-mono text-xs sm:text-sm font-black flex items-center justify-center shrink-0 shadow-xs transition-colors duration-200 mt-0.5",
                          orderBadgeColorClass
                        )}>
                          {machineOrderNumber}
                        </div>

                        {/* Bloco das Linhas de Identificação da Máquina */}
                        <div className="flex-1 min-w-0">
                          {/* LINHA 1: SOMENTE A INFORMAÇÃO DO NOME DO SETOR COMO TEXTO PRINCIPAL (SEM INPUT / CAIXA) */}
                          <div className={cn(
                            "font-black text-xs sm:text-sm leading-tight break-words uppercase tracking-tight notranslate",
                            isRemoval ? "text-rose-900" : "text-slate-900"
                          )}>
                            {eq.sector || 'Geral'}
                          </div>

                          {/* LINHA 2: TIPO DO EQUIPAMENTO + MARCA + POTÊNCIA */}
                          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <h4 className={cn(
                              "font-black text-xs sm:text-sm leading-snug break-words notranslate flex items-center gap-1.5",
                              isRemoval ? "text-rose-900" : "text-slate-900"
                            )}>
                              <span>{eq.name}</span>
                              {eq.brand && <span className={cn("font-bold", isRemoval ? "text-rose-700/80" : "text-slate-600")}>- {eq.brand}</span>}
                            </h4>

                            {/* Potência da Máquina ao lado de Tipo e Marca */}
                            {eq.btus ? (
                              <span className={cn(
                                "inline-flex items-center gap-1 font-black text-xs px-2 py-0.5 rounded-md whitespace-nowrap border notranslate",
                                isRemoval 
                                  ? "bg-rose-50/80 text-rose-700 border-rose-200/70" 
                                  : "bg-sky-50 text-sky-800 border-sky-200"
                              )}>
                                <Zap className={cn("w-3.5 h-3.5 shrink-0", isRemoval ? "text-rose-500" : "text-sky-600")} />
                                <span>{formatBtus(eq.btus)} BTUs</span>
                              </span>
                            ) : null}

                            {eq.addedByTech && (
                              <span className={cn(
                                "text-[9px] font-black px-1.5 py-0.2 rounded uppercase whitespace-nowrap border notranslate",
                                isRemoval
                                  ? "bg-rose-50 text-rose-800 border-rose-200"
                                  : "bg-amber-100 text-amber-900 border-amber-300"
                              )}>
                                Em Campo
                              </span>
                            )}
                            {eq.patrimony && eq.patrimony !== String(machineOrderNumber) && (
                              <span className={cn(
                                "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded leading-none whitespace-nowrap border notranslate",
                                isRemoval
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-slate-100 text-slate-700 border-slate-200"
                              )}>
                                Patr: {eq.patrimony}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* LINHA 3: AÇÕES RÁPIDAS (ATENDER, PULAR, REMOVER, FOTO RÁPIDA, EXPANDIR) */}
                      <div className={cn(
                        "mt-2.5 pt-2 border-t flex items-center justify-between gap-2 flex-wrap",
                        isRemoval ? "border-rose-100" : "border-slate-100"
                      )}>
                        
                        {/* Status / Salvando */}
                        <div className="flex items-center gap-1.5">
                          {isSavingThis && (
                            <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span className="hidden sm:inline">Salvando...</span>
                            </div>
                          )}
                        </div>

                        {/* Botões de Ação */}
                        <div 
                          className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto flex-wrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Botão Atender / Atendida */}
                          <button
                            type="button"
                            translate="no"
                            disabled={isRecordCompleted || isRemoval}
                            onClick={() => handleToggleCheck(eq.id)}
                            className={cn(
                              "h-7.5 px-2.5 sm:px-3 min-w-[76px] justify-center rounded-lg font-black text-xs transition-all flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed shadow-2xs whitespace-nowrap notranslate",
                              isRemoval
                                ? "bg-slate-100 text-slate-400 border border-slate-200 opacity-50 cursor-not-allowed"
                                : isChecked 
                                ? "bg-emerald-600 text-white hover:bg-emerald-700" 
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                            )}
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span className="notranslate" translate="no">{isChecked ? 'Atendida' : 'Atender'}</span>
                          </button>

                          {/* Botão Pular */}
                          <button
                            type="button"
                            translate="no"
                            disabled={isRecordCompleted || isRemoval}
                            onClick={() => handleToggleSkip(eq.id)}
                            className={cn(
                              "h-7.5 px-2.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap notranslate",
                              isRemoval
                                ? "bg-slate-100 text-slate-400 border border-slate-200 opacity-50 cursor-not-allowed"
                                : isSkipped 
                                ? "bg-amber-500 text-white font-black" 
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                            )}
                          >
                            <span className="notranslate" translate="no">Pular</span>
                          </button>

                          {/* Pequeno botão suave com o nome "Remover" */}
                          <button
                            type="button"
                            translate="no"
                            disabled={isRecordCompleted}
                            onClick={() => handleToggleRemoval(eq.id)}
                            className={cn(
                              "h-7.5 px-2.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap notranslate",
                              isRemoval 
                                ? "bg-rose-100 text-rose-800 border border-rose-300 font-extrabold hover:bg-rose-200/80 shadow-2xs" 
                                : "bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 border border-slate-200"
                            )}
                            title={isRemoval ? "Desmarcar solicitação de remoção" : "Solicitar remoção desta máquina"}
                          >
                            <span className="notranslate" translate="no">Remover</span>
                          </button>

                          {/* Atalho Rápido de Foto (sem precisar expandir o card) */}
                          <label
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              "h-7.5 px-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer select-none border notranslate",
                              (item?.photos?.length || 0) > 0
                                ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 border-slate-200",
                              isRecordCompleted && "opacity-50 cursor-not-allowed"
                            )}
                            title={(item?.photos?.length || 0) > 0 ? `${item?.photos?.length} foto(s) anexada(s). Clique para adicionar outra foto.` : "Anexar foto rápida desta máquina"}
                          >
                            <Camera className={cn("w-3.5 h-3.5", (item?.photos?.length || 0) > 0 ? "text-blue-600" : "text-slate-500")} />
                            {(item?.photos?.length || 0) > 0 && (
                              <span className="text-[10px] font-black text-blue-700 notranslate leading-none">
                                {item?.photos?.length}
                              </span>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              disabled={isRecordCompleted || (item?.photos?.length || 0) >= 3}
                              className="hidden"
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handlePhotoUpload(eq.id, item?.photos?.length || 0, e.target.files[0]);
                                  e.target.value = '';
                                }
                              }}
                            />
                          </label>

                          {/* Botão Chevron */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(eq.id);
                            }}
                            className={cn(
                              "h-7.5 w-7.5 flex items-center justify-center rounded-lg transition-colors cursor-pointer border",
                              isRemoval
                                ? "border-rose-200 text-rose-500 hover:text-rose-800 hover:bg-rose-100/60"
                                : "border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
                            )}
                            title={isExpanded ? "Recolher detalhes" : "Expandir checklist"}
                          >
                            <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", isExpanded && "rotate-180", isRemoval ? "text-rose-700" : "text-blue-600")} />
                          </button>
                        </div>

                      </div>
                    </div>

                    {/* SEÇÃO DO CHECKLIST DA MÁQUINA E DETALHES TÉCNICOS (COMPACTA) */}
                    {isExpanded && (
                      <div className={cn(
                        "p-2.5 sm:p-3 border-t space-y-2.5 animate-in slide-in-from-top-1",
                        isRemoval ? "bg-rose-50/40 border-rose-100" : "bg-slate-50/80 border-slate-200"
                      )}>
                        
                        {/* AVISO QUANDO MARCADA PARA REMOÇÃO */}
                        {isRemoval && (
                          <div className="bg-rose-50/90 border border-rose-200 text-rose-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
                            <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                            <span>Máquina marcada para remoção pelo técnico. Não exige preenchimento de checklist.</span>
                          </div>
                        )}
                        
                        {/* AVISO E JUSTIFICATIVA CASO A MÁQUINA TENHA SIDO PULADA */}
                        {isSkipped && (
                          <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 space-y-1.5">
                            <label className="block text-[11px] font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              Justificativa Obrigatória (Por que esta máquina foi pulada?)*
                            </label>
                            <input
                              type="text"
                              disabled={isRecordCompleted}
                              value={item?.justification || ''}
                              onChange={(e) => handleUpdateJustification(eq.id, e.target.value)}
                              placeholder="Ex: Sala trancada / Responsável ausente / Desligada para reforma"
                              className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 focus:border-amber-500 rounded-lg outline-none font-bold text-slate-800"
                            />
                            {(!item?.justification || item.justification.trim().length < 3) && (
                              <p className="text-[10px] font-bold text-amber-700">
                                Atenção: É obrigatório informar o motivo antes de finalizar o atendimento.
                              </p>
                            )}
                          </div>
                        )}

                        {/* LISTA COMPLETA DE TAREFAS DO CHECKLIST DESTA MÁQUINA (ALTA DENSIDADE E ERGONOMIA) */}
                        {!isSkipped && !isRemoval && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <h5 className="font-black text-[11px] uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                                <ListChecks className="w-3.5 h-3.5 text-blue-600" />
                                Itens do Checklist ({completedTasksCount}/{clientChecklist.length})
                              </h5>

                              {!isRecordCompleted && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleCheckAllTasks(eq.id, true)}
                                    className="text-[10px] font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                                  >
                                    Marcar todos
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCheckAllTasks(eq.id, false)}
                                    className="text-[10px] font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                                  >
                                    Desmarcar
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* GRID COMPACTO DE ITENS DO CHECKLIST DA MÁQUINA */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                              {clientChecklist.map((task, taskIdx) => {
                                const isTaskDone = !!item?.checklistAnswers?.[task];
                                return (
                                  <label
                                    key={taskIdx}
                                    className={cn(
                                      "flex items-center gap-2 p-1.5 sm:p-2 rounded-lg border transition-all cursor-pointer select-none text-xs",
                                      isTaskDone
                                        ? "bg-emerald-50/90 border-emerald-300 text-emerald-950 font-bold shadow-2xs"
                                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100/70 font-medium",
                                      isRecordCompleted && "cursor-not-allowed opacity-80"
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={isRecordCompleted}
                                      checked={isTaskDone}
                                      onChange={() => handleToggleChecklistAnswer(eq.id, task)}
                                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                                    />
                                    <span className="leading-snug break-words flex-1 text-[11px] sm:text-xs">
                                      {task}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* CAMPO DE OBSERVAÇÃO TÉCNICA DA MÁQUINA */}
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                            Observações Técnicas Desta Máquina
                          </label>
                          <input
                            type="text"
                            disabled={isRecordCompleted}
                            value={item?.notes || ''}
                            onChange={(e) => handleUpdateItemNotes(eq.id, e.target.value)}
                            placeholder="Ex: Dreno desobstruído, carga OK, higienizada..."
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none font-medium text-slate-800 focus:border-blue-500"
                          />
                        </div>

                        {/* FOTOS DA MÁQUINA COMPACTAS */}
                        <div className="pt-1 border-t border-slate-200/80">
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Camera className="w-3.5 h-3.5 text-slate-400" />
                            Registro Fotográfico da Máquina (Opcional)
                          </label>
                          <div className="flex items-center gap-2 flex-wrap">
                            {(item?.photos || []).map((photoUrl, pIdx) => (
                              <div key={pIdx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-slate-300 shadow-2xs">
                                <img src={photoUrl} alt="Foto da máquina" className="w-full h-full object-cover" />
                                {!isRecordCompleted && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePhoto(eq.id, pIdx)}
                                    className="absolute top-0.5 right-0.5 p-0.5 bg-rose-600 text-white rounded opacity-90 hover:opacity-100 cursor-pointer"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            ))}

                            {!isRecordCompleted && (item?.photos?.length || 0) < 3 && (
                              <label className="w-14 h-14 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-500 flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer bg-white">
                                <Camera className="w-4 h-4" />
                                <span className="text-[8.5px] font-bold uppercase">Foto</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      handlePhotoUpload(eq.id, item?.photos?.length || 0, e.target.files[0]);
                                    }
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>

                        {/* SOLICITAR REMOÇÃO DE MÁQUINA */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
                          <button
                            type="button"
                            disabled={isRecordCompleted}
                            onClick={() => handleToggleRemoval(eq.id)}
                            className={cn(
                              "text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer",
                              isRemoval ? "text-rose-600 hover:text-rose-700 font-black" : "text-slate-500 hover:text-rose-600"
                            )}
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>
                              {isRemoval 
                                ? 'Máquina marcada para remoção (Clique para desfazer)' 
                                : 'Solicitar remoção desta máquina (não existe no local)'}
                            </span>
                          </button>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* OBSERVAÇÕES GERAIS DO ATENDIMENTO / ROTA */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-2">
            <label className="block text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              Observações Gerais do Atendimento / Rota
            </label>
            <textarea
              rows={3}
              disabled={isRecordCompleted}
              value={routeNotes}
              onChange={(e) => setRouteNotes(e.target.value)}
              placeholder="Descreva observações gerais desta visita, pendências, recomendações ao cliente..."
              className="w-full p-3.5 text-xs bg-slate-50 border border-slate-200 rounded-2xl outline-none font-medium text-slate-800 focus:bg-white focus:border-blue-500"
            />
          </div>

          {/* IDENTIFICAÇÃO E ASSINATURA DIGITAL DO CLIENTE & TÉCNICO */}
          <div ref={clientInfoRef} className="bg-slate-50 border border-slate-200 rounded-3xl p-5 sm:p-6 space-y-5 shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h4 className="text-sm font-black uppercase text-slate-800 tracking-wider">
                Identificação e Assinatura Digital
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                  Nome do Responsável / Recebedor (Cliente) *
                </label>
                <input
                  type="text"
                  disabled={isRecordCompleted}
                  value={clientSigneeName}
                  onChange={(e) => setClientSigneeName(e.target.value)}
                  placeholder="Nome completo de quem acompanhou o serviço..."
                  className={cn(
                    "w-full px-3.5 py-2.5 text-xs bg-white border rounded-xl outline-none font-bold text-slate-800 transition-colors",
                    validationAttempted && (!clientSigneeName || clientSigneeName.trim().length < 3)
                      ? "border-rose-400 bg-rose-50/20 focus:border-rose-500 ring-1 ring-rose-300"
                      : "border-slate-200 focus:border-blue-500"
                  )}
                />
                {validationAttempted && (!clientSigneeName || clientSigneeName.trim().length < 3) && (
                  <span className="text-[10px] font-bold text-rose-600 mt-1 block">
                    * Campo obrigatório: informe o nome do responsável.
                  </span>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                  Matrícula ou CPF do Responsável *
                </label>
                <input
                  type="text"
                  disabled={isRecordCompleted}
                  value={clientSigneeRegistration}
                  onChange={(e) => setClientSigneeRegistration(e.target.value)}
                  placeholder="Digite a matrícula ou CPF do responsável..."
                  className={cn(
                    "w-full px-3.5 py-2.5 text-xs bg-white border rounded-xl outline-none font-bold text-slate-800 transition-colors",
                    validationAttempted && (!clientSigneeRegistration || clientSigneeRegistration.trim().length < 3)
                      ? "border-rose-400 bg-rose-50/20 focus:border-rose-500 ring-1 ring-rose-300"
                      : "border-slate-200 focus:border-blue-500"
                  )}
                />
                {validationAttempted && (!clientSigneeRegistration || clientSigneeRegistration.trim().length < 3) && (
                  <span className="text-[10px] font-bold text-rose-600 mt-1 block">
                    * Campo obrigatório: informe a matrícula ou CPF.
                  </span>
                )}
              </div>
            </div>

            {/* Painel de Assinatura do Cliente */}
            <div className="pt-2">
              <SignaturePadModal
                label="Assinatura do Representante do Cliente *"
                savedValue={clientSignature}
                onChange={(sig) => setClientSignature(sig)}
                disabled={isRecordCompleted}
              />
              {validationAttempted && !clientSignature.trim() && (
                <span className="text-[10px] font-bold text-rose-600 mt-1.5 block">
                  * Assinatura digital obrigatória antes de finalizar.
                </span>
              )}
            </div>
          </div>

          {/* MENSAGEM DE ERRO OU VALIDAÇÃO */}
          {checklistValidationError && (
            <div ref={validationAlertRef} className="bg-rose-50 border-2 border-rose-300 text-rose-900 rounded-2xl p-4 sm:p-5 text-xs font-bold leading-relaxed whitespace-pre-line shadow-xs animate-in shake">
              {checklistValidationError}
            </div>
          )}

          {/* DIAGNÓSTICOS EM CASO DE ERRO */}
          {criticalError && (
            <div className="p-4 bg-slate-900 text-slate-200 rounded-2xl text-[11px] font-mono space-y-2">
              <p className="text-rose-400 font-bold">{criticalError}</p>
              <div className="max-h-36 overflow-y-auto space-y-1">
                {diagnosticLogs.map((log, i) => <div key={i}>{log}</div>)}
              </div>
            </div>
          )}

        </div>

        {/* RODAPÉ COM BOTÕES DE AÇÃO */}
        <div className="p-4 sm:p-6 bg-slate-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-[11px]">As respostas das máquinas são gravadas automaticamente no sistema.</span>
          </div>

          <div className="flex items-center gap-3">
            {isRecordCompleted ? (
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl cursor-pointer"
              >
                Fechar Visualização
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isFinalizing}
                  onClick={handleSaveDraft}
                  className="px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-extrabold text-xs rounded-xl cursor-pointer transition-colors"
                >
                  Fechar e Manter Rascunho
                </button>
                <button
                  type="button"
                  disabled={isFinalizing}
                  onClick={handleFinalizeService}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-2 transition-all active:scale-95"
                >
                  {isFinalizing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Finalizando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Finalizar Atendimento
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default EquipmentChecklistModal;
