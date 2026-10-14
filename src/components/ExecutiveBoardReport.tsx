import { useState, useEffect, useMemo } from 'react';
import { 
  Building2, 
  Printer, 
  Calendar, 
  TrendingUp, 
  Users, 
  CheckCircle2, 
  Clock, 
  FileText, 
  SlidersHorizontal,
  ChevronDown,
  Info
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { MaintenanceRecord, Address, Client, MaintenanceStatus } from '../types';
import { format, subDays, startOfWeek, endOfWeek, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';

interface Props {
  managerClientId?: string;
}

export function ExecutiveBoardReport({ managerClientId }: Props) {
  // Main month selector (defaults to current month, e.g. 2026-10)
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  
  // Date period filter for Chart 1 (Periodo de Análise dos Técnicos)
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    const start = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    return format(start, 'yyyy-MM-dd');
  });
  
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    const end = endOfWeek(now, { weekStartsOn: 1 }); // Sunday
    return format(end, 'yyyy-MM-dd');
  });

  const [datePreset, setDatePreset] = useState<'this_week' | 'last_7_days' | 'custom'>('this_week');

  // User observations for Chart 1 and Chart 2
  const [techObs, setTechObs] = useState<string>(
    'Nesta semana, a equipe técnica manteve o foco na finalização do cronograma com alta eficiência operacional e cobertura priorizada.'
  );
  const [clientObs, setClientObs] = useState<string>(
    'Os clientes com faturamento previsto para o início do mês já atingiram 100% de conclusão das manutenções preventivas.'
  );

  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [month]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, a, c] = await Promise.all([
        dataService.getRecords(month),
        dataService.getAddresses(),
        dataService.getClients()
      ]);

      const filteredAddresses = a.filter(addr => !managerClientId || addr.clientId === managerClientId);
      const addressIds = new Set(filteredAddresses.map(addr => addr.id));

      setRecords(r.filter(rec => addressIds.has(rec.addressId)));
      setAddresses(filteredAddresses);
      setClients(c.filter(client => !managerClientId || client.id === managerClientId));
    } catch (e) {
      console.error('Error loading board report data:', e);
    } finally {
      setLoading(false);
    }
  };

  // Handle Preset Changes
  const handlePresetChange = (preset: 'this_week' | 'last_7_days' | 'custom') => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === 'this_week') {
      const start = startOfWeek(now, { weekStartsOn: 1 });
      const end = endOfWeek(now, { weekStartsOn: 1 });
      setStartDate(format(start, 'yyyy-MM-dd'));
      setEndDate(format(end, 'yyyy-MM-dd'));
    } else if (preset === 'last_7_days') {
      const start = subDays(now, 6);
      setStartDate(format(start, 'yyyy-MM-dd'));
      setEndDate(format(now, 'yyyy-MM-dd'));
    }
  };

  // 1. Process Technicians Performance Data (Chart 1)
  const techData = useMemo(() => {
    const techMap = new Map<string, {
      name: string;
      periodMachines: number;
      monthMachines: number;
    }>();

    const getOrCreateTech = (name: string) => {
      const cleanName = name.trim().toUpperCase();
      if (!techMap.has(cleanName)) {
        techMap.set(cleanName, {
          name: cleanName,
          periodMachines: 0,
          monthMachines: 0
        });
      }
      return techMap.get(cleanName)!;
    };

    let start: Date | null = null;
    let end: Date | null = null;
    if (startDate && endDate) {
      try {
        start = startOfDay(parseISO(startDate));
        end = endOfDay(parseISO(endDate));
      } catch (e) {}
    }

    records.forEach(rec => {
      if (rec.status === MaintenanceStatus.COMPLETED || (rec.executedQuantity && rec.executedQuantity > 0)) {
        const executedQty = rec.executedQuantity || 0;
        
        // Parse execution date
        let recDate: Date | null = null;
        if (rec.executionDate) {
          try { recDate = parseISO(rec.executionDate); } catch (e) {}
        } else if (rec.completionDate) {
          try { recDate = parseISO(rec.completionDate); } catch (e) {}
        } else if (rec.plannedDate) {
          try { recDate = parseISO(rec.plannedDate); } catch (e) {}
        }

        const inPeriod = Boolean(recDate && start && end && isWithinInterval(recDate, { start, end }));

        if (rec.technician1) {
          const t1 = getOrCreateTech(rec.technician1);
          t1.monthMachines += executedQty;
          if (inPeriod) t1.periodMachines += executedQty;
        }

        if (rec.technician2) {
          const t2 = getOrCreateTech(rec.technician2);
          t2.monthMachines += executedQty;
          if (inPeriod) t2.periodMachines += executedQty;
        }
      }
    });

    // Filter out techs with 0 machines in both period and month
    const list = Array.from(techMap.values()).filter(t => t.periodMachines > 0 || t.monthMachines > 0);

    // Sort descending: highest period machines first, then month machines
    list.sort((a, b) => {
      if (b.periodMachines !== a.periodMachines) {
        return b.periodMachines - a.periodMachines;
      }
      return b.monthMachines - a.monthMachines;
    });

    const maxPeriod = Math.max(...list.map(t => t.periodMachines), 1);

    return { list, maxPeriod };
  }, [records, startDate, endDate]);

  // 2. Process Client Billing Data (Chart 2)
  const clientBillingData = useMemo(() => {
    const statsMap = new Map<string, {
      clientId: string;
      clientName: string;
      billingDay: number;
      totalMachines: number;
      executedMachines: number;
      totalAddresses: number;
      completedAddresses: number;
    }>();

    const relevantClientIds = new Set(addresses.map(a => a.clientId));

    clients.filter(c => relevantClientIds.has(c.id)).forEach(client => {
      statsMap.set(client.id, {
        clientId: client.id,
        clientName: client.fullName || client.name,
        billingDay: client.billingDay || 0,
        totalMachines: 0,
        executedMachines: 0,
        totalAddresses: 0,
        completedAddresses: 0
      });
    });

    addresses.forEach(addr => {
      const stat = statsMap.get(addr.clientId);
      if (stat) {
        const addrMachines = addr.totalMachines || 0;
        stat.totalAddresses += 1;
        stat.totalMachines += addrMachines;

        const record = records.find(r => r.addressId === addr.id && (r.executedQuantity || 0) > 0);
        if (record) {
          stat.completedAddresses += 1;
          stat.executedMachines += record.executedQuantity || 0;
        }
      }
    });

    // Convert map to list and filter clients with addresses
    let list = Array.from(statsMap.values()).filter(s => s.totalAddresses > 0);

    // Calculate percentage
    list = list.map(item => {
      let percent = 0;
      if (item.totalMachines > 0) {
        percent = Math.min(100, Math.round((item.executedMachines / item.totalMachines) * 100));
      } else if (item.totalAddresses > 0) {
        percent = Math.min(100, Math.round((item.completedAddresses / item.totalAddresses) * 100));
      }
      return { ...item, percent };
    });

    // Sort by billing day ascending, then by percentage descending
    list.sort((a, b) => {
      const dayA = a.billingDay || 999;
      const dayB = b.billingDay || 999;
      if (dayA === dayB) {
        return b.percent - a.percent;
      }
      return dayA - dayB;
    });

    // Group clients by billing day
    const grouped = new Map<number, typeof list>();
    list.forEach(item => {
      const day = item.billingDay || 0;
      if (!grouped.has(day)) grouped.set(day, []);
      grouped.get(day)!.push(item);
    });

    return { list, grouped };
  }, [records, addresses, clients]);

  // Overall Board Summary Metrics
  const summaryMetrics = useMemo(() => {
    const totalContractMachines = addresses.reduce((sum, a) => sum + (a.totalMachines || 0), 0);
    const totalDoneMachines = records.reduce((sum, r) => sum + (r.executedQuantity || 0), 0);
    const globalPercent = totalContractMachines > 0 ? Math.round((totalDoneMachines / totalContractMachines) * 100) : 0;
    const completedAddresses = new Set(records.filter(r => (r.executedQuantity || 0) > 0).map(r => r.addressId)).size;
    const totalAddresses = addresses.length;

    return {
      totalContractMachines,
      totalDoneMachines,
      globalPercent,
      completedAddresses,
      totalAddresses
    };
  }, [records, addresses]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* CSS Rules for A4 Paper Printing */}
      <style>{`
        @media print {
          /* Hide all non-printable elements */
          aside, nav, header, button, input, select, textarea, .no-print, .print\\:hidden, [role="navigation"] {
            display: none !important;
          }
          /* Reset viewport for full width A4 */
          body, #root, main, .container {
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            box-shadow: none !important;
          }
          /* A4 Portrait dimensions and margins */
          @page {
            size: A4 portrait;
            margin: 1.2cm 1.2cm 1.2cm 1.2cm;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .page-break-avoid {
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Screen Controls Header (Hidden on Print) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-xs print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-black text-[10px] uppercase tracking-wider">
              Painel Executivo
            </span>
            <span className="text-xs text-slate-500 font-bold">Relatório Semanal</span>
          </div>
          <h2 className="text-xl font-black text-slate-950 tracking-tight flex items-center gap-2">
            <Building2 className="w-5 h-5 text-slate-800" /> Relatório para a Diretoria
          </h2>
          <p className="text-xs text-gray-500 font-medium">Visão sintética semanal de produtividade e faturamento formatada para folha A4.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Month Selector */}
          <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 border border-gray-200 rounded-xl">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-[10px] font-black uppercase text-gray-400">Mês:</span>
            <input 
              type="month" 
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-gray-800 outline-none cursor-pointer"
            />
          </div>

          {/* Print Button */}
          <button 
            type="button"
            onClick={() => { 
              window.focus(); 
              setTimeout(() => window.print(), 150); 
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer"
            title="Imprimir Relatório em Folha A4"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir A4</span>
          </button>
        </div>
      </div>

      {/* Screen Period Filter Bar for Chart 1 (Hidden on Print) */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-700" />
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              Filtro de Período do Gráfico de Técnicos
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePresetChange('this_week')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer",
                datePreset === 'this_week' 
                  ? "bg-slate-900 text-white shadow-xs" 
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              )}
            >
              Esta Semana
            </button>
            <button
              onClick={() => handlePresetChange('last_7_days')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer",
                datePreset === 'last_7_days' 
                  ? "bg-slate-900 text-white shadow-xs" 
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              )}
            >
              Últimos 7 dias
            </button>
            <button
              onClick={() => setDatePreset('custom')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer",
                datePreset === 'custom' 
                  ? "bg-slate-900 text-white shadow-xs" 
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              )}
            >
              Personalizado
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase text-slate-400">Início:</span>
            <input 
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset('custom');
              }}
              className="bg-white px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-slate-800"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase text-slate-400">Fim:</span>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset('custom');
              }}
              className="bg-white px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-slate-800"
            />
          </div>

          <span className="text-[11px] text-slate-500 italic ml-auto">
            A coluna de "Total do Mês" refere-se ao mês selecionado ({format(new Date(month + '-01T12:00:00'), 'MMMM/yyyy', { locale: ptBR })}).
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* A4 PRINT CONTAINER (EXECUTIVE REPORT SHEET)                             */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm print:p-0 print:border-none print:shadow-none space-y-6">
        
        {/* Printable Header */}
        <div className="border-b-2 border-slate-900 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black flex-col shrink-0 shadow-sm">
                <span className="text-xs tracking-wider">LE FRIO</span>
                <span className="text-[7px] tracking-widest text-slate-300">CLIMA</span>
              </div>
              <div>
                <h1 className="text-base font-black text-slate-950 uppercase tracking-tight">LE FRIO REFRIGERAÇÃO E COMÉRCIO LTDA</h1>
                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">RELATÓRIO DE DESEMPENHO OPERACIONAL PARA A DIRETORIA</p>
                <p className="text-[10px] text-slate-500 font-medium">Acompanhamento Semanal de Manutenções Preventivas (PMOC)</p>
              </div>
            </div>

            <div className="text-right space-y-1">
              <span className="inline-block bg-slate-100 text-slate-800 text-[10px] font-black uppercase px-2.5 py-1 rounded border border-slate-200">
                {format(new Date(month + '-01T12:00:00'), 'MMMM yyyy', { locale: ptBR })}
              </span>
              <p className="text-[9px] text-slate-500">
                Período Selecionado: <strong className="text-slate-800">{format(parseISO(startDate), 'dd/MM')} a {format(parseISO(endDate), 'dd/MM/yyyy')}</strong>
              </p>
              <p className="text-[9px] text-slate-400">Emitido em: {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
            </div>
          </div>

          {/* KPI Mini-Cards Row */}
          <div className="grid grid-cols-4 gap-3 mt-5 text-center">
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg">
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Maq. Contratuais</span>
              <span className="text-lg font-black text-slate-900">{summaryMetrics.totalContractMachines}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg">
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Concluídas no Mês</span>
              <span className="text-lg font-black text-emerald-700">{summaryMetrics.totalDoneMachines}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg">
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Eficiência Global</span>
              <span className="text-lg font-black text-blue-700">{summaryMetrics.globalPercent}%</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg">
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Endereços Concluídos</span>
              <span className="text-lg font-black text-slate-900">{summaryMetrics.completedAddresses} / {summaryMetrics.totalAddresses}</span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CHART 1: TECHNICIAN PERFORMANCE (HORIZONTAL BARS WITH 3 COLUMNS)        */}
        {/* ========================================================================= */}
        <div className="space-y-4 page-break-avoid">
          <div className="flex justify-between items-end border-b border-slate-300 pb-2">
            <div>
              <h3 className="text-xs font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600 print:hidden" />
                1. Produção Técnica de Manutenções Preventivas
              </h3>
              <p className="text-[10px] text-slate-500">
                Ordenado por produtividade no período ({format(parseISO(startDate), 'dd/MM')} a {format(parseISO(endDate), 'dd/MM')}). Exibe apenas técnicos com produção.
              </p>
            </div>
            <div className="text-right text-[10px] font-bold text-slate-600">
              Mês: <span className="uppercase">{format(new Date(month + '-01T12:00:00'), 'MMMM', { locale: ptBR })}</span>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 animate-pulse">Carregando dados dos técnicos...</div>
          ) : techData.list.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
              Nenhuma manutenção realizada por técnicos no período selecionado.
            </div>
          ) : (
            <div className="border border-slate-900 rounded-lg overflow-hidden text-xs">
              {/* Table Header */}
              <div className="grid grid-cols-12 bg-slate-900 text-white font-extrabold text-[10px] uppercase tracking-wider p-2.5">
                <div className="col-span-3">Nome do Técnico</div>
                <div className="col-span-6 text-center">Produção no Período ({format(parseISO(startDate), 'dd/MM')} - {format(parseISO(endDate), 'dd/MM')})</div>
                <div className="col-span-3 text-right">Total no Mês</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-200">
                {techData.list.map((item, idx) => {
                  const barWidthPercent = techData.maxPeriod > 0 
                    ? Math.max(8, Math.round((item.periodMachines / techData.maxPeriod) * 100)) 
                    : 0;

                  const isEven = idx % 2 === 0;

                  return (
                    <div key={item.name} className={cn("grid grid-cols-12 items-center p-2.5", isEven ? "bg-white" : "bg-slate-50/60")}>
                      {/* Column 1: Tech Name */}
                      <div className="col-span-3 font-bold text-slate-900 truncate pr-2 uppercase text-[11px]" title={item.name}>
                        <span className="text-[10px] text-slate-400 mr-1.5 font-mono">#{idx + 1}</span>
                        {item.name}
                      </div>

                      {/* Column 2: Horizontal Bar & Quantity */}
                      <div className="col-span-6 px-2 flex items-center gap-3">
                        <div className="flex-1 bg-slate-200/80 rounded-full h-4 relative overflow-hidden border border-slate-300">
                          <div 
                            className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                            style={{ width: `${barWidthPercent}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-black text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded shrink-0 min-w-[55px] text-center">
                          {item.periodMachines} máq.
                        </span>
                      </div>

                      {/* Column 3: Total Month Quantity */}
                      <div className="col-span-3 text-right font-black text-slate-900 text-xs">
                        <span className="bg-slate-100 text-slate-800 px-2.5 py-1 rounded border border-slate-300 inline-block font-mono">
                          {item.monthMachines} <span className="text-[9px] text-slate-500 font-semibold uppercase">no mês</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Technician Observation Field */}
          <div className="mt-3">
            <div className="flex items-center gap-1.5 mb-1 text-[10px] font-black text-slate-500 uppercase tracking-wider">
              <FileText className="w-3.5 h-3.5 text-slate-600 print:hidden" />
              <span>Observações da Diretoria (Gráfico 1):</span>
            </div>
            
            {/* Screen Textarea */}
            <textarea
              value={techObs}
              onChange={(e) => setTechObs(e.target.value)}
              placeholder="Digite aqui observações adicionais sobre o desempenho dos técnicos para saírem na folha de impressão..."
              rows={2}
              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-slate-800 print:hidden font-medium text-slate-800 resize-y"
            />

            {/* Print Rendered Observation Callout Box */}
            <div className="hidden print:block p-2.5 bg-slate-50 border border-slate-400 rounded text-[10px] text-slate-900 italic font-medium">
              <strong className="not-italic font-bold text-slate-950 uppercase block mb-0.5">Observações:</strong>
              {techObs || 'Sem observações adicionais para este gráfico.'}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CHART 2: CLIENTS GROUPED BY BILLING DATE                                */}
        {/* ========================================================================= */}
        <div className="space-y-4 pt-4 border-t-2 border-slate-900 page-break-avoid">
          <div className="flex justify-between items-end border-b border-slate-300 pb-2">
            <div>
              <h3 className="text-xs font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 print:hidden" />
                2. Status de Conclusão por Data de Faturamento dos Clientes
              </h3>
              <p className="text-[10px] text-slate-500">
                Agrupado por dia de faturamento do contrato. Destaca clientes 100% concluídos no mês.
              </p>
            </div>
            <div className="text-right text-[10px] font-bold text-slate-600">
              Total de Clientes: <span className="font-extrabold">{clientBillingData.list.length}</span>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 animate-pulse">Carregando dados de clientes...</div>
          ) : clientBillingData.list.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
              Nenhum cliente cadastrado com endereços associados.
            </div>
          ) : (
            <div className="border border-slate-900 rounded-lg overflow-hidden text-xs">
              {/* Header */}
              <div className="grid grid-cols-12 bg-slate-900 text-white font-extrabold text-[10px] uppercase tracking-wider p-2.5">
                <div className="col-span-2">Faturamento</div>
                <div className="col-span-4">Cliente</div>
                <div className="col-span-4 text-center">% Concluído das Máquinas</div>
                <div className="col-span-2 text-right">Progresso</div>
              </div>

              {/* Body */}
              <div className="divide-y divide-slate-200">
                {Array.from(clientBillingData.grouped.entries()).map(([day, groupClients]) => (
                  <div key={`group-${day}`} className="divide-y divide-slate-100">
                    {/* Day Group Badge */}
                    <div className="bg-slate-100 px-3 py-1.5 font-black text-[10px] text-slate-800 uppercase tracking-wider border-b border-slate-300 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-800" />
                      Faturamento - Dia {day > 0 ? String(day).padStart(2, '0') : 'Não Definido'} ({groupClients.length} clientes)
                    </div>

                    {groupClients.map((client) => {
                      const is100 = client.percent >= 100;

                      return (
                        <div key={client.clientId} className="grid grid-cols-12 items-center p-2.5 hover:bg-slate-50">
                          {/* Col 1: Day */}
                          <div className="col-span-2 font-bold text-slate-700 text-[11px]">
                            Dia {client.billingDay > 0 ? String(client.billingDay).padStart(2, '0') : '--'}
                          </div>

                          {/* Col 2: Client Name */}
                          <div className="col-span-4 font-black text-slate-950 text-[11px] truncate uppercase pr-2" title={client.clientName}>
                            {client.clientName}
                          </div>

                          {/* Col 3: Horizontal Bar & Percentage */}
                          <div className="col-span-4 px-2 flex items-center gap-3">
                            <div className="flex-1 bg-slate-200 rounded-full h-4 relative overflow-hidden border border-slate-300">
                              <div 
                                className={cn(
                                  "h-full transition-all duration-300 rounded-full",
                                  is100 ? "bg-emerald-600" : client.percent >= 50 ? "bg-amber-500" : "bg-rose-500"
                                )}
                                style={{ width: `${Math.max(4, client.percent)}%` }}
                              />
                            </div>
                            <span className={cn(
                              "text-[10px] font-black px-2 py-0.5 rounded border shrink-0 min-w-[50px] text-center",
                              is100 ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-slate-100 text-slate-800 border-slate-300"
                            )}>
                              {client.percent}%
                            </span>
                          </div>

                          {/* Col 4: Badge & Numbers */}
                          <div className="col-span-2 text-right">
                            {is100 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-extrabold uppercase shadow-2xs">
                                100% OK
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-600 font-mono">
                                {client.executedMachines}/{client.totalMachines} máq.
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Client Observation Field */}
          <div className="mt-3">
            <div className="flex items-center gap-1.5 mb-1 text-[10px] font-black text-slate-500 uppercase tracking-wider">
              <FileText className="w-3.5 h-3.5 text-slate-600 print:hidden" />
              <span>Observações da Diretoria (Gráfico 2):</span>
            </div>

            {/* Screen Textarea */}
            <textarea
              value={clientObs}
              onChange={(e) => setClientObs(e.target.value)}
              placeholder="Digite aqui observações adicionais sobre o faturamento de clientes para saírem na folha de impressão..."
              rows={2}
              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-slate-800 print:hidden font-medium text-slate-800 resize-y"
            />

            {/* Print Rendered Observation Callout Box */}
            <div className="hidden print:block p-2.5 bg-slate-50 border border-slate-400 rounded text-[10px] text-slate-900 italic font-medium">
              <strong className="not-italic font-bold text-slate-950 uppercase block mb-0.5">Observações:</strong>
              {clientObs || 'Sem observações adicionais para este gráfico.'}
            </div>
          </div>
        </div>

        {/* Printable Footer / Signatures Block */}
        <div className="border-t-2 border-slate-900 pt-4 mt-6 text-slate-700 text-[10px] page-break-avoid">
          <div className="flex justify-between items-end">
            <div className="space-y-1 max-w-md">
              <p className="font-extrabold text-slate-950 uppercase text-[11px]">SISTEMA LE FRIO - AUTENTICAÇÃO GERENCIAL</p>
              <p className="text-[9px] text-slate-500">
                Relatório compilado automaticamente com base nos registros do aplicativo e folhas de atendimento homologadas.
              </p>
            </div>

            <div className="flex gap-12 text-center">
              <div className="w-40 border-t border-slate-800 pt-1">
                <span className="font-black text-slate-950 uppercase text-[9px] block">Diretoria Operacional</span>
                <span className="text-[8px] text-slate-500">Le Frio Refrigeração</span>
              </div>
              <div className="w-40 border-t border-slate-800 pt-1">
                <span className="font-black text-slate-950 uppercase text-[9px] block">Gerência Técnica</span>
                <span className="text-[8px] text-slate-500">Visto de Conferência</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
