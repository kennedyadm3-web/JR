import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  LineChart,
  Line,
  ComposedChart,
  AreaChart,
  Area
} from 'recharts';
import { 
  Briefcase, 
  TrendingUp, 
  Flame, 
  DollarSign, 
  Plus, 
  Edit2, 
  Trash2, 
  Calendar, 
  Filter, 
  LayoutDashboard, 
  FileSpreadsheet,
  Building2,
  Trophy,
  AlertCircle,
  HelpCircle,
  Printer,
  LayoutGrid,
  Rows,
  ClipboardCheck,
  Settings,
  ArrowUp,
  ArrowDown,
  Save,
  Package
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Client, ContractPerformance, UserRole } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import ContractItemsCatalog from './ContractItemsCatalog';

interface Props {
  managerClientId?: string;
  userRole?: string;
}

export default function ContractsView({ managerClientId, userRole }: Props) {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [performances, setPerformances] = useState<ContractPerformance[]>([]);
  
  // Tab states: 'dashboard' | 'records' | 'checklists' | 'management' | 'catalog'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'records' | 'checklists' | 'management' | 'catalog'>('dashboard');
  
  // Client Preventive Checklist states
  const [selectedChecklistClientId, setSelectedChecklistClientId] = useState<string>('');
  const [checklistItems, setChecklistItems] = useState<string[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState<string>('');
  const [checklistSuccessMessage, setChecklistSuccessMessage] = useState<string>('');
  const [checklistErrorMessage, setChecklistErrorMessage] = useState<string>('');
  const [isSavingChecklist, setIsSavingChecklist] = useState<boolean>(false);
  
  // Charts layout state: 'grid' (2 per row) | 'full' (1 per row)
  const [chartsLayout, setChartsLayout] = useState<'grid' | 'full'>('grid');

  // Client Management States
  const [selectedMgtClientId, setSelectedMgtClientId] = useState<string>('');
  const [mgtFullName, setMgtFullName] = useState<string>('');
  const [mgtCnpj, setMgtCnpj] = useState<string>('');
  const [mgtStateReg, setMgtStateReg] = useState<string>('');
  const [mgtCityReg, setMgtCityReg] = useState<string>('');
  const [mgtFullAddress, setMgtFullAddress] = useState<string>('');
  const [mgtEmail, setMgtEmail] = useState<string>('');
  const [mgtPhone, setMgtPhone] = useState<string>('');
  const [mgtContractNumber, setMgtContractNumber] = useState<string>('');
  const [mgtProcessNumber, setMgtProcessNumber] = useState<string>('');
  const [mgtPricePerMachine, setMgtPricePerMachine] = useState<number | ''>('');
  const [mgtPricePerCorrective, setMgtPricePerCorrective] = useState<number | ''>('');
  const [mgtContractCycle, setMgtContractCycle] = useState<number | ''>('');
  const [mgtServiceCompany, setMgtServiceCompany] = useState<'lefrio' | 'alclima' | ''>('');
  const [mgtCycleMonth, setMgtCycleMonth] = useState<string>('');
  const [mgtCycleStartDate, setMgtCycleStartDate] = useState<string>('');
  const [mgtCycleEndDate, setMgtCycleEndDate] = useState<string>('');
  const [mgtCyclePeriod, setMgtCyclePeriod] = useState<'monthly' | 'bimonthly' | 'quarterly' | 'custom'>('monthly');
  const [mgtCycleRefFormat, setMgtCycleRefFormat] = useState<'number_only' | 'full_period' | 'number_month' | 'period_only'>('number_only');
  const [mgtSharepointFolderLink, setMgtSharepointFolderLink] = useState<string>('');
  const [mgtSharepointFolderId, setMgtSharepointFolderId] = useState<string>('');
  const [mgtSuccessMessage, setMgtSuccessMessage] = useState<string>('');
  const [mgtErrorMessage, setMgtErrorMessage] = useState<string>('');
  const [isSavingMgt, setIsSavingMgt] = useState<boolean>(false);

  // Sync selected management client details
  useEffect(() => {
    const client = clients.find(c => c.id === selectedMgtClientId);
    if (client) {
      setMgtFullName(client.fullName || '');
      setMgtCnpj(client.cnpj || '');
      setMgtStateReg(client.stateRegistration || '');
      setMgtCityReg(client.cityRegistration || '');
      setMgtFullAddress(client.fullAddress || '');
      setMgtContractNumber(client.contractNumber || '');
      setMgtProcessNumber(client.processNumber || '');
      setMgtPricePerMachine(client.pricePerMachine ?? '');
      setMgtPricePerCorrective(client.pricePerCorrective ?? '');
      setMgtContractCycle(client.contractCycle ?? 1);
      setMgtServiceCompany(client.serviceCompany || '');
      setMgtCycleMonth(client.cycleMonth || '');
      setMgtCycleStartDate(client.cycleStartDate || '');
      setMgtCycleEndDate(client.cycleEndDate || '');
      setMgtCyclePeriod(client.cyclePeriod || 'monthly');
      setMgtCycleRefFormat(client.cycleRefFormat || 'number_only');
      setMgtSharepointFolderLink(client.sharepointFolderLink || '');
      setMgtSharepointFolderId(client.sharepointFolderId || '');
      setMgtEmail(client.email || '');
      setMgtPhone(client.phone || '');
      setMgtSuccessMessage('');
      setMgtErrorMessage('');
    } else {
      setMgtFullName('');
      setMgtCnpj('');
      setMgtStateReg('');
      setMgtCityReg('');
      setMgtFullAddress('');
      setMgtContractNumber('');
      setMgtProcessNumber('');
      setMgtPricePerMachine('');
      setMgtPricePerCorrective('');
      setMgtContractCycle('');
      setMgtServiceCompany('');
      setMgtCycleMonth('');
      setMgtCycleStartDate('');
      setMgtCycleEndDate('');
      setMgtCyclePeriod('monthly');
      setMgtCycleRefFormat('number_only');
      setMgtSharepointFolderLink('');
      setMgtSharepointFolderId('');
      setMgtEmail('');
      setMgtPhone('');
      setMgtSuccessMessage('');
      setMgtErrorMessage('');
    }
  }, [selectedMgtClientId, clients]);

  // Detect if printing to fix Recharts width calculation bugs
  const [isPrinting, setIsPrinting] = useState(false);
  
  // Filter states
  const [selectedMonth, setSelectedMonth] = useState<string>('all'); // 'YYYY-MM' or 'all'
  const [selectedClientId, setSelectedClientId] = useState<string>(managerClientId || 'all');

  // Manual entry Form states
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formClientId, setFormClientId] = useState('');
  const [formMonth, setFormMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [formOpenedOrders, setFormOpenedOrders] = useState<number | ''>('');
  const [formClosedOrders, setFormClosedOrders] = useState<number | ''>('');
  const [formSandblastings, setFormSandblastings] = useState<number | ''>('');
  const [formTotalValue, setFormTotalValue] = useState<number | ''>('');
  const [formError, setFormError] = useState<string | null>(null);

  const canEdit = userRole === UserRole.ADMIN || userRole === UserRole.ASSISTANT;

  useEffect(() => {
    loadData();

    const handleBeforePrint = () => setIsPrinting(true);
    const handleAfterPrint = () => setIsPrinting(false);

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        setIsPrinting(false);
      }, 500);
    }, 150);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [allClients, allPerformances] = await Promise.all([
        dataService.getClients(),
        dataService.getContractsPerformance()
      ]);
      setClients(allClients);
      setPerformances(allPerformances);
    } catch (err) {
      console.error('Erro ao carregar dados de contratos:', err);
    } finally {
      setLoading(false);
    }
  };

  // Sync selected client's checklist
  useEffect(() => {
    if (selectedChecklistClientId) {
      const client = clients.find(c => c.id === selectedChecklistClientId);
      if (client) {
        setChecklistItems(client.preventiveChecklist || []);
      } else {
        setChecklistItems([]);
      }
    } else {
      setChecklistItems([]);
    }
    setChecklistSuccessMessage('');
    setChecklistErrorMessage('');
  }, [selectedChecklistClientId, clients]);

  const handleSaveChecklist = async () => {
    if (!selectedChecklistClientId) return;
    setIsSavingChecklist(true);
    setChecklistSuccessMessage('');
    setChecklistErrorMessage('');
    try {
      await dataService.updateClient(selectedChecklistClientId, {
        preventiveChecklist: checklistItems
      });
      // Update local clients state
      setClients(prev => prev.map(c => 
        c.id === selectedChecklistClientId 
          ? { ...c, preventiveChecklist: checklistItems } 
          : c
      ));
      setChecklistSuccessMessage('Checklist de manutenção preventiva salvo com sucesso!');
      setTimeout(() => setChecklistSuccessMessage(''), 4000);
    } catch (err: any) {
      console.error(err);
      setChecklistErrorMessage('Erro ao salvar o checklist. Tente novamente.');
    } finally {
      setIsSavingChecklist(false);
    }
  };

  const handleSaveManagement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMgtClientId) {
      setMgtErrorMessage('Por favor, selecione um cliente.');
      return;
    }

    setIsSavingMgt(true);
    setMgtSuccessMessage('');
    setMgtErrorMessage('');

    try {
      await dataService.updateClient(selectedMgtClientId, {
        fullName: mgtFullName.trim(),
        cnpj: mgtCnpj.trim(),
        stateRegistration: mgtStateReg.trim(),
        cityRegistration: mgtCityReg.trim(),
        fullAddress: mgtFullAddress.trim(),
        contractNumber: mgtContractNumber.trim(),
        processNumber: mgtProcessNumber.trim(),
        pricePerMachine: mgtPricePerMachine === '' ? 0 : Number(mgtPricePerMachine),
        pricePerCorrective: mgtPricePerCorrective === '' ? 0 : Number(mgtPricePerCorrective),
        contractCycle: mgtContractCycle === '' ? 1 : Number(mgtContractCycle),
        serviceCompany: mgtServiceCompany === '' ? undefined : mgtServiceCompany,
        cycleMonth: mgtCycleMonth || undefined,
        cycleStartDate: mgtCycleStartDate || undefined,
        cycleEndDate: mgtCycleEndDate || undefined,
        cyclePeriod: mgtCyclePeriod || 'monthly',
        cycleRefFormat: mgtCycleRefFormat || 'number_only',
        sharepointFolderLink: mgtSharepointFolderLink.trim(),
        sharepointFolderId: mgtSharepointFolderId.trim(),
        email: mgtEmail.trim(),
        phone: mgtPhone.trim()
      });

      setMgtSuccessMessage('Configurações do contrato salvas com sucesso!');
      setTimeout(() => setMgtSuccessMessage(''), 4000);
      
      // Update local clients list
      setClients(prev => prev.map(c => {
        if (c.id === selectedMgtClientId) {
          return {
            ...c,
            fullName: mgtFullName.trim(),
            cnpj: mgtCnpj.trim(),
            stateRegistration: mgtStateReg.trim(),
            cityRegistration: mgtCityReg.trim(),
            fullAddress: mgtFullAddress.trim(),
            contractNumber: mgtContractNumber.trim(),
            processNumber: mgtProcessNumber.trim(),
            pricePerMachine: mgtPricePerMachine === '' ? 0 : Number(mgtPricePerMachine),
            pricePerCorrective: mgtPricePerCorrective === '' ? 0 : Number(mgtPricePerCorrective),
            contractCycle: mgtContractCycle === '' ? 1 : Number(mgtContractCycle),
            serviceCompany: mgtServiceCompany === '' ? undefined : mgtServiceCompany,
            cycleMonth: mgtCycleMonth,
            cycleStartDate: mgtCycleStartDate,
            cycleEndDate: mgtCycleEndDate,
            cyclePeriod: mgtCyclePeriod,
            cycleRefFormat: mgtCycleRefFormat,
            sharepointFolderLink: mgtSharepointFolderLink.trim(),
            sharepointFolderId: mgtSharepointFolderId.trim(),
            email: mgtEmail.trim(),
            phone: mgtPhone.trim()
          };
        }
        return c;
      }));

    } catch (err: any) {
      console.error(err);
      setMgtErrorMessage('Erro ao salvar as configurações: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setIsSavingMgt(false);
    }
  };

  // Generate dynamic unique months options from performances to populate filter dropdown
  const monthOptions = useMemo(() => {
    const monthsSet = new Set<string>();
    performances.forEach(p => {
      if (p.month) monthsSet.add(p.month);
    });
    // Add current month if not exists
    monthsSet.add(format(new Date(), 'yyyy-MM'));
    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [performances]);

  // Handle client dictionary for easy name lookup
  const clientMap = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach(c => {
      map[c.id] = c.name;
    });
    return map;
  }, [clients]);

  // Filtered performances according to filters
  const filteredPerformances = useMemo(() => {
    return performances
      .filter(p => {
        const matchClient = selectedClientId === 'all' || p.clientId === selectedClientId;
        const matchMonth = selectedMonth === 'all' || p.month === selectedMonth;
        return matchClient && matchMonth;
      })
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [performances, selectedClientId, selectedMonth]);

  // Dashboard calculations
  const stats = useMemo(() => {
    let totalValue = 0;
    let totalOpened = 0;
    let totalOrders = 0;
    let totalSandblastings = 0;
    const clientTotals: Record<string, number> = {};

    filteredPerformances.forEach(p => {
      totalValue += p.totalValue || 0;
      totalOpened += p.openedOrders || 0;
      totalOrders += p.closedOrders || 0;
      totalSandblastings += p.sandblastings || 0;

      if (p.clientId) {
        clientTotals[p.clientId] = (clientTotals[p.clientId] || 0) + p.totalValue;
      }
    });

    // Find best contract (highest value)
    let bestClientId = '';
    let highestValue = -1;
    Object.entries(clientTotals).forEach(([cid, val]) => {
      if (val > highestValue) {
        highestValue = val;
        bestClientId = cid;
      }
    });

    const efficiency = totalOpened > 0 ? Math.round((totalOrders / totalOpened) * 100) : 0;

    return {
      totalValue,
      totalOpened,
      totalOrders,
      totalSandblastings,
      efficiency,
      bestContract: bestClientId ? (clientMap[bestClientId] || 'Contrato não id.') : 'Sem lançamentos'
    };
  }, [filteredPerformances, clientMap]);

  // Chart data 1: Client Comparison
  const clientComparisonData = useMemo(() => {
    const clientDataMap: Record<string, { name: string, totalValue: number, openedOrders: number, closedOrders: number, sandblastings: number }> = {};
    
    filteredPerformances.forEach(p => {
      const cName = clientMap[p.clientId] || 'Cliente Desconhecido';
      if (!clientDataMap[p.clientId]) {
        clientDataMap[p.clientId] = {
          name: cName,
          totalValue: 0,
          openedOrders: 0,
          closedOrders: 0,
          sandblastings: 0
        };
      }
      clientDataMap[p.clientId].totalValue += p.totalValue || 0;
      clientDataMap[p.clientId].openedOrders += p.openedOrders || 0;
      clientDataMap[p.clientId].closedOrders += p.closedOrders || 0;
      clientDataMap[p.clientId].sandblastings += p.sandblastings || 0;
    });

    return Object.values(clientDataMap).sort((a, b) => b.totalValue - a.totalValue);
  }, [filteredPerformances, clientMap]);

  // Chart data 2: Monthly Evolution/Trend
  const monthlyTrendData = useMemo(() => {
    const monthlyMap: Record<string, { month: string, monthLabel: string, faturamento: number, abertas: number, ordens: number, jateamentos: number }> = {};
    
    // We only filter by client for the trend if client filter is selected
    const performancesForTrend = performances.filter(p => {
      return selectedClientId === 'all' || p.clientId === selectedClientId;
    });

    performancesForTrend.forEach(p => {
      if (!monthlyMap[p.month]) {
        let label = p.month;
        try {
          const date = new Date(p.month + '-02');
          label = format(date, 'MMM/yy', { locale: ptBR });
        } catch (e) {}

        monthlyMap[p.month] = {
          month: p.month,
          monthLabel: label,
          faturamento: 0,
          abertas: 0,
          ordens: 0,
          jateamentos: 0
        };
      }
      monthlyMap[p.month].faturamento += p.totalValue || 0;
      monthlyMap[p.month].abertas += p.openedOrders || 0;
      monthlyMap[p.month].ordens += p.closedOrders || 0;
      monthlyMap[p.month].jateamentos += p.sandblastings || 0;
    });

    const list = Object.values(monthlyMap).map(item => {
      return {
        ...item,
        eficiencia: item.abertas > 0 ? Math.round((item.ordens / item.abertas) * 100) : 100
      };
    });

    return list.sort((a, b) => a.month.localeCompare(b.month));
  }, [performances, selectedClientId]);

  // Form actions
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formClientId) {
      setFormError('Selecione um cliente.');
      return;
    }
    if (!formMonth) {
      setFormError('Selecione ou insira o mês.');
      return;
    }
    if (formOpenedOrders === '' || formOpenedOrders < 0) {
      setFormError('Insira um número válido para ordens de serviço abertas.');
      return;
    }
    if (formClosedOrders === '' || formClosedOrders < 0) {
      setFormError('Insira um número válido para ordens de serviço fechadas.');
      return;
    }
    if (formSandblastings === '' || formSandblastings < 0) {
      setFormError('Insira um número válido para jateamentos.');
      return;
    }
    if (formTotalValue === '' || formTotalValue < 0) {
      setFormError('Insira um valor total válido.');
      return;
    }

    const payload = {
      clientId: formClientId,
      month: formMonth,
      openedOrders: Number(formOpenedOrders),
      closedOrders: Number(formClosedOrders),
      sandblastings: Number(formSandblastings),
      totalValue: Number(formTotalValue)
    };

    try {
      if (editingId) {
        await dataService.updateContractPerformance(editingId, payload);
      } else {
        // Prevent duplicate record for the same client and month
        const duplicate = performances.find(p => p.clientId === formClientId && p.month === formMonth);
        if (duplicate) {
          setFormError(`Já existe um registro de desempenho cadastrado para este cliente no mês ${formMonth}. Edite o registro existente ou escolha outro mês.`);
          return;
        }
        await dataService.addContractPerformance(payload);
      }
      resetForm();
      loadData();
    } catch (err: any) {
      setFormError('Erro ao salvar os dados: ' + err.message);
    }
  };

  const handleEdit = (perf: ContractPerformance) => {
    setEditingId(perf.id || null);
    setFormClientId(perf.clientId);
    setFormMonth(perf.month);
    setFormOpenedOrders(perf.openedOrders || 0);
    setFormClosedOrders(perf.closedOrders);
    setFormSandblastings(perf.sandblastings);
    setFormTotalValue(perf.totalValue);
    setShowForm(true);
    setActiveTab('records'); // Switch to manual inputs/list tab
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza de que deseja excluir este registro de desempenho?')) {
      return;
    }
    try {
      await dataService.deleteContractPerformance(id);
      loadData();
    } catch (err) {
      console.error('Erro ao excluir:', err);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormClientId('');
    setFormMonth(format(new Date(), 'yyyy-MM'));
    setFormOpenedOrders('');
    setFormClosedOrders('');
    setFormSandblastings('');
    setFormTotalValue('');
    setFormError(null);
    setShowForm(false);
  };

  return (
    <div className="space-y-6 pb-12" id="contracts_container">
      <style>{`
        /* Prevent Recharts responsiveness issues in standard grid layout */
        .recharts-responsive-container {
          min-width: 0 !important;
        }
        
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm 12mm;
          }
          
          /* Hide sidebar, header, navigation tabs, and filters globally during print */
          aside, header, footer, .print\:hidden, nav, #btn_print_contracts, #btn_add_performance {
            display: none !important;
          }
          
          body, #root, main, #contracts_container {
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }

          /* Reset absolute or h-screen layouts during print */
          div.flex.h-screen {
            display: block !important;
            height: auto !important;
          }
          main {
            margin-left: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }

          /* Hide scrollbars & unnecessary visual containers */
          .overflow-x-auto, .overflow-y-auto {
            overflow: visible !important;
          }

          /* Force exact grid column template layout in A4 landscape print */
          .grid {
            display: grid !important;
          }
          .grid-cols-1 {
            grid-template-columns: repeat(1, minmax(0, 1fr)) !important;
          }
          .sm\\:grid-cols-2 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .lg\\:grid-cols-4 {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          }
          .print-grid-cols-2 {
            grid-template-columns: repeat(1, minmax(0, 1fr)) !important;
          }
          .print-grid-cols-1 {
            grid-template-columns: repeat(1, minmax(0, 1fr)) !important;
          }

          /* Ensure grid items never overflow under print */
          .grid > div {
            min-width: 0 !important;
            overflow: hidden !important;
          }

          /* Extremely compact spacing for printed landscape A4 */
          .p-5 {
            padding: 0.75rem 1rem !important;
          }
          .p-6 {
            padding: 0.75rem !important;
          }
          .gap-6 {
            gap: 1.25rem !important;
          }
          .gap-4 {
            gap: 0.5rem !important;
          }
          .space-y-6 > :not([hidden]) ~ :not([hidden]) {
            --tw-space-y-reverse: 0 !important;
            margin-top: 0.75rem !important;
            margin-bottom: 0 !important;
          }

          /* Exact color reproduction for badges and chart elements */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5 print:pb-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-950 flex items-center gap-2 print:text-lg">
            <Briefcase className="w-6 h-6 text-blue-600 print:w-5 print:h-5" />
            Desempenho de Contratos
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-1 print:text-[10px] print:mt-0">
            Área de análise consolidada dos contratos, acompanhamento de ordens de serviço, jateamentos e faturamento mensal.
          </p>
        </div>
        
        <div className="flex items-center gap-2 self-start md:self-auto print:hidden">
          <button
            onClick={handlePrint}
            id="btn_print_contracts"
            className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold py-2.5 px-4 rounded-xl text-xs transition shadow-sm hover:border-gray-300"
          >
            <Printer className="w-4 h-4 text-gray-500" />
            Imprimir A4 Horizontal
          </button>

          {canEdit && (
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
                setActiveTab('records');
              }}
              id="btn_add_performance"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition shadow-md shadow-blue-100"
            >
              <Plus className="w-4 h-4" />
              Novo Lançamento Manual
            </button>
          )}
        </div>
      </div>

      {/* Relatório Impresso Header Metadata */}
      <div className="hidden print:flex flex-col gap-2 border-b border-gray-200 pb-3 mb-4 text-xs font-medium text-gray-600">
        <div className="flex justify-between items-center">
          <span className="font-bold text-gray-900 uppercase tracking-wide">Le Frio Refrigeração — Relatório Executivo de Desempenho</span>
          <span>Data de emissão: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="flex gap-4 text-[10px] text-gray-500">
          <div>
            <span className="font-bold text-gray-700">Filtro de Contrato/Cliente: </span>
            {selectedClientId === 'all' ? 'Todos os Contratos' : (clientMap[selectedClientId] || 'Selecionado')}
          </div>
          <div>
            <span className="font-bold text-gray-700">Mês de Referência: </span>
            {selectedMonth === 'all' ? 'Todos os Meses' : (() => {
              try {
                const d = new Date(selectedMonth + '-02');
                return format(d, 'MMMM yyyy', { locale: ptBR });
              } catch (e) {
                return selectedMonth;
              }
            })()}
          </div>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-gray-100 gap-6 print:hidden">
        <button
          onClick={() => setActiveTab('dashboard')}
          id="tab_dashboard"
          className={cn(
            "pb-3 text-sm font-semibold relative transition-all",
            activeTab === 'dashboard' 
              ? 'text-blue-600' 
              : 'text-gray-400 hover:text-gray-900'
          )}
        >
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4" />
            Painel e Dashboards
          </div>
          {activeTab === 'dashboard' && (
            <motion.div layoutId="tab_indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('records')}
          id="tab_records"
          className={cn(
            "pb-3 text-sm font-semibold relative transition-all",
            activeTab === 'records' 
              ? 'text-blue-600' 
              : 'text-gray-400 hover:text-gray-900'
          )}
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Lançamentos Manuais
          </div>
          {activeTab === 'records' && (
            <motion.div layoutId="tab_indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
          )}
        </button>

        {canEdit && (
          <button
            onClick={() => setActiveTab('checklists')}
            id="tab_checklists"
            className={cn(
              "pb-3 text-sm font-semibold relative transition-all",
              activeTab === 'checklists' 
                ? 'text-blue-600' 
                : 'text-gray-400 hover:text-gray-900'
            )}
          >
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" />
              Checklists Preventivos
            </div>
            {activeTab === 'checklists' && (
              <motion.div layoutId="tab_indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>
        )}

        {canEdit && (
          <button
            onClick={() => setActiveTab('management')}
            id="tab_management"
            className={cn(
              "pb-3 text-sm font-semibold relative transition-all",
              activeTab === 'management' 
                ? 'text-blue-600' 
                : 'text-gray-400 hover:text-gray-900'
            )}
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Gerenciamento
            </div>
            {activeTab === 'management' && (
              <motion.div layoutId="tab_indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>
        )}

        {canEdit && (
          <button
            onClick={() => setActiveTab('catalog')}
            id="tab_catalog"
            className={cn(
              "pb-3 text-sm font-semibold relative transition-all",
              activeTab === 'catalog' 
                ? 'text-blue-600' 
                : 'text-gray-400 hover:text-gray-900'
            )}
          >
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Produtos & Serviços
            </div>
            {activeTab === 'catalog' && (
              <motion.div layoutId="tab_indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
            )}
          </button>
        )}
      </div>

      {/* Quick Filters - Hidden for managers who only view their own client data */}
      {managerClientId ? (
        <div className="bg-blue-50/50 border border-blue-150 p-4 rounded-2xl flex items-center gap-3 print:hidden">
          <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
          <div>
            <p className="text-xs font-bold text-blue-800">Contrato Exclusivo</p>
            <p className="text-xs text-blue-600 font-semibold">{clientMap[managerClientId] || 'Minha Empresa'}</p>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 p-4 rounded-2xl flex flex-wrap gap-4 items-center print:hidden">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-500 mr-2">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            Filtrar Análise:
          </div>
          
          {/* Client Filter */}
          <div className="flex flex-col min-w-[160px]">
            <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold mb-1">Contrato / Cliente</span>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-blue-400 transition"
            >
              <option value="all">Todos os Contratos</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Month Filter */}
          <div className="flex flex-col min-w-[130px]">
            <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold mb-1">Mês de Referência</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-blue-400 transition"
            >
              <option value="all">Todos os Meses</option>
              {monthOptions.map(m => {
                let displayMonth = m;
                try {
                  const d = new Date(m + '-02');
                  displayMonth = format(d, 'MMMM yyyy', { locale: ptBR });
                } catch (e) {}
                return <option key={m} value={m}>{displayMonth}</option>;
              })}
            </select>
          </div>

          <button
            onClick={() => {
              setSelectedClientId('all');
              setSelectedMonth('all');
            }}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline mt-4 sm:mt-0"
          >
            Limpar Filtros
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-2">
          <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-xs text-gray-400 font-semibold italic">Carregando dados de contratos...</p>
        </div>
      ) : activeTab === 'catalog' ? (
        // PRODUCTS AND SERVICES CATALOG & PRICING TABLE VIEW
        <ContractItemsCatalog
          clients={clients}
          canEdit={canEdit}
          managerClientId={managerClientId}
        />
      ) : activeTab === 'management' ? (
        // CLIENT CONTRACT CONFIGURATION / MANAGEMENT VIEW
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* CLIENT LIST COLUMN */}
          <div className="lg:col-span-1 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm h-[calc(100vh-280px)] min-h-[500px] flex flex-col">
            <div className="pb-3 border-b border-gray-100 mb-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-600" />
                Clientes Cadastrados
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Selecione para configurar os parâmetros de faturamento.</p>
            </div>

            {/* Client list selection */}
            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
              {clients.slice().sort((a,b) => a.name.localeCompare(b.name)).map(c => {
                const isSelected = c.id === selectedMgtClientId;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedMgtClientId(c.id);
                      setMgtSuccessMessage('');
                      setMgtErrorMessage('');
                    }}
                    className={cn(
                      "w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-1.5 cursor-pointer",
                      isSelected 
                        ? "bg-blue-50/70 border-blue-500 shadow-sm" 
                        : "bg-slate-50/50 border-slate-100 hover:bg-slate-50 hover:border-slate-200"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={cn("text-xs font-bold uppercase", isSelected ? "text-blue-700" : "text-slate-800")}>
                        {c.name}
                      </span>
                      {c.cnpj && (
                        <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold font-mono">
                          CNPJ ok
                        </span>
                      )}
                    </div>
                    
                    <span className="text-[11px] font-medium text-slate-500 line-clamp-1">
                      {c.fullName || "⚠️ Nome completo não definido"}
                    </span>

                    {c.contractNumber && (
                      <span className="text-[10px] font-semibold text-slate-400">
                        Contrato: {c.contractNumber}
                      </span>
                    )}
                  </button>
                );
              })}
              {clients.length === 0 && (
                <div className="text-center py-8 text-xs text-gray-400 italic">
                  Nenhum cliente cadastrado.
                </div>
              )}
            </div>
          </div>

          {/* EDITOR FORM COLUMN */}
          <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            {selectedMgtClientId ? (
              <form onSubmit={handleSaveManagement} className="space-y-6">
                <div>
                  <h3 className="text-base font-extrabold text-gray-950 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-blue-600" />
                    Parâmetros de Contrato — {clients.find(c => c.id === selectedMgtClientId)?.name}
                  </h3>
                  <p className="text-gray-500 text-xs mt-1">
                    Essas informações são extraídas em tempo real ao gerar notas, relatórios preventivos, guias e faturamentos.
                  </p>
                </div>

                {/* Grid Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Nome Abreviado / Nomeclatura Visual */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      Nome Abreviado (Exibição Interna / Listas Rápidas)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={clients.find(c => c.id === selectedMgtClientId)?.name || ''}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-500 outline-none cursor-not-allowed"
                    />
                    <p className="text-[10px] text-gray-400 font-medium">Este é o nome simplificado cadastrado na aba "Cadastro". Ele serve para agilizar as visualizações do dia a dia.</p>
                  </div>

                  {/* Nome Completo / Razão Social */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest block">
                      Nome Completo para Notas e Documentos Oficiais *
                    </label>
                    <input
                      type="text"
                      required
                      value={mgtFullName}
                      onChange={(e) => setMgtFullName(e.target.value)}
                      placeholder="Ex: Secretaria de Estado da Saúde de Alagoas"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/10 transition"
                    />
                    <p className="text-[10px] text-gray-400 font-medium">Preencha o nome oficial/razão social exata. Este nome será impresso nas planilhas, guias, notas e relatórios oficiais.</p>
                  </div>

                  {/* Empresa Prestadora de Serviço do Contrato */}
                  <div className="space-y-1.5 md:col-span-2 bg-slate-50/50 border border-slate-100 rounded-xl p-4">
                    <label className="text-[10px] font-black text-blue-700 uppercase tracking-widest block">
                      Empresa Prestadora de Serviço (Vínculo de CNPJ) *
                    </label>
                    <select
                      value={mgtServiceCompany}
                      onChange={(e) => setMgtServiceCompany(e.target.value as 'lefrio' | 'alclima' | '')}
                      required
                      className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/10 transition"
                    >
                      <option value="">Selecione qual empresa atende este cliente...</option>
                      <option value="lefrio">JR COMÉRCIO E SERVIÇOS DE CLIMATIZAÇÃO LTDA (Le Frio) — CNPJ: 22.731.413/0002-60</option>
                      <option value="alclima">AL CLIMA COMERCIO E SERVICOS LTDA (Al Clima) — CNPJ: 38.231.188/0001-51</option>
                    </select>
                    <p className="text-[10px] text-gray-400 font-medium mt-1">
                      Selecionar a empresa prestadora correta garante que os dados do cabeçalho, CNPJ, dados de contato e assinaturas das planilhas impressas e relatórios gerados sejam emitidos pela empresa correspondente.
                    </p>
                  </div>

                  {/* CNPJ */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      CNPJ para Faturamento
                    </label>
                    <input
                      type="text"
                      value={mgtCnpj}
                      onChange={(e) => setMgtCnpj(e.target.value)}
                      placeholder="Ex: 00.000.000/0001-00"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/10 transition font-mono"
                    />
                  </div>

                  {/* Inscrição Estadual */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      Inscrição Estadual (I.E.)
                    </label>
                    <input
                      type="text"
                      value={mgtStateReg}
                      onChange={(e) => setMgtStateReg(e.target.value)}
                      placeholder="Isento ou Número"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/10 transition font-mono"
                    />
                  </div>

                  {/* Inscrição Municipal */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      Inscrição Municipal (I.M.)
                    </label>
                    <input
                      type="text"
                      value={mgtCityReg}
                      onChange={(e) => setMgtCityReg(e.target.value)}
                      placeholder="Número se houver"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/10 transition font-mono"
                    />
                  </div>

                  {/* Número de Contrato */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      Número do Contrato
                    </label>
                    <input
                      type="text"
                      value={mgtContractNumber}
                      onChange={(e) => setMgtContractNumber(e.target.value)}
                      placeholder="Ex: 124/2023"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/10 transition font-mono"
                    />
                  </div>

                  {/* Número do Processo */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      Número do Processo Administrativo
                    </label>
                    <input
                      type="text"
                      value={mgtProcessNumber}
                      onChange={(e) => setMgtProcessNumber(e.target.value)}
                      placeholder="Ex: 2000-01254/2023"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/10 transition font-mono"
                    />
                  </div>

                  {/* Ciclo do Contrato */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      Ciclo do Contrato Atual
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={mgtContractCycle}
                      onChange={(e) => setMgtContractCycle(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/10 transition font-mono"
                    />
                  </div>

                  {/* Pasta do SharePoint (Link) */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      Pasta do SharePoint (Link)
                    </label>
                    <input
                      type="text"
                      value={mgtSharepointFolderLink}
                      onChange={(e) => setMgtSharepointFolderLink(e.target.value)}
                      placeholder="https://suaempresa.sharepoint.com/:f:/g/personal/..."
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/10 transition font-mono"
                    />
                  </div>

                  {/* ID da Pasta do SharePoint (Opcional) */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      ID da Pasta do SharePoint (Opcional)
                    </label>
                    <input
                      type="text"
                      value={mgtSharepointFolderId}
                      onChange={(e) => setMgtSharepointFolderId(e.target.value)}
                      placeholder="Ex: ID único ou nome específico da pasta do cliente"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/10 transition font-mono"
                    />
                  </div>

                  {/* Seção Gerenciamento de Ciclos de Contrato */}
                  <div className="md:col-span-2 border-t border-gray-100 pt-5 mt-2 space-y-4">
                    <div>
                      <h4 className="text-xs font-black text-blue-700 uppercase tracking-widest">
                        Gerenciamento de Ciclos de Contrato e Referências
                      </h4>
                      <p className="text-[10px] text-gray-400 font-medium">
                        Configure as datas de início e fim do ciclo e o formato da referência. Ao replicar o mês de cronogramas, estes valores avançarão automaticamente +1 mês.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Frequência do Ciclo */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                          Frequência do Ciclo
                        </label>
                        <select
                          value={mgtCyclePeriod}
                          onChange={(e) => setMgtCyclePeriod(e.target.value as any)}
                          className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none transition"
                        >
                          <option value="monthly">Mensal (+1 Mês)</option>
                          <option value="bimonthly">Bimestral (+2 Meses)</option>
                          <option value="quarterly">Trimestral (+3 Meses)</option>
                        </select>
                      </div>

                      {/* Formato de Referência */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                          Formato de Referência para Documentos
                        </label>
                        <select
                          value={mgtCycleRefFormat}
                          onChange={(e) => setMgtCycleRefFormat(e.target.value as any)}
                          className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none transition"
                        >
                          <option value="number_only">Apenas Número (Ex: Ciclo: 021)</option>
                          <option value="full_period">Número + Período Completo (Ex: Ciclo: 021 - 01/06/2026 a 30/06/2026 (JUN/2026))</option>
                          <option value="number_month">Número + Mês/Ano (Ex: Ciclo: 021 - JUN/2026)</option>
                          <option value="period_only">Apenas Período (Ex: Ciclo: 01/06/2026 a 30/06/2026 (JUN/2026))</option>
                        </select>
                      </div>

                      {/* Mês de Referência */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                          Mês de Referência
                        </label>
                        <input
                          type="month"
                          value={mgtCycleMonth}
                          onChange={(e) => {
                            setMgtCycleMonth(e.target.value);
                            if (!e.target.value) {
                              setMgtCycleStartDate('');
                              setMgtCycleEndDate('');
                            }
                          }}
                          className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none transition font-mono"
                        />
                      </div>

                      {/* Data de Início */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                          Data de Início do Ciclo Atual
                        </label>
                        <input
                          type="date"
                          value={mgtCycleStartDate}
                          disabled={!mgtCycleMonth}
                          onChange={(e) => setMgtCycleStartDate(e.target.value)}
                          className={`w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none transition font-mono ${!mgtCycleMonth ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                      </div>

                      {/* Data de Fim */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                          Data de Fim do Ciclo Atual
                        </label>
                        <input
                          type="date"
                          value={mgtCycleEndDate}
                          disabled={!mgtCycleMonth}
                          onChange={(e) => setMgtCycleEndDate(e.target.value)}
                          className={`w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none transition font-mono ${!mgtCycleMonth ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Preço por Máquina */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      Preço Unitário por Máquina (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={mgtPricePerMachine}
                      onChange={(e) => setMgtPricePerMachine(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/10 transition font-mono"
                    />
                  </div>

                  {/* Preço por Corretiva */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      Preço Unitário por Corretiva (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={mgtPricePerCorrective}
                      onChange={(e) => setMgtPricePerCorrective(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/10 transition font-mono"
                    />
                  </div>

                  {/* E-mail de Contato */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest block">
                      E-mail de Contato para Documentos e O.S.
                    </label>
                    <input
                      type="email"
                      value={mgtEmail}
                      onChange={(e) => setMgtEmail(e.target.value)}
                      placeholder="Ex: contato@cliente.com.br"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/10 transition font-mono"
                    />
                    <p className="text-[10px] text-gray-400 font-medium">Exibido na folha de impressão das Ordens de Serviço.</p>
                  </div>

                  {/* Telefone de Contato */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest block">
                      Telefone de Contato para Documentos e O.S.
                    </label>
                    <input
                      type="text"
                      value={mgtPhone}
                      onChange={(e) => setMgtPhone(e.target.value)}
                      placeholder="Ex: (82) 3221-1031 / (82) 99999-9999"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/10 transition font-mono"
                    />
                    <p className="text-[10px] text-gray-400 font-medium">Exibido no campo Telefone da Ordem de Serviço impressa.</p>
                  </div>

                  {/* Endereço Sede */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                      Endereço Sede da Contratante
                    </label>
                    <textarea
                      rows={2}
                      value={mgtFullAddress}
                      onChange={(e) => setMgtFullAddress(e.target.value)}
                      placeholder="Ex: Avenida Fernandes Lima, s/n - Farol, Maceió - AL, CEP 57055-000"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/10 transition resize-none"
                    />
                  </div>

                </div>

                {/* Notifications & Submit */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-100 mt-6">
                  <div className="text-xs">
                    {mgtSuccessMessage && (
                      <span className="text-emerald-600 font-bold flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        {mgtSuccessMessage}
                      </span>
                    )}
                    {mgtErrorMessage && (
                      <span className="text-red-600 font-bold flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                        {mgtErrorMessage}
                      </span>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingMgt}
                    className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl transition shadow-md shadow-blue-100 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSavingMgt ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Salvar Configurações
                  </button>
                </div>
              </form>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed border-gray-150 rounded-2xl bg-gray-50/50 py-16">
                <Building2 className="w-12 h-12 text-slate-300 mb-3" />
                <h4 className="text-sm font-bold text-gray-700">Nenhum Cliente Selecionado</h4>
                <p className="text-xs text-gray-400 max-w-xs mt-1">
                  Selecione um cliente na lista à esquerda para carregar e gerenciar seus parâmetros de faturamento e contrato.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'checklists' ? (
        // CLIENT CHECKLIST CONFIGURATION VIEW
        <div className="space-y-6">
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5 mb-6">
              <div>
                <h3 className="text-base font-extrabold text-gray-950 flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-blue-600" />
                  Checklists de Manutenção Preventiva por Cliente
                </h3>
                <p className="text-gray-500 text-xs mt-1">
                  Selecione um cliente e gerencie as tarefas preventivas obrigatórias que os técnicos preencherão no tablet.
                </p>
              </div>
            </div>

            {/* Client selector */}
            <div className="max-w-md space-y-2 mb-6">
              <label className="text-xs font-bold text-gray-600 block">Selecione o Cliente</label>
              <select
                value={selectedChecklistClientId}
                onChange={(e) => setSelectedChecklistClientId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition"
              >
                <option value="">Selecione um cliente...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {selectedChecklistClientId ? (
              <div className="space-y-6">
                {/* Actions banner */}
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-3">
                  <div className="text-xs text-slate-600 font-medium">
                    {checklistItems.length === 0 ? (
                      <span className="text-amber-600 font-bold flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        Este cliente não tem nenhum checklist configurado e usará as tarefas padrão.
                      </span>
                    ) : (
                      <span>Este cliente tem <strong className="text-slate-900 font-black">{checklistItems.length}</strong> itens de checklist configurados.</span>
                    )}
                  </div>
                  {checklistItems.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setChecklistItems([
                          "Limpeza dos filtros de ar",
                          "Verificação do dreno e bandeja de dreno",
                          "Verificação de ruídos e vibrações",
                          "Verificação da carga de fluido refrigerante",
                          "Medição de corrente e tensão elétrica",
                          "Reaperto das conexões elétricas",
                          "Limpeza das serpentinas (evaporadora/condensadora)"
                        ]);
                      }}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-lg transition-all cursor-pointer"
                    >
                      Carregar Lista Padrão
                    </button>
                  )}
                </div>

                {/* Form to add single item */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newChecklistItem}
                    onChange={(e) => setNewChecklistItem(e.target.value)}
                    placeholder="Adicionar nova tarefa preventiva..."
                    className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 font-medium text-gray-800"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newChecklistItem.trim()) {
                          setChecklistItems(prev => [...prev, newChecklistItem.trim()]);
                          setNewChecklistItem('');
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newChecklistItem.trim()) {
                        setChecklistItems(prev => [...prev, newChecklistItem.trim()]);
                        setNewChecklistItem('');
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl transition shadow-xs cursor-pointer"
                  >
                    Adicionar
                  </button>
                </div>

                {/* Items list */}
                {checklistItems.length > 0 ? (
                  <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-xs">
                    <ul className="divide-y divide-gray-100 bg-white">
                      {checklistItems.map((item, idx) => {
                        const moveUp = () => {
                          if (idx === 0) return;
                          setChecklistItems(prev => {
                            const next = [...prev];
                            const temp = next[idx];
                            next[idx] = next[idx - 1];
                            next[idx - 1] = temp;
                            return next;
                          });
                        };

                        const moveDown = () => {
                          if (idx === checklistItems.length - 1) return;
                          setChecklistItems(prev => {
                            const next = [...prev];
                            const temp = next[idx];
                            next[idx] = next[idx + 1];
                            next[idx + 1] = temp;
                            return next;
                          });
                        };

                        const removeItem = () => {
                          setChecklistItems(prev => prev.filter((_, i) => i !== idx));
                        };

                        const updateItemText = (newVal: string) => {
                          setChecklistItems(prev => prev.map((val, i) => i === idx ? newVal : val));
                        };

                        return (
                          <li key={idx} className="p-3 flex items-center justify-between gap-4 hover:bg-slate-50 transition">
                            <div className="flex items-center gap-3 flex-1">
                              <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full w-6 text-center">
                                {idx + 1}
                              </span>
                              <input
                                type="text"
                                value={item}
                                onChange={(e) => updateItemText(e.target.value)}
                                className="w-full text-xs font-semibold text-gray-800 bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-blue-500/20 px-2 py-1 rounded font-medium"
                              />
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={moveUp}
                                disabled={idx === 0}
                                className={cn(
                                  "p-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer",
                                  idx === 0 ? "opacity-30 cursor-not-allowed" : "text-gray-500 hover:text-gray-800"
                                )}
                              >
                                <ArrowUp className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={moveDown}
                                disabled={idx === checklistItems.length - 1}
                                className={cn(
                                  "p-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer",
                                  idx === checklistItems.length - 1 ? "opacity-30 cursor-not-allowed" : "text-gray-500 hover:text-gray-800"
                                )}
                              >
                                <ArrowDown className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={removeItem}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 hover:text-red-700 transition cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <div className="py-10 text-center border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                    <p className="text-xs text-gray-400 font-bold italic">Nenhuma tarefa preventiva adicionada. Clique em "Carregar Lista Padrão" ou digite no campo acima para começar.</p>
                  </div>
                )}

                {/* Notifications & Save button */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-100">
                  <div className="text-xs">
                    {checklistSuccessMessage && (
                      <span className="text-emerald-600 font-bold">{checklistSuccessMessage}</span>
                    )}
                    {checklistErrorMessage && (
                      <span className="text-red-600 font-bold">{checklistErrorMessage}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveChecklist}
                    disabled={isSavingChecklist}
                    className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl transition shadow-md shadow-blue-100 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSavingChecklist ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Salvar Checklist do Cliente
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                <p className="text-xs text-gray-400 font-bold italic">Selecione um cliente acima para começar a configurar seu checklist de manutenções preventivas.</p>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'dashboard' ? (
        // DASHBOARD VIEW
        <div className="space-y-6">
          
          {/* KPI Bento Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* KPI 1: Total Value */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition duration-250 flex items-center gap-4">
              <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-100">
                <DollarSign className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Faturamento Gerado</p>
                <p className="text-xl font-extrabold text-gray-950 mt-1">
                  {stats.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <p className="text-[10px] text-gray-400 font-medium mt-0.5">Soma dos contratos filtrados</p>
              </div>
            </div>

            {/* KPI 2: Total Closed vs Opened OS */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition duration-250 flex items-center gap-4">
              <div className="bg-blue-50 p-3.5 rounded-2xl border border-blue-100">
                <Briefcase className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">O.S. Fechadas / Abertas</p>
                <p className="text-2xl font-extrabold text-gray-950 mt-1">
                  {stats.totalOrders} <span className="text-gray-400 text-sm font-semibold">de {stats.totalOpened}</span>
                </p>
                <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                  {stats.totalOpened - stats.totalOrders > 0 
                    ? `${stats.totalOpened - stats.totalOrders} O.S. não fechadas / pendentes` 
                    : "Todas as O.S. foram fechadas!"}
                </p>
              </div>
            </div>

            {/* KPI 3: Total Sandblastings */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition duration-250 flex items-center gap-4">
              <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-100">
                <Flame className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Jateamentos Realizados</p>
                <p className="text-2xl font-extrabold text-gray-950 mt-1">{stats.totalSandblastings}</p>
                <p className="text-[10px] text-gray-400 font-medium mt-0.5">Total de lavagens de alta pressão</p>
              </div>
            </div>

            {/* KPI 4: Contract Closing Efficiency */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition duration-250 flex items-center gap-4">
              <div className={cn(
                "p-3.5 rounded-2xl border",
                stats.efficiency >= 95 ? "bg-emerald-50 border-emerald-100" :
                stats.efficiency >= 80 ? "bg-blue-50 border-blue-100" : "bg-red-50 border-red-100"
              )}>
                <TrendingUp className={cn(
                  "w-6 h-6",
                  stats.efficiency >= 95 ? "text-emerald-600" :
                  stats.efficiency >= 80 ? "text-blue-600" : "text-red-600"
                )} />
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Eficiência do Contrato</p>
                <p className="text-2xl font-extrabold text-gray-950 mt-1">
                  {stats.efficiency}%
                </p>
                <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                  {stats.efficiency >= 95 ? "Excelente nível de cobrança" :
                   stats.efficiency >= 80 ? "Bom nível, atenção a pendências" : "Atenção: alto risco de perdas"}
                </p>
              </div>
            </div>
          </div>

          {/* Charts Layout Control & Section Title */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4 print:hidden">
            <div>
              <h2 className="text-base font-bold text-gray-950 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Gráficos de Análise de Desempenho
              </h2>
              <p className="text-xs text-gray-500">Acompanhamento temporal, faturamento e eficiência consolidada do contrato.</p>
            </div>
            
            <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-xl border border-gray-200 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setChartsLayout('grid')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200",
                  chartsLayout === 'grid'
                    ? "bg-white text-blue-600 shadow-sm border border-gray-100"
                    : "text-gray-500 hover:text-gray-900 border border-transparent"
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5 text-blue-600" />
                Lado a Lado (2 por linha)
              </button>
              <button
                type="button"
                onClick={() => setChartsLayout('full')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200",
                  chartsLayout === 'full'
                    ? "bg-white text-blue-600 shadow-sm border border-gray-100"
                    : "text-gray-500 hover:text-gray-900 border border-transparent"
                )}
              >
                <Rows className="w-3.5 h-3.5 text-blue-600" />
                Largura Inteira (1 por linha)
              </button>
            </div>
          </div>

          {/* Charts Grid */}
          <div className={cn(
            "grid gap-6 print:gap-4",
            chartsLayout === 'grid' 
              ? "grid-cols-1 lg:grid-cols-2 print-grid-cols-2" 
              : "grid-cols-1 print-grid-cols-1"
          )}>
            
            {/* Chart 1: Faturamento Mensal (Valores somente) */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm min-w-0 overflow-hidden">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-gray-950 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  Gráfico de Faturamento Gerado (R$)
                </h3>
                <p className="text-xs text-gray-500">Evolução e tendência do faturamento mensal consolidado.</p>
              </div>

              <div className="w-full h-64 print:h-[260px]">
                {monthlyTrendData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-gray-400 italic">
                    Sem dados de faturamento suficientes para exibir o gráfico.
                  </div>
                ) : isPrinting ? (
                  <BarChart 
                    width={1000} 
                    height={260} 
                    data={monthlyTrendData}
                    margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F3F5" />
                    <XAxis dataKey="monthLabel" stroke="#94A3B8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `R$${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`} />
                    <Tooltip 
                      formatter={(value: any) => [
                        Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                        'Faturamento'
                      ]}
                      contentStyle={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                    />
                    <Bar dataKey="faturamento" name="Faturamento" fill="#10B981" radius={[4, 4, 0, 0]} barSize={24} isAnimationActive={false} />
                  </BarChart>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F3F5" />
                      <XAxis dataKey="monthLabel" stroke="#94A3B8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `R$${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`} />
                      <Tooltip 
                        formatter={(value: any) => [
                          Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                          'Faturamento'
                        ]}
                        contentStyle={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                      />
                      <Bar dataKey="faturamento" name="Faturamento" fill="#10B981" radius={[4, 4, 0, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 2: Fluxo de Ordens de Serviço (O.S. Abertas vs Fechadas) */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm min-w-0 overflow-hidden">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-gray-950 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-blue-600" />
                  Gráfico de Ordens de Serviço (Total de O.S.)
                </h3>
                <p className="text-xs text-gray-500">Volume total de ordens abertas versus ordens efetivamente fechadas.</p>
              </div>

              <div className="w-full h-64 print:h-[260px]">
                {monthlyTrendData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-gray-400 italic">
                    Sem dados de O.S. suficientes para exibir o gráfico.
                  </div>
                ) : isPrinting ? (
                  <BarChart 
                    width={1000} 
                    height={260} 
                    data={monthlyTrendData}
                    margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F3F5" />
                    <XAxis dataKey="monthLabel" stroke="#94A3B8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip 
                      formatter={(value: any, name: any) => [
                        value,
                        name === 'abertas' ? 'O.S. Abertas' : 'O.S. Fechadas'
                      ]}
                      contentStyle={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} />
                    <Bar dataKey="abertas" name="abertas" fill="#94A3B8" radius={[4, 4, 0, 0]} barSize={14} isAnimationActive={false} />
                    <Bar dataKey="ordens" name="ordens" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={14} isAnimationActive={false} />
                  </BarChart>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyTrendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F3F5" />
                      <XAxis dataKey="monthLabel" stroke="#94A3B8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip 
                        formatter={(value: any, name: any) => [
                          value,
                          name === 'abertas' ? 'O.S. Abertas' : 'O.S. Fechadas'
                        ]}
                        contentStyle={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} />
                      <Bar dataKey="abertas" name="abertas" fill="#94A3B8" radius={[4, 4, 0, 0]} barSize={14} />
                      <Bar dataKey="ordens" name="ordens" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 3: Gráfico de Eficiência do Contrato (%) */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm min-w-0 overflow-hidden">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-gray-950 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                  Gráfico de Eficiência de Fechamento (%)
                </h3>
                <p className="text-xs text-gray-500">Histórico do percentual de ordens finalizadas em relação às abertas.</p>
              </div>

              <div className="w-full h-64 print:h-[260px]">
                {monthlyTrendData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-gray-400 italic">
                    Sem dados de eficiência suficientes para exibir o gráfico.
                  </div>
                ) : isPrinting ? (
                  <LineChart 
                    width={1000} 
                    height={260} 
                    data={monthlyTrendData}
                    margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F3F5" />
                    <XAxis dataKey="monthLabel" stroke="#94A3B8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} domain={[0, 100]} />
                    <Tooltip 
                      formatter={(value: any) => [`${value}%`, 'Eficiência']}
                      contentStyle={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                    />
                    <Line type="monotone" dataKey="eficiencia" name="Eficiência" stroke="#8B5CF6" strokeWidth={3} activeDot={{ r: 6 }} dot={{ r: 4, stroke: '#8B5CF6', strokeWidth: 2, fill: '#FFF' }} isAnimationActive={false} />
                  </LineChart>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyTrendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F3F5" />
                      <XAxis dataKey="monthLabel" stroke="#94A3B8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} domain={[0, 100]} />
                      <Tooltip 
                        formatter={(value: any) => [`${value}%`, 'Eficiência']}
                        contentStyle={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                      />
                      <Line type="monotone" dataKey="eficiencia" name="Eficiência" stroke="#8B5CF6" strokeWidth={3} activeDot={{ r: 6 }} dot={{ r: 4, stroke: '#8B5CF6', strokeWidth: 2, fill: '#FFF' }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 4: Client Comparison or Sandblasting Volume */}
            {!managerClientId && selectedClientId === 'all' ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm min-w-0 overflow-hidden">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-gray-950 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    Faturamento Comparado entre Contratos
                  </h3>
                  <p className="text-xs text-gray-500">Distribuição total de faturamento por cada contrato de cliente.</p>
                </div>

                <div className="w-full h-64 print:h-[260px]">
                  {clientComparisonData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-gray-400 italic">
                      Cadastre desempenhos para comparar os faturamentos dos contratos.
                    </div>
                  ) : isPrinting ? (
                    <BarChart 
                      width={1000} 
                      height={260} 
                      data={clientComparisonData} 
                      layout="vertical"
                      margin={{ top: 10, right: 15, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F3F5" />
                      <XAxis type="number" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `R$${val}`} />
                      <YAxis type="category" dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} width={100} />
                      <Tooltip 
                        formatter={(value: any) => [Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 'Faturamento']}
                        contentStyle={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}
                      />
                      <Bar dataKey="totalValue" fill="#6366F1" radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false} />
                    </BarChart>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={clientComparisonData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F3F5" />
                        <XAxis type="number" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `R$${val}`} />
                        <YAxis type="category" dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} width={100} />
                        <Tooltip 
                          formatter={(value: any) => [Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 'Faturamento']}
                          contentStyle={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}
                        />
                        <Bar dataKey="totalValue" fill="#6366F1" radius={[0, 4, 4, 0]} barSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm min-w-0 overflow-hidden">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-gray-950 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-500" />
                    Volume de Jateamentos Mensais
                  </h3>
                  <p className="text-xs text-gray-500">Histórico de lavagens e jateamentos de alta pressão executados.</p>
                </div>

                <div className="w-full h-64 print:h-[260px]">
                  {monthlyTrendData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-gray-400 italic">
                      Sem dados de jateamento suficientes para exibir o gráfico.
                    </div>
                  ) : isPrinting ? (
                    <BarChart 
                      width={1000} 
                      height={260} 
                      data={monthlyTrendData}
                      margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F3F5" />
                      <XAxis dataKey="monthLabel" stroke="#94A3B8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip 
                        formatter={(value: any) => [value, 'Jateamentos']}
                        contentStyle={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}
                      />
                      <Bar dataKey="jateamentos" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={16} isAnimationActive={false} />
                    </BarChart>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyTrendData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F3F5" />
                        <XAxis dataKey="monthLabel" stroke="#94A3B8" fontSize={11} tickLine={false} />
                        <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip 
                          formatter={(value: any) => [value, 'Jateamentos']}
                          contentStyle={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}
                        />
                        <Bar dataKey="jateamentos" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      ) : (
        // RECORDS / MANUAL ENTRY VIEW
        <div className="space-y-6">
          
          {/* Manual entry Form Modal/Panel */}
          {showForm && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-50 border border-gray-200 rounded-2xl p-5 relative"
            >
              <h3 className="text-sm font-bold text-gray-950 mb-3 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                {editingId ? 'Editar Desempenho de Contrato' : 'Cadastrar Desempenho de Contrato'}
              </h3>

              <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 items-end">
                {/* Client Select */}
                <div className="flex flex-col">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Cliente / Contrato</label>
                  <select
                    value={formClientId}
                    onChange={(e) => setFormClientId(e.target.value)}
                    disabled={!!editingId}
                    className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
                  >
                    <option value="">Selecione...</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Month Select */}
                <div className="flex flex-col">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Mês de Referência</label>
                  <input
                    type="month"
                    value={formMonth}
                    onChange={(e) => setFormMonth(e.target.value)}
                    disabled={!!editingId}
                    className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
                  />
                </div>

                {/* Opened OS */}
                <div className="flex flex-col">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">O.S. Abertas (Mês)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Ex: 15"
                    value={formOpenedOrders}
                    onChange={(e) => setFormOpenedOrders(e.target.value === '' ? '' : Number(e.target.value))}
                    className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
                  />
                </div>

                {/* Closed OS */}
                <div className="flex flex-col">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">O.S. Fechadas (Mês)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Ex: 12"
                    value={formClosedOrders}
                    onChange={(e) => setFormClosedOrders(e.target.value === '' ? '' : Number(e.target.value))}
                    className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
                  />
                </div>

                {/* Sandblastings */}
                <div className="flex flex-col">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Jateamentos Feitos</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Ex: 8"
                    value={formSandblastings}
                    onChange={(e) => setFormSandblastings(e.target.value === '' ? '' : Number(e.target.value))}
                    className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
                  />
                </div>

                {/* Total Value */}
                <div className="flex flex-col">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Valor Total Gerado (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ex: 3450.00"
                    value={formTotalValue}
                    onChange={(e) => setFormTotalValue(e.target.value === '' ? '' : Number(e.target.value))}
                    className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition"
                  />
                </div>

                {/* Form Buttons */}
                <div className="lg:col-span-5 flex justify-end gap-3 mt-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-semibold py-2 px-4 rounded-xl transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-5 rounded-xl transition shadow"
                  >
                    {editingId ? 'Salvar Alterações' : 'Gravar Desempenho'}
                  </button>
                </div>
              </form>

              {formError && (
                <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-3 flex items-center gap-2 text-xs text-red-600 font-semibold">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  {formError}
                </div>
              )}
            </motion.div>
          )}

          {/* List of Performances */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">
                Lançamentos Registrados ({filteredPerformances.length})
              </h3>
            </div>

            <div className="overflow-x-auto">
              {filteredPerformances.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400 italic">
                  Nenhum registro de desempenho encontrado para os filtros selecionados.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black uppercase tracking-wider text-gray-400">
                      <th className="p-4">Cliente / Contrato</th>
                      <th className="p-4">Mês</th>
                      <th className="p-4">Ordens (Fechadas/Abertas)</th>
                      <th className="p-4">Eficiência</th>
                      <th className="p-4">Jateamentos</th>
                      <th className="p-4">Faturamento</th>
                      {canEdit && <th className="p-4 text-right print:hidden">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 font-medium text-gray-700">
                    {filteredPerformances.map((p) => {
                      let monthDisplay = p.month;
                      try {
                        const d = new Date(p.month + '-02');
                        monthDisplay = format(d, 'MMMM yyyy', { locale: ptBR });
                      } catch (e) {}

                      const itemEfficiency = p.openedOrders > 0 ? Math.round((p.closedOrders / p.openedOrders) * 100) : 100;

                      return (
                        <tr key={p.id} className="hover:bg-gray-50/50 transition">
                          <td className="p-4 text-gray-900 font-bold">
                            {clientMap[p.clientId] || 'Carregando...'}
                          </td>
                          <td className="p-4 capitalize">
                            {monthDisplay}
                          </td>
                          <td className="p-4 font-bold text-blue-600">
                            {p.closedOrders} <span className="text-gray-400 font-semibold text-[10px]">de {p.openedOrders || 0}</span>
                          </td>
                          <td className="p-4">
                            <span className={cn(
                              "px-2 py-1 rounded-full text-[10px] font-black",
                              itemEfficiency >= 95 ? "bg-emerald-50 text-emerald-700" :
                              itemEfficiency >= 80 ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"
                            )}>
                              {itemEfficiency}%
                            </span>
                          </td>
                          <td className="p-4 font-bold text-amber-600">
                            {p.sandblastings} jat.
                          </td>
                          <td className="p-4 font-extrabold text-emerald-600">
                            {p.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          {canEdit && (
                            <td className="p-4 text-right print:hidden">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleEdit(p)}
                                  className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-gray-100 transition"
                                  title="Editar registro"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => p.id && handleDelete(p.id)}
                                  className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-gray-155 transition"
                                  title="Excluir registro"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
