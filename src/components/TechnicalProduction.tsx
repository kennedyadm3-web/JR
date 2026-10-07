import React, { useState, useEffect, useMemo } from 'react';
import { Address, MaintenanceRecord, Technician, Client, ServiceOrder, ServiceOrderSettings, MaintenanceStatus } from '../types';
import { dataService } from '../services/dataService';
import { format, parseISO, subDays, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Calculator, User, Calendar as CalendarIcon, Calendar, CheckCircle, HandCoins, 
  Printer, Plus, Trash2, AlertCircle, ArrowUpCircle, ArrowDownCircle, 
  Wrench, SlidersHorizontal, Search, FileText, Tag, ChevronDown, 
  ChevronUp, Check, DollarSign, Layers, ShieldCheck, Clock
} from 'lucide-react';
import { cn } from '../lib/utils';

interface Penalty {
  id: string;
  description: string;
  value: number;
  type: 'discount' | 'bonus';
  createdAt?: string;
}

export function TechnicalProduction({ managerClientId }: { managerClientId?: string }) {
  // Modo de filtro de data: 'month' (por mês - padrão) ou 'period' (período personalizado)
  const [dateFilterType, setDateFilterType] = useState<'month' | 'period'>('month');
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  
  // Período personalizado de datas (De ... Até ...)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return format(new Date(d.getFullYear(), d.getMonth(), 1), 'yyyy-MM-dd');
  });
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');
  
  // Preço por máquina de preventiva
  const [pricePerMachine, setPricePerMachine] = useState<number | ''>('');
  
  // Tabela de preços de O.S. por tipo
  const [osPrices, setOsPrices] = useState<Record<string, number>>({});
  const [isPricingPanelOpen, setIsPricingPanelOpen] = useState(false);
  const [pricingSaveMessage, setPricingSaveMessage] = useState<string | null>(null);

  // Ajustes (Bônus e Descontos)
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [newPenaltyDesc, setNewPenaltyDesc] = useState('');
  const [newPenaltyValue, setNewPenaltyValue] = useState<number | ''>('');
  const [newPenaltyType, setNewPenaltyType] = useState<'discount' | 'bonus'>('discount');
  
  // Dados principais
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [maintenanceTypes, setMaintenanceTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros de visualização da tabela
  const [viewFilter, setViewFilter] = useState<'all' | 'preventive' | 'service_order'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, [month, dateFilterType, startDate, endDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      let recordsPromise: Promise<MaintenanceRecord[]>;
      
      if (dateFilterType === 'period' && startDate && endDate) {
        try {
          const s = parseISO(startDate + 'T12:00:00');
          const e = parseISO(endDate + 'T12:00:00');
          const mSet = new Set<string>();
          let curr = s;
          while (curr <= e) {
            mSet.add(format(curr, 'yyyy-MM'));
            curr = addDays(curr, 28);
          }
          mSet.add(format(e, 'yyyy-MM'));
          const monthsToFetch = Array.from(mSet);
          recordsPromise = Promise.all(monthsToFetch.map(m => dataService.getRecords(m).catch(() => [])))
            .then(arrays => {
              const combined = arrays.flat();
              const map = new Map<string, MaintenanceRecord>();
              combined.forEach(r => { if (r && r.id) map.set(r.id, r); });
              return Array.from(map.values());
            });
        } catch {
          recordsPromise = dataService.getRecords(month).catch(() => []);
        }
      } else {
        recordsPromise = dataService.getRecords(month).catch(() => []);
      }

      const [techs, a, r, c, orders, settings] = await Promise.all([
        dataService.getTechnicians().catch(() => []),
        dataService.getAddresses().catch(() => []),
        recordsPromise,
        dataService.getClients().catch(() => []),
        dataService.getServiceOrders().catch(() => []),
        dataService.getServiceOrderSettings().catch(() => null)
      ]);
      
      // Filtra endereços se houver cliente gerente
      const filteredAddresses = a.filter(addr => !managerClientId || addr.clientId === managerClientId);
      const addressIds = new Set(filteredAddresses.map(addr => addr.id));
      
      setAddresses(filteredAddresses);
      setTechnicians(techs);
      setRecords(r.filter(rec => addressIds.has(rec.addressId)));
      setClients(c);
      setServiceOrders(orders);
      
      // Tipos de manutenção conhecidos
      const defaultTypes = [
        'MANUTENCAO CORRETIVA CONTRATO',
        'JATEAMENTO',
        'MANUTENCAO PREVENTIVA',
        'INSTALACAO',
        'AVALIAÇÃO TÉCNICA'
      ];
      const configuredTypes = settings?.maintenanceTypes || [];
      const orderTypes = (orders || []).map(o => (o.type || '').trim().toUpperCase()).filter(Boolean);
      const mergedTypes = Array.from(new Set([...defaultTypes, ...configuredTypes, ...orderTypes]));
      setMaintenanceTypes(mergedTypes);
      
      if (techs.length > 0 && !selectedTechnician) {
        setSelectedTechnician(techs[0].name);
      }
    } catch (error) {
      console.error('Erro ao carregar dados de produção técnica:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTechnician) {
      const targetMonth = dateFilterType === 'period' && startDate ? startDate.substring(0, 7) : month;
      dataService.getAdjustments(selectedTechnician, targetMonth).then(adjustments => {
        setPenalties(adjustments as any);
      }).catch(err => {
        console.error('Erro ao buscar ajustes:', err);
        setPenalties([]);
      });
    } else {
      setPenalties([]);
    }
  }, [selectedTechnician, month, dateFilterType, startDate]);

  const selectedTechObj = useMemo(() => {
    return technicians.find(t => t.name === selectedTechnician);
  }, [technicians, selectedTechnician]);

  // Carrega e sincroniza os preços do técnico selecionado
  useEffect(() => {
    if (selectedTechObj) {
      setPricePerMachine(selectedTechObj.pricePerMachine ?? '');
      
      // Carrega preços de OS já salvos no técnico ou cria defaults
      const savedPrices: Record<string, number> = { ...(selectedTechObj.serviceOrderPrices || {}) };
      
      // Fallbacks se houver campos legados
      if (savedPrices['MANUTENCAO CORRETIVA CONTRATO'] === undefined && selectedTechObj.pricePerCorrectiveOS !== undefined) {
        savedPrices['MANUTENCAO CORRETIVA CONTRATO'] = selectedTechObj.pricePerCorrectiveOS;
      }
      if (savedPrices['JATEAMENTO'] === undefined && selectedTechObj.pricePerJettingOS !== undefined) {
        savedPrices['JATEAMENTO'] = selectedTechObj.pricePerJettingOS;
      }

      setOsPrices(savedPrices);
    } else {
      setPricePerMachine('');
      setOsPrices({});
    }
  }, [selectedTechObj]);

  // Atualização rápida do preço por máquina (Preventiva)
  const handlePricePerMachineBlur = async () => {
    if (selectedTechObj && selectedTechObj.id) {
      const priceVal = pricePerMachine === '' ? 0 : Number(pricePerMachine);
      if (priceVal !== (selectedTechObj.pricePerMachine ?? 0)) {
        try {
          await dataService.updateTechnicianPrices(selectedTechObj.id, {
            pricePerMachine: priceVal
          });
          setTechnicians(prev => prev.map(t => 
            t.id === selectedTechObj.id 
              ? { ...t, pricePerMachine: priceVal }
              : t
          ));
          showSaveFeedback('Preço por máquina preventiva atualizado com sucesso!');
        } catch (error) {
          console.error("Erro ao atualizar preço de máquina do técnico:", error);
        }
      }
    }
  };

  // Atualização do preço de um tipo específico de O.S.
  const handleOsPriceChange = (type: string, value: string) => {
    const num = value === '' ? 0 : Number(value);
    setOsPrices(prev => ({
      ...prev,
      [type]: num
    }));
  };

  // Salvar todos os preços configurados no cadastro do técnico no Firestore
  const handleSaveAllPrices = async () => {
    if (!selectedTechObj || !selectedTechObj.id) return;
    try {
      const cleanPrices: Record<string, number> = {};
      Object.entries(osPrices).forEach(([k, v]) => {
        if (!isNaN(v) && v >= 0) {
          cleanPrices[k] = v;
        }
      });

      const priceVal = pricePerMachine === '' ? 0 : Number(pricePerMachine);

      await dataService.updateTechnicianPrices(selectedTechObj.id, {
        pricePerMachine: priceVal,
        serviceOrderPrices: cleanPrices,
        pricePerCorrectiveOS: cleanPrices['MANUTENCAO CORRETIVA CONTRATO'] || 0,
        pricePerJettingOS: cleanPrices['JATEAMENTO'] || 0
      });

      setTechnicians(prev => prev.map(t => 
        t.id === selectedTechObj.id 
          ? { 
              ...t, 
              pricePerMachine: priceVal, 
              serviceOrderPrices: cleanPrices,
              pricePerCorrectiveOS: cleanPrices['MANUTENCAO CORRETIVA CONTRATO'] || 0,
              pricePerJettingOS: cleanPrices['JATEAMENTO'] || 0
            }
          : t
      ));

      showSaveFeedback('Tabela de valores salva com sucesso no cadastro do técnico!');
    } catch (error) {
      console.error('Erro ao salvar preços no técnico:', error);
      alert('Erro ao salvar preços no banco de dados.');
    }
  };

  const showSaveFeedback = (msg: string) => {
    setPricingSaveMessage(msg);
    setTimeout(() => {
      setPricingSaveMessage(null);
    }, 3500);
  };

  // Helper para extrair o Mês/Ano de Abertura da O.S. de qualquer formato
  const extractYearMonth = (dateVal: any): { yearMonth: string | null; dateIso: string } => {
    if (!dateVal) return { yearMonth: null, dateIso: new Date().toISOString() };

    // Firestore Timestamp com toDate()
    if (typeof dateVal?.toDate === 'function') {
      try {
        const d = dateVal.toDate();
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          return { yearMonth: `${y}-${m}`, dateIso: d.toISOString() };
        }
      } catch {}
    }

    // Objeto com seconds / _seconds
    if (typeof dateVal === 'object' && (dateVal.seconds || dateVal._seconds)) {
      const sec = dateVal.seconds || dateVal._seconds;
      const d = new Date(sec * 1000);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return { yearMonth: `${y}-${m}`, dateIso: d.toISOString() };
      }
    }

    // String
    if (typeof dateVal === 'string') {
      const trimmed = dateVal.trim();
      const isoMatch = trimmed.match(/^(\d{4})-(\d{2})/);
      if (isoMatch) {
        return { yearMonth: `${isoMatch[1]}-${isoMatch[2]}`, dateIso: trimmed };
      }
      const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (brMatch) {
        const dStr = `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}T12:00:00`;
        return { yearMonth: `${brMatch[3]}-${brMatch[2]}`, dateIso: dStr };
      }
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return { yearMonth: `${y}-${m}`, dateIso: d.toISOString() };
      }
    }

    // Número (timestamp em ms)
    if (typeof dateVal === 'number') {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return { yearMonth: `${y}-${m}`, dateIso: d.toISOString() };
      }
    }

    return { yearMonth: null, dateIso: new Date().toISOString() };
  };

  // Helper para extrair data pura YYYY-MM-DD com segurança
  const extractDateOnlyStr = (dateVal: any): string => {
    if (!dateVal) return '';
    if (typeof dateVal === 'string') {
      const trimmed = dateVal.trim();
      if (trimmed.match(/^\d{4}-\d{2}-\d{2}/)) {
        return trimmed.substring(0, 10);
      }
      const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (brMatch) {
        return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
      }
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
      return '';
    }
    if (typeof dateVal?.toDate === 'function') {
      try {
        return dateVal.toDate().toISOString().split('T')[0];
      } catch {}
    }
    if (typeof dateVal === 'object' && (dateVal.seconds || dateVal._seconds)) {
      const sec = dateVal.seconds || dateVal._seconds;
      return new Date(sec * 1000).toISOString().split('T')[0];
    }
    if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
      return dateVal.toISOString().split('T')[0];
    }
    if (typeof dateVal === 'number') {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    return '';
  };

  // Para Ordens de Serviço: REGRA MANDATÓRIA -> "no caso das ordens de serviço a data a ser considerada é a data de finalização"
  const getOSFinalizationDateOnly = (o: ServiceOrder): string => {
    const anyOrder = o as any;
    const rawDate = o.finishedAt || 
                    o.adminFinalizedAt || 
                    o.techFinalizedAt || 
                    o.clientSignatureDate || 
                    anyOrder.finalizedAt || 
                    anyOrder.closedAt ||
                    anyOrder.completedAt ||
                    (o.status === 'finalizada' ? o.updatedAt : undefined);
    return extractDateOnlyStr(rawDate);
  };

  // Para Manutenções Preventivas: data em que o serviço foi realizado
  const getPreventiveExecutionDateOnly = (r: MaintenanceRecord): string => {
    const rawDate = r.executionDate || r.completionDate || r.clientSignatureDate || r.approvedAt || r.plannedDate;
    return extractDateOnlyStr(rawDate);
  };

  // Helper para verificar se a O.S. pertence ao técnico selecionado
  const isOrderAssignedToTech = (
    o: ServiceOrder,
    targetTechId: string,
    targetTechName: string,
    allTechs: Technician[]
  ): boolean => {
    const nameLower = targetTechName.trim().toLowerCase();
    if (!nameLower) return false;

    // 1. technicianId direto por ID ou Nome
    if (o.technicianId) {
      const t1Id = o.technicianId.trim().toLowerCase();
      if (t1Id === targetTechId.toLowerCase() || t1Id === nameLower) return true;
      const matchedTech = allTechs.find(t => t.id === o.technicianId);
      if (matchedTech && matchedTech.name.trim().toLowerCase() === nameLower) return true;
    }

    // 2. technician2Id direto por ID ou Nome
    if (o.technician2Id) {
      const t2Id = o.technician2Id.trim().toLowerCase();
      if (t2Id === targetTechId.toLowerCase() || t2Id === nameLower) return true;
      const matchedTech2 = allTechs.find(t => t.id === o.technician2Id);
      if (matchedTech2 && matchedTech2.name.trim().toLowerCase() === nameLower) return true;
    }

    // 3. Equipe Autenticada (JDSmartOS / Mobile / Tablet)
    if (o.authenticatedTeam && o.authenticatedTeam.toLowerCase().includes(nameLower)) {
      return true;
    }

    // 4. Campos legados ou variações (technicianName, technician, tecnico)
    const anyOrder = o as any;
    if (anyOrder.technicianName && typeof anyOrder.technicianName === 'string' && anyOrder.technicianName.toLowerCase().includes(nameLower)) {
      return true;
    }
    if (anyOrder.technician && typeof anyOrder.technician === 'string' && anyOrder.technician.toLowerCase().includes(nameLower)) {
      return true;
    }
    if (anyOrder.tecnico && typeof anyOrder.tecnico === 'string' && anyOrder.tecnico.toLowerCase().includes(nameLower)) {
      return true;
    }
    if (anyOrder.techName && typeof anyOrder.techName === 'string' && anyOrder.techName.toLowerCase().includes(nameLower)) {
      return true;
    }

    // 5. Aberto por (openedBy)
    if (o.openedBy && o.openedBy.toLowerCase().trim() === nameLower) {
      return true;
    }

    return false;
  };

  // Helper para calcular o valor unitário da O.S. pelo tipo
  const resolveOsPrice = (
    typeRaw: string | undefined, 
    pricesTable: Record<string, number>, 
    techObj?: Technician | null
  ): number => {
    const cleanType = (typeRaw || 'MANUTENCAO CORRETIVA CONTRATO').trim().toUpperCase();

    // 1. Busca exata na tabela de preços
    if (pricesTable[cleanType] !== undefined && !isNaN(pricesTable[cleanType])) {
      return Number(pricesTable[cleanType]);
    }

    // 2. Busca case-insensitive na tabela de preços
    for (const [k, v] of Object.entries(pricesTable)) {
      if (k.trim().toUpperCase() === cleanType && !isNaN(v)) {
        return Number(v);
      }
    }

    // 3. Fallbacks por categoria
    if (cleanType.includes('JATEAMENTO')) {
      if (pricesTable['JATEAMENTO'] !== undefined) return Number(pricesTable['JATEAMENTO']);
      if (techObj?.pricePerJettingOS !== undefined && techObj.pricePerJettingOS > 0) return Number(techObj.pricePerJettingOS);
    }

    if (cleanType.includes('CORRETIVA')) {
      if (pricesTable['MANUTENCAO CORRETIVA CONTRATO'] !== undefined) return Number(pricesTable['MANUTENCAO CORRETIVA CONTRATO']);
      if (pricesTable['CORRETIVA'] !== undefined) return Number(pricesTable['CORRETIVA']);
      if (techObj?.pricePerCorrectiveOS !== undefined && techObj.pricePerCorrectiveOS > 0) return Number(techObj.pricePerCorrectiveOS);
    }

    if (cleanType.includes('INSTALA')) {
      if (pricesTable['INSTALACAO'] !== undefined) return Number(pricesTable['INSTALACAO']);
      if (pricesTable['INSTALAÇÃO'] !== undefined) return Number(pricesTable['INSTALAÇÃO']);
    }

    if (cleanType.includes('AVALIA')) {
      if (pricesTable['AVALIAÇÃO TÉCNICA'] !== undefined) return Number(pricesTable['AVALIAÇÃO TÉCNICA']);
      if (pricesTable['AVALIACAO TECNICA'] !== undefined) return Number(pricesTable['AVALIACAO TECNICA']);
    }

    return 0;
  };

  // Cálculo consolidado de Produção Técnica (Preventivas + Ordens de Serviço)
  const productionStats = useMemo(() => {
    if (!selectedTechnician) {
      return { 
        items: [], 
        totalLocations: 0, 
        totalMachines: 0, 
        totalPreventiveValue: 0, 
        totalServiceOrders: 0, 
        totalServiceOrderValue: 0,
        totalDiscounts: 0, 
        totalBonuses: 0, 
        totalGrossValue: 0,
        netValue: 0,
        ordersByTypeCount: {} as Record<string, number>
      };
    }

    const techId = selectedTechObj?.id || '';
    const techNameClean = selectedTechnician.trim();

    // 1. FILTRAR REGISTROS DE PREVENTIVA (PMOC) CONCLUÍDOS
    const techNameLower = techNameClean.toLowerCase();
    const techRecords = records.filter(r => 
      (r.technician1 && r.technician1.trim().toLowerCase() === techNameLower) || 
      (r.technician2 && r.technician2.trim().toLowerCase() === techNameLower)
    ).filter(r => {
      const isCompleted = String(r.status) === 'completed' || r.status === MaintenanceStatus.COMPLETED || r.status === MaintenanceStatus.PRE_COMPLETED;
      if (!isCompleted) return false;

      if (dateFilterType === 'month') {
        return true;
      } else {
        // No modo período: busca serviços realizados no determinado período
        const execDate = getPreventiveExecutionDateOnly(r);
        if (!execDate) return false;
        if (startDate && execDate < startDate) return false;
        if (endDate && execDate > endDate) return false;
        return true;
      }
    });

    let totalMachines = 0;
    const preventiveUnitPrice = pricePerMachine ? Number(pricePerMachine) : 0;

    const preventiveItems = techRecords.map(r => {
      const addr = addresses.find(a => a.id === r.addressId);
      const client = clients.find(c => c.id === addr?.clientId);
      
      const machinesCount = r.executedQuantity !== undefined && r.executedQuantity !== null 
        ? r.executedQuantity 
        : (addr?.totalMachines || 0);
        
      totalMachines += machinesCount;
      const subtotal = machinesCount * preventiveUnitPrice;

      const execDateOnly = getPreventiveExecutionDateOnly(r);
      const displayExecutionDate = dateFilterType === 'period' && execDateOnly
        ? `${execDateOnly}T12:00:00`
        : (r.executionDate || r.month + '-01T12:00:00');

      return {
        id: `prev_${r.id}`,
        rawId: r.id,
        category: 'preventive' as const,
        typeLabel: 'Manutenção Preventiva (PMOC)',
        typeCode: 'PREVENTIVA',
        documentNumber: `PMOC #${r.id.substring(0, 6).toUpperCase()}`,
        status: 'concluida',
        statusLabel: 'Concluída',
        address: addr?.street ? `${addr.street}${addr.number ? `, ${addr.number}` : ''}${addr.name ? ` (${addr.name})` : ''}` : 'Endereço Desconhecido',
        clientName: client?.name || 'Cliente Desconhecido',
        detail: `${machinesCount} máquina(s) atendida(s)`,
        machinesCount,
        executionDate: displayExecutionDate,
        unitPrice: preventiveUnitPrice,
        unitLabel: 'R$ / máquina',
        totalPrice: subtotal
      };
    });

    const totalPreventiveValue = totalMachines * preventiveUnitPrice;

    // 2. FILTRAR TODAS AS ORDENS DE SERVIÇO DO TÉCNICO
    // REGRA MANDATÓRIA DO USUÁRIO: "no caso das ordens de serviço a data a ser considerada é a data de finalização"
    const techServiceOrders = serviceOrders.filter(o => {
      // Regra: Pertence ao técnico
      const belongsToTech = isOrderAssignedToTech(o, techId, techNameClean, technicians);
      if (!belongsToTech) return false;

      if (dateFilterType === 'month') {
        // Regra: Mês referente à sua abertura (independente de estar em aberto ou não)
        const anyOrder = o as any;
        const rawDate = o.openedAt || o.createdAt || anyOrder.date || anyOrder.openedDate || o.finishedAt;
        const { yearMonth } = extractYearMonth(rawDate);
        if (!yearMonth) return false;
        return yearMonth === month;
      } else {
        // No modo período para buscar serviços realizados: A DATA A SER CONSIDERADA É A DATA DE FINALIZAÇÃO!
        const finalizedDateStr = getOSFinalizationDateOnly(o);
        if (!finalizedDateStr) return false; // Apenas serviços finalizados no período
        if (startDate && finalizedDateStr < startDate) return false;
        if (endDate && finalizedDateStr > endDate) return false;
        return true;
      }
    });

    let totalServiceOrderValue = 0;
    const ordersByTypeCount: Record<string, number> = {};

    const serviceOrderItems = techServiceOrders.map(o => {
      const osType = (o.type || 'MANUTENCAO CORRETIVA CONTRATO').trim().toUpperCase();
      ordersByTypeCount[osType] = (ordersByTypeCount[osType] || 0) + 1;

      // Obtém o preço configurado para este tipo de O.S.
      const unitPrice = resolveOsPrice(osType, osPrices, selectedTechObj);
      totalServiceOrderValue += unitPrice;

      const anyOrder = o as any;
      const rawDate = o.openedAt || o.createdAt || anyOrder.date || anyOrder.openedDate || o.finishedAt;
      const { dateIso } = extractYearMonth(rawDate);
      const finalizedDateStr = getOSFinalizationDateOnly(o);
      const displayExecutionDate = (dateFilterType === 'period' && finalizedDateStr)
        ? `${finalizedDateStr}T12:00:00`
        : dateIso;

      const eqDetail = o.equipmentName 
        ? `${o.equipmentName}${o.equipmentBtus ? ` • ${o.equipmentBtus}` : ''}${o.equipmentSector ? ` • ${o.equipmentSector}` : ''}`
        : (o.description ? o.description.substring(0, 45) : 'Atendimento O.S.');

      // Determinar label e status formatado
      const statusRaw = (o.status || 'aberta').toLowerCase();
      let statusLabel = 'Aberta';
      if (statusRaw === 'finalizada' || (dateFilterType === 'period' && finalizedDateStr)) statusLabel = 'Finalizada';
      else if (statusRaw === 'pre_finalizada') statusLabel = 'Pré-Finalizada';
      else if (statusRaw === 'em_andamento') statusLabel = 'Em Andamento';
      else if (statusRaw === 'cancelada') statusLabel = 'Cancelada';

      return {
        id: `os_${o.id}`,
        rawId: o.id,
        category: 'service_order' as const,
        typeLabel: `O.S. ${osType}`,
        typeCode: osType,
        documentNumber: `O.S. #${o.osNumber || o.id.substring(0, 5)}`,
        status: statusRaw,
        statusLabel,
        address: o.addressStreet || 'Endereço da O.S.',
        clientName: o.clientName || 'Cliente',
        detail: eqDetail,
        machinesCount: 1,
        executionDate: displayExecutionDate,
        unitPrice: unitPrice,
        unitLabel: 'R$ / O.S.',
        totalPrice: unitPrice
      };
    });

    // 3. UNIFICAÇÃO E ORDENAÇÃO
    const allItems = [...preventiveItems, ...serviceOrderItems].sort(
      (a, b) => new Date(b.executionDate).getTime() - new Date(a.executionDate).getTime()
    );

    const totalGrossValue = totalPreventiveValue + totalServiceOrderValue;
    const totalDiscounts = penalties.filter(p => p.type === 'discount').reduce((sum, p) => sum + p.value, 0);
    const totalBonuses = penalties.filter(p => p.type === 'bonus').reduce((sum, p) => sum + p.value, 0);
    const netValue = totalGrossValue - totalDiscounts + totalBonuses;

    return { 
      items: allItems, 
      totalLocations: techRecords.length,
      totalMachines, 
      totalPreventiveValue,
      totalServiceOrders: techServiceOrders.length,
      totalServiceOrderValue,
      totalDiscounts, 
      totalBonuses, 
      totalGrossValue,
      netValue,
      ordersByTypeCount
    };
  }, [records, serviceOrders, addresses, clients, technicians, selectedTechnician, selectedTechObj, dateFilterType, month, startDate, endDate, pricePerMachine, osPrices, penalties]);

  // Filtragem dos itens exibidos na tabela
  const displayedItems = useMemo(() => {
    return productionStats.items.filter(item => {
      // Filtro de Categoria
      if (viewFilter === 'preventive' && item.category !== 'preventive') return false;
      if (viewFilter === 'service_order' && item.category !== 'service_order') return false;

      // Filtro de Busca
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchAddress = item.address.toLowerCase().includes(term);
        const matchClient = item.clientName.toLowerCase().includes(term);
        const matchDoc = item.documentNumber.toLowerCase().includes(term);
        const matchType = item.typeLabel.toLowerCase().includes(term);
        const matchDetail = item.detail.toLowerCase().includes(term);
        if (!matchAddress && !matchClient && !matchDoc && !matchType && !matchDetail) {
          return false;
        }
      }

      return true;
    });
  }, [productionStats.items, viewFilter, searchTerm]);

  // Adição de Ajuste (Bônus / Desconto)
  const addPenalty = async () => {
    if (newPenaltyDesc && newPenaltyValue && selectedTechnician) {
      try {
        const adjustment = { 
          description: newPenaltyDesc, 
          value: Number(newPenaltyValue),
          type: newPenaltyType,
          technicianName: selectedTechnician,
          month
        };
        const saved = await dataService.addAdjustment(adjustment as any);
        setPenalties(prev => [...prev, saved as any]);
        setNewPenaltyDesc('');
        setNewPenaltyValue('');
      } catch (error) {
         console.error("Erro ao salvar ajuste:", error);
      }
    }
  };

  // Remoção de Ajuste
  const removePenalty = async (id: string) => {
    try {
      await dataService.deleteAdjustment(id);
      setPenalties(prev => prev.filter(p => p.id !== id));
    } catch (error) {
       console.error("Erro ao remover ajuste:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white rounded-2xl border border-slate-200">
        <div className="animate-spin rounded-full h-9 w-9 border-3 border-blue-600 border-t-transparent"></div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Calculando produção técnica consolidada...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 overflow-hidden flex flex-col min-h-[550px] print-container space-y-0">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 10mm 12mm 10mm;
          }
          body {
            background-color: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-container {
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          tr {
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* ========================================================================= */}
      {/* CABEÇALHO EXCLUSIVO PARA IMPRESSÃO (A4 FORMAL)                             */}
      {/* ========================================================================= */}
      <div className="hidden print:flex flex-col gap-3 border-b-2 border-slate-900 pb-3 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-black text-slate-950 tracking-tight">RELATÓRIO DE PRODUÇÃO TÉCNICA CONSOLIDADA</h1>
            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">
              Le Frio Refrigeração & Climatização • Manutenção Preventiva (PMOC) e Ordens de Serviço
            </p>
          </div>
          <div className="text-right text-[9px] text-slate-500 font-bold uppercase">
            <p>Emissão: {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
            <p>Status: Homologado</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-300 text-xs">
          <div>
            <span className="text-slate-500 block text-[9px] uppercase font-black tracking-wider">Técnico Responsável</span>
            <span className="font-extrabold text-slate-900 text-xs">{selectedTechnician || 'Não selecionado'}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[9px] uppercase font-black tracking-wider">
              {dateFilterType === 'period' ? 'Período de Referência' : 'Mês de Referência'}
            </span>
            <span className="font-bold text-slate-900 capitalize text-xs">
              {dateFilterType === 'period'
                ? `${startDate ? format(parseISO(startDate + 'T12:00:00'), 'dd/MM/yyyy') : ''} a ${endDate ? format(parseISO(endDate + 'T12:00:00'), 'dd/MM/yyyy') : ''}`
                : (month ? format(new Date(month + '-02T12:00:00'), 'MMMM / yyyy', { locale: ptBR }) : '-')}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[9px] uppercase font-black tracking-wider">Valor / Máq. Preventiva</span>
            <span className="font-bold text-slate-900 text-xs">
              {pricePerMachine ? Number(pricePerMachine).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[9px] uppercase font-black tracking-wider">Total Líquido a Pagar</span>
            <span className="font-black text-slate-950 text-sm">
              {productionStats.netValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
        </div>

        {/* Tabela de Preços aplicada na impressão */}
        <div className="text-[9px] text-slate-600 bg-white border border-slate-200 p-2 rounded flex flex-wrap gap-x-4 gap-y-1">
          <span className="font-black text-slate-800 uppercase">Valores de O.S. aplicados:</span>
          {Object.entries(osPrices).map(([type, val]) => (
            <span key={type} className="font-medium">
              <strong className="text-slate-700">{type}:</strong> {Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BARRA SUPERIOR DE FILTROS E SELEÇÃO (TELA WEB)                             */}
      {/* ========================================================================= */}
      <div className="px-6 py-4.5 border-b border-slate-100 bg-slate-50/70 flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center print:hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Produção Técnica</span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  PMOC + Ordens de Serviço
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {dateFilterType === 'period' 
                  ? 'Buscando serviços realizados no período (Ordens de Serviço filtradas pela data de finalização).'
                  : 'Cálculo de produtividade técnica unificado por máquinas de contrato e atendimentos de O.S.'}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Seletor de Técnico */}
          <div className="relative flex-1 sm:flex-none">
            <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedTechnician}
              onChange={(e) => setSelectedTechnician(e.target.value)}
              className="w-full sm:w-52 pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-3xs cursor-pointer"
            >
              {technicians.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Alternador de Modo: Por Mês vs Por Período */}
          <div className="flex items-center bg-slate-200/80 p-0.5 rounded-xl border border-slate-200 text-xs font-bold shrink-0">
            <button
              type="button"
              onClick={() => setDateFilterType('month')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                dateFilterType === 'month'
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Mês
            </button>
            <button
              type="button"
              onClick={() => setDateFilterType('period')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                dateFilterType === 'period'
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Calendar className="w-3.5 h-3.5" />
              Período
            </button>
          </div>
          
          {/* Campo de Data: Mês OU Período Personalizado */}
          {dateFilterType === 'month' ? (
            <div className="relative flex-1 sm:flex-none">
              <CalendarIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input 
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full sm:w-44 pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-3xs"
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 shadow-3xs flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black uppercase text-slate-400 shrink-0">De</span>
                <input 
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="py-1 px-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black uppercase text-slate-400 shrink-0">Até</span>
                <input 
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="py-1 px-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
              {/* Atalhos Rápidos */}
              <div className="flex items-center gap-1 pl-1 border-l border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const today = format(new Date(), 'yyyy-MM-dd');
                    setStartDate(today);
                    setEndDate(today);
                  }}
                  className="px-2 py-0.5 rounded text-[10px] font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Hoje"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    setStartDate(format(subDays(today, 7), 'yyyy-MM-dd'));
                    setEndDate(format(today, 'yyyy-MM-dd'));
                  }}
                  className="px-2 py-0.5 rounded text-[10px] font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Últimos 7 dias"
                >
                  7 Dias
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    setStartDate(format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd'));
                    setEndDate(format(today, 'yyyy-MM-dd'));
                  }}
                  className="px-2 py-0.5 rounded text-[10px] font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Mês Atual"
                >
                  Mês
                </button>
              </div>
            </div>
          )}

          {/* Campo Rápido: Valor por Máq. Preventiva */}
          <div className="relative flex items-center shrink-0">
            <span className="absolute left-3 text-[11px] font-black text-slate-400">R$</span>
            <input 
              type="number"
              step="0.10"
              placeholder="R$ / Máq. Prev."
              value={pricePerMachine}
              onChange={(e) => setPricePerMachine(e.target.value ? Number(e.target.value) : '')}
              onBlur={handlePricePerMachineBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handlePricePerMachineBlur();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              title="Valor pago por máquina na Manutenção Preventiva (PMOC)"
              className="pl-8 pr-3 py-2 w-36 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-3xs"
            />
          </div>

          {/* Botão para Configurar Tabela de Preços de O.S. do Técnico */}
          <button 
            type="button"
            onClick={() => setIsPricingPanelOpen(prev => !prev)}
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-3xs flex items-center gap-1.5 shrink-0 cursor-pointer border",
              isPricingPanelOpen 
                ? "bg-slate-900 text-white border-slate-900" 
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100/80"
            )}
            title="Definir valores da Ordem de Serviço (Corretiva, Jateamento, etc.) para este técnico"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
            <span>Preços de O.S.</span>
            {isPricingPanelOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          
          {/* Botão Imprimir */}
          <button 
            type="button"
            onClick={() => { 
              window.focus(); 
              setTimeout(() => window.print(), 200); 
            }}
            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors shrink-0 bg-white shadow-3xs cursor-pointer"
            title="Imprimir Relatório Consolidado A4"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PAINEL DISCRETO DE PRECIFICAÇÃO POR TIPO DE O.S. E PREVENTIVA             */}
      {/* ========================================================================= */}
      {isPricingPanelOpen && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white p-5 border-b border-slate-800 animate-in slide-in-from-top-3 duration-200 print:hidden space-y-4 shadow-inner">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-2">
                  <span>Tabela de Produção do Técnico:</span>
                  <span className="text-amber-400 font-extrabold">{selectedTechnician}</span>
                </h3>
                <p className="text-[11px] text-slate-400 font-medium">
                  Defina os valores unitários pagos a este técnico por tipo de serviço. Os valores ficam salvos no cadastro dele.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveAllPrices}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Salvar Valores</span>
              </button>
            </div>
          </div>

          {pricingSaveMessage && (
            <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-bold flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{pricingSaveMessage}</span>
            </div>
          )}

          {/* Grid discreto de campos de precificação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {/* Preventiva (Máquinas) */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-3 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-blue-400" />
                  <span>Preventiva (Por Máquina)</span>
                </label>
                <span className="text-[9px] font-extrabold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">PMOC</span>
              </div>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-xs font-black text-slate-400">R$</span>
                <input
                  type="number"
                  step="0.10"
                  placeholder="0,00"
                  value={pricePerMachine}
                  onChange={(e) => setPricePerMachine(e.target.value ? Number(e.target.value) : '')}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-900/90 border border-slate-700 rounded-lg text-xs font-bold text-white focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Tipos de O.S. dinâmicos */}
            {maintenanceTypes.map((type) => {
              const currentVal = osPrices[type] !== undefined ? osPrices[type] : '';
              const isCorretiva = type.includes('CORRETIVA');
              const isJateamento = type.includes('JATEAMENTO');
              const isInstalacao = type.includes('INSTALACAO') || type.includes('INSTALAÇÃO');

              return (
                <div key={type} className="bg-slate-800/80 border border-slate-700/80 p-3 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider truncate flex items-center gap-1.5" title={type}>
                      {isJateamento ? (
                        <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      ) : isCorretiva ? (
                        <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <Tag className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      )}
                      <span className="truncate">{type}</span>
                    </label>
                    <span className={cn(
                      "text-[9px] font-extrabold px-1.5 py-0.5 rounded shrink-0",
                      isJateamento ? "bg-cyan-500/20 text-cyan-300" :
                      isCorretiva ? "bg-amber-500/20 text-amber-300" :
                      "bg-indigo-500/20 text-indigo-300"
                    )}>
                      O.S.
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-xs font-black text-slate-400">R$</span>
                    <input
                      type="number"
                      step="1.00"
                      placeholder="0,00"
                      value={currentVal}
                      onChange={(e) => handleOsPriceChange(type, e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-900/90 border border-slate-700 rounded-lg text-xs font-bold text-white focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CARDS DE RESUMO DE PRODUÇÃO (BENTO GRID MODERNO)                         */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 p-5 border-b border-slate-100 bg-white print:grid-cols-5 print:gap-2 print:p-0 print:pb-3 print:border-b-2 print:border-slate-300">
        {/* 1. Locais Atendidos (Preventiva) */}
        <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-100/90 flex items-center gap-3 print:p-2 print:rounded-lg print:bg-slate-50 print:border-slate-200">
          <div className="w-10 h-10 bg-white rounded-xl shadow-xs text-indigo-600 flex items-center justify-center shrink-0 print:w-6 print:h-6 print:rounded-md print:shadow-none">
            <CheckCircle className="w-5 h-5 print:w-3.5 print:h-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500 truncate print:text-[8px] print:text-slate-500">
              Locais PMOC
            </p>
            <p className="text-xl font-black text-indigo-950 print:text-sm print:leading-none">
              {productionStats.totalLocations}
            </p>
            <p className="text-[9px] text-indigo-400 font-bold hidden sm:block print:hidden">
              Endereços concluídos
            </p>
          </div>
        </div>
        
        {/* 2. Total de Máquinas Preventivas */}
        <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-100/90 flex items-center gap-3 print:p-2 print:rounded-lg print:bg-slate-50 print:border-slate-200">
          <div className="w-10 h-10 bg-white rounded-xl shadow-xs text-blue-600 flex items-center justify-center shrink-0 print:w-6 print:h-6 print:rounded-md print:shadow-none">
            <Calculator className="w-5 h-5 print:w-3.5 print:h-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-blue-500 truncate print:text-[8px] print:text-slate-500">
              Máq. Preventivas
            </p>
            <p className="text-xl font-black text-blue-950 print:text-sm print:leading-none">
              {productionStats.totalMachines}
            </p>
            <p className="text-[9px] text-blue-600 font-bold truncate">
              {productionStats.totalPreventiveValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
        </div>

        {/* 3. Ordens de Serviço Atendidas */}
        <div className="p-3.5 rounded-2xl bg-cyan-50/70 border border-cyan-100/90 flex items-center gap-3 print:p-2 print:rounded-lg print:bg-slate-50 print:border-slate-200">
          <div className="w-10 h-10 bg-white rounded-xl shadow-xs text-cyan-600 flex items-center justify-center shrink-0 print:w-6 print:h-6 print:rounded-md print:shadow-none">
            <Wrench className="w-5 h-5 print:w-3.5 print:h-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-cyan-600 truncate print:text-[8px] print:text-slate-500">
              Ordens de Serviço
            </p>
            <p className="text-xl font-black text-cyan-950 print:text-sm print:leading-none">
              {productionStats.totalServiceOrders}
            </p>
            <p className="text-[9px] text-cyan-700 font-bold truncate">
              {productionStats.totalServiceOrderValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
        </div>
        
        {/* 4. Bruto Total (R$) */}
        <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100/90 flex items-center gap-3 relative overflow-hidden print:p-2 print:rounded-lg print:bg-slate-50 print:border-slate-200">
          <div className="w-10 h-10 bg-white rounded-xl shadow-xs text-emerald-600 flex items-center justify-center shrink-0 print:w-6 print:h-6 print:rounded-md print:shadow-none">
            <HandCoins className="w-5 h-5 print:w-3.5 print:h-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 truncate print:text-[8px] print:text-slate-500">
              Bruto Total
            </p>
            <p className="text-lg sm:text-xl font-black text-emerald-950 truncate print:text-sm print:leading-none">
              {productionStats.totalGrossValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-[9px] text-emerald-700 font-bold hidden sm:block print:hidden truncate">
              Prev + O.S.
            </p>
          </div>
          <div className="absolute top-2 right-2 flex flex-col gap-0.5 print:hidden">
            {productionStats.totalBonuses > 0 && (
              <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded">
                +{productionStats.totalBonuses.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            )}
            {productionStats.totalDiscounts > 0 && (
              <span className="text-[9px] font-extrabold text-rose-600 bg-rose-100 px-1 py-0.2 rounded">
                -{productionStats.totalDiscounts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            )}
          </div>
        </div>
        
        {/* 5. Líquido a Pagar (R$) */}
        <div className="col-span-2 md:col-span-1 p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-3 print:p-2 print:rounded-lg print:bg-slate-100 print:border-slate-300">
          <div className="w-10 h-10 bg-slate-800 rounded-xl shadow-inner text-white flex items-center justify-center shrink-0 print:w-6 print:h-6 print:rounded-md print:bg-white print:text-slate-900">
            <DollarSign className="w-5 h-5 print:w-3.5 print:h-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate print:text-[8px] print:text-slate-500">
              Líquido a Pagar
            </p>
            <p className="text-lg sm:text-xl font-black text-white truncate print:text-sm print:text-slate-950 print:leading-none">
              {productionStats.netValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-[9px] text-emerald-400 font-bold hidden sm:block print:hidden">
              Com ajustes aplicados
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SEÇÃO DE AJUSTES (BÔNUS E DESCONTOS)                                       */}
      {/* ========================================================================= */}
      <div className="border-b border-slate-200/80 bg-slate-50/40 print:bg-transparent print:border-b-2 print:border-slate-300">
        <div className="p-4 bg-white flex flex-col md:flex-row gap-3 items-start md:items-center justify-between border-b border-slate-100 print:p-1.5 print:bg-transparent print:border-none">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2 print:text-xs">
            <AlertCircle className="w-4 h-4 text-slate-400 print:w-3.5 print:h-3.5" /> 
            <span>Ajustes na Produção (Bônus e Descontos)</span>
          </h3>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 print:hidden w-full md:w-auto">
            <select 
              value={newPenaltyType}
              onChange={(e) => setNewPenaltyType(e.target.value as 'discount' | 'bonus')}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-3xs cursor-pointer"
            >
              <option value="discount">Desconto (-)</option>
              <option value="bonus">Bônus (+)</option>
            </select>
            <input 
              type="text"
              placeholder={newPenaltyType === 'discount' ? "Descrição do desconto..." : "Descrição do bônus..."}
              value={newPenaltyDesc}
              onChange={(e) => setNewPenaltyDesc(e.target.value)}
              className="w-full sm:w-60 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-3xs"
            />
            <div className="flex items-center gap-2">
              <div className="relative w-32 shrink-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">R$</span>
                <input 
                  type="number"
                  placeholder="Valor"
                  value={newPenaltyValue}
                  onChange={(e) => setNewPenaltyValue(e.target.value ? Number(Math.abs(Number(e.target.value))) : '')}
                  className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-3xs"
                  min="0"
                />
              </div>
              <button 
                type="button"
                onClick={addPenalty}
                disabled={!newPenaltyDesc || !newPenaltyValue}
                className={cn(
                  "p-2 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-3xs shrink-0 cursor-pointer",
                  newPenaltyType === 'discount' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                )}
                title="Adicionar ajuste"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        
        <div className="p-4 print:p-1.5">
          {penalties.length > 0 ? (
            <div className="flex flex-col gap-2.5 print:gap-1">
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 print:grid-cols-3 print:gap-1.5">
                {penalties.map(p => (
                  <li key={p.id} className={cn(
                    "bg-white border p-2.5 rounded-xl flex items-start justify-between shadow-3xs group print:p-1.5 print:rounded-md print:shadow-none print:border-slate-300",
                    p.type === 'discount' ? 'border-rose-200' : 'border-emerald-200'
                  )}>
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5 print:text-[10px]">
                        {p.type === 'discount' ? (
                          <ArrowDownCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 print:w-3 print:h-3" />
                        ) : (
                          <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 print:w-3 print:h-3" />
                        )}
                        <span className="truncate">{p.description}</span>
                      </p>
                      <p className={cn(
                        "text-xs font-black mt-0.5 print:text-[10px]",
                        p.type === 'discount' ? 'text-rose-600' : 'text-emerald-600'
                      )}>
                        {p.type === 'discount' ? '-' : '+'}{Math.abs(p.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                      {p.createdAt && (
                        <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-wider font-semibold print:hidden">
                          {format(new Date(p.createdAt), "dd/MM/yyyy • HH:mm")}
                        </p>
                      )}
                    </div>
                    <button 
                      type="button"
                      onClick={() => removePenalty(p.id)}
                      className={cn(
                        "text-slate-300 transition-colors p-1 print:hidden opacity-0 group-hover:opacity-100 shrink-0 cursor-pointer",
                        p.type === 'discount' ? 'hover:text-rose-600' : 'hover:text-emerald-600'
                      )}
                      title="Remover ajuste"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex justify-start md:justify-end items-center gap-4 pt-2 border-t border-slate-100 print:pt-1 print:border-slate-200">
                {productionStats.totalBonuses > 0 && (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                    <span className="uppercase text-[10px] text-slate-400">Total Bônus:</span>
                    <span className="font-black text-emerald-600">
                      +{productionStats.totalBonuses.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                )}
                {productionStats.totalDiscounts > 0 && (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                    <span className="uppercase text-[10px] text-slate-400">Total Descontos:</span>
                    <span className="font-black text-rose-600">
                      -{productionStats.totalDiscounts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-center p-3 text-slate-400 font-medium italic border border-dashed border-slate-200 rounded-xl bg-white shadow-3xs print:p-1 print:border-solid print:bg-transparent">
              Nenhum ajuste (bônus ou desconto) registrado para este técnico no mês.
            </p>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BARRA DE FILTROS E ABAS DA TABELA DE ATENDIMENTOS                         */}
      {/* ========================================================================= */}
      <div className="px-6 py-3.5 bg-slate-50/50 border-b border-slate-200/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 print:hidden">
        {/* Abas de Categoria */}
        <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setViewFilter('all')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
              viewFilter === 'all' 
                ? "bg-white text-slate-900 shadow-xs" 
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            Todos ({productionStats.items.length})
          </button>
          <button
            type="button"
            onClick={() => setViewFilter('preventive')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5",
              viewFilter === 'preventive' 
                ? "bg-white text-blue-700 shadow-xs" 
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
            <span>Preventivas ({productionStats.totalLocations})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewFilter('service_order')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5",
              viewFilter === 'service_order' 
                ? "bg-white text-cyan-700 shadow-xs" 
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Wrench className="w-3.5 h-3.5 text-cyan-600" />
            <span>Ordens de Serviço ({productionStats.totalServiceOrders})</span>
          </button>
        </div>

        {/* Campo de Busca */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar endereço, cliente ou O.S...."
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-3xs"
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TABELA CONSOLIDADA DE PRODUÇÃO TÉCNICA                                    */}
      {/* ========================================================================= */}
      <div className="overflow-x-auto flex-1 bg-white print:overflow-visible">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-black tracking-widest text-slate-400 uppercase print:bg-transparent print:border-b-2 print:border-slate-800">
              <th className="p-4 pl-6 print:py-1.5 print:px-2 print:text-[8px]">Tipo / Documento</th>
              <th className="p-4 print:py-1.5 print:px-2 print:text-[8px]">Endereço Atendido</th>
              <th className="p-4 print:py-1.5 print:px-2 print:text-[8px]">Cliente</th>
              <th className="p-4 text-center print:py-1.5 print:px-2 print:text-[8px]">Qtd. / Detalhe</th>
              <th className="p-4 text-center print:py-1.5 print:px-2 print:text-[8px]">
                {dateFilterType === 'period' ? 'Data Finaliz. / Exec.' : 'Data Ref. / Abertura'}
              </th>
              <th className="p-4 text-center print:py-1.5 print:px-2 print:text-[8px]">Status</th>
              <th className="p-4 pr-6 text-right print:py-1.5 print:px-2 print:pr-2 print:text-[8px]">Valor Produção</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 print:divide-y print:divide-slate-200">
            {displayedItems.map((item) => {
              const isPrev = item.category === 'preventive';
              const isJateamento = item.typeCode.includes('JATEAMENTO');
              
              let formattedDate = '---';
              try {
                if (item.executionDate) {
                  const d = new Date(item.executionDate);
                  if (!isNaN(d.getTime())) {
                    formattedDate = format(d, "dd/MM/yyyy");
                  }
                }
              } catch {}

              const isFinished = item.status === 'finalizada' || item.status === 'concluida';
              const isPreFinished = item.status === 'pre_finalizada';
              const isPending = item.status === 'aberta' || item.status === 'em_andamento';

              return (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group print:hover:bg-transparent">
                  {/* Tipo / Documento */}
                  <td className="p-4 pl-6 print:py-1 print:px-2">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold tracking-wide uppercase print:px-1 print:py-0 print:text-[8px] print:bg-transparent",
                        isPrev 
                          ? "bg-blue-50 text-blue-700 border border-blue-200/60 print:border-none print:text-slate-900" 
                          : isJateamento
                          ? "bg-cyan-50 text-cyan-800 border border-cyan-200/60 print:border-none print:text-slate-900"
                          : "bg-amber-50 text-amber-800 border border-amber-200/60 print:border-none print:text-slate-900"
                      )}>
                        {isPrev ? (
                          <CheckCircle className="w-3 h-3 text-blue-600 print:hidden" />
                        ) : isJateamento ? (
                          <Layers className="w-3 h-3 text-cyan-600 print:hidden" />
                        ) : (
                          <Wrench className="w-3 h-3 text-amber-600 print:hidden" />
                        )}
                        <span>{item.documentNumber}</span>
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5 pl-0.5 print:text-[8px]">
                      {item.typeLabel}
                    </p>
                  </td>

                  {/* Endereço */}
                  <td className="p-4 print:py-1 print:px-2">
                    <p className="font-bold text-slate-800 text-xs sm:text-sm print:text-[9px] print:leading-tight">
                      {item.address}
                    </p>
                  </td>

                  {/* Cliente */}
                  <td className="p-4 print:py-1 print:px-2">
                    <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-md print:text-[9px] print:bg-transparent print:p-0 print:font-bold">
                      {item.clientName}
                    </span>
                  </td>

                  {/* Qtd. / Detalhe */}
                  <td className="p-4 text-center print:py-1 print:px-2">
                    {isPrev ? (
                      <span className="inline-flex items-center justify-center px-2.5 py-1 bg-blue-50 text-blue-700 font-black rounded-lg text-xs print:bg-transparent print:text-slate-900 print:text-[9px] print:p-0">
                        {item.machinesCount} Máquinas
                      </span>
                    ) : (
                      <span className="text-xs text-slate-600 font-medium print:text-[8px]">
                        {item.detail}
                      </span>
                    )}
                  </td>

                  {/* Data de Referência / Abertura */}
                  <td className="p-4 text-center print:py-1 print:px-2">
                    <span className="text-xs font-bold text-slate-600 print:text-[9px]">
                      {formattedDate}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="p-4 text-center print:py-1 print:px-2">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider print:text-[8px] print:p-0",
                      isFinished
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                        : isPreFinished
                        ? "bg-blue-50 text-blue-700 border border-blue-200/60"
                        : isPending
                        ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                        : "bg-slate-100 text-slate-600"
                    )}>
                      {item.statusLabel || (isPrev ? 'Concluída' : 'Aberta')}
                    </span>
                  </td>

                  {/* Valor Produção */}
                  <td className="p-4 pr-6 text-right print:py-1 print:px-2 print:pr-2">
                    <p className="text-xs font-black text-slate-900 print:text-[9px]">
                      {item.totalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                    <p className="text-[9px] text-slate-400 font-semibold print:hidden">
                      {item.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ({item.unitLabel})
                    </p>
                  </td>
                </tr>
              );
            })}

            {displayedItems.length === 0 && (
              <tr>
                <td colSpan={7} className="p-12 text-center text-slate-400 text-xs font-medium print:py-6">
                  {searchTerm.trim() 
                    ? `Nenhum atendimento corresponde à busca "${searchTerm}".`
                    : (dateFilterType === 'period'
                        ? "Nenhuma produção registrada (preventiva ou O.S.) para este técnico no período selecionado."
                        : "Nenhuma produção registrada (preventiva ou O.S.) para este técnico no mês selecionado.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ========================================================================= */}
      {/* RODAPÉ DO RELATÓRIO DE IMPRESSÃO (ASSINATURAS E TOTAIS)                   */}
      {/* ========================================================================= */}
      <div className="hidden print:flex flex-col gap-6 pt-4 border-t-2 border-slate-900 mt-4">
        <div className="grid grid-cols-4 gap-2 bg-slate-50 p-2 border border-slate-300 text-[9px] rounded">
          <div>
            <span className="text-slate-500 font-bold block">Total de Preventivas:</span>
            <span className="font-extrabold text-slate-900 text-[10px]">
              {productionStats.totalMachines} máq. ({productionStats.totalPreventiveValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
            </span>
          </div>
          <div>
            <span className="text-slate-500 font-bold block">Total de Ordens de Serviço:</span>
            <span className="font-extrabold text-slate-900 text-[10px]">
              {productionStats.totalServiceOrders} O.S. ({productionStats.totalServiceOrderValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
            </span>
          </div>
          <div>
            <span className="text-slate-500 font-bold block">Ajustes (Bônus/Desc.):</span>
            <span className="font-extrabold text-slate-900 text-[10px]">
              {((productionStats.totalBonuses - productionStats.totalDiscounts) >= 0 ? '+' : '')}
              {(productionStats.totalBonuses - productionStats.totalDiscounts).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
          <div>
            <span className="text-slate-500 font-bold block">Líquido a Pagar ao Técnico:</span>
            <span className="font-black text-slate-950 text-xs">
              {productionStats.netValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 pt-8">
          <div className="text-center border-t border-slate-800 pt-1 text-[9px] font-bold">
            <p className="uppercase">{selectedTechnician}</p>
            <p className="text-slate-400 font-normal">Assinatura do Técnico</p>
          </div>
          <div className="text-center border-t border-slate-800 pt-1 text-[9px] font-bold">
            <p className="uppercase">LE FRIO REFRIGERAÇÃO</p>
            <p className="text-slate-400 font-normal">Homologação Administrativa / Financeiro</p>
          </div>
        </div>
      </div>
    </div>
  );
}

