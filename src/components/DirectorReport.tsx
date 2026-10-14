import React, { useState, useEffect, useMemo } from 'react';
import { Address, MaintenanceRecord, Client, MaintenanceStatus, UserProfile } from '../types';
import { dataService } from '../services/dataService';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Building2, 
  Printer, 
  Calendar, 
  Users, 
  CheckCircle2, 
  TrendingUp, 
  BarChart3, 
  FileText,
  DollarSign,
  Info,
  Clock
} from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  managerClientId?: string;
}

export function DirectorReport({ managerClientId }: Props) {
  // Mês selecionado no padrão da tela (YYYY-MM)
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));

  // Período de datas selecionado para o primeiro gráfico (Técnicos)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return format(startOfMonth(d), 'yyyy-MM-dd');
  });
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  // Estados de dados
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [monthRecords, setMonthRecords] = useState<MaintenanceRecord[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Observações adicionadas pelo usuário para saída no relatório impresso
  const [techObservations, setTechObservations] = useState<string>('');
  const [clientObservations, setClientObservations] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [month, startDate, endDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Determina quais meses precisam ser buscados para cobrir o filtro de datas
      const monthsToFetch = new Set<string>();
      monthsToFetch.add(month);

      if (startDate && endDate) {
        try {
          const sDate = parseISO(startDate);
          const eDate = parseISO(endDate);
          const sMonth = format(sDate, 'yyyy-MM');
          const eMonth = format(eDate, 'yyyy-MM');
          monthsToFetch.add(sMonth);
          monthsToFetch.add(eMonth);
        } catch {
          // ignora falha de parse
        }
      }

      const fetchedRecordsArrays = await Promise.all(
        Array.from(monthsToFetch).map(m => dataService.getRecords(m).catch(() => []))
      );

      const combinedRecords = fetchedRecordsArrays.flat();
      const recordsMap = new Map<string, MaintenanceRecord>();
      combinedRecords.forEach(r => {
        if (r && r.id) recordsMap.set(r.id, r);
      });
      const allFetchedRecords = Array.from(recordsMap.values());

      const [a, c] = await Promise.all([
        dataService.getAddresses().catch(() => []),
        dataService.getClients().catch(() => [])
      ]);

      // Filtragem para perfis com managerClientId
      const filteredAddresses = a.filter(addr => !managerClientId || addr.clientId === managerClientId);
      const addressIds = new Set(filteredAddresses.map(addr => addr.id));

      const validRecords = allFetchedRecords.filter(rec => addressIds.has(rec.addressId));

      setRecords(validRecords);
      setMonthRecords(validRecords.filter(rec => rec.month === month));
      setAddresses(filteredAddresses);
      setClients(c.filter(client => !managerClientId || client.id === managerClientId));
    } catch (error) {
      console.error("Erro ao carregar dados do relatório da diretoria:", error);
    } finally {
      setLoading(false);
    }
  };

  // 1. DADOS DOS TÉCNICOS (3 COLUNAS: Nome | Período Selecionado | Total do Mês)
  const technicianStats = useMemo(() => {
    const techMap = new Map<string, {
      name: string;
      periodMachines: number;
      monthMachines: number;
    }>();

    const addTechCount = (techName: string, periodQty: number, monthQty: number) => {
      if (!techName || techName.trim() === '') return;
      const cleanName = techName.trim();
      const existing = techMap.get(cleanName) || { name: cleanName, periodMachines: 0, monthMachines: 0 };
      existing.periodMachines += periodQty;
      existing.monthMachines += monthQty;
      techMap.set(cleanName, existing);
    };

    // a) Mapeamento por Mês
    monthRecords.forEach(rec => {
      const isCompleted = rec.status === MaintenanceStatus.COMPLETED || rec.status === MaintenanceStatus.PRE_COMPLETED || (rec.executedQuantity || 0) > 0;
      if (isCompleted && rec.executedQuantity && rec.executedQuantity > 0) {
        if (rec.technician1) addTechCount(rec.technician1, 0, rec.executedQuantity);
        if (rec.technician2) addTechCount(rec.technician2, 0, rec.executedQuantity);
      }
    });

    // b) Mapeamento por Período de Datas (startDate a endDate)
    let sTime = 0;
    let eTime = Infinity;
    if (startDate) {
      try { sTime = new Date(startDate + 'T00:00:00').getTime(); } catch {}
    }
    if (endDate) {
      try { eTime = new Date(endDate + 'T23:59:59').getTime(); } catch {}
    }

    records.forEach(rec => {
      const isCompleted = rec.status === MaintenanceStatus.COMPLETED || rec.status === MaintenanceStatus.PRE_COMPLETED || (rec.executedQuantity || 0) > 0;
      if (isCompleted && rec.executedQuantity && rec.executedQuantity > 0) {
        // Verifica data do registro
        const recDateStr = rec.executionDate || rec.completionDate || rec.plannedDate;
        let recTime = 0;
        if (recDateStr) {
          try {
            const cleanStr = recDateStr.split('T')[0];
            recTime = new Date(cleanStr + 'T12:00:00').getTime();
          } catch {}
        }

        if (recTime >= sTime && recTime <= eTime) {
          if (rec.technician1) addTechCount(rec.technician1, rec.executedQuantity, 0);
          if (rec.technician2) addTechCount(rec.technician2, rec.executedQuantity, 0);
        }
      }
    });

    // Converter para array e filtrar técnicos sem nenhuma máquina (periodMachines === 0 E monthMachines === 0)
    let list = Array.from(techMap.values()).filter(t => t.periodMachines > 0 || t.monthMachines > 0);

    // Ordenar: No topo fica quem fez MAIS no período, no fundo quem fez menos
    list.sort((a, b) => {
      if (b.periodMachines !== a.periodMachines) {
        return b.periodMachines - a.periodMachines;
      }
      return b.monthMachines - a.monthMachines;
    });

    return list;
  }, [records, monthRecords, startDate, endDate]);

  // Maior quantidade de máquinas no período para definir proporção da barra
  const maxPeriodMachines = useMemo(() => {
    if (technicianStats.length === 0) return 1;
    return Math.max(...technicianStats.map(t => t.periodMachines), 1);
  }, [technicianStats]);

  // 2. DADOS DOS CLIENTES AGRUPADOS POR DATA DE FATURAMENTO
  const clientsByBillingGroup = useMemo(() => {
    // Agrupa clientes por dia de faturamento
    const groupMap = new Map<number, {
      billingDay: number;
      clients: {
        id: string;
        name: string;
        totalContractMachines: number;
        executedMachines: number;
        percentage: number;
        isFullyCompleted: boolean;
        totalAddresses: number;
        completedAddresses: number;
      }[];
    }>();

    // Endereços indexados por cliente
    const clientAddresses = new Map<string, Address[]>();
    addresses.forEach(addr => {
      if (!addr.clientId) return;
      const list = clientAddresses.get(addr.clientId) || [];
      list.push(addr);
      clientAddresses.set(addr.clientId, list);
    });

    // Registros concluídos no mês selecionado
    const recordsByAddress = new Map<string, MaintenanceRecord>();
    monthRecords.forEach(r => {
      if (r.executedQuantity && r.executedQuantity > 0) {
        recordsByAddress.set(r.addressId, r);
      }
    });

    clients.forEach(client => {
      const addrs = clientAddresses.get(client.id) || [];
      if (addrs.length === 0) return; // ignora clientes sem endereços

      // Total de máquinas contratadas no cliente
      const totalContractMachines = addrs.reduce((sum, a) => sum + (a.totalMachines || 0), 0);

      // Total de máquinas executadas no cliente no mês
      let executedMachines = 0;
      let completedAddresses = 0;

      addrs.forEach(a => {
        const rec = recordsByAddress.get(a.id);
        if (rec) {
          executedMachines += rec.executedQuantity || 0;
          completedAddresses++;
        }
      });

      // Cálculo de porcentagem de conclusão
      let percentage = 0;
      if (totalContractMachines > 0) {
        percentage = Math.min(100, Math.round((executedMachines / totalContractMachines) * 100));
      } else if (addrs.length > 0) {
        percentage = Math.min(100, Math.round((completedAddresses / addrs.length) * 100));
      }

      const isFullyCompleted = percentage >= 100;
      const bDay = client.billingDay || 0;

      const group = groupMap.get(bDay) || { billingDay: bDay, clients: [] };
      group.clients.push({
        id: client.id,
        name: client.fullName || client.name,
        totalContractMachines,
        executedMachines,
        percentage,
        isFullyCompleted,
        totalAddresses: addrs.length,
        completedAddresses
      });
      groupMap.set(bDay, group);
    });

    // Transforma em array e ordena por dia de faturamento (0 = Não Informado vai pro final)
    const sortedGroups = Array.from(groupMap.values()).sort((a, b) => {
      const dayA = a.billingDay === 0 ? 999 : a.billingDay;
      const dayB = b.billingDay === 0 ? 999 : b.billingDay;
      return dayA - dayB;
    });

    // Dentro de cada grupo, ordena os clientes: 100% primeiro, depois por porcentagem e nome
    sortedGroups.forEach(g => {
      g.clients.sort((a, b) => {
        if (b.percentage !== a.percentage) return b.percentage - a.percentage;
        return a.name.localeCompare(b.name);
      });
    });

    return sortedGroups;
  }, [monthRecords, addresses, clients]);

  // Totais Resumidos para os Diretores
  const executiveSummary = useMemo(() => {
    const totalClients = clients.length;
    const totalContractMachines = addresses.reduce((sum, a) => sum + (a.totalMachines || 0), 0);
    const totalExecutedMachines = monthRecords.reduce((sum, r) => sum + (r.executedQuantity || 0), 0);
    const globalPercentage = totalContractMachines > 0 ? Math.round((totalExecutedMachines / totalContractMachines) * 100) : 0;
    
    // Total de técnicos ativos que executaram máquinas
    const activeTechsCount = technicianStats.length;

    return {
      totalClients,
      totalContractMachines,
      totalExecutedMachines,
      globalPercentage,
      activeTechsCount
    };
  }, [clients, addresses, monthRecords, technicianStats]);

  return (
    <div className="space-y-8 print:space-y-4 print:p-0">
      {/* Estilos CSS Específicos para Impressão A4 */}
      <style>{`
        @media print {
          aside, nav, header, button, input, select, textarea, .no-print, .print\\:hidden, [role="navigation"] {
            display: none !important;
          }
          body, #root, main, .container {
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            box-shadow: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 1.2cm 1cm 1.2cm 1cm;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .a4-card {
            border: 1px solid #e5e7eb !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
          }
          .print-obs-box {
            display: block !important;
            border: 1px solid #d1d5db !important;
            background-color: #f9fafb !important;
            padding: 10px !important;
            border-radius: 8px !important;
            font-size: 11px !important;
            color: #374151 !important;
            margin-top: 10px !important;
          }
        }
      `}</style>

      {/* CABEÇALHO DA TELA (Controles / Filtros) - Oculto na Impressão */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm print:hidden space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                Relatório Executivo da Diretoria
              </h2>
              <p className="text-sm text-gray-500">
                Resumo estratégico semanal de produção técnica e faturamento para os diretores.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-blue-200"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Relatório A4</span>
            </button>
          </div>
        </div>

        {/* PAINEL DE FILTROS DE DATA */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Mês de Referência (Padrão)
            </label>
            <input 
              type="month" 
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Filtro de Data Inicial (Gráfico Período)
            </label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Filtro de Data Final (Gráfico Período)
            </label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 outline-none"
            />
          </div>
        </div>
      </div>

      {/* DOCUMENTO IMPRESSO A4 / VISUALIZAÇÃO EXECUTIVA */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 print:p-0 print:border-0 print:shadow-none space-y-6">

        {/* CABEÇALHO OFICIAL A4 PARA A DIRETORIA */}
        <div className="border-b-2 border-gray-800 pb-4 flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-blue-900 tracking-tight uppercase">LE FRIO REFRIGERAÇÃO</span>
            </div>
            <h1 className="text-lg font-bold text-gray-800 uppercase tracking-wide">
              RELATÓRIO EXECUTIVO PARA A DIRETORIA
            </h1>
            <p className="text-xs text-gray-500 font-medium">
              Visão Ampla e Resumida de Manutenções Preventivas e Faturamento
            </p>
          </div>

          <div className="text-right space-y-1">
            <div className="inline-block px-3 py-1 bg-gray-100 rounded-md border border-gray-200 text-xs font-black text-gray-800">
              MÊS: <span className="uppercase">{format(new Date(month + '-01T12:00:00'), 'MMMM / yyyy', { locale: ptBR })}</span>
            </div>
            <p className="text-[11px] text-gray-600 font-semibold">
              Período Analisado: {startDate ? format(parseISO(startDate), 'dd/MM/yyyy') : '-'} até {endDate ? format(parseISO(endDate), 'dd/MM/yyyy') : '-'}
            </p>
            <p className="text-[10px] text-gray-400">Emissão: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>

        {/* METRICAS CHAVE / KPI CARDS */}
        <div className="grid grid-cols-4 gap-3 print:gap-2">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Máquinas do Mês</p>
            <p className="text-lg font-black text-slate-900 tabular-nums">{executiveSummary.totalExecutedMachines} <span className="text-xs font-normal text-slate-500">/ {executiveSummary.totalContractMachines}</span></p>
          </div>
          <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-center">
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Meta Concluída</p>
            <p className="text-lg font-black text-emerald-900 tabular-nums">{executiveSummary.globalPercentage}%</p>
          </div>
          <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 text-center">
            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Técnicos em Ação</p>
            <p className="text-lg font-black text-blue-900 tabular-nums">{executiveSummary.activeTechsCount}</p>
          </div>
          <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200 text-center">
            <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Total de Clientes</p>
            <p className="text-lg font-black text-indigo-900 tabular-nums">{executiveSummary.totalClients}</p>
          </div>
        </div>

        {/* CARREGANDO OU CONTEÚDO */}
        {loading ? (
          <div className="flex items-center justify-center py-16 print:hidden">
            <div className="w-8 h-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-8 print:space-y-6">

            {/* 1. PRIMEIRO GRÁFICO: TÉCNICOS COM MANUTENÇÃO PREVENTIVA */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm a4-card space-y-4">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    1. Produtividade dos Técnicos (Manutenções Preventivas)
                  </h3>
                  <p className="text-xs text-gray-500">
                    Ordenado do maior para o menor no período. Exibindo apenas técnicos com máquinas executadas.
                  </p>
                </div>
                <div className="text-right text-xs font-semibold text-gray-500 print:text-black">
                  <span className="inline-block w-3 h-3 bg-blue-600 rounded-sm mr-1 align-middle"></span> Período Selecionado
                </div>
              </div>

              {technicianStats.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm italic">
                  Nenhuma manutenção preventiva registrada para técnicos no período selecionado.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Cabeçalho de Colunas do Gráfico (3 Colunas) */}
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-black uppercase text-gray-400 tracking-wider pb-1 border-b border-gray-100">
                    <div className="col-span-3">Nome do Técnico</div>
                    <div className="col-span-6">Período ({startDate ? format(parseISO(startDate), 'dd/MM') : ''} a {endDate ? format(parseISO(endDate), 'dd/MM') : ''})</div>
                    <div className="col-span-3 text-right">Total do Mês ({format(new Date(month + '-01T12:00:00'), 'MMM/yy', { locale: ptBR })})</div>
                  </div>

                  {/* Lista de Barras de Técnicos */}
                  {technicianStats.map((tech) => {
                    const barWidthPct = Math.max(5, Math.min(100, Math.round((tech.periodMachines / maxPeriodMachines) * 100)));

                    return (
                      <div key={tech.name} className="grid grid-cols-12 gap-2 items-center text-xs py-1 hover:bg-gray-50 rounded-lg transition-colors">
                        {/* Coluna 1: Nome do Técnico */}
                        <div className="col-span-3 font-bold text-gray-800 truncate" title={tech.name}>
                          {tech.name}
                        </div>

                        {/* Coluna 2: Barra Indicativa Proporcional no Período */}
                        <div className="col-span-6 flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 h-6 rounded-md overflow-hidden relative border border-gray-200">
                            <div 
                              className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-sm transition-all duration-300 flex items-center justify-end pr-2"
                              style={{ width: `${barWidthPct}%` }}
                            >
                              {barWidthPct > 25 && (
                                <span className="text-[10px] font-bold text-white tabular-nums">
                                  {tech.periodMachines}
                                </span>
                              )}
                            </div>
                          </div>
                          {barWidthPct <= 25 && (
                            <span className="text-xs font-bold text-blue-900 tabular-nums min-w-[24px]">
                              {tech.periodMachines}
                            </span>
                          )}
                        </div>

                        {/* Coluna 3: Total do Mês (Independente do filtro de período) */}
                        <div className="col-span-3 text-right">
                          <span className="inline-flex items-center gap-1 font-black text-gray-900 bg-gray-100 px-2.5 py-1 rounded-md border border-gray-200 tabular-nums">
                            {tech.monthMachines} <span className="text-[10px] font-normal text-gray-500">máq.</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* CAMPO DE OBSERVAÇÕES PARA O GRÁFICO 1 (TÉCNICOS) */}
              <div className="pt-2">
                <label className="block text-xs font-bold text-gray-700 mb-1 print:hidden">
                  Observações para a Diretoria (Técnicos):
                </label>
                <textarea
                  value={techObservations}
                  onChange={(e) => setTechObservations(e.target.value)}
                  placeholder="Digite aqui observações relevantes sobre o desempenho dos técnicos para este relatório..."
                  rows={2}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none print:hidden bg-gray-50/50"
                />

                {/* Exibição Formatada na Impressão e na Tela se Houver Texto */}
                {techObservations.trim() && (
                  <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs text-amber-950 mt-2 print-obs-box">
                    <span className="font-bold text-amber-900 block mb-1 uppercase tracking-wider text-[10px]">
                      Observações da Diretoria (Técnicos):
                    </span>
                    <p className="whitespace-pre-wrap">{techObservations}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 2. SEGUNDO GRÁFICO: CLIENTES AGRUPADOS POR DATA DE FATURAMENTO */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm a4-card space-y-4">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                    2. Status de Conclusão por Data de Faturamento
                  </h3>
                  <p className="text-xs text-gray-500">
                    Clientes agrupados por ciclo de faturamento com percentual de máquinas concluídas no mês.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                    100% Concluído (Verde)
                  </span>
                </div>
              </div>

              {clientsByBillingGroup.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm italic">
                  Nenhum cliente cadastrado no período.
                </div>
              ) : (
                <div className="space-y-6">
                  {clientsByBillingGroup.map((group) => (
                    <div key={`billing-group-${group.billingDay}`} className="space-y-2 border-b border-gray-100 pb-4 last:border-0">
                      {/* Título do Grupo de Faturamento */}
                      <div className="flex items-center justify-between bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                        <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-600" />
                          {group.billingDay > 0 ? `Faturamento: Dia ${group.billingDay}` : 'Faturamento: Não Informado'}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">
                          {group.clients.length} cliente(s)
                        </span>
                      </div>

                      {/* Lista de Clientes do Grupo */}
                      <div className="space-y-2 pt-1">
                        {group.clients.map((client) => {
                          return (
                            <div key={client.id} className="grid grid-cols-12 gap-2 items-center text-xs py-1">
                              {/* Nome do Cliente */}
                              <div className="col-span-4 font-bold text-gray-800 truncate" title={client.name}>
                                {client.name}
                              </div>

                              {/* Barra de Progresso do Percentual de Conclusão */}
                              <div className="col-span-5 flex items-center gap-2">
                                <div className="flex-1 bg-gray-100 h-5 rounded-md overflow-hidden relative border border-gray-200">
                                  <div 
                                    className={cn(
                                      "h-full rounded-sm transition-all duration-300 flex items-center justify-end pr-1.5",
                                      client.isFullyCompleted 
                                        ? "bg-emerald-500" 
                                        : client.percentage > 50 
                                          ? "bg-blue-600" 
                                          : "bg-amber-500"
                                    )}
                                    style={{ width: `${Math.max(5, client.percentage)}%` }}
                                  >
                                    {client.percentage >= 20 && (
                                      <span className="text-[10px] font-bold text-white tabular-nums">
                                        {client.percentage}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {client.percentage < 20 && (
                                  <span className={cn(
                                    "text-xs font-bold tabular-nums",
                                    client.isFullyCompleted ? "text-emerald-700" : "text-gray-700"
                                  )}>
                                    {client.percentage}%
                                  </span>
                                )}
                              </div>

                              {/* Quantidade Detalhada e Status Verde se 100% */}
                              <div className="col-span-3 text-right flex items-center justify-end gap-1.5">
                                <span className="text-[11px] font-bold text-gray-700 tabular-nums">
                                  {client.executedMachines} / {client.totalContractMachines || '-'} <span className="text-[9px] font-normal text-gray-400">máq.</span>
                                </span>
                                {client.isFullyCompleted && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-black text-[9px] uppercase tracking-wider">
                                    <CheckCircle2 className="w-3 h-3 mr-0.5 text-emerald-600" />
                                    100%
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* CAMPO DE OBSERVAÇÕES PARA O GRÁFICO 2 (CLIENTES / FATURAMENTO) */}
              <div className="pt-2">
                <label className="block text-xs font-bold text-gray-700 mb-1 print:hidden">
                  Observações para a Diretoria (Clientes & Faturamento):
                </label>
                <textarea
                  value={clientObservations}
                  onChange={(e) => setClientObservations(e.target.value)}
                  placeholder="Digite aqui observações relevantes sobre o faturamento dos clientes para os diretores..."
                  rows={2}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 outline-none print:hidden bg-gray-50/50"
                />

                {/* Exibição Formatada na Impressão e na Tela se Houver Texto */}
                {clientObservations.trim() && (
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-950 mt-2 print-obs-box">
                    <span className="font-bold text-emerald-900 block mb-1 uppercase tracking-wider text-[10px]">
                      Observações da Diretoria (Clientes & Faturamento):
                    </span>
                    <p className="whitespace-pre-wrap">{clientObservations}</p>
                  </div>
                )}
              </div>
            </div>

            {/* RODAPÉ E ASSINATURAS DO RELATÓRIO A4 IMPRESSO */}
            <div className="pt-6 border-t border-gray-200 hidden print:block space-y-8">
              <div className="grid grid-cols-2 gap-12 text-center pt-8">
                <div>
                  <div className="border-b border-gray-400 w-3/4 mx-auto mb-1"></div>
                  <p className="text-xs font-bold text-gray-800 uppercase">Gestão Operacional LE FRIO</p>
                  <p className="text-[10px] text-gray-500">Elaborado por</p>
                </div>
                <div>
                  <div className="border-b border-gray-400 w-3/4 mx-auto mb-1"></div>
                  <p className="text-xs font-bold text-gray-800 uppercase">Diretoria Executiva</p>
                  <p className="text-[10px] text-gray-500">Aprovado por</p>
                </div>
              </div>

              <p className="text-[9px] text-center text-gray-400 italic">
                Relatório gerado automaticamente pelo Sistema de Gestão LE FRIO. Documento interno reservado à diretoria.
              </p>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
