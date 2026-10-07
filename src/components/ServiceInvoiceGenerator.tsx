import { useState, useEffect, useMemo, useCallback } from 'react';
import { dataService } from '../services/dataService';
import { Client, Address, MaintenanceRecord, ServiceCall, MaintenanceStatus, ServiceCallStatus } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  FileText, 
  Receipt, 
  Percent, 
  Check, 
  Plus, 
  Trash, 
  PlusCircle, 
  Save, 
  Printer, 
  Edit, 
  Eye, 
  Building2, 
  Calendar, 
  Calculator,
  RefreshCw,
  Sparkles,
  DollarSign,
  AlertCircle,
  FileCheck2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { CompanyLogo, getCompanyConfigFromCache } from './CompanyLogo';

export const COMPANIES_INFO = {
  lefrio: {
    key: 'lefrio',
    name: 'JR COMÉRCIO E SERVIÇOS DE CLIMATIZAÇÃO LTDA',
    shortName: 'LE FRIO',
    logoText: 'LE FRIO',
    logoSubText: 'REFRIGERAÇÃO',
    logoBgColor: 'bg-blue-600',
    cnpj: '22.731.413/0002-60',
    ie: '247308110',
    im: '901424174',
    address: 'RUA DR. ELISIO ALVES PEROBA, 103 - ANTARES - MACEIO - AL',
    email: 'atendimentomaceio@lefrio.com.br',
    phone: '(82) 3221-1031'
  },
  alclima: {
    key: 'alclima',
    name: 'AL CLIMA COMERCIO E SERVICOS LTDA',
    shortName: 'AL CLIMA',
    logoText: 'AL CLIMA',
    logoSubText: 'REFRIGERAÇÃO',
    logoBgColor: 'bg-emerald-800',
    cnpj: '38.231.188/0001-51',
    ie: '24031996-6',
    im: '901472869',
    address: 'RUA RITA DE CASSIA, 42 - GRUTA DE LOURDES - MACEIO - AL',
    email: 'atendimento@alclima.com.br',
    phone: '(82) 3435-1524'
  }
};

interface Props {
  managerClientId?: string;
}

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitValue: number;
  date?: string;
  os?: string;
  empresa?: string;
  codigo?: string;
}

// Helpers for the Guia de Solicitação (Etapa 1)
const getMonthAbbr = (monthStr: string) => {
  if (!monthStr) return 'JUL/2026';
  const parts = monthStr.split('-');
  if (parts.length < 2) return 'JUL/2026';
  const y = parts[0];
  const m = parseInt(parts[1], 10);
  const abbrs = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  return `${abbrs[m - 1]}/${y}`;
};

const getContractRangeStr = (monthStr: string) => {
  if (!monthStr) return '27/06/2026 A 26/07/2026';
  const parts = monthStr.split('-');
  if (parts.length < 2) return '27/06/2026 A 26/07/2026';
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  
  let prevM = m - 1;
  let prevY = y;
  if (prevM === 0) {
    prevM = 12;
    prevY = y - 1;
  }
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `27/${pad(prevM)}/${prevY} A 26/${pad(m)}/${y}`;
};

const formatDateBRL = (dateStr?: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

export function ServiceInvoiceGenerator({ managerClientId }: Props) {
  // Data State
  const [clients, setClients] = useState<Client[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [serviceCalls, setServiceCalls] = useState<ServiceCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Configuration State
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [month, setMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [docTab, setDocTab] = useState<'editor' | 'preview'>('editor');
  const [previewType, setPreviewType] = useState<'guia' | 'measurement'>('guia');
  
  // Document Custom Fields
  const [documentNumber, setDocumentNumber] = useState<string>('');
  const [issueDate, setIssueDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [contractNumber, setContractNumber] = useState<string>('');
  const [processNumber, setProcessNumber] = useState<string>('');
  const [selectedCycle, setSelectedCycle] = useState<number>(1);
  const [cnpj, setCnpj] = useState<string>('');
  const [stateRegistration, setStateRegistration] = useState<string>('');
  const [cityRegistration, citySetRegistration] = useState<string>('');
  const [fullAddress, setFullAddress] = useState<string>('');
  
  // Guia Specific Fields (Etapa 1)
  const [guiaNumber, setGuiaNumber] = useState<string>('1669');
  const [empresaName, setEmpresaName] = useState<string>('009 - AL MATRIZ AL');
  const [guiaOsNumber, setGuiaOsNumber] = useState<string>('6778');
  const [customObsNota, setCustomObsNota] = useState<string>('');
  const [customObsGuia, setCustomObsGuia] = useState<string>('');
  
  // Pricing defaults on invoice UI
  const [pricePerMachine, setPricePerMachine] = useState<number>(0);
  const [pricePerCorrective, setPricePerCorrective] = useState<number>(0);
  
  // Items state
  const [items, setItems] = useState<InvoiceItem[]>([]);
  
  // Retentions & Deductions
  const [issPercent, setIssPercent] = useState<number>(2); // Default ISS is 2%
  const [inssPercent, setInssPercent] = useState<number>(0);
  const [pisPercent, setPisPercent] = useState<number>(0);
  const [cofinsPercent, setCofinsPercent] = useState<number>(0);
  const [csllPercent, setCsllPercent] = useState<number>(0);
  const [irrfPercent, setIrrfPercent] = useState<number>(0);
  const [otherDeductions, setOtherDeductions] = useState<number>(0);

  // Load Database Items
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [c, a, r, s] = await Promise.all([
          dataService.getClients(),
          dataService.getAddresses(),
          dataService.getRecords(month),
          dataService.getServiceCalls()
        ]);
        
        setClients(c.filter(client => !managerClientId || client.id === managerClientId));
        setAddresses(a.filter(addr => !managerClientId || addr.clientId === managerClientId));
        setRecords(r);
        setServiceCalls(s.filter(call => !managerClientId || call.clientId === managerClientId));
      } catch (err) {
        console.error("Error loading data for invoice generator:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [month, managerClientId]);

  // Load client parameters when selected client changes
  const selectedClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId);
  }, [clients, selectedClientId]);

  const invoiceCompanyKey = useMemo(() => {
    return selectedClient?.serviceCompany || 'alclima';
  }, [selectedClient]);

  const invoiceCompany = useMemo(() => {
    const base = COMPANIES_INFO[invoiceCompanyKey] || COMPANIES_INFO.alclima;
    const cached = getCompanyConfigFromCache(invoiceCompanyKey);
    return {
      ...base,
      name: cached?.fullName || cached?.shortName || base.name,
      shortName: cached?.shortName || base.shortName,
      cnpj: cached?.cnpj || base.cnpj,
      ie: cached?.ie || base.ie,
      im: cached?.im || base.im,
      address: cached?.address || base.address,
      email: cached?.email || base.email,
      phone: cached?.phone || base.phone,
      logoUrl: cached?.logoUrl
    };
  }, [invoiceCompanyKey]);

  const brandColorClass = useMemo(() => {
    return invoiceCompanyKey === 'lefrio' ? 'bg-blue-600' : 'bg-[#009640]';
  }, [invoiceCompanyKey]);

  const getFormattedCycleStr = useCallback(() => {
    const num = String(selectedCycle).padStart(3, '0');
    const formatType = selectedClient?.cycleRefFormat || 'number_only';
    
    const start = formatDateBRL(selectedClient?.cycleStartDate);
    const end = formatDateBRL(selectedClient?.cycleEndDate);
    const abbr = getMonthAbbr(month);
    
    if (formatType === 'full_period' && start && end) {
      return `${num} - ${start} a ${end} (${abbr})`;
    }
    if (formatType === 'number_month') {
      return `${num} - ${abbr}`;
    }
    if (formatType === 'period_only' && start && end) {
      return `${start} a ${end} (${abbr})`;
    }
    return num;
  }, [selectedCycle, selectedClient, month]);

  useEffect(() => {
    if (selectedClient) {
       setCnpj(selectedClient.cnpj || '');
       setStateRegistration(selectedClient.stateRegistration || '');
       citySetRegistration(selectedClient.cityRegistration || '');
       setFullAddress(selectedClient.fullAddress || '');
       setContractNumber(selectedClient.contractNumber || '');
       setProcessNumber(selectedClient.processNumber || '');
       setPricePerMachine(selectedClient.pricePerMachine || 0);
       setPricePerCorrective(selectedClient.pricePerCorrective || 0);
       setSelectedCycle(selectedClient.contractCycle || 1);
      
      // Auto suggest document number (e.g., MED-YYYYMM-ClientSlug)
      const dateCode = month.replace('-', '');
      const clientSlug = selectedClient.name
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove accents
        .replace(/[^A-Z0-9]/g, '') // remove non-alphanumeric
        .substring(0, 5);
      setDocumentNumber(`MED-${dateCode}-${clientSlug}`);
      
      // Trigger system analysis automatically
      analyzeSystemData(selectedClient);
    } else {
      setCnpj('');
      setStateRegistration('');
      citySetRegistration('');
      setFullAddress('');
      setContractNumber('');
      setProcessNumber('');
      setPricePerMachine(0);
      setPricePerCorrective(0);
      setSelectedCycle(1);
      setDocumentNumber('');
      setItems([]);
    }
  }, [selectedClientId, selectedClient, month]);

  // Trigger analysis for current month
  const analyzeSystemData = (clientObj = selectedClient) => {
    if (!clientObj) return;
    
    // 1. Calculate Preventive Maintenance completed machines
    const clientAddrs = addresses.filter(a => a.clientId === clientObj.id);
    const clientAddrIds = new Set(clientAddrs.map(a => a.id));
    
    const clientRecords = records.filter(
      r => clientAddrIds.has(r.addressId) && r.status === MaintenanceStatus.COMPLETED
    );
    const machinesCount = clientRecords.reduce((sum, r) => sum + (r.executedQuantity || 0), 0);
    
    // 2. Calculate Corrective Maintenance resolved calls in this month
    const clientCalls = serviceCalls.filter(
      c => c.clientId === clientObj.id && c.status === ServiceCallStatus.RESOLVED
    );
    
    const resolvedInMonthCount = clientCalls.filter(c => {
      if (!c.resolvedAt) return false;
      try {
        let callDate: Date;
        if (c.resolvedAt.toDate) {
          callDate = c.resolvedAt.toDate();
        } else if (c.resolvedAt.seconds) {
          callDate = new Date(c.resolvedAt.seconds * 1000);
        } else {
          callDate = new Date(c.resolvedAt);
        }
        return format(callDate, 'yyyy-MM') === month;
      } catch (err) {
        console.error("Error parsing call resolution date", err);
        return false;
      }
    }).length;

    // Build default items list
    const suggestedItems: InvoiceItem[] = [];

    // Add row for preventives
    suggestedItems.push({
      id: 'prev-main',
      description: `SERVIÇO DE MANUTENÇÃO PREVENTIVA MENSAL EM APARELHOS DE AR CONDICIONADO CONFORME CONTRATO E PMOC (${format(new Date(month + '-01T12:00:00'), 'MMMM/yyyy', { locale: ptBR }).toUpperCase()})`,
      quantity: machinesCount || 0,
      unit: 'UN',
      unitValue: clientObj.pricePerMachine || 0
    });

    // Add row for correctives
    suggestedItems.push({
      id: 'corr-main',
      description: `SERVIÇO DE MANUTENÇÃO CORRETIVA COM ATENDIMENTO DE CHAMADOS DE URGÊNCIA E REPAROS TÉCNICOS EXECUTADOS`,
      quantity: resolvedInMonthCount || 0,
      unit: 'UN',
      unitValue: clientObj.pricePerCorrective || 0
    });

    setItems(suggestedItems);
  };

  // Save current details back to the Client profile in Firestore
  const handleSaveClientDetails = async () => {
    if (!selectedClientId) return;
    setIsSavingClient(true);
    setSaveMessage(null);
    try {
      await dataService.updateClient(selectedClientId, {
        cnpj: cnpj.trim(),
        stateRegistration: stateRegistration.trim(),
        cityRegistration: cityRegistration.trim(),
        fullAddress: fullAddress.trim(),
        contractNumber: contractNumber.trim(),
        processNumber: processNumber.trim(),
        pricePerMachine: pricePerMachine,
        pricePerCorrective: pricePerCorrective
      });
      
      setSaveMessage({ text: 'Dados de faturamento do cliente salvos e atualizados no banco!', type: 'success' });
      
      // Update local clients list
      setClients(prev => prev.map(c => c.id === selectedClientId ? {
        ...c,
        cnpj: cnpj.trim(),
        stateRegistration: stateRegistration.trim(),
        cityRegistration: cityRegistration.trim(),
        fullAddress: fullAddress.trim(),
        contractNumber: contractNumber.trim(),
        processNumber: processNumber.trim(),
        pricePerMachine: pricePerMachine,
        pricePerCorrective: pricePerCorrective
      } : c));
      
      setTimeout(() => setSaveMessage(null), 4000);
    } catch (err: any) {
      console.error(err);
      setSaveMessage({ text: 'Erro ao salvar dados do cliente: ' + (err.message || 'Erro desconhecido'), type: 'error' });
    } finally {
      setIsSavingClient(false);
    }
  };

  // Add Item handler
  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        description: '',
        quantity: 1,
        unit: 'UN',
        unitValue: 0
      }
    ]);
  };

  // Remove Item handler
  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  // Update specific field in item
  const handleUpdateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  // Calculations
  const grossTotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.quantity * item.unitValue), 0);
  }, [items]);

  const retentions = useMemo(() => {
    const iss = (grossTotal * (issPercent / 100));
    const inss = (grossTotal * (inssPercent / 100));
    const pis = (grossTotal * (pisPercent / 100));
    const cofins = (grossTotal * (cofinsPercent / 100));
    const csll = (grossTotal * (csllPercent / 100));
    const irrf = (grossTotal * (irrfPercent / 100));
    
    const sum = iss + inss + pis + cofins + csll + irrf;
    return {
      iss,
      inss,
      pis,
      cofins,
      csll,
      irrf,
      total: sum
    };
  }, [grossTotal, issPercent, inssPercent, pisPercent, cofinsPercent, csllPercent, irrfPercent]);

  const netTotal = useMemo(() => {
    return grossTotal - retentions.total - otherDeductions;
  }, [grossTotal, retentions, otherDeductions]);

  // Format Currencies helper
  const formatBRL = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Tab Navigators (Internal) */}
      <div className="flex items-center justify-between bg-white p-2 rounded-2xl border border-gray-200 shadow-sm print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDocTab('editor')}
            className={cn(
              "px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
              docTab === 'editor' ? "bg-orange-600 text-white shadow-md shadow-orange-100" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
            )}
          >
            <Edit className="w-4 h-4" />
            Parâmetros & Edição
          </button>
          <button
            onClick={() => setDocTab('preview')}
            className={cn(
              "px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
              docTab === 'preview' ? "bg-orange-600 text-white shadow-md shadow-orange-100" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
            )}
            disabled={!selectedClientId}
            title={!selectedClientId ? "Selecione um cliente primeiro" : ""}
          >
            <Eye className="w-4 h-4" />
            Visualização da Medição
          </button>
        </div>

        {selectedClientId && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-bold uppercase tracking-wider hidden sm:inline">Mês de Ref:</span>
            <input 
              type="month" 
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500/20 text-xs font-bold"
            />
            {docTab === 'preview' && (
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-900 text-white text-xs font-black rounded-lg hover:bg-gray-800 transition-colors shadow"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir A4
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-80 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="w-10 h-10 rounded-full border-4 border-orange-500 border-t-transparent animate-spin mb-3"></div>
          <p className="text-gray-400 text-sm font-medium">Carregando dados para medição...</p>
        </div>
      ) : (
        <>
          {/* Main Content Pane */}
          {docTab === 'editor' ? (
            <div className="space-y-6 print:hidden">
              
              {/* Header Selector */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <FileCheck2 className="w-5 h-5 text-orange-600" />
                      Geração de Nota de Serviço & Relatório de Medição
                    </h3>
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Configure os dados contratuais e financeiros do Órgão Público para emissão oficial</p>
                  </div>
                  
                  <div className="min-w-[240px]">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Órgão Público (Cliente)</label>
                    <select
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20 text-sm font-medium bg-white"
                    >
                      <option value="">Selecione o Órgão...</option>
                      {clients.slice().sort((a,b) => a.name.localeCompare(b.name)).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {selectedClientId ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Left Panel: Client Billing Settings */}
                  <div className="lg:col-span-1 space-y-6">
                    
                    {/* Client Info Persistance */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                      <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                        <h4 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-gray-400" />
                          Dados Cadastrais do Órgão
                        </h4>
                        <span className="text-[9px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold uppercase">Persistente</span>
                      </div>

                      <div className="space-y-3.5 text-xs">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">CNPJ do Órgão</label>
                          <input 
                            type="text" 
                            value={cnpj} 
                            onChange={(e) => setCnpj(e.target.value)} 
                            placeholder="Ex: 12.345.678/0001-90"
                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Insc. Estadual</label>
                            <input 
                              type="text" 
                              value={stateRegistration} 
                              onChange={(e) => setStateRegistration(e.target.value)} 
                              placeholder="Isento ou nº"
                              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Insc. Municipal</label>
                            <input 
                              type="text" 
                              value={stateRegistration} 
                              onChange={(e) => citySetRegistration(e.target.value)} 
                              placeholder="nº"
                              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Endereço Completo</label>
                          <textarea 
                            value={fullAddress} 
                            onChange={(e) => setFullAddress(e.target.value)} 
                            placeholder="Rua, Número, Bairro, Cidade - UF, CEP"
                            rows={2}
                            className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all resize-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Contrato Relacionado</label>
                          <input 
                            type="text" 
                            value={contractNumber} 
                            onChange={(e) => setContractNumber(e.target.value)} 
                            placeholder="Ex: Contrato nº 042/2024"
                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Processo Administrativo</label>
                          <input 
                            type="text" 
                            value={processNumber} 
                            onChange={(e) => setProcessNumber(e.target.value)} 
                            placeholder="Ex: Proc. nº 12003.123/2024"
                            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Preço Máquina (Prev.)</label>
                            <input 
                              type="number" 
                              value={pricePerMachine} 
                              onChange={(e) => setPricePerMachine(parseFloat(e.target.value) || 0)} 
                              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Preço Chamado (Corr.)</label>
                            <input 
                              type="number" 
                              value={pricePerCorrective} 
                              onChange={(e) => setPricePerCorrective(parseFloat(e.target.value) || 0)} 
                              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all font-bold"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleSaveClientDetails}
                          disabled={isSavingClient}
                          className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow shadow-gray-200 text-xs"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {isSavingClient ? 'Salvando...' : 'Salvar Cadastro de Faturamento'}
                        </button>

                        {saveMessage && (
                          <div className={cn(
                            "p-2.5 rounded-lg border text-center text-[11px] font-medium leading-normal animate-in fade-in",
                            saveMessage.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-red-50 border-red-100 text-red-800"
                          )}>
                            {saveMessage.text}
                          </div>
                        )}

                      </div>
                    </div>

                  </div>

                  {/* Right Panel: Invoice Meta, Taxes, Suggestions & Itemized List */}
                  <div className="lg:col-span-2 space-y-6">
                    
                    {/* Invoice Meta & Suggested system values */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                      <div className="border-b border-gray-100 pb-3 mb-4 flex items-center justify-between">
                        <h4 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                          <Percent className="w-4 h-4 text-orange-600" />
                          Informações do Documento e Impostos
                        </h4>
                        <button
                          onClick={() => analyzeSystemData()}
                          className="flex items-center gap-1 text-[11px] font-extrabold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded-lg transition-all"
                        >
                          <RefreshCw className="w-3 h-3 animate-none" />
                          Sugerir Dados do Sistema
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Identificador / Medição Nº</label>
                          <input 
                            type="text" 
                            value={documentNumber} 
                            onChange={(e) => setDocumentNumber(e.target.value)} 
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-orange-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Data de Emissão</label>
                          <input 
                            type="date" 
                            value={issueDate} 
                            onChange={(e) => setIssueDate(e.target.value)} 
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-orange-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Retenção de ISS (%)</label>
                          <input 
                            type="number" 
                            value={issPercent} 
                            onChange={(e) => setIssPercent(parseFloat(e.target.value) || 0)} 
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-orange-500 font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Ciclo do Contrato</label>
                          <input 
                            type="number" 
                            min="1"
                            value={selectedCycle} 
                            onChange={(e) => setSelectedCycle(parseInt(e.target.value) || 1)} 
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-orange-500 font-bold"
                          />
                        </div>
                      </div>

                      {/* Other Retentions Expandable / Secondary Taxes */}
                      <div className="mt-4 p-4 bg-gray-50/50 rounded-xl border border-gray-100">
                        <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5 italic">Outras Retenções Oficiais (Apenas se houver)</span>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                          <div>
                            <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">INSS (%)</label>
                            <input 
                              type="number" 
                              value={inssPercent} 
                              onChange={(e) => setInssPercent(parseFloat(e.target.value) || 0)} 
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">PIS (%)</label>
                            <input 
                              type="number" 
                              value={pisPercent} 
                              onChange={(e) => setPisPercent(parseFloat(e.target.value) || 0)} 
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">COFINS (%)</label>
                            <input 
                              type="number" 
                              value={cofinsPercent} 
                              onChange={(e) => setCofinsPercent(parseFloat(e.target.value) || 0)} 
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">CSLL (%)</label>
                            <input 
                              type="number" 
                              value={csllPercent} 
                              onChange={(e) => setCsllPercent(parseFloat(e.target.value) || 0)} 
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">IRRF (%)</label>
                            <input 
                              type="number" 
                              value={irrfPercent} 
                              onChange={(e) => setIrrfPercent(parseFloat(e.target.value) || 0)} 
                              className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md outline-none"
                            />
                          </div>
                        </div>

                        <div className="mt-3.5">
                          <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Outros Descontos / Glosas Oficiais (R$)</label>
                          <input 
                            type="number" 
                            value={otherDeductions} 
                            onChange={(e) => setOtherDeductions(parseFloat(e.target.value) || 0)} 
                            className="w-full sm:w-1/3 px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none focus:border-orange-500 font-bold text-red-600 text-xs"
                            placeholder="R$ 0,00"
                          />
                        </div>

                        {/* Guia specific section */}
                        <div className="mt-5 pt-4 border-t border-gray-150 space-y-3">
                          <span className="block text-[10px] font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Etapa 1: Dados Exclusivos do Guia de Solicitação
                          </span>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div>
                              <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Nº do Guia</label>
                              <input 
                                type="text" 
                                value={guiaNumber} 
                                onChange={(e) => setGuiaNumber(e.target.value)} 
                                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-semibold text-gray-900"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">OS / Referência OS</label>
                              <input 
                                type="text" 
                                value={guiaOsNumber} 
                                onChange={(e) => setGuiaOsNumber(e.target.value)} 
                                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-semibold text-gray-900"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Empresa Prestadora (Filial)</label>
                              <input 
                                type="text" 
                                value={empresaName} 
                                onChange={(e) => setEmpresaName(e.target.value)} 
                                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-semibold text-gray-900"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div>
                              <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Obs da Nota (Personalizado)</label>
                              <input 
                                type="text" 
                                value={customObsNota} 
                                onChange={(e) => setCustomObsNota(e.target.value)} 
                                placeholder="Padrão: COMPETENCIA: MÊS/ANO"
                                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-semibold text-gray-900"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Obs do Guia (Personalizado)</label>
                              <input 
                                type="text" 
                                value={customObsGuia} 
                                onChange={(e) => setCustomObsGuia(e.target.value)} 
                                placeholder="Padrão: CONTRATO, CICLO e Período Calculado"
                                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-semibold text-gray-900"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Itemized List editor */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                      <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                        <h4 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                          <Calculator className="w-4 h-4 text-orange-600" />
                          Itens de Serviço da Medição
                        </h4>
                        
                        <button
                          type="button"
                          onClick={handleAddItem}
                          className="flex items-center gap-1 text-xs font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-all"
                        >
                          <PlusCircle className="w-4 h-4" />
                          Adicionar Item Manual
                        </button>
                      </div>

                      {items.length === 0 ? (
                        <div className="py-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                          <p className="text-gray-400 text-sm font-medium italic">Nenhum item adicionado à medição.</p>
                          <button
                            type="button"
                            onClick={() => analyzeSystemData()}
                            className="mt-3 text-xs font-black bg-orange-600 text-white px-4 py-2 rounded-xl shadow-lg shadow-orange-100 hover:bg-orange-700 transition-all"
                          >
                            Carregar Dados do Mês
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {items.map((item, index) => (
                            <div key={item.id} className="p-4 bg-gray-50/50 rounded-xl border border-gray-200 flex flex-col gap-3 relative group">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.id)}
                                className="absolute right-3 top-3 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                title="Remover item"
                              >
                                <Trash className="w-4 h-4" />
                              </button>

                              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Item #{index + 1}</div>

                              <div>
                                <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Descrição do Serviço</label>
                                <textarea
                                  value={item.description}
                                  onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                                  placeholder="Descrição detalhada do serviço realizado"
                                  className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-xs leading-normal resize-none outline-none focus:border-orange-500"
                                  rows={2}
                                />
                              </div>

                              <div className="grid grid-cols-4 gap-3 text-xs">
                                <div className="col-span-1">
                                  <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Quantidade</label>
                                  <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => handleUpdateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md outline-none"
                                  />
                                </div>
                                <div className="col-span-1">
                                  <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Unidade</label>
                                  <input
                                    type="text"
                                    value={item.unit}
                                    onChange={(e) => handleUpdateItem(item.id, 'unit', e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md outline-none font-mono uppercase"
                                  />
                                </div>
                                <div className="col-span-1">
                                  <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Valor Unitário</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={item.unitValue}
                                    onChange={(e) => handleUpdateItem(item.id, 'unitValue', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-md outline-none font-bold"
                                  />
                                </div>
                                <div className="col-span-1 flex flex-col justify-end">
                                  <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Subtotal</span>
                                  <span className="text-sm font-black text-gray-800 py-1.5 leading-none">
                                    {formatBRL(item.quantity * item.unitValue)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Pricing summary widget */}
                      <div className="bg-gray-900 text-white p-5 rounded-2xl space-y-3 shadow-lg shadow-gray-200">
                        <div className="flex justify-between items-center text-xs text-gray-400 font-bold border-b border-white/10 pb-2">
                          <span>VALOR BRUTO TOTAL</span>
                          <span className="font-mono text-sm font-black">{formatBRL(grossTotal)}</span>
                        </div>
                        
                        {retentions.total > 0 && (
                          <div className="flex justify-between items-center text-xs text-rose-400 font-bold border-b border-white/10 pb-2">
                            <span>RETERÇÕES DE IMPOSTOS ({issPercent + inssPercent + pisPercent + cofinsPercent + csllPercent + irrfPercent}%)</span>
                            <span className="font-mono text-xs font-bold">-{formatBRL(retentions.total)}</span>
                          </div>
                        )}

                        {otherDeductions > 0 && (
                          <div className="flex justify-between items-center text-xs text-rose-400 font-bold border-b border-white/10 pb-2">
                            <span>DESCONTOS / GLOSAS ADICIONAIS</span>
                            <span className="font-mono text-xs font-bold">-{formatBRL(otherDeductions)}</span>
                          </div>
                        )}

                        <div className="flex justify-between items-center font-black">
                          <span className="text-xs uppercase tracking-widest text-emerald-400">Valor Líquido a Receber</span>
                          <span className="text-xl font-black text-emerald-400 font-mono">{formatBRL(netTotal)}</span>
                        </div>
                      </div>
                    </div>

                  </div>

                </div>
              ) : (
                <div className="bg-white p-20 rounded-2xl border border-gray-200 shadow-sm text-center">
                  <FileText className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                  <h4 className="text-base font-bold text-gray-700">Selecione o Órgão Público</h4>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">Selecione um cliente acima para carregar o faturamento, contratos e sugestões do sistema.</p>
                </div>
              )}

            </div>
          ) : (
            <div className="space-y-6">
              {/* Tab 2: Document Preview (Pronto para Imprimir) */}
              
              {/* Document Switcher - Print Hidden */}
              <div className="flex items-center justify-center bg-gray-50 border border-gray-200 p-1.5 rounded-2xl max-w-lg mx-auto print:hidden shadow-sm gap-1">
                <button
                  type="button"
                  onClick={() => setPreviewType('guia')}
                  className={cn(
                    "flex-1 py-2 px-4 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5",
                    previewType === 'guia'
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-100"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  )}
                >
                  <FileText className="w-3.5 h-3.5 text-emerald-500 print:hidden" />
                  Etapa 1: Guia de Solicitação
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewType('measurement')}
                  className={cn(
                    "flex-1 py-2 px-4 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5",
                    previewType === 'measurement'
                      ? "bg-orange-600 text-white shadow-md shadow-orange-100"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  )}
                >
                  <FileCheck2 className="w-3.5 h-3.5 text-orange-500 print:hidden" />
                  Etapa 2: Relatório de Medição
                </button>
              </div>

              {/* Printable Area Wrapper */}
              <div className="bg-white border border-gray-300 rounded-2xl shadow-sm max-w-[850px] mx-auto overflow-hidden print:border-0 print:shadow-none print:bg-white print:rounded-none">
                
                {/* Print Styles specific for A4 Medição */}
                <style>{`
                  @media print {
                    aside, nav, header, button, select, input, .no-print, .print\\:hidden, [role="navigation"] {
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
                    /* A4 setup */
                    @page {
                      size: A4 portrait;
                      margin: 1.2cm 1.2cm 1.2cm 1.2cm;
                    }
                    /* Ensure full page styling works */
                    .print-invoice-sheet {
                      border: none !important;
                      padding: 0 !important;
                      margin: 0 !important;
                      box-shadow: none !important;
                      width: 100% !important;
                      max-width: 100% !important;
                    }
                    tr {
                      page-break-inside: avoid !important;
                    }
                  }
                `}</style>

                {/* The Invoice / Medição Sheet */}
                {previewType === 'guia' ? (
                  /* THE GUIA SHEET - High Fidelity Copy of PDF with custom colors and dense grid lines */
                    <div className="print-invoice-sheet bg-white p-6 font-sans text-gray-900 leading-normal text-xs border border-gray-100">
                      
                      {/* Top Header: Issuer Details with custom brand styling */}
                      <div className="border border-black p-3 mb-4 rounded flex flex-col sm:flex-row justify-between items-center gap-3">
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          <CompanyLogo companyId={invoiceCompanyKey} className="w-16 h-16" alt={invoiceCompany.name} />

                          <div className="text-[9.5px] leading-tight text-gray-800 uppercase font-bold">
                            <div className="font-black text-xs text-gray-950">{invoiceCompany.name}</div>
                            <div>CNPJ: {invoiceCompany.cnpj} - IE: {invoiceCompany.ie} - IM: {invoiceCompany.im}</div>
                            <div>Endereço: {invoiceCompany.address}</div>
                            <div>E-mail: {invoiceCompany.email} - Telefone: {invoiceCompany.phone}</div>
                          </div>
                        </div>

                        <div className="text-[9px] font-bold text-gray-800 text-right uppercase leading-normal border-t sm:border-t-0 sm:border-l border-gray-300 pt-2 sm:pt-0 sm:pl-3 w-full sm:w-auto shrink-0 space-y-0.5">
                          <div>Página: 1 de 1</div>
                          <div>Usuário: ALINE KARLA</div>
                          <div>Gerado em: {format(new Date(), 'dd/MM/yyyy HH:mm:ss')}</div>
                        </div>
                      </div>

                      {/* Title */}
                      <div className="border-b-2 border-black pb-1.5 mb-3 flex justify-between items-center px-1 font-bold text-gray-950">
                        <h3 className="text-sm font-black uppercase tracking-tight">GUIA DE SOLICITAÇÃO PARA EMISSÃO DE NOTAS</h3>
                        <div className="text-sm font-black uppercase">NÚMERO: {guiaNumber || '1669'}</div>
                      </div>

                      {/* Table Columns with Dark Headers */}
                      <div className="border border-black rounded overflow-hidden mb-4">
                        <table className="w-full text-left border-collapse text-[9.5px] uppercase font-bold">
                          <thead>
                            <tr className={cn("text-[9px] border-b border-black", invoiceCompanyKey === 'lefrio' ? 'bg-[#9cbdde] text-black font-black' : 'text-white ' + brandColorClass)}>
                              <th className="border-r border-black p-1.5 text-center w-[75px]">Data</th>
                              <th className="border-r border-black p-1.5 w-[180px]">Cliente</th>
                              <th className="border-r border-black p-1.5 text-center w-[50px]">OS</th>
                              <th className="border-r border-black p-1.5 w-[100px]">Empresa</th>
                              <th className="border-r border-black p-1.5 text-center w-[45px]">Código</th>
                              <th className="border-r border-black p-1.5">Descrição</th>
                              <th className="border-r border-black p-1.5 text-right w-[85px]">Valor Total</th>
                              <th className="border-r border-black p-1.5 text-center w-[30px]">NF</th>
                              <th className="border-r border-black p-1.5 text-center w-[35px]">Emissão</th>
                              <th className="border-r border-black p-1.5 text-center w-[30px]">Pgto.</th>
                              <th className="border-r border-black p-1.5 text-center w-[40px]">Vencto.</th>
                              <th className="p-1.5 text-center w-[40px]">Assin.</th>
                            </tr>
                          </thead>
                        <tbody className="divide-y divide-black font-semibold text-[9px] text-gray-900">
                          {items.map((item, idx) => {
                            const itemDate = item.date || (issueDate ? format(new Date(issueDate + 'T12:00:00'), 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy'));
                            const itemOS = item.os || guiaOsNumber || '6778';
                            const itemEmpresa = item.empresa || empresaName || '009 - AL MATRIZ AL';
                            const itemCodigo = item.codigo || (idx === 0 ? '30' : idx === 1 ? '19' : '138');
                            const itemVal = item.quantity * item.unitValue;

                            return (
                              <tr key={item.id} className="h-9">
                                <td className="border-r border-black p-1 text-center align-middle whitespace-nowrap">{idx === 0 ? itemDate : ''}</td>
                                <td className="border-r border-black p-1 align-middle leading-tight max-w-[180px] break-words">
                                  {idx === 0 ? (
                                    <>
                                      <div className="font-bold text-gray-950">{selectedClient?.fullName || selectedClient?.name}</div>
                                      <div className="text-[8px] text-gray-500 font-medium normal-case">({selectedClient?.id?.substring(0,5)})</div>
                                    </>
                                  ) : ''}
                                </td>
                                <td className="border-r border-black p-1 text-center align-middle">{idx === 0 ? itemOS : ''}</td>
                                <td className="border-r border-black p-1 align-middle max-w-[100px] break-words">{idx === 0 ? itemEmpresa : ''}</td>
                                <td className="border-r border-black p-1 text-center align-middle font-mono">{itemCodigo}</td>
                                <td className="border-r border-black p-1 align-middle leading-tight whitespace-normal break-words max-w-[200px]">
                                  {item.description}
                                </td>
                                <td className="border-r border-black p-1 text-right align-middle font-mono font-bold text-gray-950">
                                  {itemVal > 0 ? formatBRL(itemVal).replace('R$', '').trim() : '0,00'}
                                </td>
                                <td className="border-r border-black p-1 align-middle"></td>
                                <td className="border-r border-black p-1 align-middle"></td>
                                <td className="border-r border-black p-1 align-middle"></td>
                                <td className="border-r border-black p-1 align-middle"></td>
                                <td className="p-1 align-middle"></td>
                              </tr>
                            );
                          })}
                          
                          {items.length < 5 && Array.from({ length: 5 - items.length }).map((_, i) => (
                            <tr key={`empty-${i}`} className="h-7 bg-white">
                              <td className="border-r border-black p-1"></td>
                              <td className="border-r border-black p-1"></td>
                              <td className="border-r border-black p-1"></td>
                              <td className="border-r border-black p-1"></td>
                              <td className="border-r border-black p-1"></td>
                              <td className="border-r border-black p-1"></td>
                              <td className="border-r border-black p-1 text-right font-mono text-gray-400">0,00</td>
                              <td className="border-r border-black p-1"></td>
                              <td className="border-r border-black p-1"></td>
                              <td className="border-r border-black p-1"></td>
                              <td className="border-r border-black p-1"></td>
                              <td className="p-1"></td>
                            </tr>
                          ))}
                        </tbody>
                        
                        <tfoot>
                          <tr className="bg-white border-t border-black text-[9.5px] text-gray-950 font-black h-8 uppercase">
                            <td colSpan={6} className="border-r border-black p-1.5 text-right align-middle">
                              Total dos Serviços: {formatBRL(grossTotal).replace('R$', '').trim()}
                            </td>
                            <td colSpan={2} className="border-r border-black p-1.5 text-center bg-[#00a859]/10 align-middle">
                              Total: {formatBRL(grossTotal).replace('R$', '').trim()}
                            </td>
                            <td colSpan={4} className="p-1.5 text-right align-middle">
                              Total dos Produtos: 0,00
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Bottom layout: Signatures tracking + Observation Box */}
                    <div className="grid grid-cols-12 gap-4 mt-6 text-[9px] font-bold uppercase text-gray-700">
                      
                      {/* Left: Signature Tracking Fields */}
                      <div className="col-span-7 grid grid-cols-2 gap-y-7 gap-x-4">
                        <div className="space-y-1">
                          <div className="border-b border-black w-full h-4"></div>
                          <div className="text-gray-900 font-extrabold">Atendimento</div>
                          <div className="text-[8px] text-gray-400 font-bold">Data:</div>
                        </div>
                        <div className="space-y-1">
                          <div className="border-b border-black w-full h-4"></div>
                          <div className="text-gray-900 font-extrabold">Faturamento</div>
                          <div className="text-[8px] text-gray-400 font-bold">Data:</div>
                        </div>
                        <div className="space-y-1">
                          <div className="border-b border-black w-full h-4"></div>
                          <div className="text-gray-900 font-extrabold">Financeiro</div>
                          <div className="text-[8px] text-gray-400 font-bold">Data:</div>
                        </div>
                        <div className="space-y-1">
                          <div className="border-b border-black w-full h-4"></div>
                          <div className="text-gray-900 font-extrabold">Gerência</div>
                          <div className="text-[8px] text-gray-400 font-bold">Data:</div>
                        </div>
                        <div className="space-y-1">
                          <div className="border-b border-black w-full h-4"></div>
                          <div className="text-gray-900 font-extrabold">Est. Fin.</div>
                          <div className="text-[8px] text-gray-400 font-bold">Data:</div>
                        </div>
                        <div className="space-y-1"></div>

                        <div className="col-span-2 grid grid-cols-2 gap-4 pt-1">
                          <div className="space-y-1">
                            <div className="border-b border-black w-full h-4"></div>
                            <div className="text-gray-900 font-extrabold">Motoboy</div>
                            <div className="text-[8px] text-gray-400 font-bold">Data Entrega:</div>
                          </div>
                          <div className="space-y-1">
                            <div className="border-b border-black w-full h-4"></div>
                            <div className="text-gray-900 font-extrabold">Motoboy</div>
                            <div className="text-[8px] text-gray-400 font-bold">Data Devolução:</div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Thick Observations Box */}
                      <div className="col-span-5 border-2 border-black p-3.5 rounded bg-white flex flex-col justify-between text-[9px] leading-relaxed">
                        <div>
                          <div className="font-extrabold text-gray-950 uppercase border-b border-gray-200 pb-1 mb-1.5">
                            Obs. da Nota:
                          </div>
                          <p className="font-black text-gray-900">
                            {customObsNota || `COMPETENCIA: ${getMonthAbbr(month)}`}
                          </p>
                        </div>
                        
                        <div className="pt-2 border-t border-gray-200">
                          <div className="font-extrabold text-gray-950 uppercase pb-1 mb-1">
                            Obs. do Guia:
                          </div>
                          <p className="font-semibold text-gray-800 leading-normal normal-case">
                            {customObsGuia || `CONTRATO: ${selectedClient?.contractNumber || 'S/N'} - CICLO: ${getFormattedCycleStr()} - REFERENTE A O.S ${guiaOsNumber}`}
                          </p>
                        </div>
                      </div>

                    </div>

                  </div>
                ) : (
                  /* THE EXISTING STANDARD MEASUREMENT SHEET (Etapa 2) */
                    <div className="print-invoice-sheet bg-white p-10 font-sans text-gray-800 leading-normal text-xs border border-gray-100">
                      
                       {/* Top Header: Issuer Details */}
                       <div className="border border-gray-400 p-4 mb-6 rounded flex flex-col sm:flex-row justify-between items-center gap-4">
                         <div className="flex items-center gap-4 w-full sm:w-auto">
                           {invoiceCompanyKey === 'lefrio' && (
                             <div className="flex items-center justify-center shrink-0" style={{ height: '58px', width: '100px' }}>
                               <svg viewBox="0 0 140 100" className="w-14 h-14">
                                 {/* BACKUP LOGO ORIGINAL DISPONÍVEL EM /src/components/LefrioLogoBackup.txt */}
                                 <g fill="none" stroke="#68B7F2" strokeWidth="6.8" strokeLinecap="round" strokeLinejoin="round">
                                   <path d="M 29,8 Q 50,0.8 71,8 T 113,8" />
                                   <path d="M 29,20 Q 50,12 71,20 T 113,20" />
                                   <path d="M 29,32 Q 50,23.2 71,32 T 113,32" />
                                   <path d="M 29,44 Q 50,34.4 71,44 T 113,44" />
                                 </g>
                                 <g fill="none" stroke="#3556A8" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
                                   {/* L */}
                                   <path d="M 16,60 L 16,90 L 29,90" />
                                   {/* E */}
                                   <path d="M 49,60 L 37,60 L 37,90 L 49,90" />
                                   <path d="M 37,75 L 46,75" />
                                   {/* F */}
                                   <path d="M 57,90 L 57,60 L 69,60" />
                                   <path d="M 57,75 L 66,75" />
                                   {/* R */}
                                   <path d="M 77,90 L 77,60 L 86,60 A 7.5,7.5 0 0,1 86,75 L 77,75" />
                                   <path d="M 83,75 L 89,90" />
                                   {/* I */}
                                   <path d="M 99,60 L 99,90" />
                                   {/* O */}
                                   <path d="M 114,60 L 120,60 A 6,6 0 0,1 126,66 L 126,84 A 6,6 0 0,1 120,90 L 114,90 A 6,6 0 0,1 108,84 L 108,66 A 6,6 0 0,1 114,60 Z" />
                                 </g>
                               </svg>
                             </div>
                           )}
                           <div className="space-y-1 text-center sm:text-left">
                             <h2 className="text-lg font-black tracking-tight text-gray-950 uppercase leading-none">{invoiceCompany.name}</h2>
                             <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider">PRESTAÇÃO DE SERVIÇOS DE MANUTENÇÃO, INSTALAÇÃO E PMOC</p>
                             <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">
                               {invoiceCompany.address}
                             </p>
                             <p className="text-[9px] text-gray-400 font-bold uppercase leading-none">
                               E-mail: {invoiceCompany.email} | Telefone: {invoiceCompany.phone}
                             </p>
                           </div>
                         </div>
                         <div className="text-center sm:text-right border-l border-gray-200 pl-4 space-y-1.5 shrink-0 sm:min-w-[180px]">
                           <div className="text-[10px] font-black text-gray-800 uppercase tracking-wider bg-white border border-gray-300 px-2 py-1 rounded inline-block">
                             CNPJ: {invoiceCompany.cnpj}
                           </div>
                           <p className="text-[9px] text-gray-500 font-bold leading-none">I.E: {invoiceCompany.ie}</p>
                           <p className="text-[9px] text-gray-500 font-bold leading-none">I.M: {invoiceCompany.im}</p>
                         </div>
                       </div>

                    {/* Document Title & Reference info */}
                    <div className="border border-gray-400 bg-white p-3 mb-4 rounded flex justify-between items-center">
                      <div className="space-y-0.5">
                        <h3 className="text-sm font-black text-gray-900 tracking-tight uppercase leading-none">RELATÓRIO DE MEDIÇÃO DE SERVIÇOS</h3>
                        <p className="text-[10px] font-bold text-gray-500 uppercase">Referência: {format(new Date(month + '-01T12:00:00'), 'MMMM yyyy', { locale: ptBR }).toUpperCase()} | CICLO DO CONTRATO: {getFormattedCycleStr()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-gray-900">{documentNumber || 'MED-S/N'}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase leading-none mt-1">EMISSÃO: {issueDate ? format(new Date(issueDate + 'T12:00:00'), 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy')}</p>
                      </div>
                    </div>

                    {/* Contract Identification Row */}
                    <div className="border border-gray-400 p-3 mb-4 rounded grid grid-cols-2 gap-4 text-xs font-medium uppercase">
                      <div>
                        <span className="block text-[9px] font-black text-gray-400 uppercase mb-0.5">Instrumento Contratual</span>
                        <span className="font-bold text-gray-800 text-[11px]">{contractNumber || 'CONTRATO NÃO ESPECIFICADO'}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] font-black text-gray-400 uppercase mb-0.5">Processo Administrativo</span>
                        <span className="font-bold text-gray-800 text-[11px]">{processNumber || 'PROCESSO NÃO ESPECIFICADO'}</span>
                      </div>
                    </div>

                    {/* Client / Public Organ details Box */}
                    <div className="border border-gray-400 p-4 mb-5 rounded space-y-2 text-xs">
                      <span className="block text-[9px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1.5 mb-2">ÓRGÃO PÚBLICO / CONTRATANTE (BENEFICIÁRIO)</span>
                      
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <span className="font-bold uppercase text-gray-400 text-[9px] block">Razão Social / Identificação</span>
                          <span className="font-black text-gray-900 text-sm uppercase">{selectedClient?.fullName || selectedClient?.name}</span>
                        </div>
                        <div>
                          <span className="font-bold uppercase text-gray-400 text-[9px] block">CNPJ / CPF</span>
                          <span className="font-bold text-gray-800 uppercase">{cnpj || 'NÃO CADASTRADO'}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <div className="col-span-2">
                          <span className="font-bold uppercase text-gray-400 text-[9px] block">Endereço da Sede</span>
                          <span className="font-semibold text-gray-700 uppercase block leading-normal">{fullAddress || 'NÃO INFORMADO'}</span>
                        </div>
                        <div>
                          <span className="font-bold uppercase text-gray-400 text-[9px] block">Insc. Municipal / Estadual</span>
                          <span className="font-semibold text-gray-700 uppercase block">{[stateRegistration, cityRegistration].filter(Boolean).join(' / ') || 'ISENTO'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Services Itemized Table */}
                    <div className="border border-gray-400 rounded overflow-hidden mb-6">
                      <table className="w-full text-left border-collapse">
                        <thead className={cn("border-b border-gray-400 text-[9px] font-black uppercase tracking-wider", invoiceCompanyKey === 'lefrio' ? 'bg-[#9cbdde] text-black' : 'bg-gray-100 text-gray-700')}>
                          <tr>
                            <th className="px-4 py-2.5 text-center w-12">ITEM</th>
                            <th className="px-4 py-2.5">DESCRIÇÃO DOS SERVIÇOS EXECUTADOS</th>
                            <th className="px-4 py-2.5 text-center w-16">QTD</th>
                            <th className="px-4 py-2.5 text-center w-16">UNID</th>
                            <th className="px-4 py-2.5 text-right w-28">VALOR UNIT.</th>
                            <th className="px-4 py-2.5 text-right w-28">VALOR TOTAL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-300 font-medium text-[10px] uppercase text-gray-800">
                          {items.map((item, index) => (
                            <tr key={item.id}>
                              <td className="px-4 py-3 text-center text-gray-500 font-bold">{index + 1}</td>
                              <td className="px-4 py-3 font-semibold text-gray-950 leading-relaxed max-w-[300px] whitespace-normal break-words">{item.description}</td>
                              <td className="px-4 py-3 text-center">{item.quantity}</td>
                              <td className="px-4 py-3 text-center font-mono">{item.unit}</td>
                              <td className="px-4 py-3 text-right font-mono">{formatBRL(item.unitValue)}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-gray-950">{formatBRL(item.quantity * item.unitValue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Summary & Taxes Calculation Box */}
                    <div className="grid grid-cols-2 gap-6 items-start mb-10">
                      
                      {/* Legal Notes / Remarks */}
                      <div className="border border-gray-300 p-3 rounded h-full bg-white text-[9px] leading-relaxed text-gray-500 uppercase">
                        <span className="block font-black text-gray-600 mb-1">Notas e Observações de Medição:</span>
                        <p>• Serviços técnicos de climatização predial executados de acordo com os critérios normativos da Anvisa (RE 09) e PMOC.</p>
                        <p>• Este relatório serve como documento comprobatório de medição física de metas para liberação de empenho e emissão fiscal correspondente.</p>
                        <p>• Os técnicos executores da {invoiceCompany.shortName} atestaram a conclusão nas ordens de serviço eletrônicas correspondentes no sistema.</p>
                      </div>

                      {/* Financial box with retentions details */}
                      <div className="border border-gray-400 rounded overflow-hidden divide-y divide-gray-300 text-[10px] uppercase font-bold">
                        <div className="flex justify-between p-2 text-gray-600">
                          <span>VALOR TOTAL BRUTO:</span>
                          <span className="font-mono text-gray-900 font-black">{formatBRL(grossTotal)}</span>
                        </div>
                        
                        {retentions.total > 0 && (
                          <div className="p-2 space-y-1.5 bg-white">
                            <span className="block text-[8px] font-black text-gray-400 leading-none">RETENÇÕES DE TRIBUTOS NA MEDIÇÃO</span>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] font-medium text-gray-500 font-mono">
                              {retentions.iss > 0 && <span>ISS ({issPercent}%): {formatBRL(retentions.iss)}</span>}
                              {retentions.inss > 0 && <span>INSS ({inssPercent}%): {formatBRL(retentions.inss)}</span>}
                              {retentions.pis > 0 && <span>PIS ({pisPercent}%): {formatBRL(retentions.pis)}</span>}
                              {retentions.cofins > 0 && <span>COFINS ({cofinsPercent}%): {formatBRL(retentions.cofins)}</span>}
                              {retentions.csll > 0 && <span>CSLL ({csllPercent}%): {formatBRL(retentions.csll)}</span>}
                              {retentions.irrf > 0 && <span>IRRF ({irrfPercent}%): {formatBRL(retentions.irrf)}</span>}
                            </div>
                            <div className="flex justify-between border-t border-gray-200/50 pt-1 text-[9px] font-bold text-rose-700">
                              <span>TOTAL RETIDO:</span>
                              <span className="font-mono">-{formatBRL(retentions.total)}</span>
                            </div>
                          </div>
                        )}

                        {otherDeductions > 0 && (
                          <div className="flex justify-between p-2 text-rose-700 bg-white">
                            <span>DESCONTOS / GLOSAS ADICIONAIS:</span>
                            <span className="font-mono">-{formatBRL(otherDeductions)}</span>
                          </div>
                        )}

                        <div className="flex justify-between p-3.5 bg-white text-gray-950 font-black text-sm border-t border-gray-300">
                          <span className="uppercase text-gray-900 font-bold text-[10px]">VALOR LÍQUIDO DE MEDIÇÃO:</span>
                          <span className="font-mono text-gray-950">{formatBRL(netTotal)}</span>
                        </div>
                      </div>

                    </div>

                    {/* Signatures block */}
                    <div className="grid grid-cols-2 gap-10 text-center pt-10 text-[9px] uppercase font-bold text-gray-600">
                      
                      <div className="space-y-12">
                        <div className="mx-auto w-4/5 border-b border-gray-400"></div>
                        <div>
                          <p className="font-black text-gray-900">{invoiceCompany.name}</p>
                          <p className="text-gray-400 text-[8px] font-bold">EMISSOR / PRESTADOR DE SERVIÇOS</p>
                        </div>
                      </div>

                      <div className="space-y-12">
                        <div className="mx-auto w-4/5 border-b border-gray-400"></div>
                        <div>
                          <p className="font-black text-gray-900">GESTOR / FISCAL DO CONTRATO</p>
                          <p className="text-gray-400 text-[8px] font-bold">ÓRGÃO PÚBLICO / CONTRATANTE</p>
                        </div>
                      </div>

                    </div>

                  </div>
                )}

              </div>

              {/* Bottom Print helper floating button */}
              <div className="flex justify-center print:hidden">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl text-sm transition-all shadow-lg shadow-orange-200/50"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir Documento de Medição
                </button>
              </div>

            </div>
          )}
        </>
      )}
    </div>
  );
}
