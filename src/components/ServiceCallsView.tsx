import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, 
  Plus, 
  CheckCircle2, 
  X, 
  AlertCircle, 
  Loader2, 
  Calendar, 
  MapPin, 
  Trash2, 
  CheckCircle, 
  Paperclip, 
  Clock3, 
  Edit3, 
  Printer, 
  ExternalLink, 
  LayoutGrid, 
  List,
  MessageSquare, 
  Send,
  RotateCcw,
  FileCheck2,
  Check,
  Building2,
  Clock,
  Sparkles,
  ChevronDown,
  Wrench,
  Flame,
  Filter,
  FileText
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { 
  ServiceCall, 
  ServiceCallStatus, 
  ServiceCallPriority, 
  Client, 
  Address, 
  UserRole, 
  UserProfile, 
  ServiceCallComment, 
  RouteConfiguration 
} from '../types';
import { cn, getCanonicalRouteName, normalizeRouteKey } from '../lib/utils';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { compressImageToBase64 } from '../lib/image-utils';

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

export default function ServiceCallsView({ 
  managerClientId, 
  userRole, 
  userProfile, 
  initialSelectedCallId, 
  onClearInitialCallId 
}: Props) {
  const [calls, setCalls] = useState<ServiceCall[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [routeConfigs, setRouteConfigs] = useState<RouteConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingComment, setSavingComment] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  
  // Filtros e visualização
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ServiceCallStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<ServiceCallPriority | 'all'>('all');
  const [workshopFilter, setWorkshopFilter] = useState<'all' | 'workshop'>('all');
  const [routeFilter, setRouteFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');

  // Modal Unificado de Chamados (Abrir, Editar, Alimentar e Finalizar)
  const [isUnifiedModalOpen, setIsUnifiedModalOpen] = useState(false);
  const [activeModalCall, setActiveModalCall] = useState<ServiceCall | null>(null);
  const [unifiedTab, setUnifiedTab] = useState<'dados' | 'interacoes' | 'finalizacao' | 'tudo'>('tudo');

  // Autocomplete de Endereço no Modal (Estilo de Preenchimento da Abertura de O.S.)
  const [callAddressSearchTerm, setCallAddressSearchTerm] = useState('');
  const [isCallAddressDropdownOpen, setIsCallAddressDropdownOpen] = useState(false);
  const callAddressDropdownRef = useRef<HTMLDivElement>(null);

  // Modal de Exclusão Individual e Modal de Limpeza de Abertos
  const [deleteCallTarget, setDeleteCallTarget] = useState<ServiceCall | null>(null);
  const [isClearOpenModalOpen, setIsClearOpenModalOpen] = useState(false);
  const [isClearingOpenCalls, setIsClearingOpenCalls] = useState(false);

  // Lightbox in-app para fotos
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);

  // Modal de Impressão: Folha de Chamados Separados por Rotas (Supervisão / Diretoria)
  const [isRoutePrintModalOpen, setIsRoutePrintModalOpen] = useState(false);
  const [routePrintScope, setRoutePrintScope] = useState<'pending' | 'all' | 'filtered'>('pending');
  const [routePrintSortBy, setRoutePrintSortBy] = useState<'volume_desc' | 'route_asc'>('volume_desc');
  const [routePrintIncludeDetails, setRoutePrintIncludeDetails] = useState(true);

  // Formulário do Modal Unificado
  const [formData, setFormData] = useState({
    clientId: '',
    addressId: '',
    description: '',
    priority: ServiceCallPriority.MEDIUM,
    status: ServiceCallStatus.OPEN,
    isWorkshop: false, // Chamado de máquina na Oficina da Empresa
    resolutionNotes: '',
    attachmentUrl1: '',
    attachmentUrl2: '',
    attachmentUrl3: '',
    attachmentUrl4: '',
    linkUrl: '',
    forecastDate: '',
    initialObservation: '' // Observação inicial para novos chamados
  });

  const [newCommentText, setNewCommentText] = useState('');
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);
  const fileInputRef3 = useRef<HTMLInputElement>(null);
  const fileInputRef4 = useRef<HTMLInputElement>(null);
  const [isUploadingSlot1, setIsUploadingSlot1] = useState(false);
  const [isUploadingSlot2, setIsUploadingSlot2] = useState(false);
  const [isUploadingSlot3, setIsUploadingSlot3] = useState(false);
  const [isUploadingSlot4, setIsUploadingSlot4] = useState(false);

  // Filtro de endereços para o autocomplete de preenchimento
  const filteredCallAddresses = useMemo(() => {
    if (!formData.clientId) return [];
    const clientAddrs = addresses.filter(a => a.clientId === formData.clientId);
    if (!callAddressSearchTerm.trim()) return clientAddrs;
    const terms = callAddressSearchTerm.toLowerCase().trim().split(/\s+/);
    return clientAddrs.filter(addr => {
      const full = `${addr.street || ''} ${addr.name || ''} ${addr.neighborhood || ''} ${addr.city || ''} ${addr.route || ''} ${addr.number || ''}`.toLowerCase();
      return terms.every(t => full.includes(t));
    });
  }, [addresses, formData.clientId, callAddressSearchTerm]);

  // Fecha dropdown do endereço ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (callAddressDropdownRef.current && !callAddressDropdownRef.current.contains(event.target as Node)) {
        setIsCallAddressDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableRoutes = useMemo(() => {
    const map = new Map<string, string>();
    addresses.forEach(addr => {
      const canonical = addr.route ? getCanonicalRouteName(addr.route, routeConfigs) : 'Sem Rota';
      const key = normalizeRouteKey(canonical);
      if (!map.has(key)) {
        map.set(key, canonical);
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a === 'Sem Rota') return 1;
      if (b === 'Sem Rota') return -1;
      return a.localeCompare(b, 'pt-BR');
    });
  }, [addresses, routeConfigs]);

  // Estatísticas rápidas com suporte a Alta Prioridade e Oficina
  const stats = useMemo(() => {
    const total = calls.length;
    const open = calls.filter(c => c.status === ServiceCallStatus.OPEN).length;
    const inProgress = calls.filter(c => c.status === ServiceCallStatus.IN_PROGRESS).length;
    const resolved = calls.filter(c => c.status === ServiceCallStatus.RESOLVED).length;
    const cancelled = calls.filter(c => c.status === ServiceCallStatus.CANCELLED).length;
    const highPriority = calls.filter(c => (c.status === ServiceCallStatus.OPEN || c.status === ServiceCallStatus.IN_PROGRESS) && c.priority === ServiceCallPriority.HIGH).length;
    const workshopOpen = calls.filter(c => (c.status === ServiceCallStatus.OPEN || c.status === ServiceCallStatus.IN_PROGRESS) && Boolean(c.isWorkshop)).length;
    return { total, open, inProgress, resolved, cancelled, highPriority, workshopOpen };
  }, [calls]);

  // Apenas o perfil GESTOR (MANAGER) deve ter seus dados restritos por clientId.
  // Técnicos, Administradores, Assistentes e Suporte visualizam todos os chamados.
  const effectiveClientId = userRole === UserRole.MANAGER ? managerClientId : undefined;

  const loadData = async () => {
    setLoading(true);
    try {
      const [callsData, clientsData, addressesData, routeConfigsData] = await Promise.all([
        dataService.getServiceCalls(effectiveClientId).catch(e => {
          console.error('Error loading service calls:', e);
          return [];
        }),
        dataService.getClients(effectiveClientId).catch(e => {
          console.error('Error loading clients:', e);
          return [];
        }),
        dataService.getAddresses(effectiveClientId).catch(e => {
          console.error('Error loading addresses:', e);
          return [];
        }),
        dataService.getRouteConfigs().catch(e => {
          console.error('Error loading route configs:', e);
          return [];
        })
      ]);
      
      setCalls(callsData.filter((c: ServiceCall) => !effectiveClientId || c.clientId === effectiveClientId) as ServiceCall[]);
      setClients(clientsData.filter((c: Client) => !effectiveClientId || c.id === effectiveClientId) as Client[]);
      setAddresses(addressesData.filter((a: Address) => !effectiveClientId || a.clientId === effectiveClientId) as Address[]);
      setRouteConfigs(routeConfigsData as RouteConfiguration[]);
    } catch (e) {
      console.error('General error loading data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Sincronização em tempo real dos chamados com o sistema administrativo
    const unsubscribe = dataService.subscribeServiceCalls((liveCalls) => {
      setCalls(liveCalls.filter((c: ServiceCall) => !effectiveClientId || c.clientId === effectiveClientId));
    }, effectiveClientId);

    return () => unsubscribe();
  }, [effectiveClientId]);

  // Monitora seleção vinda de notificações do sistema
  useEffect(() => {
    if (initialSelectedCallId && calls.length > 0) {
      const matchedCall = calls.find(c => c.id === initialSelectedCallId);
      if (matchedCall) {
        openUnifiedModal(matchedCall);
        if (onClearInitialCallId) {
          onClearInitialCallId();
        }
      }
    }
  }, [initialSelectedCallId, calls, onClearInitialCallId]);

  // Rolagem suave para o último comentário quando os comentários mudam
  useEffect(() => {
    if (activeModalCall?.comments && commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeModalCall?.comments]);

  // Abre o Modal Unificado (Criar ou Editar/Alimentar/Finalizar)
  const openUnifiedModal = (call?: ServiceCall, initialTab: 'dados' | 'interacoes' | 'finalizacao' | 'tudo' = 'tudo') => {
    setMessage(null);
    setNewCommentText('');
    setUnifiedTab(initialTab);
    setIsCallAddressDropdownOpen(false);

    if (call) {
      setActiveModalCall(call);
      const addr = addresses.find(a => a.id === call.addressId);
      setCallAddressSearchTerm(addr ? `${addr.street}${addr.neighborhood ? ` - ${addr.neighborhood}` : ''}` : (call.addressLabel || ''));
      setFormData({
        clientId: call.clientId || '',
        addressId: call.addressId || '',
        description: call.description || '',
        priority: call.priority || ServiceCallPriority.MEDIUM,
        status: call.status || ServiceCallStatus.OPEN,
        isWorkshop: Boolean(call.isWorkshop),
        resolutionNotes: (call.resolutionNotes || '').toUpperCase(),
        attachmentUrl1: call.attachmentUrl1 || (call.attachmentUrl?.startsWith('data:image') ? call.attachmentUrl : '') || '',
        attachmentUrl2: call.attachmentUrl2 || '',
        attachmentUrl3: call.attachmentUrl3 || '',
        attachmentUrl4: call.attachmentUrl4 || '',
        linkUrl: call.linkUrl || (!call.attachmentUrl?.startsWith('data:image') ? call.attachmentUrl : '') || '',
        forecastDate: call.forecastDate || '',
        initialObservation: ''
      });
    } else {
      setActiveModalCall(null);
      setCallAddressSearchTerm('');
      setFormData({
        clientId: managerClientId || '',
        addressId: '',
        description: '',
        priority: ServiceCallPriority.MEDIUM,
        status: ServiceCallStatus.OPEN,
        isWorkshop: false,
        resolutionNotes: '',
        attachmentUrl1: '',
        attachmentUrl2: '',
        attachmentUrl3: '',
        attachmentUrl4: '',
        linkUrl: '',
        forecastDate: '',
        initialObservation: ''
      });
    }
    setIsUnifiedModalOpen(true);
  };

  // Upload e compressão de fotos do chamado (suporta até 4 fotos)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, slot: 1 | 2 | 3 | 4) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (slot === 1) setIsUploadingSlot1(true);
    else if (slot === 2) setIsUploadingSlot2(true);
    else if (slot === 3) setIsUploadingSlot3(true);
    else if (slot === 4) setIsUploadingSlot4(true);

    try {
      const compressed = await compressImageToBase64(file, 1280, 0.7);
      if (slot === 1) setFormData(prev => ({ ...prev, attachmentUrl1: compressed }));
      else if (slot === 2) setFormData(prev => ({ ...prev, attachmentUrl2: compressed }));
      else if (slot === 3) setFormData(prev => ({ ...prev, attachmentUrl3: compressed }));
      else if (slot === 4) setFormData(prev => ({ ...prev, attachmentUrl4: compressed }));
    } catch (err) {
      console.error('Erro ao comprimir imagem:', err);
      alert('Falha ao processar imagem. Tente uma foto com tamanho menor.');
    } finally {
      if (slot === 1) {
        setIsUploadingSlot1(false);
        if (fileInputRef1.current) fileInputRef1.current.value = '';
      } else if (slot === 2) {
        setIsUploadingSlot2(false);
        if (fileInputRef2.current) fileInputRef2.current.value = '';
      } else if (slot === 3) {
        setIsUploadingSlot3(false);
        if (fileInputRef3.current) fileInputRef3.current.value = '';
      } else if (slot === 4) {
        setIsUploadingSlot4(false);
        if (fileInputRef4.current) fileInputRef4.current.value = '';
      }
    }
  };

  // Salvar alterações de Dados do Chamado (Criar ou Atualizar)
  const handleSaveCallData = async () => {
    if (!formData.clientId || !formData.addressId || !formData.description.trim()) {
      setMessage({ text: 'Por favor, selecione o cliente, endereço e informe a descrição do chamado.', type: 'error' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      if (!activeModalCall) {
        // Criar Novo Chamado
        const existingOpenCalls = calls.filter(c => {
          if (!c || !c.addressId || !formData.addressId) return false;
          if (String(c.addressId).trim() !== String(formData.addressId).trim()) return false;
          const statusStr = String(c.status || '').toLowerCase();
          const isResolved = statusStr === 'resolved' || statusStr === 'cancelled' || statusStr === 'resolvido' || statusStr === 'cancelado' || statusStr === ServiceCallStatus.RESOLVED || statusStr === ServiceCallStatus.CANCELLED;
          return !isResolved;
        });

        if (existingOpenCalls.length > 0) {
          const callIdLabel = existingOpenCalls[0].id ? `#${String(existingOpenCalls[0].id).slice(-6).toUpperCase()}` : '';
          setMessage({ 
            text: `BLOQUEIO: Este endereço já possui um chamado em aberto no sistema ${callIdLabel ? `(Chamado ${callIdLabel})` : ''}. É necessário concluir o chamado existente antes de abrir um novo para este endereço.`, 
            type: 'error' 
          });
          setSaving(false);
          return;
        }

        const client = clients.find(cl => cl.id === formData.clientId);
        const address = addresses.find(ad => ad.id === formData.addressId);

        // Se o usuário adicionou uma observação inicial, já registra como primeiro comentário
        const initialComments: ServiceCallComment[] = [];
        if (formData.initialObservation.trim() && userProfile) {
          initialComments.push({
            id: `comm_${Date.now()}`,
            authorId: userProfile.uid,
            authorName: userProfile.name || userProfile.email.split('@')[0],
            authorRole: userProfile.role,
            content: formData.initialObservation.trim(),
            createdAt: new Date()
          });
        }

        const newCallData = {
          clientId: formData.clientId,
          addressId: formData.addressId,
          description: formData.description.trim(),
          status: formData.status || ServiceCallStatus.OPEN,
          priority: formData.priority,
          isWorkshop: Boolean(formData.isWorkshop),
          clientName: client?.name,
          addressLabel: address?.street,
          createdAt: new Date(),
          attachmentUrl: formData.attachmentUrl1 || formData.attachmentUrl2 || formData.attachmentUrl3 || formData.attachmentUrl4 || formData.linkUrl || '',
          attachmentUrl1: formData.attachmentUrl1 || '',
          attachmentUrl2: formData.attachmentUrl2 || '',
          attachmentUrl3: formData.attachmentUrl3 || '',
          attachmentUrl4: formData.attachmentUrl4 || '',
          linkUrl: formData.linkUrl.trim() || '',
          forecastDate: formData.forecastDate || '',
          comments: initialComments
        };

        const addedRef = await dataService.addServiceCall(newCallData);

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

        await loadData();
        setIsUnifiedModalOpen(false);
      } else {
        // Atualizar Chamado Existente
        const client = clients.find(cl => cl.id === formData.clientId);
        const address = addresses.find(ad => ad.id === formData.addressId);

        const updatePayload: Partial<ServiceCall> = {
          clientId: formData.clientId,
          addressId: formData.addressId,
          clientName: client?.name || activeModalCall.clientName,
          addressLabel: address?.street || activeModalCall.addressLabel,
          description: formData.description.trim(),
          priority: formData.priority,
          status: formData.status,
          isWorkshop: Boolean(formData.isWorkshop),
          attachmentUrl: formData.attachmentUrl1 || formData.attachmentUrl2 || formData.attachmentUrl3 || formData.attachmentUrl4 || formData.linkUrl || '',
          attachmentUrl1: formData.attachmentUrl1 || '',
          attachmentUrl2: formData.attachmentUrl2 || '',
          attachmentUrl3: formData.attachmentUrl3 || '',
          attachmentUrl4: formData.attachmentUrl4 || '',
          linkUrl: formData.linkUrl.trim() || '',
          forecastDate: formData.forecastDate || ''
        };

        await dataService.updateServiceCall(activeModalCall.id, updatePayload);

        setCalls(prev => prev.map(c => c.id === activeModalCall.id ? { ...c, ...updatePayload } : c));
        setActiveModalCall(prev => prev ? { ...prev, ...updatePayload } : null);
        setMessage({ text: 'Alterações do chamado salvas com sucesso!', type: 'success' });
        await loadData();
      }
    } catch (err) {
      console.error('Erro ao salvar dados do chamado:', err);
      setMessage({ text: 'Erro ao salvar alterações. Verifique sua conexão.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Alimentar Chamado: Adicionar novo comentário ou orientação
  const handleAddComment = async () => {
    if (!activeModalCall || !newCommentText.trim() || !userProfile || savingComment) return;

    setSavingComment(true);
    try {
      const comment: ServiceCallComment = {
        id: `comm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        authorId: userProfile.uid,
        authorName: userProfile.name || userProfile.email.split('@')[0],
        authorRole: userProfile.role,
        content: newCommentText.trim(),
        createdAt: new Date()
      };

      const updatedComments = [...(activeModalCall.comments || []), comment];

      await dataService.updateServiceCall(activeModalCall.id, {
        comments: updatedComments
      });

      // Notificação sobre novo comentário nas interações
      const clientName = activeModalCall.clientName || "Cliente";
      const authorName = userProfile.name || userProfile.email.split('@')[0];
      await dataService.sendNotificationToAllAllowed(
        'new_comment',
        'Novo Comentário em Chamado',
        `${authorName} adicionou uma informação no chamado do cliente ${clientName}.`,
        activeModalCall.id,
        userProfile.uid
      );

      // Atualiza estado local
      setCalls(prev => prev.map(c => c.id === activeModalCall.id ? { ...c, comments: updatedComments } : c));
      setActiveModalCall(prev => prev ? { ...prev, comments: updatedComments } : null);
      setNewCommentText('');
    } catch (e) {
      console.error('Erro ao adicionar comentário:', e);
    } finally {
      setSavingComment(false);
    }
  };

  // Finalizar / Concluir Chamado diretamente no Modal Unificado
  const handleFinalizeCall = async () => {
    if (!activeModalCall) return;
    if (!formData.resolutionNotes.trim()) {
      setMessage({ text: 'Por favor, insira o relatório de atendimento ou o que foi executado para finalizar.', type: 'error' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const resolvedDate = new Date();
      const updatedNotes = formData.resolutionNotes.trim().toUpperCase();

      await dataService.updateServiceCall(activeModalCall.id, {
        status: ServiceCallStatus.RESOLVED,
        resolutionNotes: updatedNotes,
        resolvedAt: resolvedDate
      });

      // Envia notificação sobre chamado resolvido
      const clientName = activeModalCall.clientName || 'Cliente';
      const authorName = userProfile?.name || 'Técnico';
      await dataService.sendNotificationToAllAllowed(
        'call_resolved',
        'Chamado Finalizado',
        `${authorName} finalizou o atendimento do chamado do cliente ${clientName}.`,
        activeModalCall.id,
        userProfile?.uid || ''
      );

      setCalls(prev => prev.map(c => c.id === activeModalCall.id ? {
        ...c,
        status: ServiceCallStatus.RESOLVED,
        resolutionNotes: updatedNotes,
        resolvedAt: resolvedDate
      } : c));

      setActiveModalCall(prev => prev ? {
        ...prev,
        status: ServiceCallStatus.RESOLVED,
        resolutionNotes: updatedNotes,
        resolvedAt: resolvedDate
      } : null);

      setFormData(prev => ({ ...prev, status: ServiceCallStatus.RESOLVED }));
      setMessage({ text: 'Chamado finalizado e concluído com sucesso!', type: 'success' });
      await loadData();
    } catch (err) {
      console.error('Erro ao finalizar chamado:', err);
      setMessage({ text: 'Erro ao finalizar o chamado. Tente novamente.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Reabrir chamado previamente resolvido
  const handleReopenCall = async () => {
    if (!activeModalCall) return;
    if (!window.confirm('Deseja realmente reabrir este chamado? O status voltará para Pendente.')) return;

    setSaving(true);
    try {
      await dataService.updateServiceCall(activeModalCall.id, {
        status: ServiceCallStatus.OPEN,
        resolvedAt: null
      });

      setCalls(prev => prev.map(c => c.id === activeModalCall.id ? {
        ...c,
        status: ServiceCallStatus.OPEN,
        resolvedAt: null
      } : c));

      setActiveModalCall(prev => prev ? {
        ...prev,
        status: ServiceCallStatus.OPEN,
        resolvedAt: null
      } : null);

      setFormData(prev => ({ ...prev, status: ServiceCallStatus.OPEN }));
      setMessage({ text: 'Chamado reaberto com sucesso.', type: 'success' });
      await loadData();
    } catch (err) {
      console.error('Erro ao reabrir chamado:', err);
    } finally {
      setSaving(false);
    }
  };

  // Cancelar chamado
  const handleCancelCall = async (callId: string) => {
    if (!window.confirm('Deseja realmente cancelar este chamado?')) return;
    setSaving(true);
    try {
      await dataService.updateServiceCall(callId, {
        status: ServiceCallStatus.CANCELLED,
        resolutionNotes: 'Chamado cancelado.',
        resolvedAt: new Date()
      });
      await loadData();
      setIsUnifiedModalOpen(false);
    } catch (err) {
      console.error('Erro ao cancelar chamado:', err);
    } finally {
      setSaving(false);
    }
  };

  // Excluir chamado individual
  const handleDeleteCall = async () => {
    if (!deleteCallTarget) return;
    setSaving(true);
    try {
      await dataService.deleteServiceCall(deleteCallTarget.id);
      setDeleteCallTarget(null);
      if (activeModalCall?.id === deleteCallTarget.id) {
        setIsUnifiedModalOpen(false);
      }
      await loadData();
    } catch (err) {
      console.error('Erro ao excluir chamado:', err);
    } finally {
      setSaving(false);
    }
  };

  // Zerar todos os chamados em aberto (Mantendo os concluídos)
  const handleClearAllOpenCalls = async () => {
    setIsClearingOpenCalls(true);
    try {
      const res = await dataService.clearOpenServiceCalls();
      setIsClearOpenModalOpen(false);
      await loadData();
      setMessage({
        text: `Limpeza concluída com sucesso! ${res.deleted} chamado(s) em aberto foram excluídos. Todos os chamados concluídos foram mantidos.`,
        type: 'success'
      });
    } catch (err) {
      console.error('Erro ao limpar chamados em aberto:', err);
      setMessage({
        text: 'Ocorreu um erro ao excluir os chamados em aberto.',
        type: 'error'
      });
    } finally {
      setIsClearingOpenCalls(false);
    }
  };

  // Filtragem dos chamados na tabela e nos cards
  const filteredCalls = useMemo(() => {
    return calls.filter(c => {
      const matchesSearch = 
        (c.clientName?.toLowerCase() || '').includes(search.toLowerCase()) ||
        (c.description?.toLowerCase() || '').includes(search.toLowerCase()) ||
        (c.addressLabel?.toLowerCase() || '').includes(search.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || c.priority === priorityFilter;
      const matchesWorkshop = workshopFilter === 'all' || (workshopFilter === 'workshop' && Boolean(c.isWorkshop));
      
      const address = addresses.find(a => a.id === c.addressId);
      const routeName = address?.route 
        ? getCanonicalRouteName(address.route, routeConfigs) 
        : 'Sem Rota';
      const matchesRoute = routeFilter === 'all' || normalizeRouteKey(routeName) === normalizeRouteKey(routeFilter);
      
      return matchesSearch && matchesStatus && matchesPriority && matchesWorkshop && matchesRoute;
    });
  }, [calls, search, statusFilter, priorityFilter, workshopFilter, routeFilter, addresses, routeConfigs]);

  // Agrupamento de chamados por rota para a Folha de Impressão da Supervisão / Diretoria
  const routePrintData = useMemo(() => {
    const sourceCalls = routePrintScope === 'pending'
      ? calls.filter(c => c.status === ServiceCallStatus.OPEN || c.status === ServiceCallStatus.IN_PROGRESS)
      : routePrintScope === 'filtered'
        ? filteredCalls
        : calls;

    const groupsMap = new Map<string, {
      routeKey: string;
      routeName: string;
      calls: Array<ServiceCall & { resolvedAddressLabel: string; resolvedRouteName: string }>;
      openCount: number;
      inProgressCount: number;
      resolvedCount: number;
      cancelledCount: number;
      highPriorityCount: number;
      workshopCount: number;
    }>();

    sourceCalls.forEach(call => {
      const addr = addresses.find(a => a.id === call.addressId);
      const resolvedRouteName = addr?.route ? getCanonicalRouteName(addr.route, routeConfigs) : 'Sem Rota';
      const routeKey = normalizeRouteKey(resolvedRouteName);
      const resolvedAddressLabel = addr
        ? `${addr.street}${addr.number ? `, Nº ${addr.number}` : ''}${addr.neighborhood ? ` - ${addr.neighborhood}` : ''}`
        : (call.addressLabel || 'Endereço não informado');

      if (!groupsMap.has(routeKey)) {
        groupsMap.set(routeKey, {
          routeKey,
          routeName: resolvedRouteName,
          calls: [],
          openCount: 0,
          inProgressCount: 0,
          resolvedCount: 0,
          cancelledCount: 0,
          highPriorityCount: 0,
          workshopCount: 0
        });
      }

      const group = groupsMap.get(routeKey)!;
      group.calls.push({
        ...call,
        resolvedAddressLabel,
        resolvedRouteName
      });

      if (call.status === ServiceCallStatus.OPEN) group.openCount++;
      else if (call.status === ServiceCallStatus.IN_PROGRESS) group.inProgressCount++;
      else if (call.status === ServiceCallStatus.RESOLVED) group.resolvedCount++;
      else if (call.status === ServiceCallStatus.CANCELLED) group.cancelledCount++;

      const isActive = call.status === ServiceCallStatus.OPEN || call.status === ServiceCallStatus.IN_PROGRESS;
      if (isActive && call.priority === ServiceCallPriority.HIGH) group.highPriorityCount++;
      if (isActive && Boolean(call.isWorkshop)) group.workshopCount++;
    });

    // Ordenar chamados dentro de cada rota (Alta prioridade -> Oficina -> Mais antigos primeiro para priorizar fila)
    groupsMap.forEach(group => {
      group.calls.sort((a, b) => {
        const aActive = a.status === ServiceCallStatus.OPEN || a.status === ServiceCallStatus.IN_PROGRESS ? 0 : 1;
        const bActive = b.status === ServiceCallStatus.OPEN || b.status === ServiceCallStatus.IN_PROGRESS ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;

        const aHigh = a.priority === ServiceCallPriority.HIGH ? 0 : a.priority === ServiceCallPriority.MEDIUM ? 1 : 2;
        const bHigh = b.priority === ServiceCallPriority.HIGH ? 0 : b.priority === ServiceCallPriority.MEDIUM ? 1 : 2;
        if (aHigh !== bHigh) return aHigh - bHigh;

        const aSec = a.createdAt?.seconds || 0;
        const bSec = b.createdAt?.seconds || 0;
        return aSec - bSec;
      });
    });

    const groups = Array.from(groupsMap.values()).sort((a, b) => {
      if (routePrintSortBy === 'volume_desc') {
        if (b.calls.length !== a.calls.length) return b.calls.length - a.calls.length;
        if (a.routeName === 'Sem Rota') return 1;
        if (b.routeName === 'Sem Rota') return -1;
        return a.routeName.localeCompare(b.routeName, 'pt-BR', { numeric: true });
      }
      if (a.routeName === 'Sem Rota') return 1;
      if (b.routeName === 'Sem Rota') return -1;
      return a.routeName.localeCompare(b.routeName, 'pt-BR', { numeric: true });
    });

    const totalCalls = sourceCalls.length;
    const totalHighPriority = groups.reduce((acc, g) => acc + g.highPriorityCount, 0);
    const totalWorkshop = groups.reduce((acc, g) => acc + g.workshopCount, 0);
    const totalOpen = groups.reduce((acc, g) => acc + g.openCount, 0);
    const totalInProgress = groups.reduce((acc, g) => acc + g.inProgressCount, 0);

    return {
      groups,
      totalCalls,
      totalRoutes: groups.length,
      totalHighPriority,
      totalWorkshop,
      totalOpen,
      totalInProgress
    };
  }, [calls, filteredCalls, routePrintScope, routePrintSortBy, addresses, routeConfigs]);

  const selectedClientAddresses = useMemo(() => {
    return addresses.filter(a => a.clientId === formData.clientId);
  }, [formData.clientId, addresses]);

  // Componente de Autocomplete no Estilo de Preenchimento da Abertura de O.S.
  const renderCallAddressAutocomplete = () => {
    const clientAddresses = addresses.filter(a => a.clientId === formData.clientId);

    return (
      <div className="relative" ref={callAddressDropdownRef}>
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={callAddressSearchTerm}
            disabled={!formData.clientId}
            placeholder={
              !formData.clientId
                ? "Selecione o cliente primeiro..."
                : formData.addressId
                  ? "Clique para buscar ou alterar endereço..."
                  : "Digite parte do endereço, escola ou bairro..."
            }
            onFocus={() => {
              if (formData.clientId) setIsCallAddressDropdownOpen(true);
            }}
            onClick={() => {
              if (formData.clientId) setIsCallAddressDropdownOpen(true);
            }}
            onChange={(e) => {
              setCallAddressSearchTerm(e.target.value);
              setIsCallAddressDropdownOpen(true);
              if (!e.target.value.trim() && formData.addressId) {
                setFormData(prev => ({ ...prev, addressId: '' }));
              }
            }}
            className={cn(
              "w-full bg-white border rounded-xl pl-9 pr-12 py-2.5 text-xs font-semibold text-slate-700 outline-none transition-all",
              !formData.clientId
                ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
                : formData.addressId
                  ? "border-emerald-300 ring-2 ring-emerald-500/10 bg-emerald-50/20"
                  : "border-slate-200 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            )}
          />
          <div className="absolute right-1.5 flex items-center gap-0.5">
            {formData.addressId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFormData(prev => ({ ...prev, addressId: '' }));
                  setCallAddressSearchTerm('');
                  setIsCallAddressDropdownOpen(true);
                }}
                title="Limpar endereço selecionado"
                className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              disabled={!formData.clientId}
              onClick={() => {
                if (formData.clientId) {
                  setIsCallAddressDropdownOpen(prev => !prev);
                }
              }}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors cursor-pointer"
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isCallAddressDropdownOpen ? "rotate-180" : "")} />
            </button>
          </div>
        </div>

        {/* Dropdown com a lista de endereços filtrados */}
        {isCallAddressDropdownOpen && formData.clientId && (
          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-64 flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              <span>Endereços ({filteredCallAddresses.length} de {clientAddresses.length})</span>
              {callAddressSearchTerm && (
                <span className="text-blue-600 font-normal normal-case truncate max-w-[140px]">
                  Busca: "{callAddressSearchTerm}"
                </span>
              )}
            </div>
            
            <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
              {formData.addressId && (
                <button
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, addressId: '' }));
                    setCallAddressSearchTerm('');
                    setIsCallAddressDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-1.5 font-bold transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" /> Limpar seleção de endereço
                </button>
              )}

              {filteredCallAddresses.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 font-medium">
                  Nenhum endereço encontrado para "{callAddressSearchTerm}"
                </div>
              ) : (
                filteredCallAddresses.map(addr => {
                  const isSelected = formData.addressId === addr.id;
                  const hasOpen = calls.some(c => 
                    c.addressId === addr.id && 
                    c.id !== activeModalCall?.id && 
                    (c.status === ServiceCallStatus.OPEN || c.status === ServiceCallStatus.IN_PROGRESS)
                  );
                  return (
                    <button
                      key={addr.id}
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, addressId: addr.id }));
                        setCallAddressSearchTerm(addr.street + (addr.neighborhood ? ` - ${addr.neighborhood}` : ''));
                        setIsCallAddressDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 transition-colors flex items-start justify-between gap-2 cursor-pointer",
                        isSelected ? "bg-emerald-50/80 text-emerald-950 font-bold" : "hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 truncate">{addr.street}</span>
                          {addr.number && <span className="text-[11px] text-slate-500 font-medium">Nº {addr.number}</span>}
                          {hasOpen && (
                            <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                              ⚠️ Chamado em Aberto
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium flex items-center gap-2 mt-0.5">
                          {addr.neighborhood && <span>Bairro: {addr.neighborhood}</span>}
                          {addr.route && <span className="text-blue-600 font-bold">Rota: {addr.route}</span>}
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
    <div className={cn("space-y-6 animate-in fade-in duration-300", isRoutePrintModalOpen && "no-print print:hidden")}>
      {/* Header Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Central de Chamados</h2>
              <p className="text-gray-500 text-xs font-medium">Abra, gerencie, alimente e conclua chamados e atendimentos avulsos em um só lugar.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {userRole !== UserRole.TECHNICIAN && (!managerClientId || userRole === UserRole.MANAGER || userRole === UserRole.ADMIN) && (
            <button 
              onClick={() => openUnifiedModal()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase tracking-wider py-3 px-5 rounded-2xl transition-all shadow-lg shadow-blue-200/60 hover:shadow-xl flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              Novo Chamado
            </button>
          )}

          {/* Botão Seguro para Zerar Chamados em Aberto (Pedido do Usuário) */}
          {(userRole === UserRole.ADMIN || userRole === UserRole.ASSISTANT) && (
            <button
              onClick={() => setIsClearOpenModalOpen(true)}
              className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-xs uppercase tracking-wider py-3 px-4 rounded-2xl transition-all flex items-center gap-2 cursor-pointer shadow-xs"
              title="Excluir chamados em aberto e manter apenas os concluídos"
            >
              <RotateCcw className="w-4 h-4 text-amber-700" />
              <span className="hidden sm:inline">Zerar Abertos ({stats.open + stats.inProgress})</span>
              <span className="sm:hidden">Zerar</span>
            </button>
          )}

          <button 
            type="button"
            onClick={() => { 
              window.focus(); 
              setTimeout(() => window.print(), 200); 
            }}
            className="bg-white border border-gray-200 text-gray-700 font-bold text-xs uppercase tracking-wider py-3 px-4 rounded-2xl transition-all shadow-xs hover:bg-gray-50 flex items-center gap-2 print:hidden cursor-pointer"
          >
            <Printer className="w-4 h-4 text-gray-500" />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
        </div>
      </div>

      {/* Toast de Notificação na Tela Principal */}
      {!isUnifiedModalOpen && message && (
        <div className={cn(
          "p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in slide-in-from-top-2 shadow-xs",
          message.type === 'success' ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
        )}>
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{message.text}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setMessage(null)} 
            className="p-1 hover:bg-black/5 rounded-lg text-gray-500 hover:text-gray-800 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Cards de Estatísticas com Destaque para Alta Prioridade e Oficina */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div 
          onClick={() => {
            setStatusFilter('all');
            setPriorityFilter('all');
            setWorkshopFilter('all');
          }}
          className={cn(
            "p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between shadow-2xs hover:shadow-xs",
            statusFilter === 'all' && priorityFilter === 'all' && workshopFilter === 'all'
              ? "bg-blue-50/80 border-blue-300 ring-2 ring-blue-500/20" 
              : "bg-white border-gray-200/80 hover:bg-gray-50/60"
          )}
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-0.5">Total</span>
            <span className="text-2xl font-black text-gray-900 leading-tight">{stats.total}</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <LayoutGrid className="w-4 h-4" />
          </div>
        </div>

        <div 
          onClick={() => {
            setStatusFilter(ServiceCallStatus.OPEN);
            setPriorityFilter('all');
            setWorkshopFilter('all');
          }}
          className={cn(
            "p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between shadow-2xs hover:shadow-xs",
            statusFilter === ServiceCallStatus.OPEN && priorityFilter === 'all' && workshopFilter === 'all'
              ? "bg-red-50/80 border-red-300 ring-2 ring-red-500/20" 
              : "bg-white border-gray-200/80 hover:bg-gray-50/60"
          )}
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-red-500 block mb-0.5">Abertos</span>
            <span className="text-2xl font-black text-red-600 leading-tight">{stats.open}</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        {/* Card Destaque Alta Prioridade */}
        <div 
          onClick={() => {
            setPriorityFilter(priorityFilter === ServiceCallPriority.HIGH ? 'all' : ServiceCallPriority.HIGH);
            setWorkshopFilter('all');
            setStatusFilter('all');
          }}
          className={cn(
            "p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between shadow-2xs hover:shadow-xs",
            priorityFilter === ServiceCallPriority.HIGH
              ? "bg-red-600 border-red-700 text-white ring-2 ring-red-500/40 shadow-md" 
              : stats.highPriority > 0
                ? "bg-red-50/90 border-red-200 hover:bg-red-100/80"
                : "bg-white border-gray-200/80 hover:bg-gray-50/60"
          )}
        >
          <div>
            <span className={cn(
              "text-[10px] font-black uppercase tracking-widest block mb-0.5 flex items-center gap-1",
              priorityFilter === ServiceCallPriority.HIGH ? "text-red-100" : "text-red-600"
            )}>
              <Flame className="w-3 h-3" /> Alta Prioridade
            </span>
            <span className={cn(
              "text-2xl font-black leading-tight",
              priorityFilter === ServiceCallPriority.HIGH ? "text-white" : "text-red-700"
            )}>
              {stats.highPriority}
            </span>
          </div>
          <div className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center font-bold",
            priorityFilter === ServiceCallPriority.HIGH ? "bg-white/20 text-white" : "bg-red-100 text-red-600"
          )}>
            <Flame className="w-4 h-4" />
          </div>
        </div>

        {/* Card Destaque Oficina */}
        <div 
          onClick={() => {
            setWorkshopFilter(workshopFilter === 'workshop' ? 'all' : 'workshop');
            setPriorityFilter('all');
            setStatusFilter('all');
          }}
          className={cn(
            "p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between shadow-2xs hover:shadow-xs",
            workshopFilter === 'workshop'
              ? "bg-purple-600 border-purple-700 text-white ring-2 ring-purple-500/40 shadow-md" 
              : stats.workshopOpen > 0
                ? "bg-purple-50/90 border-purple-200 hover:bg-purple-100/80"
                : "bg-white border-gray-200/80 hover:bg-gray-50/60"
          )}
        >
          <div>
            <span className={cn(
              "text-[10px] font-black uppercase tracking-widest block mb-0.5 flex items-center gap-1",
              workshopFilter === 'workshop' ? "text-purple-100" : "text-purple-700"
            )}>
              <Wrench className="w-3 h-3" /> Oficina (Abertos)
            </span>
            <span className={cn(
              "text-2xl font-black leading-tight",
              workshopFilter === 'workshop' ? "text-white" : "text-purple-800"
            )}>
              {stats.workshopOpen}
            </span>
          </div>
          <div className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center font-bold",
            workshopFilter === 'workshop' ? "bg-white/20 text-white" : "bg-purple-100 text-purple-700"
          )}>
            <Wrench className="w-4 h-4" />
          </div>
        </div>

        <div 
          onClick={() => {
            setStatusFilter(ServiceCallStatus.RESOLVED);
            setPriorityFilter('all');
            setWorkshopFilter('all');
          }}
          className={cn(
            "p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between shadow-2xs hover:shadow-xs",
            statusFilter === ServiceCallStatus.RESOLVED && priorityFilter === 'all' && workshopFilter === 'all'
              ? "bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-500/20" 
              : "bg-white border-gray-200/80 hover:bg-gray-50/60"
          )}
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 block mb-0.5">Concluídos</span>
            <span className="text-2xl font-black text-emerald-700 leading-tight">{stats.resolved}</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca Reorganizada e Harmonizada */}
      <div className="bg-white p-3.5 rounded-2xl border border-gray-200/90 shadow-2xs space-y-3">
        {/* Linha Superior: Busca + Dropdowns de Filtro + Botão de Oficina */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Campo de Busca */}
          <div className="flex-1 min-w-[220px] relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input 
              type="text" 
              placeholder="Buscar por cliente, endereço ou problema..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-gray-50/80 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-gray-800 h-9"
            />
            {search && (
              <button 
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          
          {/* Filtro por Rota */}
          <div className="w-full sm:w-44 shrink-0 relative">
            <MapPin className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              className="w-full pl-8 pr-7 py-2 h-9 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none bg-gray-50/80 font-bold text-gray-700 text-xs uppercase tracking-wider cursor-pointer"
            >
              <option value="all">Todas as Rotas</option>
              {availableRoutes.map(routeName => (
                <option key={routeName} value={routeName}>
                  {routeName}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Filtro por Prioridade */}
          <div className="w-full sm:w-40 shrink-0 relative">
            <Flame className="w-3.5 h-3.5 text-red-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className={cn(
                "w-full pl-8 pr-7 py-2 h-9 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none font-bold text-xs uppercase tracking-wider cursor-pointer transition-all",
                priorityFilter === ServiceCallPriority.HIGH 
                  ? "bg-red-50 text-red-700 border-red-300" 
                  : priorityFilter === ServiceCallPriority.MEDIUM
                    ? "bg-amber-50 text-amber-700 border-amber-300"
                    : priorityFilter === ServiceCallPriority.LOW
                      ? "bg-blue-50 text-blue-700 border-blue-300"
                      : "bg-gray-50/80 border-gray-200 text-gray-700"
              )}
            >
              <option value="all">Todas Prioridades</option>
              <option value={ServiceCallPriority.HIGH}>🚨 Alta Prioridade</option>
              <option value={ServiceCallPriority.MEDIUM}>Média Prioridade</option>
              <option value={ServiceCallPriority.LOW}>Baixa Prioridade</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Toggle Filtro Oficina - Tamanho ajustado e alinhado com a altura h-9 */}
          <button
            type="button"
            onClick={() => setWorkshopFilter(prev => prev === 'workshop' ? 'all' : 'workshop')}
            className={cn(
              "px-3 h-9 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0",
              workshopFilter === 'workshop'
                ? "bg-purple-600 text-white border-purple-600 shadow-2xs"
                : "bg-purple-50/80 text-purple-700 border-purple-200 hover:bg-purple-100"
            )}
            title="Filtrar chamados referentes a máquinas na Oficina"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Oficina</span>
            {stats.workshopOpen > 0 && (
              <span className={cn(
                "px-1.5 py-0.2 rounded-full text-[10px] font-black leading-none",
                workshopFilter === 'workshop' ? "bg-purple-800 text-white" : "bg-purple-200 text-purple-800"
              )}>
                {stats.workshopOpen}
              </span>
            )}
          </button>
        </div>

        {/* Linha Inferior: Status Pills + Toggle de Visualização (Cards / Tabela) */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-gray-100">
          {/* Status Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'Todos' },
              { id: ServiceCallStatus.OPEN, label: 'Abertos' },
              { id: ServiceCallStatus.IN_PROGRESS, label: 'Em Andamento' },
              { id: ServiceCallStatus.RESOLVED, label: 'Resolvidos' },
              { id: ServiceCallStatus.CANCELLED, label: 'Cancelados' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                  statusFilter === tab.id 
                    ? "bg-blue-600 text-white border-blue-600 shadow-2xs" 
                    : "bg-gray-50/60 text-gray-600 border-gray-200 hover:bg-gray-100"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Ação Impressão por Rotas + Toggle Grid/Table */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsRoutePrintModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs h-[34px]"
              title="Abrir folha de impressão com todos os chamados separados por rotas (para supervisão e diretoria)"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <Printer className="w-3.5 h-3.5 text-white/90" />
              <span className="hidden sm:inline">Folha por Rotas</span>
            </button>

            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer",
                  viewMode === 'cards' ? "bg-white text-blue-600 shadow-2xs" : "text-gray-500 hover:text-gray-700"
                )}
                title="Visualização em Cards"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px] font-bold uppercase tracking-wider">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer",
                  viewMode === 'table' ? "bg-white text-blue-600 shadow-2xs" : "text-gray-500 hover:text-gray-700"
                )}
                title="Visualização em Tabela"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px] font-bold uppercase tracking-wider">Tabela</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo Principal (Lista de Chamados) */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-200">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
          <p className="text-gray-500 font-bold text-sm">Carregando chamados...</p>
        </div>
      ) : filteredCalls.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-200 text-center p-6">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-gray-900">Nenhum chamado pendente encontrado!</h3>
          <p className="text-gray-500 text-xs font-medium max-w-sm mt-1 mb-6">
            Não há registros correspondentes aos filtros selecionados. Clique no botão abaixo para abrir uma nova solicitação técnica.
          </p>
          <button
            onClick={() => openUnifiedModal()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-blue-200 flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Novo Chamado
          </button>
        </div>
      ) : viewMode === 'cards' ? (
        /* Visualização em Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCalls.map(call => {
            const address = addresses.find(a => a.id === call.addressId);
            const routeName = address 
              ? (routeConfigs.find(rc => rc.id === address.route || rc.routeName === address.route)?.routeName || address.route || 'Sem Rota') 
              : 'Sem Rota';

            return (
              <div 
                key={call.id} 
                onClick={() => openUnifiedModal(call)}
                className={cn(
                  "bg-white rounded-3xl border shadow-2xs hover:shadow-md transition-all group overflow-hidden flex flex-col cursor-pointer",
                  call.priority === 'high' && call.status !== 'resolved'
                    ? "border-red-300 ring-2 ring-red-500/10 border-l-4 border-l-red-600"
                    : call.isWorkshop
                      ? "border-purple-300 border-l-4 border-l-purple-600"
                      : "border-gray-200/80 hover:border-blue-300"
                )}
              >
                {/* Header do Card */}
                <div className={cn(
                  "p-5 border-b flex items-start justify-between gap-3",
                  call.status === 'resolved' ? "bg-emerald-50/40 border-emerald-100" :
                  call.priority === 'high' ? "bg-red-50/60 border-red-200/70" :
                  call.isWorkshop ? "bg-purple-50/50 border-purple-100" :
                  "bg-gray-50/50 border-gray-100"
                )}>
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                        call.status === 'resolved' ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                        call.status === 'in_progress' ? "bg-blue-100 text-blue-700 border-blue-200" :
                        call.status === 'cancelled' ? "bg-gray-100 text-gray-500 border-gray-200" :
                        "bg-red-100 text-red-700 border-red-200"
                      )}>
                        {call.status === 'resolved' ? 'Resolvido' : call.status === 'in_progress' ? 'Em Andamento' : call.status === 'cancelled' ? 'Cancelado' : 'Pendente'}
                      </span>

                      {/* Badge de Prioridade com Destaque Forte para Alta Prioridade e Leve para Média */}
                      <span className={cn(
                        "text-[9px] uppercase px-2.5 py-0.5 rounded-full border flex items-center gap-1 font-black",
                        call.priority === 'high'
                          ? "bg-red-600 text-white border-red-700 shadow-xs animate-pulse-subtle"
                          : call.priority === 'medium'
                            ? "bg-amber-50/90 text-amber-800/80 border-amber-200/60 font-semibold"
                            : "bg-slate-100 text-slate-600 border-slate-200 font-medium"
                      )}>
                        {call.priority === 'high' && <Flame className="w-2.5 h-2.5 text-white" />}
                        {call.priority === 'high' ? 'Alta Prioridade' : call.priority === 'medium' ? 'Média' : 'Baixa'}
                      </span>

                      {/* Badge de Oficina */}
                      {call.isWorkshop && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-300 flex items-center gap-1 shadow-2xs">
                          <Wrench className="w-2.5 h-2.5 text-purple-700" />
                          Oficina
                        </span>
                      )}

                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5 text-slate-400" />
                        {routeName}
                      </span>
                    </div>
                    <h4 className="font-extrabold text-gray-900 text-sm truncate">{call.clientName}</h4>
                  </div>

                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => openUnifiedModal(call)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                      title="Editar / Interagir"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    {(userRole === UserRole.ADMIN || userRole === UserRole.ASSISTANT) && (
                      <button 
                        onClick={() => setDeleteCallTarget(call)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Corpo do Card */}
                <div className="p-5 space-y-3.5 flex-1">
                  <div className="flex items-start gap-2 text-xs text-gray-600 font-medium">
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                    <span className="line-clamp-2 leading-relaxed">{call.addressLabel}</span>
                  </div>

                  {call.forecastDate && call.status !== 'resolved' && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50/80 rounded-xl border border-amber-200/70 text-xs">
                      <Clock3 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black uppercase tracking-wider text-amber-800">Previsão:</span>
                        <span className="font-bold text-amber-900">
                          {format(new Date(call.forecastDate + 'T12:00:00'), "dd/MM/yyyy")}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="bg-gray-50/80 rounded-2xl p-3.5 border border-gray-100 space-y-2">
                    <p className="text-xs text-gray-700 font-medium line-clamp-3 leading-relaxed">
                      {call.description}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold border-t border-gray-200/50 pt-2">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {call.createdAt?.seconds ? format(new Date(call.createdAt.seconds * 1000), "dd/MM/yyyy", { locale: ptBR }) : 'Hoje'}
                      </span>
                      {call.status !== 'resolved' && call.createdAt?.seconds && (
                        <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-black">
                          {differenceInDays(new Date(), new Date(call.createdAt.seconds * 1000))}d em aberto
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Resolução se concluído */}
                  {call.status === 'resolved' && call.resolutionNotes && (
                    <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-100 text-xs">
                      <div className="flex items-center gap-1.5 text-emerald-800 font-black text-[9px] uppercase tracking-wider mb-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Solução Aplicada
                      </div>
                      <p className="text-emerald-900 text-xs font-semibold italic line-clamp-2 uppercase">
                        "{call.resolutionNotes.toUpperCase()}"
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer do Card */}
                <div className="px-5 py-3.5 bg-gray-50/60 border-t border-gray-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-blue-600 flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-lg">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {call.comments?.length || 0} interações
                    </span>
                    {(call.attachmentUrl1 || call.attachmentUrl2 || call.attachmentUrl3 || call.attachmentUrl4 || call.linkUrl) && (
                      <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-lg">
                        <Paperclip className="w-3 h-3" /> Anexos
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 group-hover:translate-x-0.5 transition-transform">
                    Gerenciar Chamado &rarr;
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Visualização em Tabela */
        <div className="bg-white rounded-3xl border border-gray-200/80 shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[850px]">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                <th className="px-6 py-4">Status / Prioridade</th>
                <th className="px-6 py-4">Cliente / Endereço</th>
                <th className="px-6 py-4">Data / Previsão</th>
                <th className="px-6 py-4">Descrição do Problema</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {filteredCalls.map(call => {
                const address = addresses.find(a => a.id === call.addressId);
                const routeName = address 
                  ? (routeConfigs.find(rc => rc.id === address.route || rc.routeName === address.route)?.routeName || address.route || 'Sem Rota') 
                  : 'Sem Rota';
                
                return (
                  <tr 
                    key={call.id} 
                    onClick={() => openUnifiedModal(call)}
                    className={cn(
                      "hover:bg-blue-50/30 transition-colors cursor-pointer group",
                      call.priority === 'high' && call.status !== 'resolved' ? "bg-red-50/20" : ""
                    )}
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5 items-start">
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                          call.status === 'resolved' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          call.status === 'in_progress' ? "bg-blue-50 text-blue-700 border-blue-200" :
                          call.status === 'cancelled' ? "bg-gray-100 text-gray-500 border-gray-200" :
                          "bg-red-50 text-red-600 border-red-200"
                        )}>
                          {call.status === 'resolved' ? 'Resolvido' : call.status === 'in_progress' ? 'Em Andamento' : call.status === 'cancelled' ? 'Cancelado' : 'Pendente'}
                        </span>
                        
                        <span className={cn(
                          "text-[9px] uppercase px-2 py-0.5 rounded border flex items-center gap-1 font-black",
                          call.priority === 'high'
                            ? "bg-red-600 text-white border-red-700 shadow-2xs"
                            : call.priority === 'medium'
                              ? "bg-amber-50/90 text-amber-800/80 border-amber-200/60 font-semibold"
                              : "bg-slate-100 text-slate-600 border-slate-200 font-medium"
                        )}>
                          {call.priority === 'high' && <Flame className="w-2.5 h-2.5 text-white" />}
                          {call.priority === 'high' ? 'Alta' : call.priority === 'medium' ? 'Média' : 'Baixa'}
                        </span>

                        {call.isWorkshop && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-300 flex items-center gap-1">
                            <Wrench className="w-2.5 h-2.5 text-purple-700" />
                            Oficina
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-extrabold text-gray-900 line-clamp-1">{call.clientName}</span>
                        <span className="text-gray-500 line-clamp-1 flex items-center gap-1 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          {call.addressLabel}
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full w-fit mt-0.5 flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5 text-slate-400" />
                          {routeName}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 text-gray-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-gray-400" />
                          <span>{call.createdAt?.seconds ? format(new Date(call.createdAt.seconds * 1000), "dd/MM/yy", { locale: ptBR }) : '-'}</span>
                        </div>
                        {call.forecastDate && call.status !== 'resolved' && (
                          <div className="flex items-center gap-1 text-amber-600 font-semibold">
                            <Clock3 className="w-3 h-3" />
                            Prev: {format(new Date(call.forecastDate + 'T12:00:00'), "dd/MM/yy")}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="max-w-xs xl:max-w-md">
                        <p className="text-gray-700 font-medium line-clamp-2 leading-relaxed">{call.description}</p>
                        <div className="flex flex-wrap gap-2 mt-1.5" onClick={(e) => e.stopPropagation()}>
                          {call.attachmentUrl1 && (
                            <button 
                              onClick={() => setExpandedImageUrl(call.attachmentUrl1!)}
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-bold"
                            >
                              <Paperclip className="w-3 h-3" /> Foto 1
                            </button>
                          )}
                          {call.attachmentUrl2 && (
                            <button 
                              onClick={() => setExpandedImageUrl(call.attachmentUrl2!)}
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-bold"
                            >
                              <Paperclip className="w-3 h-3" /> Foto 2
                            </button>
                          )}
                          {call.attachmentUrl3 && (
                            <button 
                              onClick={() => setExpandedImageUrl(call.attachmentUrl3!)}
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-bold"
                            >
                              <Paperclip className="w-3 h-3" /> Foto 3
                            </button>
                          )}
                          {call.attachmentUrl4 && (
                            <button 
                              onClick={() => setExpandedImageUrl(call.attachmentUrl4!)}
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-bold"
                            >
                              <Paperclip className="w-3 h-3" /> Foto 4
                            </button>
                          )}
                          {call.linkUrl && (
                            <a 
                              href={call.linkUrl.startsWith('http') ? call.linkUrl : `https://${call.linkUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-cyan-600 hover:underline flex items-center gap-1 font-bold"
                            >
                              <ExternalLink className="w-3 h-3" /> Link
                            </a>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => openUnifiedModal(call)} 
                          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-xs hover:shadow-md flex items-center gap-1.5 font-bold text-xs cursor-pointer"
                          title="Gerenciar Chamado (Abrir, Editar, Alimentar e Finalizar no mesmo diálogo)"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Gerenciar</span>
                          {(call.comments?.length || 0) > 0 && (
                            <span className="bg-blue-800 text-cyan-200 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                              {call.comments?.length}
                            </span>
                          )}
                        </button>
                        {(userRole === UserRole.ADMIN || userRole === UserRole.ASSISTANT) && (
                          <button 
                            onClick={() => setDeleteCallTarget(call)} 
                            className="p-2 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-xl transition-colors cursor-pointer"
                            title="Excluir Chamado Permanentemente"
                          >
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

      {/* Estado Vazio Explicativo e Amigável */}
      {filteredCalls.length === 0 && !loading && (
        <div className="bg-white rounded-3xl border border-gray-200/80 p-8 md:p-12 text-center space-y-3 shadow-xs">
          <div className="w-14 h-14 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-2xs">
            <MessageSquare className="w-7 h-7" />
          </div>
          <h3 className="text-base font-black text-gray-900 tracking-tight">
            Nenhum chamado encontrado
          </h3>
          <p className="text-xs text-gray-500 font-medium max-w-md mx-auto leading-relaxed">
            {search || statusFilter !== 'all' || priorityFilter !== 'all' || workshopFilter !== 'all' || routeFilter !== 'all'
              ? 'Nenhum chamado atende aos filtros selecionados. Tente limpar os filtros para visualizar a lista completa.'
              : 'Não há chamados de manutenção ou reparos registrados no momento. Quando um novo chamado for aberto, ele aparecerá aqui automaticamente.'}
          </p>
          {(search || statusFilter !== 'all' || priorityFilter !== 'all' || workshopFilter !== 'all' || routeFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setPriorityFilter('all');
                setWorkshopFilter('all');
                setRouteFilter('all');
              }}
              className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl font-bold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpar Filtros
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL UNIFICADO DE CHAMADOS (ABRIR, EDITAR, ALIMENTAR E FINALIZAR)         */}
      {/* ========================================================================= */}
      {isUnifiedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
            {/* Cabeçalho do Modal */}
            <div className="px-6 py-4 bg-slate-50 border-b border-gray-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs shrink-0",
                  !activeModalCall ? "bg-blue-600 text-white" :
                  activeModalCall.status === 'resolved' ? "bg-emerald-600 text-white" : "bg-blue-600 text-white"
                )}>
                  {!activeModalCall ? <Plus className="w-5 h-5" /> : 
                   activeModalCall.status === 'resolved' ? <CheckCircle2 className="w-5 h-5" /> : <Edit3 className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-black text-gray-900 leading-tight flex items-center gap-2">
                    {!activeModalCall 
                      ? 'Abertura de Novo Chamado' 
                      : `Gerenciamento do Chamado #${activeModalCall.id.slice(-6).toUpperCase()}`}
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    {!activeModalCall 
                      ? 'Preencha os dados e abra o chamado com diálogo centralizado para a equipe'
                      : `${activeModalCall.clientName || 'Cliente'} • ${activeModalCall.addressLabel || 'Endereço'}`}
                  </p>
                </div>
              </div>

              {/* Botão Fechar */}
              <button 
                onClick={() => {
                  setIsUnifiedModalOpen(false);
                  setActiveModalCall(null);
                  setMessage(null);
                }}
                className="p-2 hover:bg-gray-200/60 rounded-full text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Abas de Navegação do Modal (Desktop e Mobile) */}
            <div className="border-b border-gray-200 bg-gray-50/80 px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setUnifiedTab('tudo')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0",
                    unifiedTab === 'tudo' ? "bg-white text-blue-600 shadow-xs border border-gray-200" : "text-gray-500 hover:text-gray-800"
                  )}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Visão Completa</span>
                  <span className="sm:hidden">Tudo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUnifiedTab('dados')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0",
                    unifiedTab === 'dados' ? "bg-white text-blue-600 shadow-xs border border-gray-200" : "text-gray-500 hover:text-gray-800"
                  )}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Dados & Edição</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUnifiedTab('interacoes')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0",
                    unifiedTab === 'interacoes' ? "bg-white text-blue-600 shadow-xs border border-gray-200" : "text-gray-500 hover:text-gray-800"
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Alimentar</span>
                  {activeModalCall && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full font-bold">
                      {activeModalCall.comments?.length || 0}
                    </span>
                  )}
                </button>
                {activeModalCall && userRole !== UserRole.TECHNICIAN && (
                  <button
                    type="button"
                    onClick={() => setUnifiedTab('finalizacao')}
                    className={cn(
                      "px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0",
                      unifiedTab === 'finalizacao' ? "bg-white text-emerald-700 shadow-xs border border-gray-200" : "text-emerald-700 hover:text-emerald-900"
                    )}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Finalização</span>
                  </button>
                )}
              </div>

              {activeModalCall && (
                <div className="hidden sm:flex items-center gap-2 text-xs">
                  <span className="text-gray-400 font-medium">Status:</span>
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                    activeModalCall.status === 'resolved' ? "bg-emerald-100 text-emerald-800 border-emerald-300" :
                    activeModalCall.status === 'in_progress' ? "bg-blue-100 text-blue-800 border-blue-300" :
                    activeModalCall.status === 'cancelled' ? "bg-gray-100 text-gray-600 border-gray-300" :
                    "bg-red-100 text-red-800 border-red-300"
                  )}>
                    {activeModalCall.status === 'resolved' ? 'Resolvido' : activeModalCall.status === 'in_progress' ? 'Em Andamento' : activeModalCall.status === 'cancelled' ? 'Cancelado' : 'Pendente'}
                  </span>
                </div>
              )}
            </div>

            {/* Mensagem de Feedback */}
            {message && (
              <div className={cn(
                "mx-6 mt-4 p-3.5 rounded-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2 text-xs font-bold",
                message.type === 'success' ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
              )}>
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{message.text}</span>
              </div>
            )}

            {/* Corpo com 2 Colunas Integradas */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6 divide-y md:divide-y-0 md:divide-x divide-gray-100">
              
              {/* ======================================================== */}
              {/* COLUNA ESQUERDA: DADOS, EDIÇÃO E FINALIZAÇÃO DO CHAMADO  */}
              {/* ======================================================== */}
              <div className={cn(
                unifiedTab === 'interacoes' 
                  ? "hidden" 
                  : (unifiedTab === 'dados' || unifiedTab === 'finalizacao')
                    ? "col-span-12 md:col-span-12 space-y-5"
                    : "col-span-12 md:col-span-7 space-y-5"
              )}>
                {unifiedTab !== 'finalizacao' && (
                  <>
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                        Dados Cadastrais do Atendimento
                      </span>
                      {activeModalCall && (
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                            activeModalCall.status === 'resolved' ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                            activeModalCall.status === 'in_progress' ? "bg-blue-100 text-blue-700 border-blue-200" :
                            activeModalCall.status === 'cancelled' ? "bg-gray-100 text-gray-500 border-gray-200" :
                            "bg-red-100 text-red-700 border-red-200"
                          )}>
                            {activeModalCall.status === 'resolved' ? 'Resolvido' : activeModalCall.status === 'in_progress' ? 'Em Andamento' : activeModalCall.status === 'cancelled' ? 'Cancelado' : 'Pendente'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Cliente e Endereço */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
                          Cliente *
                        </label>
                        <select 
                          disabled={!!managerClientId}
                          value={formData.clientId}
                          onChange={(e) => {
                            setFormData({ ...formData, clientId: e.target.value, addressId: '' });
                            setCallAddressSearchTerm('');
                            setIsCallAddressDropdownOpen(false);
                          }}
                          className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-bold text-gray-800 text-xs disabled:opacity-60 cursor-pointer"
                        >
                          <option value="">Selecione o Cliente...</option>
                          {clients.slice().sort((a,b) => a.name.localeCompare(b.name)).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500">
                            Unidade / Endereço *
                          </label>
                          {formData.addressId && (
                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-1 border border-emerald-200">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Selecionado
                            </span>
                          )}
                        </div>
                        {renderCallAddressAutocomplete()}
                      </div>
                    </div>
                  </>
                )}

                {/* Prioridade e Previsão */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
                      Prioridade
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: ServiceCallPriority.LOW, label: 'Baixa', activeClass: 'bg-blue-600 text-white border-blue-600' },
                        { id: ServiceCallPriority.MEDIUM, label: 'Média', activeClass: 'bg-amber-600 text-white border-amber-600' },
                        { id: ServiceCallPriority.HIGH, label: 'Alta', activeClass: 'bg-red-600 text-white border-red-600' }
                      ].map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setFormData({ ...formData, priority: p.id })}
                          className={cn(
                            "py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center cursor-pointer",
                            formData.priority === p.id 
                              ? cn(p.activeClass, "shadow-sm") 
                              : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
                      Previsão de Atendimento
                    </label>
                    <div className="relative">
                      <Clock3 className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input 
                        type="date"
                        value={formData.forecastDate}
                        onChange={(e) => setFormData({ ...formData, forecastDate: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-semibold text-gray-700"
                      />
                    </div>
                  </div>
                </div>

                {/* Opção Máquina na Oficina da Empresa */}
                <div className="pt-1">
                  <label className={cn(
                    "flex items-center gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer select-none",
                    formData.isWorkshop 
                      ? "bg-purple-50 border-purple-300 text-purple-950 ring-2 ring-purple-500/20 shadow-xs" 
                      : "bg-gray-50/70 border-gray-200 text-gray-700 hover:bg-gray-100/60"
                  )}>
                    <input 
                      type="checkbox"
                      checked={formData.isWorkshop}
                      onChange={(e) => setFormData(prev => ({ ...prev, isWorkshop: e.target.checked }))}
                      className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer shrink-0"
                    />
                    <div className="flex items-center gap-2.5 text-xs">
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                        formData.isWorkshop ? "bg-purple-600 text-white" : "bg-gray-200 text-gray-500"
                      )}>
                        <Wrench className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-extrabold text-gray-900 block leading-tight">Máquina / Equipamento na Oficina</span>
                        <span className="text-[11px] text-gray-500 font-medium">Marque este chamado se o equipamento se encontra na oficina da empresa.</span>
                      </div>
                    </div>
                  </label>
                </div>

                {/* Se editando, permite mudar status se necessário */}
                {activeModalCall && (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
                      Alterar Status do Chamado
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: ServiceCallStatus.OPEN, label: 'Pendente' },
                        { id: ServiceCallStatus.IN_PROGRESS, label: 'Em Andamento' },
                        { id: ServiceCallStatus.RESOLVED, label: 'Resolvido' },
                        { id: ServiceCallStatus.CANCELLED, label: 'Cancelado' }
                      ].map(st => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setFormData({ ...formData, status: st.id as any })}
                          className={cn(
                            "py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer",
                            formData.status === st.id 
                              ? "bg-slate-900 text-white border-slate-900 shadow-xs" 
                              : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                          )}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Descrição do Problema */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
                    Descrição Detalhada do Problema *
                  </label>
                  <textarea 
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-xs text-gray-800 resize-none leading-relaxed uppercase placeholder:normal-case font-mono tracking-wide"
                    placeholder="EX: EQUIPAMENTO DO SETOR FINANCEIRO NÃO ESTÁ REFRIGERANDO E APRESENTANDO RUÍDO INCOMUM..."
                  />
                </div>

                {/* Link de Apoio e Fotos Anexas */}
                <div className="p-4 bg-gray-50/70 rounded-2xl border border-gray-200/70 space-y-3">
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">
                      Link de Apoio ou Documento (Opcional)
                    </label>
                    <div className="flex gap-2">
                      <input 
                        type="url"
                        value={formData.linkUrl}
                        onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })}
                        className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none font-medium text-gray-700"
                        placeholder="https://exemplo.com/reuniao-ou-documento"
                      />
                      {formData.linkUrl && (
                        <a 
                          href={formData.linkUrl.startsWith('http') ? formData.linkUrl : `https://${formData.linkUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 bg-white hover:bg-blue-50 border border-gray-200 rounded-xl text-xs font-bold text-blue-600 transition-colors flex items-center gap-1 shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" /> Testar
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Fotos (Até 4 Fotos) */}
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
                      Fotos do Chamado (Até 4 Fotos)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {/* Slot 1 */}
                      <div>
                        <input 
                          type="file" 
                          ref={fileInputRef1} 
                          onChange={(e) => handlePhotoUpload(e, 1)} 
                          accept="image/*" 
                          className="hidden" 
                        />
                        {formData.attachmentUrl1 ? (
                          <div className="relative group rounded-xl border border-gray-200 overflow-hidden bg-white aspect-video flex items-center justify-center shadow-2xs">
                            <img src={formData.attachmentUrl1} alt="Foto 1" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => setExpandedImageUrl(formData.attachmentUrl1)}
                                className="p-1.5 bg-white text-gray-800 rounded-lg hover:bg-gray-100 shadow-sm"
                                title="Ampliar Imagem"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, attachmentUrl1: '' }))}
                                className="p-1.5 bg-white text-red-600 rounded-lg hover:bg-red-50 shadow-sm"
                                title="Remover Foto 1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => fileInputRef1.current?.click()}
                            disabled={isUploadingSlot1}
                            className="border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50/20 rounded-xl p-2 flex flex-col items-center justify-center bg-white transition-all cursor-pointer w-full aspect-video"
                          >
                            {isUploadingSlot1 ? (
                              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                            ) : (
                              <>
                                <Plus className="w-4 h-4 text-gray-400 mb-0.5" />
                                <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Foto 1</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {/* Slot 2 */}
                      <div>
                        <input 
                          type="file" 
                          ref={fileInputRef2} 
                          onChange={(e) => handlePhotoUpload(e, 2)} 
                          accept="image/*" 
                          className="hidden" 
                        />
                        {formData.attachmentUrl2 ? (
                          <div className="relative group rounded-xl border border-gray-200 overflow-hidden bg-white aspect-video flex items-center justify-center shadow-2xs">
                            <img src={formData.attachmentUrl2} alt="Foto 2" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => setExpandedImageUrl(formData.attachmentUrl2)}
                                className="p-1.5 bg-white text-gray-800 rounded-lg hover:bg-gray-100 shadow-sm"
                                title="Ampliar Imagem"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, attachmentUrl2: '' }))}
                                className="p-1.5 bg-white text-red-600 rounded-lg hover:bg-red-50 shadow-sm"
                                title="Remover Foto 2"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => fileInputRef2.current?.click()}
                            disabled={isUploadingSlot2}
                            className="border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50/20 rounded-xl p-2 flex flex-col items-center justify-center bg-white transition-all cursor-pointer w-full aspect-video"
                          >
                            {isUploadingSlot2 ? (
                              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                            ) : (
                              <>
                                <Plus className="w-4 h-4 text-gray-400 mb-0.5" />
                                <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Foto 2</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {/* Slot 3 */}
                      <div>
                        <input 
                          type="file" 
                          ref={fileInputRef3} 
                          onChange={(e) => handlePhotoUpload(e, 3)} 
                          accept="image/*" 
                          className="hidden" 
                        />
                        {formData.attachmentUrl3 ? (
                          <div className="relative group rounded-xl border border-gray-200 overflow-hidden bg-white aspect-video flex items-center justify-center shadow-2xs">
                            <img src={formData.attachmentUrl3} alt="Foto 3" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => setExpandedImageUrl(formData.attachmentUrl3)}
                                className="p-1.5 bg-white text-gray-800 rounded-lg hover:bg-gray-100 shadow-sm"
                                title="Ampliar Imagem"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, attachmentUrl3: '' }))}
                                className="p-1.5 bg-white text-red-600 rounded-lg hover:bg-red-50 shadow-sm"
                                title="Remover Foto 3"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => fileInputRef3.current?.click()}
                            disabled={isUploadingSlot3}
                            className="border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50/20 rounded-xl p-2 flex flex-col items-center justify-center bg-white transition-all cursor-pointer w-full aspect-video"
                          >
                            {isUploadingSlot3 ? (
                              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                            ) : (
                              <>
                                <Plus className="w-4 h-4 text-gray-400 mb-0.5" />
                                <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Foto 3</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {/* Slot 4 */}
                      <div>
                        <input 
                          type="file" 
                          ref={fileInputRef4} 
                          onChange={(e) => handlePhotoUpload(e, 4)} 
                          accept="image/*" 
                          className="hidden" 
                        />
                        {formData.attachmentUrl4 ? (
                          <div className="relative group rounded-xl border border-gray-200 overflow-hidden bg-white aspect-video flex items-center justify-center shadow-2xs">
                            <img src={formData.attachmentUrl4} alt="Foto 4" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => setExpandedImageUrl(formData.attachmentUrl4)}
                                className="p-1.5 bg-white text-gray-800 rounded-lg hover:bg-gray-100 shadow-sm"
                                title="Ampliar Imagem"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, attachmentUrl4: '' }))}
                                className="p-1.5 bg-white text-red-600 rounded-lg hover:bg-red-50 shadow-sm"
                                title="Remover Foto 4"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => fileInputRef4.current?.click()}
                            disabled={isUploadingSlot4}
                            className="border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50/20 rounded-xl p-2 flex flex-col items-center justify-center bg-white transition-all cursor-pointer w-full aspect-video"
                          >
                            {isUploadingSlot4 ? (
                              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                            ) : (
                              <>
                                <Plus className="w-4 h-4 text-gray-400 mb-0.5" />
                                <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Foto 4</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ======================================================== */}
                {/* SEÇÃO DE FINALIZAÇÃO DO ATENDIMENTO (DIRETO NO MODAL!)   */}
                {/* ======================================================== */}
                {activeModalCall && userRole !== UserRole.TECHNICIAN && (unifiedTab === 'tudo' || unifiedTab === 'finalizacao') && (
                  <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-800">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-xs font-black uppercase tracking-wider">
                          Finalização & Resolução Técnica
                        </span>
                      </div>
                      {activeModalCall.status === 'resolved' && (
                        <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          Concluído
                        </span>
                      )}
                    </div>

                    {activeModalCall.status === 'resolved' ? (
                      <div className="space-y-2">
                        <p className="text-xs text-emerald-950 font-medium italic bg-white/80 p-3 rounded-xl border border-emerald-100 uppercase">
                          "{(activeModalCall.resolutionNotes || 'ATENDIMENTO CONCLUÍDO COM SUCESSO.').toUpperCase()}"
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-emerald-700">
                          <span>
                            Finalizado em: {activeModalCall.resolvedAt?.seconds ? format(new Date(activeModalCall.resolvedAt.seconds * 1000), "dd/MM/yyyy HH:mm") : 'Recentemente'}
                          </span>
                          <button
                            type="button"
                            onClick={handleReopenCall}
                            disabled={saving}
                            className="text-amber-700 hover:text-amber-900 font-bold underline cursor-pointer"
                          >
                            Reabrir Chamado
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <p className="text-[11px] text-emerald-900 font-medium">
                          Descreva a solução executada abaixo e clique no botão para finalizar este chamado diretamente:
                        </p>
                        <textarea
                          rows={2}
                          value={formData.resolutionNotes}
                          onChange={(e) => setFormData({ ...formData, resolutionNotes: e.target.value.toUpperCase() })}
                          className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs text-gray-800 font-medium resize-none placeholder-gray-400 uppercase font-mono tracking-wide"
                          placeholder="EX: REALIZADA CARGA DE GÁS, HIGIENIZAÇÃO DE FILTROS E TESTE DE TEMPERATURA..."
                        />
                        <button
                          type="button"
                          onClick={handleFinalizeCall}
                          disabled={saving || !formData.resolutionNotes.trim()}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[3]" />}
                          Confirmar Resolução e Finalizar Chamado
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Botões de Ação do Formulário */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    {activeModalCall && activeModalCall.status !== 'cancelled' && userRole !== UserRole.TECHNICIAN && (
                      <button
                        type="button"
                        onClick={() => handleCancelCall(activeModalCall.id)}
                        disabled={saving}
                        className="px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50 rounded-xl transition-colors cursor-pointer"
                      >
                        Cancelar Chamado
                      </button>
                    )}
                    {activeModalCall && (userRole === UserRole.ADMIN || userRole === UserRole.ASSISTANT) && (
                      <button
                        type="button"
                        onClick={() => setDeleteCallTarget(activeModalCall)}
                        disabled={saving}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                        title="Excluir Chamado"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsUnifiedModalOpen(false);
                        setActiveModalCall(null);
                        setMessage(null);
                      }}
                      className="px-4 py-2.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                    >
                      Fechar
                    </button>
                    {unifiedTab !== 'finalizacao' && (
                      <button
                        type="button"
                        onClick={handleSaveCallData}
                        disabled={saving || !formData.clientId || !formData.addressId || !formData.description.trim()}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-blue-200 flex items-center gap-2 cursor-pointer"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
                        {!activeModalCall ? 'Confirmar Abertura' : 'Salvar Alterações'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ======================================================== */}
              {/* COLUNA DIREITA: ALIMENTAÇÃO & HISTÓRICO DE INTERAÇÕES    */}
              {/* ======================================================== */}
              <div className={cn(
                (unifiedTab === 'dados' || unifiedTab === 'finalizacao')
                  ? "hidden"
                  : unifiedTab === 'interacoes'
                    ? "col-span-12 md:col-span-12 flex flex-col"
                    : "col-span-12 md:col-span-5 flex flex-col md:pl-6",
                "h-[520px] md:h-auto"
              )}>
                <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                      Alimentação & Histórico
                    </span>
                  </div>
                  {activeModalCall && (
                    <span className="text-[9px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                      {activeModalCall.comments?.length || 0} interações
                    </span>
                  )}
                </div>

                {!activeModalCall ? (
                  /* Modo de Abertura: Permite adicionar instrução ou observação inicial */
                  <div className="flex-1 flex flex-col justify-between bg-blue-50/30 p-4 rounded-2xl border border-blue-100/60">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-blue-700 font-extrabold text-xs">
                        <Sparkles className="w-4 h-4" />
                        Instruções ou Observação Inicial
                      </div>
                      <p className="text-xs text-gray-600 font-medium leading-relaxed">
                        Você pode registrar abaixo uma instrução ou comentário inicial da equipe para este chamado. Ele será registrado automaticamente no histórico de interações assim que a abertura for confirmada.
                      </p>
                      <textarea
                        rows={6}
                        value={formData.initialObservation}
                        onChange={(e) => setFormData({ ...formData, initialObservation: e.target.value })}
                        className="w-full px-3.5 py-3 bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-medium text-gray-800 resize-none leading-relaxed"
                        placeholder="Ex: Cliente informou que a chave de acesso fica na portaria principal. Verificar disjuntor do quadro B..."
                      />
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-blue-100 text-[10px] text-gray-500 font-medium">
                      💡 <strong>Dica</strong>: Após a abertura, qualquer membro da equipe ou técnico poderá alimentar este chamado em tempo real.
                    </div>
                  </div>
                ) : (
                  /* Modo Existente: Histórico em tempo real + Campo de envio */
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* Lista com Rolagem dos Comentários */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-3 scrollbar-thin scrollbar-thumb-gray-200">
                      {(!activeModalCall.comments || activeModalCall.comments.length === 0) ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                          <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                          <p className="text-xs font-bold">Nenhum comentário registrado ainda.</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">Use o campo abaixo para alimentar o histórico deste chamado.</p>
                        </div>
                      ) : (
                        activeModalCall.comments.map((comment: ServiceCallComment) => {
                          const isMe = comment.authorId === userProfile?.uid;
                          return (
                            <div 
                              key={comment.id} 
                              className={cn(
                                "flex flex-col gap-1 max-w-[90%]", 
                                isMe ? "ml-auto items-end" : "mr-auto items-start"
                              )}
                            >
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
                                   comment.authorRole === 'manager' ? 'Gestor' : 'Técnico/Suporte'}
                                </span>
                              </div>
                              <div className={cn(
                                "px-3.5 py-2 rounded-2xl text-xs leading-relaxed shadow-xs font-medium break-words whitespace-pre-wrap max-w-full text-left",
                                isMe 
                                  ? "bg-blue-600 text-white rounded-tr-none" 
                                  : "bg-gray-100 text-gray-800 rounded-tl-none border border-gray-200/60"
                              )}>
                                {renderCommentContent(comment.content, isMe)}
                              </div>
                              <span className="text-[8px] text-gray-400">
                                {comment.createdAt?.seconds 
                                  ? format(new Date(comment.createdAt.seconds * 1000), "dd/MM HH:mm") 
                                  : comment.createdAt instanceof Date 
                                    ? format(comment.createdAt, "dd/MM HH:mm")
                                    : "Agora"}
                              </span>
                            </div>
                          );
                        })
                      )}
                      <div ref={commentsEndRef} />
                    </div>

                    {/* Caixa de Entrada para Alimentar */}
                    <div className="pt-3 border-t border-gray-100 shrink-0">
                      <div className="flex gap-2">
                        <textarea
                          rows={2}
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleAddComment();
                            }
                          }}
                          className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs font-medium text-gray-800 resize-none placeholder-gray-400"
                          placeholder="Alimentar chamado... (Enter para enviar)"
                        />
                        <button
                          type="button"
                          disabled={savingComment || !newCommentText.trim()}
                          onClick={handleAddComment}
                          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl px-3.5 flex items-center justify-center transition-all shadow-md shadow-blue-200 cursor-pointer shrink-0"
                          title="Enviar atualização"
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
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE CONFIRMAÇÃO: EXCLUIR CHAMADO INDIVIDUAL                          */}
      {/* ========================================================================= */}
      {deleteCallTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-lg font-black text-gray-900">Excluir este chamado?</h4>
              <p className="text-xs text-gray-500 mt-1">
                Você está prestes a remover permanentemente o chamado do cliente <strong>{deleteCallTarget.clientName}</strong>. Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCallTarget(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleDeleteCall}
                disabled={saving}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-red-200 flex items-center gap-1.5 cursor-pointer"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE CONFIRMAÇÃO: ZERAR CHAMADOS EM ABERTO                            */}
      {/* ========================================================================= */}
      {isClearOpenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-amber-200 w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-lg font-black text-gray-900">Zerar chamados em aberto?</h4>
              <p className="text-xs text-gray-600 leading-relaxed mt-1">
                Conforme solicitado, esta ação irá <strong>excluir todos os chamados em aberto e pendentes ({stats.open + stats.inProgress})</strong>, mantendo estritamente os <strong>{stats.resolved} chamados que já foram concluídos/resolvidos</strong> intactos para relatórios.
              </p>
            </div>
            <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-100 text-[11px] text-amber-900 font-medium">
              ⚠️ Esta operação é irreversível e permitirá recomeçar os cadastros do zero preservando o histórico de atendimentos finalizados.
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsClearOpenModalOpen(false)}
                disabled={isClearingOpenCalls}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleClearAllOpenCalls}
                disabled={isClearingOpenCalls}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-amber-200 flex items-center gap-1.5 cursor-pointer"
              >
                {isClearingOpenCalls ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Confirmar e Zerar Abertos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LIGHTBOX IN-APP PARA VISUALIZAÇÃO DE FOTOS                                */}
      {/* ========================================================================= */}
      {expandedImageUrl && (
        <div 
          onClick={() => setExpandedImageUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in cursor-zoom-out"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <img 
              src={expandedImageUrl} 
              alt="Foto Ampliada" 
              className="max-w-full max-h-[85vh] object-contain rounded-2xl bg-black" 
            />
            <button
              onClick={() => setExpandedImageUrl(null)}
              className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black text-white rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>

      {/* ========================================================================= */}
      {/* MODAL FOLHA DE IMPRESSÃO DE CHAMADOS POR ROTAS (SUPERVISÃO / DIRETORIA)   */}
      {/* ========================================================================= */}
      {isRoutePrintModalOpen && (
        <div className="print-modal-container fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto print:static print:p-0 print:m-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto">
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 8mm 10mm !important;
              }
              .no-print, .print\\:hidden {
                display: none !important;
                visibility: hidden !important;
                height: 0 !important;
                overflow: hidden !important;
              }
              html, body, #root, #root > div, main, main > div, .print-modal-container {
                background: #ffffff !important;
                color: #000000 !important;
                height: auto !important;
                min-height: auto !important;
                max-height: none !important;
                overflow: visible !important;
                margin: 0 !important;
                padding: 0 !important;
                display: block !important;
                position: static !important;
                transform: none !important;
                box-shadow: none !important;
              }
              #routes-print-area {
                width: 100% !important;
                max-width: none !important;
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
                box-shadow: none !important;
              }
              #routes-print-area table {
                page-break-inside: auto !important;
              }
              #routes-print-area thead {
                display: table-header-group !important;
              }
              #routes-print-area tr {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              .route-section-header {
                break-after: avoid !important;
                page-break-after: avoid !important;
              }
            }
          `}</style>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden print:border-none print:shadow-none print:rounded-none print:max-w-none print:max-h-none print:block">
            {/* Barra de Controles do Modal (Oculta na Impressão) */}
            <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-col gap-3 shrink-0 no-print print:hidden">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center shadow-xs shrink-0">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight">
                      Folha de Impressão — Chamados por Rota de Atendimento
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Visão logística consolidada para supervisão e diretoria traçarem os próximos atendimentos.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      window.focus();
                      setTimeout(() => window.print(), 150);
                    }}
                    disabled={routePrintData.totalCalls === 0}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md shadow-blue-200 cursor-pointer transition-all"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimir Folha (A4)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRoutePrintModalOpen(false)}
                    className="px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer transition-all"
                  >
                    Fechar
                  </button>
                </div>
              </div>

              {/* Opções de Filtro e Ordenação da Folha */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/70">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1">Exibir:</span>
                  {[
                    { id: 'pending', label: `Pendentes / Em Aberto (${stats.open + stats.inProgress})` },
                    { id: 'all', label: `Todos os Chamados (${calls.length})` },
                    { id: 'filtered', label: `Filtro da Tela (${filteredCalls.length})` }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setRoutePrintScope(opt.id as any)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border cursor-pointer",
                        routePrintScope === opt.id
                          ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRoutePrintSortBy(prev => prev === 'volume_desc' ? 'route_asc' : 'volume_desc')}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer flex items-center gap-1.5"
                    title="Alternar ordenação das rotas"
                  >
                    <span>Ordenação:</span>
                    <span className="text-blue-700 font-black">
                      {routePrintSortBy === 'volume_desc' ? 'Maior Volume de Chamados' : 'Ordem das Rotas'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRoutePrintIncludeDetails(prev => !prev)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer transition-all",
                      routePrintIncludeDetails
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    {routePrintIncludeDetails ? '✓ Resumo + Lista Detalhada' : 'Somente Resumo por Rota'}
                  </button>
                </div>
              </div>
            </div>

            {/* Área da Folha A4 Imprimível */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 print:p-0 print:m-0 print:bg-white print:overflow-visible print:block">
              <div
                id="routes-print-area"
                className="bg-white border border-slate-300 shadow-sm mx-auto p-6 sm:p-8 print:p-0 print:border-none print:shadow-none text-slate-900"
                style={{ maxWidth: '210mm', width: '100%' }}
              >
                {/* Cabeçalho Institucional da Folha */}
                <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3 mb-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      LE FRIO REFRIGERAÇÃO E COMÉRCIO LTDA • LOGÍSTICA E SUPERVISÃO
                    </div>
                    <h1 className="text-lg sm:text-xl font-black uppercase tracking-tight text-slate-950 mt-0.5 leading-tight">
                      MAPA DE CHAMADOS POR ROTA DE ATENDIMENTO
                    </h1>
                    <p className="text-[11px] font-semibold text-slate-600 mt-0.5">
                      Escopo:{' '}
                      <strong className="text-slate-900">
                        {routePrintScope === 'pending'
                          ? 'Chamados Pendentes e Em Andamento'
                          : routePrintScope === 'filtered'
                            ? 'Conforme Filtros Aplicados na Tela'
                            : 'Todos os Chamados Registrados'}
                      </strong>
                    </p>
                  </div>
                  <div className="text-right text-[10px] text-slate-600 font-semibold leading-snug shrink-0">
                    <div>Emissão: <strong className="text-slate-900">{format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</strong></div>
                    <div>Emitido por: <strong className="text-slate-900 uppercase">{userProfile?.name || 'Administração'}</strong></div>
                  </div>
                </div>

                {/* Indicadores Totais da Folha */}
                <div className="grid grid-cols-4 gap-2.5 mb-5">
                  <div className="border border-slate-300 rounded-lg p-2.5 bg-slate-50 text-center">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Total de Chamados</span>
                    <span className="text-xl font-black text-slate-950">{routePrintData.totalCalls}</span>
                  </div>
                  <div className="border border-slate-300 rounded-lg p-2.5 bg-slate-50 text-center">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Rotas Envolvidas</span>
                    <span className="text-xl font-black text-blue-800">{routePrintData.totalRoutes}</span>
                  </div>
                  <div className="border border-red-300 rounded-lg p-2.5 bg-red-50/70 text-center">
                    <span className="text-[9px] font-black uppercase tracking-wider text-red-700 block">Alta Prioridade</span>
                    <span className="text-xl font-black text-red-700">{routePrintData.totalHighPriority}</span>
                  </div>
                  <div className="border border-purple-300 rounded-lg p-2.5 bg-purple-50/70 text-center">
                    <span className="text-[9px] font-black uppercase tracking-wider text-purple-800 block">Em Oficina</span>
                    <span className="text-xl font-black text-purple-800">{routePrintData.totalWorkshop}</span>
                  </div>
                </div>

                {routePrintData.totalCalls === 0 ? (
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-500 text-xs font-bold">
                    Nenhum chamado encontrado para o filtro selecionado.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* BLOCO 1: QUADRO RESUMO QUANTITATIVO POR ROTA */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-700" />
                          1. Resumo Quantitativo por Rota (Visão Rápida de Logística)
                        </h2>
                        <span className="text-[9px] font-bold uppercase text-slate-500">
                          Ordenado por {routePrintSortBy === 'volume_desc' ? 'Maior Demanda' : 'Ordem da Rota'}
                        </span>
                      </div>
                      <table className="w-full border-collapse border border-slate-400 text-[10px]">
                        <thead>
                          <tr className="bg-slate-900 text-white uppercase text-[9px] tracking-wider">
                            <th className="py-1.5 px-2.5 text-left border border-slate-700">Rota de Atendimento</th>
                            <th className="py-1.5 px-2 text-center border border-slate-700 w-20">Qtd. Total</th>
                            <th className="py-1.5 px-2 text-center border border-slate-700 w-20">Pendentes</th>
                            <th className="py-1.5 px-2 text-center border border-slate-700 w-24">Em Andamento</th>
                            <th className="py-1.5 px-2 text-center border border-slate-700 w-24">Alta Prior.</th>
                            <th className="py-1.5 px-2 text-center border border-slate-700 w-20">Oficina</th>
                            {routePrintScope === 'all' && (
                              <th className="py-1.5 px-2 text-center border border-slate-700 w-20">Concluídos</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {routePrintData.groups.map((group, idx) => (
                            <tr key={group.routeKey} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                              <td className="py-1.5 px-2.5 font-extrabold text-slate-900 border border-slate-300 uppercase">
                                {group.routeName}
                              </td>
                              <td className="py-1.5 px-2 text-center font-black text-slate-950 border border-slate-300 bg-slate-100/80 text-[11px]">
                                {group.calls.length}
                              </td>
                              <td className="py-1.5 px-2 text-center font-bold text-slate-700 border border-slate-300">
                                {group.openCount}
                              </td>
                              <td className="py-1.5 px-2 text-center font-bold text-blue-700 border border-slate-300">
                                {group.inProgressCount}
                              </td>
                              <td className={cn(
                                "py-1.5 px-2 text-center font-black border border-slate-300",
                                group.highPriorityCount > 0 ? "text-red-700 bg-red-50" : "text-slate-400"
                              )}>
                                {group.highPriorityCount}
                              </td>
                              <td className={cn(
                                "py-1.5 px-2 text-center font-black border border-slate-300",
                                group.workshopCount > 0 ? "text-purple-800 bg-purple-50" : "text-slate-400"
                              )}>
                                {group.workshopCount}
                              </td>
                              {routePrintScope === 'all' && (
                                <td className="py-1.5 px-2 text-center font-bold text-emerald-700 border border-slate-300">
                                  {group.resolvedCount}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-200 font-black text-slate-950 uppercase text-[10px]">
                            <td className="py-1.5 px-2.5 border border-slate-400">TOTAL GERAL ({routePrintData.totalRoutes} ROTAS)</td>
                            <td className="py-1.5 px-2 text-center border border-slate-400">{routePrintData.totalCalls}</td>
                            <td className="py-1.5 px-2 text-center border border-slate-400">{routePrintData.totalOpen}</td>
                            <td className="py-1.5 px-2 text-center border border-slate-400">{routePrintData.totalInProgress}</td>
                            <td className="py-1.5 px-2 text-center border border-slate-400 text-red-700">{routePrintData.totalHighPriority}</td>
                            <td className="py-1.5 px-2 text-center border border-slate-400 text-purple-800">{routePrintData.totalWorkshop}</td>
                            {routePrintScope === 'all' && (
                              <td className="py-1.5 px-2 text-center border border-slate-400 text-emerald-800">
                                {routePrintData.groups.reduce((acc, g) => acc + g.resolvedCount, 0)}
                              </td>
                            )}
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* BLOCO 2: DETALHAMENTO DOS CHAMADOS POR ROTA */}
                    {routePrintIncludeDetails && (
                      <div className="space-y-4">
                        <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1">
                          2. Detalhamento dos Chamados por Rota
                        </h2>

                        {routePrintData.groups.map((group) => (
                          <div key={group.routeKey} className="space-y-0">
                            {/* Faixa Título da Rota */}
                            <div className="route-section-header bg-slate-800 text-white px-3 py-1.5 rounded-t-md flex items-center justify-between border border-slate-800">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-black uppercase tracking-wide">
                                  ROTA: {group.routeName}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[9px] font-black uppercase">
                                <span className="bg-white text-slate-900 px-2 py-0.5 rounded">
                                  {group.calls.length} {group.calls.length === 1 ? 'CHAMADO' : 'CHAMADOS'}
                                </span>
                                {group.highPriorityCount > 0 && (
                                  <span className="bg-red-600 text-white px-2 py-0.5 rounded">
                                    {group.highPriorityCount} ALTA PRIOR.
                                  </span>
                                )}
                                {group.workshopCount > 0 && (
                                  <span className="bg-purple-600 text-white px-2 py-0.5 rounded">
                                    {group.workshopCount} OFICINA
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Tabela de Chamados da Rota */}
                            <table className="w-full border-collapse border border-slate-300 text-[9.5px]">
                              <thead>
                                <tr className="bg-slate-100 text-slate-700 uppercase text-[8.5px] font-black tracking-wider">
                                  <th className="py-1 px-2 text-center border border-slate-300 w-7">#</th>
                                  <th className="py-1 px-2 text-left border border-slate-300 w-24">Data / Prev.</th>
                                  <th className="py-1 px-2 text-left border border-slate-300 w-56">Cliente / Local de Atendimento</th>
                                  <th className="py-1 px-2 text-center border border-slate-300 w-24">Situação</th>
                                  <th className="py-1 px-2 text-left border border-slate-300">Descrição do Problema / Observações</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.calls.map((call, idx) => {
                                  const openDateStr = call.createdAt?.seconds
                                    ? format(new Date(call.createdAt.seconds * 1000), 'dd/MM/yy')
                                    : '-';
                                  const daysOpen = call.createdAt?.seconds && call.status !== ServiceCallStatus.RESOLVED && call.status !== ServiceCallStatus.CANCELLED
                                    ? differenceInDays(new Date(), new Date(call.createdAt.seconds * 1000))
                                    : null;

                                  return (
                                    <tr key={call.id} className={call.priority === ServiceCallPriority.HIGH && call.status !== ServiceCallStatus.RESOLVED ? 'bg-red-50/40' : 'bg-white'}>
                                      <td className="py-1.5 px-2 text-center font-bold text-slate-500 border border-slate-300 align-top">
                                        {idx + 1}
                                      </td>
                                      <td className="py-1.5 px-2 border border-slate-300 align-top">
                                        <div className="font-bold text-slate-800">{openDateStr}</div>
                                        {daysOpen !== null && (
                                          <div className={cn("text-[8px] font-black", daysOpen >= 7 ? "text-red-700" : "text-amber-700")}>
                                            {daysOpen}d aberto
                                          </div>
                                        )}
                                        {call.forecastDate && call.status !== ServiceCallStatus.RESOLVED && (
                                          <div className="text-[8px] font-bold text-blue-700 mt-0.5">
                                            Prev: {format(new Date(call.forecastDate + 'T12:00:00'), 'dd/MM')}
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-1.5 px-2 border border-slate-300 align-top">
                                        <div className="font-black text-slate-900 uppercase leading-tight">
                                          {call.clientName}
                                        </div>
                                        <div className="text-[8.5px] text-slate-600 font-medium leading-snug mt-0.5">
                                          {call.resolvedAddressLabel}
                                        </div>
                                      </td>
                                      <td className="py-1.5 px-2 text-center border border-slate-300 align-top">
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span className={cn(
                                            "px-1.5 py-0.2 rounded text-[8px] font-black uppercase border",
                                            call.status === ServiceCallStatus.RESOLVED ? "bg-emerald-50 text-emerald-800 border-emerald-300" :
                                            call.status === ServiceCallStatus.IN_PROGRESS ? "bg-blue-50 text-blue-800 border-blue-300" :
                                            call.status === ServiceCallStatus.CANCELLED ? "bg-slate-100 text-slate-600 border-slate-300" :
                                            "bg-amber-50 text-amber-900 border-amber-300"
                                          )}>
                                            {call.status === ServiceCallStatus.RESOLVED ? 'Resolvido' :
                                             call.status === ServiceCallStatus.IN_PROGRESS ? 'Andamento' :
                                             call.status === ServiceCallStatus.CANCELLED ? 'Cancelado' : 'Pendente'}
                                          </span>
                                          <span className={cn(
                                            "px-1.5 py-0.2 rounded text-[7.5px] font-black uppercase",
                                            call.priority === ServiceCallPriority.HIGH ? "bg-red-600 text-white" :
                                            call.priority === ServiceCallPriority.MEDIUM ? "bg-slate-200 text-slate-800" :
                                            "bg-slate-100 text-slate-500"
                                          )}>
                                            {call.priority === ServiceCallPriority.HIGH ? 'Alta Prior.' :
                                             call.priority === ServiceCallPriority.MEDIUM ? 'Média' : 'Baixa'}
                                          </span>
                                          {call.isWorkshop && (
                                            <span className="px-1.5 py-0.2 rounded text-[7.5px] font-black uppercase bg-purple-100 text-purple-900 border border-purple-300">
                                              Oficina
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-1.5 px-2 border border-slate-300 align-top">
                                        <div className="font-semibold text-slate-800 leading-snug whitespace-pre-wrap">
                                          {call.description}
                                        </div>
                                        {call.status === ServiceCallStatus.RESOLVED && call.resolutionNotes && (
                                          <div className="text-[8.5px] text-emerald-800 font-bold mt-0.5 italic uppercase">
                                            Solução: {call.resolutionNotes.toUpperCase()}
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Campo de Anotações Manuais da Supervisão / Diretoria na Folha Impressa */}
                    <div className="border border-slate-300 rounded-md p-3 mt-4 bg-slate-50/40">
                      <div className="text-[9px] font-black uppercase tracking-wider text-slate-600 mb-4">
                        Observações / Direcionamento de Equipes (Supervisão / Diretoria):
                      </div>
                      <div className="border-b border-dashed border-slate-300 h-5" />
                      <div className="border-b border-dashed border-slate-300 h-5" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
