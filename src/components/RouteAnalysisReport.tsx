import { useState, useEffect, useMemo } from 'react';
import { Address, MaintenanceRecord, RouteConfiguration } from '../types';
import { dataService } from '../services/dataService';
import { format, differenceInDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Filter, TrendingUp, AlertCircle, ArrowUpRight, ArrowDownRight, Clock, Map, PieChart } from 'lucide-react';

export function RouteAnalysisReport({ managerClientId }: { managerClientId?: string }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [routeConfigs, setRouteConfigs] = useState<RouteConfiguration[]>([]);
  
  // Filters
  const [selectedRoute, setSelectedRoute] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<'3M' | '6M' | '12M' | 'ALL'>('ALL');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [allRecords, addrs, configs] = await Promise.all([
      dataService.getAllRecords(),
      dataService.getAddresses(),
      dataService.getRouteConfigs()
    ]);
    
    // If manager, filter records by manager's client
    let filteredRecords = allRecords;
    if (managerClientId) {
      const allowedAddrs = new Set(addrs.filter(a => a.clientId === managerClientId).map(a => a.id));
      filteredRecords = allRecords.filter(r => allowedAddrs.has(r.addressId));
    }
    
    setRecords(filteredRecords);
    setAddresses(addrs);
    setRouteConfigs(configs);
    setLoading(false);
  };

  const processedData = useMemo(() => {
    // Group by route and month combining identical route configuration
    const groups: Record<string, {
      routeName: string;
      month: string;
      recordCount: number;
      plannedDate?: string;
      returnDate?: string;
      estimatedCost: number;
      actualCost: number;
      servicesValue: number;
      daysWorked: number;
    }> = {};

    records.forEach(r => {
      let routeName = 'Sem Rota';
      
      if (r.isTemporaryRoute) {
        routeName = r.temporaryRouteName || 'Rota Temporária';
      } else {
        const addr = addresses.find(a => a.id === r.addressId);
        if (addr && addr.route) {
          routeName = addr.route;
        }
      }
      
      const key = `${routeName}-${r.month}`;
      
      if (!groups[key]) {
        let days = 0;
        if (r.plannedDate && r.returnDate) {
          const start = parseISO(r.plannedDate);
          const end = parseISO(r.returnDate);
          days = differenceInDays(end, start) + 1; // +1 to include both days
          if (days < 0) days = 0;
        }
        
        groups[key] = {
          routeName,
          month: r.month,
          recordCount: 1,
          plannedDate: r.plannedDate,
          returnDate: r.returnDate,
          estimatedCost: r.routeEstimatedCost || 0,
          actualCost: r.routeActualCost || 0,
          servicesValue: r.routeServicesValue || 0,
          daysWorked: days
        };
      } else {
        // Just increment record count for the same route/month
        groups[key].recordCount++;
      }
    });

    let result = Object.values(groups).sort((a, b) => b.month.localeCompare(a.month));
    
    if (selectedRoute !== 'ALL') {
      result = result.filter(r => r.routeName === selectedRoute);
    }
    
    if (dateRange !== 'ALL') {
       const months = parseInt(dateRange.replace('M', ''), 10);
       const cutoffDate = new Date();
       cutoffDate.setMonth(cutoffDate.getMonth() - months);
       const cutoffString = format(cutoffDate, 'yyyy-MM');
       result = result.filter(r => r.month >= cutoffString);
    }

    return result;
  }, [records, addresses, selectedRoute, dateRange]);

  const allRouteNames = useMemo(() => {
    const names = new Set<string>();
    addresses.forEach(a => a.route && names.add(a.route));
    records.forEach(r => r.isTemporaryRoute && r.temporaryRouteName && names.add(r.temporaryRouteName));
    return Array.from(names).sort();
  }, [addresses, records]);

  const summary = useMemo(() => {
    let totalEstimated = 0;
    let totalActual = 0;
    let totalServices = 0;
    let totalDays = 0;
    let trips = 0;
    
    processedData.forEach(d => {
      // Only count financials once per route-month (trip)
      totalEstimated += d.estimatedCost;
      totalActual += d.actualCost;
      totalServices += d.servicesValue;
      totalDays += d.daysWorked;
      trips++;
    });
    
    return { totalEstimated, totalActual, totalServices, totalDays, trips };
  }, [processedData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 bg-white rounded-2xl shadow-sm border border-gray-200">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50/30">
      <div className="p-4 bg-white border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Análise e Custos de Rotas</h2>
            <p className="text-xs text-gray-500 font-medium">Compare os custos e valores gerados por rota ao longo do tempo</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg overflow-hidden shrink-0">
            {(['3M', '6M', '12M', 'ALL']).map(range => (
              <button
                key={range}
                onClick={() => setDateRange(range as any)}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${dateRange === range ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                {range === 'ALL' ? 'Todos' : range}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-auto">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
              className="w-full sm:w-[200px] pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">Todas as Rotas</option>
              {allRouteNames.map(route => (
                <option key={route} value={route}>{route}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 shrink-0">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Total de Viagens (Filtro)</p>
          <div className="flex items-end gap-2">
            <h3 className="text-2xl font-black text-gray-900">{summary.trips}</h3>
            <span className="text-xs font-bold text-gray-500 pb-1">viagens</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Custo Previsto (Total)</p>
          <h3 className="text-xl font-black text-blue-600">
            {summary.totalEstimated.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </h3>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Custo Real (Total)</p>
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-red-600">
              {summary.totalActual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </h3>
            {summary.totalActual > summary.totalEstimated && summary.totalEstimated > 0 && (
               <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                 <ArrowDownRight className="w-3 h-3" /> Acima da prev.
               </span>
            )}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Valores Gerados (O.S)</p>
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-emerald-600">
              {summary.totalServices.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </h3>
            <span className="p-1 rounded-full bg-emerald-50 text-emerald-600">
               <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto bg-white border-t border-gray-100">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50/50 sticky top-0 shadow-sm z-10">
            <tr className="border-b border-gray-100 text-[10px] font-black tracking-widest text-gray-400 uppercase">
               <th className="px-6 py-4">Mês</th>
               <th className="px-6 py-4">Rota</th>
               <th className="px-6 py-4">Período Viajado</th>
               <th className="px-4 py-4 text-center">Dias Totais</th>
               <th className="px-4 py-4 text-right">Custo Previsto</th>
               <th className="px-4 py-4 text-right">Custo Real</th>
               <th className="px-4 py-4 text-right">Valores Gerados (O.S)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {processedData.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center p-8 text-gray-500 font-medium">
                  Nenhum dado encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : processedData.map((d, index) => {
               const start = d.plannedDate ? format(parseISO(d.plannedDate), 'dd/MM/yy', { locale: ptBR }) : '-';
               const end = d.returnDate ? format(parseISO(d.returnDate), 'dd/MM/yy', { locale: ptBR }) : '-';
               const monthParts = d.month.split('-');
               const displayMonth = `${monthParts[1]}/${monthParts[0]}`;
               
               const overBudget = d.actualCost > d.estimatedCost;

               return (
                <tr key={`${d.routeName}-${d.month}-${index}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                     <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-gray-100 text-xs font-bold text-gray-700">
                        {displayMonth}
                     </span>
                  </td>
                  <td className="px-6 py-4 font-bold text-gray-900 text-sm">{d.routeName}</td>
                  <td className="px-6 py-4">
                     {d.plannedDate ? (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                           <Calendar className="w-3.5 h-3.5 text-gray-400" />
                           {start} até {end}
                        </div>
                     ) : (
                        <span className="text-xs text-gray-300 font-medium italic">Não definido</span>
                     )}
                  </td>
                  <td className="px-4 py-4 text-center">
                     {d.daysWorked > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold">
                           <Clock className="w-3 h-3" /> {d.daysWorked} {d.daysWorked === 1 ? 'dia' : 'dias'}
                        </span>
                     ) : '-'}
                  </td>
                  <td className="px-4 py-4 text-right font-medium text-blue-600 text-sm">
                     {d.estimatedCost > 0 ? d.estimatedCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}
                  </td>
                  <td className="px-4 py-4 text-right text-sm">
                     {d.actualCost > 0 ? (
                        <span className={`font-bold flex items-center justify-end gap-1.5 ${overBudget ? 'text-red-600' : 'text-gray-900'}`}>
                           {overBudget && <AlertCircle className="w-3.5 h-3.5" />}
                           {d.actualCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                     ) : '-'}
                  </td>
                  <td className="px-4 py-4 text-right font-black text-emerald-600 text-sm">
                     {d.servicesValue > 0 ? d.servicesValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
