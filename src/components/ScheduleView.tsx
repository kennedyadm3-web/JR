import { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Plus, 
  Trash2,
  Filter, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  Paperclip,
  Save,
  Loader2,
  Search,
  X,
  Calendar,
  MapPin,
  Copy,
  Printer,
  ExternalLink,
  MessageSquare,
  Wrench,
  FileSpreadsheet,
  RotateCw,
  Sparkles
} from 'lucide-react';
import { dataService, normalizeAddressText } from '../services/dataService';
import { ImageUploader } from './ImageUploader';
import { Client, Address, MaintenanceRecord, MaintenanceStatus, Technician, ServiceCallStatus, ServiceCallPriority, ServiceCall, UserRole, RouteConfiguration, RouteType, isOSRecord } from '../types';
import { cn, formatDate } from '../lib/utils';
import { format, addMonths, subMonths, startOfMonth, subDays, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MacroTable } from './MacroTable';
import { WeeklyPlanner } from './WeeklyPlanner';

interface Props {
  managerClientId?: string;
  userRole?: string;
}

function getCanonicalAddressKey(clientId: string, street: string, number?: string): string {
  const norm = normalizeAddressText(street || '');
  const num = (number || '').trim().toLowerCase();
  return `${clientId || 'NO_CLIENT'}__${norm}__${num}`;
}

export default function ScheduleView({ managerClientId, userRole }: Props) {
  const isReadOnly = userRole !== UserRole.ADMIN && userRole !== UserRole.ASSISTANT;
  const [currentMonth, setCurrentMonth] = useState(() => {
    try {
      const saved = localStorage.getItem('schedule_currentMonth');
      if (saved && /^\d{4}-\d{2}$/.test(saved)) {
        return saved;
      }
    } catch (e) {}
    return format(new Date(), 'yyyy-MM');
  });

  useEffect(() => {
    localStorage.setItem('schedule_currentMonth', currentMonth);
  }, [currentMonth]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'macro' | 'weekly'>('list');
  const [collapsedRoutes, setCollapsedRoutes] = useState<Record<string, boolean>>({});
  
  const [replicationModal, setReplicationModal] = useState<{
    isOpen: boolean;
    keepTechnicians: boolean;
    keepWeeks: boolean;
  }>({ isOpen: false, keepTechnicians: true, keepWeeks: true });
  
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [routeConfigs, setRouteConfigs] = useState<RouteConfiguration[]>([]);
  const [serviceCalls, setServiceCalls] = useState<ServiceCall[]>([]);
  const [priorityAddressIds, setPriorityAddressIds] = useState<Set<string>>(new Set());
  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean; addressId: string; addressName: string; records: MaintenanceRecord[] } | null>(null);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [modalState, setModalState] = useState<{
    type: 'observation' | 'service_call' | 'attachment' | 'delete';
    record: MaintenanceRecord & { client?: Client; address?: Address };
    value?: string;
    serviceCallDescription?: string;
    serviceCallPriority?: ServiceCallPriority;
    serviceCallAttachmentUrl?: string;
  } | null>(null);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  useEffect(() => {
    loadData();
  }, [currentMonth]);

  const loadData = async () => {
    setLoading(true);

    // Trava de segurança absoluta contra carregamento infinito: garante que a tela nunca fique congelada
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 7000);

    try {
      const prevMonth = format(subMonths(startOfMonth(new Date(currentMonth + '-02')), 1), 'yyyy-MM');
      
      // Carrega os dados essenciais do mês atual com modo leve (sem baixar megabytes de fotos base64 desnecessárias)
      const [addrData, clientData, recordData, techData, callData, configData] = await Promise.all([
        dataService.getAddresses().catch(err => { console.error('Erro ao buscar endereços:', err); return []; }),
        dataService.getClients().catch(err => { console.error('Erro ao buscar clientes:', err); return []; }),
        dataService.getRecords(currentMonth, { lightweight: true }).catch(err => { console.error('Erro ao buscar registros:', err); return []; }),
        dataService.getTechnicians().catch(err => { console.error('Erro ao buscar técnicos:', err); return []; }),
        dataService.getServiceCalls().catch(err => { console.error('Erro ao buscar chamados:', err); return []; }),
        dataService.getRouteConfigs().catch(err => { console.error('Erro ao buscar rotas:', err); return []; })
      ]);

      const filteredRecords = recordData.filter(r => {
        const addr = addrData.find(a => a.id === r.addressId);
        return !managerClientId || addr?.clientId === managerClientId;
      });

      setAddresses(addrData.filter(a => !managerClientId || a.clientId === managerClientId));
      setClients(clientData.filter(c => !managerClientId || c.id === managerClientId));
      setRecords(filteredRecords);
      setTechnicians(techData);
      setRouteConfigs(configData);
      setServiceCalls(callData);

      // Descongela a tela imediatamente para o usuário interagir com o cronograma sem espera!
      setLoading(false);
      clearTimeout(safetyTimeout);

      // Carrega os alertas de prioridade do mês anterior em segundo plano sem travar a interface
      dataService.getIncompleteAddressIds(prevMonth).then(missingPriority => {
        setPriorityAddressIds(missingPriority);
      }).catch(err => {
        console.warn('Erro ao carregar prioridades do mês anterior em segundo plano:', err);
      });

    } catch (e) {
      console.error('Erro ao carregar dados do cronograma:', e);
      setLoading(false);
      clearTimeout(safetyTimeout);
    }
  };

  const openHistory = async (addressId: string, addressName: string) => {
    try {
      const records = await dataService.getRecordsByAddress(addressId);
      setHistoryModal({ isOpen: true, addressId, addressName, records });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Erro ao carregar histórico.' })
    }
  };

  const handleGenerate = async () => {
    setMessage(null);
    setLoading(true);
    try {
      console.log('Iniciando geração de cronograma para:', currentMonth);
      // Higienização prévia automática para garantir que não haja duplicações físicas de endereços
      await dataService.deduplicateAndMergeAddresses().catch(err => console.warn('Aviso de higienização:', err));
      const prevMonth = format(subMonths(startOfMonth(new Date(currentMonth + '-02')), 1), 'yyyy-MM');
      const count = await dataService.generateMonthSchedule(currentMonth, prevMonth);
      
      await loadData();
      
      if (count && count > 0) {
        setMessage({ text: `${count} novos agendamentos gerados com sucesso!`, type: 'success' });
      } else {
        setMessage({ text: 'Todos os endereços já estão programados para este mês ou não há endereços cadastrados.', type: 'success' });
      }
    } catch (error: any) {
      console.error('Erro detalhado:', error);
      setMessage({ text: 'Erro ao gerar cronograma: ' + (error.message || 'Erro desconhecido'), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePriorities = async () => {
    setMessage(null);
    setLoading(true);
    try {
      await loadData();
      setMessage({ text: 'Sinais de prioridade atualizados com sucesso com base nas conclusões do mês anterior!', type: 'success' });
    } catch (error) {
      console.error(error);
      setMessage({ text: 'Erro ao atualizar sinais de prioridade.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCleanDuplicates = async () => {
    setMessage(null);
    setLoading(true);
    try {
      const res = await dataService.deduplicateAndMergeAddresses();
      await loadData();
      if (res.totalAddressesRemoved > 0 || res.totalRecordsDeleted > 0) {
        setMessage({ 
          text: `Higienização concluída com sucesso! ${res.totalAddressesRemoved} endereços duplicados unificados e ${res.totalRecordsDeleted} registros consolidados.`, 
          type: 'success' 
        });
      } else {
        setMessage({ 
          text: 'O cronograma já está 100% limpo! Nenhum endereço duplicado encontrado.', 
          type: 'success' 
        });
      }
    } catch (e: any) {
      console.error('Erro ao higienizar duplicatas:', e);
      setMessage({ text: 'Erro ao higienizar duplicatas: ' + (e.message || 'Erro desconhecido'), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async () => {
    setMessage(null);
    setLoading(true);
    try {
      const nextMonth = format(addMonths(startOfMonth(new Date(currentMonth + '-02')), 1), 'yyyy-MM');
      const count = await dataService.duplicateSchedule(currentMonth, nextMonth, {
        keepTechnicians: replicationModal.keepTechnicians,
        keepWeeks: replicationModal.keepWeeks
      });
      
      await loadData();
      setReplicationModal(prev => ({ ...prev, isOpen: false }));
      
      if (count && count > 0) {
        setMessage({ text: `${count} agendamentos duplicados para o mês de ${nextMonth}!`, type: 'success' });
      } else {
        setMessage({ text: 'Todos os registros já estão programados para o próximo mês ou não há dados para replicar.', type: 'success' });
      }
    } catch (error: any) {
      console.error(error);
      setMessage({ text: 'Erro ao duplicar: ' + (error.message || 'Erro desconhecido'), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const updateRecord = async (record: MaintenanceRecord, updates: Partial<MaintenanceRecord>) => {
    setSavingId(record.id);
    try {
      const isVirtual = record.id.startsWith('virtual_');
      const cleanedUpdates = { ...updates };
      if (cleanedUpdates.plannedDate !== undefined) {
        cleanedUpdates.plannedDates = undefined;
        cleanedUpdates.returnDate = undefined;
      }
      const targetRecord: any = isVirtual 
        ? { ...record, id: undefined, ...cleanedUpdates } 
        : { ...record, ...cleanedUpdates };

      const savedId = await dataService.upsertRecord(targetRecord);
      const finalId = savedId || record.id;

      setRecords(prev => {
        const newPlannedDate = cleanedUpdates.plannedDate;
        const found = prev.some(r => r.id === record.id || (r.addressId === record.addressId && r.month === record.month));
        let nextList: MaintenanceRecord[];
        if (found) {
          nextList = prev.map(r => (r.id === record.id || (r.addressId === record.addressId && r.month === record.month)) ? { ...r, ...cleanedUpdates, id: finalId } : r);
        } else {
          nextList = [...prev, { ...record, ...cleanedUpdates, id: finalId }];
        }
        // REGRA MANDATÓRIA: Se o endereço recebeu uma nova data agendada, sai totalmente do agendamento anterior
        if (newPlannedDate) {
          nextList = nextList.map(r => {
            if (r.id !== finalId && r.addressId === record.addressId && r.status !== MaintenanceStatus.COMPLETED) {
              return { ...r, plannedDate: undefined, plannedDates: undefined, returnDate: undefined };
            }
            return r;
          });
        }
        return nextList;
      });
    } catch (e) {
      console.error('Erro ao atualizar registro:', e);
    } finally {
      setSavingId(null);
    }
  };

  const handleExportExcel = async () => {
    try {
      type EnrichedRecord = MaintenanceRecord & { address?: Address; client?: Client };
      // Pega todos os registros consolidados de 100% dos endereços do cronograma
      const enrichedList: EnrichedRecord[] = Object.values(groupedRecords).flat();

      // Busca registros históricos para obter a data da última manutenção executada de cada endereço
      const allRecords = await dataService.getAllRecords();
      const latestExecutionByAddress = new Map<string, Date>();

      allRecords.forEach(r => {
        if (!r.addressId) return;
        const isExecuted = r.status === MaintenanceStatus.COMPLETED || !!r.executionDate;
        if (!isExecuted) return;

        let recDate: Date | null = null;
        if (r.executionDate) {
          const parsed = new Date(r.executionDate);
          if (!isNaN(parsed.getTime())) {
            recDate = parsed;
          }
        } else if (r.month) {
          const parsed = new Date(`${r.month}-01T12:00:00`);
          if (!isNaN(parsed.getTime())) {
            recDate = parsed;
          }
        }

        if (recDate) {
          const existing = latestExecutionByAddress.get(r.addressId);
          if (!existing || recDate.getTime() > existing.getTime()) {
            latestExecutionByAddress.set(r.addressId, recDate);
          }
        }
      });

      // Cabeçalhos
      const headers = [
        'Data da Última Manutenção',
        'Rota',
        'Cliente',
        'Endereço Completo',
        'Quantidade Máquinas',
        'Máquinas Executadas',
        'Status Atual',
        'Semana Programada',
        'Data Prevista',
        'Data de Execução',
        'Técnico Principal',
        'Técnico Auxiliar',
        'Relato / Observações'
      ];

      const getStatusText = (status: string) => {
        switch (status) {
          case 'completed': return 'CONCLUÍDO';
          case 'pre_completed': return 'PENDENTE DE APROVAÇÃO (PRÉ-CONCLUÍDO)';
          case 'in_progress': return 'EM ANDAMENTO';
          case 'pending': return 'PENDENTE';
          default: return (status || 'PENDENTE').toUpperCase();
        }
      };

      const rows = enrichedList.map(r => {
        const lastExecDateObj = r.addressId ? latestExecutionByAddress.get(r.addressId) : null;
        const lastExecutionDateFormatted = lastExecDateObj 
          ? formatDate(lastExecDateObj) 
          : (r.executionDate ? formatDate(r.executionDate) : '');

        const route = r.address?.route || 'Sem Rota';
        const clientName = r.client?.name || 'Cliente temporário ou não encontrado';
        const street = r.address?.street || '';
        const totalMachines = r.address?.totalMachines ?? 0;
        const executedQty = r.executedQuantity ?? 0;
        const status = getStatusText(r.status);
        const week = r.scheduledWeek ? `Semana ${r.scheduledWeek}` : '';
        const planned = r.plannedDate ? formatDate(r.plannedDate) : '';
        const executed = r.executionDate ? formatDate(r.executionDate) : '';
        const tech1 = r.technician1 || '';
        const tech2 = r.technician2 || '';
        const notes = (r.notes || '').replace(/[\n\r;"]/g, ' ');

        return [
          lastExecutionDateFormatted,
          route,
          clientName,
          street,
          totalMachines,
          executedQty,
          status,
          week,
          planned,
          executed,
          tech1,
          tech2,
          notes
        ];
      });

      // Join das linhas com ";"
      const csvContent = [
        headers.join(';'),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(';'))
      ].join('\n');

      // BOM para Excel reconhecer acentuação e UTF-8 em português
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const formattedMonth = currentMonth.replace('-', '_');
      link.setAttribute('download', `Relatorio_Cronograma_${formattedMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro ao gerar planilha excel:', err);
    }
  };

  const groupedRecords = useMemo(() => {
    type EnrichedRecord = MaintenanceRecord & { address?: Address; client?: Client };

    // Garante que cada endereço é estritamente ÚNICO por rota/mês, independente de quantas datas foram programadas
    const uniqueMap = new Map<string, EnrichedRecord>();

    records.forEach(r => {
      if (isOSRecord(r)) return; // Cronograma representa exclusivamente manutenções preventivas
      const addr = addresses.find(a => a.id === r.addressId);
      const client = clients.find(c => c.id === addr?.clientId);

      if (!r.isTemporaryRoute && (!addr || addr.status === 'inactive' || addr.active === false || addr.isInactive === true)) {
        return;
      }

      const isDummyTemp = r.isTemporaryRoute && (!r.addressId || String(r.addressId).startsWith('TEMP_ADDR_'));
      const key = isDummyTemp 
        ? `temp_${(r.temporaryRouteName || '').trim()}_${(r.temporaryStreet || r.temporaryClient || r.id).trim()}`
        : getCanonicalAddressKey(client?.id || addr?.clientId || '', addr?.street || '', addr?.number);

      if (!uniqueMap.has(key)) {
        const item: EnrichedRecord = { ...r, address: addr, client };
        item.plannedDates = undefined;
        item.returnDate = undefined;
        uniqueMap.set(key, item);
      } else {
        const existing = uniqueMap.get(key)!;
        if (!existing.address && addr) existing.address = addr;
        if (!existing.client && client) existing.client = client;

        // Hierarquia de status: COMPLETED > PRE_COMPLETED > PARTIAL > PENDING
        const statusWeight: Record<string, number> = {
          [MaintenanceStatus.COMPLETED]: 4,
          [MaintenanceStatus.PRE_COMPLETED]: 3,
          [MaintenanceStatus.PARTIAL]: 2,
          [MaintenanceStatus.PENDING]: 1,
        };
        if ((statusWeight[r.status] || 0) > (statusWeight[existing.status] || 0)) {
          existing.status = r.status;
        }

        // Técnicos
        if (r.technician1) existing.technician1 = r.technician1;
        if (r.technician2) existing.technician2 = r.technician2;

        // Dados de execução
        if (r.executionDate && !existing.executionDate) existing.executionDate = r.executionDate;
        if (r.executedQuantity && !existing.executedQuantity) existing.executedQuantity = r.executedQuantity;
        if (r.checklist && (!existing.checklist || existing.checklist.length === 0)) existing.checklist = r.checklist;
        if (r.clientSignature && !existing.clientSignature) {
          existing.clientSignature = r.clientSignature;
          existing.clientSignatureDate = r.clientSignatureDate;
          existing.clientSigneeName = r.clientSigneeName;
          existing.clientSigneeRegistration = r.clientSigneeRegistration;
        }

        // REGRA MANDATÓRIA: Endereços NÃO podem ter múltiplas datas agendadas.
        // A data mais recente definida sobrescreve qualquer data anterior.
        if (r.plannedDate) {
          existing.plannedDate = r.plannedDate;
        }
        existing.plannedDates = undefined;
        existing.returnDate = undefined;

        // Observações
        if (r.notes && r.notes !== existing.notes && !existing.notes?.includes(r.notes)) {
          existing.notes = existing.notes ? `${existing.notes} | ${r.notes}` : r.notes;
        }
        if (r.routeNotes && r.routeNotes !== existing.routeNotes && !existing.routeNotes?.includes(r.routeNotes)) {
          existing.routeNotes = existing.routeNotes ? `${existing.routeNotes} | ${r.routeNotes}` : r.routeNotes;
        }
      }
    });

    // REGRA MANDATÓRIA: 100% DOS ENDEREÇOS DEVEM APARECER NO CRONOGRAMA,
    // exatamente TODOS independente se estão com datas agendadas ou não!
    addresses.forEach(addr => {
      if (!addr) return;
      if (addr.status === 'inactive' || addr.active === false || addr.isInactive === true) {
        return;
      }

      const client = clients.find(c => c.id === addr.clientId);
      const key = getCanonicalAddressKey(client?.id || addr.clientId || '', addr.street || '', addr.number);

      if (!uniqueMap.has(key)) {
        const routeConfig = routeConfigs.find(c => c.id === addr.route && (c.type === RouteType.FIXED || c.type === RouteType.TEMPORARY));
        
        const defaultItem: EnrichedRecord = {
          id: `virtual_${currentMonth}_${addr.id}`,
          month: currentMonth,
          addressId: addr.id,
          scheduledWeek: 1,
          status: MaintenanceStatus.PENDING,
          plannedDates: [],
          notes: addr.notes || '',
          routeNotes: '',
          technician1: routeConfig?.technician1 || '',
          technician2: routeConfig?.technician2 || '',
          address: addr,
          client: client,
          cycle: client?.contractCycle || 1
        };
        uniqueMap.set(key, defaultItem);
      }
    });

    const enriched: EnrichedRecord[] = Array.from(uniqueMap.values()).filter(r => {
      const searchTerms = search.toLowerCase();
      return (
        r.client?.name?.toLowerCase().includes(searchTerms) ||
        r.address?.street?.toLowerCase().includes(searchTerms) ||
        r.address?.route?.toLowerCase().includes(searchTerms) ||
        r.technician1?.toLowerCase().includes(searchTerms)
      );
    });

    const groups: Record<string, EnrichedRecord[]> = {};
    enriched.forEach(r => {
      const route = r.address?.route || 'Sem Rota';
      if (!groups[route]) groups[route] = [];
      groups[route].push(r);
    });

    // Ordene os endereços de cada rota por nome de cliente, e depois por rua
    Object.keys(groups).forEach(route => {
      groups[route].sort((a, b) => {
        const clientA = a.client?.name || '';
        const clientB = b.client?.name || '';
        if (clientA && clientB) {
          const comp = clientA.localeCompare(clientB, 'pt-BR');
          if (comp !== 0) return comp;
        } else if (!clientA && clientB) {
          return 1;
        } else if (clientA && !clientB) {
          return -1;
        }
        
        const streetA = a.address?.street || '';
        const streetB = b.address?.street || '';
        return streetA.localeCompare(streetB, 'pt-BR');
      });
    });

    return groups;
  }, [records, addresses, clients, currentMonth, routeConfigs, search]);

  const { yesterdayCards, todayCards, tomorrowCards } = useMemo(() => {
    const today = new Date();
    
    // Convert to target date strings
    const todayStr = format(today, 'yyyy-MM-dd');
    const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd');
    const tomorrowStr = format(addDays(today, 1), 'yyyy-MM-dd');

    const getDayRecords = (dateStr: string) => {
      const dayMap = new Map<string, any>();
      records.forEach(r => {
        // REGRA MANDATÓRIA: Endereço só aparece estritamente na data agendada
        const matchesDate = r.plannedDate === dateStr;
        if (!matchesDate) return;

        const address = addresses.find(a => a.id === r.addressId);
        const client = clients.find(c => c.id === address?.clientId);
        if (!r.isTemporaryRoute && (!address || address.status === 'inactive' || address.active === false || address.isInactive === true)) {
          return;
        }

        const isDummyTemp = r.isTemporaryRoute && (!r.addressId || String(r.addressId).startsWith('TEMP_ADDR_'));
        const key = isDummyTemp 
          ? r.id 
          : getCanonicalAddressKey(client?.id || address?.clientId || '', address?.street || '', address?.number);
        if (!dayMap.has(key)) {
          dayMap.set(key, { record: r, address, client });
        }
      });
      return Array.from(dayMap.values());
    };

    return {
      yesterdayCards: getDayRecords(yesterdayStr),
      todayCards: getDayRecords(todayStr),
      tomorrowCards: getDayRecords(tomorrowStr)
    };
  }, [records, addresses, clients]);

  const monthLabel = format(new Date(currentMonth + '-02'), 'MMMM yyyy', { locale: ptBR });

  const openObservationModal = (record: MaintenanceRecord & { client?: Client; address?: Address }) => {
    const currentObs = record.address?.notes || (record.notes && record.notes !== 'PRIORIDADE: Pendente do mês anterior' ? record.notes : '');
    setModalState({
      type: 'observation',
      record,
      value: currentObs
    });
  };

  const openServiceCallModal = (record: MaintenanceRecord & { client?: Client; address?: Address }) => {
    setModalState({
      type: 'service_call',
      record,
      serviceCallDescription: '',
      serviceCallPriority: ServiceCallPriority.MEDIUM,
      serviceCallAttachmentUrl: ''
    });
  };

  const handleSaveObservation = async () => {
    if (!modalState || modalState.type !== 'observation') return;
    const { record, value } = modalState;
    const trimmed = (value || '').trim();
    setSavingId(record.id);
    try {
      // 1. Persiste no Address para durabilidade e replicação contínua mês a mês
      await dataService.updateAddress(record.addressId, { notes: trimmed });
      // 2. Atualiza o registro de manutenção do mês atual
      await updateRecord(record, { notes: trimmed });
      // 3. Atualiza estado em memória de addresses
      setAddresses(prev => prev.map(a => a.id === record.addressId ? { ...a, notes: trimmed } : a));
      // 4. Atualiza registros exibidos
      setRecords(prev => prev.map(r => r.addressId === record.addressId ? { ...r, notes: trimmed } : r));

      setMessage({
        type: 'success',
        text: trimmed 
          ? 'Observação do endereço salva com sucesso! Ela ficará no endereço e será replicada nos próximos meses.' 
          : 'Observação do endereço removida com sucesso!'
      });
      setModalState(null);
    } catch (e) {
      console.error('Erro ao salvar observação:', e);
      setMessage({ type: 'error', text: 'Erro ao salvar a observação do endereço.' });
    } finally {
      setSavingId(null);
    }
  };

  const handleRemoveObservation = async () => {
    if (!modalState || modalState.type !== 'observation') return;
    const { record } = modalState;
    setSavingId(record.id);
    try {
      await dataService.updateAddress(record.addressId, { notes: '' });
      await updateRecord(record, { notes: '' });
      setAddresses(prev => prev.map(a => a.id === record.addressId ? { ...a, notes: '' } : a));
      setRecords(prev => prev.map(r => r.addressId === record.addressId ? { ...r, notes: '' } : r));

      setMessage({
        type: 'success',
        text: 'Observação do endereço removida com sucesso!'
      });
      setModalState(null);
    } catch (e) {
      console.error('Erro ao remover observação:', e);
      setMessage({ type: 'error', text: 'Erro ao remover a observação do endereço.' });
    } finally {
      setSavingId(null);
    }
  };

  const handleOpenServiceCall = async () => {
    if (!modalState || modalState.type !== 'service_call') return;
    const { record, serviceCallDescription, serviceCallPriority, serviceCallAttachmentUrl } = modalState;
    const desc = (serviceCallDescription || '').trim();
    if (!desc) {
      setMessage({ type: 'error', text: 'Por favor, informe a descrição do chamado.' });
      return;
    }
    setSavingId(record.id);
    try {
      const newCall: Omit<ServiceCall, 'id'> = {
        clientId: record.client?.id || record.address?.clientId || '',
        addressId: record.addressId,
        maintenanceRecordId: record.id,
        description: desc,
        status: ServiceCallStatus.OPEN,
        priority: serviceCallPriority || ServiceCallPriority.MEDIUM,
        clientName: record.client?.name,
        addressLabel: record.address?.street,
        createdAt: new Date(),
        attachmentUrl: serviceCallAttachmentUrl || ''
      };
      const docRef = await dataService.addServiceCall(newCall);
      setMessage({ 
        text: 'Chamado técnico aberto com sucesso! A identificação visual permanecerá no endereço até sua conclusão.', 
        type: 'success' 
      });
      
      if (docRef?.id) {
        setServiceCalls(prev => [{ id: docRef.id, ...newCall } as ServiceCall, ...prev]);
      } else {
        const updatedCalls = await dataService.getServiceCalls();
        setServiceCalls(updatedCalls);
      }
      setModalState(null);
    } catch (e) {
      console.error('Erro ao abrir chamado:', e);
      setMessage({ text: 'Erro ao abrir o chamado técnico.', type: 'error' });
    } finally {
      setSavingId(null);
    }
  };

  const handleModalSave = async () => {
    if (!modalState) return;
    if (modalState.type === 'observation') {
      await handleSaveObservation();
    } else if (modalState.type === 'service_call') {
      await handleOpenServiceCall();
    } else if (modalState.type === 'delete') {
      try {
        setSavingId(modalState.record.id);
        await dataService.deleteRecord(modalState.record.id);
        setRecords(prev => prev.filter(r => r.id !== modalState.record.id));
        setModalState(null);
      } catch (e) {
        console.error(e);
      } finally {
        setSavingId(null);
      }
    } else if (modalState.type === 'attachment') {
      await updateRecord(modalState.record, { attachmentUrl: modalState.value || '' });
      setModalState(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Messages */}
      {message && (
        <div className={cn(
          "p-4 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
          message.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-red-50 border-red-100 text-red-800"
        )}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="text-sm font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto p-1 hover:bg-black/5 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button 
              onClick={() => setCurrentMonth(format(subMonths(startOfMonth(new Date(currentMonth + '-02')), 1), 'yyyy-MM'))}
              className="p-1 hover:bg-white rounded-md transition-all shadow-none hover:shadow-sm"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <span className="px-4 font-semibold text-gray-700 capitalize min-w-[140px] text-center">
              {monthLabel}
            </span>
            <button 
              onClick={() => setCurrentMonth(format(addMonths(startOfMonth(new Date(currentMonth + '-02')), 1), 'yyyy-MM'))}
              className="p-1 hover:bg-white rounded-md transition-all shadow-none hover:shadow-sm"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          <button 
            type="button"
            onClick={() => { 
              window.focus(); 
              setTimeout(() => window.print(), 200); 
            }}
            className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm print:hidden flex items-center justify-center"
            title="Imprimir Cronograma"
          >
            <Printer className="w-5 h-5 text-gray-600" />
          </button>

          <button 
            type="button"
            onClick={handleUpdatePriorities}
            disabled={loading}
            className="p-2.5 bg-white border border-gray-200 rounded-xl text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all shadow-sm print:hidden flex items-center justify-center"
            title="Atualizar prioridades com base no mês anterior"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            ) : (
              <RotateCw className="w-5 h-5 text-blue-600" />
            )}
          </button>

          <button 
            type="button"
            onClick={handleExportExcel}
            className="p-2.5 bg-white border border-gray-200 rounded-xl text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 transition-all shadow-sm print:hidden flex items-center justify-center"
            title="Exportar para Excel (mês selecionado)"
          >
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          </button>
          
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewMode === 'list' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Plano Listagem
            </button>
            <button 
              onClick={() => setViewMode('macro')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewMode === 'macro' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Macro Trimestral
            </button>
            <button 
              onClick={() => setViewMode('weekly')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewMode === 'weekly' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Planejador Semanal
            </button>
          </div>

          {!isReadOnly && !managerClientId && (
            <div className="flex gap-2">
              <button 
                onClick={handleCleanDuplicates}
                disabled={loading}
                title="Verificar e unificar endereços duplicados automaticamente"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all disabled:opacity-50 shadow-sm"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Higienizar Duplicatas
              </button>

              <button 
                onClick={handleGenerate}
                disabled={loading}
                title="Sincronizar todos os endereços ativos para este mês (adiciona apenas os faltantes)"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                Sincronizar Mês
              </button>
              
              <button 
                onClick={() => setReplicationModal(prev => ({ ...prev, isOpen: true }))}
                disabled={loading}
                title="Replicar para o próximo mês"
                className="bg-gray-800 hover:bg-black text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                Criar Próximo
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar cliente, endereço, rota..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm w-full md:w-64 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Daily Cards */}
      {viewMode === 'list' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
          <DailyCard title="Ontem" date={subDays(new Date(), 1)} data={yesterdayCards} colorClass="bg-gray-50 border-gray-200" headerClass="bg-gray-100 border-gray-200 text-gray-700" />
          <DailyCard title="Hoje" date={new Date()} data={todayCards} colorClass="bg-blue-50 border-blue-200" headerClass="bg-blue-100 border-blue-200 text-blue-800" />
          <DailyCard title="Amanhã" date={addDays(new Date(), 1)} data={tomorrowCards} colorClass="bg-amber-50 border-amber-200" headerClass="bg-amber-100 border-amber-200 text-amber-800" />
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-200">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
          <p className="text-gray-500">Carregando dados do cronograma...</p>
        </div>
      ) : viewMode === 'macro' ? (
        <MacroTable currentMonthStr={currentMonth} addresses={addresses} clients={clients} routeConfigs={routeConfigs} />
      ) : viewMode === 'weekly' ? (
        <WeeklyPlanner
          records={records}
          addresses={addresses}
          clients={clients}
          technicians={technicians}
          isReadOnly={isReadOnly}
          onUpdateRecord={updateRecord}
          savingId={savingId}
          priorityAddressIds={priorityAddressIds}
          onOpenHistory={openHistory}
        />
      ) : Object.keys(groupedRecords).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-200 text-center px-4">
          <Calendar className="w-12 h-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900">Mês sem registros</h3>
          <p className="text-gray-500 max-w-sm mx-auto">Não há endereços programados para este mês. Clique em "Gerar Cronograma" para iniciar o planejamento.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedRecords)
            .sort(([routeA], [routeB]) => routeA.localeCompare(routeB))
            .map(([route, routeRecords]) => {
            const recordsList = routeRecords as any[]; // Fallback
            const total = recordsList.length;
            const completed = recordsList.filter(r => r.status === MaintenanceStatus.COMPLETED).length;
            const totalMachinesOnRoute = recordsList.reduce((acc, r) => acc + (Number(r.address?.totalMachines) || 0), 0);
            const isCollapsed = collapsedRoutes[route] ?? true;

            return (
            <div key={route} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div 
                className="bg-gray-50 px-6 py-3 border-b border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-100/50 transition-colors"
                onClick={() => setCollapsedRoutes(prev => ({ ...prev, [route]: !isCollapsed }))}
              >
                <div className="flex items-center gap-3">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    Rota: {route}
                  </h3>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-white border border-gray-200 px-2.5 py-1 rounded-full text-[10px] font-bold">
                    <span className="text-gray-400">STATUS:</span>
                    <span className={cn(
                      completed === total ? "text-emerald-600" : "text-amber-600"
                    )}>
                      {completed} DE {total} CONCLUÍDOS
                    </span>
                  </div>
                  <span className="text-xs font-medium text-gray-500 bg-white px-2 py-1 rounded-md border border-gray-200">
                    {total} endereços
                  </span>
                  <span className="text-xs font-medium text-gray-500 bg-white px-2 py-1 rounded-md border border-gray-200">
                    {totalMachinesOnRoute} máquinas
                  </span>
                </div>
              </div>
              
              {!isCollapsed && (
                <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white text-gray-500 text-[11px] font-bold uppercase tracking-widest border-b border-gray-100">
                      <th className="px-6 py-4 font-semibold min-w-[320px] w-[350px]">Cliente / Endereço</th>
                      <th className="px-4 py-4 text-center">Máq. Totais</th>
                      <th className="px-4 py-4">Técnicos</th>
                      <th className="px-4 py-4 text-center">Semana</th>
                      <th className="px-4 py-4">Data Prevista</th>
                      <th className="px-4 py-4">Data Execução</th>
                      <th className="px-4 py-4 text-center">Baixa (Qtd)</th>
                      <th className="px-4 py-4">Status</th>
                      <th className="px-4 py-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recordsList.map(record => {
                      const isTech1Disabled = isReadOnly || record.status === MaintenanceStatus.COMPLETED || record.status === MaintenanceStatus.PRE_COMPLETED;
                      const isTech2Disabled = isReadOnly || record.status === MaintenanceStatus.COMPLETED || record.status === MaintenanceStatus.PRE_COMPLETED;
                      
                      return (
                        <tr key={record.id} className="hover:bg-blue-50/30 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className={cn("font-bold text-sm uppercase", record.status === MaintenanceStatus.COMPLETED ? "text-gray-400 line-through" : "text-gray-900")}>{record.client?.name}</span>
                                {priorityAddressIds.has(record.addressId) && (
                                  <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-200" title="Manutenção do mês anterior não foi concluída" />
                                )}
                              </div>
                              <span 
                                className={cn("text-xs cursor-pointer transition-colors", record.status === MaintenanceStatus.COMPLETED ? "text-gray-400 line-through hover:text-gray-500" : "text-gray-500 hover:text-blue-600")}
                                onClick={() => openHistory(record.addressId, record.address?.street || '')}
                                title="Ver histórico de manutenções"
                              >
                                {record.address?.street}
                              </span>
                              
                              <div className="flex items-center gap-1.5 mt-2">
                                {(record.address?.notes || (record.notes && record.notes !== 'PRIORIDADE: Pendente do mês anterior')) && (
                                  <button 
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openObservationModal(record);
                                    }}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer shadow-2xs"
                                    title={`Observação do Endereço: ${record.address?.notes || record.notes} (Clique para ver/editar)`}
                                  >
                                    <MessageSquare className="w-3 h-3 text-amber-600" />
                                    <span className="text-[9px] font-black uppercase tracking-tighter">OBS</span>
                                  </button>
                                )}

                                {serviceCalls.some(c => 
                                  (c.maintenanceRecordId === record.id || c.addressId === record.addressId) && 
                                  (c.status === ServiceCallStatus.OPEN || c.status === ServiceCallStatus.IN_PROGRESS)
                                ) && (
                                  <button 
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openServiceCallModal(record);
                                    }}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-200 animate-pulse hover:bg-red-100 transition-colors cursor-pointer shadow-2xs"
                                    title="Este endereço possui um chamado técnico em aberto (Clique para ver/gerenciar)"
                                  >
                                    <Wrench className="w-3 h-3" />
                                    <span className="text-[9px] font-black uppercase tracking-tighter">CHAMADO</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center font-mono text-sm">
                            {record.address?.totalMachines}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-1">
                              <select 
                                 value={record.technician1 || ''} 
                                 disabled={isTech1Disabled}
                                onChange={(e) => updateRecord(record, { technician1: e.target.value })}
                                className={cn(
                                  "text-[10px] border rounded px-2 py-1 w-32 outline-none focus:ring-2 focus:ring-blue-500/10 transition-all",
                                  isTech1Disabled 
                                    ? "cursor-not-allowed opacity-60 text-gray-400 bg-gray-100 border-gray-200" 
                                    : !record.technician1 
                                      ? "cursor-pointer text-gray-400 bg-gray-50/50 border-gray-200 hover:border-gray-300" 
                                      : "cursor-pointer text-gray-900 bg-white border-gray-300 font-bold shadow-sm hover:border-gray-400"
                                )}
                              >
                                <option value="" className="text-gray-400 font-medium">Técnico 1</option>
                                {technicians.map(t => <option key={t.id} value={t.name} className="text-gray-900 font-semibold">{t.name}</option>)}
                              </select>
                              <select 
                                value={record.technician2 || ''} 
                                disabled={isTech2Disabled}
                                onChange={(e) => updateRecord(record, { technician2: e.target.value })}
                                className={cn(
                                  "text-[10px] border rounded px-2 py-1 w-32 outline-none focus:ring-2 focus:ring-blue-500/10 transition-all",
                                  isTech2Disabled 
                                    ? "cursor-not-allowed opacity-60 text-gray-400 bg-gray-100 border-gray-200" 
                                    : !record.technician2 
                                      ? "cursor-pointer text-gray-400 bg-gray-50/50 border-gray-200 hover:border-gray-300" 
                                      : "cursor-pointer text-gray-900 bg-white border-gray-300 font-bold shadow-sm hover:border-gray-400"
                                )}
                              >
                                <option value="" className="text-gray-400 font-medium">Técnico 2</option>
                                {technicians.map(t => <option key={t.id} value={t.name} className="text-gray-900 font-semibold">{t.name}</option>)}
                              </select>
                            </div>
                          </td>
                        <td className="px-4 py-4 text-center">
                          <select 
                            value={record.scheduledWeek} disabled={isReadOnly}
                            onChange={(e) => updateRecord(record, { scheduledWeek: parseInt(e.target.value) })}
                            className="text-xs font-semibold bg-gray-100 border-none rounded px-2 py-1 focus:ring-0 cursor-pointer"
                          >
                            {[1,2,3,4,5].map(w => <option key={w} value={w}>Semana {w}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-4">
                          <input 
                            type="date"
                            value={record.plannedDate || ''} disabled={isReadOnly}
                            onChange={(e) => updateRecord(record, { plannedDate: e.target.value })}
                            className={cn(
                              "text-xs border rounded px-2 py-1 outline-none w-full md:w-auto transition-all",
                              record.plannedDate 
                                ? "font-bold text-blue-600 bg-blue-50/40 border-blue-200 focus:border-blue-500" 
                                : "font-semibold text-gray-400 bg-gray-100/40 border-gray-200 focus:text-blue-600"
                            )}
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div className="relative group/exec">
                            <input 
                              type="date"
                              disabled={isReadOnly || !record.plannedDate}
                              value={record.executionDate ? record.executionDate.split('T')[0] : ''}
                              onChange={(e) => {
                                const dateStr = e.target.value;
                                const qty = record.executedQuantity || 0;
                                
                                const isAwaitingApproval = record.status === MaintenanceStatus.PRE_COMPLETED || Boolean(record.clientSignature && !record.adminApproved && !record.approvedAt);
                                let nextStatus = isAwaitingApproval ? MaintenanceStatus.PRE_COMPLETED : MaintenanceStatus.PENDING;
                                if (qty > 0) {
                                  nextStatus = isAwaitingApproval ? MaintenanceStatus.PRE_COMPLETED : MaintenanceStatus.COMPLETED;
                                } else if (dateStr) {
                                  nextStatus = isAwaitingApproval ? MaintenanceStatus.PRE_COMPLETED : MaintenanceStatus.PENDING;
                                }

                                updateRecord(record, { 
                                  executionDate: dateStr ? `${dateStr}T12:00:00Z` : undefined,
                                  status: nextStatus
                                });
                              }}
                              className={cn(
                                "text-xs border border-gray-200 rounded px-2 py-1 outline-none w-full md:w-auto",
                                !record.plannedDate 
                                  ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                                  : "focus:border-blue-500"
                              )}
                            />
                            {!record.plannedDate && (
                              <div className="absolute opacity-0 group-hover/exec:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-[10px] whitespace-nowrap rounded font-medium pointer-events-none transition-opacity z-10">
                                Preencha a data prevista primeiro
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="relative group/qty">
                              <input 
                                type="number"
                                min="0"
                                max={record.address?.totalMachines}
                                value={record.executedQuantity ?? ''} 
                                disabled={isReadOnly || !record.executionDate}
                                placeholder="0"
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  const hasDate = !!record.executionDate;

                                  const isAwaitingApproval = record.status === MaintenanceStatus.PRE_COMPLETED || Boolean(record.clientSignature && !record.adminApproved && !record.approvedAt);
                                  let nextStatus = isAwaitingApproval ? MaintenanceStatus.PRE_COMPLETED : MaintenanceStatus.PENDING;
                                  if (val > 0) {
                                    nextStatus = isAwaitingApproval ? MaintenanceStatus.PRE_COMPLETED : MaintenanceStatus.COMPLETED;
                                  } else if (hasDate) {
                                    nextStatus = isAwaitingApproval ? MaintenanceStatus.PRE_COMPLETED : MaintenanceStatus.PENDING;
                                  }

                                  updateRecord(record, { 
                                    executedQuantity: val,
                                    status: nextStatus
                                  });
                                }}
                                className={cn(
                                  "w-16 text-center text-xs border rounded px-1 py-1 outline-none transition-all",
                                  isReadOnly || !record.executionDate
                                    ? "bg-gray-100/70 text-gray-400 border-gray-200 cursor-not-allowed" 
                                    : "border-gray-200 focus:border-blue-500"
                                )}
                              />
                              {(isReadOnly || !record.executionDate) && (
                                <div className="absolute opacity-0 group-hover/qty:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-[10px] whitespace-nowrap rounded font-medium pointer-events-none transition-opacity z-10 shadow-md">
                                  {!record.executionDate ? "Preencha a data de execução" : "Somente visualização"}
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-400">/ {record.address?.totalMachines}</span>
                            {record.address?.totalMachines ? (
                              <button
                                type="button"
                                disabled={isReadOnly || !record.executionDate}
                                onClick={() => {
                                  const total = record.address?.totalMachines || 0;
                                  updateRecord(record, {
                                    executedQuantity: total,
                                    status: MaintenanceStatus.COMPLETED,
                                    adminApproved: true,
                                    approvedAt: new Date().toISOString()
                                  });
                                }}
                                className={cn(
                                  "text-[10px] font-bold transition-all ml-1 px-1.5 py-0.5 rounded border",
                                  (!record.executionDate || isReadOnly)
                                    ? "text-gray-300 border-gray-100 bg-gray-50/50 cursor-not-allowed" 
                                    : "text-blue-600 border-blue-100 bg-blue-50 hover:text-blue-800 hover:bg-blue-100 cursor-pointer"
                                )}
                                title={!record.executionDate ? "Preencha a data de execução primeiro" : "Preencher com a quantidade total de máquinas"}
                              >
                                Total
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border transition-colors shadow-xs",
                            record.status === MaintenanceStatus.COMPLETED 
                              ? "bg-emerald-600 text-white border-emerald-600" 
                              : "bg-gray-50 text-gray-500 border-gray-100"
                          )}>
                            {record.status === MaintenanceStatus.COMPLETED ? 'Concluído' : 'Pendente'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {(() => {
                            const addressObs = record.address?.notes || (record.notes && record.notes !== 'PRIORIDADE: Pendente do mês anterior' ? record.notes : '');
                            const hasOpenCall = serviceCalls.some(c => 
                              (c.maintenanceRecordId === record.id || c.addressId === record.addressId) && 
                              (c.status === ServiceCallStatus.OPEN || c.status === ServiceCallStatus.IN_PROGRESS)
                            );

                            return (
                              <div className="flex items-center justify-center gap-1.5">
                                {/* Observação do Endereço */}
                                <button 
                                  type="button"
                                  onClick={() => openObservationModal(record)}
                                  title={addressObs ? `Observação do Endereço: ${addressObs}` : "Adicionar Observação ao Endereço (somente texto, replicada nos próximos meses)"}
                                  className={cn(
                                    "p-2 rounded-lg transition-all relative",
                                    addressObs 
                                      ? "bg-amber-100 text-amber-700 hover:bg-amber-200 ring-1 ring-amber-300" 
                                      : "bg-gray-100 text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                                  )}
                                >
                                  <MessageSquare className="w-4 h-4" />
                                  {addressObs && (
                                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white" />
                                  )}
                                </button>

                                {/* Chamado Técnico */}
                                <button 
                                  type="button"
                                  onClick={() => openServiceCallModal(record)}
                                  title={hasOpenCall ? "Endereço possui Chamado Técnico em aberto (Clique para ver/gerenciar)" : "Abrir Chamado Técnico para este endereço"}
                                  className={cn(
                                    "p-2 rounded-lg transition-all relative",
                                    hasOpenCall 
                                      ? "bg-red-100 text-red-600 hover:bg-red-200 ring-1 ring-red-300" 
                                      : "bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                  )}
                                >
                                  <Wrench className="w-4 h-4" />
                                  {hasOpenCall && (
                                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white animate-pulse" />
                                  )}
                                </button>

                                {/* Anexo do Agendamento */}
                                <button 
                                  type="button"
                                  onClick={() => setModalState({ 
                                    type: 'attachment', 
                                    record, 
                                    value: record.attachmentUrl || '' 
                                  })}
                                  title="Anexo do Agendamento"
                                  className={cn(
                                    "p-2 rounded-lg transition-all",
                                    record.attachmentUrl ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                                  )}
                                >
                                  <Paperclip className="w-4 h-4" />
                                </button>

                                {!managerClientId && (
                                  <button 
                                    type="button"
                                    onClick={() => setModalState({ 
                                      type: 'delete', 
                                      record, 
                                      value: '' 
                                    })}
                                    className="p-2 bg-gray-100 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                    style={{ display: (userRole === UserRole.ADMIN || userRole === UserRole.ASSISTANT) ? 'inline-flex' : 'none' }}
                                    title="Excluir Agendamento"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                                {savingId === record.id && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            </div>
            );
          })}
        </div>
      )}

      {/* Action Modal */}
      {modalState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className={cn(
              "p-4 border-b flex items-center justify-between",
              modalState.type === 'observation' ? "bg-amber-50 border-amber-100" :
              modalState.type === 'service_call' ? "bg-red-50 border-red-100" :
              modalState.type === 'attachment' ? "bg-blue-50 border-blue-100" : "bg-red-50 border-red-100"
            )}>
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                {modalState.type === 'observation' && <MessageSquare className="w-4 h-4 text-amber-600" />}
                {modalState.type === 'service_call' && <Wrench className="w-4 h-4 text-red-600" />}
                {modalState.type === 'attachment' && <Paperclip className="w-4 h-4 text-blue-600" />}
                {modalState.type === 'delete' && <Trash2 className="w-4 h-4 text-red-600" />}
                {modalState.type === 'observation' ? 'Observação do Endereço' : 
                 modalState.type === 'service_call' ? 'Chamado Técnico do Endereço' :
                 modalState.type === 'attachment' ? 'Anexar Documento' : 'Confirmar Exclusão'}
              </h3>
              <button 
                onClick={() => setModalState(null)}
                className="p-1 hover:bg-black/5 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="mb-4 pb-3 border-b border-gray-100">
                <p className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                  {modalState.record.client?.name || 'Cliente'}
                </p>
                <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  {modalState.record.address?.street || 'Endereço'}
                </p>
              </div>
              
              {modalState.type === 'delete' ? (
                <p className="text-gray-600 text-sm leading-relaxed">
                  Tem certeza que deseja excluir permanentemente este agendamento do cronograma? 
                  Esta ação não poderá ser desfeita.
                </p>
              ) : modalState.type === 'observation' ? (
                <div className="space-y-4">
                  <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200/70 text-xs text-amber-900 leading-relaxed flex gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-950 mb-0.5">Observação permanente do endereço</p>
                      <p>Esta observação é somente texto e fica gravada diretamente no endereço, sendo replicada automaticamente nos próximos meses até que seja removida.</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Texto da Observação (somente texto)
                    </label>
                    <textarea 
                      autoFocus
                      value={modalState.value || ''}
                      onChange={(e) => setModalState({ ...modalState, value: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none h-36 resize-none font-medium text-gray-800 placeholder:text-gray-400"
                      placeholder="Ex: Chave fica na portaria; horário de acesso somente após as 14h; avisar síndico..."
                      disabled={isReadOnly}
                    />
                  </div>
                </div>
              ) : modalState.type === 'service_call' ? (
                <div className="space-y-4">
                  {/* Chamados já existentes em aberto */}
                  {(() => {
                    const existingCalls = serviceCalls.filter(c => 
                      (c.addressId === modalState.record.addressId || c.maintenanceRecordId === modalState.record.id) && 
                      (c.status === ServiceCallStatus.OPEN || c.status === ServiceCallStatus.IN_PROGRESS)
                    );
                    if (existingCalls.length === 0) return null;
                    return (
                      <div className="p-3 bg-red-50/80 rounded-xl border border-red-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-red-900 flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5 text-red-600" />
                            Chamado(s) em aberto neste endereço ({existingCalls.length}):
                          </span>
                        </div>
                        <div className="space-y-2 max-h-36 overflow-y-auto custom-scrollbar">
                          {existingCalls.map(call => (
                            <div key={call.id} className="p-2.5 bg-white rounded-lg border border-red-100 text-xs shadow-2xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className={cn(
                                  "text-[9px] font-black uppercase px-1.5 py-0.5 rounded",
                                  call.priority === ServiceCallPriority.HIGH ? "bg-red-100 text-red-700" :
                                  call.priority === ServiceCallPriority.MEDIUM ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                                )}>
                                  Prioridade {call.priority === ServiceCallPriority.HIGH ? 'Alta' : call.priority === ServiceCallPriority.MEDIUM ? 'Média' : 'Baixa'}
                                </span>
                                <span className="text-[10px] text-gray-400">
                                  {call.createdAt ? (typeof call.createdAt === 'object' && 'toDate' in call.createdAt ? format(call.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : format(new Date(call.createdAt), 'dd/MM/yyyy HH:mm')) : ''}
                                </span>
                              </div>
                              <p className="text-gray-800 font-medium">{call.description}</p>
                              {call.attachmentUrl && (
                                <a href={call.attachmentUrl} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-semibold">
                                  <Paperclip className="w-3 h-3" /> Ver anexo do chamado
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">
                        Descrição do Problema / Solicitação
                      </label>
                      <textarea 
                        autoFocus
                        value={modalState.serviceCallDescription || ''}
                        onChange={(e) => setModalState({ ...modalState, serviceCallDescription: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none h-28 resize-none font-medium text-gray-800 placeholder:text-gray-400"
                        placeholder="Descreva detalhadamente a falha, equipamento ou serviço solicitado..."
                        disabled={isReadOnly}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-700">
                        Prioridade do Atendimento:
                      </label>
                      <div className="flex gap-2">
                        {[
                          { key: ServiceCallPriority.LOW, label: 'Baixa', activeClass: 'bg-blue-600 text-white' },
                          { key: ServiceCallPriority.MEDIUM, label: 'Média', activeClass: 'bg-amber-600 text-white' },
                          { key: ServiceCallPriority.HIGH, label: 'Alta', activeClass: 'bg-red-600 text-white' }
                        ].map(({ key, label, activeClass }) => (
                          <button
                            key={key}
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => setModalState({ ...modalState, serviceCallPriority: key })}
                            className={cn(
                              "flex-1 py-1.5 rounded-lg text-xs font-bold uppercase transition-all border",
                              modalState.serviceCallPriority === key 
                                ? `${activeClass} border-transparent shadow-xs` 
                                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1 pt-1">
                      <label className="block text-xs font-bold text-gray-700">
                        Foto ou Anexo do Chamado (Opcional):
                      </label>
                      <ImageUploader 
                        value={modalState.serviceCallAttachmentUrl || ''} 
                        onChange={(val) => setModalState({ ...modalState, serviceCallAttachmentUrl: val })} 
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Attachment modal */
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2">
                      Anexo do Agendamento (PDF / Foto / Comprovante)
                    </label>
                    <div className="flex flex-col gap-2">
                      <ImageUploader 
                        value={modalState.value || ''} 
                        onChange={(val) => setModalState({ ...modalState, value: val })} 
                      />
                      {modalState.value && !modalState.value.startsWith('data:image') && (
                        <button
                          type="button"
                          onClick={() => {
                            window.open(modalState.value!.startsWith('http') ? modalState.value : `https://${modalState.value}`, '_blank');
                          }}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold transition-all mt-2 max-w-28 text-center mx-auto"
                        >
                          Testar Link
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t flex items-center justify-between gap-3">
              <div>
                {modalState.type === 'observation' && (modalState.record.address?.notes || modalState.record.notes) && (
                  <button 
                    type="button"
                    onClick={handleRemoveObservation}
                    disabled={isReadOnly}
                    className="px-3.5 py-2 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-xl transition-all"
                  >
                    Remover Observação
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <button 
                  type="button"
                  onClick={() => setModalState(null)}
                  className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={handleModalSave}
                  style={{ display: isReadOnly ? 'none' : 'inline-flex' }}
                  className={cn(
                    "px-6 py-2 text-sm font-bold text-white rounded-xl transition-all shadow-md",
                    modalState.type === 'observation' ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200" :
                    modalState.type === 'service_call' ? "bg-red-600 hover:bg-red-700 shadow-red-200" :
                    modalState.type === 'attachment' ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200" : "bg-red-600 hover:bg-red-700 shadow-red-200"
                  )}
                >
                  {modalState.type === 'delete' ? 'Sim, Excluir' : 
                   modalState.type === 'service_call' ? 'Abrir Chamado Técnico' : 
                   modalState.type === 'observation' ? 'Salvar Observação' : 'Salvar Alteração'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Replication Modal */}
      {replicationModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm overflow-hidden">
            <div className="p-4 bg-gray-800 border-b flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-wider">
                <Copy className="w-4 h-4" />
                Replicar Cronograma
              </h3>
              <button 
                onClick={() => setReplicationModal(prev => ({ ...prev, isOpen: false }))}
                className="p-1 hover:bg-white/10 rounded-full text-white/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Deseja replicar o cronograma atual de <b>{format(startOfMonth(new Date(currentMonth + '-02')), 'MMMM yyyy', { locale: ptBR })}</b> para o <b>próximo mês</b>?
                </p>
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <p className="text-[10px] text-amber-700 font-bold uppercase tracking-tight leading-relaxed">
                    * OS CAMPOS DE SAÍDA, RETORNO, EXECUÇÃO, BAIXAS E ANEXOS SERÃO LIMPOS AUTOMATICAMENTE PARA O NOVO MÊS.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                  <input 
                    type="checkbox"
                    checked={replicationModal.keepTechnicians}
                    onChange={(e) => setReplicationModal(prev => ({ ...prev, keepTechnicians: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-700">Manter mesmos técnicos</span>
                    <span className="text-[10px] text-gray-500">Replica a escala de técnicos atual.</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                  <input 
                    type="checkbox"
                    checked={replicationModal.keepWeeks}
                    onChange={(e) => setReplicationModal(prev => ({ ...prev, keepWeeks: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-700">Manter mesmas semanas</span>
                    <span className="text-[10px] text-gray-500">Mantém o agendamento por semanas (1 a 5).</span>
                  </div>
                </label>
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
              <button 
                onClick={() => setReplicationModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleDuplicate}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-blue-200 flex items-center gap-2"
              >
                {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                Confirmar Replicação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-gray-800 border-b flex items-center justify-between shrink-0">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-wider">
                <Clock className="w-4 h-4" />
                Histórico de Manutenções
              </h3>
              <button 
                onClick={() => setHistoryModal(null)}
                className="p-1 hover:bg-white/10 rounded-full text-white/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 shrink-0 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Endereço</p>
                <p className="font-bold text-gray-900 text-sm">{historyModal.addressName}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total de Registros</p>
                <p className="font-bold text-gray-900 text-sm">{historyModal.records.length}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
              {historyModal.records.length === 0 ? (
                <div className="text-center py-10">
                  <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 font-medium text-sm">Nenhum registro de manutenção encontrado.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {historyModal.records.map(record => (
                    <div key={record.id} className="border border-gray-100 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3 group hover:border-blue-100 transition-colors">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md uppercase">
                            {format(new Date(record.month + '-02'), 'MMM/yyyy', { locale: ptBR })}
                          </span>
                          <span className={cn(
                            "text-[10px] font-black px-2.5 py-1 rounded border uppercase shrink-0 transition-colors shadow-2xs",
                            record.status === MaintenanceStatus.COMPLETED 
                              ? "bg-emerald-600 text-white border-emerald-600" 
                              : "bg-gray-50 text-gray-500 border-gray-200"
                          )}>
                            {record.status === MaintenanceStatus.COMPLETED ? 'Concluído' : 'Pendente'}
                          </span>
                        </div>
                        {record.executionDate && (
                          <div className="text-right">
                            <span className="text-[10px] font-medium text-gray-400 uppercase">Executado em:</span>
                            <p className="text-xs font-bold text-gray-700">{formatDate(record.executionDate)}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-gray-50">
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase">Técnicos</p>
                          <p className="text-xs font-medium text-gray-700">
                            {record.technician1 || '-'} {record.technician2 ? `& ${record.technician2}` : ''}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase">Baixas (Qtd)</p>
                          <p className="text-xs font-medium text-gray-700">{record.executedQuantity || 0}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase">Planejado Para</p>
                          <p className="text-xs font-medium text-gray-700">{record.plannedDate ? formatDate(record.plannedDate) : '-'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 uppercase">Anexo</p>
                          {record.attachmentUrl ? (
                            <a href={record.attachmentUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 text-xs">
                              <Paperclip className="w-3 h-3" /> Ver Anexo
                            </a>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </div>
                      </div>

                      {record.notes && record.notes !== 'PRIORIDADE: Pendente do mês anterior' && (
                        <div className="p-3 bg-gray-50 rounded-lg mt-1 border border-gray-100">
                          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Observações
                          </p>
                          <p className="text-xs text-gray-700">{record.notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 bg-gray-50 border-t flex justify-end shrink-0">
              <button 
                onClick={() => setHistoryModal(null)}
                className="px-6 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold rounded-xl transition-all shadow-md flex items-center gap-2"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DailyCard({ title, date, data, colorClass, headerClass }: any) {
  return (
    <div className={cn("rounded-2xl border flex flex-col h-72 shadow-sm transition-all", colorClass)}>
      <div className={cn("px-4 py-3 border-b flex justify-between items-center", headerClass)}>
        <h3 className="font-bold text-sm uppercase tracking-wider">{title}</h3>
        <span className="text-xs font-black opacity-80">{format(date, 'dd/MM/yyyy')}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-white/50 custom-scrollbar">
        {data.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <Calendar className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-[11px] font-medium">Nenhum endereço previsto.</p>
          </div>
        ) : (
          data.map((item: any) => {
            const isDone = item.record.status === MaintenanceStatus.COMPLETED;
            return (
              <div key={item.record.id} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow group">
                <div className="flex justify-between items-start gap-2 mb-1.5">
                  <span className="text-xs font-bold text-gray-900 uppercase truncate" title={item.client?.name}>
                    {item.client?.name || 'Cliente Desconhecido'}
                  </span>
                  <span className={cn(
                    "text-[9px] font-black px-2 py-0.5 rounded border uppercase shrink-0 transition-colors shadow-2xs",
                    isDone 
                      ? "bg-emerald-600 text-white border-emerald-600" 
                      : "bg-amber-50 text-amber-600 border-amber-200"
                  )}>
                    {isDone ? 'Concluído' : 'Pendente'}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 font-medium line-clamp-1 mb-2" title={item.address?.street}>
                  {item.address?.street}
                </p>
                <div className="text-[10px] flex items-center justify-between text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                  <span className="font-semibold text-gray-500 truncate max-w-[120px]">
                    Rota: {item.address?.route || '-'}
                  </span>
                  {item.record.technician1 && (
                    <span className="truncate max-w-[100px] text-gray-500 ml-2" title={item.record.technician1}>
                      {item.record.technician1}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
