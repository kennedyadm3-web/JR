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
  Wrench
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { ImageUploader } from './ImageUploader';
import { Client, Address, MaintenanceRecord, MaintenanceStatus, Technician, ServiceCallStatus, ServiceCallPriority, ServiceCall } from '../types';
import { cn, formatDate } from '../lib/utils';
import { format, addMonths, subMonths, startOfMonth, subDays, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  managerClientId?: string;
}

export default function ScheduleView({ managerClientId }: Props) {
  const [currentMonth, setCurrentMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
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
  const [serviceCalls, setServiceCalls] = useState<ServiceCall[]>([]);
  const [priorityAddressIds, setPriorityAddressIds] = useState<Set<string>>(new Set());
  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean; addressId: string; addressName: string; records: MaintenanceRecord[] } | null>(null);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [modalState, setModalState] = useState<{
    type: 'notes' | 'attachment' | 'delete';
    record: MaintenanceRecord & { client?: Client; address?: Address };
    value: string;
    isServiceCall?: boolean;
    priority?: ServiceCallPriority;
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
    try {
      const prevMonth = format(subMonths(startOfMonth(new Date(currentMonth + '-02')), 1), 'yyyy-MM');
      const [addrData, clientData, recordData, techData, callData, prevRecordData] = await Promise.all([
        dataService.getAddresses(),
        dataService.getClients(),
        dataService.getRecords(currentMonth),
        dataService.getTechnicians(),
        dataService.getServiceCalls(),
        dataService.getRecords(prevMonth)
      ]);
      const filteredRecords = recordData.filter(r => {
        const addr = addrData.find(a => a.id === r.addressId);
        return !managerClientId || addr?.clientId === managerClientId;
      });

      const missingPriority = new Set<string>();
      prevRecordData.forEach(r => {
        if (r.status !== MaintenanceStatus.COMPLETED) {
          missingPriority.add(r.addressId);
        }
      });

      setPriorityAddressIds(missingPriority);
      setAddresses(addrData.filter(a => !managerClientId || a.clientId === managerClientId));
      setClients(clientData.filter(c => !managerClientId || c.id === managerClientId));
      setRecords(filteredRecords);
      setTechnicians(techData);
      setServiceCalls(callData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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
      await dataService.upsertRecord({ ...record, ...updates });
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, ...updates } : r));
    } catch (e) {
      console.error(e);
    } finally {
      setSavingId(null);
    }
  };

  const groupedRecords = useMemo(() => {
    type EnrichedRecord = MaintenanceRecord & { address?: Address; client?: Client };
    const enriched: EnrichedRecord[] = records.map(r => {
      const addr = addresses.find(a => a.id === r.addressId);
      const client = clients.find(c => c.id === addr?.clientId);
      return { ...r, address: addr, client };
    }).filter(r => {
      const searchTerms = search.toLowerCase();
      return (
        r.client?.name.toLowerCase().includes(searchTerms) ||
        r.address?.street.toLowerCase().includes(searchTerms) ||
        r.address?.route.toLowerCase().includes(searchTerms) ||
        r.technician1?.toLowerCase().includes(searchTerms)
      );
    });

    const groups: Record<string, EnrichedRecord[]> = {};
    enriched.forEach(r => {
      const route = r.address?.route || 'Sem Rota';
      if (!groups[route]) groups[route] = [];
      groups[route].push(r);
    });
    return groups;
  }, [records, addresses, clients, search]);

  const { yesterdayCards, todayCards, tomorrowCards } = useMemo(() => {
    const today = new Date();
    
    // Convert to target date strings
    const todayStr = format(today, 'yyyy-MM-dd');
    const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd');
    const tomorrowStr = format(addDays(today, 1), 'yyyy-MM-dd');

    const getDayRecords = (dateStr: string) => {
      return records
        .filter(r => r.plannedDate === dateStr)
        .map(r => {
          const address = addresses.find(a => a.id === r.addressId);
          const client = clients.find(c => c.id === address?.clientId);
          return { record: r, address, client };
        });
    };

    return {
      yesterdayCards: getDayRecords(yesterdayStr),
      todayCards: getDayRecords(todayStr),
      tomorrowCards: getDayRecords(tomorrowStr)
    };
  }, [records, addresses, clients]);

  const monthLabel = format(new Date(currentMonth + '-02'), 'MMMM yyyy', { locale: ptBR });

  const handleModalSave = async () => {
    if (!modalState) return;
    const { type, record, value, isServiceCall, priority } = modalState;
    
    if (type === 'delete') {
      try {
        setSavingId(record.id);
        await dataService.deleteRecord(record.id);
        setRecords(prev => prev.filter(r => r.id !== record.id));
        setModalState(null);
      } catch (e) {
        console.error(e);
      } finally {
        setSavingId(null);
      }
    } else {
      const field = type === 'notes' ? 'notes' : 'attachmentUrl';
      await updateRecord(record, { [field]: value });
      
      if (type === 'notes' && isServiceCall && value) {
        try {
          const newCall = {
            clientId: record.client?.id || '',
            addressId: record.addressId,
            maintenanceRecordId: record.id,
            description: value,
            status: ServiceCallStatus.OPEN,
            priority: priority || ServiceCallPriority.MEDIUM,
            clientName: record.client?.name,
            addressLabel: record.address?.street,
            createdAt: new Date()
          };
          const docRef = await dataService.addServiceCall(newCall);
          setMessage({ text: 'Nota salva e Chamado aberto com sucesso!', type: 'success' });
          
          if (docRef?.id) {
            setServiceCalls(prev => [{ id: docRef.id, ...newCall } as ServiceCall, ...prev]);
          } else {
            // Fallback just in case
            const updatedCalls = await dataService.getServiceCalls();
            setServiceCalls(updatedCalls);
          }
        } catch (e) {
          console.error('Erro ao abrir chamado:', e);
          setMessage({ text: 'Nota salva, mas houve erro ao abrir o chamado.', type: 'error' });
        }
      }
      
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
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm print:hidden"
          >
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
          <button 
            onClick={handleGenerate}
            disabled={loading || !!managerClientId}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Gerar Cronograma
          </button>
          <button 
            onClick={() => setReplicationModal(prev => ({ ...prev, isOpen: true }))}
            disabled={loading || !!managerClientId}
            title="Replicar para o próximo mês"
            className="bg-gray-800 hover:bg-black text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            Criar Próximo
          </button>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
        <DailyCard title="Ontem" date={subDays(new Date(), 1)} data={yesterdayCards} colorClass="bg-gray-50 border-gray-200" headerClass="bg-gray-100 border-gray-200 text-gray-700" />
        <DailyCard title="Hoje" date={new Date()} data={todayCards} colorClass="bg-blue-50 border-blue-200" headerClass="bg-blue-100 border-blue-200 text-blue-800" />
        <DailyCard title="Amanhã" date={addDays(new Date(), 1)} data={tomorrowCards} colorClass="bg-amber-50 border-amber-200" headerClass="bg-amber-100 border-amber-200 text-amber-800" />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-200">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
          <p className="text-gray-500">Carregando dados do cronograma...</p>
        </div>
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
                    {recordsList.map(record => (
                      <tr key={record.id} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900 text-sm uppercase">{record.client?.name}</span>
                              {priorityAddressIds.has(record.addressId) && (
                                <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-200" title="Manutenção do mês anterior não foi concluída" />
                              )}
                            </div>
                            <span 
                              className="text-xs text-gray-500 hover:text-blue-600 cursor-pointer transition-colors"
                              onClick={() => openHistory(record.addressId, record.address?.street || '')}
                              title="Ver histórico de manutenções"
                            >
                              {record.address?.street}
                            </span>
                            
                            <div className="flex items-center gap-1.5 mt-2">
                              {record.notes && (
                                <div 
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100 transition-colors cursor-help"
                                  title={record.notes}
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  <span className="text-[9px] font-black uppercase tracking-tighter">OBS</span>
                                </div>
                              )}

                              {serviceCalls.some(c => 
                                (c.maintenanceRecordId === record.id || c.addressId === record.addressId) && 
                                (c.status === ServiceCallStatus.OPEN || c.status === ServiceCallStatus.IN_PROGRESS)
                              ) && (
                                <div 
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-100 animate-pulse hover:bg-red-100 transition-colors cursor-help"
                                  title="Este endereço possui um chamado técnico em aberto"
                                >
                                  <Wrench className="w-3 h-3" />
                                  <span className="text-[9px] font-black uppercase tracking-tighter">CHAMADO</span>
                                </div>
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
                              onChange={(e) => updateRecord(record, { technician1: e.target.value })}
                              className="text-[10px] font-medium bg-gray-50 border border-gray-100 rounded px-2 py-1 focus:ring-0 cursor-pointer w-32"
                            >
                              <option value="">Técnico 1</option>
                              {technicians.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                            </select>
                            <select 
                              value={record.technician2 || ''}
                              onChange={(e) => updateRecord(record, { technician2: e.target.value })}
                              className="text-[10px] font-medium bg-gray-50 border border-gray-100 rounded px-2 py-1 focus:ring-0 cursor-pointer w-32"
                            >
                              <option value="">Técnico 2</option>
                              {technicians.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                            </select>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <select 
                            value={record.scheduledWeek}
                            onChange={(e) => updateRecord(record, { scheduledWeek: parseInt(e.target.value) })}
                            className="text-xs font-semibold bg-gray-100 border-none rounded px-2 py-1 focus:ring-0 cursor-pointer"
                          >
                            {[1,2,3,4,5].map(w => <option key={w} value={w}>Semana {w}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-4">
                          <input 
                            type="date"
                            value={record.plannedDate || ''}
                            onChange={(e) => updateRecord(record, { plannedDate: e.target.value })}
                            className="text-xs border border-gray-100 bg-gray-50/50 rounded px-2 py-1 outline-none focus:border-blue-500 w-full md:w-auto font-bold text-blue-600"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <input 
                            type="date"
                            value={record.executionDate ? record.executionDate.split('T')[0] : ''}
                            onChange={(e) => {
                              const dateStr = e.target.value;
                              const qty = record.executedQuantity || 0;
                              
                              let nextStatus = MaintenanceStatus.PENDING;
                              if (qty > 0) {
                                nextStatus = MaintenanceStatus.COMPLETED;
                              } else if (dateStr) {
                                // Se tem data mas quantidade é 0, ainda é pendente segundo a regra
                                // Mas geralmente se o cara visitou e não fez nada, fica pendente.
                                nextStatus = MaintenanceStatus.PENDING;
                              }

                              updateRecord(record, { 
                                executionDate: dateStr ? `${dateStr}T12:00:00Z` : undefined,
                                status: nextStatus
                              });
                            }}
                            className="text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-500 w-full md:w-auto"
                          />
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input 
                              type="number"
                              min="0"
                              max={record.address?.totalMachines}
                              value={record.executedQuantity ?? ''}
                              placeholder="0"
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                const hasDate = !!record.executionDate;

                                let nextStatus = MaintenanceStatus.PENDING;
                                if (val > 0) {
                                  nextStatus = MaintenanceStatus.COMPLETED;
                                } else if (hasDate) {
                                  nextStatus = MaintenanceStatus.PENDING;
                                }

                                updateRecord(record, { 
                                  executedQuantity: val,
                                  status: nextStatus
                                });
                              }}
                              className="w-16 text-center text-xs border border-gray-200 rounded px-1 py-1 outline-none focus:border-blue-500"
                            />
                            <span className="text-[10px] text-gray-400">/ {record.address?.totalMachines}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                            record.status === MaintenanceStatus.COMPLETED ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                            "bg-gray-50 text-gray-500 border-gray-100"
                          )}>
                            {record.status === MaintenanceStatus.COMPLETED ? 'Concluído' : 'Pendente'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              type="button"
                              onClick={() => setModalState({ 
                                type: 'notes', 
                                record, 
                                value: record.notes || '' 
                              })}
                              title="Observações"
                              className={cn(
                                "p-2 rounded-lg transition-all",
                                record.notes ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                              )}
                            >
                              <AlertCircle className="w-4 h-4" />
                            </button>
                            <button 
                              type="button"
                              onClick={() => setModalState({ 
                                type: 'attachment', 
                                record, 
                                value: record.attachmentUrl || '' 
                              })}
                              title="Anexo"
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
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                            {savingId === record.id && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                          </div>
                        </td>
                      </tr>
                    ))}
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
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden">
            <div className={cn(
              "p-4 border-b flex items-center justify-between",
              modalState.type === 'notes' ? "bg-amber-50 border-amber-100" :
              modalState.type === 'attachment' ? "bg-blue-50 border-blue-100" : "bg-red-50 border-red-100"
            )}>
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                {modalState.type === 'notes' && <AlertCircle className="w-4 h-4 text-amber-600" />}
                {modalState.type === 'attachment' && <Paperclip className="w-4 h-4 text-blue-600" />}
                {modalState.type === 'delete' && <Trash2 className="w-4 h-4 text-red-600" />}
                {modalState.type === 'notes' ? 'Observações' : 
                 modalState.type === 'attachment' ? 'Anexar Documento' : 'Confirmar Exclusão'}
              </h3>
              <button 
                onClick={() => setModalState(null)}
                className="p-1 hover:bg-black/5 rounded-full text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                {modalState.record.client?.name} - {modalState.record.address?.street}
              </p>
              
              {modalState.type === 'delete' ? (
                <p className="text-gray-600 text-sm">
                  Tem certeza que deseja excluir permanentemente este agendamento do cronograma? 
                  Esta ação não poderá ser desfeita.
                </p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      {modalState.type === 'notes' ? 'Descrição da Observação' : 'URL do Anexo (PDF/Foto/Drive)'}
                    </label>
                    {modalState.type === 'notes' ? (
                      <div className="space-y-4">
                        <textarea 
                          autoFocus
                          value={modalState.value}
                          onChange={(e) => setModalState({ ...modalState, value: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none h-32 resize-none"
                          placeholder="Digite aqui os detalhes da observação..."
                        />
                        
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 space-y-3">
                          <label className="flex items-center gap-3 cursor-pointer group">
                            <input 
                              type="checkbox"
                              checked={!!modalState.isServiceCall}
                              onChange={(e) => setModalState({ 
                                ...modalState, 
                                isServiceCall: e.target.checked,
                                priority: e.target.checked ? (modalState.priority || ServiceCallPriority.MEDIUM) : undefined
                              })}
                              className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500"
                            />
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-amber-900 group-hover:text-amber-700 transition-colors">Abrir como Chamado Técnico</span>
                              <span className="text-[10px] text-amber-600">Transformar esta nota em uma pendência para atendimento futuro.</span>
                            </div>
                          </label>

                          {modalState.isServiceCall && (
                            <div className="flex items-center gap-2 pt-2 border-t border-amber-100">
                              <span className="text-[10px] font-bold text-amber-700 uppercase">Prioridade:</span>
                              <div className="flex gap-1">
                                {Object.values(ServiceCallPriority).map((p) => (
                                  <button
                                    key={p}
                                    type="button"
                                    onClick={() => setModalState({ ...modalState, priority: p })}
                                    className={cn(
                                      "px-2 py-1 rounded text-[10px] font-bold uppercase transition-all",
                                      modalState.priority === p 
                                        ? "bg-amber-600 text-white shadow-sm" 
                                        : "bg-white text-amber-600 border border-amber-200 hover:bg-amber-100"
                                    )}
                                  >
                                    {p === 'low' ? 'Baixa' : p === 'medium' ? 'Média' : 'Alta'}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <ImageUploader 
                          value={modalState.value || ''} 
                          onChange={(val) => setModalState({ ...modalState, value: val })} 
                        />
                        {modalState.value && !modalState.value.startsWith('data:image') && (
                          <button
                            type="button"
                            onClick={() => {
                              window.open(modalState.value.startsWith('http') ? modalState.value : `https://${modalState.value}`, '_blank');
                            }}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-bold transition-all mt-2 max-w-24 text-center mx-auto"
                          >
                            Testar Link
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
              <button 
                onClick={() => setModalState(null)}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleModalSave}
                className={cn(
                  "px-6 py-2 text-sm font-bold text-white rounded-xl transition-all shadow-md",
                  modalState.type === 'notes' ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200" :
                  modalState.type === 'attachment' ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200" : "bg-red-600 hover:bg-red-700 shadow-red-200"
                )}
              >
                {modalState.type === 'delete' ? 'Sim, Excluir' : 'Salvar Alteração'}
              </button>
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
                            "text-[10px] font-black px-2 py-1 rounded border uppercase shrink-0",
                            record.status === MaintenanceStatus.COMPLETED 
                              ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
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

                      {record.notes && (
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
            const isDone = item.record.status === 'COMPLETED';
            return (
              <div key={item.record.id} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow group">
                <div className="flex justify-between items-start gap-2 mb-1.5">
                  <span className="text-xs font-bold text-gray-900 uppercase truncate" title={item.client?.name}>
                    {item.client?.name || 'Cliente Desconhecido'}
                  </span>
                  <span className={cn(
                    "text-[9px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 transition-colors",
                    isDone 
                      ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
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
