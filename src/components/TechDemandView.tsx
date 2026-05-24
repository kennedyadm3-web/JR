import { useState, useEffect, useMemo } from 'react';
import { Users, Calendar, Printer, Search, MapPin, Box, ChevronRight, CheckCircle2, Clock } from 'lucide-react';
import { dataService } from '../services/dataService';
import { MaintenanceRecord, Address, Client, Technician, MaintenanceStatus } from '../types';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';

export default function TechDemandView() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedTech, setSelectedTech] = useState('');
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [month]);

  const loadData = async () => {
    setLoading(true);
    const [r, a, c, t] = await Promise.all([
      dataService.getRecords(month),
      dataService.getAddresses(),
      dataService.getClients(),
      dataService.getTechnicians()
    ]);
    setRecords(r);
    setAddresses(a);
    setClients(c);
    setTechs(t);
    setLoading(false);
  };

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const matchTech = !selectedTech || (r.technician1 === selectedTech || r.technician2 === selectedTech);
      const matchWeek = r.scheduledWeek === selectedWeek;
      return matchTech && matchWeek;
    }).map(r => {
      const addr = addresses.find(a => a.id === r.addressId);
      const client = clients.find(c => c.id === addr?.clientId);
      return { ...r, address: addr, client };
    }).sort((a, b) => {
      const dateA = a.plannedDate ? new Date(a.plannedDate).getTime() : Infinity;
      const dateB = b.plannedDate ? new Date(b.plannedDate).getTime() : Infinity;
      return dateA - dateB;
    });
  }, [records, addresses, clients, selectedTech, selectedWeek]);

  const handlePrint = () => {
    window.focus();
    setTimeout(() => window.print(), 200);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Mês</label>
            <input 
              type="month" 
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Técnico</label>
            <select 
              value={selectedTech}
              onChange={(e) => setSelectedTech(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none"
            >
              <option value="">Todos os Técnicos</option>
              {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Semana</label>
            <select 
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
              className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none"
            >
              {[1,2,3,4,5].map(w => <option key={w} value={w}>Semana {w}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button 
              type="button"
              onClick={handlePrint}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimir Demanda
            </button>
          </div>
        </div>
      </div>

      {/* Demand Content */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden print:shadow-none print:border-none">
        <div className="bg-gray-900 text-white p-8 print:p-2 print:text-black print:border-b print:border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-1 print:text-base print:mb-0">Pauta de Atendimento Semanal</h2>
              <p className="opacity-70 text-sm print:opacity-100 print:text-[10px]">
                Semana {selectedWeek} • {format(new Date(month + '-02'), 'MMMM yyyy', { locale: ptBR })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-blue-400 print:text-blue-600 print:text-sm">{selectedTech || 'Equipe Geral'}</p>
              <p className="opacity-50 text-xs print:opacity-100 print:text-[8px]">REFRIG-PRO SOLUÇÕES</p>
            </div>
          </div>
        </div>

        <div className="p-8 print:p-2 space-y-6 print:space-y-2">
          {filteredRecords.length === 0 ? (
            <div className="py-20 text-center">
              <Users className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500">Nenhuma demanda encontrada para este técnico nesta semana.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 print:gap-2">
              {filteredRecords.map((record, index) => (
                <div 
                  key={record.id} 
                  className={cn(
                    "flex border-l-4 p-5 print:p-2 rounded-xl transition-all break-inside-avoid print:rounded-none print:border-l-2",
                    record.status === MaintenanceStatus.COMPLETED ? "border-emerald-500 bg-emerald-50/20" : "border-blue-500 bg-blue-50/10"
                  )}
                >
                  <div className="w-12 h-12 bg-white rounded-lg border border-gray-100 flex items-center justify-center font-bold text-gray-400 shrink-0 mr-5 print:w-8 print:h-8 print:mr-3 print:text-xs print:border-none">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2 print:mb-0">
                      <div>
                        <h4 className="font-bold text-gray-900 text-lg leading-tight print:text-[11px]">{record.client?.name}</h4>
                        <p className="text-gray-500 flex items-center gap-1.5 text-sm mt-1 print:text-[9px] print:mt-0">
                          <MapPin className="w-4 h-4 print:w-2.5 print:h-2.5" />
                          {record.address?.street}
                        </p>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <div className="flex items-center gap-1 bg-white px-3 py-1 rounded-full border border-gray-100 shadow-sm print:border-none print:shadow-none print:px-0 print:py-0">
                          <Box className="w-3 h-3 text-blue-600 print:w-2 print:h-2" />
                          <span className="text-sm font-bold text-gray-800 print:text-[9px]">{record.address?.totalMachines}</span>
                          <span className="text-[10px] text-gray-400 uppercase font-black ml-1 print:text-[7px]">Equip.</span>
                        </div>
                        {record.plannedDate && (
                          <div className="mt-2 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded print:mt-0 print:bg-transparent print:p-0 print:text-[7px]">
                            Previsto: {format(parseISO(record.plannedDate), 'dd/MM/yyyy')}
                          </div>
                        )}
                        <div className="mt-2 print:mt-0">
                           {record.status === MaintenanceStatus.COMPLETED ? (
                             <span className="flex items-center gap-1 text-emerald-600 font-bold text-xs print:text-[7px]">
                               <CheckCircle2 className="w-4 h-4 print:w-2 print:h-2" /> Realizado
                             </span>
                           ) : (
                             <span className="flex items-center gap-1 text-gray-400 font-bold text-xs print:text-[7px] print:hidden">
                               <Clock className="w-4 h-4" /> Pendente
                             </span>
                           )}
                        </div>
                      </div>
                    </div>
                    
                    {(record.notes || record.address?.route) && (
                      <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-dashed border-gray-200 print:mt-0.5 print:pt-0.5 print:gap-2">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1 print:text-[7px] print:mb-0">Obs</p>
                          <p className="text-xs text-gray-700 italic print:text-[8px] print:leading-tight">{record.notes || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1 print:text-[7px] print:mb-0">Rota</p>
                          <p className="text-xs font-bold text-gray-800 print:text-[8px] print:leading-tight">{record.address?.route}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="mt-12 pt-8 border-t border-gray-100 text-center print:block hidden print:mt-4 print:pt-4">
            <p className="text-xs text-gray-400 uppercase tracking-widest print:text-[8px]">Controle de Atendimento • Documento Interno • Gerado em {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
