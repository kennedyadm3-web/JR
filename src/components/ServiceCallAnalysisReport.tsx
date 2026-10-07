import { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';
import { 
  AlertCircle, CheckCircle, Clock, Printer, Filter, TrendingUp,
  Activity, Wrench, Search, ChevronRight
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { ServiceCall, Client, Address, ServiceCallStatus } from '../types';
import { format, differenceInDays, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';

interface Props {
  managerClientId?: string;
}

export function ServiceCallAnalysisReport({ managerClientId }: Props) {
  const [calls, setCalls] = useState<ServiceCall[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'charts'>('table');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [c, a, cl] = await Promise.all([
      dataService.getServiceCalls(),
      dataService.getAddresses(),
      dataService.getClients()
    ]);
    
    setCalls(c.filter(call => !managerClientId || call.clientId === managerClientId));
    setAddresses(a.filter(addr => !managerClientId || addr.clientId === managerClientId));
    setClients(cl.filter(client => !managerClientId || client.id === managerClientId));
    setLoading(false);
  };

  const getCallDate = (dateVal: any) => {
    if (!dateVal) return new Date();
    if (dateVal.toDate) return dateVal.toDate();
    if (typeof dateVal === 'string') return parseISO(dateVal);
    if (dateVal.seconds) return new Date(dateVal.seconds * 1000);
    return new Date(dateVal);
  };

  // Dashboard general metrics (period & client filter)
  const dashboardData = useMemo(() => {
    let filteredCalls = calls;

    if (selectedClientId) {
      filteredCalls = filteredCalls.filter(c => c.clientId === selectedClientId);
    }

    if (startDate) {
      const start = new Date(startDate + 'T00:00:00');
      filteredCalls = filteredCalls.filter(c => getCallDate(c.createdAt) >= start);
    }
    
    if (endDate) {
      const end = new Date(endDate + 'T23:59:59');
      filteredCalls = filteredCalls.filter(c => getCallDate(c.createdAt) <= end);
    }

    const totalCalls = filteredCalls.length;
    const resolvedCalls = filteredCalls.filter(c => c.status === ServiceCallStatus.RESOLVED);
    const openCalls = filteredCalls.filter(c => c.status === ServiceCallStatus.OPEN);
    const inProgressCalls = filteredCalls.filter(c => c.status === ServiceCallStatus.IN_PROGRESS);

    // Resolution rate
    const resolutionRate = totalCalls > 0 ? (resolvedCalls.length / totalCalls) * 100 : 0;

    // Average days to resolve
    let totalDaysToResolve = 0;
    
    resolvedCalls.forEach(c => {
      if (c.resolvedAt && c.createdAt) {
        const createdDate = getCallDate(c.createdAt);
        const resolvedDate = getCallDate(c.resolvedAt);
        const diff = differenceInDays(resolvedDate, createdDate);
        totalDaysToResolve += (diff > 0 ? diff : 0);
      }
    });

    const averageDays = resolvedCalls.length > 0 ? totalDaysToResolve / resolvedCalls.length : 0;

    // Group by Client
    const clientStats: Record<string, { total: number, resolved: number }> = {};
    filteredCalls.forEach(call => {
      const clientName = clients.find(cl => cl.id === call.clientId)?.name || 'Desconhecido';
      if (!clientStats[clientName]) clientStats[clientName] = { total: 0, resolved: 0 };
      clientStats[clientName].total++;
      if (call.status === ServiceCallStatus.RESOLVED) {
        clientStats[clientName].resolved++;
      }
    });
    
    const clientChartData = Object.entries(clientStats)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10); // Top 10

    // Group by Address if one client is selected
    const addressStats: Record<string, { total: number, resolved: number }> = {};
    if (selectedClientId) {
      filteredCalls.forEach(call => {
        const addr = addresses.find(a => a.id === call.addressId);
        const addrName = addr?.name || addr?.street || 'Desconhecido';
        if (!addressStats[addrName]) addressStats[addrName] = { total: 0, resolved: 0 };
        addressStats[addrName].total++;
        if (call.status === ServiceCallStatus.RESOLVED) {
          addressStats[addrName].resolved++;
        }
      });
    }
    
    const addressChartData = Object.entries(addressStats)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
      
    // Calls by Month in the period
    const monthStats: Record<string, number> = {};
    filteredCalls.forEach(call => {
      const d = getCallDate(call.createdAt);
      const mLabel = format(d, 'MMM yyyy', { locale: ptBR });
      if (!monthStats[mLabel]) monthStats[mLabel] = 0;
      monthStats[mLabel]++;
    });
    const monthsChartData = Object.entries(monthStats).map(([name, count]) => ({ name, count }));

    return { 
      totalCalls, 
      resolvedCount: resolvedCalls.length,
      openCount: openCalls.length,
      inProgressCount: inProgressCalls.length,
      resolutionRate: Math.round(resolutionRate),
      averageDays: averageDays.toFixed(1),
      clientChartData,
      addressChartData,
      monthsChartData
    };
  }, [calls, selectedClientId, startDate, endDate, clients, addresses]);

  // Calls list specifically filtered for the table view and status buttons
  const filteredCallsList = useMemo(() => {
    let list = calls;

    if (selectedClientId) {
      list = list.filter(c => c.clientId === selectedClientId);
    }

    if (startDate) {
      const start = new Date(startDate + 'T00:00:00');
      list = list.filter(c => {
        const created = getCallDate(c.createdAt);
        const resolved = c.resolvedAt ? getCallDate(c.resolvedAt) : null;
        if (statusFilter === 'resolved') {
          return (resolved && resolved >= start) || (created >= start);
        }
        return created >= start;
      });
    }

    if (endDate) {
      const end = new Date(endDate + 'T23:59:59');
      list = list.filter(c => {
        const created = getCallDate(c.createdAt);
        const resolved = c.resolvedAt ? getCallDate(c.resolvedAt) : null;
        if (statusFilter === 'resolved') {
          return (resolved && resolved <= end) || (created <= end);
        }
        return created <= end;
      });
    }

    // Filter by status button
    if (statusFilter === 'open') {
      list = list.filter(c => c.status === ServiceCallStatus.OPEN || c.status === ServiceCallStatus.IN_PROGRESS);
    } else if (statusFilter === 'resolved') {
      list = list.filter(c => c.status === ServiceCallStatus.RESOLVED);
    }

    // Search query filter
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase().trim();
      list = list.filter(c => {
        const clientName = clients.find(cl => cl.id === c.clientId)?.name?.toLowerCase() || '';
        const addr = addresses.find(a => a.id === c.addressId);
        const addrStreet = addr?.street?.toLowerCase() || '';
        const addrNeighborhood = addr?.neighborhood?.toLowerCase() || '';
        const desc = c.description?.toLowerCase() || '';
        const resolution = c.resolutionNotes?.toLowerCase() || '';
        const tech = c.resolvedBy?.toLowerCase() || '';

        return clientName.includes(query) ||
               addrStreet.includes(query) ||
               addrNeighborhood.includes(query) ||
               desc.includes(query) ||
               resolution.includes(query) ||
               tech.includes(query);
      });
    }

    // Sort by most recent date descending
    return list.sort((a, b) => {
      const dateA = getCallDate(a.resolvedAt || a.createdAt).getTime();
      const dateB = getCallDate(b.resolvedAt || b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [calls, selectedClientId, startDate, endDate, statusFilter, searchTerm, clients, addresses]);

  if (loading) {
    return <div className="py-20 text-center text-gray-500 font-bold">Carregando análise...</div>;
  }

  const { totalCalls, resolvedCount, openCount, inProgressCount, resolutionRate, averageDays, clientChartData, addressChartData, monthsChartData } = dashboardData;

  const pieData = [
    { name: 'Resolvidos', value: resolvedCount, color: '#10b981' },
    { name: 'Em Andamento', value: inProgressCount, color: '#3b82f6' },
    { name: 'Em Aberto', value: openCount, color: '#ef4444' },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm print:shadow-none print:border-none print:p-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 print:mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Activity className="w-6 h-6 text-purple-600" />
              Análise de Chamados e Reparos
            </h2>
            <p className="text-sm text-gray-500 mt-1">Visão gerencial de demandas técnicas e performance de atendimento</p>
          </div>
          
          <button 
            type="button"
            onClick={() => { 
                window.focus(); 
                setTimeout(() => window.print(), 200); 
            }}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl flex items-center gap-2 transition-colors print:hidden cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4" />
            Imprimir Relatório
          </button>
        </div>

        {/* Filter Toolbar with Client, Dates & Status Filter Buttons */}
        <div className="flex flex-col xl:flex-row flex-wrap gap-3 items-stretch xl:items-center bg-gray-50 p-4 rounded-xl border border-gray-100 print:hidden">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-500 shrink-0">
            <Filter className="w-4 h-4" />
            Filtros:
          </div>

          {/* Client Filter */}
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="px-3.5 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/20 text-sm font-medium bg-white w-full sm:w-auto"
          >
            <option value="">Todos os Clientes</option>
            {clients.slice().sort((a,b) => a.name.localeCompare(b.name)).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Date Range Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/20 text-sm font-medium bg-white w-full"
            />
            <span className="text-gray-400 font-medium text-xs">até</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/20 text-sm font-medium bg-white w-full"
            />
          </div>

          {/* Quick Status Buttons (Todos / Em Aberto / Resolvidos) */}
          <div className="flex items-center gap-1 p-1 bg-gray-200/70 rounded-xl w-full sm:w-auto border border-gray-200/80">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={cn(
                "flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none",
                statusFilter === 'all'
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              <span>Todos</span>
              <span className={cn(
                "px-1.5 py-0.2 rounded-full text-[10px]",
                statusFilter === 'all' ? "bg-slate-800 text-white" : "bg-gray-300/80 text-gray-700"
              )}>
                {totalCalls}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('open')}
              className={cn(
                "flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none",
                statusFilter === 'open'
                  ? "bg-red-600 text-white shadow-xs shadow-red-500/20"
                  : "text-gray-600 hover:text-red-700"
              )}
            >
              <span>Em Aberto</span>
              <span className={cn(
                "px-1.5 py-0.2 rounded-full text-[10px]",
                statusFilter === 'open' ? "bg-red-700 text-white" : "bg-red-100 text-red-700"
              )}>
                {openCount + inProgressCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('resolved')}
              className={cn(
                "flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none",
                statusFilter === 'resolved'
                  ? "bg-emerald-600 text-white shadow-xs shadow-emerald-600/20"
                  : "text-gray-600 hover:text-emerald-700"
              )}
            >
              <span>Resolvidos</span>
              <span className={cn(
                "px-1.5 py-0.2 rounded-full text-[10px]",
                statusFilter === 'resolved' ? "bg-emerald-700 text-white" : "bg-emerald-100 text-emerald-800"
              )}>
                {resolvedCount}
              </span>
            </button>
          </div>
        </div>
        
        {/* Printable Filter context */}
        <div className="hidden print:block mb-6 pb-4 border-b border-gray-200">
           <p className="text-gray-600 font-medium text-xs">
             Período: <span className="font-bold text-gray-900">{format(parseISO(startDate), 'dd/MM/yyyy')} a {format(parseISO(endDate), 'dd/MM/yyyy')}</span> 
             &nbsp;| Cliente: <span className="font-bold text-gray-900">{selectedClientId ? clients.find(c => c.id === selectedClientId)?.name : 'Todos os Clientes'}</span>
             &nbsp;| Filtro: <span className="font-bold text-gray-900">{statusFilter === 'resolved' ? 'Apenas Resolvidos' : statusFilter === 'open' ? 'Apenas Em Aberto' : 'Todos os Chamados'}</span>
           </p>
        </div>
      </div>

      {/* Primary Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Total de Chamados" 
          value={totalCalls} 
          icon={<AlertCircle className="w-6 h-6 text-purple-600" />} 
          color="bg-purple-100/50"
        />
        <StatCard 
          label="Taxa de Resolução" 
          value={`${resolutionRate}%`} 
          icon={<TrendingUp className="w-6 h-6 text-emerald-600" />} 
          color="bg-emerald-100/50"
        />
        <StatCard 
          label="Média de Dias p/ Atendimento" 
          value={averageDays} 
          icon={<Clock className="w-6 h-6 text-blue-600" />} 
          color="bg-blue-100/50"
        />
        <StatCard 
          label="Pendentes / Em Aberto" 
          value={openCount + inProgressCount} 
          icon={<Wrench className="w-6 h-6 text-amber-600" />} 
          color="bg-amber-100/50"
        />
      </div>

      {/* Tabela Simplificada de Chamados no Período */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden print:border-none print:shadow-none">
        {/* Cabeçalho da Tabela */}
        <div className="p-4 sm:p-5 border-b border-gray-150 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white print:p-2">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2.5 rounded-xl border shrink-0",
              statusFilter === 'resolved' 
                ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                : statusFilter === 'open' 
                ? "bg-red-50 text-red-600 border-red-200" 
                : "bg-purple-50 text-purple-600 border-purple-200"
            )}>
              {statusFilter === 'resolved' ? (
                <CheckCircle className="w-5 h-5" />
              ) : statusFilter === 'open' ? (
                <AlertCircle className="w-5 h-5" />
              ) : (
                <Wrench className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 flex items-center gap-2">
                {statusFilter === 'resolved' 
                  ? 'Chamados Resolvidos no Período' 
                  : statusFilter === 'open' 
                  ? 'Chamados Em Aberto / Pendentes' 
                  : 'Lista de Chamados no Período'}
                <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                  {filteredCallsList.length}
                </span>
              </h3>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                {statusFilter === 'resolved' 
                  ? 'Exibindo todos os chamados técnicos finalizados e resolvidos no intervalo selecionado'
                  : statusFilter === 'open'
                  ? 'Exibindo chamados que ainda aguardam atendimento ou estão em andamento'
                  : 'Visão consolidada de todas as demandas técnicas abertas ou atendidas'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 print:hidden">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar cliente, rua, defeito..."
                className="w-full pl-9 pr-7 py-2 border border-gray-200 rounded-xl text-xs font-medium bg-gray-50/60 focus:bg-white outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300 transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Alternador de visualização Tabela / Gráficos */}
            <div className="flex items-center p-1 bg-gray-100 rounded-xl border border-gray-200/70 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  viewMode === 'table' ? "bg-white text-gray-900 shadow-2xs font-extrabold" : "text-gray-500 hover:text-gray-800"
                )}
                title="Exibir em formato de tabela"
              >
                Tabela
              </button>
              <button
                type="button"
                onClick={() => setViewMode('charts')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  viewMode === 'charts' ? "bg-white text-gray-900 shadow-2xs font-extrabold" : "text-gray-500 hover:text-gray-800"
                )}
                title="Exibir gráficos analíticos"
              >
                Gráficos
              </button>
            </div>
          </div>
        </div>

        {/* View Mode: Table */}
        {viewMode === 'table' ? (
          <div className="overflow-x-auto">
            {filteredCallsList.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <CheckCircle className="w-10 h-10 text-gray-300 mb-2" />
                <p className="text-sm font-bold text-gray-700">Nenhum chamado encontrado</p>
                <p className="text-xs text-gray-400 mt-1 max-w-sm">
                  Não há chamados com os filtros aplicados (Cliente, Período e Status) ou termo de busca.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs print:text-[10px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[10px] print:text-[8px] font-black text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-4 pl-6 print:pl-2">Data / Abertura</th>
                    <th className="py-3 px-4">Cliente & Local</th>
                    <th className="py-3 px-4">Descrição da Demanda</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 pr-6 print:pr-2">Resolução / Técnico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCallsList.map((call) => {
                    const client = clients.find(c => c.id === call.clientId);
                    const addr = addresses.find(a => a.id === call.addressId);
                    const createdDate = getCallDate(call.createdAt);
                    const resolvedDate = call.resolvedAt ? getCallDate(call.resolvedAt) : null;
                    const isResolved = call.status === ServiceCallStatus.RESOLVED;

                    return (
                      <tr key={call.id} className="hover:bg-gray-50/60 transition-colors">
                        {/* Data / Abertura */}
                        <td className="py-3.5 px-4 pl-6 print:pl-2 align-top whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-extrabold text-gray-900 text-xs print:text-[10px]">
                              {format(createdDate, 'dd/MM/yyyy')}
                            </span>
                            <span className="text-[10px] text-gray-400 font-medium">
                              {format(createdDate, 'HH:mm')}
                            </span>
                          </div>
                        </td>

                        {/* Cliente & Local */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="font-extrabold text-gray-900 text-xs print:text-[10px] leading-tight">
                            {client?.name || call.clientName || 'Cliente'}
                          </div>
                          <div className="text-[11px] print:text-[8.5px] text-gray-500 font-medium mt-0.5 leading-snug">
                            {addr?.street ? (
                              <span>
                                {addr.street}{addr.number ? `, ${addr.number}` : ''}{addr.neighborhood ? ` - ${addr.neighborhood}` : ''}
                              </span>
                            ) : (
                              <span>{call.addressLabel || 'Endereço não informado'}</span>
                            )}
                          </div>
                        </td>

                        {/* Descrição da Demanda */}
                        <td className="py-3.5 px-4 align-top max-w-xs sm:max-w-sm">
                          <p className="text-gray-800 font-medium text-xs print:text-[9.5px] leading-relaxed line-clamp-3" title={call.description}>
                            {call.description || 'Sem descrição informada'}
                          </p>
                          {call.priority && (
                            <span className={cn(
                              "inline-block text-[9px] font-bold px-1.5 py-0.2 rounded mt-1.5 uppercase",
                              call.priority === 'high' ? "bg-red-50 text-red-700 border border-red-200" :
                              call.priority === 'medium' ? "bg-amber-50 text-amber-700 border border-amber-200" :
                              "bg-gray-100 text-gray-600"
                            )}>
                              Prioridade: {call.priority === 'high' ? 'Alta' : call.priority === 'medium' ? 'Média' : 'Baixa'}
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 align-top text-center whitespace-nowrap">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] print:text-[8.5px] font-extrabold uppercase tracking-wide",
                            isResolved
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : call.status === ServiceCallStatus.IN_PROGRESS
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                          )}>
                            {isResolved ? (
                              <>
                                <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                                Resolvido
                              </>
                            ) : call.status === ServiceCallStatus.IN_PROGRESS ? (
                              <>
                                <Clock className="w-3 h-3 text-blue-600 shrink-0" />
                                Em Andamento
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
                                Em Aberto
                              </>
                            )}
                          </span>
                        </td>

                        {/* Resolução / Técnico */}
                        <td className="py-3.5 px-4 pr-6 print:pr-2 align-top">
                          {isResolved ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs print:text-[9.5px]">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                <span>
                                  {resolvedDate ? `Resolvido em ${format(resolvedDate, 'dd/MM/yyyy')}` : 'Resolvido'}
                                </span>
                              </div>
                              {call.resolvedBy && (
                                <div className="text-[11px] print:text-[8.5px] text-gray-600 font-medium">
                                  Técnico: <strong className="text-gray-800 font-bold">{call.resolvedBy}</strong>
                                </div>
                              )}
                              {call.resolutionNotes && (
                                <p className="text-[11px] print:text-[8.5px] text-gray-600 italic bg-gray-50 p-1.5 rounded-lg border border-gray-150 mt-1 max-w-xs">
                                  "{call.resolutionNotes}"
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1 text-gray-500">
                              {call.forecastDate ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  Prev.: {call.forecastDate}
                                </span>
                              ) : (
                                <span className="text-xs italic text-gray-400">Aguardando atendimento</span>
                              )}
                              {call.resolvedBy && (
                                <div className="text-[11px] text-gray-600">
                                  Designado: <strong>{call.resolvedBy}</strong>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          /* View Mode: Charts */
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Status Breakdown PieChart */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm print:break-inside-avoid">
                <h3 className="font-bold text-gray-800 mb-6">Status dos Chamados</h3>
                {totalCalls > 0 ? (
                  <>
                    <div className="h-48 lg:h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData.filter(d => d.value > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center flex-wrap gap-4 mt-4">
                      {pieData.map(item => (
                        <div key={item.name} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-xs font-semibold text-gray-600">{item.name} ({item.value})</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-48 lg:h-64 text-gray-400 italic">Nenhum dado no período</div>
                )}
              </div>

              {/* Dynamic Bar Chart (By Client or By Address) */}
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm print:break-inside-avoid">
                <h3 className="font-bold text-gray-800 mb-6">
                  {selectedClientId ? 'Top 10 Endereços com Mais Chamados' : 'Top 10 Clientes com Mais Chamados'}
                </h3>
                <div className="h-64 lg:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedClientId ? addressChartData : clientChartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#E5E7EB" />
                      <XAxis type="number" stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis dataKey="name" type="category" stroke="#9CA3AF" fontSize={10} width={120} tickLine={false} axisLine={false} />
                      <Tooltip 
                        cursor={{ fill: '#F9FAFB' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="total" name="Total Abertos" fill="#9333EA" radius={[0, 4, 4, 0]} barSize={20} />
                      <Bar dataKey="resolved" name="Resolvidos" fill="#10B981" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            
            {/* Monthly Trend */}
            {!selectedClientId && monthsChartData.length > 0 && (
               <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm print:break-inside-avoid">
                 <h3 className="font-bold text-gray-800 mb-6">Evolução Mensal de Chamados</h3>
                 <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthsChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="name" stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip 
                          cursor={{ fill: '#F9FAFB' }}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="count" name="Chamados" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                 </div>
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string, value: string | number, icon: any, color: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
      <div className="flex items-center gap-4 mb-4">
        <div className={cn("p-3 rounded-xl", color)}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-black text-gray-900">{value}</p>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1 min-h-[32px]">{label}</p>
    </div>
  );
}
