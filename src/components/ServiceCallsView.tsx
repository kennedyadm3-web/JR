import { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Plus, 
  Clock, 
  CheckCircle2, 
  X, 
  AlertCircle, 
  Loader2, 
  ChevronRight,
  MoreVertical,
  Calendar,
  User,
  MapPin,
  Trash2,
  CheckCircle,
  PlayCircle,
  Paperclip,
  Clock3,
  History,
  TrendingUp,
  Edit3,
  Printer,
  ExternalLink,
  LayoutGrid,
  List
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { ServiceCall, ServiceCallStatus, ServiceCallPriority, Client, Address } from '../types';
import { cn } from '../lib/utils';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ImageUploader } from './ImageUploader';

interface Props {
  managerClientId?: string;
}

export default function ServiceCallsView({ managerClientId }: Props) {
  const [calls, setCalls] = useState<ServiceCall[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ServiceCallStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  
  const [modalState, setModalState] = useState<{
    type: 'add' | 'resolve' | 'delete' | 'edit' | 'cancel';
    call?: ServiceCall;
  } | null>(null);

  const [formData, setFormData] = useState({
    clientId: '',
    addressId: '',
    description: '',
    priority: ServiceCallPriority.MEDIUM,
    resolutionNotes: '',
    attachmentUrl: '',
    forecastDate: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load them individually to handle potential partial failures
      const [callsData, clientsData, addressesData] = await Promise.all([
        dataService.getServiceCalls().catch(e => {
          console.error('Error loading service calls:', e);
          return [];
        }),
        dataService.getClients().catch(e => {
          console.error('Error loading clients:', e);
          return [];
        }),
        dataService.getAddresses().catch(e => {
          console.error('Error loading addresses:', e);
          return [];
        })
      ]);
      
      setCalls(callsData.filter((c: ServiceCall) => !managerClientId || c.clientId === managerClientId) as ServiceCall[]);
      setClients(clientsData.filter((c: Client) => !managerClientId || c.id === managerClientId) as Client[]);
      setAddresses(addressesData.filter((a: Address) => !managerClientId || a.clientId === managerClientId) as Address[]);
    } catch (e) {
      console.error('General error loading data:', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredCalls = useMemo(() => {
    return calls.filter(c => {
      const matchesSearch = 
        c.clientName?.toLowerCase().includes(search.toLowerCase()) ||
        c.description.toLowerCase().includes(search.toLowerCase()) ||
        c.addressLabel?.toLowerCase().includes(search.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [calls, search, statusFilter]);

  const handleAction = async () => {
    if (!modalState) return;
    setSaving(true);
    setMessage(null);

    try {
      if (modalState.type === 'add') {
        // Validation: Only one open call per address
        const hasOpenCall = calls.some(c => 
          c.addressId === formData.addressId && 
          (c.status === ServiceCallStatus.OPEN || c.status === ServiceCallStatus.IN_PROGRESS)
        );

        if (hasOpenCall) {
          setMessage({ 
            text: 'Este endereço já possui um chamado em aberto. Finalize o chamado atual para abrir um novo.', 
            type: 'error' 
          });
          setSaving(false);
          return;
        }

        const client = clients.find(cl => cl.id === formData.clientId);
        const address = addresses.find(ad => ad.id === formData.addressId);
        
        await dataService.addServiceCall({
          clientId: formData.clientId,
          addressId: formData.addressId,
          description: formData.description,
          status: ServiceCallStatus.OPEN,
          priority: formData.priority,
          clientName: client?.name,
          addressLabel: address?.street,
          createdAt: new Date(),
          attachmentUrl: formData.attachmentUrl || '',
          forecastDate: formData.forecastDate || ''
        });
      } else if (modalState.type === 'resolve' && modalState.call) {
        await dataService.updateServiceCall(modalState.call.id, {
          status: ServiceCallStatus.RESOLVED,
          resolutionNotes: formData.resolutionNotes,
          resolvedAt: new Date()
        });
      } else if (modalState.type === 'delete' && modalState.call) {
        await dataService.deleteServiceCall(modalState.call.id);
      } else if (modalState.type === 'edit' && modalState.call) {
        const updatePayload: any = {
          description: formData.description,
          priority: formData.priority,
          attachmentUrl: formData.attachmentUrl || '',
          forecastDate: formData.forecastDate || ''
        };
        await dataService.updateServiceCall(modalState.call.id, updatePayload);
      } else if (modalState.type === 'cancel' && modalState.call) {
        await dataService.updateServiceCall(modalState.call.id, {
          status: ServiceCallStatus.CANCELLED,
          resolutionNotes: 'Chamado cancelado pelo usuário.',
          resolvedAt: new Date()
        });
      }
      
      await loadData();
      setModalState(null);
      setFormData({
        clientId: '',
        addressId: '',
        description: '',
        priority: ServiceCallPriority.MEDIUM,
        resolutionNotes: '',
        attachmentUrl: '',
        forecastDate: ''
      });
    } catch (e: any) {
      console.error(e);
      setMessage({ text: 'Erro ao salvar alterações. Verifique sua conexão.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const selectedClientAddresses = useMemo(() => {
    return addresses.filter(a => a.clientId === formData.clientId);
  }, [formData.clientId, addresses]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Central de Chamados</h2>
          <p className="text-gray-500 text-sm">Gerencie solicitações de reparo e atendimentos avulsos.</p>
        </div>
        {!managerClientId && (
          <button 
            onClick={() => setModalState({ type: 'add' })}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-blue-200/50 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Novo Chamado
          </button>
        )}
        <button 
          type="button"
          onClick={() => { 
            window.focus(); 
            setTimeout(() => window.print(), 200); 
          }}
          className="bg-white border border-gray-200 text-gray-700 font-bold py-2.5 px-6 rounded-xl transition-all shadow-sm hover:bg-gray-50 flex items-center gap-2 print:hidden"
        >
          <Printer className="w-5 h-5 text-gray-500" />
          Imprimir
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Buscar por cliente ou problema..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(search !== '' || statusFilter !== 'all') && (
            <div className="text-[10px] font-black text-blue-600 bg-blue-50/50 border border-blue-100 px-3 py-2 rounded-xl whitespace-nowrap uppercase tracking-widest">
              {filteredCalls.length} {filteredCalls.length === 1 ? 'resultado' : 'resultados'}
            </div>
          )}
          {Object.values(ServiceCallStatus).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
              className={cn(
                "px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all",
                statusFilter === status 
                  ? "bg-blue-600 text-white border-blue-600 shadow-md" 
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              )}
            >
              {status === 'open' ? 'Abertos' : status === 'in_progress' ? 'Em Andamento' : status === 'resolved' ? 'Resolvidos' : 'Cancelados'}
            </button>
          ))}
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl shrink-0">
          <button
            onClick={() => setViewMode('cards')}
            className={cn(
              "px-3 py-1.5 rounded-lg flex items-center justify-center transition-all",
              viewMode === 'cards' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
            )}
            title="Visualização em Cards"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={cn(
              "px-3 py-1.5 rounded-lg flex items-center justify-center transition-all",
              viewMode === 'table' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
            )}
            title="Visualização em Tabela"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-200">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
          <p className="text-gray-500 font-medium">Carregando chamados...</p>
        </div>
      ) : filteredCalls.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-200 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-100 mb-4" />
          <h3 className="text-lg font-bold text-gray-900">Tudo limpo!</h3>
          <p className="text-gray-500 max-w-xs mx-auto">Nenhum chamado encontrado com os filtros atuais.</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCalls.map(call => (
            <div key={call.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all group overflow-hidden flex flex-col">
              {/* Card Header */}
              <div className={cn(
                "px-6 py-4 border-b flex items-start justify-between",
                call.status === 'resolved' ? "bg-emerald-50/50 border-emerald-100" :
                call.priority === 'high' ? "bg-red-50/50 border-red-100" :
                "bg-gray-50/50 border-gray-100"
              )}>
                <div className="flex flex-col gap-1">
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border w-fit",
                    call.priority === 'high' ? "bg-red-100 text-red-600 border-red-200" :
                    call.priority === 'medium' ? "bg-amber-100 text-amber-600 border-amber-200" :
                    "bg-blue-100 text-blue-600 border-blue-200"
                  )}>
                    Prioridade {call.priority === 'high' ? 'Alta' : call.priority === 'medium' ? 'Média' : 'Baixa'}
                  </span>
                  <h4 className="font-bold text-gray-900 line-clamp-1">{call.clientName}</h4>
                </div>
                {!managerClientId && (
                  <div className="flex items-center gap-2">
                    {call.status === 'open' && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setModalState({ type: 'resolve', call })}
                          className="p-2 bg-white text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-all shadow-sm"
                          title="Resolver Chamado"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setModalState({ type: 'cancel', call })}
                          className="p-2 bg-white text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 transition-all shadow-sm"
                          title="Cancelar Chamado"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {call.status !== 'resolved' && (
                      <button 
                        onClick={() => {
                          setFormData({
                            clientId: call.clientId,
                            addressId: call.addressId,
                            description: call.description,
                            priority: call.priority,
                            resolutionNotes: call.resolutionNotes || '',
                            attachmentUrl: call.attachmentUrl || '',
                            forecastDate: call.forecastDate || ''
                          });
                          setModalState({ type: 'edit', call });
                        }}
                        className="p-2 bg-white text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-all shadow-sm"
                        title="Editar Chamado"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => setModalState({ type: 'delete', call })}
                      className="p-2 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-all shadow-sm"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Card Body */}
              <div className="p-6 space-y-4 flex-1">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-500 font-medium leading-relaxed">
                    {call.addressLabel}
                  </p>
                </div>

                {call.forecastDate && call.status !== 'resolved' && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-xl border border-amber-100 ring-4 ring-amber-50/50">
                    <Clock3 className="w-4 h-4 text-amber-600" />
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-widest text-amber-500">Previsão Atendimento</span>
                      <span className="text-xs font-bold text-amber-700">
                        {format(new Date(call.forecastDate + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-sm text-gray-700 font-medium mb-2 leading-relaxed">
                    {call.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        Aberto em {call.createdAt?.seconds ? format(new Date(call.createdAt.seconds * 1000), "dd 'de' MMMM", { locale: ptBR }) : 'Recentemente'}
                      </div>
                      {call.status !== ServiceCallStatus.RESOLVED && call.status !== ServiceCallStatus.CANCELLED && call.createdAt?.seconds && (
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-md text-[9px] font-black tracking-widest",
                          differenceInDays(new Date(), new Date(call.createdAt.seconds * 1000)) >= 20 
                            ? "bg-red-100 text-red-600 border border-red-200" 
                            : "bg-blue-50 text-blue-600 border border-blue-100"
                        )}>
                          {differenceInDays(new Date(), new Date(call.createdAt.seconds * 1000))} {differenceInDays(new Date(), new Date(call.createdAt.seconds * 1000)) === 1 ? 'dia' : 'dias'} em aberto
                        </span>
                      )}
                    </div>
                    {call.attachmentUrl && (
                      <a 
                        href={call.attachmentUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline shrink-0 ml-2"
                      >
                        <Paperclip className="w-3 h-3" />
                        Anexo
                      </a>
                    )}
                  </div>
                </div>

                {call.status === 'resolved' && (
                  <div className="pt-4 mt-4 border-t border-dashed border-gray-200">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase text-emerald-600 tracking-wider mb-1">Resolução</div>
                        <p className="text-xs text-gray-600 italic">"{call.resolutionNotes || 'Sem observações'}"</p>
                        <div className="text-[9px] text-emerald-500 mt-1 font-bold">
                          {call.resolvedAt?.seconds && format(new Date(call.resolvedAt.seconds * 1000), "dd/MM/yyyy HH:mm")}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="px-6 py-4 bg-gray-50/30 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-2 h-2 rounded-full animate-pulse",
                    call.status === 'open' ? "bg-red-500" :
                    call.status === 'resolved' ? "bg-emerald-500" : "bg-blue-500"
                  )} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                    {call.status === 'open' ? 'Pendente' : call.status === 'resolved' ? 'Finalizado' : 'Cancelado'}
                  </span>
                </div>
                {call.maintenanceRecordId && (
                  <span className="text-[9px] font-bold text-blue-400 uppercase italic">Origem: Preventiva</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                <th className="px-6 py-4">Status / Prioridade</th>
                <th className="px-6 py-4">Cliente / Endereço</th>
                <th className="px-6 py-4">Data / Previsão</th>
                <th className="px-6 py-4">Descrição</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCalls.map(call => (
                <tr key={call.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-2 items-start">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                        call.status === 'open' ? "bg-red-50 text-red-600 border-red-200" :
                        call.status === 'resolved' ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                        "bg-gray-50 text-gray-500 border-gray-200"
                      )}>
                        {call.status === 'open' ? 'Pendente' : call.status === 'resolved' ? 'Resolvido' : 'Cancelado'}
                      </span>
                      <span className={cn(
                        "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border",
                        call.priority === 'high' ? "bg-red-100 text-red-600 border-red-200" :
                        call.priority === 'medium' ? "bg-amber-100 text-amber-600 border-amber-200" :
                        "bg-blue-100 text-blue-600 border-blue-200"
                      )}>
                        {call.priority === 'high' ? 'Alta' : call.priority === 'medium' ? 'Média' : 'Baixa'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-gray-900 line-clamp-1">{call.clientName}</span>
                      <span className="text-xs text-gray-500 line-clamp-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-gray-400" />
                        {call.addressLabel}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        Aberto: {call.createdAt?.seconds ? format(new Date(call.createdAt.seconds * 1000), "dd/MM/yy", { locale: ptBR }) : '-'}
                      </div>
                      {call.forecastDate && call.status !== 'resolved' && (
                        <div className="flex items-center gap-1 text-amber-600 font-medium mt-1">
                          <Clock3 className="w-3 h-3" />
                          Prev: {format(new Date(call.forecastDate + 'T12:00:00'), "dd/MM/yy")}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="max-w-xs xl:max-w-md">
                      <p className="text-xs text-gray-700 line-clamp-2">{call.description}</p>
                      {call.attachmentUrl && (
                        <a href={call.attachmentUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 mt-1">
                          <Paperclip className="w-3 h-3" /> Ver anexo
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {!managerClientId && (
                      <div className="flex items-center justify-end gap-1">
                        {call.status === 'open' && (
                          <>
                            <button onClick={() => setModalState({ type: 'resolve', call })} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Resolver">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => setModalState({ type: 'cancel', call })} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Cancelar">
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {call.status !== 'resolved' && (
                          <button onClick={() => {
                            setFormData({
                              clientId: call.clientId,
                              addressId: call.addressId,
                              description: call.description,
                              priority: call.priority,
                              resolutionNotes: call.resolutionNotes || '',
                              attachmentUrl: call.attachmentUrl || '',
                              forecastDate: call.forecastDate || ''
                            });
                            setModalState({ type: 'edit', call });
                          }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => setModalState({ type: 'delete', call })} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden">
            <div className={cn(
              "p-6 border-b flex items-center justify-between",
              modalState.type === 'delete' ? "bg-red-50 border-red-100" : "bg-blue-50 border-blue-100"
            )}>
              <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
                {modalState.type === 'add' ? <Plus className="text-blue-600" /> : 
                 modalState.type === 'resolve' ? <CheckCircle2 className="text-emerald-600" /> : 
                 <Trash2 className="text-red-600" />}
                {modalState.type === 'add' ? 'Abrir Novo Chamado' :
                 modalState.type === 'edit' ? 'Editar Chamado' :
                 modalState.type === 'resolve' ? 'Finalizar Atendimento' : 'Excluir Registro'}
              </h3>
              <button 
                onClick={() => {
                  setModalState(null);
                  setMessage(null);
                }}
                className="p-2 hover:bg-black/5 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            <div className="p-8">
              {message && (
                <div className={cn(
                  "mb-6 p-4 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
                  message.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-red-50 border-red-100 text-red-700"
                )}>
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="text-sm font-bold">{message.text}</p>
                </div>
              )}
              {modalState.type === 'delete' ? (
                <p className="text-gray-600 font-medium">Tem certeza que deseja remover este chamado permanentemente?</p>
              ) : modalState.type === 'cancel' ? (
                <p className="text-gray-600 font-medium">Deseja realmente cancelar este chamado? Esta ação não pode ser desfeita.</p>
              ) : modalState.type === 'resolve' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Relatório de Atendimento</label>
                    <textarea 
                      autoFocus
                      rows={4}
                      value={formData.resolutionNotes}
                      onChange={(e) => setFormData({ ...formData, resolutionNotes: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all resize-none"
                      placeholder="Descreva o que foi feito para resolver o problema..."
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Cliente</label>
                      <select 
                        disabled={modalState.type === 'edit'}
                        value={formData.clientId}
                        onChange={(e) => setFormData({ ...formData, clientId: e.target.value, addressId: '' })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700 disabled:opacity-60"
                      >
                        <option value="">Selecionar...</option>
                        {clients.slice().sort((a,b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Unidade / Endereço</label>
                      <select 
                        disabled={!formData.clientId || modalState.type === 'edit'}
                        value={formData.addressId}
                        onChange={(e) => {
                          const addrId = e.target.value;
                          setFormData({ ...formData, addressId: addrId });
                          
                          // Quick check to warn user immediately
                          if (modalState.type === 'add' && addrId) {
                            const hasOpen = calls.some(c => 
                              c.addressId === addrId && 
                              (c.status === ServiceCallStatus.OPEN || c.status === ServiceCallStatus.IN_PROGRESS)
                            );
                            if (hasOpen) {
                              setMessage({ 
                                text: 'Este endereço já possui um chamado em aberto.', 
                                type: 'error' 
                              });
                            } else {
                              setMessage(null);
                            }
                          }
                        }}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-gray-700 disabled:opacity-60"
                      >
                        <option value="">Selecionar...</option>
                        {selectedClientAddresses.slice().sort((a,b) => a.street.localeCompare(b.street)).map(a => {
                          const hasOpen = calls.some(c => 
                            c.addressId === a.id && 
                            (c.status === ServiceCallStatus.OPEN || c.status === ServiceCallStatus.IN_PROGRESS)
                          );
                          return (
                            <option key={a.id} value={a.id} className={hasOpen ? "text-amber-600" : ""}>
                              {a.street} {hasOpen ? ' (Chamado em aberto ⚠️)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Descrição do Problema</label>
                    <textarea 
                      rows={3}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all resize-none font-medium text-sm"
                      placeholder="Ex: Ar condicionado da sala 04 não gela..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Anexo (Imagem / Link)</label>
                      <ImageUploader 
                        value={formData.attachmentUrl} 
                        onChange={(val) => setFormData({ ...formData, attachmentUrl: val })} 
                      />
                      {formData.attachmentUrl && !formData.attachmentUrl.startsWith('data:image') && (
                        <button
                          type="button"
                          onClick={() => window.open(formData.attachmentUrl.startsWith('http') ? formData.attachmentUrl : `https://${formData.attachmentUrl}`, '_blank')}
                          className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" /> Testar Link
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Previsão de Atendimento</label>
                      <div className="relative">
                        <Clock3 className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input 
                          type="date"
                          value={formData.forecastDate}
                          onChange={(e) => setFormData({ ...formData, forecastDate: e.target.value })}
                          className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Nível de Prioridade</label>
                    <div className="flex gap-2">
                      {Object.values(ServiceCallPriority).map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setFormData({ ...formData, priority: p })}
                          className={cn(
                            "flex-1 py-3 rounded-xl border text-xs font-black uppercase tracking-widest transition-all",
                            formData.priority === p 
                              ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100" 
                              : "bg-white text-gray-500 border-gray-100 hover:bg-gray-50"
                          )}
                        >
                          {p === 'low' ? 'Baixa' : p === 'medium' ? 'Média' : 'Alta'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 bg-gray-50 border-t flex justify-end gap-3">
              <button 
                onClick={() => {
                  setModalState(null);
                  setMessage(null);
                }}
                disabled={saving}
                className="px-6 py-3 text-sm font-black uppercase tracking-widest text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button 
                onClick={handleAction}
                disabled={saving || ((modalState.type === 'add' || modalState.type === 'edit') && (!formData.clientId || !formData.addressId || !formData.description))}
                className={cn(
                  "px-8 py-3 text-sm font-black uppercase tracking-widest text-white rounded-2xl transition-all shadow-xl disabled:opacity-50 flex items-center gap-2",
                  modalState.type === 'delete' ? "bg-red-600 hover:bg-red-700 shadow-red-100" :
                  modalState.type === 'cancel' ? "bg-amber-600 hover:bg-amber-700 shadow-amber-100" :
                  modalState.type === 'resolve' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100" :
                  "bg-blue-600 hover:bg-blue-700 shadow-blue-100"
                )}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {modalState.type === 'add' ? 'Confirmar Abertura' :
                 modalState.type === 'edit' ? 'Salvar Alterações' :
                 modalState.type === 'cancel' ? 'Confirmar Cancelamento' :
                 modalState.type === 'resolve' ? 'Salvar Resolução' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
