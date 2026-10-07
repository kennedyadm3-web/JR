import { useMemo, useState } from 'react';
import { 
  Calendar, 
  MapPin, 
  AlertCircle, 
  Search, 
  TrendingUp,
  Info
} from 'lucide-react';
import { MaintenanceRecord, Address, Client, Technician, MaintenanceStatus, isOSRecord } from '../types';
import { cn } from '../lib/utils';

interface Props {
  records: MaintenanceRecord[];
  addresses: Address[];
  clients: Client[];
  technicians: Technician[];
  isReadOnly: boolean;
  onUpdateRecord: (record: MaintenanceRecord, updates: Partial<MaintenanceRecord>) => Promise<void>;
  savingId: string | null;
  priorityAddressIds: Set<string>;
  onOpenHistory: (addressId: string, addressName: string) => void;
}

export function WeeklyPlanner({
  records,
  addresses,
  clients,
  technicians,
  isReadOnly,
  onUpdateRecord,
  savingId,
  priorityAddressIds,
  onOpenHistory
}: Props) {
  const [localSearch, setLocalSearch] = useState('');

  // Enrich records with client and address details (garantindo que cada endereço é único)
  const enrichedRecords = useMemo(() => {
    type EnrichedRecord = MaintenanceRecord & { address?: Address; client?: Client };
    const uniqueMap = new Map<string, EnrichedRecord>();

    records.forEach(r => {
      if (isOSRecord(r)) return; // Cronograma representa somente manutenções preventivas
      const address = addresses.find(a => a.id === r.addressId);
      const client = clients.find(c => c.id === address?.clientId);
      if (!r.isTemporaryRoute && (!address || address.status === 'inactive' || address.active === false || address.isInactive === true)) {
        return;
      }
      const isDummyTemp = r.isTemporaryRoute && (!r.addressId || String(r.addressId).startsWith('TEMP_ADDR_'));
      const key = isDummyTemp 
        ? `temp_${(r.temporaryRouteName || '').trim()}_${(r.temporaryStreet || r.temporaryClient || r.id).trim()}`
        : r.addressId;

      if (!uniqueMap.has(key)) {
        const item: EnrichedRecord = { ...r, address, client };
        item.plannedDates = undefined;
        uniqueMap.set(key, item);
      } else {
        const existing = uniqueMap.get(key)!;
        if (r.status === MaintenanceStatus.COMPLETED) existing.status = r.status;
        if (r.plannedDate) existing.plannedDate = r.plannedDate;
        existing.plannedDates = undefined;
        if (r.technician1) existing.technician1 = r.technician1;
        if (r.technician2) existing.technician2 = r.technician2;
      }
    });

    // REGRA MANDATÓRIA: 100% dos endereços devem aparecer no cronograma semanal
    const targetMonth = records[0]?.month || '';
    addresses.forEach(addr => {
      if (!addr) return;
      if (addr.status === 'inactive' || addr.active === false || addr.isInactive === true) {
        return;
      }
      if (!uniqueMap.has(addr.id)) {
        const client = clients.find(c => c.id === addr.clientId);
        uniqueMap.set(addr.id, {
          id: `virtual_${targetMonth || 'm'}_${addr.id}`,
          month: targetMonth,
          addressId: addr.id,
          scheduledWeek: 1,
          status: MaintenanceStatus.PENDING,
          plannedDates: [],
          notes: addr.notes || '',
          routeNotes: '',
          technician1: '',
          technician2: '',
          address: addr,
          client: client
        } as any);
      }
    });

    return Array.from(uniqueMap.values()).filter(r => {
      const term = localSearch.toLowerCase();
      if (!term) return true;
      return (
        r.client?.name?.toLowerCase().includes(term) ||
        r.address?.street?.toLowerCase().includes(term) ||
        r.address?.route?.toLowerCase().includes(term) ||
        r.technician1?.toLowerCase().includes(term) ||
        r.technician2?.toLowerCase().includes(term)
      );
    }).sort((a, b) => {
      // Sort by route first, then client name
      const routeA = a.address?.route || '';
      const routeB = b.address?.route || '';
      const routeComp = routeA.localeCompare(routeB, 'pt-BR');
      if (routeComp !== 0) return routeComp;

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
  }, [records, addresses, clients, localSearch]);

  // Group enriched records by Route name (same logic as groupedRecords in ScheduleView)
  const groupedByRoute = useMemo(() => {
    const groups: Record<string, typeof enrichedRecords> = {};
    enrichedRecords.forEach(r => {
      const routeName = r.address?.route || 'Sem Rota';
      if (!groups[routeName]) {
        groups[routeName] = [];
      }
      groups[routeName].push(r);
    });

    // Sort the routes alphabetically
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [enrichedRecords]);

  // Calculate weekly workload for each technician (based on all scheduled records for this month)
  const technicianWeeklyStats = useMemo(() => {
    const stats: Record<string, Record<number, number>> = {};

    // Initialize for all active technicians
    technicians.forEach(t => {
      stats[t.name] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    });

    // Compute from records
    records.forEach(rec => {
      // If no valid address machines count, look up from master addresses list to be extra safe
      const addressObj = addresses.find(a => a.id === rec.addressId);
      const machineCount = addressObj?.totalMachines || 0;
      
      const week = rec.scheduledWeek || 1;

      const assignedTechs = [rec.technician1, rec.technician2].filter(Boolean) as string[];
      assignedTechs.forEach(techName => {
        if (!stats[techName]) {
          stats[techName] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        }
        if (stats[techName][week] !== undefined) {
          stats[techName][week] += machineCount;
        } else {
          stats[techName][week] = machineCount;
        }
      });
    });

    return stats;
  }, [records, technicians, addresses]);

  // Calculate totals for each week across all technicians
  const weeklyGrandTotals = useMemo(() => {
    const totals: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    Object.values(technicianWeeklyStats).forEach(techWeeks => {
      for (let w = 1; w <= 5; w++) {
        totals[w] += techWeeks[w] || 0;
      }
    });
    return totals;
  }, [technicianWeeklyStats]);

  // Calculate grand totals per technician
  const technicianGrandTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(technicianWeeklyStats).forEach(([techName, techWeeks]) => {
      totals[techName] = (techWeeks[1] || 0) + (techWeeks[2] || 0) + (techWeeks[3] || 0) + (techWeeks[4] || 0) + (techWeeks[5] || 0);
    });
    return totals;
  }, [technicianWeeklyStats]);

  // List of addresses with missing technician
  const addressesMissingTechCount = useMemo(() => {
    return records.filter(r => !r.technician1 && !r.technician2).length;
  }, [records]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* LEFT COLUMN - Simplified Address Planner grouped by Route */}
      <div className="xl:col-span-8 flex flex-col gap-6">
        {/* Header and Search controls card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Distribuição de Demandas por Semana
            </h3>
            <p className="text-xs text-gray-500 mt-1 font-medium">
              Defina a semana e os técnicos responsáveis. Os totais de carga ao lado serão atualizados em tempo real.
            </p>
          </div>
          
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text"
              placeholder="Filtrar por cliente, rua ou técnico..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-xs font-medium transition-all"
            />
          </div>
        </div>

        {/* List of Routes */}
        {groupedByRoute.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm py-16 px-4 text-center text-gray-400 italic text-sm">
            Nenhum endereço correspondente aos filtros.
          </div>
        ) : (
          groupedByRoute.map(([routeName, routeRecords]) => (
            <div key={routeName} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              {/* Route Header */}
              <div className="bg-gray-50/70 px-6 py-3.5 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wider">
                    Rota: {routeName}
                  </h4>
                </div>
                <span className="text-[10px] font-extrabold text-gray-500 bg-white border border-gray-150 px-2.5 py-1 rounded-lg shadow-sm uppercase tracking-wide">
                  {routeRecords.length} {routeRecords.length === 1 ? 'endereço' : 'endereços'}
                </span>
              </div>

              {/* Route Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white text-gray-400 text-[10px] font-black uppercase tracking-widest border-b border-gray-100/80">
                      <th className="px-6 py-3.5 font-semibold min-w-[240px]">Cliente / Endereço</th>
                      <th className="px-4 py-3.5 text-center w-28">Máquinas</th>
                      <th className="px-4 py-3.5 min-w-[200px]">Técnicos</th>
                      <th className="px-6 py-3.5 text-center w-36">Semana</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {routeRecords.map(record => {
                      const machineCount = record.address?.totalMachines || 0;
                      const isSaving = savingId === record.id;
                      const isCompleted = record.status === MaintenanceStatus.COMPLETED;
                      
                      return (
                        <tr 
                          key={record.id} 
                          className={cn(
                            "hover:bg-blue-50/10 transition-all group",
                            isSaving && "bg-blue-50/50",
                            isCompleted && "bg-gray-50/40 opacity-75"
                          )}
                        >
                          {/* Cliente / Endereço */}
                          <td className="px-6 py-3">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span 
                                  className={cn(
                                    "font-bold text-sm cursor-pointer hover:text-blue-600 transition-colors",
                                    isCompleted ? "text-gray-450 line-through decoration-gray-400" : "text-gray-955"
                                  )}
                                  onClick={() => onOpenHistory(record.addressId, record.address?.street || '')}
                                  title="Clique para ver o histórico de manutenções"
                                >
                                  {record.client?.name || 'Cliente indefinido'}
                                </span>
                                {priorityAddressIds.has(record.addressId) && (
                                  <div 
                                    className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm shadow-red-200 shrink-0 animate-pulse" 
                                    title="Manutenção do mês anterior não foi concluída (Prioridade)" 
                                  />
                                )}
                              </div>
                              <span 
                                className={cn(
                                  "text-xs line-clamp-1 mt-0.5 cursor-pointer transition-colors",
                                  isCompleted ? "text-gray-400 line-through decoration-gray-300 hover:text-gray-500" : "text-gray-500 hover:text-blue-600"
                                )}
                                onClick={() => onOpenHistory(record.addressId, record.address?.street || '')}
                                title="Clique para ver o histórico de manutenções"
                              >
                                {record.address?.street}
                              </span>
                            </div>
                          </td>

                          {/* Máquinas */}
                          <td className="px-4 py-3 text-center">
                            <span className={cn(
                              "font-mono font-bold text-sm px-2.5 py-1 rounded-lg",
                              isCompleted ? "text-gray-400 bg-gray-100/40" : "text-gray-900 bg-gray-100/80"
                            )}>
                              {machineCount}
                            </span>
                          </td>

                          {/* Técnicos */}
                          <td className="px-4 py-3">
                            <div className="flex flex-col sm:flex-row gap-1.5">
                              <select 
                                value={record.technician1 || ''} 
                                disabled={isReadOnly || isCompleted}
                                onChange={(e) => onUpdateRecord(record, { technician1: e.target.value })}
                                className={cn(
                                  "text-[11px] font-semibold border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/10 w-full sm:w-28 transition-all",
                                  isCompleted 
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
                                disabled={isReadOnly || isCompleted}
                                onChange={(e) => onUpdateRecord(record, { technician2: e.target.value })}
                                className={cn(
                                  "text-[11px] font-semibold border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-500/10 w-full sm:w-28 transition-all",
                                  isCompleted 
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

                          {/* Semana */}
                          <td className="px-6 py-3 text-center">
                            <select 
                              value={record.scheduledWeek} 
                              disabled={isReadOnly || isCompleted}
                              onChange={(e) => onUpdateRecord(record, { scheduledWeek: parseInt(e.target.value) })}
                              className={cn(
                                "text-xs font-bold border-none rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all mx-auto",
                                isCompleted 
                                  ? "cursor-not-allowed opacity-60 text-gray-450 bg-gray-100" 
                                  : "cursor-pointer bg-blue-50 text-blue-700"
                              )}
                            >
                              {[1, 2, 3, 4, 5].map(w => (
                                <option key={w} value={w}>Semana {w}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {/* RIGHT COLUMN - Workload Summary (Interactive Sidebar) */}
      <div className="xl:col-span-4 space-y-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sticky top-24">
          <div className="flex items-center gap-2.5 mb-5 border-b border-gray-100 pb-4">
            <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Carga de Trabalho Técnica</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Acompanhamento das semanas</p>
            </div>
          </div>

          {/* Table representing workload */}
          <div className="overflow-hidden border border-gray-100 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-[9px] font-black uppercase tracking-wider text-gray-400">
                  <th className="px-3 py-3">Técnico</th>
                  <th className="px-2 py-3 text-center bg-gray-100/50">Total</th>
                  <th className="px-2 py-3 text-center">Sem 1</th>
                  <th className="px-2 py-3 text-center">Sem 2</th>
                  <th className="px-2 py-3 text-center">Sem 3</th>
                  <th className="px-2 py-3 text-center">Sem 4</th>
                  <th className="px-2 py-3 text-center">Sem 5</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {Object.entries(technicianWeeklyStats).filter(([techName]) => (technicianGrandTotals[techName] || 0) > 0).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-6 text-gray-400 italic text-[11px]">
                      Nenhum técnico alocado
                    </td>
                  </tr>
                ) : (
                  Object.entries(technicianWeeklyStats)
                    .filter(([techName]) => (technicianGrandTotals[techName] || 0) > 0)
                    .map(([techName, weeks]) => {
                      const grandTotal = technicianGrandTotals[techName] || 0;
                      
                      return (
                        <tr key={techName} className="hover:bg-gray-50/50 transition-colors">
                          {/* Name */}
                          <td className="px-3 py-3 font-bold text-gray-800 truncate max-w-[90px]" title={techName}>
                            {techName}
                          </td>

                          {/* Grand Total */}
                          <td className="px-2 py-3 text-center font-extrabold text-blue-700 bg-blue-50/30">
                            {grandTotal}
                          </td>

                          {/* Weeks */}
                          {[1, 2, 3, 4, 5].map(w => {
                            const count = weeks[w] || 0;
                            return (
                              <td 
                                key={w} 
                                className={cn(
                                  "px-2 py-3 text-center font-bold text-[11px]",
                                  count > 0 ? "text-emerald-600 bg-emerald-50/20" : "text-gray-300"
                                )}
                              >
                                {count}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                )}

                {/* Grand Total Row */}
                <tr className="bg-gray-100/80 font-extrabold text-gray-900 border-t border-gray-200 text-[11px]">
                  <td className="px-3 py-3 font-black text-gray-700">TOTAL</td>
                  <td className="px-2 py-3 text-center font-black text-blue-800 bg-blue-100/50">
                    {Object.values(technicianGrandTotals).reduce((sum: number, v: any) => sum + (v || 0), 0)}
                  </td>
                  {[1, 2, 3, 4, 5].map(w => (
                    <td key={w} className="px-2 py-3 text-center text-emerald-800">
                      {weeklyGrandTotals[w]}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Quick Stats & Helpers */}
          <div className="mt-5 space-y-3.5 pt-4 border-t border-gray-100">
            {addressesMissingTechCount > 0 && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100 text-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-xs font-bold leading-snug">
                  {addressesMissingTechCount} endereço{addressesMissingTechCount > 1 ? 's' : ''} sem técnico responsável!
                </span>
              </div>
            )}

            <div className="flex gap-2.5 p-3 bg-gray-50 rounded-xl text-gray-600 border border-gray-100">
              <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <p className="font-bold text-gray-800">Dica de Distribuição:</p>
                <p className="mt-0.5 text-gray-500 font-medium">
                  Tente equilibrar o total de máquinas entre as semanas para evitar sobrecarga dos técnicos e garantir o cumprimento de todos os prazos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
