import { useState, useEffect, useMemo } from 'react';
import { Address, MaintenanceRecord, Client } from '../types';
import { dataService } from '../services/dataService';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Clock, Calendar, Search, Printer } from 'lucide-react';
import { cn } from '../lib/utils';

export function ScheduleReport({ managerClientId }: { managerClientId?: string }) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [allRecords, setAllRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [a, c, r] = await Promise.all([
      dataService.getAddresses(),
      dataService.getClients(),
      dataService.getAllRecords()
    ]);
    
    // Filter for manager if needed
    const filteredAddresses = a.filter(addr => !managerClientId || addr.clientId === managerClientId);
    
    setAddresses(filteredAddresses);
    setClients(c);
    setAllRecords(r);
    setLoading(false);
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

  if (loading) {
    return (
        <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[500px]">
      <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50">
        <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                Endereços sem Manutenção
            </h2>
            <p className="text-xs text-gray-500 mt-1">
                Acompanhe os locais ordenados por maior tempo sem registro de manutenção concluída.
            </p>
        </div>
        <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:flex-initial">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                    type="text"
                    placeholder="Buscar endereço ou cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none w-full sm:w-64"
                />
            </div>
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

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white border-b border-gray-100 text-[10px] font-black tracking-widest text-gray-400 uppercase">
              <th className="p-4 pl-6">Endereço / Cliente</th>
              <th className="p-4">Rota</th>
              <th className="p-4 text-center">Dias sem Mnt.</th>
              <th className="p-4 pr-6 text-right">Última Manutenção</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/50">
            {filteredStats.map((stat) => (
              <tr key={stat.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-4 pl-6 max-w-[300px]">
                  <p className="font-bold text-gray-900 text-sm truncate" title={stat.street}>
                    {stat.street}
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-0.5" title={stat.clientName}>
                    {stat.clientName}
                  </p>
                </td>
                <td className="p-4">
                  <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-md">
                      {stat.route || 'Sem Rota'}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className={cn(
                      "text-xs font-bold px-2 py-1 rounded-lg",
                      stat.daysWithoutMaintenance > 60 ? "bg-red-50 text-red-700 border border-red-100" :
                      stat.daysWithoutMaintenance > 30 ? "bg-amber-50 text-amber-700 border border-amber-100" :
                      "bg-emerald-50 text-emerald-700 border border-emerald-100"
                  )}>
                      {stat.daysWithoutMaintenance === Infinity ? 'Sem Registro' : `${stat.daysWithoutMaintenance} dias`}
                  </span>
                </td>
                <td className="p-4 pr-6 text-right">
                  {stat.lastDate ? (
                     <div className="flex items-center justify-end gap-1.5 text-gray-600">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs font-medium">{format(stat.lastDate, "dd/MM/yyyy")}</span>
                     </div>
                  ) : (
                     <span className="text-xs text-gray-400 italic">Nunca</span>
                  )}
                </td>
              </tr>
            ))}
            {filteredStats.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-500 text-sm">
                  Nenhum endereço encontrado para esta busca.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
