import React, { useState, useEffect, useMemo } from 'react';
import { dataService } from '../services/dataService';
import { Address, Client, MaintenanceRecord, MaintenanceStatus, RouteConfiguration, isOSRecord } from '../types';
import { format } from 'date-fns';

export const MacroTable = ({ currentMonthStr, addresses, clients, routeConfigs }: { currentMonthStr: string, addresses: Address[], clients: Client[], routeConfigs: RouteConfiguration[] }) => {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);

  const rollingMonths = useMemo(() => {
    const [yearStr, monthStr] = currentMonthStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-indexed month
    
    const result: { value: string; label: string }[] = [];
    const monthNamesAbbr = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    for (let i = 2; i >= 0; i--) {
      const d = new Date(year, month - i, 1);
      const yStr = d.getFullYear().toString();
      const mStr = (d.getMonth() + 1).toString().padStart(2, '0');
      
      const abbr = monthNamesAbbr[d.getMonth()];
      const shortYear = d.getFullYear().toString().slice(-2);
      
      result.push({
        value: `${yStr}-${mStr}`,
        label: `${abbr}/${shortYear}`
      });
    }
    return result;
  }, [currentMonthStr]);

  const uniqueYears = useMemo(() => {
    const years = rollingMonths.map(m => m.value.split('-')[0]);
    return Array.from(new Set(years));
  }, [rollingMonths]);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const promises = uniqueYears.map(year => dataService.getRecordsByYear(year));
        const results = await Promise.all(promises);
        const combined = results.flat().filter(r => r && !isOSRecord(r));
        setRecords(combined);
      } catch (e) {
        console.error("Error fetching rolling records:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [uniqueYears]);

  const rowsByRoute = useMemo(() => {
    const map: Record<string, Address[]> = {};
    addresses.forEach(addr => {
      const route = addr.route || 'Sem Rota';
      if (!map[route]) map[route] = [];
      map[route].push(addr);
    });
    
    // Sort routes
    const routes = Object.keys(map).sort();
    return routes.map(route => {
      const config = routeConfigs.find(rc => rc.id === route);
      const sortedAddresses = map[route].sort((a, b) => {
        const nameA = a.clientName || clients.find(c => c.id === a.clientId)?.name || '';
        const nameB = b.clientName || clients.find(c => c.id === b.clientId)?.name || '';
        if (nameA && nameB) {
          const comp = nameA.localeCompare(nameB, 'pt-BR');
          if (comp !== 0) return comp;
        } else if (!nameA && nameB) {
          return 1;
        } else if (nameA && !nameB) {
          return -1;
        }
        return a.street.localeCompare(b.street, 'pt-BR');
      });
      return {
        route,
        config,
        addresses: sortedAddresses
      };
    });
  }, [addresses, clients, routeConfigs]);

  if (loading) {
    return <div className="py-20 text-center text-gray-500 font-bold">Carregando dados trimestrais...</div>;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200">
              <th className="px-4 py-3 font-bold text-gray-700 min-w-[180px] border-r border-gray-100">Cliente</th>
              <th className="px-4 py-3 font-bold text-gray-700 min-w-[240px] border-r border-gray-100">Endereço</th>
              {rollingMonths.map((m) => (
                <th key={m.value} className="px-2 py-3 font-bold text-gray-500 text-center text-[11px] uppercase tracking-wider min-w-[65px] border-r border-gray-100 last:border-0">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsByRoute.map(group => (
              <React.Fragment key={group.route}>
                <tr className="bg-gray-100/50 border-y border-gray-200">
                  <td colSpan={2 + rollingMonths.length} className="px-4 py-2 text-xs font-black text-gray-800 uppercase tracking-widest">
                    ROTA: {group.route}
                  </td>
                </tr>
                {group.addresses.map(addr => {
                   return (
                    <tr key={addr.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-2 text-xs font-bold text-gray-900 border-r border-gray-100">
                        {addr.clientName || clients.find(c => c.id === addr.clientId)?.name || 'Sem Cliente'}
                      </td>
                      <td className="px-4 py-2 text-xs font-medium text-gray-700 border-r border-gray-100">
                        {addr.street}
                      </td>
                      {rollingMonths.map(m => {
                        const targetMonth = m.value;
                        const record = records.find(r => r.addressId === addr.id && r.month === targetMonth);
                        const isCompleted = record?.status === MaintenanceStatus.COMPLETED;
                        let displayDate = '-';
                        if (isCompleted && record?.executionDate) {
                          try {
                            const dateObj = new Date(record.executionDate);
                            // Adjusting for timezone if necessary, but simply format day
                            displayDate = format(dateObj, 'dd/MM');
                          } catch {
                            // ignore
                          }
                        }
                        
                        return (
                          <td key={m.value} className="px-2 py-2 text-center border-r border-gray-100 last:border-0 relative">
                            {isCompleted ? (
                              <span className="inline-block px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-100/50 min-w-[40px]">
                                {displayDate}
                              </span>
                            ) : (
                              <span className="text-gray-300 font-medium">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                   );
                 })}
              </React.Fragment>
            ))}
            {rowsByRoute.length === 0 && (
              <tr>
                <td colSpan={2 + rollingMonths.length} className="px-4 py-8 text-center text-gray-400 font-medium">
                  Nenhum endereço cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
