import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  CheckCircle2, 
  Wrench, 
  MapPin, 
  Building2, 
  Calendar, 
  Award, 
  Loader2, 
  AlertCircle,
  FileSpreadsheet,
  Cpu,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck
} from 'lucide-react';
import { format, parseISO, subDays, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { dataService } from '../services/dataService';
import { MaintenanceRecord, ServiceOrder, Address, Client, Technician, MaintenanceStatus, UserRole } from '../types';

interface TechProductionViewProps {
  userRole?: UserRole;
  managerClientId?: string;
  userProfile?: any;
}

export default function TechProductionView({ userRole, managerClientId, userProfile }: TechProductionViewProps) {
  const [dateFilterType, setDateFilterType] = useState<'month' | 'period'>('month');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return format(new Date(d.getFullYear(), d.getMonth(), 1), 'yyyy-MM-dd');
  });
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Data States
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'preventive' | 'service_orders'>('preventive');

  // Load static and transactional data
  useEffect(() => {
    let active = true;
    const loadAllData = async () => {
      setLoading(true);
      setError(null);
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
            recordsPromise = dataService.getRecords(selectedMonth).catch(() => []);
          }
        } else {
          recordsPromise = dataService.getRecords(selectedMonth).catch(() => []);
        }

        const [
          fetchedAddresses, 
          fetchedClients, 
          fetchedTechnicians, 
          fetchedRecords, 
          fetchedOrders
        ] = await Promise.all([
          dataService.getAddresses().catch(() => []),
          dataService.getClients().catch(() => []),
          dataService.getTechnicians().catch(() => []),
          recordsPromise,
          dataService.getServiceOrders().catch(() => [])
        ]);

        if (active) {
          setAddresses(fetchedAddresses);
          setClients(fetchedClients);
          setTechnicians(fetchedTechnicians);
          setRecords(fetchedRecords);
          setServiceOrders(fetchedOrders);
        }
      } catch (err: any) {
        console.error('Erro ao buscar dados de produção:', err);
        if (active) {
          setError('Não foi possível carregar os dados de produção. Por favor, tente novamente.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadAllData();
    return () => {
      active = false;
    };
  }, [selectedMonth, dateFilterType, startDate, endDate]);

  // Technician selector state (especially useful if admin/manager or switching)
  const [selectedTechName, setSelectedTechName] = useState<string>('');

  // Helper para extrair data pura YYYY-MM-DD
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

  // Helper para verificar se a O.S. pertence ao técnico
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

  // Resolve active technician's name
  let defaultTechName = userProfile?.name || '';
  const savedTech = localStorage.getItem('lefrio_tablet_auth_tech');
  if (savedTech) {
    try {
      const techObj = JSON.parse(savedTech);
      if (techObj && techObj.name) {
        defaultTechName = techObj.name;
      }
    } catch (e) {
      console.warn('Erro ao ler técnico do localStorage:', e);
    }
  }

  const activeTechName = selectedTechName || defaultTechName;

  const activeTechObj = technicians.find(
    t => t.name.trim().toLowerCase() === activeTechName.trim().toLowerCase()
  );

  // Filter and match Maintenance Records (Preventivas)
  const filteredPreventives = records
    .filter(r => {
      // Must be COMPLETED (fully approved by administrative)
      const isCompleted = r.status === MaintenanceStatus.COMPLETED;
      
      // Must belong to the current technician (primary or secondary)
      const matchesTech = (r.technician1 && r.technician1.trim().toLowerCase() === activeTechName.trim().toLowerCase()) ||
                          (r.technician2 && r.technician2.trim().toLowerCase() === activeTechName.trim().toLowerCase());
      
      if (!isCompleted || !matchesTech) return false;

      if (dateFilterType === 'period') {
        const rawDate = r.executionDate || r.completionDate || r.clientSignatureDate || r.approvedAt || r.plannedDate;
        const execDate = extractDateOnlyStr(rawDate);
        if (!execDate) return false;
        if (startDate && execDate < startDate) return false;
        if (endDate && execDate > endDate) return false;
        return true;
      }
      return true;
    })
    .map(r => {
      const addr = addresses.find(a => a.id === r.addressId);
      const client = clients.find(c => c.id === addr?.clientId);
      return {
        ...r,
        address: addr,
        client: client
      };
    });

  // Filter and match Service Orders: all orders opened in selectedMonth for this technician, OR finalized in the period
  const filteredServiceOrders = serviceOrders.filter(o => {
    // Pertence ao técnico
    const matchesTech = isOrderAssignedToTech(o, activeTechObj?.id || '', activeTechName, technicians);
    if (!matchesTech) return false;

    if (dateFilterType === 'month') {
      // Regra: Mês referente à sua abertura (independente de estar em aberto ou não)
      const anyOrder = o as any;
      const rawDate = o.openedAt || o.createdAt || anyOrder.date || anyOrder.openedDate || o.finishedAt;
      const { yearMonth } = extractYearMonth(rawDate);
      
      if (!yearMonth) return false;
      return yearMonth === selectedMonth;
    } else {
      // Regra no modo período: O.S. filtradas pela data de finalização!
      const anyOrder = o as any;
      const rawDate = o.finishedAt || 
                      o.adminFinalizedAt || 
                      o.techFinalizedAt || 
                      o.clientSignatureDate || 
                      anyOrder.finalizedAt || 
                      anyOrder.closedAt ||
                      anyOrder.completedAt ||
                      (o.status === 'finalizada' ? o.updatedAt : undefined);
      const finalizedDateStr = extractDateOnlyStr(rawDate);
      if (!finalizedDateStr) return false;
      if (startDate && finalizedDateStr < startDate) return false;
      if (endDate && finalizedDateStr > endDate) return false;
      return true;
    }
  });

  // Aggregate Metrics
  const totalPreventives = filteredPreventives.length;
  const totalMachines = filteredPreventives.reduce((sum, r) => {
    return sum + (r.executedQuantity || r.temporaryMachines || 0);
  }, 0);
  const totalServiceOrders = filteredServiceOrders.length;

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonthStr = String(prevDate.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${prevYear}-${prevMonthStr}`);
  };

  const handleNextMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const nextYear = nextDate.getFullYear();
    const nextMonthStr = String(nextDate.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${nextYear}-${nextMonthStr}`);
  };

  const getMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${months[parseInt(month) - 1]} de ${year}`;
  };

  return (
    <div id="tech-production-view-container" className="max-w-6xl mx-auto space-y-8 pb-12 animate-in fade-in duration-300">
      
      {/* Top Banner & Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 id="tech-production-title" className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Award className="w-8 h-8 text-blue-600 shrink-0" />
            Minha Produção
          </h1>
          <p id="tech-production-subtitle" className="text-slate-500 font-medium mt-1">
            {dateFilterType === 'period' ? (
              <>
                Serviços realizados de <strong className="text-slate-800 font-semibold">{startDate ? format(parseISO(startDate + 'T12:00:00'), 'dd/MM/yyyy') : '...'}</strong> a <strong className="text-slate-800 font-semibold">{endDate ? format(parseISO(endDate + 'T12:00:00'), 'dd/MM/yyyy') : '...'}</strong> (O.S. pela data de finalização).
              </>
            ) : (
              <>
                Resumo de atividades validadas e ordens de serviço do técnico <strong className="text-slate-800 font-semibold">{activeTechName || 'Autenticado'}</strong>.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Se houver técnicos cadastrados, permite alternar/selecionar técnico */}
          {technicians.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl px-3 py-1.5 shadow-sm flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Técnico:</span>
              <select
                id="tech-production-select-tech"
                value={activeTechName}
                onChange={(e) => setSelectedTechName(e.target.value)}
                className="text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
              >
                {technicians.map(t => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Alternador de Modo: Mês vs Período */}
          <div className="flex items-center bg-slate-200/80 p-0.5 rounded-2xl border border-slate-200 text-xs font-bold shrink-0">
            <button
              type="button"
              onClick={() => setDateFilterType('month')}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
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
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                dateFilterType === 'period'
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Calendar className="w-3.5 h-3.5" />
              Período
            </button>
          </div>

          {/* Month Picker Controls (quando dateFilterType === 'month') */}
          {dateFilterType === 'month' ? (
            <div id="month-picker-wrapper" className="flex items-center gap-3 bg-white border border-slate-200/80 rounded-2xl p-1.5 shadow-sm max-w-fit">
              <button
                id="prev-month-btn"
                onClick={handlePrevMonth}
                className="p-2 hover:bg-slate-50 text-slate-600 active:bg-slate-100 rounded-xl transition-all"
                title="Mês Anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              <span id="current-selected-month-label" className="px-3 text-sm font-bold text-slate-800 text-center min-w-[150px]">
                {getMonthName(selectedMonth)}
              </span>

              <button
                id="next-month-btn"
                onClick={handleNextMonth}
                className="p-2 hover:bg-slate-50 text-slate-600 active:bg-slate-100 rounded-xl transition-all"
                title="Próximo Mês"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          ) : (
            /* Filtro de Período Personalizado (De ... Até ...) */
            <div className="flex items-center gap-1.5 bg-white border border-slate-200/80 rounded-2xl px-3 py-1.5 shadow-sm flex-wrap sm:flex-nowrap">
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
        </div>
      </div>

      {error && (
        <div id="error-message-box" className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-sm font-semibold flex items-center gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Production Dashboard Statistics (No Values) */}
      <div id="tech-stats-grid" className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* Metric Card 1: Preventativas */}
        <div id="stat-preventives-card" className="bg-white border border-slate-200/70 rounded-3xl p-6 shadow-sm relative overflow-hidden flex items-center gap-5">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span id="stat-preventives-label" className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Manutenções Preventivas
            </span>
            <span id="stat-preventives-value" className="text-3xl font-black text-slate-900 leading-none mt-1 block">
              {loading ? <Loader2 className="w-6 h-6 animate-spin text-slate-400 mt-1" /> : totalPreventives}
            </span>
            <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
              Endereços aprovados
            </span>
          </div>
        </div>

        {/* Metric Card 2: Máquinas */}
        <div id="stat-machines-card" className="bg-white border border-slate-200/70 rounded-3xl p-6 shadow-sm relative overflow-hidden flex items-center gap-5">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl shrink-0">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <span id="stat-machines-label" className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Máquinas Atendidas
            </span>
            <span id="stat-machines-value" className="text-3xl font-black text-slate-900 leading-none mt-1 block">
              {loading ? <Loader2 className="w-6 h-6 animate-spin text-slate-400 mt-1" /> : totalMachines}
            </span>
            <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
              Equipamentos verificados
            </span>
          </div>
        </div>

        {/* Metric Card 3: Ordens de Serviço */}
        <div id="stat-orders-card" className="bg-white border border-slate-200/70 rounded-3xl p-6 shadow-sm relative overflow-hidden flex items-center gap-5">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl shrink-0">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <span id="stat-orders-label" className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Ordens de Serviço (O.S.)
            </span>
            <span id="stat-orders-value" className="text-3xl font-black text-slate-900 leading-none mt-1 block">
              {loading ? <Loader2 className="w-6 h-6 animate-spin text-slate-400 mt-1" /> : totalServiceOrders}
            </span>
            <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
              Chamados finalizados
            </span>
          </div>
        </div>
      </div>

      {/* Tabs and Detail Section */}
      <div id="tab-controls-container" className="space-y-6">
        <div className="flex border-b border-slate-200">
          <button
            id="tab-btn-preventive"
            onClick={() => setActiveTab('preventive')}
            className={cn(
              "px-6 py-3.5 text-sm font-bold border-b-2 transition-all -mb-px flex items-center gap-2",
              activeTab === 'preventive'
                ? "border-blue-600 text-blue-600 font-extrabold"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            )}
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            Checklists Preventivos ({totalPreventives})
          </button>
          
          <button
            id="tab-btn-service-orders"
            onClick={() => setActiveTab('service_orders')}
            className={cn(
              "px-6 py-3.5 text-sm font-bold border-b-2 transition-all -mb-px flex items-center gap-2",
              activeTab === 'service_orders'
                ? "border-blue-600 text-blue-600 font-extrabold"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            )}
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            Ordens de Serviço ({totalServiceOrders})
          </button>
        </div>

        {/* List Content */}
        {loading ? (
          <div id="production-loading-spinner" className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
            <span className="text-sm font-medium">Buscando dados de produção da nuvem...</span>
          </div>
        ) : activeTab === 'preventive' ? (
          /* PREVENTATIVES TAB LIST */
          <div id="preventives-list-wrapper" className="space-y-4">
            {filteredPreventives.length === 0 ? (
              <div id="preventives-empty-state" className="text-center py-16 bg-white border border-slate-200/50 rounded-3xl p-8 shadow-sm">
                <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-700">Nenhuma preventiva aprovada</h3>
                <p className="text-slate-400 text-sm max-w-sm mx-auto mt-1">
                  Nenhum endereço de manutenção preventiva concluído por você foi aprovado pela administração neste mês ainda.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredPreventives.map((r) => (
                  <div
                    key={r.id}
                    id={`preventive-item-${r.id}`}
                    className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-slate-200/80 transition-all flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                          Aprovada
                        </span>
                        {r.executionDate && (
                          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            {new Date(r.executionDate).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>

                      <h4 className="text-base font-black text-slate-800 mt-3 truncate">
                        {r.client?.name || r.temporaryClient || 'Cliente não identificado'}
                      </h4>

                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mt-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {r.address?.street || r.temporaryStreet || 'Endereço temporário / avulso'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400 block">
                        Equipamentos Executados:
                      </span>
                      <span className="text-sm font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-xl">
                        {r.executedQuantity || r.temporaryMachines || 0} maq.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* SERVICE ORDERS TAB LIST */
          <div id="service-orders-list-wrapper" className="space-y-4">
            {filteredServiceOrders.length === 0 ? (
              <div id="service-orders-empty-state" className="text-center py-16 bg-white border border-slate-200/50 rounded-3xl p-8 shadow-sm">
                <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-700">Nenhuma O.S. neste mês</h3>
                <p className="text-slate-400 text-sm max-w-sm mx-auto mt-1">
                  Nenhuma Ordem de Serviço vinculada ao técnico foi aberta no mês selecionado.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredServiceOrders.map((o) => {
                  const statusRaw = (o.status || 'aberta').toLowerCase();
                  let statusLabel = 'Aberta';
                  let statusStyle = 'bg-amber-50 text-amber-700 border-amber-200/60';
                  if (statusRaw === 'finalizada') {
                    statusLabel = 'Finalizada';
                    statusStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200/60';
                  } else if (statusRaw === 'pre_finalizada') {
                    statusLabel = 'Pré-Finalizada';
                    statusStyle = 'bg-blue-50 text-blue-700 border-blue-200/60';
                  } else if (statusRaw === 'em_andamento') {
                    statusLabel = 'Em Andamento';
                    statusStyle = 'bg-indigo-50 text-indigo-700 border-indigo-200/60';
                  } else if (statusRaw === 'cancelada') {
                    statusLabel = 'Cancelada';
                    statusStyle = 'bg-rose-50 text-rose-700 border-rose-200/60';
                  }

                  const osType = (o.type || 'MANUTENCAO CORRETIVA CONTRATO').toUpperCase();

                  let openedDateStr = '---';
                  const anyOrder = o as any;
                  const rawDate = o.openedAt || o.createdAt || anyOrder.date || anyOrder.openedDate;
                  const { dateIso } = extractYearMonth(rawDate);
                  try {
                    if (dateIso) {
                      const d = new Date(dateIso);
                      if (!isNaN(d.getTime())) openedDateStr = d.toLocaleDateString('pt-BR');
                    }
                  } catch {}

                  return (
                    <div
                      key={o.id}
                      id={`service-order-item-${o.id}`}
                      className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-slate-200/80 transition-all space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-50 pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-slate-800">
                            O.S. #{o.osNumber || (o.id && !o.id.startsWith('OS_') ? o.id : '00000')}
                          </span>
                          <span className={cn("text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full border", statusStyle)}>
                            {statusLabel}
                          </span>
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                            {osType}
                          </span>
                        </div>
                        
                        <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          Abertura: {openedDateStr}
                          {o.finishedAt && ` | Conclusão: ${new Date(o.finishedAt).toLocaleDateString('pt-BR')}`}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Column 1: Client & Equipment */}
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <Building2 className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                Cliente & Local
                              </span>
                              <span className="text-sm font-bold text-slate-800">
                                {o.clientName}
                              </span>
                              <p className="text-xs text-slate-500 truncate mt-0.5">
                                {o.addressStreet}
                              </p>
                            </div>
                          </div>

                          {o.equipmentName && (
                            <div className="flex items-start gap-2 pt-1">
                              <Cpu className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                  Equipamento Atendido
                                </span>
                                <span className="text-xs font-bold text-slate-700">
                                  {o.equipmentName} {o.equipmentBrand ? `(${o.equipmentBrand})` : ''}
                                </span>
                                {o.equipmentPatrimony && (
                                  <p className="text-[10px] text-slate-500">
                                    Patrimônio: {o.equipmentPatrimony} | {o.equipmentBtus || 'Sem BTUs'}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Column 2: Problem & Solution summary */}
                        <div className="space-y-2 bg-slate-50/50 p-3 rounded-xl border border-slate-100/50">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              Relato do Problema
                            </span>
                            <p className="text-xs text-slate-600 line-clamp-2 mt-0.5 font-medium">
                              {o.description || 'Nenhum relato registrado.'}
                            </p>
                          </div>
                          
                          <div className="pt-1.5 border-t border-slate-100">
                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider block">
                              Solução Executada
                            </span>
                            <p className="text-xs text-blue-700 line-clamp-2 mt-0.5 font-semibold">
                              {o.solution || 'Nenhuma solução preenchida.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
