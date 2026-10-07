import { useState, useEffect, useMemo } from 'react';
import { Address, MaintenanceRecord, Client } from '../types';
import { dataService } from '../services/dataService';
import { format, differenceInDays, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Clock, Calendar, Search, Printer, CheckCircle, TrendingUp, Award, Users, Target, Percent, Eye, X, MapPin, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface PriorityRouteModalState {
  isOpen: boolean;
  routeName: string;
  loading: boolean;
  priorities: Array<{
    addressId: string;
    street: string;
    neighborhood?: string;
    number?: string;
    technician: string;
    plannedDate: string;
    status: string;
    isCompleted: boolean;
  }>;
}

export function ScheduleReport({ managerClientId }: { managerClientId?: string }) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [allRecords, setAllRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [viewMode, setViewMode] = useState<'pending' | 'completed' | 'client_routes'>(() => {
    return (localStorage.getItem('schedule_report_view_mode') as 'pending' | 'completed' | 'client_routes') || 'pending';
  });
  
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return localStorage.getItem('schedule_report_selected_month') || format(new Date(), 'yyyy-MM');
  });
  
  const [limit, setLimit] = useState<'6' | '10' | '20' | '30' | 'all'>(() => {
    return (localStorage.getItem('schedule_report_limit') as any) || 'all';
  });

  const [selectedClientId, setSelectedClientId] = useState<string>(() => {
    return localStorage.getItem('schedule_report_client_id') || '';
  });

  const [priorityModal, setPriorityModal] = useState<PriorityRouteModalState>({
    isOpen: false,
    routeName: '',
    loading: false,
    priorities: []
  });

  useEffect(() => {
    if (managerClientId) {
      setSelectedClientId(managerClientId);
    }
  }, [managerClientId]);

  useEffect(() => {
    localStorage.setItem('schedule_report_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('schedule_report_selected_month', selectedMonth);
  }, [selectedMonth]);

  useEffect(() => {
    localStorage.setItem('schedule_report_limit', limit);
  }, [limit]);

  useEffect(() => {
    localStorage.setItem('schedule_report_client_id', selectedClientId);
  }, [selectedClientId]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const safetyTimeout = setTimeout(() => setLoading(false), 8000);
    try {
      const [a, c, r] = await Promise.all([
        dataService.getAddresses().catch(() => []),
        dataService.getClients().catch(() => []),
        dataService.getAllRecords().catch(() => [])
      ]);
      
      // Filter for manager if needed
      const filteredAddresses = a.filter(addr => !managerClientId || addr.clientId === managerClientId);
      
      setAddresses(filteredAddresses);
      setClients(c);
      setAllRecords(r);
    } catch (e) {
      console.error('Erro ao carregar dados do relatório de cronograma:', e);
    } finally {
      setLoading(false);
      clearTimeout(safetyTimeout);
    }
  };

  const addressStats = useMemo(() => {
    return addresses.map(addr => {
      // Find all completed records for this address
      const addrRecords = allRecords.filter(r => 
        r.addressId === addr.id && 
        r.status === 'completed'
      );

      // Find the most recent date
      let lastDate: Date | null = null;
      
      addrRecords.forEach(r => {
        let recDate: Date;
        if (r.executionDate) {
          recDate = new Date(r.executionDate);
        } else {
          // fallback to month
          recDate = new Date(r.month + '-01T12:00:00');
        }

        if (!lastDate || recDate > lastDate) {
          lastDate = recDate;
        }
      });

      const daysWithoutMaintenance = lastDate 
        ? differenceInDays(new Date(), lastDate) 
        : Infinity;

      const client = clients.find(c => c.id === addr.clientId);

      return {
        ...addr,
        clientName: client?.name || 'Cliente Desconhecido',
        lastDate,
        daysWithoutMaintenance
      };
    }).sort((a, b) => b.daysWithoutMaintenance - a.daysWithoutMaintenance);
  }, [addresses, allRecords, clients]);

  const filteredStats = useMemo(() => {
    if (!searchTerm) return addressStats;
    const lower = searchTerm.toLowerCase();
    return addressStats.filter(s => 
      s.street.toLowerCase().includes(lower) || 
      s.clientName.toLowerCase().includes(lower) ||
      (s.route && s.route.toLowerCase().includes(lower))
    );
  }, [addressStats, searchTerm]);

  const completedStats = useMemo(() => {
    return allRecords.filter(r => 
        r.status === 'completed' && r.month === selectedMonth
    ).map(record => {
        const address = addresses.find(a => a.id === record.addressId);
        const client = clients.find(c => c.id === address?.clientId);
        
        if (managerClientId && address?.clientId !== managerClientId) {
            return null;
        }
        
        return {
           id: record.id,
           clientId: address?.clientId,
           street: address?.street || 'Endereço Indisponível',
           route: address?.route,
           clientName: client?.name || 'Cliente Desconhecido',
           totalMachines: address?.totalMachines || 0,
           executionDate: record.executionDate,
           technician1: record.technician1,
           technician2: record.technician2,
           technicians: [record.technician1, record.technician2].filter(Boolean).join(', ') || 'Sem técnico'
        };
    }).filter(Boolean).sort((a, b) => {
         const dateA = a!.executionDate ? new Date(a!.executionDate).getTime() : 0;
         const dateB = b!.executionDate ? new Date(b!.executionDate).getTime() : 0;
         return dateB - dateA;
    });
  }, [allRecords, selectedMonth, addresses, clients, managerClientId]);

  const filteredCompletedStats = useMemo(() => {
    const list = completedStats as NonNullable<typeof completedStats[0]>[];
    if (!searchTerm) return list;
    const lower = searchTerm.toLowerCase();
    return list.filter(s => 
      s.street.toLowerCase().includes(lower) || 
      s.clientName.toLowerCase().includes(lower) ||
      (s.route && s.route.toLowerCase().includes(lower))
    );
  }, [completedStats, searchTerm]);

  const paginatedCompletedStats = useMemo(() => {
    if (limit === 'all') return filteredCompletedStats;
    return filteredCompletedStats.slice(0, parseInt(limit, 10));
  }, [filteredCompletedStats, limit]);

  const statsForStatsAndRanking = useMemo(() => {
    let baseRecords = allRecords.filter(r => r.status === 'completed' && r.executionDate);

    if (limit === 'all') {
      baseRecords = baseRecords.filter(r => r.month === selectedMonth);
    } else {
      const days = parseInt(limit, 10);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      cutoffDate.setHours(0, 0, 0, 0);

      baseRecords = baseRecords.filter(r => {
        if (!r.executionDate) return false;
        const execDate = new Date(r.executionDate);
        return execDate >= cutoffDate;
      });
    }

    return baseRecords.map(record => {
      const address = addresses.find(a => a.id === record.addressId);
      const client = clients.find(c => c.id === address?.clientId);

      if (managerClientId && address?.clientId !== managerClientId) {
          return null;
      }

      return {
         id: record.id,
         clientId: address?.clientId,
         addressId: record.addressId,
         street: address?.street || 'Endereço Indisponível',
         route: address?.route,
         clientName: client?.name || 'Cliente Desconhecido',
         totalMachines: address?.totalMachines || 0,
         executionDate: record.executionDate,
         technician1: record.technician1,
         technician2: record.technician2,
         technicians: [record.technician1, record.technician2].filter(Boolean).join(', ') || 'Sem técnico'
      };
    }).filter(Boolean) as any[];
  }, [allRecords, limit, selectedMonth, addresses, clients, managerClientId]);

  const clientPeriodStats = useMemo(() => {
    if (!selectedClientId) return null;
    
    const clientRecords = statsForStatsAndRanking.filter(stat => stat?.clientId === selectedClientId);
    const totalMachines = clientRecords.reduce((sum, item) => sum + (item.totalMachines || 0), 0);
    
    const uniqueDates = new Set(
      clientRecords
        .map(item => item.executionDate?.split('T')[0])
        .filter(Boolean)
    );
    
    const dailyAverage = uniqueDates.size > 0 ? (totalMachines / uniqueDates.size) : 0;
    const clientObj = clients.find(c => c.id === selectedClientId);
    
    return {
      clientName: clientObj?.name || 'Cliente',
      totalMachines,
      dailyAverage,
      maintenanceCount: clientRecords.length,
      daysCount: uniqueDates.size
    };
  }, [statsForStatsAndRanking, selectedClientId, clients]);

  const technicianRanking = useMemo(() => {
    const techStats: Record<string, { count: number; totalMachines: number }> = {};
    
    statsForStatsAndRanking.forEach(stat => {
      const activeTechs = [stat?.technician1, stat?.technician2].filter(Boolean);
      activeTechs.forEach(tech => {
        if (!tech) return;
        if (!techStats[tech]) {
          techStats[tech] = { count: 0, totalMachines: 0 };
        }
        techStats[tech].count += 1;
        techStats[tech].totalMachines += stat?.totalMachines || 0;
      });
    });
    
    return Object.entries(techStats)
      .map(([name, data]) => ({
        name,
        count: data.count,
        totalMachines: data.totalMachines
      }))
      .sort((a, b) => b.totalMachines - a.totalMachines)
      .slice(0, 3);
  }, [statsForStatsAndRanking]);

  const clientPieData = useMemo(() => {
    if (!selectedClientId) return [];
    
    const clientAddresses = addresses.filter(a => a.clientId === selectedClientId);
    const totalCount = clientAddresses.length;
    if (totalCount === 0) return [];
    
    const completedAddressIds = new Set(
      allRecords
        .filter(r => r.status === 'completed' && r.month === selectedMonth)
        .map(r => r.addressId)
    );
    
    let completedCount = 0;
    clientAddresses.forEach(addr => {
      if (completedAddressIds.has(addr.id)) {
        completedCount++;
      }
    });
    
    const pendingCount = Math.max(0, totalCount - completedCount);
    
    return [
      { name: 'Realizados', value: completedCount, color: '#10b981' },
      { name: 'Pendentes', value: pendingCount, color: '#f59e0b' }
    ];
  }, [selectedClientId, addresses, allRecords, selectedMonth]);

  const clientPercentage = useMemo(() => {
    if (clientPieData.length === 0) return 0;
    const realizados = clientPieData.find(d => d.name === 'Realizados')?.value || 0;
    const pendentes = clientPieData.find(d => d.name === 'Pendentes')?.value || 0;
    const total = realizados + pendentes;
    return total > 0 ? Math.round((realizados / total) * 100) : 0;
  }, [clientPieData]);

  const chartData = useMemo(() => {
    if (viewMode !== 'completed') return [];
    
    const dailyTotals: Record<string, number> = {};
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 20);
    cutoffDate.setHours(0, 0, 0, 0);
    
    allRecords.forEach(record => {
        if (record.status !== 'completed' || !record.executionDate) return;
        
        const execDate = new Date(record.executionDate);
        if (execDate >= cutoffDate) {
            const address = addresses.find(a => a.id === record.addressId);
            if (managerClientId && address?.clientId !== managerClientId) return;
            
            const dateStr = record.executionDate.split('T')[0];
            dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + (address?.totalMachines || 0);
        }
    });
    
    return Object.entries(dailyTotals)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, total]) => {
          const [yyyy, mm, dd] = date.split('-');
          return {
             date: `${dd}/${mm}`,
             total
          };
      });
  }, [allRecords, viewMode, addresses, managerClientId]);

  const clientRoutesProgress = useMemo(() => {
    if (!selectedClientId) return [];

    const getPreviousMonth = (monthStr: string) => {
      const [yearStr, monthStrPair] = monthStr.split('-');
      let year = parseInt(yearStr, 10);
      let month = parseInt(monthStrPair, 10);
      month--;
      if (month === 0) {
        month = 12;
        year--;
      }
      return `${year}-${String(month).padStart(2, '0')}`;
    };

    const prevMonth = getPreviousMonth(selectedMonth);

    // Endereços do cliente selecionado
    const clientAddresses = addresses.filter(a => a.clientId === selectedClientId);

    // Identificar registros do mês atual e mês anterior do cliente
    // Mês atual:
    const currentMonthCompletedRecords = allRecords.filter(
      r => r.month === selectedMonth && r.status === 'completed'
    );
    const completedAddressIds = new Set(currentMonthCompletedRecords.map(r => r.addressId));

    // Mês anterior (para prioridades):
    const prevMonthRecords = allRecords.filter(r => r.month === prevMonth);
    const priorityAddressIds = new Set(
      prevMonthRecords
        .filter(r => r.status !== 'completed')
        .map(r => r.addressId)
    );

    // Agrupar os endereços do cliente por rota
    const routesMap: Record<string, {
      routeName: string;
      totalAddresses: number;
      completedAddresses: number;
      priorityAddressesTotal: number;
      priorityAddressesPending: number;
    }> = {};

    clientAddresses.forEach(addr => {
      const routeName = addr.route || 'Sem Rota';
      if (!routesMap[routeName]) {
        routesMap[routeName] = {
          routeName,
          totalAddresses: 0,
          completedAddresses: 0,
          priorityAddressesTotal: 0,
          priorityAddressesPending: 0,
        };
      }

      const group = routesMap[routeName];
      group.totalAddresses++;

      const isCompletedNow = completedAddressIds.has(addr.id);
      if (isCompletedNow) {
        group.completedAddresses++;
      }

      // É prioridade?
      const isPriority = priorityAddressIds.has(addr.id);
      if (isPriority) {
        group.priorityAddressesTotal++;
        if (!isCompletedNow) {
          group.priorityAddressesPending++;
        }
      }
    });

    return Object.values(routesMap).sort((a, b) => {
      if (a.routeName === 'Sem Rota') return 1;
      if (b.routeName === 'Sem Rota') return -1;
      return a.routeName.localeCompare(b.routeName, 'pt-BR');
    });
  }, [selectedClientId, addresses, allRecords, selectedMonth]);

  const handleOpenPriorityModal = async (routeName: string) => {
    setPriorityModal({
      isOpen: true,
      routeName,
      loading: true,
      priorities: []
    });

    try {
      const getPreviousMonth = (monthStr: string) => {
        const [yearStr, monthStrPair] = monthStr.split('-');
        let year = parseInt(yearStr, 10);
        let month = parseInt(monthStrPair, 10);
        month--;
        if (month === 0) {
          month = 12;
          year--;
        }
        return `${year}-${String(month).padStart(2, '0')}`;
      };

      const prevMonth = getPreviousMonth(selectedMonth);

      // Carregamento sob demanda SOMENTE ao clicar no botão/ícone
      const [currentRecords, prevRecords] = await Promise.all([
        dataService.getRecords(selectedMonth),
        dataService.getRecords(prevMonth)
      ]);

      // Endereços do cliente selecionado nesta rota específica
      const clientAddressesInRoute = addresses.filter(
        a => (!selectedClientId || a.clientId === selectedClientId) && 
             (a.route === routeName || (!a.route && routeName === 'Sem Rota'))
      );

      const routeAddressIds = new Set(clientAddressesInRoute.map(a => a.id));

      // Identificar pendências do mês anterior para esta rota
      const prevPendingAddressIds = new Set(
        prevRecords
          .filter(r => r.status !== 'completed' && routeAddressIds.has(r.addressId))
          .map(r => r.addressId)
      );

      const priorityItems = clientAddressesInRoute
        .filter(addr => {
          const isPrevPending = prevPendingAddressIds.has(addr.id);
          const currRec = currentRecords.find(r => r.addressId === addr.id);
          const hasPriorityNote = currRec?.notes?.includes('PRIORIDADE');
          const isPriority = isPrevPending || hasPriorityNote;
          
          // Mostrar APENAS os endereços que AINDA FALTAM FAZER (remove os já realizados)
          const isCompleted = currRec?.status === 'completed';
          return isPriority && !isCompleted;
        })
        .map(addr => {
          const currentRecord = currentRecords.find(r => r.addressId === addr.id);
          
          // 1. Técnico programado
          const techs: string[] = [];
          if (currentRecord?.technician1 && currentRecord.technician1.trim()) {
            techs.push(currentRecord.technician1.trim());
          }
          if (currentRecord?.technician2 && currentRecord.technician2.trim()) {
            techs.push(currentRecord.technician2.trim());
          }
          const technician = techs.length > 0 ? techs.join(' / ') : 'Não programado';

          // 2. Data Prevista
          let plannedDate = 'Não agendada';
          if (currentRecord?.plannedDate) {
            try {
              const parsed = parseISO(currentRecord.plannedDate);
              if (isValid(parsed)) {
                plannedDate = format(parsed, 'dd/MM/yyyy');
              } else {
                plannedDate = currentRecord.plannedDate;
              }
            } catch {
              plannedDate = currentRecord.plannedDate;
            }
          }

          return {
            addressId: addr.id,
            street: addr.street,
            neighborhood: addr.neighborhood,
            number: addr.number,
            technician,
            plannedDate,
            status: currentRecord?.status || 'pending',
            isCompleted: false
          };
        });

      setPriorityModal({
        isOpen: true,
        routeName,
        loading: false,
        priorities: priorityItems
      });
    } catch (error) {
      console.error('Erro ao carregar prioridades da rota:', error);
      setPriorityModal(prev => ({
        ...prev,
        loading: false,
        priorities: []
      }));
    }
  };

  if (loading) {
    return (
        <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[500px]">
      <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50 print:hidden">
        <div className="flex bg-gray-200/50 p-1 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setViewMode('pending')}
              className={cn("flex-1 sm:flex-none px-4 py-2 text-sm font-bold rounded-lg transition-all whitespace-nowrap flex items-center justify-center gap-2", viewMode === 'pending' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
            >
              <Clock className={cn("w-4 h-4", viewMode === 'pending' ? "text-amber-600" : "")} />
              Pendentes / Sem Manutenção
            </button>
            <button
              onClick={() => setViewMode('completed')}
              className={cn("flex-1 sm:flex-none px-4 py-2 text-sm font-bold rounded-lg transition-all whitespace-nowrap flex items-center justify-center gap-2", viewMode === 'completed' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
            >
              <CheckCircle className={cn("w-4 h-4", viewMode === 'completed' ? "text-emerald-600" : "")} />
              Concluídos no Mês
            </button>
            <button
              onClick={() => setViewMode('client_routes')}
              className={cn("flex-1 sm:flex-none px-4 py-2 text-sm font-bold rounded-lg transition-all whitespace-nowrap flex items-center justify-center gap-2", viewMode === 'client_routes' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
            >
              <Target className={cn("w-4 h-4", viewMode === 'client_routes' ? "text-blue-600" : "")} />
              Acompanhamento por Cliente
            </button>
        </div>
        <div className="flex items-center gap-3">
            {viewMode === 'completed' && (
               <>
                 <select
                    value={limit}
                    onChange={(e) => setLimit(e.target.value as any)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none print:hidden flex-shrink-0"
                 >
                    <option value="6">Últimos 6</option>
                    <option value="10">Últimos 10</option>
                    <option value="20">Últimos 20</option>
                    <option value="30">Últimos 30</option>
                    <option value="all">Todos do Mês</option>
                 </select>
                 <input 
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none print:hidden"
                 />
               </>
            )}
            {viewMode === 'client_routes' && (
                 <input 
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none print:hidden"
                 />
            )}
            {viewMode !== 'client_routes' && (
              <div className="relative flex-1 sm:flex-initial">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                      type="text"
                      placeholder="Buscar endereço ou cliente..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none w-full sm:w-56"
                  />
              </div>
            )}
            <button 
                type="button"
                onClick={() => { 
                    window.focus(); 
                    setTimeout(() => window.print(), 200); 
                }}
                className="p-2 border border-gray-200 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors shrink-0 bg-white shadow-sm print:hidden"
                title="Imprimir Relatório"
            >
                <Printer className="w-5 h-5" />
            </button>
        </div>
      </div>
      
      <div className="hidden print:block p-6 border-b border-gray-200">
         <h2 className="text-xl font-bold text-gray-900">
            {viewMode === 'pending' 
              ? 'Relatório de Endereços Pendentes / Sem Manutenção' 
              : viewMode === 'completed' 
              ? `Relatório de Endereços Concluídos - ${format(new Date(selectedMonth + '-01T12:00:00'), 'MMMM/yyyy', { locale: ptBR })}`
              : `Relatório de Acompanhamento de Rotas - ${clients.find(c => c.id === selectedClientId)?.name || 'Cliente Geral'}`
            }
         </h2>
         <p className="text-xs text-gray-500 font-bold uppercase mt-1">
            Referência: {format(new Date(selectedMonth + '-01T12:00:00'), 'MMMM / yyyy', { locale: ptBR })} | Gerado em {format(new Date(), 'dd/MM/yyyy HH:mm')}
         </p>
      </div>

      {viewMode === 'completed' && chartData.length > 0 && (
         <div className="p-6 print:p-3 border-b border-gray-100 bg-white">
            <h3 className="text-sm print:text-xs font-bold text-gray-900 mb-4 print:mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Produção Diária (Máquinas)
            </h3>
            {/* Visualização de Tela Responiva */}
            <div className="h-48 w-full print:hidden">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis 
                            dataKey="date" 
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                            dy={10}
                        />
                        <YAxis 
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                            width={30}
                        />
                        <Tooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            labelStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                            itemStyle={{ fontSize: '12px' }}
                            labelFormatter={(label) => `Dia ${label}`}
                        />
                        <Line 
                            type="monotone" 
                            dataKey="total" 
                            name="Máquinas Concluídas"
                            stroke="#10b981" 
                            strokeWidth={3}
                            dot={{ strokeWidth: 2, r: 4, fill: '#fff' }}
                            activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Visualização de Impressão Fixa */}
            <div className="hidden print:flex justify-center w-full">
                <LineChart width={650} height={140} data={chartData} margin={{ top: 10, right: 15, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis 
                        dataKey="date" 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 9, fill: '#6b7280' }}
                        dy={5}
                    />
                    <YAxis 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 9, fill: '#6b7280' }}
                        width={25}
                    />
                    <Line 
                        type="monotone" 
                        dataKey="total" 
                        name="Máquinas Concluídas"
                        stroke="#10b981" 
                        strokeWidth={2.5}
                        dot={{ strokeWidth: 1.5, r: 3, fill: '#fff' }}
                    />
                </LineChart>
            </div>
         </div>
      )}

      {viewMode === 'completed' && (
         <div className="p-6 print:p-3 border-b border-gray-100 bg-gray-50/50 grid grid-cols-1 lg:grid-cols-2 print:grid-cols-2 gap-6 print:gap-3">
            {/* Análise de Cliente */}
            <div className="bg-white p-5 print:p-3.5 rounded-2xl border border-gray-150 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 print:mb-2">
                  <h4 className="text-sm print:text-xs font-bold text-gray-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    Análise por Cliente
                  </h4>
                  <span className="text-[10px] print:text-[8px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {limit === 'all' ? 'Todos do Mês' : `Últimos ${limit} Dias`}
                  </span>
                </div>
                
                <div className="mb-4 print:hidden">
                  <label htmlFor="client-stats-selector" className="block text-xs font-bold text-gray-500 mb-1.5">
                    Selecione um Cliente para analisar:
                  </label>
                  <select
                    id="client-stats-selector"
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  >
                    <option value="">-- Selecione o Cliente --</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {clientPeriodStats ? (
                <div className="flex flex-col sm:flex-row print:flex-row items-center gap-6 print:gap-3 mt-2 print:mt-0">
                  <div className="flex-1 w-full space-y-4 print:space-y-2">
                    {/* Visível apenas na impressão */}
                    <div className="hidden print:block border-l-2 border-blue-500 pl-2 py-0.5 bg-gray-50 rounded-r-lg mb-2">
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Cliente Selecionado</p>
                      <p className="text-xs font-black text-gray-900 leading-tight">{clientPeriodStats.clientName}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 print:gap-2">
                      <div className="bg-blue-50/30 p-3 print:p-2 rounded-xl border border-blue-100 flex flex-col justify-between">
                        <div>
                          <p className="text-[11px] print:text-[9px] font-bold text-gray-400 flex items-center gap-1">
                            <Target className="w-3 h-3 print:w-2.5 print:h-2.5 text-blue-500" />
                            Média Diária
                          </p>
                          <p className="text-xl print:text-base font-black text-blue-700 mt-1">
                            {clientPeriodStats.dailyAverage.toFixed(1)}
                          </p>
                        </div>
                        <p className="text-[10px] print:text-[8px] text-blue-500 font-medium mt-1">
                          máquinas / dia ativo
                        </p>
                      </div>

                      <div className="bg-emerald-50/30 p-3 print:p-2 rounded-xl border border-emerald-100 flex flex-col justify-between">
                        <div>
                          <p className="text-[11px] print:text-[9px] font-bold text-gray-400 flex items-center gap-1">
                            <Percent className="w-3 h-3 print:w-2.5 print:h-2.5 text-emerald-500" />
                            Total Máquinas
                          </p>
                          <p className="text-xl print:text-base font-black text-emerald-700 mt-1">
                            {clientPeriodStats.totalMachines}
                          </p>
                        </div>
                        <p className="text-[10px] print:text-[8px] text-emerald-500 font-medium mt-1">
                          máquinas concluídas
                        </p>
                      </div>
                    </div>
                    
                    <p className="text-[11px] print:text-[9px] text-gray-400 italic">
                      Referente a {clientPeriodStats.maintenanceCount} atendimentos em {clientPeriodStats.daysCount} dias ativos no período.
                    </p>
                  </div>

                  {/* Pizza/Donut Chart */}
                  {clientPieData.length > 0 && (
                    <div className="w-full sm:w-44 print:w-32 flex flex-col items-center justify-center border-t sm:border-t-0 sm:border-l print:border-t-0 print:border-l border-gray-100 pt-4 sm:pt-0 sm:pl-5 print:pt-0 print:pl-3 shrink-0">
                      <p className="text-[10px] print:text-[8px] font-bold text-gray-400 uppercase tracking-wider mb-1 text-center">
                        Endereços no Mês
                      </p>
                      <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                        <PieChart width={96} height={96}>
                          <Pie
                            data={clientPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={22}
                            outerRadius={36}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {clientPieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-[8px] text-gray-400 font-bold uppercase leading-none">Realiz.</span>
                          <span className="text-sm font-black text-emerald-600 mt-0.5 leading-none">
                            {clientPercentage}%
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-1 mt-1 text-[9px] print:text-[8px] font-semibold text-gray-500 print:mt-0">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>Feito: {clientPieData.find(d => d.name === 'Realizados')?.value || 0}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          <span>Pendente: {clientPieData.find(d => d.name === 'Pendentes')?.value || 0}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50/50 min-h-[140px] print:min-h-[100px]">
                  <p className="text-xs text-gray-400 max-w-sm">
                    Nenhum cliente selecionado. Escolha um cliente no menu acima para ver a média diária e volume de máquinas concluídas no período.
                  </p>
                </div>
              )}
            </div>

            {/* Ranking de Técnicos */}
            <div className="bg-white p-5 print:p-3.5 rounded-2xl border border-gray-150 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 print:mb-2">
                  <h4 className="text-sm print:text-xs font-bold text-gray-900 flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    Ranking de Técnicos (Top 3)
                  </h4>
                  <span className="text-[10px] print:text-[8px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {limit === 'all' ? 'No Mês' : `Últimos ${limit} Dias`}
                  </span>
                </div>

                {technicianRanking.length > 0 ? (
                  <div className="space-y-3 print:space-y-1.5">
                    {technicianRanking.map((tech, index) => {
                      const ranks = [
                        { bg: 'bg-amber-500/10 text-amber-700 border-amber-100', rank: '1º' },
                        { bg: 'bg-slate-400/10 text-slate-700 border-slate-100', rank: '2º' },
                        { bg: 'bg-amber-700/10 text-amber-900 border-amber-800/10', rank: '3º' }
                      ];
                      const activeRank = ranks[index] || { bg: 'bg-gray-100 text-gray-700 border-gray-200', rank: `${index + 1}º` };
                      
                      return (
                        <div key={tech.name} className="flex items-center justify-between p-3 print:p-2 rounded-xl border border-gray-100 hover:bg-gray-50/50 transition-colors">
                          <div className="flex items-center gap-3 print:gap-2">
                            <span className={cn("w-7 h-7 print:w-6 print:h-6 flex items-center justify-center text-xs print:text-[10px] font-black rounded-full border", activeRank.bg)}>
                              {activeRank.rank}
                            </span>
                            <div>
                              <p className="text-sm print:text-xs font-bold text-gray-800 uppercase leading-none">{tech.name}</p>
                              <p className="text-[10px] print:text-[8px] text-gray-400 font-medium mt-1 leading-none">{tech.count} serviços finalizados</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-base print:text-xs font-black text-gray-900 leading-none">{tech.totalMachines}</p>
                            <p className="text-[9px] print:text-[7px] text-gray-400 font-bold uppercase tracking-wider mt-1 leading-none">Máquinas</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 min-h-[140px] print:min-h-[100px]">
                    <p className="text-xs text-gray-400">
                      Nenhuma manutenção concluída neste período para ranquear técnicos.
                    </p>
                  </div>
                )}
              </div>
            </div>
         </div>
      )}

      {viewMode === 'client_routes' ? (
         <div className="p-6 print:p-0 space-y-6 print:space-y-4 w-full">
            {/* Seletor de Cliente */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
               <div className="flex-1">
                  <label htmlFor="client-routes-selector" className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                     Selecione um Cliente para analisar:
                  </label>
                  {!managerClientId ? (
                    <select
                       id="client-routes-selector"
                       value={selectedClientId}
                       onChange={(e) => setSelectedClientId(e.target.value)}
                       className="w-full md:max-w-md px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-xs"
                    >
                       <option value="">-- Escolha um Cliente --</option>
                       {clients.map(c => (
                         <option key={c.id} value={c.id}>{c.name}</option>
                       ))}
                    </select>
                  ) : (
                    <div className="px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700">
                      {clients.find(c => c.id === managerClientId)?.name || 'Cliente Limitado'}
                    </div>
                  )}
               </div>
               {selectedClientId && (
                  <div className="text-right shrink-0">
                     <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block leading-none">Mês de Referência</span>
                     <span className="text-sm font-extrabold text-blue-700 mt-1.5 block">
                        {format(new Date(selectedMonth + '-01T12:00:00'), 'MMMM / yyyy', { locale: ptBR })}
                     </span>
                  </div>
               )}
            </div>

            {selectedClientId ? (
               <div className="space-y-4">
                  <div className="flex items-center justify-between print:hidden">
                     <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-600" />
                        Andamento por Rota do Cliente
                     </h3>
                     <span className="text-[10px] font-black text-gray-400 uppercase">
                        CÁLCULO BASEADO EM ENDEREÇOS TOTAIS
                     </span>
                  </div>

                  {clientRoutesProgress.length > 0 ? (
                     <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm print:border-none print:shadow-none print:rounded-none">
                        <table className="w-full text-left border-collapse text-xs print:text-[10px]">
                           <thead>
                              <tr className="border-b-2 border-gray-200 text-[10px] print:text-[9px] font-black text-gray-500 uppercase bg-gray-50">
                                 <th className="py-3.5 px-4 pl-6 print:pl-2">Rota</th>
                                 <th className="py-3.5 px-4 text-center">Progresso de Endereços</th>
                                 <th className="py-3.5 px-4 text-center">Pendências de Prioridade</th>
                                 <th className="py-3.5 px-3 text-center print:hidden">Prioridades</th>
                                 <th className="py-3.5 px-6 pr-6 text-right print:pr-2">Situação</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-150">
                              {clientRoutesProgress.map((route) => {
                                 const percent = route.totalAddresses > 0 
                                    ? Math.round((route.completedAddresses / route.totalAddresses) * 100) 
                                    : 0;

                                 return (
                                    <tr key={route.routeName} className="hover:bg-gray-50/50 print:hover:bg-transparent">
                                       <td className="py-4 px-4 pl-6 print:pl-2">
                                          <span className="font-extrabold text-sm text-gray-900 block leading-tight print:text-xs">{route.routeName}</span>
                                          <span className="text-[10px] text-gray-400 font-bold uppercase mt-0.5 block leading-none print:text-[8px]">
                                             {route.totalAddresses === 1 ? '1 endereço do cliente' : `${route.totalAddresses} endereços do cliente`}
                                          </span>
                                       </td>
                                       
                                       <td className="py-4 px-4">
                                          <div className="flex flex-col items-center justify-center max-w-xs mx-auto">
                                             <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden border border-gray-200/50 print:border-gray-300">
                                                <div 
                                                   className={cn(
                                                      "h-full rounded-full animate-all duration-300",
                                                      percent === 100 ? "bg-emerald-500" : percent > 40 ? "bg-blue-500" : "bg-amber-500"
                                                   )}
                                                   style={{ width: `${percent}%` }}
                                                />
                                             </div>
                                             <div className="flex justify-between w-full text-[10px] print:text-[8px] font-bold text-gray-500 mt-1.5 leading-none px-0.5">
                                                <span>{percent}% concluído</span>
                                                <span>{route.completedAddresses} de {route.totalAddresses}</span>
                                             </div>
                                          </div>
                                       </td>

                                       <td className="py-4 px-4 text-center">
                                          {route.priorityAddressesTotal > 0 ? (
                                             <div className="inline-flex flex-col items-center justify-center">
                                                <div className="flex items-center gap-1.5 justify-center">
                                                   <span className={cn(
                                                      "w-2 h-2 rounded-full",
                                                      route.priorityAddressesPending > 0 ? "bg-red-500" : "bg-emerald-500"
                                                   )} />
                                                   <span className={cn(
                                                      "text-xs print:text-[10px] font-extrabold",
                                                      route.priorityAddressesPending > 0 ? "text-red-600" : "text-emerald-700"
                                                   )}>
                                                      {route.priorityAddressesPending} pendentes
                                                   </span>
                                                </div>
                                                <span className="text-[9px] print:text-[8px] text-gray-400 font-bold uppercase tracking-wide mt-1 leading-none">
                                                   De {route.priorityAddressesTotal} herdadas do mês anterior
                                                </span>
                                             </div>
                                          ) : (
                                             <span className="text-gray-400 text-xs print:text-[9px] italic font-medium">Nenhuma prioridade</span>
                                          )}
                                       </td>

                                       <td className="py-4 px-3 text-center print:hidden">
                                          <button
                                             type="button"
                                             onClick={() => handleOpenPriorityModal(route.routeName)}
                                             className={cn(
                                                "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all shadow-2xs border cursor-pointer active:scale-95",
                                                route.priorityAddressesTotal > 0
                                                   ? "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300/80 hover:border-amber-400 shadow-amber-500/10"
                                                   : "bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200 hover:text-gray-800"
                                             )}
                                             title={`Ver prioridades da rota "${route.routeName}" (Endereço, Técnico e Data Prevista)`}
                                          >
                                             <Eye className={cn("w-3.5 h-3.5 shrink-0", route.priorityAddressesTotal > 0 ? "text-amber-600" : "text-gray-400")} />
                                             <span>Ver</span>
                                             {route.priorityAddressesPending > 0 && (
                                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                                             )}
                                          </button>
                                       </td>

                                       <td className="py-4 px-6 pr-6 text-right print:pr-2">
                                          <span className={cn(
                                             "inline-block text-[10px] print:text-[9px] font-black px-2.5 py-0.5 rounded-md border uppercase tracking-wider leading-none",
                                             percent === 100 
                                                ? "text-emerald-700 bg-emerald-50 border-emerald-200 print:bg-transparent" 
                                                : percent > 0 
                                                ? "text-blue-700 bg-blue-50 border-blue-200 print:bg-transparent" 
                                                : "text-gray-400 bg-gray-50 border-gray-200 print:bg-transparent"
                                          )}>
                                             {percent === 100 ? 'Finalizada' : percent > 0 ? 'Em Andamento' : 'Pendente'}
                                          </span>
                                       </td>
                                    </tr>
                                 );
                              })}
                           </tbody>
                        </table>
                     </div>
                  ) : (
                     <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/20">
                        <Target className="w-8 h-8 text-gray-300 mb-1.5" />
                        <h4 className="font-extrabold text-sm text-gray-700">Nenhum endereço em rotas</h4>
                        <p className="text-xs text-gray-400 max-w-sm mt-0.5">
                           Este cliente não possui endereços definidos em rotas na competência atual.
                        </p>
                     </div>
                  )}
               </div>
            ) : (
               <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                  <Users className="w-10 h-10 text-blue-500/20 mb-2" />
                  <h4 className="font-bold text-gray-800 uppercase text-xs tracking-wider">Selecione um Cliente</h4>
                  <p className="text-xs text-gray-400 mt-1 max-w-xs">
                     Selecione o cliente desejado para gerar e visualizar o cronograma de acompanhamento individual de rotas.
                  </p>
               </div>
            )}
         </div>
      ) : (
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white border-b border-gray-100 text-[10px] font-black tracking-widest text-gray-400 uppercase">
              <th className="p-4 pl-6 print:py-1.5 print:pl-3 print:text-[8px]">Endereço / Cliente</th>
              <th className="p-4 print:py-1.5 print:px-1.5 print:text-[8px]">Rota</th>
              <th className="p-4 text-center print:py-1.5 print:px-1.5 print:text-[8px]">Máquinas</th>
              {viewMode === 'pending' ? (
                <>
                  <th className="p-4 text-center print:py-1.5 print:px-1.5 print:text-[8px]">Dias sem Mnt.</th>
                  <th className="p-4 pr-6 text-right print:py-1.5 print:pr-3 print:text-[8px]">Última Manutenção</th>
                </>
              ) : (
                <>
                  <th className="p-4 print:py-1.5 print:px-1.5 print:text-[8px]">Técnicos</th>
                  <th className="p-4 pr-6 text-right print:py-1.5 print:pr-3 print:text-[8px]">Data Conclusão</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/50">
            {viewMode === 'pending' ? (
              <>
                {filteredStats.map((stat) => (
                  <tr key={stat.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 pl-6 print:py-1 print:pl-3 max-w-[300px] print:max-w-[200px]">
                      <p className="font-bold text-gray-900 text-sm truncate print:whitespace-normal print:overflow-visible print:text-[9.5px] print:leading-tight" title={stat.street}>
                        {stat.street}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-0.5 print:whitespace-normal print:overflow-visible print:text-[8px]" title={stat.clientName}>
                        {stat.clientName}
                      </p>
                    </td>
                    <td className="p-4 print:py-1 print:px-1.5">
                      <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-md print:text-[8px] print:px-1.5 print:py-0.5">
                          {stat.route || 'Sem Rota'}
                      </span>
                    </td>
                    <td className="p-4 text-center print:py-1 print:px-1.5">
                      <span className="text-xs font-medium text-gray-500 print:text-[8.5px]">
                        {stat.totalMachines || 0}
                      </span>
                    </td>
                    <td className="p-4 text-center print:py-1 print:px-1.5">
                      <span className={cn(
                          "text-xs font-bold px-2 py-1 rounded-lg print:text-[8px] print:px-1.5 print:py-0.5",
                          stat.daysWithoutMaintenance > 60 ? "bg-red-50 text-red-700 border border-red-100" :
                          stat.daysWithoutMaintenance > 30 ? "bg-amber-50 text-amber-700 border border-amber-100" :
                          "bg-emerald-50 text-emerald-700 border border-emerald-100"
                      )}>
                          {stat.daysWithoutMaintenance === Infinity ? 'Sem Registro' : `${stat.daysWithoutMaintenance} dias`}
                      </span>
                    </td>
                    <td className="p-4 pr-6 text-right print:py-1 print:pr-3">
                      {stat.lastDate ? (
                         <div className="flex items-center justify-end gap-1.5 text-gray-600">
                            <Calendar className="w-3.5 h-3.5 print:w-2.5 print:h-2.5 text-gray-400" />
                            <span className="text-xs font-medium print:text-[8.5px]">{format(stat.lastDate, "dd/MM/yyyy")}</span>
                         </div>
                      ) : (
                         <span className="text-xs text-gray-400 italic print:text-[8.5px]">Nunca</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredStats.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500 text-sm">
                      Nenhum endereço encontrado para esta busca.
                    </td>
                  </tr>
                )}
              </>
            ) : (
              <>
                {paginatedCompletedStats.map((stat) => (
                  <tr key={stat.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 pl-6 print:py-1 print:pl-3 max-w-[300px] print:max-w-[200px]">
                      <p className="font-bold text-gray-900 text-sm truncate print:whitespace-normal print:overflow-visible print:text-[9.5px] print:leading-tight" title={stat.street}>
                        {stat.street}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-0.5 print:whitespace-normal print:overflow-visible print:text-[8px]" title={stat.clientName}>
                        {stat.clientName}
                      </p>
                    </td>
                    <td className="p-4 print:py-1 print:px-1.5">
                      <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-md print:text-[8px] print:px-1.5 print:py-0.5">
                          {stat.route || 'Sem Rota'}
                      </span>
                    </td>
                    <td className="p-4 text-center print:py-1 print:px-1.5">
                      <span className="text-xs font-medium text-gray-500 print:text-[8.5px]">
                        {stat.totalMachines || 0}
                      </span>
                    </td>
                    <td className="p-4 print:py-1 print:px-1.5">
                      <span className="text-xs text-gray-600 print:text-[8px]">
                          {stat.technicians}
                      </span>
                    </td>
                    <td className="p-4 pr-6 text-right print:py-1 print:pr-3">
                      {stat.executionDate ? (
                         <div className="flex items-center justify-end gap-1.5 text-gray-100 bg-transparent">
                            <CheckCircle className="w-3.5 h-3.5 print:w-2.5 print:h-2.5 text-emerald-500" />
                            <span className="text-xs font-medium text-emerald-700 print:text-[8.5px]">{format(new Date(stat.executionDate), "dd/MM/yyyy")}</span>
                         </div>
                      ) : (
                         <span className="text-xs text-gray-400 italic print:text-[8.5px]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {paginatedCompletedStats.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500 text-sm">
                      Nenhum endereço concluído encontrado para este mês ou busca.
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Modal de Prioridades da Região (Carregamento Sob Demanda) */}
      {priorityModal.isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setPriorityModal(prev => ({ ...prev, isOpen: false }))}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho do Modal */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between border-b border-slate-700/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-xl">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white tracking-tight leading-snug">
                    Prioridades Pendentes da Região
                  </h3>
                  <p className="text-xs text-slate-300 font-medium mt-0.5">
                    Rota: <strong className="text-amber-300 font-bold">{priorityModal.routeName}</strong> • {format(new Date(selectedMonth + '-01T12:00:00'), 'MMMM / yyyy', { locale: ptBR })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPriorityModal(prev => ({ ...prev, isOpen: false }))}
                className="p-1.5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Fechar janela"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {priorityModal.loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-3 border-amber-500 border-t-transparent" />
                  <p className="text-sm font-bold text-gray-700">Carregando prioridades pendentes...</p>
                  <p className="text-xs text-gray-400">Consultando apenas os dados desta região sob demanda</p>
                </div>
              ) : priorityModal.priorities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-6">
                  <CheckCircle className="w-9 h-9 text-emerald-500 mb-2" />
                  <h4 className="font-extrabold text-sm text-gray-800">Nenhuma prioridade pendente</h4>
                  <p className="text-xs text-gray-500 max-w-sm mt-1">
                    Não há endereços prioritários pendentes a fazer nesta rota para a competência de {format(new Date(selectedMonth + '-01T12:00:00'), 'MMMM / yyyy', { locale: ptBR })}. Todas as prioridades já foram atendidas ou não há pendências herdadas.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 px-1 font-semibold">
                    <span>
                      {priorityModal.priorities.length} {priorityModal.priorities.length === 1 ? 'endereço prioritário a fazer' : 'endereços prioritários a fazer'}
                    </span>
                    <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-bold border border-amber-200">
                      Pendentes nesta competência
                    </span>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-500 uppercase tracking-wider">
                          <th className="py-3 px-4">Endereço</th>
                          <th className="py-3 px-4">Técnico</th>
                          <th className="py-3 px-4 text-center">Data Prevista</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {priorityModal.priorities.map((item, idx) => (
                          <tr key={item.addressId || idx} className="hover:bg-amber-50/30 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-start gap-2">
                                <MapPin className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                                <div>
                                  <span className="font-extrabold text-gray-900 text-xs block leading-snug">
                                    {item.street}
                                  </span>
                                  {(item.neighborhood || item.number) && (
                                    <span className="text-[11px] text-gray-400 font-medium block mt-0.5">
                                      {[item.number ? `Nº ${item.number}` : null, item.neighborhood].filter(Boolean).join(' - ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold",
                                item.technician !== 'Não programado'
                                  ? "bg-blue-50 text-blue-800 border border-blue-200/80"
                                  : "bg-gray-100 text-gray-400 italic font-normal"
                              )}>
                                {item.technician}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-center">
                              <span className={cn(
                                "inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-bold",
                                item.plannedDate !== 'Não agendada'
                                  ? "bg-slate-100 text-slate-800 border border-slate-200/80"
                                  : "bg-gray-50 text-gray-400 italic font-normal"
                              )}>
                                {item.plannedDate}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-gray-400 font-medium">
                * Carregamento realizado sob demanda ao clicar
              </span>
              <button
                type="button"
                onClick={() => setPriorityModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
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
