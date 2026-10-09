import { useState, useEffect, useMemo, useRef } from 'react';
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
import { ServiceCall, ServiceCallStatus, ServiceCallPriority, Client, Address, UserRole, UserProfile, ServiceCallComment, RouteConfiguration } from '../types';
import { cn } from '../lib/utils';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ImageUploader } from './ImageUploader';
import { compressImageToBase64 } from '../lib/image-utils';
import { MessageSquare, ThumbsUp, Send } from 'lucide-react'; // Some new icons we might want for comments!

interface Props {
  managerClientId?: string;
  userRole?: string;
  userProfile?: UserProfile;
  initialSelectedCallId?: string;
  onClearInitialCallId?: () => void;
}

const renderCommentContent = (content: string, isMe: boolean) => {
  if (!content) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const parts = content.split(urlRegex);
  
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a 
          key={index} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer" 
          className={cn(
            "underline font-extrabold break-all cursor-pointer transition-colors",
            isMe ? "text-cyan-200 hover:text-cyan-100" : "text-blue-600 hover:text-blue-800"
          )}
          title="Abrir link em nova aba"
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

export default function ServiceCallsView({ managerClientId, userRole, userProfile, initialSelectedCallId, onClearInitialCallId }: Props) {
  const [calls, setCalls] = useState<ServiceCall[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ServiceCallStatus | 'all'>('all');
  const [routeFilter, setRouteFilter] = useState<string>('all');
  const [routeConfigs, setRouteConfigs] = useState<RouteConfiguration[]>([]);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');

  const availableRoutes = useMemo(() => {
    const routeNames = new Set<string>();
    addresses.forEach(addr => {
      if (addr.route) {
        const config = routeConfigs.find(rc => rc.id === addr.route || rc.routeName === addr.route);
        routeNames.add(config ? config.routeName : addr.route);
      } else {
        routeNames.add('Sem Rota');
      }
    });
    return Array.from(routeNames).sort((a, b) => {
      if (a === 'Sem Rota') return 1;
      if (b === 'Sem Rota') return -1;
      return a.localeCompare(b, 'pt-BR');
    });
  }, [addresses, routeConfigs]);
  
  const [modalState, setModalState] = useState<{
    type: 'add' | 'resolve' | 'delete' | 'edit' | 'cancel' | 'details';
    call?: ServiceCall;
  } | null>(null);

  // Monitora alterações de initialSelectedCallId para carregar os detalhes do chamado automaticamente
  useEffect(() => {
    if (initialSelectedCallId && calls.length > 0) {
      const matchedCall = calls.find(c => c.id === initialSelectedCallId);
      if (matchedCall) {
        setFormData(prev => ({ ...prev, resolutionNotes: '' }));
        setModalState({ type: 'details', call: matchedCall });
        if (onClearInitialCallId) {
          onClearInitialCallId();
        }
      }
    }
  }, [initialSelectedCallId, calls, onClearInitialCallId]);

  const [formData, setFormData] = useState({
    clientId: '',
    addressId: '',
    description: '',
    priority: ServiceCallPriority.MEDIUM,
    resolutionNotes: '',
    attachmentUrl: '',
    attachmentUrl1: '',
    attachmentUrl2: '',
    linkUrl: '',
    forecastDate: ''
  });

  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);
  const [isUploadingSlot1, setIsUploadingSlot1] = useState(false);
  const [isUploadingSlot2, setIsUploadingSlot2] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, slot: 1 | 2) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (slot === 1) setIsUploadingSlot1(true);
      else setIsUploadingSlot2(true);
      const base64 = await compressImageToBase64(file, 1200, 1200, 0.7);
      if (slot === 1) {
        setFormData(prev => ({ ...prev, attachmentUrl1: base64 }));
      } else {
        setFormData(prev => ({ ...prev, attachmentUrl2: base64 }));
      }
    } catch (error) {
      console.error('Failed to process image:', error);
      alert('Erro ao processar imagem.');
    } finally {
      if (slot === 1) setIsUploadingSlot1(false);
      else setIsUploadingSlot2(false);
      if (e.target) e.target.value = '';
    }
  };

  const [newCommentText, setNewCommentText] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  const openAttachment = (url: string) => {
    if (!url) return;
    if (url.startsWith('data:image')) {
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(`
          <html>
            <head>
              <title>Visualizar Anexo</title>
              <style>
                body { margin: 0; background-color: #0d1117; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: system-ui, sans-serif; }
                img { max-width: 95%; max-height: 95vh; object-fit: contain; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
              </style>
            </head>
            <body>
              <img src="${url}" alt="Anexo" />
            </body>
          </html>
        `);
        newWindow.document.close();
      }
    } else {
      window.open(url.startsWith('http') ? url : `https://${url}`, '_blank');
    }
  };

  const handleAddComment = async (callId: string) => {
    if (!newCommentText.trim() || !userProfile) return;
    setSavingComment(true);
    try {
      const targetCall = calls.find(c => c.id === callId);
      if (!targetCall) return;
      
      const comment: ServiceCallComment = {
        id: Math.random().toString(36).substring(2, 9),
        authorId: userProfile.uid,
        authorName: userProfile.name || userProfile.email.split('@')[0],
        authorRole: userProfile.role,
        content: newCommentText.trim(),
        createdAt: new Date()
      };

      const updatedComments = [...(targetCall.comments || []), comment];
      
      await dataService.updateServiceCall(callId, {
        comments: updatedComments
      });

      // Envia notificação sobre novo comentário nas interações
      const clientName = targetCall.clientName || "Cliente";
      const authorName = userProfile.name || userProfile.email.split('@')[0];
      await dataService.sendNotificationToAllAllowed(
        'new_comment',
        'Novo Comentário em Chamado',
        `${authorName} adicionou um comentário no chamado do cliente ${clientName}.`,
        callId,
        userProfile.uid
      );

      // Update local state directly
      setCalls(prev => prev.map(c => c.id === callId ? { ...c, comments: updatedComments } : c));
      
      // Update modal active call so it displays immediately
      setModalState(prev => prev && prev.call?.id === callId ? { ...prev, call: { ...prev.call, comments: updatedComments } } : prev);
      
      setNewCommentText('');
    } catch (e) {
      console.error('Erro ao adicionar comentário:', e);
    } finally {
      setSavingComment(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load them individually to handle potential partial failures
      const [callsData, clientsData, addressesData, routeConfigsData] = await Promise.all([
        dataService.getServiceCalls(managerClientId).catch(e => {
          console.error('Error loading service calls:', e);
          return [];
        }),
        dataService.getClients(managerClientId).catch(e => {
          console.error('Error loading clients:', e);
          return [];
        }),
        dataService.getAddresses(managerClientId).catch(e => {
          console.error('Error loading addresses:', e);
          return [];
        }),
        dataService.getRouteConfigs().catch(e => {
          console.error('Error loading route configs:', e);
          return [];
        })
      ]);
      
      setCalls(callsData.filter((c: ServiceCall) => !managerClientId || c.clientId === managerClientId) as ServiceCall[]);
      setClients(clientsData.filter((c: Client) => !managerClientId || c.id === managerClientId) as Client[]);
      setAddresses(addressesData.filter((a: Address) => !managerClientId || a.clientId === managerClientId) as Address[]);
      setRouteConfigs(routeConfigsData as RouteConfiguration[]);
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
      
      const address = addresses.find(a => a.id === c.addressId);
      const routeName = address ? (routeConfigs.find(rc => rc.id === address.route || rc.routeName === address.route)?.id || routeConfigs.find(rc => rc.id === address.route || rc.routeName === address.route)?.routeName || address.route || 'Sem Rota') : 'Sem Rota';
      const matchesRoute = routeFilter === 'all' || routeName === routeFilter;
      
      return matchesSearch && matchesStatus && matchesRoute;
    });
  }, [calls, search, statusFilter, routeFilter, addresses, routeConfigs]);

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
        
        const addedRef = await dataService.addServiceCall({
          clientId: formData.clientId,
          addressId: formData.addressId,
          description: formData.description,
          status: ServiceCallStatus.OPEN,
          priority: formData.priority,
          clientName: client?.name,
          addressLabel: address?.street,
          createdAt: new Date(),
          attachmentUrl: formData.attachmentUrl1 || formData.attachmentUrl || formData.linkUrl || '',
          attachmentUrl1: formData.attachmentUrl1 || '',
          attachmentUrl2: formData.attachmentUrl2 || '',
          linkUrl: formData.linkUrl || '',
          forecastDate: formData.forecastDate || ''
        });

        if (addedRef) {
          const authorName = userProfile?.name || "Um usuário";
          await dataService.sendNotificationToAllAllowed(
            'new_call',
            'Novo Chamado Aberto',
            `${authorName} abriu um chamado para o cliente ${client?.name || 'Cliente'} em ${address?.street || 'Endereço'}.`,
            addedRef.id,
            userProfile?.uid || ''
          );
        }
      } else if (modalState.type === 'resolve' && modalState.call) {
        await dataService.updateServiceCall(modalState.call.id, {
          status: ServiceCallStatus.RESOLVED,
          resolutionNotes: formData.resolutionNotes,
          resolvedAt: new Date()
        });

        const clientName = modalState.call.clientName || 'Cliente';
        const authorName = userProfile?.name || 'Técnico';
        await dataService.sendNotificationToAllAllowed(
          'call_resolved',
          'Chamado Finalizado',
          `${authorName} finalizou o chamado do cliente ${clientName}.`,
          modalState.call.id,
          userProfile?.uid || ''
        );
      } else if (modalState.type === 'delete' && modalState.call) {
        await dataService.deleteServiceCall(modalState.call.id);
      } else if (modalState.type === 'edit' && modalState.call) {
        const updatePayload: any = {
          description: formData.description,
          priority: formData.priority,
          attachmentUrl: formData.attachmentUrl1 || formData.attachmentUrl || formData.linkUrl || '',
          attachmentUrl1: formData.attachmentUrl1 || '',
          attachmentUrl2: formData.attachmentUrl2 || '',
          linkUrl: formData.linkUrl || '',
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
        attachmentUrl1: '',
        attachmentUrl2: '',
        linkUrl: '',
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
        {(!managerClientId || userRole === UserRole.MANAGER) && (
          <button 
            onClick={() => {
              setFormData({
                clientId: managerClientId || '',
                addressId: '',
                description: '',
                priority: ServiceCallPriority.MEDIUM,
                resolutionNotes: '',
                attachmentUrl: '',
                attachmentUrl1: '',
                attachmentUrl2: '',
                linkUrl: '',
                forecastDate: ''
              });
              setModalState({ type: 'add' });
            }}
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
        
        {/* Filtro por Rota */}
        <div className="w-full md:w-64 relative">
          <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 animate-pulse" />
          <select
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
            className="w-full pl-10 pr-8 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none bg-white font-bold text-gray-700 text-xs uppercase tracking-wider cursor-pointer"
          >
            <option value="all">Todas as Rotas</option>
            {availableRoutes.map(routeName => (
              <option key={routeName} value={routeName}>
                {routeName}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
            </svg>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(search !== '' || statusFilter !== 'all' || routeFilter !== 'all') && (
            <div className="text-[10px] font-black text-blue-600 bg-blue-50/50 border border-blue-100 px-3 py-2 rounded-xl whitespace-nowrap uppercase tracking-widest animate-in zoom-in-95 duration-150">
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
          {filteredCalls.map(call => {
            const address = addresses.find(a => a.id === call.addressId);
            const routeName = address ? (routeConfigs.find(rc => rc.id === address.route || rc.routeName === address.route)?.id || routeConfigs.find(rc => rc.id === address.route || rc.routeName === address.route)?.routeName || address.route || 'Sem Rota') : 'Sem Rota';
            
            return (
              <div key={call.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all group overflow-hidden flex flex-col">
                {/* Card Header */}
                <div className={cn(
                  "px-6 py-4 border-b flex items-start justify-between",
                  call.status === 'resolved' ? "bg-emerald-50/50 border-emerald-100" :
                  call.priority === 'high' ? "bg-red-50/50 border-red-100" :
                  "bg-gray-50/50 border-gray-100"
                )}>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap gap-1">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border w-fit",
                        call.priority === 'high' ? "bg-red-100 text-red-600 border-red-200" :
                        call.priority === 'medium' ? "bg-amber-100 text-amber-600 border-amber-200" :
                        "bg-blue-100 text-blue-600 border-blue-200"
                      )}>
                        Prioridade {call.priority === 'high' ? 'Alta' : call.priority === 'medium' ? 'Média' : 'Baixa'}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-slate-200 bg-slate-100 text-slate-600 w-fit flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {routeName}
                      </span>
                    </div>
                    <h4 className="font-bold text-gray-900 line-clamp-1">{call.clientName}</h4>
                  </div>
                <div className="flex items-center gap-2">
                  {call.status === 'open' && !managerClientId && (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          setFormData(prev => ({ ...prev, resolutionNotes: '' }));
                          setModalState({ type: 'details', call });
                        }}
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
                  {call.status !== 'resolved' && (!managerClientId || userRole === UserRole.MANAGER) && (
                    <button 
                      onClick={() => {
                        setFormData({
                          clientId: call.clientId,
                          addressId: call.addressId,
                          description: call.description,
                          priority: call.priority,
                          resolutionNotes: call.resolutionNotes || '',
                          attachmentUrl: call.attachmentUrl || '',
                          attachmentUrl1: call.attachmentUrl1 || '',
                          attachmentUrl2: call.attachmentUrl2 || '',
                          linkUrl: call.linkUrl || '',
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
                  {(userRole === UserRole.ADMIN || userRole === UserRole.ASSISTANT) && (
                    <button 
                      onClick={() => setModalState({ type: 'delete', call })}
                      className="p-2 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-all shadow-sm"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
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
                    <div className="flex flex-wrap gap-2 mt-1">
                      {call.attachmentUrl1 && (
                        <button 
                          onClick={() => openAttachment(call.attachmentUrl1!)}
                          className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline shrink-0"
                        >
                          <Paperclip className="w-3 h-3" /> Imagem 1
                        </button>
                      )}
                      {call.attachmentUrl2 && (
                        <button 
                          onClick={() => openAttachment(call.attachmentUrl2!)}
                          className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline shrink-0"
                        >
                          <Paperclip className="w-3 h-3" /> Imagem 2
                        </button>
                      )}
                      {call.linkUrl && (
                        <button 
                          onClick={() => window.open(call.linkUrl!.startsWith('http') ? call.linkUrl : `https://${call.linkUrl}`, '_blank')}
                          className="flex items-center gap-1 text-[10px] font-bold text-cyan-600 hover:underline shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" /> Link
                        </button>
                      )}
                      {!call.attachmentUrl1 && !call.attachmentUrl2 && !call.linkUrl && call.attachmentUrl && (
                        <button 
                          onClick={() => openAttachment(call.attachmentUrl)}
                          className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline shrink-0"
                        >
                          <Paperclip className="w-3 h-3" /> Anexo
                        </button>
                      )}
                    </div>
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
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setModalState({ type: 'details', call })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Interações ({call.comments?.length || 0})
                  </button>
                  {call.maintenanceRecordId && (
                    <span className="text-[9px] font-bold text-blue-400 uppercase italic">Origem: Preventiva</span>
                  )}
                </div>
              </div>
            </div>
          ); })}
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
              {filteredCalls.map(call => {
                const address = addresses.find(a => a.id === call.addressId);
                const routeName = address ? (routeConfigs.find(rc => rc.id === address.route || rc.routeName === address.route)?.id || routeConfigs.find(rc => rc.id === address.route || rc.routeName === address.route)?.routeName || address.route || 'Sem Rota') : 'Sem Rota';
                
                return (
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
                      <span className="text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full w-fit mt-1.5 flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5 text-slate-400 animate-pulse" />
                        {routeName}
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
                      <div className="flex flex-wrap gap-2 mt-1">
                        {call.attachmentUrl1 && (
                          <button 
                            onClick={() => openAttachment(call.attachmentUrl1!)}
                            className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-bold"
                          >
                            <Paperclip className="w-3 h-3" /> Imagem 1
                          </button>
                        )}
                        {call.attachmentUrl2 && (
                          <button 
                            onClick={() => openAttachment(call.attachmentUrl2!)}
                            className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-bold"
                          >
                            <Paperclip className="w-3 h-3" /> Imagem 2
                          </button>
                        )}
                        {call.linkUrl && (
                          <button 
                            onClick={() => window.open(call.linkUrl!.startsWith('http') ? call.linkUrl : `https://${call.linkUrl}`, '_blank')}
                            className="text-[10px] text-cyan-600 hover:underline flex items-center gap-1 font-bold"
                          >
                            <ExternalLink className="w-3 h-3" /> Link
                          </button>
                        )}
                        {!call.attachmentUrl1 && !call.attachmentUrl2 && !call.linkUrl && call.attachmentUrl && (
                          <button 
                            onClick={() => openAttachment(call.attachmentUrl)} 
                            className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-bold"
                          >
                            <Paperclip className="w-3 h-3" /> Ver anexo
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button 
                        onClick={() => setModalState({ type: 'details', call })} 
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1"
                        title="Ver Interações e Detalhes"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span className="text-[10px] font-bold">
                          ({call.comments?.length || 0})
                        </span>
                      </button>
                      {call.status === 'open' && !managerClientId && (
                        <>
                          <button onClick={() => {
                            setFormData(prev => ({ ...prev, resolutionNotes: '' }));
                            setModalState({ type: 'details', call });
                          }} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Resolver">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => setModalState({ type: 'cancel', call })} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Cancelar">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {call.status !== 'resolved' && (!managerClientId || userRole === UserRole.MANAGER) && (
                        <button onClick={() => {
                          setFormData({
                            clientId: call.clientId,
                            addressId: call.addressId,
                            description: call.description,
                            priority: call.priority,
                            resolutionNotes: call.resolutionNotes || '',
                            attachmentUrl: call.attachmentUrl || '',
                            attachmentUrl1: call.attachmentUrl1 || '',
                            attachmentUrl2: call.attachmentUrl2 || '',
                            linkUrl: call.linkUrl || '',
                            forecastDate: call.forecastDate || ''
                          });
                          setModalState({ type: 'edit', call });
                        }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      {(userRole === UserRole.ADMIN || userRole === UserRole.ASSISTANT) && (
                        <button onClick={() => setModalState({ type: 'delete', call })} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 md:py-12 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className={cn(
            "bg-white rounded-3xl shadow-2xl border border-gray-200 w-full overflow-hidden transition-all flex flex-col max-h-[88vh]",
            modalState.type === 'details' ? "max-w-4xl" : "max-w-lg"
          )}>
            <div className={cn(
              "p-6 border-b flex items-center justify-between shrink-0",
              modalState.type === 'delete' ? "bg-red-50 border-red-100" : 
              modalState.type === 'details' ? "bg-blue-50/50 border-blue-100" :
              "bg-blue-50 border-blue-100"
            )}>
              <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
                {modalState.type === 'add' ? <Plus className="text-blue-600" /> : 
                 modalState.type === 'resolve' ? <CheckCircle2 className="text-emerald-600" /> : 
                 modalState.type === 'details' ? <MessageSquare className="text-blue-600" /> :
                 <Trash2 className="text-red-600" />}
                {modalState.type === 'add' ? 'Abrir Novo Chamado' :
                 modalState.type === 'edit' ? 'Editar Chamado' :
                 modalState.type === 'resolve' ? 'Finalizar Atendimento' : 
                 modalState.type === 'details' ? 'Interações & Comentários' :
                 'Excluir Registro'}
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

            <div className="p-8 overflow-y-auto flex-1">
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
                      placeholder="Descreva o que foi feito para resolver o problem..."
                    />
                  </div>
                </div>
              ) : modalState.type === 'details' && modalState.call ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                  {/* Left Column: Call Summary & Attachment */}
                  <div className="space-y-6">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border w-fit",
                          modalState.call.priority === 'high' ? "bg-red-100 text-red-600 border-red-200" :
                          modalState.call.priority === 'medium' ? "bg-amber-100 text-amber-600 border-amber-200" :
                          "bg-blue-100 text-blue-600 border-blue-200"
                        )}>
                          Prioridade {modalState.call.priority === 'high' ? 'Alta' : modalState.call.priority === 'medium' ? 'Média' : 'Baixa'}
                        </span>
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border w-fit",
                          modalState.call.status === 'open' ? "bg-red-100 text-red-600 border-red-200" :
                          modalState.call.status === 'resolved' ? "bg-emerald-100 text-emerald-600 border-emerald-200" :
                          "bg-gray-100 text-gray-600 border-gray-200"
                        )}>
                          Status: {modalState.call.status === 'open' ? 'Pendente' : modalState.call.status === 'resolved' ? 'Finalizado' : 'Cancelado'}
                        </span>
                      </div>
                      <h4 className="text-lg font-black text-gray-900">{modalState.call.clientName}</h4>
                      <div className="text-xs text-gray-500 font-medium flex items-center gap-1">
                        <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                        {modalState.call.addressLabel}
                      </div>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Descrição do Problema</label>
                      <p className="text-xs text-gray-700 leading-relaxed font-semibold">
                        {modalState.call.description}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <span className="block text-[8px] font-black uppercase tracking-widest text-gray-400 mb-1">Aberto em</span>
                        <span className="font-bold text-gray-700">
                          {modalState.call.createdAt?.seconds ? format(new Date(modalState.call.createdAt.seconds * 1000), "dd/MM/yyyy") : 'Recentemente'}
                        </span>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <span className="block text-[8px] font-black uppercase tracking-widest text-gray-400 mb-1">Previsão</span>
                        <span className="font-bold text-amber-600">
                          {modalState.call.forecastDate ? format(new Date(modalState.call.forecastDate + 'T12:00:00'), "dd/MM/yyyy") : 'Não informada'}
                        </span>
                      </div>
                    </div>

                    {modalState.call.resolutionNotes && (
                      <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-emerald-600 block">Resolução do Atendimento</label>
                        <p className="text-xs text-emerald-800 leading-relaxed italic">
                          "{modalState.call.resolutionNotes}"
                        </p>
                      </div>
                    )}

                    {/* Imagens e Link do Chamado */}
                    {(modalState.call.attachmentUrl1 || modalState.call.attachmentUrl2 || modalState.call.linkUrl || modalState.call.attachmentUrl) ? (
                      <div className="space-y-4">
                        {(modalState.call.attachmentUrl1 || modalState.call.attachmentUrl2 || (modalState.call.attachmentUrl && modalState.call.attachmentUrl.startsWith('data:image'))) && (
                          <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Imagens do Chamado</label>
                            <div className="grid grid-cols-2 gap-3">
                              {/* Imagem 1 or legacy image */}
                              {(modalState.call.attachmentUrl1 || (modalState.call.attachmentUrl && modalState.call.attachmentUrl.startsWith('data:image'))) ? (
                                <div className="relative group rounded-xl border border-gray-200 overflow-hidden bg-gray-50 aspect-video flex items-center justify-center">
                                  <img 
                                    src={modalState.call.attachmentUrl1 || modalState.call.attachmentUrl} 
                                    alt="Imagem 1" 
                                    className="w-full h-full object-cover" 
                                  />
                                  <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <button
                                      type="button"
                                      onClick={() => openAttachment(modalState.call!.attachmentUrl1 || modalState.call!.attachmentUrl!)}
                                      className="bg-white hover:bg-gray-100 text-gray-900 font-bold p-1.5 rounded-lg text-[10px] flex items-center gap-1 shadow-lg"
                                    >
                                      <ExternalLink className="w-3 h-3 text-blue-600" />
                                      Ampliar
                                    </button>
                                  </div>
                                </div>
                              ) : null}

                              {/* Imagem 2 */}
                              {modalState.call.attachmentUrl2 ? (
                                <div className="relative group rounded-xl border border-gray-200 overflow-hidden bg-gray-50 aspect-video flex items-center justify-center">
                                  <img 
                                    src={modalState.call.attachmentUrl2} 
                                    alt="Imagem 2" 
                                    className="w-full h-full object-cover" 
                                  />
                                  <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <button
                                      type="button"
                                      onClick={() => openAttachment(modalState.call!.attachmentUrl2!)}
                                      className="bg-white hover:bg-gray-100 text-gray-900 font-bold p-1.5 rounded-lg text-[10px] flex items-center gap-1 shadow-lg"
                                    >
                                      <ExternalLink className="w-3 h-3 text-blue-600" />
                                      Ampliar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 flex items-center justify-center aspect-video text-gray-400 text-[10px] font-bold">
                                  Sem Imagem 2
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Link / Legacy text attachment */}
                        {(modalState.call.linkUrl || (modalState.call.attachmentUrl && !modalState.call.attachmentUrl.startsWith('data:image'))) && (
                          <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Link de Apoio</label>
                            <a 
                              href={(modalState.call.linkUrl || modalState.call.attachmentUrl)!.startsWith('http') ? (modalState.call.linkUrl || modalState.call.attachmentUrl) : `https://${modalState.call.linkUrl || modalState.call.attachmentUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1.5 bg-blue-50/50 px-3 py-2 rounded-xl border border-blue-100 w-fit break-all"
                            >
                              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                              {(modalState.call.linkUrl || modalState.call.attachmentUrl)}
                            </a>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic block">Nenhum anexo disponível neste chamado.</span>
                    )}

                    {modalState.call.status === 'open' && (
                      <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-3 mt-4">
                        <div className="flex items-center gap-2 text-emerald-700">
                          <CheckCircle2 className="w-5 h-5 shrink-0" />
                          <span className="text-xs font-black uppercase tracking-widest">Finalizar Atendimento</span>
                        </div>
                        <p className="text-[11px] text-emerald-800 font-medium leading-normal">
                          Insira abaixo o relatório técnico ou as notas sobre a resolução deste chamado para finalizá-lo:
                        </p>
                        <textarea
                          rows={2}
                          value={formData.resolutionNotes || ''}
                          onChange={(e) => setFormData({ ...formData, resolutionNotes: e.target.value })}
                          className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all resize-none placeholder-gray-400 font-medium text-gray-700 search-none"
                          placeholder="Ex: Efetuado reaperto das conexões, ajustado níveis e validado funcionamento..."
                        />
                        <button
                          type="button"
                          disabled={saving || !formData.resolutionNotes?.trim()}
                          onClick={async () => {
                            setSaving(true);
                            try {
                              const targetCallId = modalState.call!.id;
                              const updatedNotes = formData.resolutionNotes;
                              const resolvedDate = new Date();

                              await dataService.updateServiceCall(targetCallId, {
                                status: ServiceCallStatus.RESOLVED,
                                resolutionNotes: updatedNotes,
                                resolvedAt: resolvedDate
                              });
                              
                              // Envia notificação sobre chamado resolvido
                              const clientName = modalState.call!.clientName || 'Cliente';
                              const authorName = userProfile?.name || 'Técnico';
                              await dataService.sendNotificationToAllAllowed(
                                'call_resolved',
                                'Chamado Finalizado',
                                `${authorName} finalizou o chamado do cliente ${clientName}.`,
                                targetCallId,
                                userProfile?.uid || ''
                              );
                              
                              setCalls(prev => prev.map(c => c.id === targetCallId ? { 
                                ...c, 
                                status: ServiceCallStatus.RESOLVED, 
                                resolutionNotes: updatedNotes,
                                resolvedAt: resolvedDate
                              } : c));
                              
                              setModalState(prev => prev && prev.call?.id === targetCallId ? { 
                                ...prev, 
                                call: { 
                                  ...prev.call, 
                                  status: ServiceCallStatus.RESOLVED, 
                                  resolutionNotes: updatedNotes,
                                  resolvedAt: resolvedDate
                                } 
                              } : prev);
                              
                              setFormData(prev => ({ ...prev, resolutionNotes: '' }));
                              await loadData();
                            } catch (e) {
                              console.error('Erro ao finalizar chamado:', e);
                            } finally {
                              setSaving(false);
                            }
                          }}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-200/50 flex items-center justify-center gap-1.5"
                        >
                          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Confirmar Resolução
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Comments Feed */}
                  <div className="md:pl-8 flex flex-col pt-6 md:pt-0" style={{ height: '580px' }}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">
                        Interações da Equipe ({modalState.call.comments?.length || 0})
                      </span>
                    </div>

                    {/* Messages Scroller */}
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 pb-4 scrollbar-thin scrollbar-thumb-gray-200">
                      {!modalState.call.comments || modalState.call.comments.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                          <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
                          <p className="text-xs font-bold leading-relaxed">Nenhum comentário registrado ainda.</p>
                          <p className="text-[10px]">Use o campo abaixo para iniciar o diálogo.</p>
                        </div>
                      ) : (
                        modalState.call.comments.map((comment: ServiceCallComment) => {
                          const isMe = comment.authorId === userProfile?.uid;
                          return (
                            <div key={comment.id} className={cn("flex flex-col gap-1 max-w-[85%]", isMe ? "ml-auto items-end" : "mr-auto items-start")}>
                              {/* Meta */}
                              <div className="flex items-center gap-1.5 text-[9px] text-gray-400 font-bold">
                                <span>{comment.authorName}</span>
                                <span className={cn(
                                  "px-1.5 py-0.2 rounded text-[8px] uppercase tracking-widest font-black",
                                  comment.authorRole === 'admin' ? "bg-red-50 text-red-600 border border-red-100" :
                                  comment.authorRole === 'assistant' ? "bg-blue-50 text-blue-600 border border-blue-100" :
                                  comment.authorRole === 'manager' ? "bg-purple-50 text-purple-600 border border-purple-100" :
                                  "bg-gray-100 text-gray-600 border border-gray-200"
                                )}>
                                  {comment.authorRole === 'admin' ? 'Adm' :
                                   comment.authorRole === 'assistant' ? 'Assistente' :
                                   comment.authorRole === 'manager' ? 'Gestor' : 'Suporte'}
                                </span>
                              </div>
                              {/* Bubble */}
                              <div className={cn(
                                "px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-sm font-medium break-words whitespace-pre-wrap max-w-full text-left",
                                isMe 
                                  ? "bg-blue-600 text-white rounded-tr-none" 
                                  : "bg-gray-100 text-gray-700 rounded-tl-none border border-gray-200/50"
                              )}>
                                {renderCommentContent(comment.content, isMe)}
                              </div>
                              {/* Time */}
                              <span className="text-[8px] text-gray-400">
                                {comment.createdAt?.seconds 
                                  ? format(new Date(comment.createdAt.seconds * 1000), "dd/MM HH:mm") 
                                  : comment.createdAt instanceof Date 
                                    ? format(comment.createdAt, "dd/MM HH:mm")
                                    : "Agora mesmo"}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Bottom Sender Form */}
                    <div className="pt-4 border-t border-gray-100 mt-2">
                      <div className="flex gap-2">
                        <textarea
                          rows={2}
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleAddComment(modalState.call!.id);
                            }
                          }}
                          className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs resize-none placeholder-gray-400"
                          placeholder="Digite seu comentário..."
                        />
                        <button
                          type="button"
                          disabled={savingComment || !newCommentText.trim()}
                          onClick={() => handleAddComment(modalState.call!.id)}
                          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl px-3 flex items-center justify-center transition-colors shadow-lg shadow-blue-200"
                        >
                          {savingComment ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Cliente</label>
                      <select 
                        disabled={modalState.type === 'edit' || !!managerClientId}
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
                      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Previsão de Atendimento</label>
                      <div className="relative">
                        <Clock3 className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input 
                          type="date"
                          value={formData.forecastDate}
                          onChange={(e) => setFormData({ ...formData, forecastDate: e.target.value })}
                          className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-semibold"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Nível de Prioridade</label>
                      <div className="flex gap-1.5 h-[38px] items-center">
                        {Object.values(ServiceCallPriority).map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setFormData({ ...formData, priority: p })}
                            className={cn(
                              "flex-1 py-2 rounded-xl border text-[11px] font-bold uppercase tracking-wider transition-all h-full flex items-center justify-center",
                              formData.priority === p 
                                ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100" 
                                : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                            )}
                          >
                            {p === 'low' ? 'Baixa' : p === 'medium' ? 'Média' : 'Alta'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Link do Chamado (Opcional)</label>
                      <div className="flex gap-2">
                        <input 
                          type="url"
                          value={formData.linkUrl}
                          onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })}
                          className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-semibold text-gray-700"
                          placeholder="https://exemplo.com/reuniao-ou-email"
                        />
                        {formData.linkUrl && (
                          <button
                            type="button"
                            onClick={() => window.open(formData.linkUrl.startsWith('http') ? formData.linkUrl : `https://${formData.linkUrl}`, '_blank')}
                            className="px-3 bg-white hover:bg-blue-50 border border-gray-200 rounded-xl text-xs font-bold text-blue-600 transition-colors flex items-center gap-1 shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> Testar
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Imagens do Chamado (Até 2 Fotos)</label>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Imagem Slot 1 */}
                        <div className="space-y-2">
                          <input 
                            ref={fileInputRef1}
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => handlePhotoUpload(e, 1)}
                          />
                          {formData.attachmentUrl1 ? (
                            <div className="relative group rounded-xl border border-gray-200 overflow-hidden bg-white aspect-video flex items-center justify-center shadow-sm">
                              <img src={formData.attachmentUrl1} alt="Foto 1" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openAttachment(formData.attachmentUrl1)}
                                  className="p-1.5 bg-white hover:bg-gray-100 text-gray-700 rounded-lg transition-transform scale-95 group-hover:scale-100"
                                  title="Ver imagem"
                                >
                                  <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFormData({ ...formData, attachmentUrl1: '' })}
                                  className="p-1.5 bg-white hover:bg-red-50 text-red-600 rounded-lg transition-transform scale-95 group-hover:scale-100"
                                  title="Remover"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => fileInputRef1.current?.click()}
                              disabled={isUploadingSlot1}
                              className="border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50/20 rounded-xl p-3 flex flex-col items-center justify-center bg-white transition-all cursor-pointer w-full aspect-video"
                            >
                              {isUploadingSlot1 ? (
                                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                              ) : (
                                <>
                                  <Plus className="w-4 h-4 text-gray-400 mb-1" />
                                  <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest text-center">Foto 1</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Imagem Slot 2 */}
                        <div className="space-y-2">
                          <input 
                            ref={fileInputRef2}
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => handlePhotoUpload(e, 2)}
                          />
                          {formData.attachmentUrl2 ? (
                            <div className="relative group rounded-xl border border-gray-200 overflow-hidden bg-white aspect-video flex items-center justify-center shadow-sm">
                              <img src={formData.attachmentUrl2} alt="Foto 2" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openAttachment(formData.attachmentUrl2)}
                                  className="p-1.5 bg-white hover:bg-gray-100 text-gray-700 rounded-lg transition-transform scale-95 group-hover:scale-100"
                                  title="Ver imagem"
                                >
                                  <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFormData({ ...formData, attachmentUrl2: '' })}
                                  className="p-1.5 bg-white hover:bg-red-50 text-red-600 rounded-lg transition-transform scale-95 group-hover:scale-100"
                                  title="Remover"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => fileInputRef2.current?.click()}
                              disabled={isUploadingSlot2}
                              className="border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50/20 rounded-xl p-3 flex flex-col items-center justify-center bg-white transition-all cursor-pointer w-full aspect-video"
                            >
                              {isUploadingSlot2 ? (
                                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                              ) : (
                                <>
                                  <Plus className="w-4 h-4 text-gray-400 mb-1" />
                                  <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest text-center">Foto 2</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 bg-gray-50 border-t flex justify-end gap-3 shrink-0">
              {modalState.type === 'details' ? (
                <button 
                  onClick={() => {
                    setModalState(null);
                    setMessage(null);
                  }}
                  className="px-8 py-3 text-sm font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 rounded-2xl transition-all shadow-xl shadow-blue-100"
                >
                  Fechar
                </button>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
