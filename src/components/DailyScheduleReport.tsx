import { useState, useEffect, useMemo } from 'react';
import { Address, Client, Equipment, MaintenanceRecord, MaintenanceStatus, Technician } from '../types';
import { dataService } from '../services/dataService';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Filter, Search, Edit2, X, CheckCircle, Clock, Printer, AlertTriangle, Box, Layers } from 'lucide-react';
import { cn, matchesTechnician } from '../lib/utils';

export function DailyScheduleReport({ managerClientId }: { managerClientId?: string }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedTechnician, setSelectedTechnician] = useState<string>('ALL');
  const [equipmentFilter, setEquipmentFilter] = useState<'ALL' | 'GENERIC_ONLY' | 'REGISTERED'>('ALL');
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<{
     record: MaintenanceRecord;
     addressName: string;
     clientName: string;
     executedQuantity: number;
     plannedDate: string;
     executionDate: string;
     technician1: string;
     technician2: string;
     status: MaintenanceStatus;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const safetyTimeout = setTimeout(() => setLoading(false), 8000);
    try {
      const [allRecords, addrs, clis, techs, eqs] = await Promise.all([
        dataService.getAllRecords().catch(() => []),
        dataService.getAddresses().catch(() => []),
        dataService.getClients().catch(() => []),
        dataService.getTechnicians().catch(() => []),
        dataService.getEquipments().catch(() => [] as Equipment[])
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
      setEquipments(eqs || []);
    } catch (e) {
      console.error('Erro ao carregar relatório diário:', e);
    } finally {
      setLoading(false);
      clearTimeout(safetyTimeout);
    }
  };

  const processedData = useMemo(() => {
    let result = records.filter(r => r.plannedDate);
    
    if (selectedDate) {
      result = result.filter(r => r.plannedDate === selectedDate);
    }
    
    if (selectedTechnician !== 'ALL') {
      result = result.filter(r => 
        matchesTechnician(r.technician1, selectedTechnician, technicians) ||
        matchesTechnician(r.technician2, selectedTechnician, technicians)
      );
    }

    // Sort by date ascending (if selectedDate is empty, it's useful)
    result = result.sort((a, b) => (a.plannedDate || '').localeCompare(b.plannedDate || ''));

    const mapped = result.map(r => {
       const addr = addresses.find(a => a.id === r.addressId);
       const client = clients.find(c => c.id === addr?.clientId);
       const isTemp = r.isTemporaryRoute;
       
       const recAddrId = String(r.addressId || '').trim();
       const addrEquips = equipments.filter(eq => eq && String(eq.addressId || '').trim() === recAddrId);
       const registeredMachinesCount = addrEquips.length;
       const totalMachines = isTemp ? 0 : (addr?.totalMachines || 0);
       
       const isGenericOnly = !isTemp && totalMachines > 0 && registeredMachinesCount === 0;
       const isPartialRegistration = !isTemp && totalMachines > 0 && registeredMachinesCount > 0 && registeredMachinesCount < totalMachines;
       const isComplete = !isTemp && totalMachines > 0 && registeredMachinesCount >= totalMachines;
       
       return {
          record: r,
          addressId: r.addressId,
          addressName: isTemp ? r.temporaryStreet || 'Endereço Temp.' : addr?.street || 'Desconhecido',
          clientName: isTemp ? r.temporaryClient || 'Cliente Temp.' : client?.fullName || client?.name || 'Desconhecido',
          totalMachines,
          registeredMachinesCount,
          isGenericOnly,
          isPartialRegistration,
          isComplete
       };
    });

    if (equipmentFilter === 'GENERIC_ONLY') {
      return mapped.filter(item => item.isGenericOnly);
    }
    if (equipmentFilter === 'REGISTERED') {
      return mapped.filter(item => !item.isGenericOnly);
    }

    return mapped;
  }, [records, addresses, clients, equipments, selectedDate, selectedTechnician, equipmentFilter]);

  const genericCountForCurrentFilters = useMemo(() => {
    let result = records.filter(r => r.plannedDate);
    if (selectedDate) {
      result = result.filter(r => r.plannedDate === selectedDate);
    }
    if (selectedTechnician !== 'ALL') {
      result = result.filter(r => 
        (r.technician1 && r.technician1.trim().toLowerCase() === selectedTechnician.trim().toLowerCase()) ||
        (r.technician2 && r.technician2.trim().toLowerCase() === selectedTechnician.trim().toLowerCase())
      );
    }
    return result.filter(r => {
      if (r.isTemporaryRoute) return false;
      const addr = addresses.find(a => a.id === r.addressId);
      const total = addr?.totalMachines || 0;
      if (total <= 0) return false;
      const regCount = equipments.filter(eq => eq && eq.addressId === r.addressId).length;
      return regCount === 0;
    }).length;
  }, [records, addresses, equipments, selectedDate, selectedTechnician]);

  const handleOpenModal = (item: any) => {
     setEditingRecord({
        record: item.record,
        addressName: item.addressName,
        clientName: item.clientName,
        executedQuantity: item.record.executedQuantity || item.totalMachines || 0,
        plannedDate: item.record.plannedDate || '',
        executionDate: item.record.executionDate ? item.record.executionDate.split('T')[0] : '',
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
         executionDate: editingRecord.executionDate ? `${editingRecord.executionDate}T12:00:00Z` : null as any,
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
          <div className="p-2 bg-blue-100 text-blue-600 rounded-xl print:hidden">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm md:text-base font-bold text-gray-900 print:text-lg">Agenda Diária</h2>
            <p className="text-xs text-gray-500 font-medium print:hidden">Veja os endereços previstos por data e técnico</p>
            <p className="hidden print:block text-xs text-gray-700 font-bold mt-1">
              Data: {selectedDate ? format(parseISO(selectedDate), 'dd/MM/yyyy') : 'Todas as Datas'} • Técnico: {selectedTechnician === 'ALL' ? 'Todos' : selectedTechnician}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap md:flex-nowrap gap-2.5 w-full md:w-auto items-center">
          <div className="relative w-full sm:w-[170px] print:hidden">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          
          <div className="relative w-full sm:w-auto print:hidden">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={selectedTechnician}
              onChange={(e) => setSelectedTechnician(e.target.value)}
              className="w-full sm:w-[170px] pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">Todos os Técnicos</option>
              {technicians.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="relative w-full sm:w-auto print:hidden">
            <select
              value={equipmentFilter}
              onChange={(e) => setEquipmentFilter(e.target.value as any)}
              className={cn(
                "w-full sm:w-[210px] px-3 py-2 border rounded-xl text-xs font-bold outline-none transition-all",
                equipmentFilter === 'GENERIC_ONLY' 
                  ? "bg-amber-50 border-amber-300 text-amber-900 ring-2 ring-amber-400/20" 
                  : "bg-white border-gray-200 text-gray-700 focus:ring-2 focus:ring-blue-500/20"
              )}
            >
              <option value="ALL">Todas as Máquinas</option>
              <option value="GENERIC_ONLY">⚠️ Sem Máq. Cadastradas ({genericCountForCurrentFilters})</option>
              <option value="REGISTERED">Com Máq. Cadastradas</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-100 hover:shadow-lg transition-all outline-none print:hidden cursor-pointer shrink-0"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {genericCountForCurrentFilters > 0 && equipmentFilter === 'ALL' && (
        <div className="bg-amber-50/70 border-b border-amber-200/70 px-6 py-2 flex items-center justify-between gap-3 text-xs text-amber-800 font-medium print:hidden">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Existem <strong className="font-extrabold text-amber-950">{genericCountForCurrentFilters} endereço(s)</strong> neste dia com máquinas apenas genéricas (sem equipamentos cadastrados individualmente).
            </span>
          </div>
          <button
            type="button"
            onClick={() => setEquipmentFilter('GENERIC_ONLY')}
            className="text-[11px] font-bold text-amber-900 bg-amber-200/70 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            Filtrar pendentes
          </button>
        </div>
      )}

      <div className="flex-1 overflow-x-auto bg-white border-t border-gray-100 print:border-none">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50/50 sticky top-0 shadow-sm z-10 print:static print:shadow-none">
            <tr className="border-b border-gray-100 text-[10px] font-black tracking-widest text-gray-400 uppercase">
               <th className="px-6 py-4 print:px-3 print:py-2">Data Prevista</th>
               <th className="px-6 py-4 print:px-3 print:py-2">Cliente / Endereço</th>
               <th className="px-4 py-4 text-center print:px-2 print:py-2">Máquinas</th>
               <th className="px-4 py-4 print:px-2 print:py-2">Técnicos</th>
               <th className="px-4 py-4 print:px-2 print:py-2">Status</th>
               <th className="px-4 py-4 text-center print:hidden">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 print:divide-gray-200">
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
                <tr key={`${r.id}-${index}`} className="hover:bg-gray-50 transition-colors print:hover:bg-transparent break-inside-avoid">
                  <td className="px-6 py-4 print:px-3 print:py-2">
                     <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-gray-100 text-xs font-bold text-gray-700 print:bg-transparent print:p-0 print:font-semibold">
                        {r.plannedDate ? format(parseISO(r.plannedDate), 'dd/MM/yyyy') : '-'}
                     </span>
                  </td>
                  <td className="px-6 py-4 print:px-3 print:py-2">
                     <div className="flex flex-col">
                        <span className="font-bold text-gray-900 text-sm print:text-xs">{item.clientName}</span>
                        <span className="text-xs text-gray-500 print:text-[10px]">{item.addressName}</span>
                        {r.isTemporaryRoute && <span className="text-[10px] bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full mt-1 w-max print:border print:border-purple-200 print:bg-transparent">Rota Temporária</span>}
                        
                        {item.isGenericOnly && (
                          <div 
                            className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50/90 text-amber-800 border border-amber-200/80 text-[10px] font-semibold w-fit print:hidden shadow-2xs"
                            title="Este endereço possui apenas contagem genérica no sistema. Nenhum equipamento individual (marca/modelo/BTU) foi cadastrado ainda."
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>Sem máquinas cadastradas (genérico)</span>
                          </div>
                        )}
                        {item.isPartialRegistration && (
                          <div 
                            className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-50/90 text-sky-800 border border-sky-200/80 text-[10px] font-semibold w-fit print:hidden"
                            title={`Cadastro parcial: ${item.registeredMachinesCount} de ${item.totalMachines} equipamentos cadastrados.`}
                          >
                            <Box className="w-3 h-3 text-sky-600 shrink-0" />
                            <span>{item.registeredMachinesCount} de {item.totalMachines} cadastradas</span>
                          </div>
                        )}
                     </div>
                  </td>
                  <td className="px-4 py-4 text-center print:px-2 print:py-2">
                     <div className="flex flex-col items-center justify-center">
                        <span className="text-sm font-extrabold text-gray-800 print:text-xs">{item.totalMachines}</span>
                        {item.isGenericOnly ? (
                          <span 
                            className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60 uppercase tracking-tighter print:hidden mt-0.5" 
                            title="Apenas máquinas genéricas cadastradas"
                          >
                            Genérico
                          </span>
                        ) : item.isPartialRegistration ? (
                          <span 
                            className="text-[9px] font-bold text-sky-700 bg-sky-50 px-1 py-0.5 rounded border border-sky-200/60 print:hidden mt-0.5" 
                            title={`${item.registeredMachinesCount} de ${item.totalMachines} máquinas cadastradas`}
                          >
                            {item.registeredMachinesCount}/{item.totalMachines} cad.
                          </span>
                        ) : item.totalMachines > 0 ? (
                          <span 
                            className="text-[9px] font-semibold text-emerald-700 print:hidden mt-0.5" 
                            title="Todas as máquinas cadastradas individualmente"
                          >
                            ✓ {item.registeredMachinesCount} cad.
                          </span>
                        ) : null}
                     </div>
                  </td>
                  <td className="px-4 py-4 print:px-2 print:py-2">
                     <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium text-gray-700 print:text-[10px]">{r.technician1 || '-'}</span>
                        {r.technician2 && <span className="text-xs font-medium text-gray-500 print:text-[10px]">{r.technician2}</span>}
                     </div>
                  </td>
                  <td className="px-4 py-4 print:px-2 print:py-2">
                     <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider print:border-none print:p-0 print:normal-case print:tracking-normal print:font-medium print:text-[10px]", statusColor)}>
                        <StatusIcon className="w-3.5 h-3.5 print:hidden" />
                        {statusText}
                     </span>
                  </td>
                  <td className="px-4 py-4 text-center print:hidden">
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
               
                               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Status do Mês</label>
                    <select 
                      value={editingRecord.status}
                      onChange={(e) => {
                        const nextStatus = e.target.value as MaintenanceStatus;
                        setEditingRecord(prev => {
                          if (!prev) return null;
                          const todayStr = format(new Date(), 'yyyy-MM-dd');
                          const executionDate = (nextStatus === MaintenanceStatus.COMPLETED && !prev.executionDate) ? todayStr : prev.executionDate;
                          return { 
                            ...prev, 
                            status: nextStatus,
                            executionDate
                          };
                        });
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value={MaintenanceStatus.PENDING}>Pendente</option>
                      <option value={MaintenanceStatus.PARTIAL}>Em Andamento</option>
                      <option value={MaintenanceStatus.COMPLETED}>Concluída</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Data de Execução</label>
                    <input 
                      type="date"
                      value={editingRecord.executionDate}
                      onChange={(e) => {
                        const execDate = e.target.value;
                        setEditingRecord(prev => {
                          if (!prev) return null;
                          const nextStatus = execDate && prev.status === MaintenanceStatus.PENDING ? MaintenanceStatus.COMPLETED : prev.status;
                          return { 
                            ...prev, 
                            executionDate: execDate,
                            status: nextStatus
                          };
                        });
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
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
