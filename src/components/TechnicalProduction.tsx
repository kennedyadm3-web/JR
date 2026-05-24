import { useState, useEffect, useMemo } from 'react';
import { Address, MaintenanceRecord, Technician } from '../types';
import { dataService } from '../services/dataService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calculator, User, Calendar as CalendarIcon, CheckCircle, HandCoins, Printer, Plus, Trash2, AlertCircle } from 'lucide-react';

interface Penalty {
  id: string;
  description: string;
  value: number;
}

export function TechnicalProduction({ managerClientId }: { managerClientId?: string }) {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');
  const [pricePerMachine, setPricePerMachine] = useState<number | ''>('');
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [newPenaltyDesc, setNewPenaltyDesc] = useState('');
  const [newPenaltyValue, setNewPenaltyValue] = useState<number | ''>('');
  
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [month]);

  const loadData = async () => {
    setLoading(true);
    const [techs, a, r] = await Promise.all([
      dataService.getTechnicians(),
      dataService.getAddresses(),
      dataService.getRecords(month)
    ]);
    
    // Filter for manager if needed
    const filteredAddresses = a.filter(addr => !managerClientId || addr.clientId === managerClientId);
    const addressIds = new Set(filteredAddresses.map(addr => addr.id));
    
    setAddresses(filteredAddresses);
    setTechnicians(techs);
    setRecords(r.filter(rec => addressIds.has(rec.addressId)));
    
    if (techs.length > 0 && !selectedTechnician) {
      setSelectedTechnician(techs[0].name);
    }
    setLoading(false);
  };

  const productionStats = useMemo(() => {
    if (!selectedTechnician) return { items: [], totalMachines: 0, totalValue: 0, totalPenalties: 0, netValue: 0 };

    // Get records for selected technician where status is completed
    const techRecords = records.filter(r => 
      (r.technician1 === selectedTechnician || r.technician2 === selectedTechnician) && 
      r.status === 'completed'
    );

    let totalMachines = 0;

    const items = techRecords.map(r => {
      const addr = addresses.find(a => a.id === r.addressId);
      
      // Use executedQuantity if available, otherwise fallback to totalMachines of the address
      const machinesCount = r.executedQuantity !== undefined && r.executedQuantity !== null 
        ? r.executedQuantity 
        : (addr?.totalMachines || 0);
        
      totalMachines += machinesCount;

      return {
        id: r.id,
        address: addr?.street || 'Endereço Desconhecido',
        route: addr?.route || 'Sem Rota',
        executionDate: r.executionDate || r.month + '-01T12:00:00',
        machinesCount
      };
    }).sort((a, b) => new Date(b.executionDate).getTime() - new Date(a.executionDate).getTime());

    const totalValue = totalMachines * (pricePerMachine ? Number(pricePerMachine) : 0);
    const totalPenalties = penalties.reduce((sum, p) => sum + p.value, 0);
    const netValue = totalValue - totalPenalties;

    return { items, totalMachines, totalValue, totalPenalties, netValue };
  }, [records, addresses, selectedTechnician, pricePerMachine, penalties]);

  const addPenalty = () => {
    if (newPenaltyDesc && newPenaltyValue) {
      setPenalties([...penalties, { 
        id: Math.random().toString(36).substr(2, 9), 
        description: newPenaltyDesc, 
        value: Number(newPenaltyValue) 
      }]);
      setNewPenaltyDesc('');
      setNewPenaltyValue('');
    }
  };

  const removePenalty = (id: string) => {
    setPenalties(penalties.filter(p => p.id !== id));
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
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-indigo-600" />
                Produção Técnica
            </h2>
            <p className="text-xs text-gray-500 mt-1">
                Calcule o valor da produção baseado nas máquinas concluídas pelo técnico no mês.
            </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
               <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
               <select
                 value={selectedTechnician}
                 onChange={(e) => setSelectedTechnician(e.target.value)}
                 className="pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none appearance-none"
               >
                 {technicians.map(t => (
                   <option key={t.id} value={t.name}>{t.name}</option>
                 ))}
               </select>
            </div>
            
            <div className="relative">
               <CalendarIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
               <input 
                 type="month"
                 value={month}
                 onChange={(e) => setMonth(e.target.value)}
                 className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
               />
            </div>

            <div className="relative flex items-center">
                <span className="absolute left-3 text-xs font-bold text-gray-400">R$</span>
                <input 
                  type="number"
                  placeholder="Valor por Máq."
                  value={pricePerMachine}
                  onChange={(e) => setPricePerMachine(e.target.value ? Number(e.target.value) : '')}
                  className="pl-8 pr-4 py-2 w-36 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-6 border-b border-gray-100 bg-white">
          <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-xl shadow-sm text-indigo-600 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-1">Locais Atendidos</p>
                  <p className="text-2xl font-black text-indigo-950">{productionStats.items.length}</p>
              </div>
          </div>
          
          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-xl shadow-sm text-blue-600 flex items-center justify-center shrink-0">
                  <Calculator className="w-6 h-6" />
              </div>
              <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-1">Total de Máq.</p>
                  <p className="text-2xl font-black text-blue-950">{productionStats.totalMachines}</p>
              </div>
          </div>
          
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center gap-4 relative overflow-hidden">
              <div className="w-12 h-12 bg-white rounded-xl shadow-sm text-emerald-600 flex items-center justify-center shrink-0">
                  <HandCoins className="w-6 h-6" />
              </div>
              <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-1">Bruto (R$)</p>
                  <p className="text-xl font-black text-emerald-900">
                      {productionStats.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
              </div>
              {productionStats.totalPenalties > 0 && (
                <div className="absolute top-2 right-2 text-[10px] font-bold text-red-500 bg-red-100 px-1.5 py-0.5 rounded">
                  -{productionStats.totalPenalties.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              )}
          </div>
          
          <div className="p-4 rounded-2xl bg-gray-900 border border-gray-800 flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-800 rounded-xl shadow-inner text-white flex items-center justify-center shrink-0">
                  <HandCoins className="w-6 h-6" />
              </div>
              <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Líquido a Pagar</p>
                  <p className="text-xl font-black text-white">
                      {productionStats.netValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 flex-1">
        {/* Penalties Column */}
        <div className="lg:col-span-1 border-r border-gray-100 bg-gray-50/30 flex flex-col items-stretch">
          <div className="p-4 border-b border-gray-100 bg-white">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-red-500" /> 
              Penalidades e Descontos
            </h3>
            
            <div className="space-y-3 print:hidden">
              <input 
                type="text"
                placeholder="Descrição do desconto (Ex: Atraso, Ferramenta)"
                value={newPenaltyDesc}
                onChange={(e) => setNewPenaltyDesc(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
              />
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">R$</span>
                  <input 
                    type="number"
                    placeholder="Valor"
                    value={newPenaltyValue}
                    onChange={(e) => setNewPenaltyValue(e.target.value ? Number(e.target.value) : '')}
                    className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                  />
                </div>
                <button 
                  onClick={addPenalty}
                  disabled={!newPenaltyDesc || !newPenaltyValue}
                  className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto">
            {penalties.length > 0 ? (
              <ul className="space-y-2">
                {penalties.map(p => (
                  <li key={p.id} className="bg-white border border-red-100 p-3 rounded-lg flex items-center justify-between shadow-sm group">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-xs font-bold text-gray-900 truncate">{p.description}</p>
                      <p className="text-xs font-bold text-red-600 mt-0.5">
                        -{p.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                    </div>
                    <button 
                      onClick={() => removePenalty(p.id)}
                      className="text-gray-300 hover:text-red-600 transition-colors p-1 print:hidden opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-center p-8 text-gray-400 mt-4 italic border-2 border-dashed border-gray-100 rounded-xl">
                Nenhuma penalidade adicionada.
              </p>
            )}
            {penalties.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
                <span className="text-xs font-bold text-gray-500 uppercase">Total Descontos</span>
                <span className="text-sm font-black text-red-600">
                  {productionStats.totalPenalties.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Main Table Column */}
        <div className="lg:col-span-2 overflow-x-auto flex-1 bg-white">
          <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100 text-[10px] font-black tracking-widest text-gray-400 uppercase">
              <th className="p-4 pl-6">Endereço Atendido</th>
              <th className="p-4">Rota</th>
              <th className="p-4 text-center">Máquinas Atendidas</th>
              <th className="p-4 pr-6 text-right">Data de Execução</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/50">
            {productionStats.items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                <td className="p-4 pl-6">
                  <p className="font-medium text-gray-900 text-sm">{item.address}</p>
                </td>
                <td className="p-4">
                  <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-md">
                      {item.route}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center justify-center min-w-[32px] h-8 bg-blue-50 text-blue-700 font-bold rounded-lg text-sm">
                      {item.machinesCount}
                  </span>
                </td>
                <td className="p-4 pr-6 text-right">
                   <span className="text-xs font-medium text-gray-600">
                      {format(new Date(item.executionDate), "dd/MM/yyyy")}
                   </span>
                </td>
              </tr>
            ))}
            {productionStats.items.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-500 text-sm">
                  Nenhuma produção registrada para o técnico neste mês.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
