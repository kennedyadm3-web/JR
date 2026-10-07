import { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  ComposedChart,
  Line,
  Legend
} from 'recharts';
import { 
  TrendingUp, 
  Users, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Download,
  Calendar,
  ChevronRight,
  Printer,
  AlertCircle,
  LayoutList,
  X
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { MaintenanceRecord, Address, Client, MaintenanceStatus, ServiceCall, ServiceCallStatus, Inspection } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { ScheduleReport } from './ScheduleReport';
import { TechnicalProduction } from './TechnicalProduction';
import { RouteAnalysisReport } from './RouteAnalysisReport';

import { ServiceCallAnalysisReport } from './ServiceCallAnalysisReport';
import { ClientBillingReport } from './ClientBillingReport';
import { RouteExpensesReport } from './RouteExpensesReport';

interface Props {
  managerClientId?: string;
}

type ReportTab = 'dashboard' | 'service-calls' | 'schedule' | 'production' | 'route-analysis' | 'daily-schedule' | 'billing-status' | 'route-expenses';

export default function ReportsView({ managerClientId }: Props) {
  const [activeTab, setActiveTab] = useState<ReportTab>('dashboard');
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [serviceCalls, setServiceCalls] = useState<ServiceCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddressList, setShowAddressList] = useState(false);

  useEffect(() => {
    loadData();
  }, [month]);

  const loadData = async () => {
    setLoading(true);
    const [r, a, c, calls] = await Promise.all([
      dataService.getRecords(month),
      dataService.getAddresses(),
      dataService.getClients(),
      dataService.getServiceCalls()
    ]);
    
    // Filter data for managers
    const filteredAddresses = a.filter(addr => !managerClientId || addr.clientId === managerClientId);
    const addressIds = new Set(filteredAddresses.map(addr => addr.id));
    
    setRecords(r.filter(rec => addressIds.has(rec.addressId)));
    setAddresses(filteredAddresses);
    setClients(c.filter(client => !managerClientId || client.id === managerClientId));
    setServiceCalls(calls.filter(call => !managerClientId || call.clientId === managerClientId));
    setLoading(false);
  };

  const filteredData = useMemo(() => {
    let r = records;
    let a = addresses;
    let calls = serviceCalls;

    if (selectedClientId) {
      // Filter addresses for this client
      a = addresses.filter(addr => addr.clientId === selectedClientId);
      const addrIds = new Set(a.map(addr => addr.id));
      
      // Filter records for these addresses
      r = records.filter(rec => addrIds.has(rec.addressId));
      
      // Filter calls for this client
      calls = serviceCalls.filter(call => call.clientId === selectedClientId);
    }

    // Sort filtered addresses alphabetically by street name
    const sortedA = a.slice().sort((addrA, addrB) => {
      const nameA = addrA.street || addrA.name || '';
      const nameB = addrB.street || addrB.name || '';
      return nameA.localeCompare(nameB);
    });

    return { filteredRecords: r, filteredAddresses: sortedA, filteredCalls: calls };
  }, [records, addresses, serviceCalls, selectedClientId]);

  const stats = useMemo(() => {
    const { filteredRecords: r, filteredAddresses: a, filteredCalls: calls } = filteredData;
    
    const total = r.length;
    const completed = r.filter(rec => rec.status === MaintenanceStatus.COMPLETED).length;
    const pending = r.filter(rec => rec.status === MaintenanceStatus.PENDING).length;
    const withNotes = r.filter(rec => !!rec.notes).length;

    const techPerformance: Record<string, number> = {};
    r.forEach(rec => {
      if (rec.status === MaintenanceStatus.COMPLETED) {
        if (rec.technician1) techPerformance[rec.technician1] = (techPerformance[rec.technician1] || 0) + (rec.executedQuantity || 0);
        if (rec.technician2) techPerformance[rec.technician2] = (techPerformance[rec.technician2] || 0) + (rec.executedQuantity || 0);
      }
    });

    const techData = Object.entries(techPerformance).map(([name, count]) => ({ name, count }));

    // Calls stats
    const totalCalls = calls.length;
    const resolvedCalls = calls.filter(c => c.status === ServiceCallStatus.RESOLVED).length;
    const openCalls = calls.filter(c => c.status === ServiceCallStatus.OPEN).length;

    // Client specific totals
    const clientAddressesCount = a.length;
    const clientContractualMachines = a.reduce((sum, addr) => sum + (addr.totalMachines || 0), 0);
    const clientExecutedMachines = r.reduce((sum, rec) => sum + (rec.executedQuantity || 0), 0);
    const clientAddressesDone = new Set(r.filter(rec => (rec.executedQuantity || 0) > 0).map(rec => rec.addressId)).size;
    const clientMachinesPercentage = clientContractualMachines > 0 ? Math.round((clientExecutedMachines / clientContractualMachines) * 100) : 0;

    return { 
      total, completed, pending, withNotes, techData, 
      totalCalls, resolvedCalls, openCalls,
      clientAddressesCount, clientContractualMachines, clientExecutedMachines,
      clientAddressesDone, clientMachinesPercentage
    };
  }, [filteredData]);

  const pieData = [
    { name: 'Concluído', value: stats.completed, color: '#10b981' },
    { name: 'Pendente', value: stats.pending, color: '#ef4444' },
  ];

  const dailyEvolutionData = useMemo(() => {
    const { filteredRecords } = filteredData;
    const [yearStr, monthStr] = month.split('-');
    
    // Parse year and month
    const yearParsed = parseInt(yearStr, 10);
    const monthParsed = parseInt(monthStr, 10);
    
    // Get total days in month
    const daysInMonth = new Date(yearParsed, monthParsed, 0).getDate();
    
    // Initialize array for each day of the month
    const dailyData = [];
    for (let day = 1; day <= daysInMonth; day++) {
      dailyData.push({
        day,
        formattedDay: `${day.toString().padStart(2, '0')}/${monthStr}`,
        dailyQuantity: 0,
        cumulativeQuantity: 0
      });
    }
    
    // Sum executed quantities
    filteredRecords.forEach(rec => {
      if (rec.status === MaintenanceStatus.COMPLETED && rec.executedQuantity) {
        const dateStr = rec.executionDate;
        if (dateStr) {
          try {
            const parts = dateStr.split('T')[0].split('-');
            if (parts.length === 3) {
              const rYear = parseInt(parts[0], 10);
              const rMonth = parseInt(parts[1], 10);
              const rDay = parseInt(parts[2], 10);
              
              if (rYear === yearParsed && rMonth === monthParsed) {
                if (rDay >= 1 && rDay <= daysInMonth) {
                  dailyData[rDay - 1].dailyQuantity += rec.executedQuantity;
                }
              }
            }
          } catch (e) {
            console.error("Error parsing executionDate for daily evolution chart:", dateStr, e);
          }
        }
      }
    });
    
    // Compute cumulative sum
    let runningSum = 0;
    dailyData.forEach(item => {
      runningSum += item.dailyQuantity;
      item.cumulativeQuantity = runningSum;
    });
    
    return dailyData;
  }, [filteredData, month]);

  const selectedClient = clients.find(c => c.id === selectedClientId);
  const { filteredRecords, filteredAddresses } = filteredData;

  return (
    <div className="space-y-6 pb-10">
      <div className="bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm inline-flex mb-2 print:hidden w-full sm:w-auto overflow-x-auto">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap", activeTab === 'dashboard' ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100")}
        >
          Análise de Produtividade
        </button>
        <button
          onClick={() => setActiveTab('service-calls')}
          className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap", activeTab === 'service-calls' ? "bg-cyan-600 text-white shadow-md shadow-cyan-200" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100")}
        >
          Análise de Chamados
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap", activeTab === 'schedule' ? "bg-amber-600 text-white shadow-md shadow-amber-200" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100")}
        >
          Relatório do Cronograma
        </button>
        <button
          onClick={() => setActiveTab('production')}
          className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap", activeTab === 'production' ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100")}
        >
          Produção Técnica
        </button>
        <button
          onClick={() => setActiveTab('route-analysis')}
          className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap", activeTab === 'route-analysis' ? "bg-purple-600 text-white shadow-md shadow-purple-200" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100")}
        >
          Análise de Rotas
        </button>
        <button
          onClick={() => setActiveTab('billing-status')}
          className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap", activeTab === 'billing-status' ? "bg-rose-600 text-white shadow-md shadow-rose-200" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100")}
        >
          Status Faturamento
        </button>
        <button
          onClick={() => setActiveTab('route-expenses')}
          className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap", activeTab === 'route-expenses' ? "bg-emerald-600 text-white shadow-md shadow-emerald-200" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100")}
        >
          Despesas de Rotas
        </button>
      </div>

      {activeTab === 'schedule' && <ScheduleReport managerClientId={managerClientId} />}
      {activeTab === 'production' && <TechnicalProduction managerClientId={managerClientId} />}
      {activeTab === 'route-analysis' && <RouteAnalysisReport managerClientId={managerClientId} />}
      {activeTab === 'service-calls' && <ServiceCallAnalysisReport managerClientId={managerClientId} />}
      {activeTab === 'billing-status' && <ClientBillingReport managerClientId={managerClientId} />}
      {activeTab === 'route-expenses' && <RouteExpensesReport managerClientId={managerClientId} />}

      {activeTab === 'dashboard' && (
        <>
          <div className={cn("space-y-6", showAddressList && "print:hidden")}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm print:shadow-none">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Análise de Produtividade
            </h2>
            <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-medium bg-white max-w-[200px] truncate"
          >
            <option value="">Todos os Clientes</option>
            {clients.slice().sort((a,b) => a.name.localeCompare(b.name)).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input 
            type="month" 
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-medium"
          />
          <button 
            type="button"
            onClick={() => { 
                window.focus(); 
                setTimeout(() => window.print(), 200); 
            }}
            className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500 print:hidden"
            title="Imprimir Relatório"
          >
            <Printer className="w-5 h-5" />
          </button>
          
          {selectedClientId && (
            <button 
              type="button"
              onClick={() => setShowAddressList(true)}
              className="p-2 border border-gray-200 rounded-xl hover:bg-blue-50 text-blue-600 print:hidden"
              title="Ver Lista de Endereços"
            >
              <LayoutList className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {selectedClientId && (
        <div className="bg-blue-600 p-6 rounded-2xl text-white shadow-lg shadow-blue-200 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-white/20 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-blue-100">Relatório Específico</span>
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight">{selectedClient?.name}</h3>
            </div>
            
            <div className="w-full flex-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full">
                <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
                  <span className="block text-[10px] font-bold text-blue-100 uppercase tracking-widest mb-1 italic">Endereços Totais</span>
                  <span className="text-2xl font-black leading-none">{stats.clientAddressesCount}</span>
                </div>
                <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
                  <span className="block text-[10px] font-bold text-blue-100 uppercase tracking-widest mb-1 italic">End. Feitos Mês</span>
                  <span className="text-2xl font-black leading-none">{stats.clientAddressesDone}</span>
                </div>
                <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
                  <span className="block text-[10px] font-bold text-blue-100 uppercase tracking-widest mb-1 italic">Máquinas Totais</span>
                  <span className="text-2xl font-black leading-none">{stats.clientContractualMachines}</span>
                </div>
                <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/20 shadow-inner">
                  <span className="block text-[10px] font-bold text-blue-100 uppercase tracking-widest mb-1 italic">Maq. Feitas Mês</span>
                  <span className="text-2xl font-black leading-none text-emerald-300">{stats.clientExecutedMachines}</span>
                </div>
                <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10 col-span-2 sm:col-span-1 lg:col-span-1">
                  <span className="block text-[10px] font-bold text-blue-100 uppercase tracking-widest mb-1 italic">% Eficiência Máq.</span>
                  <span className="text-2xl font-black leading-none">{stats.clientMachinesPercentage}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label={selectedClientId ? "Endereços Filtrados" : "Total de Endereços"}
          value={selectedClientId ? stats.clientAddressesCount : stats.total} 
          icon={<Calendar className="w-6 h-6 text-blue-600" />} 
          color="bg-blue-50"
        />
        <StatCard 
          label="Manutenções Concluídas" 
          value={stats.completed} 
          icon={<CheckCircle className="w-6 h-6 text-emerald-600" />} 
          color="bg-emerald-50"
          percent={stats.total ? Math.round((stats.completed / stats.total) * 100) : 0}
        />
        <StatCard 
          label="Pendentes" 
          value={stats.pending} 
          icon={<Clock className="w-6 h-6 text-amber-600" />} 
          color="bg-amber-50"
        />
        <StatCard 
          label="Com Observações" 
          value={stats.withNotes} 
          icon={<AlertTriangle className="w-6 h-6 text-red-600" />} 
          color="bg-red-50"
        />
        <StatCard 
          label="Chamados em Aberto" 
          value={stats.openCalls} 
          icon={<AlertCircle className="w-6 h-6 text-purple-600" />} 
          color="bg-purple-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progress Chart */}
        <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-6">Status Total do Mês</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
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
                <span className="text-xs font-semibold text-gray-600">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Technician Performance */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-6">Máquinas Produzidas por Técnico</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.techData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: '#F9FAFB' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Daily Evolution Chart of the Month */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Evolução Diária de Produção do Mês
            </h3>
            <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider font-bold">Acompanhamento do volume diário e evolução acumulada de máquinas atendidas</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 bg-blue-500 rounded-sm" />
              <span className="font-bold text-gray-600">Produção Diária</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-emerald-500 relative flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-emerald-500 absolute" />
              </div>
              <span className="font-bold text-gray-600">Evolução Acumulada</span>
            </div>
          </div>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dailyEvolutionData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
              <XAxis 
                dataKey="day" 
                stroke="#9CA3AF" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(day) => `${day}`}
              />
              <YAxis 
                yAxisId="left"
                stroke="#3B82F6" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
                allowDecimals={false}
                label={{ value: 'Produção Diária', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: '9px', fontWeight: 'bold', fill: '#3B82F6' }, offset: 0 }}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="#10B981" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
                allowDecimals={false}
                label={{ value: 'Total Acumulado', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fontSize: '9px', fontWeight: 'bold', fill: '#10B981' }, offset: 0 }}
              />
              <Tooltip 
                cursor={{ fill: 'rgba(59, 130, 246, 0.04)' }}
                contentStyle={{ borderRadius: '16px', border: '1px solid #E5E7EB', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white p-3.5 rounded-xl border border-gray-100 shadow-md">
                        <p className="text-xs font-black text-gray-800 border-b border-gray-100 pb-1.5 mb-2 uppercase tracking-wider">{data.formattedDay}</p>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-6 text-xs text-gray-600">
                            <span className="flex items-center gap-1.5 font-bold">
                              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                              Máquinas Concluídas:
                            </span>
                            <span className="font-extrabold text-blue-600 text-right">{data.dailyQuantity}</span>
                          </div>
                          <div className="flex items-center justify-between gap-6 text-xs text-gray-600">
                            <span className="flex items-center gap-1.5 font-bold">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                              Total Acumulado:
                            </span>
                            <span className="font-extrabold text-emerald-600 text-right">{data.cumulativeQuantity}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar 
                yAxisId="left" 
                dataKey="dailyQuantity" 
                fill="#3B82F6" 
                radius={[3, 3, 0, 0]} 
                barSize={18}
              />
              <Line 
                yAxisId="right" 
                type="monotone" 
                dataKey="cumulativeQuantity" 
                stroke="#10B981" 
                strokeWidth={3} 
                dot={{ r: 3, stroke: '#10B981', strokeWidth: 1, fill: '#FFFFFF' }}
                activeDot={{ r: 5, stroke: '#10B981', strokeWidth: 2, fill: '#FFFFFF' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* List of services with notes */}
         <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[400px]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-amber-50/50">
              <h3 className="font-bold text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Endereços com Chamados / Observações
              </h3>
              <span className="text-[10px] font-black uppercase text-amber-600">{stats.withNotes} itens</span>
            </div>
            <div className="divide-y divide-gray-100">
              {filteredRecords.filter(r => !!r.notes).map(r => {
                const addr = addresses.find(a => a.id === r.addressId);
                const client = clients.find(c => c.id === addr?.clientId);
                return (
                  <div key={r.id} className="p-4 hover:bg-gray-50 transition-all flex items-start gap-4">
                    <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600 shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">{client?.name}</h4>
                      <p className="text-xs text-gray-500 mb-2">{addr?.street}</p>
                      <p className="text-sm text-gray-700 bg-amber-50 p-2 rounded-lg border border-amber-100 italic">" {r.notes} "</p>
                    </div>
                  </div>
                );
              })}
              {stats.withNotes === 0 && (
                <div className="py-20 text-center">
                  <p className="text-gray-500 text-sm italic">Nenhuma observação registrada neste mês.</p>
                </div>
              )}
            </div>
         </div>

         {/* Pendencies list */}
         <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[400px]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-red-50/50">
              <h3 className="font-bold text-red-900 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Manutenções Pendentes
              </h3>
              <span className="text-[10px] font-black uppercase text-red-600">{stats.pending} itens</span>
            </div>
            <div className="divide-y divide-gray-100">
              {filteredRecords.filter(r => r.status !== MaintenanceStatus.COMPLETED).map(r => {
                const addr = addresses.find(a => a.id === r.addressId);
                const client = clients.find(c => c.id === addr?.clientId);
                return (
                  <div key={r.id} className="p-4 hover:bg-gray-50 transition-all flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">{client?.name}</h4>
                        <p className="text-xs text-gray-500">{addr?.street} • {addr?.route}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Semana {r.scheduledWeek}</span>
                  </div>
                );
              })}
              {stats.pending === 0 && (
                <div className="py-20 text-center">
                  <CheckCircle className="w-12 h-12 text-emerald-100 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm italic">Parabéns! Tudo em dia.</p>
                </div>
              )}
            </div>
         </div>
      </div>

        </div>

      {/* Address List Modal */}
      {showAddressList && selectedClientId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm animate-in fade-in print:block print:bg-white print:p-0 print:static print:w-full print:h-auto print:z-[9999]">
          <style>{`
            @media print {
              body, #root, main, .container {
                background: white !important;
                color: black !important;
                padding: 0 !important;
                margin: 0 !important;
                max-width: 100% !important;
                width: 100% !important;
                box-shadow: none !important;
                overflow: visible !important;
              }
              @page {
                size: A4 portrait;
                margin: 1.5cm 1.2cm 1.5cm 1.2cm;
              }
              tr {
                page-break-inside: avoid !important;
              }
              thead {
                display: table-header-group !important;
              }
            }
          `}</style>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] print:max-h-none overflow-hidden flex flex-col border border-gray-200 print:block print:static print:w-full print:h-auto print:shadow-none print:border-none print:rounded-none">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 shrink-0 print:bg-white">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <LayoutList className="w-5 h-5 text-blue-600 print:hidden" />
                Status dos Endereços ({clients.find(c => c.id === selectedClientId)?.name})
              </h3>
              <div className="flex items-center gap-2 print:hidden">
                <button 
                  onClick={() => {
                    setTimeout(() => window.print(), 100);
                  }}
                  className="p-1 hover:bg-black/5 rounded-full text-gray-400 transition-colors"
                  title="Imprimir Tabela"
                >
                  <Printer className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setShowAddressList(false)}
                  className="p-1 hover:bg-black/5 rounded-full text-gray-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto print:overflow-visible p-0">
              <table className="w-full text-left border-collapse">
                <thead className="bg-white sticky top-0 shadow-sm">
                  <tr className="border-b border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400 shrink-0">
                    <th className="px-6 py-3">Endereço</th>
                    <th className="px-3 py-3 w-20 text-center">Máquinas</th>
                    <th className="px-4 py-3 w-32">Data Prevista</th>
                    <th className="px-6 py-3 w-36">Status Mês</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredAddresses.map(addr => {
                    const record = filteredRecords.find(r => r.addressId === addr.id && (r.executedQuantity || 0) > 0);
                    const isDone = !!record;
                    const anyRecord = filteredRecords.find(r => r.addressId === addr.id);
                    const plannedDate = anyRecord?.plannedDate || (record as any)?.plannedDate;
                    
                    return (
                      <tr key={addr.id} className={cn("hover:bg-gray-50 transition-colors", isDone ? "bg-emerald-50/10" : "")}>
                        <td className="px-6 py-3 max-w-[300px] print:max-w-none">
                          <p className="font-bold text-gray-900 text-sm truncate print:whitespace-normal print:overflow-visible" title={addr.name}>{addr.name}</p>
                          <p className="text-xs text-gray-500 truncate print:whitespace-normal print:overflow-visible" title={`${addr.street}${addr.number ? `, ${addr.number}` : ''}`}>{addr.street}{addr.number ? `, ${addr.number}` : ''}</p>
                        </td>
                        <td className="px-3 py-3 text-sm font-medium text-gray-500 text-center w-20">
                          {addr.totalMachines || 0}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 w-32">
                           {plannedDate ? (
                             <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium text-xs">
                               {format(new Date(plannedDate + 'T12:00:00'), 'dd/MM/yyyy')}
                             </span>
                           ) : (
                             <span className="text-xs text-gray-400 italic">Não definida</span>
                           )}
                        </td>
                        <td className="px-6 py-3 w-36">
                          {isDone ? (
                            <div className="flex items-center gap-1.5 text-emerald-600">
                              <CheckCircle className="w-4 h-4" />
                              <span className="text-xs font-bold">{format(new Date((record as any).executionDate || (record as any).maintenanceDate || record!.month + "-01" + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-gray-400">
                              <Clock className="w-4 h-4" />
                              <span className="text-xs font-medium italic">Pendente</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end shrink-0">
              <button 
                onClick={() => setShowAddressList(false)}
                className="px-6 py-2 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color, percent }: { label: string, value: number, icon: any, color: string, percent?: number }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className={cn("p-3 rounded-xl", color)}>
          {icon}
        </div>
        {percent !== undefined && (
          <div className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
            {percent}%
          </div>
        )}
      </div>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{label}</p>
    </div>
  );
}
