import { useState, useEffect, FormEvent } from 'react';
import { dataService } from '../services/dataService';
import { Client } from '../types';
import { ServiceInvoiceGenerator } from './ServiceInvoiceGenerator';
import { 
  DollarSign, 
  Building2, 
  FileCheck2, 
  Save, 
  Search, 
  CheckCircle2, 
  AlertCircle,
  Briefcase,
  Layers,
  MapPin,
  Coins,
  ArrowRight,
  ShieldAlert,
  Sliders,
  Check,
  Edit2
} from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  managerClientId?: string;
}

type FinancialTab = 'invoices' | 'clients';

export default function FinancialView({ managerClientId }: Props) {
  const [activeTab, setActiveTab] = useState<FinancialTab>('invoices');
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Edit client state
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form fields
  const [cnpj, setCnpj] = useState('');
  const [stateRegistration, setStateRegistration] = useState('');
  const [cityRegistration, setCityRegistration] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [processNumber, setProcessNumber] = useState('');
  const [pricePerMachine, setPricePerMachine] = useState<number>(0);
  const [pricePerCorrective, setPricePerCorrective] = useState<number>(0);
  const [contractCycle, setContractCycle] = useState<number>(1);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const data = await dataService.getClients();
      // Filter if manager is limited
      const filtered = managerClientId 
        ? data.filter(c => c.id === managerClientId)
        : data;
      setClients(filtered);
    } catch (err) {
      console.error('Erro ao ler clientes para financeiro:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [managerClientId]);

  // Set form values when client selected for edit
  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setCnpj(client.cnpj || '');
    setStateRegistration(client.stateRegistration || '');
    setCityRegistration(client.cityRegistration || '');
    setFullAddress(client.fullAddress || '');
    setContractNumber(client.contractNumber || '');
    setProcessNumber(client.processNumber || '');
    setPricePerMachine(client.pricePerMachine || 0);
    setPricePerCorrective(client.pricePerCorrective || 0);
    setContractCycle(client.contractCycle || 1);
    setMessage(null);
  };

  // Save client billing details
  const handleSaveClientDetails = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const payload = {
        cnpj: cnpj.trim(),
        stateRegistration: stateRegistration.trim(),
        cityRegistration: cityRegistration.trim(),
        fullAddress: fullAddress.trim(),
        contractNumber: contractNumber.trim(),
        processNumber: processNumber.trim(),
        pricePerMachine: Number(pricePerMachine) || 0,
        pricePerCorrective: Number(pricePerCorrective) || 0,
        contractCycle: Number(contractCycle) || 1,
      };

      await dataService.updateClient(selectedClient.id, payload);

      setMessage({ text: 'Dados de faturamento salvos com sucesso no banco!', type: 'success' });
      
      // Update local state
      setClients(prev => prev.map(c => c.id === selectedClient.id ? { ...c, ...payload } : c));
      setSelectedClient(prev => prev ? { ...prev, ...payload } : null);

      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      console.error(err);
      setMessage({ text: 'Erro ao salvar dados: ' + (err.message || 'Erro desconhecido'), type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered clients list for the search input
  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.cnpj && c.cnpj.includes(searchTerm)) ||
    (c.contractNumber && c.contractNumber.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const formatBRL = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Financial Page Header */}
      <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="bg-orange-100 p-2 rounded-xl text-orange-600 shadow-sm">
              <DollarSign className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Painel Financeiro</h1>
          </div>
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
            Gestão de faturamento, medições mensais de contratos e dados cadastrais de faturamento
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-gray-100 p-1.5 rounded-2xl border border-gray-200/50 shrink-0 self-start md:self-center">
          <button
            onClick={() => setActiveTab('invoices')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'invoices' 
                ? "bg-white text-gray-900 shadow-sm border border-gray-200/40" 
                : "text-gray-500 hover:text-gray-900"
            )}
          >
            <FileCheck2 className="w-4 h-4 text-orange-600" />
            Medições & Notas
          </button>
          <button
            onClick={() => setActiveTab('clients')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'clients' 
                ? "bg-white text-gray-900 shadow-sm border border-gray-200/40" 
                : "text-gray-500 hover:text-gray-900"
            )}
          >
            <Building2 className="w-4 h-4 text-orange-600" />
            Cadastro de Clientes
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-80 bg-white rounded-3xl border border-gray-200 shadow-sm">
          <div className="w-10 h-10 rounded-full border-4 border-orange-500 border-t-transparent animate-spin mb-3"></div>
          <p className="text-gray-400 text-sm font-medium">Carregando dados financeiros...</p>
        </div>
      ) : (
        <>
          {activeTab === 'invoices' && (
            <div className="space-y-6">
              <ServiceInvoiceGenerator managerClientId={managerClientId} />
            </div>
          )}

          {activeTab === 'clients' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Left Column: Client List Selection (lg:col-span-5) */}
              <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                    <Building2 className="w-4.5 h-4.5 text-orange-600" />
                    Órgãos Públicos / Clientes
                  </h3>
                  <span className="text-[10px] bg-orange-50 text-orange-700 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
                    {filteredClients.length} Clientes
                  </span>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-450" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nome, CNPJ, contrato..."
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-orange-550/20 focus:border-orange-500 placeholder-gray-400 transition-all"
                  />
                </div>

                {/* Clients Selection Stack */}
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {filteredClients.length === 0 ? (
                    <div className="py-12 text-center text-xs text-gray-400 italic">
                      Nenhum cliente cadastrado ou correspondente à busca.
                    </div>
                  ) : (
                    filteredClients.map((client) => {
                      const isSelected = selectedClient?.id === client.id;
                      const hasBillingConfig = !!(client.cnpj && client.pricePerMachine);

                      return (
                        <button
                          key={client.id}
                          onClick={() => handleSelectClient(client)}
                          className={cn(
                            "w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 group",
                            isSelected 
                              ? "bg-orange-50/50 border-orange-200 ring-1 ring-orange-200" 
                              : "bg-white border-gray-100 hover:border-gray-300 hover:shadow-sm"
                          )}
                        >
                          <div className="min-w-0 space-y-1">
                            <h4 className={cn(
                              "text-sm font-bold truncate transition-colors",
                              isSelected ? "text-orange-950" : "text-gray-900 group-hover:text-orange-600"
                            )}>
                              {client.name}
                            </h4>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-gray-500 font-medium">
                              <span>CNPJ: {client.cnpj || 'Pendente'}</span>
                              <span>•</span>
                              <span>Contrato: {client.contractNumber ? 'Sim' : 'Não'}</span>
                              <span>•</span>
                              <span className="text-orange-650 font-bold">Ciclo: {client.contractCycle || 1}</span>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1.5">
                            {hasBillingConfig ? (
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200" title="Configuração Completa" />
                            ) : (
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-200" title="Configuração Pendente" />
                            )}
                            <ArrowRight className={cn(
                              "w-4 h-4 text-gray-300 transition-transform",
                              isSelected ? "text-orange-500 translate-x-0.5" : "group-hover:text-gray-450 group-hover:translate-x-0.5"
                            )} />
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Dynamic Form Editor (lg:col-span-7) */}
              <div className="lg:col-span-7">
                {selectedClient ? (
                  <form 
                    onSubmit={handleSaveClientDetails}
                    className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-6 animate-in slide-in-from-right-3 duration-200"
                  >
                    <div className="border-b border-gray-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-black uppercase text-orange-600 tracking-wider">Configuração de Faturamento</span>
                        <h3 className="font-bold text-gray-900 text-base">{selectedClient.name}</h3>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Status:</span>
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider",
                          selectedClient.status === 'active' ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        )}>
                          {selectedClient.status === 'active' ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </div>

                    {/* Form Fields Grid */}
                    <div className="space-y-4">
                      
                      {/* Document Group 1: Identifications */}
                      <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 space-y-3.5">
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-100/70 pb-1.5 mb-2.5">
                          <Building2 className="w-3.5 h-3.5 text-gray-400" />
                          Dados Fiscais e Cadastrais
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">CNPJ Contratante</label>
                            <input
                              type="text"
                              value={cnpj}
                              onChange={(e) => setCnpj(e.target.value)}
                              placeholder="Ex: 12.345.678/0001-90"
                              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-800 outline-none focus:border-orange-500 font-semibold transition-all"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Insc. Estadual</label>
                              <input
                                type="text"
                                value={stateRegistration}
                                onChange={(e) => setStateRegistration(e.target.value)}
                                placeholder="Isento ou nº"
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-800 outline-none focus:border-orange-500 font-semibold transition-all"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Insc. Municipal</label>
                              <input
                                type="text"
                                value={cityRegistration}
                                onChange={(e) => setCityRegistration(e.target.value)}
                                placeholder="nº"
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-800 outline-none focus:border-orange-500 font-semibold transition-all"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1 text-xs">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Endereço de Faturamento (Sede)</label>
                          <textarea
                            value={fullAddress}
                            onChange={(e) => setFullAddress(e.target.value)}
                            placeholder="Ex: Rua Getúlio Vargas, nº 350 - Centro, Maceió - AL, CEP 57000-000"
                            rows={2}
                            className="w-full p-3 bg-white border border-gray-200 rounded-xl text-gray-800 outline-none focus:border-orange-500 font-semibold transition-all resize-none leading-normal"
                          />
                        </div>
                      </div>

                      {/* Document Group 2: Contracts & Processes */}
                      <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 space-y-3.5">
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-100/70 pb-1.5 mb-2.5">
                          <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                          Instrumentos de Contratação
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Identificação do Contrato</label>
                            <input
                              type="text"
                              value={contractNumber}
                              onChange={(e) => setContractNumber(e.target.value)}
                              placeholder="Ex: Contrato Administrativo nº 142/2025"
                              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-800 outline-none focus:border-orange-500 font-semibold transition-all"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Processo Administrativo</label>
                            <input
                              type="text"
                              value={processNumber}
                              onChange={(e) => setProcessNumber(e.target.value)}
                              placeholder="Ex: Proc. SEI nº 2003.04.12845/2025"
                              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-800 outline-none focus:border-orange-500 font-semibold transition-all"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Document Group 3: Pricing Values */}
                      <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 space-y-3.5">
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-100/70 pb-1.5 mb-2.5">
                          <Coins className="w-3.5 h-3.5 text-gray-400" />
                          Valores Unitários Contratados
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                          <div className="space-y-1 bg-white p-3.5 rounded-xl border border-gray-150">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Preço Máquina (Preventiva)</label>
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-gray-400">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={pricePerMachine}
                                onChange={(e) => setPricePerMachine(parseFloat(e.target.value) || 0)}
                                className="w-full outline-none font-bold text-gray-900 text-sm"
                              />
                            </div>
                            <span className="text-[9px] text-gray-450 mt-1 block leading-normal">Valor pago mensalmente por cada equipamento sob manutenção preventiva</span>
                          </div>

                          <div className="space-y-1 bg-white p-3.5 rounded-xl border border-gray-150">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Preço Chamado (Corretiva)</label>
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-gray-400">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={pricePerCorrective}
                                onChange={(e) => setPricePerCorrective(parseFloat(e.target.value) || 0)}
                                className="w-full outline-none font-bold text-gray-900 text-sm"
                              />
                            </div>
                            <span className="text-[9px] text-gray-450 mt-1 block leading-normal">Valor pago por cada atendimento de chamado técnico resolvido</span>
                          </div>
                        </div>
                      </div>

                      {/* Document Group 4: Contract Cycle */}
                      <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 space-y-3.5">
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-100/70 pb-1.5 mb-2.5">
                          <span className="w-3.5 h-3.5 text-gray-400">🔄</span>
                          Ciclo do Contrato para Cobrança
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                          <div className="space-y-1 bg-white p-3.5 rounded-xl border border-gray-150">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Ciclo de Cobrança Atual</label>
                            <input
                              type="number"
                              min="1"
                              value={contractCycle}
                              onChange={(e) => setContractCycle(parseInt(e.target.value) || 1)}
                              className="w-full outline-none font-extrabold text-gray-900 text-sm bg-transparent"
                            />
                            <span className="text-[9px] text-gray-450 mt-1 block leading-normal">
                              Corresponde à etapa mensal ativa. Incrementa +1 automaticamente a cada nova replicação mensal de cronograma.
                            </span>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Messages Widget */}
                    {message && (
                      <div className={cn(
                        "p-4 rounded-2xl border text-xs font-semibold leading-relaxed flex items-start gap-3 animate-in fade-in",
                        message.type === 'success' 
                          ? "bg-emerald-50 border-emerald-100 text-emerald-850" 
                          : "bg-red-50 border-red-100 text-red-850"
                      )}>
                        {message.type === 'success' ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        )}
                        <p>{message.text}</p>
                      </div>
                    )}

                    {/* Form Controls */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setSelectedClient(null)}
                        className="px-5 py-2.5 bg-gray-100 hover:bg-gray-150 text-gray-600 hover:text-gray-900 font-bold text-xs rounded-xl transition-all"
                      >
                        Fechar Editor
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-black text-xs rounded-xl flex items-center gap-2 transition-all shadow"
                      >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Salvando...' : 'Salvar Informações'}
                      </button>
                    </div>

                  </form>
                ) : (
                  <div className="bg-white p-20 rounded-3xl border border-gray-200 shadow-sm text-center">
                    <Building2 className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                    <h4 className="text-base font-bold text-gray-700">Selecione um Órgão</h4>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
                      Selecione um cliente na lista à esquerda para carregar, editar ou cadastrar os dados fiscais e contratuais de faturamento.
                    </p>
                  </div>
                )}
              </div>

            </div>
          )}
        </>
      )}

    </div>
  );
}
