import { useState, useEffect } from 'react';
import { 
  Building2, 
  MapPin, 
  Plus, 
  Trash2, 
  Edit3, 
  X,
  TrendingUp,
  Box,
  Users,
  User,
  AlertCircle,
  CheckCircle2,
  Search
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Client, Address, Technician, RouteConfiguration } from '../types';
import { cn } from '../lib/utils';

export default function RegistrationView() {
  const [activeTab, setActiveTab] = useState<'overview' | 'clients' | 'addresses' | 'techs'>('overview');
  const [clients, setClients] = useState<Client[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [routeConfigs, setRouteConfigs] = useState<RouteConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [confirmModal, setConfirmModal] = useState<{
    id: string;
    type: 'client' | 'address' | 'tech';
    name: string;
  } | null>(null);

  // Forms states
  const [newClientName, setNewClientName] = useState('');
  const [newClientBilling, setNewClientBilling] = useState('');
  const [newClientBillingDay, setNewClientBillingDay] = useState<string>('');
  
  const [newAddrStreet, setNewAddrStreet] = useState('');
  const [newAddrRoute, setNewAddrRoute] = useState('');
  const [newAddrClientId, setNewAddrClientId] = useState('');
  const [newAddrMachines, setNewAddrMachines] = useState(0);

  const [newTechName, setNewTechName] = useState('');

  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [c, a, t, rc] = await Promise.all([
        dataService.getClients(),
        dataService.getAddresses(),
        dataService.getTechnicians(),
        dataService.getRouteConfigs()
      ]);
      setClients(c);
      setAddresses(a);
      setTechs(t);
      setRouteConfigs(rc);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewClientName('');
    setNewClientBilling('');
    setNewClientBillingDay('');
    setNewAddrStreet('');
    setNewAddrRoute('');
    setNewAddrClientId('');
    setNewAddrMachines(0);
    setNewTechName('');
  };

  const handleAddClient = async () => {
    if (!newClientName || isSubmitting) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const clientData: any = {
        name: newClientName.trim()
      };
      
      if (newClientBilling.trim()) {
        clientData.billingCycleInfo = newClientBilling.trim();
      }
      
      if (newClientBillingDay) {
        clientData.billingDay = parseInt(newClientBillingDay);
      }

      if (editingId) {
        await dataService.updateClient(editingId, clientData);
        setMessage({ text: 'Cliente atualizado com sucesso!', type: 'success' });
      } else {
        await dataService.addClient(clientData);
        setMessage({ text: 'Cliente cadastrado com sucesso!', type: 'success' });
      }
      handleCancelEdit();
      await loadData();
    } catch (error: any) {
      console.error('Error adding client:', error);
      setMessage({ text: 'Erro ao processar cliente: ' + (error.message || 'Erro desconhecido'), type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClient = async (id: string) => {
    try {
      // Check if client has addresses
      const clientAddresses = addresses.filter(a => a.clientId === id);
      if (clientAddresses.length > 0) {
        throw new Error(`Este cliente possui ${clientAddresses.length} endereços vinculados. Remova-os primeiro.`);
      }

      await dataService.deleteClient(id);
      await loadData();
      setMessage({ text: 'Cliente removido!', type: 'success' });
      setConfirmModal(null);
    } catch (error: any) {
      setMessage({ text: 'Erro ao remover: ' + error.message, type: 'error' });
    }
  };

  const startDeleteClient = (client: Client) => {
    setConfirmModal({ id: client.id, type: 'client', name: client.name });
  };

  const handleAddAddress = async () => {
    if (!newAddrStreet || !newAddrClientId || !newAddrRoute || isSubmitting) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      if (editingId) {
        await dataService.updateAddress(editingId, {
          street: newAddrStreet.trim(),
          clientId: newAddrClientId,
          route: newAddrRoute.trim(),
          totalMachines: newAddrMachines
        });
        setMessage({ text: 'Endereço atualizado com sucesso!', type: 'success' });
      } else {
        await dataService.addAddress({ 
          street: newAddrStreet.trim(), 
          clientId: newAddrClientId, 
          route: newAddrRoute.trim(), 
          totalMachines: newAddrMachines 
        });
        setMessage({ text: 'Endereço cadastrado com sucesso!', type: 'success' });
      }
      handleCancelEdit();
      await loadData();
    } catch (error: any) {
      console.error('Error adding address:', error);
      setMessage({ text: 'Erro ao processar endereço: ' + (error.message || 'Erro desconhecido'), type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    try {
      await dataService.deleteAddress(id);
      await loadData();
      setMessage({ text: 'Endereço removido!', type: 'success' });
      setConfirmModal(null);
    } catch (error: any) {
      setMessage({ text: 'Erro ao remover: ' + error.message, type: 'error' });
    }
  };

  const startDeleteAddress = (addr: Address) => {
    setConfirmModal({ id: addr.id, type: 'address', name: addr.street });
  };

  const handleAddTech = async () => {
    if (!newTechName || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (editingId) {
        await dataService.updateTechnician(editingId, newTechName);
        setMessage({ text: 'Técnico atualizado!', type: 'success' });
      } else {
        await dataService.addTechnician(newTechName);
        setMessage({ text: 'Técnico adicionado!', type: 'success' });
      }
      handleCancelEdit();
      await loadData();
    } catch (e: any) {
      setMessage({ text: 'Erro ao processar técnico: ' + (e.message || 'Erro desconhecido'), type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTech = async (id: string) => {
    try {
      await dataService.deleteTechnician(id);
      await loadData();
      setMessage({ text: 'Técnico removido!', type: 'success' });
      setConfirmModal(null);
    } catch (error: any) {
      setMessage({ text: 'Erro ao remover: ' + error.message, type: 'error' });
    }
  };

  const startDeleteTech = (tech: Technician) => {
    setConfirmModal({ id: tech.id, type: 'tech', name: tech.name });
  };

  const startEditClient = (client: Client) => {
    setEditingId(client.id);
    setActiveTab('clients');
    setNewClientName(client.name);
    setNewClientBilling(client.billingCycleInfo || '');
    setNewClientBillingDay(client.billingDay?.toString() || '');
  };

  const startEditAddress = (addr: Address) => {
    setEditingId(addr.id);
    setActiveTab('addresses');
    setNewAddrStreet(addr.street);
    setNewAddrRoute(addr.route);
    setNewAddrClientId(addr.clientId);
    setNewAddrMachines(addr.totalMachines);
  };

  const startEditTech = (tech: Technician) => {
    setEditingId(tech.id);
    setActiveTab('techs');
    setNewTechName(tech.name);
  };

  const filteredClients = clients.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredAddresses = addresses.filter(a => a.street.toLowerCase().includes(searchTerm.toLowerCase()) || a.route.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredTechs = techs.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const totalMachinesCount = addresses.reduce((acc, curr) => acc + (curr.totalMachines || 0), 0);

  const availableRoutes = Array.from(new Set([
    ...routeConfigs.map(rc => rc.routeName),
    ...addresses.map(a => a.route)
  ])).filter(Boolean).sort();

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Messages */}
      {message && (
        <div className={cn(
          "p-4 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
          message.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-red-50 border-red-100 text-red-800"
        )}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="text-sm font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto p-1 hover:bg-black/5 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Building2 className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Clientes</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{clients.length}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <MapPin className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Endereços</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{addresses.length}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Box className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Máquinas</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{totalMachinesCount}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Users className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Técnicos</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{techs.length}</div>
        </div>
      </div>

      {/* Tabs and Search Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-gray-200 w-fit">
          <button 
            onClick={() => { setActiveTab('overview'); handleCancelEdit(); }}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
              activeTab === 'overview' ? "bg-gray-900 text-white shadow-lg shadow-gray-200" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <TrendingUp className="w-4 h-4" />
            Visão Geral
          </button>
          <button 
            onClick={() => { setActiveTab('clients'); handleCancelEdit(); }}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
              activeTab === 'clients' ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <Building2 className="w-4 h-4" />
            Clientes
          </button>
          <button 
            onClick={() => { setActiveTab('addresses'); handleCancelEdit(); }}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
              activeTab === 'addresses' ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <MapPin className="w-4 h-4" />
            Endereços
          </button>
          <button 
            onClick={() => { setActiveTab('techs'); handleCancelEdit(); }}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
              activeTab === 'techs' ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <Users className="w-4 h-4" />
            Técnicos
          </button>
        </div>

        <div className="relative group max-w-xs w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
          <input 
            type="text"
            placeholder={`Buscar ${activeTab === 'clients' || activeTab === 'overview' ? 'clientes' : activeTab === 'addresses' ? 'endereços' : 'técnicos'}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all shadow-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Registration Form */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 h-fit sticky top-0 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              {editingId ? <Edit3 className="w-5 h-5 text-amber-600" /> : <Plus className="w-5 h-5 text-blue-600" />}
              {editingId ? 'Editar Registro' : 'Novo Registro'}
            </h3>
            {editingId && (
              <button 
                onClick={handleCancelEdit}
                className="text-[10px] font-bold text-gray-400 hover:text-gray-600 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded"
              >
                Cancelar
              </button>
            )}
          </div>
          
          {(activeTab === 'clients' || activeTab === 'overview') && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 text-blue-700 text-xs rounded-lg mb-4 font-medium border border-blue-100 italic">
                Crie um novo cliente primeiro, depois adicione seus endereços na aba correspondente.
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nome do Cliente</label>
                <input 
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Ex: Órgão Municipal A"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Observações do cliente</label>
                <textarea 
                  value={newClientBilling}
                  onChange={(e) => setNewClientBilling(e.target.value)}
                  placeholder="Instruções de faturamento..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none h-24"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Dia do Faturamento (1-31)</label>
                <input 
                  type="number"
                  min="1"
                  max="31"
                  value={newClientBillingDay}
                  onChange={(e) => setNewClientBillingDay(e.target.value)}
                  placeholder="Ex: 10"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <button 
                onClick={handleAddClient}
                disabled={isSubmitting}
                className={cn(
                  "w-full disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg mt-2 flex items-center justify-center gap-2",
                  editingId ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200" : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                )}
              >
                {isSubmitting ? (editingId ? 'Atualizando...' : 'Cadastrando...') : (editingId ? 'Salvar Alterações' : 'Cadastrar Cliente')}
              </button>
            </div>
          )}

          {activeTab === 'addresses' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Cliente</label>
                <select 
                  value={newAddrClientId}
                  onChange={(e) => setNewAddrClientId(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500"
                >
                  <option value="">Selecione um cliente</option>
                  {clients.slice().sort((a,b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Rua / Identificação</label>
                <input 
                  type="text"
                  value={newAddrStreet}
                  onChange={(e) => setNewAddrStreet(e.target.value)}
                  placeholder="Ex: Av. Central, 123 - Bloco B"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Rota / Região</label>
                <select 
                  value={newAddrRoute}
                  onChange={(e) => setNewAddrRoute(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500"
                >
                  <option value="">Selecione uma rota</option>
                  {availableRoutes.map(route => (
                    <option key={route} value={route}>{route}</option>
                  ))}
                  {/* Se o usuário estiver editando e a rota não estiver na lista (improvável mas possível), mostrar ela */}
                  {newAddrRoute && !availableRoutes.includes(newAddrRoute) && (
                    <option value={newAddrRoute}>{newAddrRoute}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Total de Máquinas</label>
                <input 
                  type="number"
                  value={newAddrMachines}
                  onChange={(e) => setNewAddrMachines(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500"
                />
              </div>
              <button 
                onClick={handleAddAddress}
                disabled={isSubmitting}
                className={cn(
                    "w-full disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg mt-2 flex items-center justify-center gap-2",
                    editingId ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200" : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                  )}
              >
                {isSubmitting ? (editingId ? 'Atualizando...' : 'Cadastrando...') : (editingId ? 'Salvar Alterações' : 'Cadastrar Endereço')}
              </button>
            </div>
          )}

          {activeTab === 'techs' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nome do Técnico</label>
                <input 
                  type="text"
                  value={newTechName}
                  onChange={(e) => setNewTechName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500"
                />
              </div>
              <button 
                onClick={handleAddTech}
                disabled={isSubmitting}
                className={cn(
                    "w-full disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg mt-2 flex items-center justify-center gap-2",
                    editingId ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200" : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                  )}
              >
                {isSubmitting ? (editingId ? 'Atualizando...' : 'Adicionando...') : (editingId ? 'Salvar Alterações' : 'Adicionar Técnico')}
              </button>
            </div>
          )}
        </div>

        {/* Data List */}
        <div className="xl:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[400px]">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">
              {activeTab === 'overview' ? 'Visão Geral do Sistema' : 'Registros Existentes'}
            </h3>
            <span className="text-xs font-medium text-gray-500 bg-white px-2 py-1 rounded border border-gray-200">
              {activeTab === 'overview' ? filteredClients.length : activeTab === 'clients' ? filteredClients.length : activeTab === 'addresses' ? filteredAddresses.length : filteredTechs.length} itens
            </span>
          </div>

          <div className="flex-1 overflow-auto divide-y divide-gray-100 bg-gray-50/30">
            {activeTab === 'overview' && filteredClients.map(client => {
              const clientAddrs = addresses.filter(a => a.clientId === client.id);
              const totalClientMachines = clientAddrs.reduce((sum, a) => sum + (a.totalMachines || 0), 0);
              
              return (
                <div key={client.id} className="p-6 bg-white border-b border-gray-100 mb-2 last:mb-0 shadow-sm first:rounded-t-2xl">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-lg uppercase tracking-tight">{client.name}</h4>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{clientAddrs.length} Endereços</span>
                          <span className="w-1 h-1 bg-gray-200 rounded-full" />
                          <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">{totalClientMachines} Máquinas Totais</span>
                          {client.billingDay && (
                            <>
                              <span className="w-1 h-1 bg-gray-200 rounded-full" />
                              <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">Fat: Dia {client.billingDay}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <button 
                        onClick={() => startEditClient(client)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Editar Cliente
                      </button>
                    </div>
                  </div>

                  {clientAddrs.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-4 border-l-2 border-gray-100 ml-6">
                      {clientAddrs.map(addr => (
                        <div key={addr.id} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-100 transition-colors group">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-sm font-bold text-gray-800">{addr.street}</span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => startEditAddress(addr)} className="p-1 hover:text-blue-600 text-gray-400">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => startDeleteAddress(addr)} className="p-1 hover:text-red-600 text-gray-400">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 bg-white px-2 py-1 rounded border border-gray-100">
                              <TrendingUp className="w-3 h-3" />
                              {addr.route}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                              <Box className="w-3 h-3" />
                              {addr.totalMachines} MÁQUINAS
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="ml-6 pl-4 border-l-2 border-gray-100 py-3 italic text-gray-400 text-sm">
                      Nenhum endereço cadastrado para este cliente.
                    </div>
                  )}

                  {client.billingCycleInfo && (
                    <div className="mt-4 ml-6 p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-800">
                      <div className="font-bold uppercase tracking-widest mb-1 text-[10px] flex items-center gap-2">
                        <AlertCircle className="w-3 h-3" />
                        Observações do Cliente
                      </div>
                      <p>{client.billingCycleInfo}</p>
                    </div>
                  )}
                </div>
              );
            })}

            {activeTab === 'clients' && filteredClients.map(client => (
              <div key={client.id} className="p-4 flex items-center justify-between hover:bg-gray-50 bg-white transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 uppercase">{client.name}</h4>
                    <p className="text-xs text-gray-500 truncate max-w-md">{client.billingCycleInfo || 'Sem info de faturamento'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => startEditClient(client)}
                    className="p-2 hover:bg-white hover:shadow text-gray-400 hover:text-blue-600 rounded-lg transition-all"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => startDeleteClient(client)}
                    className="p-2 hover:bg-white hover:shadow text-gray-400 hover:text-red-600 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {activeTab === 'addresses' && filteredAddresses.map(addr => (
              <div key={addr.id} className="p-4 flex items-center justify-between hover:bg-gray-50 bg-white transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">{addr.street}</h4>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {addr.route}
                      </span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1 text-emerald-600">
                        <Box className="w-3 h-3" />
                        {addr.totalMachines} Máq.
                      </span>
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded uppercase tracking-widest">
                        {clients.find(c => c.id === addr.clientId)?.name}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => startEditAddress(addr)}
                    className="p-2 hover:bg-white hover:shadow text-gray-400 hover:text-blue-600 rounded-lg transition-all"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => startDeleteAddress(addr)}
                    className="p-2 hover:bg-white hover:shadow text-gray-400 hover:text-red-600 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {activeTab === 'techs' && filteredTechs.map(tech => (
              <div key={tech.id} className="p-4 flex items-center justify-between hover:bg-gray-50 bg-white transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
                    <User className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-gray-900">{tech.name}</h4>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => startEditTech(tech)}
                    className="p-2 hover:bg-white hover:shadow text-gray-400 hover:text-blue-600 rounded-lg transition-all"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => startDeleteTech(tech)}
                    className="p-2 hover:bg-white hover:shadow text-gray-400 hover:text-red-600 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {((activeTab === 'overview' && filteredClients.length === 0) ||
               (activeTab === 'clients' && filteredClients.length === 0) || 
               (activeTab === 'addresses' && filteredAddresses.length === 0) || 
               (activeTab === 'techs' && filteredTechs.length === 0)) && (
              <div className="py-20 text-center text-gray-400 italic text-sm">
                Nenhum registro encontrado.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm overflow-hidden">
            <div className="p-4 bg-red-50 border-b border-red-100 flex items-center justify-between">
              <h3 className="font-bold text-red-800 flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                Confirmar Exclusão
              </h3>
              <button 
                onClick={() => setConfirmModal(null)}
                className="p-1 hover:bg-black/5 rounded-full text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 text-sm leading-relaxed">
                Tem certeza que deseja excluir permanentemente: <br/>
                <strong className="text-gray-900">"{confirmModal.name}"</strong>?
              </p>
              <p className="text-[10px] text-gray-400 mt-4 uppercase font-bold tracking-widest">
                Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
              <button 
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 rounded-lg transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  if (confirmModal.type === 'client') handleDeleteClient(confirmModal.id);
                  if (confirmModal.type === 'address') handleDeleteAddress(confirmModal.id);
                  if (confirmModal.type === 'tech') handleDeleteTech(confirmModal.id);
                }}
                className="px-6 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all shadow-md shadow-red-200"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
