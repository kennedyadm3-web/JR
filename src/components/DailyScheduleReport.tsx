import { useState, useEffect, useMemo } from 'react';
import { Address, Client, MaintenanceRecord, MaintenanceStatus, Technician } from '../types';
import { dataService } from '../services/dataService';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Filter, Search, Edit2, X, CheckCircle, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

export function DailyScheduleReport({ managerClientId }: { managerClientId?: string }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedTechnician, setSelectedTechnician] = useState<string>('ALL');
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<{
     record: MaintenanceRecord;
     addressName: string;
     clientName: string;
     executedQuantity: number;
     plannedDate: string;
     technician1: string;
     technician2: string;
     status: MaintenanceStatus;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [allRecords, addrs, clis, techs] = await Promise.all([
      dataService.getAllRecords(),
      dataService.getAddresses(),
      dataService.getClients(),
      dataService.getTechnicians()
    ]);
    
    let filteredRecords = allRecords;
    if (managerClientId) {
      const allowedAddrs = new Set(addrs.filter(a => a.clientId === managerClientId).map(a => a.id));
      filteredRecords = allRecords.filter(r => allowedAddrs.has(r.addressId));
    }
    
    setRecords(filteredRecords);
    setAddresses(addrs);
    setClients(clis);
    setTechnicians(techs);
    setLoading(false);
  };

  const processedData = useMemo(() => {
    let result = records.filter(r => r.plannedDate === selectedDate && r.status !== 'completed'); // Show all on that date? Wait, the user said "mostrar os endereços com aquela data prevista". If they want to see all including completed, we shouldn't filter by status, but usually they want to see what is planned. Let's include all.
    result = records.filter(r => r.plannedDate);
    
    if (selectedDate) {
      result = result.filter(r => r.plannedDate === selectedDate);
    }
    
    if (selectedTechnician !== 'ALL') {
      result = result.filter(r => r.technician1 === selectedTechnician || r.technician2 === selectedTechnician);
    }

    // Sort by date ascending (if selectedDate is empty, it's useful)
    result = result.sort((a, b) => (a.plannedDate || '').localeCompare(b.plannedDate || ''));

    return result.map(r => {
       const addr = addresses.find(a => a.id === r.addressId);
       const client = clients.find(c => c.id === addr?.clientId);
       
       const isTemp = r.isTemporaryRoute;
       
       return {
          record: r,
          addressName: isTemp ? r.temporaryStreet || 'Endereço Temp.' : addr?.street || 'Desconhecido',
          clientName: isTemp ? r.temporaryClient || 'Cliente Temp.' : client?.name || 'Desconhecido',
          totalMachines: isTemp ? 0 : addr?.totalMachines || 0,
       };
    });
  }, [records, addresses, clients, selectedDate, selectedTechnician]);

  const handleOpenModal = (item: any) => {
     setEditingRecord({
        record: item.record,
        addressName: item.addressName,
        clientName: item.clientName,
        executedQuantity: item.record.executedQuantity || item.totalMachines || 0,
        plannedDate: item.record.plannedDate || '',
        technician1: item.record.technician1 || '',
        technician2: item.record.technician2 || '',
        status: item.record.status
     });
     setModalOpen(true);
  };

  const handleSave = async () => {
    if (!editingRecord) return;
    
    try {
      const updatedRecord = {
         ...editingRecord.record,
         executedQuantity: editingRecord.executedQuantity,
         plannedDate: editingRecord.plannedDate,
         technician1: editingRecord.technician1,
         technician2: editingRecord.technician2,
         status: editingRecord.status
      };
      
      await dataService.upsertRecord(updatedRecord);
      
      // Update local state
      setRecords(prev => prev.map(r => r.id === updatedRecord.id ? updatedRecord : r));
      setModalOpen(false);
    } catch (e) {
       console.error("Failed to save", e);
       alert("Erro ao salvar dados.");
    }
  };

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
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Agenda Diária</h2>
            <p className="text-xs text-gray-500 font-medium">Veja os endereços previstos por data e técnico</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-[200px]">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          
          <div className="relative w-full sm:w-auto">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={selectedTechnician}
              onChange={(e) => setSelectedTechnician(e.target.value)}
              className="w-full sm:w-[200px] pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">Todos os Técnicos</option>
              {technicians.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto bg-white border-t border-gray-100">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50/50 sticky top-0 shadow-sm z-10">
            <tr className="border-b border-gray-100 text-[10px] font-black tracking-widest text-gray-400 uppercase">
               <th className="px-6 py-4">Data Prevista</th>
               <th className="px-6 py-4">Cliente / Endereço</th>
               <th className="px-4 py-4 text-center">Máquinas</th>
               <th className="px-4 py-4">Técnicos</th>
               <th className="px-4 py-4">Status</th>
               <th className="px-4 py-4 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {processedData.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center p-8 text-gray-500 font-medium">
                  Nenhum endereço encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : processedData.map((item, index) => {
               const r = item.record;
               
               let StatusIcon = Clock;
               let statusColor = 'text-gray-500 bg-gray-50 border-gray-200';
               let statusText = 'Pendente';
               
               if (r.status === MaintenanceStatus.COMPLETED) {
                  StatusIcon = CheckCircle;
                  statusColor = 'text-emerald-600 bg-emerald-50 border-emerald-100';
                  statusText = 'Concluída';
               } else if (r.status === MaintenanceStatus.PARTIAL) {
                  statusColor = 'text-amber-600 bg-amber-50 border-amber-100';
                  statusText = 'Em Andamento';
               }

               return (
                <tr key={`${r.id}-${index}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                     <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-gray-100 text-xs font-bold text-gray-700">
                        {r.plannedDate ? format(parseISO(r.plannedDate), 'dd/MM/yyyy') : '-'}
                     </span>
                  </td>
                  <td className="px-6 py-4">
                     <div className="flex flex-col">
                        <span className="font-bold text-gray-900 text-sm">{item.clientName}</span>
                        <span className="text-xs text-gray-500">{item.addressName}</span>
                        {r.isTemporaryRoute && <span className="text-[10px] bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full mt-1 w-max">Rota Temporária</span>}
                     </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                     <span className="text-sm font-bold text-gray-700">{item.totalMachines}</span>
                  </td>
                  <td className="px-4 py-4">
                     <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium text-gray-700">{r.technician1 || '-'}</span>
                        {r.technician2 && <span className="text-xs font-medium text-gray-500">{r.technician2}</span>}
                     </div>
                  </td>
                  <td className="px-4 py-4">
                     <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider", statusColor)}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {statusText}
                     </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                     <button
                        onClick={() => handleOpenModal(item)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-block"
                        title="Dar Baixa / Editar"
                     >
                        <Edit2 className="w-4 h-4" />
                     </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Dar Baixa */}
      {modalOpen && editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden">
            <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                Dar Baixa / Atualizar Endereço
              </h3>
              <button 
                onClick={() => setModalOpen(false)}
                className="p-1 hover:bg-black/5 rounded-full text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
               <div>
                  <h4 className="font-bold text-gray-900">{editingRecord.clientName}</h4>
                  <p className="text-xs text-gray-500">{editingRecord.addressName}</p>
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Data Prevista</label>
                   <input 
                     type="date"
                     value={editingRecord.plannedDate}
                     onChange={(e) => setEditingRecord(prev => prev ? ({ ...prev, plannedDate: e.target.value }) : null)}
                     className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                   />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Máquinas Feitas</label>
                   <input 
                     type="number"
                     value={editingRecord.executedQuantity}
                     onChange={(e) => setEditingRecord(prev => prev ? ({ ...prev, executedQuantity: parseInt(e.target.value) || 0 }) : null)}
                     className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                   />
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Técnico 1</label>
                   <select 
                     value={editingRecord.technician1}
                     onChange={(e) => setEditingRecord(prev => prev ? ({ ...prev, technician1: e.target.value }) : null)}
                     className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                   >
                     <option value="">Nenhum</option>
                     {technicians.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                   </select>
                 </div>
                 <div className="space-y-1">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Técnico 2</label>
                   <select 
                     value={editingRecord.technician2}
                     onChange={(e) => setEditingRecord(prev => prev ? ({ ...prev, technician2: e.target.value }) : null)}
                     className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                   >
                     <option value="">Nenhum</option>
                     {technicians.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                   </select>
                 </div>
               </div>
               
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Status do Mês</label>
                 <select 
                   value={editingRecord.status}
                   onChange={(e) => setEditingRecord(prev => prev ? ({ ...prev, status: e.target.value as MaintenanceStatus }) : null)}
                   className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                 >
                   <option value={MaintenanceStatus.PENDING}>Pendente</option>
                   <option value={MaintenanceStatus.PARTIAL}>Em Andamento</option>
                   <option value={MaintenanceStatus.COMPLETED}>Concluída</option>
                 </select>
               </div>
            </div>
            
            <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
              <button 
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100 flex items-center gap-2"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
