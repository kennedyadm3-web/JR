import React, { useState, useEffect, useMemo } from 'react';
import { Address, MaintenanceRecord, Client } from '../types';
import { dataService } from '../services/dataService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle, Calendar as CalendarIcon, Eye, X, Printer } from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  managerClientId?: string;
}

export function ClientBillingReport({ managerClientId }: Props) {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [month]);

  const loadData = async () => {
    setLoading(true);
    const [r, a, c] = await Promise.all([
      dataService.getRecords(month),
      dataService.getAddresses(),
      dataService.getClients()
    ]);
    
    // Filter data for managers
    const filteredAddresses = a.filter(addr => !managerClientId || addr.clientId === managerClientId);
    const addressIds = new Set(filteredAddresses.map(addr => addr.id));
    
    setRecords(r.filter(rec => addressIds.has(rec.addressId)));
    setAddresses(filteredAddresses);
    setClients(c.filter(client => !managerClientId || client.id === managerClientId));
    setLoading(false);
  };

  const clientStats = useMemo(() => {
    const statsMap = new Map<string, {
      clientId: string;
      clientName: string;
      billingDay: number;
      totalAddresses: number;
      completedAddresses: number;
    }>();

    // Initialize stats map for all clients associated with filtered addresses
    const relevantClientsIds = new Set(addresses.map(a => a.clientId));
    clients.filter(c => relevantClientsIds.has(c.id)).forEach(client => {
      statsMap.set(client.id, {
        clientId: client.id,
        clientName: client.fullName || client.name,
        billingDay: client.billingDay || 0,
        totalAddresses: 0,
        completedAddresses: 0
      });
    });

    addresses.forEach(addr => {
      const stat = statsMap.get(addr.clientId);
      if (stat) {
        stat.totalAddresses++;
        
        const record = records.find(r => r.addressId === addr.id && (r.executedQuantity || 0) > 0);
        if (record) {
          stat.completedAddresses++;
        }
      }
    });

    // Convert map to array and filter out clients with 0 addresses
    let statsArray = Array.from(statsMap.values()).filter(s => s.totalAddresses > 0);

    // Sort by billing day
    statsArray.sort((a, b) => {
       const dayA = a.billingDay || 999;
       const dayB = b.billingDay || 999;
       if (dayA === dayB) {
           return a.clientName.localeCompare(b.clientName);
       }
       return dayA - dayB;
    });

    return statsArray;
  }, [records, addresses, clients]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 print:space-y-4 print:p-0">
      <style>{`
        @media print {
          /* Esconde elementos do sistema, barras de navegação, cabeçalhos do site e botões */
          aside, nav, header, button, input, select, .no-print, .print\\:hidden, [role="navigation"] {
            display: none !important;
          }
          /* Limpa o layout principal para caber perfeitamente no papel A4 */
          body, #root, main, .container {
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            box-shadow: none !important;
          }
          /* Configurações da página A4 e margens compactas e limpas */
          @page {
            size: A4 portrait;
            margin: 1.5cm 1.2cm 1.5cm 1.2cm;
          }
          /* Força as cores de fundo padrão de tags no print */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Mantém as tabelas sem quebras estranhas e limpas */
          tr {
            page-break-inside: avoid !important;
          }
          thead {
            display: table-header-group !important;
          }
        }
      `}</style>

      {/* Relatório Impresso A4 - Exclusivo para impressão */}
      <div className="hidden print:block mb-6 border-b border-gray-300 pb-4">
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-xl font-black text-gray-900 tracking-tight uppercase">Status de Manutenção por Faturamento</h1>
            <p className="text-xs text-gray-500 font-semibold">Relatório diário de controle e acompanhamento de conclusões</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-black text-gray-800">
              Mês de Referência: <span className="uppercase">{format(new Date(month + '-01T12:00:00'), 'MMMM yyyy', { locale: ptBR })}</span>
            </p>
            <p className="text-[10px] text-gray-400 mt-1 font-medium">Emitido em: {new Date().toLocaleDateString('pt-BR')}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm print:hidden">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            Status por Faturamento
          </h2>
          <p className="text-sm text-gray-500 font-medium">Acompanhe as manutenções dos clientes organizadas por data de faturamento</p>
        </div>
        
        <div className="flex items-center gap-3">
          <input 
            type="month" 
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500/20 text-sm font-medium"
          />
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-rose-200/50"
            title="Imprimir Relatório A4"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[400px] print:border-0 print:shadow-none print:bg-transparent">
        {loading ? (
          <div className="flex items-center justify-center h-64 print:hidden">
             <div className="w-8 h-8 rounded-full border-4 border-rose-500 border-t-transparent animate-spin"></div>
          </div>
        ) : (
          <div className="overflow-auto border-t border-gray-100 print:overflow-visible print:border-0 print:max-h-none">
            <table className="w-full text-left border-collapse print:table">
              <thead className="bg-gray-50 sticky top-0 shadow-sm print:bg-gray-100 print:border-b-2 print:border-gray-200">
                <tr className="border-y border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-500 print:text-gray-700">
                  <th className="px-6 py-4">Data Faturamento</th>
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Data Prevista / Técnico</th>
                  <th className="px-6 py-4 text-center">Status / Conclusão</th>
                  <th className="px-6 py-4 text-center">Endereços (Feitos / Total)</th>
                  <th className="px-6 py-4 text-center print:hidden">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clientStats.map((stat, index) => {
                  const percent = stat.totalAddresses > 0 
                                      ? Math.round((stat.completedAddresses / stat.totalAddresses) * 100) 
                                      : 0;
                  const isDone = stat.completedAddresses === stat.totalAddresses && stat.totalAddresses > 0;
                  const showHeader = index === 0 || stat.billingDay !== clientStats[index - 1].billingDay;

                  return (
                    <React.Fragment key={`group-${stat.clientId}`}>
                      {showHeader && (
                        <tr className="bg-gray-50/80 border-t border-b border-gray-100">
                          <td colSpan={6} className="px-6 py-3">
                            <div className="flex items-center gap-2 text-rose-600 font-bold text-sm tracking-wide">
                              <CalendarIcon className="w-4 h-4" />
                              Faturamento - Dia {stat.billingDay || '--'}
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-gray-100 text-gray-700 font-black text-xs">
                            Dia {stat.billingDay || '--'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-gray-900 text-sm">{stat.clientName}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className={cn(
                            "flex flex-col gap-1.5 max-h-[120px] overflow-y-auto pr-1 print:max-h-none print:overflow-visible",
                            stat.totalAddresses > 1 && "print:hidden"
                          )}>
                            {(() => {
                              const clientAddresses = addresses
                                .filter(a => a.clientId === stat.clientId)
                                .slice()
                                .sort((addrA, addrB) => (addrA.street || '').localeCompare(addrB.street || ''));
                              const programmedRecords = clientAddresses
                                .map(addr => ({
                                  address: addr,
                                  record: records.find(r => r.addressId === addr.id)
                                }))
                                .filter(item => item.record);

                              if (programmedRecords.length === 0) {
                                return (
                                  <span className="text-xs text-gray-400 font-medium italic">Não programado</span>
                                );
                              }

                              return programmedRecords.map(({ address, record }) => {
                                if (!record) return null;
                                const techs = [record.technician1, record.technician2].filter(Boolean).join(' + ');
                                return (
                                  <div key={address.id} className="flex flex-col sm:flex-row sm:items-center gap-x-2 text-xs leading-none py-0.5">
                                    <div className="flex items-center gap-1.5 min-w-[95px]">
                                      {record.plannedDate && (
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 font-black" />
                                      )}
                                      <span className={cn(
                                        "text-xs",
                                        record.plannedDate ? "font-medium text-gray-500" : "font-normal text-gray-400"
                                      )}>
                                        {record.plannedDate ? formatDate(record.plannedDate) : '-'}
                                      </span>
                                    </div>
                                    <span className="text-gray-400 hidden sm:inline">•</span>
                                    <span className="text-gray-500 font-medium truncate max-w-[150px] print:max-w-none" title={techs || 'Sem técnico'}>
                                      {techs || <em className="text-gray-300 font-normal">Sem técnico</em>}
                                    </span>
                                  </div>
                                );
                              });
                            })()}
                          </div>

                          {stat.totalAddresses > 1 && (
                            <div className="hidden print:block text-xs text-gray-400 font-medium italic text-left">
                              -
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                           {isDone ? (
                             <div className="inline-flex items-center justify-center bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold gap-1 print:bg-emerald-100 print:text-emerald-800">
                               <CheckCircle className="w-3.5 h-3.5" />
                               Concluído 100%
                             </div>
                           ) : (
                             <div className="flex items-center justify-center gap-2">
                               <div className="w-32 bg-gray-200 rounded-full h-2 relative overflow-hidden print:border print:border-gray-300">
                                  <div 
                                    className={cn("h-full rounded-full transition-all duration-500", percent >= 50 ? "bg-amber-500" : "bg-red-500")}
                                    style={{ width: `${percent}%` }}
                                  ></div>
                               </div>
                               <span className={cn("text-xs font-black w-10 text-right print:text-gray-700", percent >= 50 ? "text-amber-600" : "text-red-600")}>
                                 {percent}%
                               </span>
                             </div>
                           )}
                        </td>
                        <td className="px-6 py-4 text-center">
                           <span className="text-sm font-bold text-gray-700">
                               {stat.completedAddresses} <span className="text-gray-400 font-medium">/</span> {stat.totalAddresses}
                           </span>
                        </td>
                        <td className="px-6 py-4 text-center print:hidden">
                           <button 
                             onClick={() => setSelectedClientId(stat.clientId)}
                             className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors outline-none"
                             title="Ver Detalhes dos Endereços"
                           >
                             <Eye className="w-5 h-5 mx-auto" />
                           </button>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}

                {clientStats.length === 0 && (
                   <tr>
                     <td colSpan={6} className="px-6 py-16 text-center text-gray-500 italic font-medium">
                        Nenhum cliente encontrado.
                     </td>
                   </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedClientId && (
          <ClientDetailsModal 
            clientId={selectedClientId} 
            month={month}
            clients={clients} 
            addresses={addresses} 
            records={records}
            onClose={() => setSelectedClientId(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ClientDetailsModal({ 
  clientId, 
  month,
  clients, 
  addresses, 
  records, 
  onClose 
}: { 
  clientId: string; 
  month: string;
  clients: Client[]; 
  addresses: Address[]; 
  records: MaintenanceRecord[]; 
  onClose: () => void;
}) {
  const clientInfo = clients.find(c => c.id === clientId);
  const clientAddresses = addresses
    .filter(a => a.clientId === clientId)
    .slice()
    .sort((addrA, addrB) => (addrA.street || '').localeCompare(addrB.street || ''));
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h3 className="text-lg font-bold text-gray-900 leading-tight">
              {clientInfo?.name || 'Detalhes do Cliente'}
            </h3>
            <p className="text-sm font-medium text-gray-500 mt-0.5">Endereços e Programação ({format(new Date(month + '-01T12:00:00'), 'MMMM/yyyy')})</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-0 overflow-y-auto bg-gray-50/30 flex-1">
          <table className="w-full text-left border-collapse">
             <thead className="bg-gray-50 sticky top-0 shadow-sm">
               <tr className="border-y border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-500">
                 <th className="px-6 py-4">Endereço</th>
                 <th className="px-6 py-4 text-center">Técnicos Previstos</th>
                 <th className="px-6 py-4 text-center">Data Prevista / Sem.</th>
                 <th className="px-6 py-4 text-center">Progresso</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-100 bg-white">
                {clientAddresses.map(address => {
                  const record = records.find(r => r.addressId === address.id);
                  const isDone = record && (record.executedQuantity || 0) > 0;
                  
                  return (
                    <tr key={address.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-gray-900">{address.street}</p>
                        <p className="text-xs font-medium text-gray-500 mt-0.5">{address.totalMachines} máquina(s)</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {record?.technician1 ? (
                          <div className="flex flex-col gap-1 items-center justify-center">
                             <span className="inline-flex px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-md">{record.technician1}</span>
                             {record.technician2 && <span className="inline-flex px-2 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-md">{record.technician2}</span>}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 font-medium italic">Não programado</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {record?.executionDate ? (
                          <span className="text-sm font-bold text-gray-700">
                            {format(new Date(record.executionDate), 'dd/MM/yyyy')}
                          </span>
                        ) : record?.scheduledWeek ? (
                          <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-md">
                             Semana {record.scheduledWeek}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 font-medium italic">--</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {isDone ? (
                          <span className="inline-flex items-center justify-center gap-1.5 text-emerald-600 text-xs font-bold bg-emerald-50 px-2.5 py-1 rounded-full">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Realizada
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center text-gray-500 text-xs font-bold bg-gray-100 px-2.5 py-1 rounded-full">
                            Pendente
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {clientAddresses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500 italic text-sm font-medium">
                      Nenhum endereço encontrado para este cliente.
                    </td>
                  </tr>
                )}
             </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
