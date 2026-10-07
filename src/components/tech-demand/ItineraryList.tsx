import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar, 
  Search, 
  MapPin, 
  ChevronUp, 
  ChevronDown, 
  ClipboardCheck, 
  Wrench, 
  Printer, 
  CheckCircle2, 
  Clock, 
  Plus, 
  RefreshCw, 
  HelpCircle, 
  Check, 
  User, 
  Users, 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink, 
  Layers, 
  LayoutList, 
  Table as TableIcon, 
  Navigation
} from 'lucide-react';
import { MaintenanceRecord, Address, Client, Technician, ServiceOrder, MaintenanceStatus, UserRole, Equipment } from '../../types';
import { format, parseISO, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../lib/utils';
import { buildTechnicianIndex, normalizeTechString } from '../../lib/technicianIndex';
import { PMOCDocumentViewerModal } from '../PMOCDocumentViewerModal';
import { dataService } from '../../services/dataService';

export interface ItineraryListProps {
  records: MaintenanceRecord[];
  addresses: Address[];
  clients: Client[];
  equipments?: Equipment[];
  techs: Technician[];
  serviceOrders?: ServiceOrder[];
  userRole?: UserRole;
  isReadOnly?: boolean;
  managerClientId?: string;
  onOpenChecklist: (record: MaintenanceRecord) => void;
  onOpenServiceOrder?: (os: ServiceOrder) => void;
  onUpdateRecord: (record: MaintenanceRecord, updates: Partial<MaintenanceRecord>) => void;
  onRefreshData?: () => void;
  onOpenAddOSModal?: () => void;
}

export interface ItineraryDemandItem {
  id: string;
  type: 'preventive' | 'corrective';
  order: number;
  code: string;
  clientName: string;
  clientCode?: string;
  street: string;
  neighborhood: string;
  city: string;
  coordinates?: string;
  machinesCount: number;
  tech1: string; // Técnico Titular da Rota
  tech2?: string; // Ajudante / Auxiliar
  status: 'pending' | 'completed';
  statusLabel: string;
  completionTime?: string;
  serviceDate?: string; // Data em que o serviço foi realizado / finalizado
  serviceDateRaw?: string; // YYYY-MM-DD para ordenação
  notes?: string;
  record?: MaintenanceRecord;
  serviceOrder?: ServiceOrder;
}

// Verifica se uma Ordem de Serviço está programada para a data-alvo considerando plannedDate ou aberturas
function checkOSMatchesDate(os: ServiceOrder, targetDate: string): boolean {
  const osDate = (
    os.plannedDate ||
    (os.openedAt ? os.openedAt.substring(0, 10) : '') ||
    ((os as any).scheduledDate ? String((os as any).scheduledDate).substring(0, 10) : '') ||
    extractDateOnly((os as any).executionDate)
  ).split('T')[0].trim();
  return osDate === targetDate.trim();
}

// Extrai formato de data 'YYYY-MM-DD' com segurança (suporta ISO, Date, Firestore Timestamp)
function extractDateOnly(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    return val.split('T')[0].trim();
  }
  if (val && typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      try {
        return val.toDate().toISOString().split('T')[0];
      } catch {}
    }
    if (val.seconds) {
      return new Date(val.seconds * 1000).toISOString().split('T')[0];
    }
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }
  return '';
}

// Para Ordens de Serviço: REGRA MANDATÓRIA -> "no caso das ordens de serviço a data a ser considerada é a data de finalização"
function getOSFinalizationDate(os: ServiceOrder): string {
  return extractDateOnly(os.finishedAt) ||
         extractDateOnly(os.adminFinalizedAt) ||
         extractDateOnly(os.techFinalizedAt) ||
         extractDateOnly(os.clientSignatureDate);
}

// Para Manutenções Preventivas: data de realização do serviço
function getRecordServiceDate(r: MaintenanceRecord): string {
  return extractDateOnly(r.completionDate) ||
         extractDateOnly(r.clientSignatureDate) ||
         extractDateOnly(r.executionDate) ||
         extractDateOnly(r.approvedAt) ||
         extractDateOnly(r.plannedDate);
}

export function ItineraryList({
  records,
  addresses,
  clients,
  equipments = [],
  techs,
  serviceOrders = [],
  userRole,
  isReadOnly = false,
  managerClientId,
  onOpenChecklist,
  onOpenServiceOrder,
  onUpdateRecord,
  onRefreshData,
  onOpenAddOSModal
}: ItineraryListProps) {
  // Modo de filtro de data: 'day' (dia único - padrão) vs 'period' (período personalizado de datas)
  const [dateFilterMode, setDateFilterMode] = useState<'day' | 'period'>('day');

  // Data selecionada para o roteiro diário (modo 'day')
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  // Período personalizado de datas (modo 'period' para buscar serviços realizados no período)
  const [periodStartDate, setPeriodStartDate] = useState(() => {
    const now = new Date();
    return format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
  });
  const [periodEndDate, setPeriodEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  // Registros adicionais carregados sob demanda caso o período abranja meses anteriores
  const [extraMonthRecords, setExtraMonthRecords] = useState<MaintenanceRecord[]>([]);
  
  // Técnico 1 selecionado (filtro). Se null, exibe visão geral de todas as rotas
  const [selectedTech, setSelectedTech] = useState<string | null>(null);

  // Exibir técnicos livres / sem demandas na coluna lateral
  const [showIdleTechs, setShowIdleTechs] = useState<boolean>(false);

  // Estado para modal de pré-visualização da folha de atendimento oficial do endereço
  const [viewingSheetRecord, setViewingSheetRecord] = useState<MaintenanceRecord | null>(null);
  const [fetchedEquipments, setFetchedEquipments] = useState<Record<string, Equipment[]>>({});
  const [isLoadingEquipments, setIsLoadingEquipments] = useState(false);

  // Abre a pré-visualização da folha de atendimento (a mesma gerada na aprovação)
  const handleOpenSheetPreview = async (record: MaintenanceRecord) => {
    setViewingSheetRecord(record);
    if (record.addressId) {
      const alreadyInProps = equipments && equipments.length > 0 && equipments.some(eq => eq.addressId === record.addressId);
      if (!alreadyInProps && !fetchedEquipments[record.addressId]) {
        try {
          setIsLoadingEquipments(true);
          const list = await dataService.getEquipments(record.addressId);
          if (list && list.length > 0) {
            setFetchedEquipments(prev => ({ ...prev, [record.addressId]: list }));
          }
        } catch (e) {
          console.warn('Erro ao carregar equipamentos para folha de atendimento:', e);
        } finally {
          setIsLoadingEquipments(false);
        }
      }
    }
  };

  // Modo de visualização: 'table' (planilha compacta padrão solicitada pelo usuário) ou 'cards' (detalhado)
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => {
    try {
      const saved = localStorage.getItem('itinerary_view_mode');
      if (saved === 'cards' || saved === 'table') return saved;
    } catch (e) {}
    return 'table'; // Padrão sempre planilha compacta para visão ampla de múltiplos endereços
  });

  // Nível de densidade da planilha: 'ultra' (máxima economia de espaço) ou 'compact' (confortável e compacto)
  const [density, setDensity] = useState<'compact' | 'ultra'>(() => {
    try {
      const saved = localStorage.getItem('itinerary_density');
      if (saved === 'ultra' || saved === 'compact') return saved;
    } catch (e) {}
    return 'compact';
  });

  useEffect(() => {
    try {
      localStorage.setItem('itinerary_view_mode', viewMode);
      localStorage.setItem('itinerary_density', density);
    } catch (e) {}
  }, [viewMode, density]);

  // Filtros rápidos
  const [typeFilter, setTypeFilter] = useState<'all' | 'preventive' | 'corrective'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estado de carregamento / reordenação
  const [isReordering, setIsReordering] = useState(false);

  // Navegação rápida de datas
  const handlePrevDay = () => {
    try {
      const prev = subDays(parseISO(selectedDate + 'T12:00:00'), 1);
      setSelectedDate(format(prev, 'yyyy-MM-dd'));
    } catch {
      setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    }
  };

  const handleNextDay = () => {
    try {
      const next = addDays(parseISO(selectedDate + 'T12:00:00'), 1);
      setSelectedDate(format(next, 'yyyy-MM-dd'));
    } catch {
      setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    }
  };

  const handleSetToday = () => {
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
  };

  // Combina registros de preventivas das props com eventuais meses adicionais carregados sob demanda
  const combinedRecords = useMemo(() => {
    if (extraMonthRecords.length === 0) return records;
    const map = new Map<string, MaintenanceRecord>();
    records.forEach(r => { if (r && r.id) map.set(r.id, r); });
    extraMonthRecords.forEach(r => { if (r && r.id && !map.has(r.id)) map.set(r.id, r); });
    return Array.from(map.values());
  }, [records, extraMonthRecords]);

  // Carrega meses adicionais quando o usuário escolhe um período personalizado que abrange outros meses
  useEffect(() => {
    if (dateFilterMode !== 'period' || !periodStartDate || !periodEndDate) return;
    try {
      const loadedMonths = new Set(records.map(r => r.month || (r.plannedDate ? r.plannedDate.substring(0, 7) : '')));
      const monthsNeeded: string[] = [];

      let curr = parseISO(periodStartDate + 'T12:00:00');
      const end = parseISO(periodEndDate + 'T12:00:00');

      while (curr <= end) {
        const mStr = format(curr, 'yyyy-MM');
        if (!loadedMonths.has(mStr) && !monthsNeeded.includes(mStr)) {
          monthsNeeded.push(mStr);
        }
        curr = addDays(curr, 28);
      }

      if (monthsNeeded.length > 0) {
        Promise.all(monthsNeeded.map(m => dataService.getRecords(m, { lightweight: true }).catch(() => [])))
          .then(results => {
            const allExtra = results.flat();
            if (allExtra.length > 0) {
              setExtraMonthRecords(prev => {
                const map = new Map<string, MaintenanceRecord>();
                prev.forEach(r => map.set(r.id, r));
                allExtra.forEach(r => map.set(r.id, r));
                return Array.from(map.values());
              });
            }
          })
          .catch(e => console.warn('Erro ao carregar registros de meses adicionais:', e));
      }
    } catch (e) {
      console.warn('Erro ao calcular meses do período:', e);
    }
  }, [dateFilterMode, periodStartDate, periodEndDate, records]);

  // Sistema de indexação canônico de técnicos em MAIÚSCULAS
  const techIndex = useMemo(() => buildTechnicianIndex(techs), [techs]);

  // 1. Resumo por Técnico (Indexado com ID único e titularidade exclusiva)
  const techSummary = useMemo(() => {
    // Constrói lista estruturada de técnicos avaliando as demandas para cada técnico
    const rawList = techIndex.indexedTechs.map(it => {
      // 1.1 Preventivas onde o técnico é o titular (Técnico 1)
      const seenPrevIds = new Set<string>();
      let techPrevCount = 0;
      let techPrevCompleted = 0;
      let techPrevMachines = 0;

      combinedRecords.forEach(r => {
        if (!r) return;
        let matchesFilter = false;
        let isCompleted = false;

        if (dateFilterMode === 'day') {
          if (!r.plannedDate) return;
          const rDate = (r.plannedDate || '').split('T')[0].trim();
          if (rDate !== selectedDate.trim()) return;
          matchesFilter = true;
          isCompleted = r.status === MaintenanceStatus.COMPLETED || r.status === MaintenanceStatus.PRE_COMPLETED;
        } else {
          // Modo Período: busca serviços realizados no determinado período
          const rExecDate = getRecordServiceDate(r);
          if (!rExecDate) return;
          if (periodStartDate && rExecDate < periodStartDate) return;
          if (periodEndDate && rExecDate > periodEndDate) return;
          matchesFilter = true;
          isCompleted = r.status === MaintenanceStatus.COMPLETED || r.status === MaintenanceStatus.PRE_COMPLETED || Boolean(r.completionDate);
        }

        if (!matchesFilter) return;

        const addr = addresses.find(a => a.id === r.addressId);
        if (managerClientId && addr?.clientId !== managerClientId) return;

        // Titularidade exclusiva: Técnico 1
        const titularField = r.technician1 || '';
        if (!techIndex.matchesTechTitular(titularField, it.id)) return;

        const dedupKey = r.id || (addr ? `${addr.id}_${r.plannedDate}` : `${r.addressId}_${r.plannedDate}`);
        if (seenPrevIds.has(dedupKey)) return;
        seenPrevIds.add(dedupKey);

        techPrevCount += 1;
        techPrevMachines += (addr?.totalMachines || 0);
        if (isCompleted) {
          techPrevCompleted += 1;
        }
      });

      // 1.2 Corretivas / O.S. onde o técnico é o titular exclusivo (technicianId)
      let techOSCount = 0;
      let techOSCompleted = 0;
      let techOSMachines = 0;

      serviceOrders.forEach(os => {
        if (!os || os.status === 'cancelada') return;
        let matchesFilter = false;

        if (dateFilterMode === 'day') {
          if (!checkOSMatchesDate(os, selectedDate)) return;
          matchesFilter = true;
        } else {
          // No modo período para buscar serviços realizados: considera a data de finalização!
          const osFinalizedDate = getOSFinalizationDate(os);
          if (!osFinalizedDate) return;
          if (periodStartDate && osFinalizedDate < periodStartDate) return;
          if (periodEndDate && osFinalizedDate > periodEndDate) return;
          matchesFilter = true;
        }

        if (!matchesFilter) return;

        const addr = addresses.find(a => a.id === os.addressId);
        if (managerClientId && addr?.clientId !== managerClientId) return;

        // Titularidade exclusiva da OS: não duplica entre titular e ajudante
        const titularField = os.technicianId || (os as any).technician1 || '';
        if (!techIndex.matchesTechTitular(titularField, it.id)) return;

        techOSCount += 1;
        techOSMachines += (os.equipmentName ? 1 : (addr?.totalMachines || 1));
        if (os.status === 'finalizada') {
          techOSCompleted += 1;
        }
      });

      const totalCount = techPrevCount + techOSCount;
      const completedCount = techPrevCompleted + techOSCompleted;
      const machinesCount = techPrevMachines + techOSMachines;

      return {
        id: it.id,
        indexedCode: it.indexedCode,
        name: it.name,
        count: totalCount,
        completedCount,
        machinesCount,
        isIdle: totalCount === 0
      };
    });

    // REGRA DE ORDENAÇÃO: PRIMEIRO todos os técnicos com atendimento no período (por quantidade desc e alfabético),
    // EM SEGUIDA todos os que não possuem atendimentos (em ordem alfabética)
    const activeTechs = rawList.filter(t => t.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const idleTechs = rawList.filter(t => t.count === 0).sort((a, b) => a.name.localeCompare(b.name));
    const list = [...activeTechs, ...idleTechs];

    const activeTechsCount = activeTechs.length;
    const idleTechsCount = idleTechs.length;
    const totalDemandsCount = list.reduce((sum, t) => sum + t.count, 0);
    const totalCompletedCount = list.reduce((sum, t) => sum + t.completedCount, 0);
    const totalMachinesCount = list.reduce((sum, t) => sum + t.machinesCount, 0);

    return {
      list,
      activeTechs,
      idleTechs,
      activeTechsCount,
      idleTechsCount,
      totalDemandsCount,
      totalCompletedCount,
      totalMachinesCount
    };
  }, [combinedRecords, serviceOrders, techIndex, addresses, dateFilterMode, selectedDate, periodStartDate, periodEndDate, managerClientId]);

  // 2. Extração e Construção das Demandas do Roteiro / Serviços Realizados no Período
  const allDemandsForDate = useMemo<ItineraryDemandItem[]>(() => {
    const seenAddressKeys = new Set<string>();

    // 2.1 Preventivas
    const preventives: ItineraryDemandItem[] = [];

    combinedRecords.forEach((r, idx) => {
      let matchesFilter = false;
      let isCompleted = false;
      let serviceDateFormatted: string | undefined = undefined;
      let serviceDateRaw: string | undefined = undefined;

      if (dateFilterMode === 'day') {
        if (!r.plannedDate) return;
        const rDate = (r.plannedDate || '').split('T')[0].trim();
        if (rDate !== selectedDate.trim()) return;
        matchesFilter = true;
        isCompleted = r.status === MaintenanceStatus.COMPLETED || r.status === MaintenanceStatus.PRE_COMPLETED;
        serviceDateFormatted = r.plannedDate ? format(parseISO(r.plannedDate.split('T')[0] + 'T12:00:00'), 'dd/MM/yyyy') : undefined;
        serviceDateRaw = rDate;
      } else {
        // Modo Período: busca os serviços realizados nesse determinado período
        const rExecDate = getRecordServiceDate(r);
        if (!rExecDate) return;
        if (periodStartDate && rExecDate < periodStartDate) return;
        if (periodEndDate && rExecDate > periodEndDate) return;
        matchesFilter = true;
        isCompleted = r.status === MaintenanceStatus.COMPLETED || r.status === MaintenanceStatus.PRE_COMPLETED || Boolean(r.completionDate);
        serviceDateFormatted = rExecDate ? format(parseISO(rExecDate + 'T12:00:00'), 'dd/MM/yyyy') : undefined;
        serviceDateRaw = rExecDate;
      }

      if (!matchesFilter) return;

      const addr = addresses.find(a => a.id === r.addressId);
      if (managerClientId && addr?.clientId !== managerClientId) return;

      // REGRA: O roteiro é filtrado pelo técnico titular da preventiva (Técnico 1)
      if (selectedTech) {
        const titularField = r.technician1 || '';
        if (!techIndex.matchesTechTitular(titularField, selectedTech)) return;
      }

      // Desduplicação resiliente por ID de registro (ou ID de endereço e data) para não omitir atendimentos reais
      const dedupKey = r.id || (addr ? `${addr.id}_${r.plannedDate}` : `${r.addressId}_${r.plannedDate}`);

      if (seenAddressKeys.has(dedupKey)) return;
      seenAddressKeys.add(dedupKey);

      const client = addr ? clients.find(c => c.id === addr.clientId) : null;

      // Código de referência limpo
      const numCode = r.id ? r.id.replace(/\D/g, '') : '';
      const formattedCode = numCode.length >= 4 ? `PREV-${numCode.slice(-4)}` : `PREV-${25000 + idx}`;

      const t1 = (r.technician1 || '').trim() || 'Não Definido';
      const t2 = (r.technician2 || '').trim() || undefined;

      const effectiveOrder = (r as any).dailyOrder ?? r.itineraryOrder ?? (idx + 1);

      preventives.push({
        id: r.id,
        type: 'preventive',
        order: effectiveOrder,
        code: formattedCode,
        clientName: client?.name || 'Cliente Sem Nome',
        clientCode: client?.id?.slice(-4),
        street: addr?.street ? `${addr.street}${addr.number ? `, ${addr.number}` : ''}` : 'Endereço não cadastrado',
        neighborhood: addr?.neighborhood || 'Bairro não informado',
        city: addr?.city || 'Maceió - AL',
        coordinates: addr?.coordinates,
        machinesCount: addr?.totalMachines || 0,
        tech1: t1,
        tech2: t2,
        status: isCompleted ? 'completed' : 'pending',
        statusLabel: isCompleted ? 'Atendido' : 'Pendente',
        completionTime: r.completionDate ? format(parseISO(r.completionDate), 'HH:mm') : undefined,
        serviceDate: serviceDateFormatted,
        serviceDateRaw,
        notes: r.notes || r.routeNotes,
        record: r
      });
    });

    // 2.2 Corretivas / O.S.
    // REGRA MANDATÓRIA DO USUÁRIO: "no caso das ordens de serviço a data a ser considerada é a data de finalização"
    const correctives: ItineraryDemandItem[] = [];

    serviceOrders.forEach((os, idx) => {
      let matchesFilter = false;
      let isCompleted = false;
      let serviceDateFormatted: string | undefined = undefined;
      let serviceDateRaw: string | undefined = undefined;

      if (dateFilterMode === 'day') {
        if (!checkOSMatchesDate(os, selectedDate)) return;
        matchesFilter = true;
        isCompleted = os.status === 'finalizada';
        const displayDate = os.plannedDate || (os.openedAt ? os.openedAt.substring(0, 10) : '') || selectedDate;
        serviceDateFormatted = format(parseISO(displayDate.split('T')[0] + 'T12:00:00'), 'dd/MM/yyyy');
        serviceDateRaw = displayDate.split('T')[0];
      } else {
        // No modo período para buscar serviços realizados: A DATA A SER CONSIDERADA É A DATA DE FINALIZAÇÃO!
        const osFinalizedDate = getOSFinalizationDate(os);
        if (!osFinalizedDate) return; // Apenas serviços finalizados no período
        if (periodStartDate && osFinalizedDate < periodStartDate) return;
        if (periodEndDate && osFinalizedDate > periodEndDate) return;
        matchesFilter = true;
        isCompleted = true; // finalizada no período
        serviceDateFormatted = format(parseISO(osFinalizedDate + 'T12:00:00'), 'dd/MM/yyyy');
        serviceDateRaw = osFinalizedDate;
      }

      if (!matchesFilter) return;

      const addr = addresses.find(a => a.id === os.addressId);
      if (managerClientId && addr?.clientId !== managerClientId) return;

      // REGRA: Técnico titular da O.S. (exclusivo para não duplicar entre técnicos)
      if (selectedTech) {
        const titularField = os.technicianId || (os as any).technician1 || '';
        if (!techIndex.matchesTechTitular(titularField, selectedTech)) return;
      }

      const client = addr ? clients.find(c => c.id === addr.clientId) : null;
      const techObj = techIndex.findTech(os.technicianId);

      const t1 = techObj?.name || os.technicianId || 'Não Definido';
      const t2 = (os as any).helperTechnician || (os as any).technician2 || (os.technician2Id ? (techIndex.findTech(os.technician2Id)?.name || os.technician2Id) : undefined);

      const effectiveOrder = (os as any).dailyOrder ?? (preventives.length + idx + 1);

      // Horário de finalização da OS
      const completionTimeStr = os.finishedAt 
        ? (typeof os.finishedAt === 'string' && os.finishedAt.includes('T') ? format(parseISO(os.finishedAt), 'HH:mm') : undefined)
        : os.adminFinalizedAt && typeof os.adminFinalizedAt === 'string' && os.adminFinalizedAt.includes('T')
          ? format(parseISO(os.adminFinalizedAt), 'HH:mm')
          : undefined;

      correctives.push({
        id: os.id,
        type: 'corrective',
        order: effectiveOrder,
        code: os.osNumber ? `OS #${os.osNumber}` : `OS #${os.id.slice(-4).toUpperCase()}`,
        clientName: client?.name || os.clientName || 'Cliente Sem Nome',
        clientCode: client?.id?.slice(-4),
        street: addr?.street ? `${addr.street}${addr.number ? `, ${addr.number}` : ''}` : os.addressStreet || 'Endereço da O.S.',
        neighborhood: addr?.neighborhood || 'Centro',
        city: addr?.city || 'Maceió - AL',
        coordinates: addr?.coordinates,
        machinesCount: os.equipmentName ? 1 : (addr?.totalMachines || 0),
        tech1: t1,
        tech2: t2,
        status: isCompleted ? 'completed' : 'pending',
        statusLabel: isCompleted ? 'Atendido' : 'Pendente',
        completionTime: completionTimeStr,
        serviceDate: serviceDateFormatted,
        serviceDateRaw,
        notes: os.description,
        serviceOrder: os
      });
    });

    const combined = [...preventives, ...correctives];
    
    // Se for modo período, ordena cronologicamente pelas mais recentes primeiro; se modo diário, pela sequência da rota
    if (dateFilterMode === 'period') {
      combined.sort((a, b) => {
        const dateA = a.serviceDateRaw || '';
        const dateB = b.serviceDateRaw || '';
        if (dateA !== dateB) return dateB.localeCompare(dateA); // mais recente primeiro
        return a.order - b.order;
      });
    } else {
      combined.sort((a, b) => a.order - b.order);
    }

    return combined;
  }, [combinedRecords, serviceOrders, addresses, clients, techs, dateFilterMode, selectedDate, periodStartDate, periodEndDate, selectedTech, managerClientId]);

  // 3. Aplica Filtros de Tipo, Status e Busca Textual
  const filteredDemands = useMemo(() => {
    return allDemandsForDate.filter(item => {
      // Filtro de Tipo
      if (typeFilter === 'preventive' && item.type !== 'preventive') return false;
      if (typeFilter === 'corrective' && item.type !== 'corrective') return false;

      // Filtro de Status
      if (statusFilter === 'pending' && item.status !== 'pending') return false;
      if (statusFilter === 'completed' && item.status !== 'completed') return false;

      // Busca por texto transformando tudo em MAIÚSCULAS para ignorar maiúsculas/minúsculas e acentuações
      if (searchTerm.trim()) {
        const qUpper = normalizeTechString(searchTerm);
        const matchesClient = normalizeTechString(item.clientName).includes(qUpper);
        const matchesStreet = normalizeTechString(item.street).includes(qUpper);
        const matchesNeighborhood = normalizeTechString(item.neighborhood).includes(qUpper);
        const matchesCode = (item.code || '').toUpperCase().includes(qUpper);
        const matchesTech = normalizeTechString(item.tech1).includes(qUpper) || (item.tech2 ? normalizeTechString(item.tech2).includes(qUpper) : false);
        const t1Obj = techIndex.findTech(item.tech1);
        const t2Obj = techIndex.findTech(item.tech2);
        const matchesCodeTech = Boolean((t1Obj && t1Obj.indexedCode.toUpperCase().includes(qUpper)) || (t2Obj && t2Obj.indexedCode.toUpperCase().includes(qUpper)));
        if (!matchesClient && !matchesStreet && !matchesNeighborhood && !matchesCode && !matchesTech && !matchesCodeTech) {
          return false;
        }
      }

      return true;
    });
  }, [allDemandsForDate, typeFilter, statusFilter, searchTerm]);

  // Reordenação na Rota (Subir / Descer a parada)
  const handleMoveDemand = async (indexInList: number, direction: 'up' | 'down') => {
    if (isReadOnly || isReordering) return;
    const targetIndex = direction === 'up' ? indexInList - 1 : indexInList + 1;
    if (targetIndex < 0 || targetIndex >= filteredDemands.length) return;

    setIsReordering(true);
    try {
      const current = filteredDemands[indexInList];
      const target = filteredDemands[targetIndex];

      const newOrderForCurrent = target.order;
      const newOrderForTarget = current.order === target.order 
        ? (direction === 'up' ? target.order + 1 : target.order - 1)
        : current.order;

      // Persiste a nova ordem da rota
      if (current.type === 'preventive' && current.record) {
        await onUpdateRecord(current.record, { itineraryOrder: newOrderForCurrent });
      }
      if (target.type === 'preventive' && target.record) {
        await onUpdateRecord(target.record, { itineraryOrder: newOrderForTarget });
      }
    } catch (e) {
      console.error('Erro ao reordenar rota diária:', e);
    } finally {
      setIsReordering(false);
    }
  };

  // Dispara a impressão limpa
  const handlePrint = () => {
    window.print();
  };

  const formattedDateTitle = useMemo(() => {
    if (dateFilterMode === 'period') {
      try {
        const startStr = periodStartDate ? format(parseISO(periodStartDate + 'T12:00:00'), "dd/MM/yyyy") : 'Início';
        const endStr = periodEndDate ? format(parseISO(periodEndDate + 'T12:00:00'), "dd/MM/yyyy") : 'Hoje';
        return `Período: ${startStr} a ${endStr}`;
      } catch {
        return `Período: ${periodStartDate} a ${periodEndDate}`;
      }
    }
    try {
      return format(parseISO(selectedDate + 'T12:00:00'), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return selectedDate;
    }
  }, [dateFilterMode, selectedDate, periodStartDate, periodEndDate]);

  // Métricas do conjunto filtrado
  const filteredMetrics = useMemo(() => {
    const total = filteredDemands.length;
    const completed = filteredDemands.filter(d => d.status === 'completed').length;
    const pending = total - completed;
    const machines = filteredDemands.reduce((sum, d) => sum + (d.machinesCount || 0), 0);
    const clientsCount = new Set(filteredDemands.map(d => d.clientName)).size;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending, machines, clientsCount, pct };
  }, [filteredDemands]);

  return (
    <div className="space-y-2.5">
      
      {/* 1. BARRA SUPERIOR CONDENSADA (Navegação de Data + KPIs em Linha + Ações Rápidas) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2.5 sm:p-3 shadow-xs print:hidden">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          
          {/* Navegador de Data Compacto com Alternância Dia vs Período */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Seletor de Modo: Por Dia vs Por Período */}
            <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200 text-xs font-bold shrink-0">
              <button
                type="button"
                onClick={() => setDateFilterMode('day')}
                className={cn(
                  "px-2.5 py-1 rounded-lg transition-all cursor-pointer text-[11px] flex items-center gap-1",
                  dateFilterMode === 'day' 
                    ? "bg-white text-blue-700 shadow-2xs font-black" 
                    : "text-slate-600 hover:text-slate-900"
                )}
                title="Filtrar por data diária específica"
              >
                <Calendar className="w-3 h-3 text-blue-600" />
                <span>Por Dia</span>
              </button>

              <button
                type="button"
                onClick={() => setDateFilterMode('period')}
                className={cn(
                  "px-2.5 py-1 rounded-lg transition-all cursor-pointer text-[11px] flex items-center gap-1",
                  dateFilterMode === 'period' 
                    ? "bg-white text-indigo-700 shadow-2xs font-black" 
                    : "text-slate-600 hover:text-slate-900"
                )}
                title="Filtrar por período de data personalizado para buscar serviços realizados"
              >
                <Clock className="w-3 h-3 text-indigo-600" />
                <span>Por Período</span>
              </button>
            </div>

            {/* MODO DIA: Navegação anterior/hoje/próximo e input date */}
            {dateFilterMode === 'day' ? (
              <>
                <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200">
                  <button
                    type="button"
                    onClick={handlePrevDay}
                    className="p-1 hover:bg-white text-slate-700 rounded-lg transition-all cursor-pointer shadow-none hover:shadow-xs"
                    title="Dia anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleSetToday}
                    className="px-2.5 py-0.5 hover:bg-white text-slate-700 font-extrabold text-[11px] rounded-lg transition-all cursor-pointer"
                  >
                    Hoje
                  </button>

                  <button
                    type="button"
                    onClick={handleNextDay}
                    className="p-1 hover:bg-white text-slate-700 rounded-lg transition-all cursor-pointer shadow-none hover:shadow-xs"
                    title="Próximo dia"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Input de Data */}
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl">
                  <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
                  />
                </div>

                <span className="text-xs font-black text-slate-700 capitalize hidden md:inline-block">
                  {formattedDateTitle}
                </span>
              </>
            ) : (
              /* MODO PERÍODO: Período personalizado de datas (De ... Até ...) */
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-xl">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">De:</span>
                  <input
                    type="date"
                    value={periodStartDate}
                    onChange={(e) => setPeriodStartDate(e.target.value)}
                    className="text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
                  />
                </div>

                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-xl">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Até:</span>
                  <input
                    type="date"
                    value={periodEndDate}
                    onChange={(e) => setPeriodEndDate(e.target.value)}
                    className="text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
                  />
                </div>

                {/* Atalhos Rápidos de Período */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      const todayStr = format(new Date(), 'yyyy-MM-dd');
                      setPeriodStartDate(todayStr);
                      setPeriodEndDate(todayStr);
                    }}
                    className="px-2 py-0.5 hover:bg-white text-slate-700 rounded-md transition-all cursor-pointer"
                    title="Hoje"
                  >
                    Hoje
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPeriodStartDate(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
                      setPeriodEndDate(format(new Date(), 'yyyy-MM-dd'));
                    }}
                    className="px-2 py-0.5 hover:bg-white text-slate-700 rounded-md transition-all cursor-pointer"
                    title="Últimos 7 dias"
                  >
                    7 dias
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      setPeriodStartDate(format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd'));
                      setPeriodEndDate(format(new Date(), 'yyyy-MM-dd'));
                    }}
                    className="px-2 py-0.5 hover:bg-white text-slate-700 rounded-md transition-all cursor-pointer"
                    title="Mês atual"
                  >
                    Mês Atual
                  </button>
                </div>

                <span className="text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded-lg hidden lg:inline-block">
                  {formattedDateTitle}
                </span>
              </div>
            )}
          </div>

          {/* KPI STRIP HORIZONTAL (Métricas em linha única compacta) */}
          <div className="flex items-center gap-2 flex-wrap bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-xl text-xs font-bold">
            <div className="flex items-center gap-1 text-slate-700" title={dateFilterMode === 'period' ? "Técnicos com serviços no período" : "Técnicos com atendimentos nesta data"}>
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span>Técnicos:</span>
              <span className="font-black text-blue-700">{techSummary.activeTechsCount}/{techs.length}</span>
            </div>

            <span className="text-slate-300">|</span>

            <div className="flex items-center gap-1 text-slate-700" title={dateFilterMode === 'period' ? "Total de serviços no período" : "Total de paradas/endereços no dia"}>
              <MapPin className="w-3.5 h-3.5 text-indigo-600" />
              <span>{dateFilterMode === 'period' ? 'Serviços:' : 'Paradas:'}</span>
              <span className="font-black text-indigo-700">{techSummary.totalDemandsCount}</span>
            </div>

            <span className="text-slate-300">|</span>

            <div className="flex items-center gap-1 text-slate-700" title="Total de máquinas em atendimento">
              <Wrench className="w-3.5 h-3.5 text-slate-500" />
              <span>Máquinas:</span>
              <span className="font-black text-slate-800">{techSummary.totalMachinesCount}</span>
            </div>

            <span className="text-slate-300">|</span>

            <div className="flex items-center gap-1 text-slate-700" title="Atendimentos concluídos">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Concluídos:</span>
              <span className="font-black text-emerald-700">
                {techSummary.totalCompletedCount}/{techSummary.totalDemandsCount}
                <span className="text-[10px] font-bold text-emerald-600 ml-0.5">
                  ({techSummary.totalDemandsCount > 0 ? Math.round((techSummary.totalCompletedCount / techSummary.totalDemandsCount) * 100) : 0}%)
                </span>
              </span>
            </div>
          </div>

          {/* Ações da Rota */}
          <div className="flex items-center gap-1.5 self-end lg:self-auto shrink-0">
            {onOpenAddOSModal && !isReadOnly && (
              <button
                type="button"
                onClick={onOpenAddOSModal}
                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center gap-1 transition-all cursor-pointer active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agendar OS</span>
              </button>
            )}

            {onRefreshData && (
              <button
                type="button"
                onClick={onRefreshData}
                className="p-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer shadow-xs"
                title="Atualizar dados do servidor"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>
          </div>

        </div>

      </div>

      {/* 2. CORPO PRINCIPAL: COLUNA LATERAL VERTICAL DE TÉCNICOS + PLANILHA COMPACTA */}
      <div className="flex flex-col lg:flex-row gap-3 items-start">
        
        {/* COLUNA LATERAL VERTICAL: TÉCNICOS QUE TÊM ATENDIMENTOS NO DIA */}
        <aside className="w-full lg:w-64 xl:w-72 shrink-0 bg-white border border-slate-200 rounded-2xl p-3 shadow-xs space-y-2.5 print:hidden">
          
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h3 className="font-black text-xs text-slate-900 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                <span>Técnicos ({techs.length})</span>
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                {dateFilterMode === 'period' ? 'Serviços realizados no período' : 'Roteiro pelo Técnico 1 (Titular)'}
              </p>
            </div>
            <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 font-extrabold px-1.5 py-0.5 rounded-md">
              {dateFilterMode === 'period' ? `${techSummary.activeTechsCount} ativos` : `${techSummary.activeTechsCount} no dia`}
            </span>
          </div>

          {/* Botão de Visão Geral: Todas as Rotas */}
          <button
            type="button"
            onClick={() => setSelectedTech(null)}
            className={cn(
              "w-full text-left p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between border",
              selectedTech === null
                ? "bg-blue-600 text-white border-blue-600 shadow-sm font-extrabold"
                : "bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold border-slate-200"
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0",
                selectedTech === null ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
              )}>
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs block truncate">Todas as Rotas</span>
                <span className={cn(
                  "text-[10px] font-normal block",
                  selectedTech === null ? "text-blue-100" : "text-slate-400"
                )}>
                  Visão consolidada
                </span>
              </div>
            </div>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full font-black shrink-0",
              selectedTech === null ? "bg-white text-blue-700" : "bg-slate-200 text-slate-800"
            )}>
              {techSummary.totalDemandsCount}
            </span>
          </button>

          {/* LISTA VERTICAL DE TÉCNICOS (Ordenados: primeiros os com atendimento, depois livres) */}
          <div className="space-y-1 max-h-[560px] overflow-y-auto pr-0.5">
            {techSummary.list.map((tech, idx) => {
              const isSelected = selectedTech?.trim().toLowerCase() === tech.name.trim().toLowerCase();
              const hasDemands = tech.count > 0;
              const isFirstIdle = !hasDemands && (idx === 0 || techSummary.list[idx - 1].count > 0);
              const isFirstActive = hasDemands && idx === 0;

              return (
                <React.Fragment key={tech.id}>
                  {isFirstActive && (
                    <div className="pt-1 pb-0.5 px-1 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-blue-700">
                      <span>Com Atendimentos ({techSummary.activeTechsCount})</span>
                    </div>
                  )}

                  {isFirstIdle && (
                    <div className="pt-2 pb-0.5 px-1 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span>Disponíveis / Livres ({techSummary.idleTechsCount})</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedTech(tech.name)}
                    className={cn(
                      "w-full text-left p-2 rounded-xl transition-all cursor-pointer flex items-center justify-between border",
                      isSelected
                        ? "bg-blue-50 border-blue-500 text-blue-950 font-black shadow-2xs ring-1 ring-blue-500"
                        : hasDemands
                          ? "bg-white hover:bg-slate-50 border-slate-200 text-slate-800"
                          : "bg-slate-50/60 hover:bg-slate-100/70 border-slate-150 text-slate-600"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Avatar / Inicial */}
                      <div className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0",
                        isSelected 
                          ? "bg-blue-600 text-white" 
                          : hasDemands 
                            ? "bg-blue-100 text-blue-800" 
                            : "bg-slate-100 text-slate-400"
                      )}>
                        {tech.name.substring(0, 2).toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className={cn(
                            "text-[8px] font-black px-1.5 py-0.2 rounded border shrink-0",
                            isSelected
                              ? "bg-blue-700 text-white border-blue-500"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          )}>
                            {tech.indexedCode}
                          </span>
                          <p className={cn("text-xs truncate", isSelected ? "font-black text-blue-950" : hasDemands ? "font-black text-slate-900" : "font-semibold text-slate-600")}>
                            {tech.name}
                          </p>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {hasDemands ? `${tech.machinesCount} máq` : 'Livre'}
                        </p>
                      </div>
                    </div>

                    {/* Badge de quantidade de paradas */}
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-black shrink-0 ml-1.5",
                      isSelected 
                        ? "bg-blue-600 text-white" 
                        : hasDemands 
                          ? "bg-blue-50 text-blue-700 border border-blue-200" 
                          : "text-slate-400"
                    )}>
                      {tech.count}
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {/* Dica da Regra de Roteirização */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[10px] text-slate-500 space-y-1">
            <div className="flex items-center gap-1 font-bold text-slate-700">
              <HelpCircle className="w-3 h-3 text-blue-600 shrink-0" />
              <span>Regra do Roteiro:</span>
            </div>
            <p>
              O roteiro contabiliza os atendimentos do técnico tanto como <strong>Técnico 1</strong> (titular) quanto como <strong>Técnico 2</strong> (ajudante/auxiliar).
            </p>
          </div>

        </aside>

        {/* ÁREA DA PLANILHA COMPACTA (Lado direito, aproveitando o espaço restante) */}
        <main className="flex-1 min-w-0 space-y-2">
          
          {/* TOOLBAR DA PLANILHA (Busca, Filtros e Controle de Densidade) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-2.5 sm:p-3 shadow-xs flex flex-wrap items-center justify-between gap-2 print:hidden">
            
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-900">
                {selectedTech ? `Roteiro: ${selectedTech}` : 'Todas as Rotas da Operação'}
              </span>
              <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                {filteredDemands.length} {filteredDemands.length === 1 ? 'endereço' : 'endereços'}
              </span>
            </div>

            {/* Controles de Filtro e Densidade da Planilha */}
            <div className="flex items-center gap-2 flex-wrap ml-auto">
              
              {/* Campo de Busca Rápida */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filtrar por cliente, rua, bairro..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 focus:bg-white text-slate-700 font-medium w-44 sm:w-52 transition-all"
                />
              </div>

              {/* Filtro de Tipo */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">Todas Demandas</option>
                <option value="preventive">Apenas Preventivas</option>
                <option value="corrective">Apenas O.S.</option>
              </select>

              {/* Filtro de Status */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">Todos Status</option>
                <option value="pending">Apenas Pendentes</option>
                <option value="completed">Apenas Concluídos</option>
              </select>

              {/* Seletor de Densidade (Ultra Compacto vs Compacto) */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setDensity('compact')}
                  className={cn(
                    "px-2 py-1 rounded-lg transition-all cursor-pointer text-[11px]",
                    density === 'compact' ? "bg-white text-blue-700 shadow-2xs font-black" : "text-slate-600 hover:text-slate-900"
                  )}
                  title="Densidade Compacta"
                >
                  Compacta
                </button>
                <button
                  type="button"
                  onClick={() => setDensity('ultra')}
                  className={cn(
                    "px-2 py-1 rounded-lg transition-all cursor-pointer text-[11px]",
                    density === 'ultra' ? "bg-white text-blue-700 shadow-2xs font-black" : "text-slate-600 hover:text-slate-900"
                  )}
                  title="Densidade Ultra Compacta: visualiza mais linhas de endereços no mesmo espaço"
                >
                  Ultra
                </button>
              </div>

              {/* Alternância Tabela Planilha vs Cards */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={cn(
                    "px-2 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-[11px]",
                    viewMode === 'table' ? "bg-white text-blue-700 shadow-2xs font-black" : "text-slate-600 hover:text-slate-900"
                  )}
                  title="Planilha (mais compacta, ampla e com mais endereços visíveis)"
                >
                  <TableIcon className="w-3.5 h-3.5 text-blue-600" />
                  <span>Planilha</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={cn(
                    "px-2 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-[11px]",
                    viewMode === 'cards' ? "bg-white text-blue-700 shadow-2xs font-black" : "text-slate-600 hover:text-slate-900"
                  )}
                  title="Cards Detalhados"
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  <span>Cards</span>
                </button>
              </div>

            </div>

          </div>

          {/* ESTADO VAZIO: NENHUMA DEMANDA */}
          {filteredDemands.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="font-black text-slate-800 text-sm">
                Nenhum endereço encontrado para esta data
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {selectedTech 
                  ? `O técnico ${selectedTech} não possui demandas agendadas nesta data.` 
                  : `Não há preventivas ou ordens de serviço programadas para ${formattedDateTitle}.`}
              </p>
              {onOpenAddOSModal && !isReadOnly && (
                <button
                  type="button"
                  onClick={onOpenAddOSModal}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agendar Atendimento nesta Data</span>
                </button>
              )}
            </div>
          )}

          {/* MODO PLANILHA COMPACTA (ALTA DENSIDADE, VISÃO AMPLA E SEM ROLAGEM EXCESSIVA) */}
          {filteredDemands.length > 0 && viewMode === 'table' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200 sticky top-0 z-10 select-none text-[10px] uppercase tracking-wider">
                    <tr className="divide-x divide-slate-200">
                      <th className={cn("text-center w-12 bg-slate-100", density === 'ultra' ? "py-1.5 px-1" : "py-2 px-1.5")}>#</th>
                      <th className={cn("text-center w-14 bg-slate-100", density === 'ultra' ? "py-1.5 px-1.5" : "py-2 px-2")}>Tipo</th>
                      <th className={cn("text-center w-20 bg-slate-100 font-mono", density === 'ultra' ? "py-1.5 px-1.5" : "py-2 px-2")}>Cód</th>
                      <th className={cn("bg-slate-100 min-w-[140px] max-w-[200px]", density === 'ultra' ? "py-1.5 px-2" : "py-2 px-3")}>Cliente</th>
                      <th className={cn("bg-slate-100 min-w-[260px]", density === 'ultra' ? "py-1.5 px-2" : "py-2 px-3")}>Endereço Completo (Rua e Nº)</th>
                      <th className={cn("bg-slate-100 min-w-[120px]", density === 'ultra' ? "py-1.5 px-2" : "py-2 px-3")}>Bairro / Cidade</th>
                      <th className={cn("bg-slate-100 min-w-[120px]", density === 'ultra' ? "py-1.5 px-2" : "py-2 px-3")}>Técnico 1 (Titular)</th>
                      <th className={cn("bg-slate-100 min-w-[100px]", density === 'ultra' ? "py-1.5 px-2" : "py-2 px-3")}>Ajudante (Téc 2)</th>
                      <th className={cn("text-center w-12 bg-slate-100", density === 'ultra' ? "py-1.5 px-1.5" : "py-2 px-2")}>Máq</th>
                      <th className={cn("text-center w-24 bg-slate-100", density === 'ultra' ? "py-1.5 px-1.5" : "py-2 px-2")}>Status</th>
                      <th className={cn("text-center w-14 bg-slate-100 print:hidden", density === 'ultra' ? "py-1.5 px-1" : "py-2 px-1.5")}>GPS</th>
                      <th className={cn("text-center w-20 bg-slate-100 print:hidden", density === 'ultra' ? "py-1.5 px-1.5" : "py-2 px-2")}>Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredDemands.map((demand, index) => {
                      const isFirst = index === 0;
                      const isLast = index === filteredDemands.length - 1;
                      const isCompleted = demand.status === 'completed';
                      const mapsUrl = demand.coordinates 
                        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(demand.coordinates)}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${demand.street}, ${demand.city}`)}`;

                      return (
                        <tr 
                          key={demand.id}
                          className={cn(
                            "divide-x divide-slate-100 transition-colors group",
                            isCompleted 
                              ? "bg-emerald-50/20 hover:bg-emerald-50/40" 
                              : index % 2 === 0 ? "bg-white hover:bg-blue-50/40" : "bg-slate-50/50 hover:bg-blue-50/40"
                          )}
                        >
                          {/* 1. Seq / Ordem na Rota */}
                          <td className={cn("text-center", density === 'ultra' ? "py-1 px-1" : "py-1.5 px-1.5")}>
                            <div className="flex items-center justify-center gap-0.5">
                              <span className={cn(
                                "rounded font-black text-[10px] inline-flex items-center justify-center shrink-0",
                                density === 'ultra' ? "w-5 h-4 text-[9px]" : "w-6 h-5",
                                isCompleted ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                              )}>
                                {index + 1}º
                              </span>
                              {!isReadOnly && (
                                <div className="flex flex-col -space-y-1.5 print:hidden shrink-0">
                                  <button
                                    type="button"
                                    disabled={isFirst || isReordering}
                                    onClick={() => handleMoveDemand(index, 'up')}
                                    className="text-slate-400 hover:text-blue-600 disabled:opacity-20 cursor-pointer p-0.5"
                                    title="Mover acima na rota"
                                  >
                                    <ChevronUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isLast || isReordering}
                                    onClick={() => handleMoveDemand(index, 'down')}
                                    className="text-slate-400 hover:text-blue-600 disabled:opacity-20 cursor-pointer p-0.5"
                                    title="Mover abaixo na rota"
                                  >
                                    <ChevronDown className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* 2. Tipo */}
                          <td className={cn("text-center", density === 'ultra' ? "py-1 px-1" : "py-1.5 px-1.5")}>
                            <span className={cn(
                              "font-black uppercase px-1 py-0.2 rounded tracking-tight inline-block border text-[9px]",
                              demand.type === 'preventive' 
                                ? "bg-blue-50 text-blue-700 border-blue-200" 
                                : "bg-purple-50 text-purple-700 border-purple-200"
                            )}>
                              {demand.type === 'preventive' ? 'PREV' : 'O.S.'}
                            </span>
                          </td>

                          {/* 3. Código */}
                          <td className={cn("text-center font-mono font-bold text-slate-600 text-[10px]", density === 'ultra' ? "py-1 px-1" : "py-1.5 px-1.5")}>
                            {demand.code}
                          </td>

                          {/* 4. Cliente */}
                          <td className={cn("font-black text-slate-900 max-w-[200px]", density === 'ultra' ? "py-1 px-2 text-[11px]" : "py-1.5 px-3 text-xs")}>
                            <span className="truncate block" title={demand.clientName}>
                              {demand.clientName}
                            </span>
                          </td>

                          {/* 5. Endereço Completo (Rua e Número) */}
                          <td className={cn("text-slate-800", density === 'ultra' ? "py-1 px-2 text-[11px]" : "py-1.5 px-3 text-xs")}>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900">{demand.street}</span>
                              {demand.notes && (
                                <span 
                                  className="text-[9px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded truncate max-w-[160px] inline-block"
                                  title={`Obs: ${demand.notes}`}
                                >
                                  📝 {demand.notes}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 6. Bairro / Cidade */}
                          <td className={cn("text-slate-600", density === 'ultra' ? "py-1 px-2 text-[11px]" : "py-1.5 px-3 text-xs")}>
                            <span className="truncate block">
                              {demand.neighborhood ? `${demand.neighborhood}, ` : ''}{demand.city}
                            </span>
                          </td>

                          {/* 7. Técnico Titular (Técnico 1) */}
                          <td className={cn("font-black text-blue-700", density === 'ultra' ? "py-1 px-2 text-[11px]" : "py-1.5 px-3 text-xs")}>
                            <span className="truncate block max-w-[130px]" title={demand.tech1}>
                              {demand.tech1}
                            </span>
                          </td>

                          {/* 8. Ajudante (Técnico 2) */}
                          <td className={cn("text-slate-600 font-semibold", density === 'ultra' ? "py-1 px-2 text-[11px]" : "py-1.5 px-3 text-xs")}>
                            <span className="truncate block max-w-[110px]" title={demand.tech2 || 'Sem ajudante'}>
                              {demand.tech2 || <span className="text-slate-300 font-normal">-</span>}
                            </span>
                          </td>

                          {/* 9. Máquinas */}
                          <td className={cn("text-center font-bold text-slate-800", density === 'ultra' ? "py-1 px-1 text-[11px]" : "py-1.5 px-2 text-xs")}>
                            {demand.machinesCount > 0 ? (
                              <span className="inline-block bg-slate-100 text-slate-800 px-1.5 py-0.2 rounded font-black text-[10px]">
                                {demand.machinesCount}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>

                          {/* 10. Status */}
                          <td className={cn("text-center", density === 'ultra' ? "py-1 px-1.5" : "py-1.5 px-2")}>
                            {isCompleted ? (
                              <div className="flex flex-col items-center">
                                <span className="text-emerald-700 bg-emerald-100/70 border border-emerald-200 px-1.5 py-0.2 rounded font-black inline-flex items-center gap-0.5 text-[9px] uppercase">
                                  <Check className="w-2.5 h-2.5 text-emerald-700 stroke-[3]" /> Concluído
                                </span>
                                {demand.serviceDate && (
                                  <span className="text-[9px] font-bold text-slate-500 mt-0.5 block" title={demand.completionTime ? `Finalizado às ${demand.completionTime}` : undefined}>
                                    {demand.serviceDate} {demand.completionTime ? `• ${demand.completionTime}` : ''}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center">
                                <span className="text-amber-800 bg-amber-100/70 border border-amber-200 px-1.5 py-0.2 rounded font-black text-[9px] uppercase inline-flex items-center gap-0.5">
                                  <Clock className="w-2.5 h-2.5 text-amber-700" /> Pendente
                                </span>
                                {demand.serviceDate && (
                                  <span className="text-[9px] font-bold text-slate-400 mt-0.5 block">
                                    {demand.serviceDate}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 11. GPS */}
                          <td className={cn("text-center print:hidden", density === 'ultra' ? "py-1 px-1" : "py-1.5 px-1.5")}>
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-all"
                              title="Abrir rota no Google Maps"
                            >
                              <Navigation className="w-3.5 h-3.5" />
                            </a>
                          </td>

                          {/* 12. Ação */}
                          <td className={cn("text-center print:hidden", density === 'ultra' ? "py-1 px-1.5" : "py-1.5 px-2")}>
                            {demand.type === 'preventive' && demand.record && (
                              <button
                                type="button"
                                onClick={() => handleOpenSheetPreview(demand.record!)}
                                className="px-2 py-0.5 bg-slate-900 hover:bg-blue-700 text-white font-extrabold rounded-md shadow-2xs transition-all cursor-pointer text-[10px] inline-flex items-center gap-1 active:scale-95"
                                title="Pré-visualizar folha de atendimento para impressão deste endereço"
                              >
                                <ClipboardCheck className="w-3 h-3 text-blue-400" />
                                <span>Folha</span>
                              </button>
                            )}
                            {demand.type === 'corrective' && demand.serviceOrder && onOpenServiceOrder && (
                              <button
                                type="button"
                                onClick={() => onOpenServiceOrder(demand.serviceOrder!)}
                                className="px-2 py-0.5 bg-purple-700 hover:bg-purple-800 text-white font-extrabold rounded-md shadow-2xs transition-all cursor-pointer text-[10px] inline-flex items-center gap-1 active:scale-95"
                                title="Visualizar Ordem de Serviço"
                              >
                                <Wrench className="w-3 h-3 text-purple-200" />
                                <span>O.S.</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Rodapé resumo da planilha */}
                  <tfoot className="bg-slate-100 border-t border-slate-200 text-[10px] font-bold text-slate-700">
                    <tr className="divide-x divide-slate-200">
                      <td colSpan={4} className="py-1.5 px-2">
                        Total: <strong>{filteredMetrics.total}</strong> endereços no roteiro
                      </td>
                      <td colSpan={4} className="py-1.5 px-2 text-slate-600">
                        {filteredDemands.filter(d => d.type === 'preventive').length} Preventivas • {filteredDemands.filter(d => d.type === 'corrective').length} Corretivas • {filteredMetrics.clientsCount} Clientes
                      </td>
                      <td className="py-1.5 px-1.5 text-center text-slate-900 font-black">
                        {filteredMetrics.machines}
                      </td>
                      <td className="py-1.5 px-1.5 text-center text-emerald-700 font-black">
                        {filteredMetrics.completed} / {filteredMetrics.total} ({filteredMetrics.pct}%)
                      </td>
                      <td colSpan={2} className="py-1.5 px-1.5 print:hidden"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* MODO CARDS ALTERNATIVO */}
          {filteredDemands.length > 0 && viewMode === 'cards' && (
            <div className="space-y-2.5">
              {filteredDemands.map((demand, index) => {
                const mapsUrl = demand.coordinates 
                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(demand.coordinates)}`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${demand.street}, ${demand.city}`)}`;

                const isFirst = index === 0;
                const isLast = index === filteredDemands.length - 1;

                return (
                  <div
                    key={demand.id}
                    className={cn(
                      "bg-white border rounded-2xl p-3.5 shadow-xs transition-all hover:border-slate-300 relative",
                      demand.status === 'completed' ? "border-emerald-200 bg-emerald-50/10" : "border-slate-200"
                    )}
                  >
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                      
                      {/* Lado Esquerdo: Sequência + Informações */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shadow-xs",
                            demand.status === 'completed' ? "bg-emerald-600 text-white" : "bg-blue-600 text-white"
                          )}>
                            {index + 1}º
                          </div>

                          {!isReadOnly && (
                            <div className="flex flex-col gap-0.5 print:hidden">
                              <button
                                type="button"
                                disabled={isFirst || isReordering}
                                onClick={() => handleMoveDemand(index, 'up')}
                                className="p-0.5 text-slate-400 hover:text-blue-600 rounded disabled:opacity-20 cursor-pointer"
                                title="Mover acima"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isLast || isReordering}
                                onClick={() => handleMoveDemand(index, 'down')}
                                className="p-0.5 text-slate-400 hover:text-blue-600 rounded disabled:opacity-20 cursor-pointer"
                                title="Mover abaixo"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 space-y-1 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={cn(
                              "text-[9px] font-black uppercase px-1.5 py-0.2 rounded tracking-wider border",
                              demand.type === 'preventive' ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-purple-50 text-purple-700 border-purple-200"
                            )}>
                              {demand.type === 'preventive' ? 'Preventiva' : 'O.S. (Reparo)'}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-slate-500">{demand.code}</span>
                            {demand.status === 'completed' ? (
                              <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.2 rounded inline-flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                <span>Concluído</span>
                              </span>
                            ) : (
                              <span className="text-[9px] bg-amber-50 text-amber-800 border border-amber-200 font-extrabold px-1.5 py-0.2 rounded inline-flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5 text-amber-600" />
                                <span>Pendente</span>
                              </span>
                            )}
                          </div>

                          <h4 className="font-black text-sm text-slate-900 leading-snug">{demand.clientName}</h4>

                          <div className="flex items-center gap-1.5 text-xs text-slate-600 flex-wrap">
                            <span className="font-semibold text-slate-800">{demand.street}</span>
                            <span className="text-slate-300">•</span>
                            <span>{demand.neighborhood}</span>
                            <span className="text-slate-300">•</span>
                            <span>{demand.city}</span>
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 font-bold inline-flex items-center gap-1 text-[10px] hover:underline ml-1 print:hidden"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              <span>GPS</span>
                            </a>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1 flex-wrap">
                            {demand.serviceDate && (
                              <span className="text-slate-700 font-bold bg-slate-100 px-1.5 py-0.5 rounded">
                                Data: {demand.serviceDate} {demand.completionTime ? `• ${demand.completionTime}` : ''}
                              </span>
                            )}
                            <span>Técnico 1: <strong className="text-blue-700">{demand.tech1}</strong></span>
                            {demand.tech2 && <span>Ajudante: <strong>{demand.tech2}</strong></span>}
                            <span>Máquinas: <strong>{demand.machinesCount}</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* Botão de Ação */}
                      <div className="shrink-0 print:hidden self-end sm:self-center">
                        {demand.type === 'preventive' && demand.record && (
                          <button
                            type="button"
                            onClick={() => handleOpenSheetPreview(demand.record!)}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-xs inline-flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                            title="Pré-visualizar folha de atendimento para impressão deste endereço"
                          >
                            <ClipboardCheck className="w-3.5 h-3.5 text-blue-400" />
                            <span>Folha de Atendimento</span>
                          </button>
                        )}
                        {demand.type === 'corrective' && demand.serviceOrder && onOpenServiceOrder && (
                          <button
                            type="button"
                            onClick={() => onOpenServiceOrder(demand.serviceOrder!)}
                            className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-xs rounded-xl shadow-xs inline-flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                            title="Visualizar Ordem de Serviço"
                          >
                            <Wrench className="w-3.5 h-3.5 text-purple-200" />
                            <span>Ver O.S.</span>
                          </button>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </main>

      </div>

      {/* MODAL DE PRÉ-VISUALIZAÇÃO DA FOLHA DE ATENDIMENTO OFICIAL PARA IMPRESSÃO */}
      {viewingSheetRecord && (() => {
        const currentAddress = addresses.find(a => a.id === viewingSheetRecord.addressId);
        const currentClient = currentAddress ? clients.find(c => c.id === currentAddress.clientId) : null;
        const rawEquips = (equipments && equipments.length > 0 && equipments.some(eq => eq.addressId === viewingSheetRecord.addressId))
          ? equipments.filter(eq => eq.addressId === viewingSheetRecord.addressId)
          : (fetchedEquipments[viewingSheetRecord.addressId] || []);
        const currentEquipments = rawEquips.filter(eq => eq && eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated);

        return (
          <PMOCDocumentViewerModal
            record={viewingSheetRecord}
            address={currentAddress}
            client={currentClient}
            equipments={currentEquipments}
            onClose={() => setViewingSheetRecord(null)}
            onPrint={() => window.print()}
            onOpenChecklistEditor={() => {
              const rec = viewingSheetRecord;
              setViewingSheetRecord(null);
              onOpenChecklist(rec);
            }}
          />
        );
      })()}

    </div>
  );
}

export default ItineraryList;
