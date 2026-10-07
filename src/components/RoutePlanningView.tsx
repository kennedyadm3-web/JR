import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  MapPin, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  CalendarDays,
  LayoutDashboard,
  Filter,
  ArrowRight,
  Printer,
  Edit2,
  Trash2,
  Plus,
  X,
  Save,
  Settings2,
  Eye,
  EyeOff,
  ExternalLink,
  ListChecks,
  Calculator,
  DollarSign,
  Megaphone,
  FileText,
  ChevronUp,
  ChevronDown,
  Search,
  CreditCard,
  Receipt,
  Route as RouteIcon,
  ListPlus,
  Check
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { MaintenanceRecord, Address, Client, MaintenanceStatus, RouteConfiguration, RouteType, Technician, UserRole, RouteCostItem, MuralPost, UserProfile, ServiceCall, TravelCard, RouteMonthlyPlanning } from '../types';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ImageUploader } from './ImageUploader';
import TechExpensesView from './TechExpensesView';
import CardSummaryView from './CardSummaryView';
import { cn, matchesTechnician } from '../lib/utils';

interface RouteGroup {
  records: (MaintenanceRecord & { address?: Address, client?: Client })[];
  plannedDate?: string;
  returnDate?: string;
  routeNotes?: string;
  routeColor?: string;
  routeEstimatedCost?: number;
  routeActualCost?: number;
  routeServiceOrdersCount?: number;
  routeServicesValue?: number;
  routeAttachmentUrl?: string;
  routePreventiveCount?: number;
  config: RouteConfiguration;
  status: 'pending' | 'partial' | 'completed';
  routeStatus?: MaintenanceStatus;
  routeCostItems?: RouteCostItem[];
  routeMap1Url?: string;
  routeMap2Url?: string;
  routeCardId?: string;
}

interface RouteCardProps {
  name: string;
  data: RouteGroup;
  colors: { name: string, bg: string, hex: string }[];
  technicians: Technician[];
  onSetColor: (name: string, hex: string) => Promise<void>;
  onSetNotes: (name: string, notes: string) => Promise<void>;
  onSetPlannedDate: (name: string, date: string) => Promise<void>;
  onSetReturnDate: (name: string, date: string) => Promise<void>;
  onSetFinancials: (name: string, updates: Partial<MaintenanceRecord>) => Promise<void>;
  onSetType: (name: string, type: RouteType) => Promise<void>;
  onSetStatus: (name: string, status: MaintenanceStatus) => Promise<void>;
  onSetTechnicians: (name: string, t1?: string, t2?: string) => Promise<void>;
  onEdit: (name: string) => void;
  onDelete: (name: string) => void;
  onOpenAddressSelection: (name: string) => void;
  onOpenCostCalculator: (name: string) => void;
  userRole?: string;
  addressesCount?: number;
}

const RouteCard = ({ 
  name, 
  data, 
  colors, 
  technicians, 
  onSetColor, 
  onSetNotes, 
  onSetPlannedDate, 
  onSetReturnDate, 
  onSetFinancials, 
  onSetType, 
  onSetStatus, 
  onSetTechnicians, 
  onEdit, 
  onDelete, 
  onOpenAddressSelection, 
  onOpenCostCalculator,
  userRole,
  addressesCount = 0
}: RouteCardProps) => {
  const isReadOnly = userRole !== UserRole.ADMIN && userRole !== UserRole.ASSISTANT;
  const [localNotes, setLocalNotes] = useState(data.routeNotes || '');
  const [localPlannedDate, setLocalPlannedDate] = useState(data.plannedDate || '');
  const [localReturnDate, setLocalReturnDate] = useState(data.returnDate || '');
  const [localOrdersCount, setLocalOrdersCount] = useState<number | ''>(data.routeServiceOrdersCount ?? '');
  const [localServicesValue, setLocalServicesValue] = useState<number | ''>(data.routeServicesValue ?? '');
  const [localPreventiveCount, setLocalPreventiveCount] = useState<number | ''>(data.routePreventiveCount ?? '');
  const [localAttachmentUrl, setLocalAttachmentUrl] = useState(data.routeAttachmentUrl || '');

  // Sync with prop changes (e.g. from other users or full reload)
  useEffect(() => {
    setLocalNotes(data.routeNotes || '');
  }, [data.routeNotes]);

  useEffect(() => {
    setLocalPlannedDate(data.plannedDate || '');
  }, [data.plannedDate]);

  useEffect(() => {
    setLocalReturnDate(data.returnDate || '');
  }, [data.returnDate]);

  useEffect(() => {
    setLocalOrdersCount(data.routeServiceOrdersCount ?? '');
  }, [data.routeServiceOrdersCount]);

  useEffect(() => {
    setLocalServicesValue(data.routeServicesValue ?? '');
  }, [data.routeServicesValue]);

  useEffect(() => {
    setLocalPreventiveCount(data.routePreventiveCount ?? '');
  }, [data.routePreventiveCount]);

  useEffect(() => {
    setLocalAttachmentUrl(data.routeAttachmentUrl || '');
  }, [data.routeAttachmentUrl]);

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-2xs hover:shadow-md hover:border-slate-300 transition-all duration-200">
      {/* Seção Superior / Principal */}
      <div className="p-3 sm:p-3.5 space-y-2.5">
        {/* Linha 1: Identificação, Ações, Categorias, Datas e Status */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Lado Esquerdo: Ícone, Nome, Badges, Cores e Categoria */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div 
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs text-white",
                data.routeColor ? "" : (
                  data.status === 'completed' ? "bg-emerald-500" : 
                  data.status === 'partial' ? "bg-amber-500" : "bg-blue-500"
                )
              )} 
              style={data.routeColor ? { backgroundColor: data.routeColor } : {}}
            >
              <MapPin className="w-4 h-4" />
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-tight leading-none">{name}</h3>
                
                <button 
                  onClick={() => onOpenAddressSelection(name)}
                  className={cn(
                    "p-1 rounded-md transition-all flex items-center gap-1",
                    data.config.type === RouteType.TEMPORARY 
                      ? "text-purple-600 hover:text-purple-800 hover:bg-purple-50" 
                      : "text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                  )}
                  style={{ display: isReadOnly ? 'none' : 'inline-flex' }}
                  title={data.config.type === RouteType.TEMPORARY ? "Gerenciar e incluir locais de atendimento na rota temporária" : "Selecionar locais de atendimento"}
                >
                  <ListChecks className={cn("w-3 h-3", data.config.type === RouteType.TEMPORARY ? "text-purple-600" : "text-emerald-600")} />
                  {addressesCount > 0 && (
                    <span className={cn(
                      "text-[10px] font-black rounded-full px-1.5 py-0.2 min-w-[16px] text-center leading-none",
                      data.config.type === RouteType.TEMPORARY ? "bg-purple-100 text-purple-800" : "bg-emerald-100 text-emerald-800"
                    )}>
                      {addressesCount}
                    </span>
                  )}
                </button>

                <button 
                  onClick={() => onEdit(name)} 
                  style={{ display: isReadOnly ? 'none' : 'inline-flex' }}
                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                  title={data.config.type === RouteType.TEMPORARY ? "Editar Rota e Endereços" : "Editar nome da rota"}
                >
                  <Edit2 className="w-3 h-3" />
                </button>

                <button 
                  onClick={() => onDelete(name)} 
                  style={{ display: isReadOnly ? 'none' : 'inline-flex' }}
                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                  title="Remover rota"
                >
                  <Trash2 className="w-3 h-3" />
                </button>

                {/* Seletor de cores discreto */}
                <div className="flex items-center gap-1 ml-1" style={{ display: isReadOnly ? 'none' : 'flex' }}>
                  {colors.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => onSetColor(name, c.hex)}
                      className={cn(
                        "w-2.5 h-2.5 rounded-full transition-all border border-white hover:scale-125",
                        data.routeColor === c.hex ? "ring-2 ring-offset-1 ring-slate-400" : "opacity-40 hover:opacity-100"
                      )}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              {/* Segmented Control de Categoria */}
              <div className="flex bg-slate-100 p-0.5 rounded-lg w-fit mt-1">
                <button
                  onClick={() => onSetType(name, RouteType.VARIABLE)} disabled={isReadOnly}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-extrabold transition-all",
                    data.config.type === RouteType.VARIABLE ? "bg-white text-blue-600 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  Capital
                </button>
                <button
                  onClick={() => onSetType(name, RouteType.FIXED)} disabled={isReadOnly}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-extrabold transition-all",
                    data.config.type === RouteType.FIXED ? "bg-white text-amber-600 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  Viagem
                </button>
                <button
                  onClick={() => onSetType(name, RouteType.TEMPORARY)} disabled={isReadOnly}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-extrabold transition-all",
                    data.config.type === RouteType.TEMPORARY ? "bg-white text-purple-600 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  Temporária
                </button>
              </div>
            </div>
          </div>

          {/* Lado Direito: Técnicos Fixos, Datas e Status */}
          <div className="flex flex-wrap items-center gap-2.5 xl:ml-auto">
            {/* Técnicos Fixos ou da Rota (se Viagem ou Temporária) */}
            {(data.config.type === RouteType.FIXED || data.config.type === RouteType.TEMPORARY) && (
              <div className={cn(
                "flex items-center gap-1 p-1 rounded-lg border",
                data.config.type === RouteType.FIXED 
                  ? "bg-amber-50/60 border-amber-200/70" 
                  : "bg-purple-50/60 border-purple-200/70"
              )}>
                <span className={cn(
                  "text-[8px] font-black uppercase tracking-wider px-1 shrink-0",
                  data.config.type === RouteType.FIXED ? "text-amber-700" : "text-purple-700"
                )}>
                  {data.config.type === RouteType.FIXED ? "Fixos:" : "Téc:"}
                </span>
                <select
                  value={data.config.technician1 || ''} disabled={isReadOnly}
                  onChange={(e) => onSetTechnicians(name, e.target.value, data.config.technician2)}
                  className={cn(
                    "px-1.5 py-0.5 bg-white border rounded text-[11px] font-bold outline-none h-6.5 max-w-[110px]",
                    data.config.type === RouteType.FIXED 
                      ? "border-amber-200 text-amber-900" 
                      : "border-purple-200 text-purple-900"
                  )}
                >
                  <option value="">Técnico 1</option>
                  {technicians.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
                <select
                  value={data.config.technician2 || ''} disabled={isReadOnly}
                  onChange={(e) => onSetTechnicians(name, data.config.technician1, e.target.value)}
                  className={cn(
                    "px-1.5 py-0.5 bg-white border rounded text-[11px] font-bold outline-none h-6.5 max-w-[110px]",
                    data.config.type === RouteType.FIXED 
                      ? "border-amber-200 text-amber-900" 
                      : "border-purple-200 text-purple-900"
                  )}
                >
                  <option value="">Técnico 2</option>
                  {technicians.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
            )}

            {/* Controles de Datas Compactos */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 h-7.5">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Saída:</span>
                <input 
                  type="date"
                  value={localPlannedDate} disabled={isReadOnly}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLocalPlannedDate(val);
                    onSetPlannedDate(name, val);
                  }}
                  className={cn(
                    "text-[11px] font-bold outline-none bg-transparent transition-all cursor-pointer",
                    localPlannedDate ? "text-blue-700 font-extrabold" : "text-slate-400"
                  )}
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 h-7.5">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Retorno:</span>
                <input 
                  type="date"
                  value={localReturnDate} disabled={isReadOnly}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLocalReturnDate(val);
                    onSetReturnDate(name, val);
                  }}
                  className={cn(
                    "text-[11px] font-bold outline-none bg-transparent transition-all cursor-pointer",
                    localReturnDate ? "text-emerald-700 font-extrabold" : "text-slate-400"
                  )}
                />
              </div>
            </div>

            {/* Status do Mês Compacto */}
            <div className="flex items-center gap-1">
              <select 
                value={data.status} disabled={isReadOnly}
                onChange={(e) => onSetStatus(name, e.target.value as MaintenanceStatus)}
                className={cn(
                  "font-black text-[11px] px-2 py-1 rounded-lg border outline-none transition-all cursor-pointer h-7.5",
                  data.status === 'completed' ? "text-emerald-700 bg-emerald-50 border-emerald-200" : 
                  data.status === 'partial' ? "text-amber-700 bg-amber-50 border-amber-200" : 
                  "text-slate-600 bg-slate-50 border-slate-200"
                )}
              >
                <option value={MaintenanceStatus.PENDING}>Pendente</option>
                <option value={MaintenanceStatus.PARTIAL}>Em Andamento</option>
                <option value={MaintenanceStatus.COMPLETED}>Concluída</option>
              </select>
              <span className="text-[11px] font-black text-slate-600 bg-slate-100 border border-slate-200/80 rounded-lg px-2 h-7.5 flex items-center justify-center" title="Endereços concluídos / total">
                {data.records.filter(r => r.status === MaintenanceStatus.COMPLETED).length}/{data.records.length}
              </span>
            </div>
          </div>
        </div>

        {/* Linha 2: Observações da Rota Compacta */}
        <div className="w-full">
          <input 
            type="text"
            placeholder="Observações da rota / viagem (pernoite, prioridades, imprevistos)..."
            value={localNotes} disabled={isReadOnly}
            onChange={(e) => setLocalNotes(e.target.value)}
            onBlur={() => {
              if (localNotes !== data.routeNotes) {
                onSetNotes(name, localNotes);
              }
            }}
            className="w-full px-2.5 py-1 rounded-lg border border-slate-200/80 bg-slate-50/50 text-xs font-medium text-slate-700 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-400 transition-all h-7.5"
          />
        </div>
      </div>

      {/* Seção Inferior: Análise Financeira, Desempenho e Anexo Compactos */}
      <div className="px-3 sm:px-3.5 py-1.5 sm:py-2 bg-slate-50/80 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Previsão Total da Rota */}
          <div className="flex items-center gap-1.5 bg-blue-50/90 border border-blue-200/70 rounded-lg px-2 py-0.5 h-7.5 shadow-2xs">
            <DollarSign className="w-3 h-3 text-blue-600 shrink-0" />
            <span className="text-xs font-black text-blue-700 font-mono">
              {(() => {
                const itemsSum = (data.routeCostItems || []).reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
                const effectiveCost = (data.routeEstimatedCost !== undefined && data.routeEstimatedCost !== null && Number(data.routeEstimatedCost) > 0)
                  ? Number(data.routeEstimatedCost)
                  : itemsSum;
                return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(effectiveCost);
              })()}
            </span>
            <button 
              type="button"
              onClick={() => onOpenCostCalculator(name)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-black h-5.5 px-2 rounded flex items-center gap-1 transition-all shadow-2xs cursor-pointer border-0 ml-0.5"
              title="Planejar ou Ajustar Custos"
            >
              <Calculator className="w-2.5 h-2.5" /> Previsão
            </button>
          </div>

          {/* O.S. (Qtd) */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 h-7.5 shadow-2xs" title="Quantidade de Ordens de Serviço">
            <span className="text-[8px] font-black text-slate-400 uppercase">OS:</span>
            <input 
              type="number"
              value={localOrdersCount === '' ? '' : localOrdersCount} disabled={isReadOnly}
              onChange={(e) => setLocalOrdersCount(e.target.value ? Number(e.target.value) : '')}
              onBlur={() => {
                if (localOrdersCount !== (data.routeServiceOrdersCount ?? '')) {
                  onSetFinancials(name, { routeServiceOrdersCount: localOrdersCount === '' ? undefined : localOrdersCount });
                }
              }}
              placeholder="0"
              className="w-8 text-xs font-black text-slate-700 text-center outline-none bg-transparent"
            />
          </div>

          {/* Preventivas */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 h-7.5 shadow-2xs" title="Quantidade de Preventivas">
            <span className="text-[8px] font-black text-slate-400 uppercase">Prev:</span>
            <input 
              type="number"
              value={localPreventiveCount === '' ? '' : localPreventiveCount} disabled={isReadOnly}
              onChange={(e) => setLocalPreventiveCount(e.target.value ? Number(e.target.value) : '')}
              onBlur={() => {
                if (localPreventiveCount !== (data.routePreventiveCount ?? '')) {
                  onSetFinancials(name, { routePreventiveCount: localPreventiveCount === '' ? undefined : localPreventiveCount });
                }
              }}
              placeholder="0"
              className="w-8 text-xs font-black text-slate-700 text-center outline-none bg-transparent"
            />
          </div>

          {/* Valor O.S. (R$) */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 h-7.5 shadow-2xs" title="Valor Total das O.S.">
            <span className="text-[8px] font-black text-slate-400 uppercase">Total:</span>
            <span className="text-[10px] font-bold text-slate-400">R$</span>
            <input 
              type="number"
              value={localServicesValue === '' ? '' : localServicesValue} disabled={isReadOnly}
              onChange={(e) => setLocalServicesValue(e.target.value ? Number(e.target.value) : '')}
              onBlur={() => {
                if (localServicesValue !== (data.routeServicesValue ?? '')) {
                  onSetFinancials(name, { routeServicesValue: localServicesValue === '' ? undefined : localServicesValue });
                }
              }}
              placeholder="0,00"
              className="w-16 text-xs font-black text-slate-700 text-right outline-none bg-transparent"
            />
          </div>
        </div>

        {/* Anexo Compacto (Imagem / Link) */}
        <div className="flex items-center gap-1.5 ml-auto">
          <ImageUploader 
            value={localAttachmentUrl} 
            onChange={(val) => {
              setLocalAttachmentUrl(val);
              onSetFinancials(name, { routeAttachmentUrl: val });
            }} 
            compact={true}
          />
        </div>
      </div>
    </div>
  );
}

interface RoutePlanningViewProps {
  userRole?: string;
  userProfile?: UserProfile;
}

export default function RoutePlanningView({ userRole, userProfile }: RoutePlanningViewProps) {
  const isReadOnly = userRole !== UserRole.ADMIN && userRole !== UserRole.ASSISTANT;
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [routePlannings, setRoutePlannings] = useState<RouteMonthlyPlanning[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [routeConfigs, setRouteConfigs] = useState<RouteConfiguration[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [serviceCalls, setServiceCalls] = useState<ServiceCall[]>([]);
  const [orderValueMap, setOrderValueMap] = useState<Record<string, string | number>>({});
  const [hideVariableRoutes, setHideVariableRoutes] = useState(false);
  const [selectedTechForSchedule, setSelectedTechForSchedule] = useState<string>('');
  const [activeMainTab, setActiveMainTab] = useState<'planning' | 'expenses' | 'card_summary'>('planning');
  
  const [routeModal, setRouteModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    originalName: string;
    number: string;
    name: string;
    type: RouteType;
    tempAddresses: {
      key: string;
      street: string;
      clientName: string;
      totalMachines?: number;
      recordId?: string;
      addressId?: string;
      isRealAddress?: boolean;
      originalRoute?: string;
      city?: string;
      state?: string;
    }[];
  }>({
    isOpen: false,
    mode: 'create',
    originalName: '',
    number: '',
    name: '',
    type: RouteType.VARIABLE,
    tempAddresses: []
  });

  // Estados para o seletor de inclusão de endereços reais de outras rotas na rota temporária
  const [realAddressSelectorOpen, setRealAddressSelectorOpen] = useState(false);
  const [realAddressSearch, setRealAddressSearch] = useState('');
  const [realAddressFilterRoute, setRealAddressFilterRoute] = useState('ALL');
  const [selectedRealAddressIds, setSelectedRealAddressIds] = useState<string[]>([]);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    routeName: string;
  }>({ isOpen: false, routeName: '' });

  const [addressSelectionModal, setAddressSelectionModal] = useState<{
    isOpen: boolean;
    routeName: string;
  }>({ isOpen: false, routeName: '' });
  const [costCalculatorModal, setCostCalculatorModal] = useState<{
    isOpen: boolean;
    routeName: string;
  }>({ isOpen: false, routeName: '' });
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [showOtherRoutes, setShowOtherRoutes] = useState(false);
  const [addressSearchQuery, setAddressSearchQuery] = useState('');

  useEffect(() => {
    if (!addressSelectionModal.isOpen) {
      setShowOtherRoutes(false);
      setAddressSearchQuery('');
    }
  }, [addressSelectionModal.isOpen]);
  const [routeControlPrintModalOpen, setRouteControlPrintModalOpen] = useState(false);

  const [modalCostItems, setModalCostItems] = useState<RouteCostItem[]>([]);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemValue, setNewItemValue] = useState<string>('');
  const [newItemDate, setNewItemDate] = useState<string>('');
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [travelCards, setTravelCards] = useState<TravelCard[]>([]);

  const [muralPosts, setMuralPosts] = useState<MuralPost[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [muralLoading, setMuralLoading] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [isMuralCollapsed, setIsMuralCollapsed] = useState(false);

  const loadMuralPosts = async () => {
    setMuralLoading(true);
    const posts = await dataService.getMuralPosts(month);
    setMuralPosts(posts);
    setMuralLoading(false);
  };

  useEffect(() => {
    loadMuralPosts();
  }, [month]);

  const handleAddMuralPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim()) return;

    const authorName = userProfile?.name || userProfile?.email?.split('@')[0] || 'Usuário';
    const roleLabel = userRole === 'admin' ? 'Adm' : userRole === 'assistant' ? 'Assistente' : userRole === 'manager' ? 'Gestor' : 'Suporte';

    await dataService.addMuralPost({
      content: newPostContent.trim(),
      createdBy: userProfile?.uid || 'anonymous',
      createdByName: `${authorName} (${roleLabel})`,
      month: month
    });

    setNewPostContent('');
    loadMuralPosts();
  };

  const handleConfirmDeletePost = async (postId: string) => {
    await dataService.deleteMuralPost(postId);
    setDeletingPostId(null);
    loadMuralPosts();
  };

  useEffect(() => {
    loadData();
  }, [month]);

  const loadData = async () => {
    setLoading(true);
    const [r, a, c, rcs, techs, scs, cards, plannings] = await Promise.all([
      dataService.getRecords(month),
      dataService.getAddresses(),
      dataService.getClients(),
      dataService.getRouteConfigs(),
      dataService.getTechnicians(),
      dataService.getServiceCalls(),
      dataService.getTravelCards(),
      dataService.getRoutePlannings(month)
    ]);
    setRecords(r);
    setRoutePlannings(plannings || []);
    setAddresses(a);
    setClients(c);
    setRouteConfigs(rcs);
    setTechnicians(techs);
    setServiceCalls(scs || []);
    setTravelCards(cards || []);
    setLoading(false);
  };

  const routeStats = useMemo(() => {
    const groups: Record<string, RouteGroup> = {};

    // 1. Initialize groups from addresses (ensures existing routes show up even without records)
    addresses.forEach(addr => {
      const routeName = addr.route || 'Sem Rota';
      if (!groups[routeName]) {
        const config = routeConfigs.find(rc => rc.id === routeName);
        groups[routeName] = {
          records: [],
          status: 'pending',
          config: config || {
            id: routeName,
            routeName: routeName,
            type: RouteType.VARIABLE,
            updatedAt: null
          }
        };
      }
    });

    // 2. Fill groups with records
    records.forEach(r => {
      const isTemp = r.isTemporaryRoute;
      const isRealAddress = Boolean(r.addressId && !String(r.addressId).startsWith('TEMP_ADDR_'));
      const realAddr = isRealAddress ? addresses.find(a => a.id === r.addressId) : undefined;
      const realClient = realAddr ? clients.find(c => c.id === realAddr.clientId) : undefined;

      const addr = realAddr || (isTemp ? undefined : addresses.find(a => a.id === r.addressId));
      const client = realClient || (isTemp ? undefined : clients.find(c => c.id === addr?.clientId));
      const routeName = r.assignedRoute || (isTemp ? (r.temporaryRouteName || 'Rota Temp. Indefinida') : (addr?.route || 'Sem Rota'));
      const config = routeConfigs.find(rc => rc.id === routeName);

      if (!groups[routeName]) {
        groups[routeName] = { 
          records: [], 
          status: 'pending',
          config: config || {
            id: routeName,
            routeName: routeName,
            type: isTemp ? RouteType.TEMPORARY : RouteType.VARIABLE,
            updatedAt: null
          }
        };
      }

      const pseudoAddr = realAddr
        ? { ...realAddr, route: routeName }
        : (isTemp 
            ? { id: r.addressId, street: r.temporaryStreet || 'Endereço Indefinido', clientId: 'TEMP', route: routeName, totalMachines: r.temporaryMachines || 0, clientName: r.temporaryClient } as Address 
            : (addr ? { ...addr, route: routeName } : undefined));
      const pseudoClient = realClient
        ? realClient
        : (isTemp && r.temporaryClient ? { id: 'TEMP', name: r.temporaryClient } as Client : client);

      // Garante que cada endereço é estritamente único dentro da rota
      const existingInGroup = groups[routeName].records.find(existingR => 
        isRealAddress
          ? (existingR.addressId && existingR.addressId === r.addressId)
          : (isTemp
              ? (existingR.temporaryStreet === r.temporaryStreet && existingR.temporaryClient === r.temporaryClient)
              : (existingR.addressId && existingR.addressId === r.addressId))
      );

      if (existingInGroup) {
        if (r.status === MaintenanceStatus.COMPLETED) existingInGroup.status = r.status;
      } else {
        groups[routeName].records.push({ ...r, address: pseudoAddr, client: pseudoClient });
      }
      
      if (r.plannedDate && !groups[routeName].plannedDate) {
        groups[routeName].plannedDate = r.plannedDate;
      }
      if (r.returnDate && !groups[routeName].returnDate) {
        groups[routeName].returnDate = r.returnDate;
      }
      if (r.routeNotes && !groups[routeName].routeNotes) {
        groups[routeName].routeNotes = r.routeNotes;
      }
      if (r.routeColor && !groups[routeName].routeColor) {
        groups[routeName].routeColor = r.routeColor;
      }
      if (r.routeStatus && !groups[routeName].routeStatus) {
        groups[routeName].routeStatus = r.routeStatus;
      }
      if (r.routeEstimatedCost !== undefined && groups[routeName].routeEstimatedCost === undefined) {
        groups[routeName].routeEstimatedCost = r.routeEstimatedCost;
      }
      if (r.routeActualCost !== undefined && groups[routeName].routeActualCost === undefined) {
        groups[routeName].routeActualCost = r.routeActualCost;
      }
      if (r.routeServiceOrdersCount !== undefined && groups[routeName].routeServiceOrdersCount === undefined) {
        groups[routeName].routeServiceOrdersCount = r.routeServiceOrdersCount;
      }
      if (r.routeServicesValue !== undefined && groups[routeName].routeServicesValue === undefined) {
        groups[routeName].routeServicesValue = r.routeServicesValue;
      }
      if (r.routePreventiveCount !== undefined && groups[routeName].routePreventiveCount === undefined) {
        groups[routeName].routePreventiveCount = r.routePreventiveCount;
      }
      if (r.routeAttachmentUrl && !groups[routeName].routeAttachmentUrl) {
        groups[routeName].routeAttachmentUrl = r.routeAttachmentUrl;
      }
      if (r.routeMap1Url && !groups[routeName].routeMap1Url) {
        groups[routeName].routeMap1Url = r.routeMap1Url;
      }
      if (r.routeMap2Url && !groups[routeName].routeMap2Url) {
        groups[routeName].routeMap2Url = r.routeMap2Url;
      }
      if (r.routeCardId !== undefined && groups[routeName].routeCardId === undefined) {
        groups[routeName].routeCardId = r.routeCardId;
      }
      if (r.routeCostItems !== undefined && groups[routeName].routeCostItems === undefined) {
        groups[routeName].routeCostItems = r.routeCostItems;
      }
    });

    // 2b. Apply route monthly planning overrides (from routePlannings)
    // Pre-calculate valid route names to ignore ghost plannings from deleted routes
    const validNames = new Set<string>();
    routeConfigs.forEach(c => {
      if (c.id) validNames.add(c.id);
      if (c.routeName) validNames.add(c.routeName);
    });
    records.forEach(r => {
      if (r.assignedRoute) validNames.add(r.assignedRoute);
      if (r.temporaryRouteName) validNames.add(r.temporaryRouteName);
    });
    addresses.forEach(a => {
      if (a.route) validNames.add(a.route);
    });

    routePlannings.forEach(p => {
      const rawRouteName = p.routeName || '';
      if (!rawRouteName.trim()) return;

      // Find matching route name (exact or case-insensitive)
      let routeName = rawRouteName;
      if (!validNames.has(routeName)) {
        const found = Array.from(validNames).find(vn => vn.trim().toLowerCase() === rawRouteName.trim().toLowerCase());
        if (found) {
          routeName = found;
        } else {
          // If the user configured costs or planning for this route, keep it visible!
          validNames.add(routeName);
        }
      }

      if (!groups[routeName]) {
        const config = routeConfigs.find(rc => rc.id === routeName || rc.routeName === routeName);
        groups[routeName] = {
          records: [],
          status: 'pending',
          config: config || {
            id: routeName,
            routeName: routeName,
            type: RouteType.VARIABLE,
            updatedAt: null
          }
        };
      }
      const g = groups[routeName];
      if (p.plannedDate !== undefined && p.plannedDate !== null) g.plannedDate = p.plannedDate;
      if (p.returnDate !== undefined && p.returnDate !== null) g.returnDate = p.returnDate;
      if (p.routeNotes !== undefined && p.routeNotes !== null) g.routeNotes = p.routeNotes;
      if (p.routeColor !== undefined && p.routeColor !== null) g.routeColor = p.routeColor;
      if (p.routeStatus !== undefined && p.routeStatus !== null) g.routeStatus = p.routeStatus;
      if (p.routeActualCost !== undefined && p.routeActualCost !== null) g.routeActualCost = p.routeActualCost;
      if (p.routeServiceOrdersCount !== undefined && p.routeServiceOrdersCount !== null) g.routeServiceOrdersCount = p.routeServiceOrdersCount;
      if (p.routeServicesValue !== undefined && p.routeServicesValue !== null) g.routeServicesValue = p.routeServicesValue;
      if (p.routePreventiveCount !== undefined && p.routePreventiveCount !== null) g.routePreventiveCount = p.routePreventiveCount;
      if (p.routeAttachmentUrl !== undefined && p.routeAttachmentUrl !== null) g.routeAttachmentUrl = p.routeAttachmentUrl;
      if (p.routeMap1Url !== undefined && p.routeMap1Url !== null) g.routeMap1Url = p.routeMap1Url;
      if (p.routeMap2Url !== undefined && p.routeMap2Url !== null) g.routeMap2Url = p.routeMap2Url;
      if (p.routeCostItems !== undefined && p.routeCostItems !== null) g.routeCostItems = p.routeCostItems;
      if (p.routeCardId !== undefined && p.routeCardId !== null) g.routeCardId = p.routeCardId;
      
      const pItemsSum = (g.routeCostItems || []).reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
      if (p.routeEstimatedCost !== undefined && p.routeEstimatedCost !== null && Number(p.routeEstimatedCost) > 0) {
        g.routeEstimatedCost = Number(p.routeEstimatedCost);
      } else if (pItemsSum > 0) {
        g.routeEstimatedCost = pItemsSum;
      } else if (p.routeEstimatedCost !== undefined && p.routeEstimatedCost !== null) {
        g.routeEstimatedCost = Number(p.routeEstimatedCost);
      }
    });

    Object.keys(groups).forEach(name => {
      const g = groups[name];

      // Sort records within the route by client name, then by street
      g.records.sort((a, b) => {
        const clientA = a.client?.name || '';
        const clientB = b.client?.name || '';
        if (clientA && clientB) {
          const comp = clientA.localeCompare(clientB, 'pt-BR');
          if (comp !== 0) return comp;
        } else if (!clientA && clientB) {
          return 1;
        } else if (clientA && !clientB) {
          return -1;
        }
        
        const streetA = a.address?.street || '';
        const streetB = b.address?.street || '';
        return streetA.localeCompare(streetB, 'pt-BR');
      });

      if (g.records.length === 0) {
        g.status = 'pending';
        return;
      }
      if (g.routeStatus) {
        g.status = g.routeStatus as any;
      } else {
        const allDone = g.records.every(r => r.status === MaintenanceStatus.COMPLETED);
        const someDone = g.records.some(r => r.status !== MaintenanceStatus.PENDING);
        
        if (allDone) g.status = 'completed';
        else if (someDone) g.status = 'partial';
        else g.status = 'pending';
      }
    });

    return groups;
  }, [records, addresses, clients, routeConfigs, routePlannings]);

  const displayRoutes = useMemo(() => {
    return (Object.entries(routeStats) as [string, RouteGroup][])
      .filter(([_, data]) => {
        if (hideVariableRoutes && data.config.type === RouteType.VARIABLE) return false;
        // REGRA MANDATÓRIA: Rota temporária é EXCLUSIVA do mês em que foi criada e possui registros.
        // Ao mudar de mês ou se não houver registros, ela não se replica nem aparece em outros meses!
        if (data.config.type === RouteType.TEMPORARY && data.records.length === 0) return false;
        return true;
      })
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [routeStats, hideVariableRoutes]);

  const sortedAddresses = useMemo(() => {
    if (!addressSelectionModal.isOpen) return [];
    
    const currentRouteName = addressSelectionModal.routeName;
    
    // Obter IDs de endereços de outras rotas já vinculados a esta rota para este mês
    const assignedAddressIds = new Set(
      records
        .filter(r => r.month === month && r.assignedRoute === currentRouteName)
        .map(r => r.addressId)
    );
    
    let baseAddresses = addresses;
    if (!showOtherRoutes) {
      baseAddresses = addresses.filter(a => 
        (a.route || 'Sem Rota') === currentRouteName || 
        assignedAddressIds.has(a.id)
      );
    } else {
      // Quando "Incluir outras rotas" está ativo, ocultamos endereços cujas rotas originais sejam "Capital" (RouteType.VARIABLE)
      baseAddresses = addresses.filter(a => {
        const belongsToCurrent = (a.route || 'Sem Rota') === currentRouteName || assignedAddressIds.has(a.id);
        if (belongsToCurrent) return true;
        
        if (a.route) {
          const config = routeConfigs.find(c => c.id === a.route || c.routeName === a.route);
          if (config && config.type === RouteType.VARIABLE) {
            return false;
          }
        }
        return true;
      });
    }
    
    // Aplicar a barra de busca por texto se preenchida
    if (addressSearchQuery.trim()) {
      const query = addressSearchQuery.toLowerCase();
      baseAddresses = baseAddresses.filter(a => {
        const client = clients.find(c => c.id === a.clientId);
        return (
          a.street?.toLowerCase().includes(query) ||
          a.city?.toLowerCase().includes(query) ||
          a.state?.toLowerCase().includes(query) ||
          a.neighborhood?.toLowerCase().includes(query) ||
          client?.name?.toLowerCase().includes(query) ||
          (a.route || 'Sem Rota').toLowerCase().includes(query)
        );
      });
    }
    
    return [...baseAddresses].sort((a, b) => {
      const recA = records.find(r => 
        r.addressId === a.id && 
        r.month === month && 
        (r.assignedRoute || (r.isTemporaryRoute ? r.temporaryRouteName : (a.route || 'Sem Rota'))) === currentRouteName
      );
      const recB = records.find(r => 
        r.addressId === b.id && 
        r.month === month && 
        (r.assignedRoute || (r.isTemporaryRoute ? r.temporaryRouteName : (b.route || 'Sem Rota'))) === currentRouteName
      );
      
      const isIncA = !!recA;
      const isIncB = !!recB;
      
      // Included addresses always come before non-included
      if (isIncA !== isIncB) {
        return isIncA ? -1 : 1;
      }
      
      if (isIncA && isIncB) {
        // If both are included, sort by itineraryOrder
        const orderA = recA?.itineraryOrder !== undefined && recA?.itineraryOrder !== null ? recA.itineraryOrder : 999999;
        const orderB = recB?.itineraryOrder !== undefined && recB?.itineraryOrder !== null ? recB.itineraryOrder : 999999;
        
        if (orderA !== orderB) {
          return orderA - orderB;
        }
      }
      
      // Fallback: sort by Client Name
      const clientA = clients.find(c => c.id === a.clientId)?.name || '';
      const clientB = clients.find(c => c.id === b.clientId)?.name || '';
      return clientA.localeCompare(clientB, 'pt-BR');
    });
  }, [addresses, addressSelectionModal.isOpen, addressSelectionModal.routeName, records, month, clients, showOtherRoutes, addressSearchQuery, routeConfigs]);

  // Validação em tempo real de ID/Número único exclusivo para rotas
  const routeNumberConflict = useMemo(() => {
    if (!routeModal.isOpen || !routeModal.number.trim()) return null;
    const cleanInput = routeModal.number.trim().toUpperCase().replace(/^ROTA\s*/i, '');
    if (!cleanInput) return null;

    // Agregar todas as rotas conhecidas (configs, addresses, routeStats)
    const allRoutes = new Map<string, RouteConfiguration | undefined>();
    routeConfigs.forEach(c => allRoutes.set(c.id, c));
    addresses.forEach(a => {
      if (a.route && !allRoutes.has(a.route)) {
        allRoutes.set(a.route, undefined);
      }
    });
    Object.keys(routeStats).forEach(rName => {
      if (!allRoutes.has(rName)) {
        allRoutes.set(rName, routeStats[rName]?.config);
      }
    });

    for (const [rName, config] of allRoutes.entries()) {
      if (routeModal.mode === 'edit' && (rName === routeModal.originalName || config?.id === routeModal.originalName)) {
        continue;
      }

      let existingNum = '';
      if (config?.routeNumber && config.routeNumber.trim()) {
        existingNum = config.routeNumber.trim().toUpperCase().replace(/^ROTA\s*/i, '');
      } else if (rName.includes('-')) {
        existingNum = rName.split('-')[0].trim().toUpperCase().replace(/^ROTA\s*/i, '');
      } else {
        const match = rName.match(/^(?:ROTA\s*)?([0-9A-Za-z]+)/i);
        existingNum = match ? match[1].trim().toUpperCase() : rName.trim().toUpperCase();
      }

      if (!existingNum) continue;

      const isExact = existingNum === cleanInput;
      const isNum = !isNaN(Number(existingNum)) && !isNaN(Number(cleanInput)) && Number(existingNum) === Number(cleanInput);

      if (isExact || isNum) {
        return {
          conflictingNumber: routeModal.number.trim(),
          conflictingRouteName: rName
        };
      }
    }

    return null;
  }, [routeModal.isOpen, routeModal.number, routeModal.mode, routeModal.originalName, routeConfigs, addresses, routeStats]);

  // Endereços reais elegíveis para inclusão na rota temporária
  // REGRA ESTRITA: SÓ PODE INCLUIR ENDEREÇOS QUE AINDA NÃO FORAM CONCLUÍDOS NO MÊS ATUAL!
  const eligibleRealAddresses = useMemo(() => {
    if (!routeModal.isOpen || routeModal.type !== RouteType.TEMPORARY) return [];

    const alreadyIncludedIds = new Set(
      routeModal.tempAddresses.filter(a => a.addressId).map(a => a.addressId!)
    );

    return addresses.filter(addr => {
      // Ignora os já incluídos na lista do modal
      if (alreadyIncludedIds.has(addr.id)) return false;

      // Ignora inativos
      if (addr.status === 'inactive' || addr.active === false || addr.isInactive === true) return false;

      // REGRA OBRIGATÓRIA: Verificar se o endereço já foi concluído neste mês
      const recordThisMonth = records.find(r => r.addressId === addr.id && r.month === month);
      if (recordThisMonth && recordThisMonth.status === MaintenanceStatus.COMPLETED) {
        return false; // NÃO pode ser incluído se já estiver concluído!
      }

      // Filtro de busca por texto
      if (realAddressSearch.trim()) {
        const q = realAddressSearch.toLowerCase();
        const client = clients.find(c => c.id === addr.clientId);
        const matchClient = client?.name?.toLowerCase().includes(q);
        const matchStreet = addr.street?.toLowerCase().includes(q);
        const matchNeighborhood = addr.neighborhood?.toLowerCase().includes(q);
        const matchCity = addr.city?.toLowerCase().includes(q);
        const matchRoute = (addr.route || 'Sem Rota').toLowerCase().includes(q);
        if (!matchClient && !matchStreet && !matchNeighborhood && !matchCity && !matchRoute) {
          return false;
        }
      }

      // Filtro por Rota de Origem
      if (realAddressFilterRoute !== 'ALL') {
        if ((addr.route || 'Sem Rota') !== realAddressFilterRoute) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const clientA = clients.find(c => c.id === a.clientId)?.name || '';
      const clientB = clients.find(c => c.id === b.clientId)?.name || '';
      return clientA.localeCompare(clientB, 'pt-BR');
    });
  }, [addresses, records, month, clients, routeModal.isOpen, routeModal.type, routeModal.tempAddresses, realAddressSearch, realAddressFilterRoute]);

  const handleConfirmAddRealAddresses = () => {
    if (selectedRealAddressIds.length === 0) return;

    const newTempAddresses = [...routeModal.tempAddresses];

    selectedRealAddressIds.forEach(addrId => {
      const addrObj = addresses.find(a => a.id === addrId);
      if (!addrObj) return;

      const clientObj = clients.find(c => c.id === addrObj.clientId);
      const existingRecord = records.find(r => r.addressId === addrId && r.month === month);

      newTempAddresses.push({
        key: `real_${addrId}_${Math.random().toString(36).substr(2, 6)}`,
        addressId: addrId,
        isRealAddress: true,
        originalRoute: addrObj.route || 'Sem Rota',
        clientName: clientObj?.name || 'Cliente',
        street: `${addrObj.street || ''}${addrObj.number ? ', ' + addrObj.number : ''}${addrObj.neighborhood ? ' - ' + addrObj.neighborhood : ''}`,
        totalMachines: addrObj.totalMachines || 0,
        city: addrObj.city,
        state: addrObj.state,
        recordId: existingRecord?.id
      });
    });

    setRouteModal(prev => ({
      ...prev,
      tempAddresses: newTempAddresses
    }));

    setSelectedRealAddressIds([]);
    setRealAddressSelectorOpen(false);
    setRealAddressSearch('');
  };

  const financialSummary = useMemo(() => {
    let totalEstimated = 0;
    let totalServicesValue = 0;
    let totalCompletedCosts = 0;
    let routesWithCostCount = 0;
    let completedRoutesCount = 0;
    const activeRouteCosts: { name: string; cost: number; color?: string }[] = [];

    displayRoutes.forEach(([name, data]) => {
      const itemsSum = (data.routeCostItems || []).reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
      const cost = (data.routeEstimatedCost !== undefined && data.routeEstimatedCost !== null && Number(data.routeEstimatedCost) > 0)
        ? Number(data.routeEstimatedCost)
        : itemsSum;
      const servicesVal = data.routeServicesValue || 0;
      totalEstimated += cost;
      totalServicesValue += servicesVal;
      if (data.status === 'completed') {
        totalCompletedCosts += cost;
        completedRoutesCount++;
      }
      if (cost > 0) {
        routesWithCostCount++;
        activeRouteCosts.push({
          name,
          cost,
          color: data.routeColor
        });
      }
    });

    return {
      totalEstimated,
      totalServicesValue,
      totalCompletedCosts,
      routesCount: displayRoutes.length,
      routesWithCostCount,
      completedRoutesCount,
      activeRouteCosts
    };
  }, [displayRoutes]);

  const printControlRoutes = useMemo(() => {
    return (Object.entries(routeStats) as [string, RouteGroup][])
      .filter(([_, data]) => data.config.type !== RouteType.VARIABLE)
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [routeStats]);

  const printControlFinancialSummary = useMemo(() => {
    let totalEstimated = 0;
    let totalServicesValue = 0;
    let totalCompletedCosts = 0;
    let routesWithCostCount = 0;
    let completedRoutesCount = 0;
    let totalServiceOrders = 0;
    const activeRouteCosts: { name: string; cost: number; color?: string }[] = [];

    printControlRoutes.forEach(([name, data]) => {
      const itemsSum = (data.routeCostItems || []).reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
      const cost = (data.routeEstimatedCost !== undefined && data.routeEstimatedCost !== null && Number(data.routeEstimatedCost) > 0)
        ? Number(data.routeEstimatedCost)
        : itemsSum;
      const servicesVal = data.routeServicesValue || 0;
      totalEstimated += cost;
      totalServicesValue += servicesVal;
      totalServiceOrders += data.routeServiceOrdersCount || 0;
      if (data.status === 'completed') {
        totalCompletedCosts += cost;
        completedRoutesCount++;
      }
      if (cost > 0) {
        routesWithCostCount++;
        activeRouteCosts.push({
          name,
          cost,
          color: data.routeColor
        });
      }
    });

    return {
      totalEstimated,
      totalServicesValue,
      totalCompletedCosts,
      routesCount: printControlRoutes.length,
      routesWithCostCount,
      completedRoutesCount,
      totalServiceOrders,
      activeRouteCosts
    };
  }, [printControlRoutes]);

  // Derive active route data for Cost Calculator Modal
  const activeRouteNameForCalculator = costCalculatorModal.routeName;
  const activeRouteDataForCalculator = activeRouteNameForCalculator ? routeStats[activeRouteNameForCalculator] : null;

  const formattedDeparture = activeRouteDataForCalculator?.plannedDate 
    ? format(parseISO(activeRouteDataForCalculator.plannedDate), 'dd/MM/yyyy') 
    : 'Não definida';
  const formattedReturn = activeRouteDataForCalculator?.returnDate 
    ? format(parseISO(activeRouteDataForCalculator.returnDate), 'dd/MM/yyyy') 
    : 'Não definida';

  let durationText = '';
  if (activeRouteDataForCalculator?.plannedDate && activeRouteDataForCalculator?.returnDate) {
    try {
      const start = parseISO(activeRouteDataForCalculator.plannedDate);
      const end = parseISO(activeRouteDataForCalculator.returnDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      durationText = `${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}`;
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (costCalculatorModal.isOpen && activeRouteNameForCalculator && routeStats[activeRouteNameForCalculator]) {
      const activeRoute = routeStats[activeRouteNameForCalculator];
      const existingItems = activeRoute.routeCostItems || [];
      setModalCostItems(existingItems);
      setNewItemDate(activeRoute.plannedDate || '');
      setSelectedCardId(activeRoute.routeCardId || (travelCards.length > 0 ? travelCards[0].id : ''));
    } else {
      setModalCostItems([]);
      setNewItemDate('');
      setSelectedCardId('');
    }
    setNewItemDesc('');
    setNewItemValue('');
  }, [costCalculatorModal.isOpen, activeRouteNameForCalculator, routeStats]);

  const handleAddCostItem = () => {
    const plannedDate = activeRouteDataForCalculator?.plannedDate;
    const returnDate = activeRouteDataForCalculator?.returnDate;

    if (!plannedDate || !returnDate) {
      alert('⚠️ Atenção: Por favor, defina as datas de "Saída" e "Retorno" da rota antes de registrar uma nova previsão de custos.');
      return;
    }

    if (!newItemDate) {
      alert('Por favor, selecione uma data para a despesa.');
      return;
    }

    if (newItemDate < plannedDate || newItemDate > returnDate) {
      const formattedStart = format(parseISO(plannedDate), 'dd/MM/yyyy');
      const formattedEnd = format(parseISO(returnDate), 'dd/MM/yyyy');
      alert(`⚠️ A data selecionada (${format(parseISO(newItemDate), 'dd/MM/yyyy')}) está fora do período planejado para a viagem (${formattedStart} a ${formattedEnd}).`);
      return;
    }

    if (!newItemDesc.trim()) {
      alert('Por favor, digite uma descrição para a despesa.');
      return;
    }

    const valStr = newItemValue.replace(',', '.');
    const parsedVal = parseFloat(valStr);
    if (isNaN(parsedVal) || parsedVal <= 0) {
      alert('Por favor, insira um valor numérico válido.');
      return;
    }

    const item: RouteCostItem = {
      id: Date.now().toString(),
      description: newItemDesc.trim(),
      value: parsedVal,
      date: newItemDate
    };

    setModalCostItems(prev => {
      const updated = [...prev, item];
      return updated.sort((a, b) => {
        const da = a.date || '';
        const db = b.date || '';
        return da.localeCompare(db);
      });
    });

    setNewItemDesc('');
    setNewItemValue('');
  };

  const handleRemoveCostItem = (itemId: string) => {
    setModalCostItems(prev => prev.filter(item => item.id !== itemId));
  };

  const updateRouteRecords = async (routeName: string, overrides: Partial<MaintenanceRecord>) => {
    // Salvar no planejamento mensal da rota para garantir persistência mesmo com 0 locais vinculados
    const planningUpdate = {
      month,
      routeName,
      ...overrides
    };
    await dataService.upsertRoutePlanning(planningUpdate as any);

    // Atualização otimista do estado local de planejamentos
    setRoutePlannings(prev => {
      const exists = prev.some(p => p.month === month && p.routeName === routeName);
      if (exists) {
        return prev.map(p => (p.month === month && p.routeName === routeName) ? { ...p, ...overrides } : p);
      } else {
        return [...prev, { id: `${month}_${routeName}`, month, routeName, ...overrides } as RouteMonthlyPlanning];
      }
    });

    const routeRecords = routeStats[routeName]?.records || [];

    if (routeRecords.length > 0) {
      const promises = routeRecords.map(r => {
        const { address, client, ...pureRecord } = r;
        return dataService.upsertRecord({ ...pureRecord, ...overrides } as any);
      });
      await Promise.all(promises);
      
      setRecords(prev => prev.map(r => {
        const isMatched = (r.assignedRoute === routeName || (r.isTemporaryRoute 
          ? (r.temporaryRouteName === routeName)
          : (addresses.find(a => a.id === r.addressId)?.route === routeName))) && r.month === month;
        if (isMatched) {
          return { ...r, ...overrides };
        }
        return r;
      }));
    }
  };

  const handleSetPlannedDate = async (routeName: string, date: string) => updateRouteRecords(routeName, { plannedDate: date });
  const handleSetReturnDate = async (routeName: string, date: string) => updateRouteRecords(routeName, { returnDate: date });
  const handleSetRouteNotes = async (routeName: string, notes: string) => updateRouteRecords(routeName, { routeNotes: notes });
  const handleSetRouteFinancials = async (routeName: string, updates: Partial<MaintenanceRecord>) => {
    // Convert undefined to null so Firestore cleans up the field when the user erases it
    const cleanUpdates = { ...updates } as any;
    Object.keys(cleanUpdates).forEach(k => {
      if (cleanUpdates[k] === undefined) cleanUpdates[k] = null;
    });
    updateRouteRecords(routeName, cleanUpdates);
  };
  const handleSetRouteStatus = async (routeName: string, status: MaintenanceStatus) => updateRouteRecords(routeName, { routeStatus: status });
  const handleSetRouteColor = async (routeName: string, color: string) => updateRouteRecords(routeName, { routeColor: color });

  const handleSetRouteType = async (routeName: string, type: RouteType) => {
    const existingConfig = routeConfigs.find(rc => rc.id === routeName);
    const newConfig: RouteConfiguration = {
      id: routeName,
      routeName,
      type,
      technician1: existingConfig?.technician1,
      technician2: existingConfig?.technician2,
      updatedAt: null
    };
    await dataService.upsertRouteConfig(newConfig);
    setRouteConfigs(prev => {
      const other = prev.filter(p => p.id !== routeName);
      return [...other, newConfig];
    });
  };

  const handleSetRouteTechnicians = async (routeName: string, t1?: string, t2?: string) => {
    const existingConfig = routeConfigs.find(rc => rc.id === routeName);
    const newConfig: RouteConfiguration = {
      id: routeName,
      routeName,
      type: existingConfig?.type || RouteType.VARIABLE,
      technician1: t1,
      technician2: t2,
      updatedAt: null
    };
    await dataService.upsertRouteConfig(newConfig);
    setRouteConfigs(prev => {
      const other = prev.filter(p => p.id !== routeName);
      return [...other, newConfig];
    });

    // If it's fixed or temporary, sync to the records of the month
    if (newConfig.type === RouteType.FIXED || newConfig.type === RouteType.TEMPORARY) {
      await dataService.syncRouteTechnicians(month, routeName, t1, t2);
      // Refresh local records
      const updatedRecords = await dataService.getRecords(month);
      setRecords(updatedRecords);
    }
  };

  const handleSaveRoute = async () => {
    if (!routeModal.name.trim() || !routeModal.number.trim()) {
      alert("Por favor, preencha o número e o nome da rota.");
      return;
    }

    if (routeNumberConflict) {
      alert(`Bloqueio de Criação: O número de rota "${routeModal.number}" já está cadastrado no sistema (Rota: "${routeNumberConflict.conflictingRouteName}").\n\nCada rota precisa ter um número exclusivo (ID único). Escolha outro número.`);
      return;
    }

    // Validação de segurança no banco de dados
    const checkDb = await dataService.checkRouteNumberExists(
      routeModal.number.trim(), 
      routeModal.mode === 'edit' ? routeModal.originalName : undefined
    );
    if (checkDb.exists) {
      alert(`Bloqueio de Criação: Já existe uma rota cadastrada no banco de dados com o número "${routeModal.number}" (Rota: "${checkDb.existingRouteName}").\n\nCada rota precisa ter um número exclusivo (ID único). Escolha outro número.`);
      return;
    }

    const fullRouteName = `${routeModal.number.trim()} - ${routeModal.name.trim()}`;

    setLoading(true);
    try {
      if (routeModal.mode === 'create') {
        const config: RouteConfiguration = {
          id: fullRouteName,
          routeNumber: routeModal.number.trim(),
          routeName: routeModal.name.trim(),
          type: routeModal.type,
          updatedAt: null
        };
        await dataService.upsertRouteConfig(config);
      } else {
        // Edit mode (Rename)
        if (fullRouteName !== routeModal.originalName) {
          await dataService.renameRoute(routeModal.originalName, fullRouteName, routeModal.name.trim());
        }
        
        // Update type regardless of rename
        const config = routeConfigs.find(c => c.id === fullRouteName) || {
          id: fullRouteName,
          routeNumber: routeModal.number.trim(),
          routeName: routeModal.name.trim(),
          type: routeModal.type,
          updatedAt: null
        };
        await dataService.upsertRouteConfig({ ...config, type: routeModal.type });
      }
      
      if (routeModal.type === RouteType.TEMPORARY) {
        const routeName = fullRouteName;
        const currentRecords = (routeModal.originalName ? routeStats[routeModal.originalName]?.records : []) || [];
        
        // 1. Identificar registros que foram REMOVIDOS da rota temporária
        const idsToKeep = new Set(routeModal.tempAddresses.filter(a => a.recordId).map(a => a.recordId));
        const addressIdsToKeep = new Set(routeModal.tempAddresses.filter(a => a.addressId).map(a => a.addressId));

        const recordsToRemove = currentRecords.filter(r => {
          if (r.id && idsToKeep.has(r.id)) return false;
          if (r.addressId && addressIdsToKeep.has(r.addressId)) return false;
          return true;
        });

        for (const r of recordsToRemove) {
          const isRealAddress = Boolean(r.addressId && !String(r.addressId).startsWith('TEMP_ADDR_'));
          if (isRealAddress) {
            // Endereço REAL de outra rota: Volta para a rota original dele!
            // Não excluímos o MaintenanceRecord do mês; apenas desatribuímos assignedRoute e temporaryRouteName
            await dataService.upsertRecord({
              id: r.id,
              month,
              addressId: r.addressId,
              assignedRoute: null,
              temporaryRouteName: null,
              isTemporaryRoute: false,
              originalRoute: null,
              plannedDate: null,
              returnDate: null,
            } as any);
          } else if (r.id) {
            // Endereço manual avulso: pode excluir
            await dataService.deleteRecord(r.id);
          }
        }

        // 2. Base fields da rota para aplicar aos records (datas, cores, notas, custos)
        const baseRecordFields = currentRecords[0] ? {
            plannedDate: currentRecords[0].plannedDate,
            returnDate: currentRecords[0].returnDate,
            routeColor: currentRecords[0].routeColor,
            routeNotes: currentRecords[0].routeNotes,
            routeEstimatedCost: currentRecords[0].routeEstimatedCost,
            routeActualCost: currentRecords[0].routeActualCost,
            routeServiceOrdersCount: currentRecords[0].routeServiceOrdersCount,
            routeServicesValue: currentRecords[0].routeServicesValue,
            routePreventiveCount: currentRecords[0].routePreventiveCount,
            routeAttachmentUrl: currentRecords[0].routeAttachmentUrl,
            routeCostItems: currentRecords[0].routeCostItems,
            routeMap1Url: currentRecords[0].routeMap1Url,
            routeMap2Url: currentRecords[0].routeMap2Url,
        } : {};

        // 3. Upsert dos endereços mantidos ou adicionados
        const promises = routeModal.tempAddresses.map(async (addr) => {
           if (addr.isRealAddress && addr.addressId) {
              // Endereço REAL transferido de outra rota para a rota temporária no mês atual!
              const existingRecord = records.find(r => r.addressId === addr.addressId && r.month === month);
              const realAddrObj = addresses.find(a => a.id === addr.addressId);
              const originalRoute = addr.originalRoute || realAddrObj?.route || 'Sem Rota';

              const record: Partial<MaintenanceRecord> = {
                ...(existingRecord || {}),
                id: existingRecord?.id || `${month}_${addr.addressId}`,
                month,
                addressId: addr.addressId,
                scheduledWeek: existingRecord?.scheduledWeek || 1,
                status: existingRecord?.status || MaintenanceStatus.PENDING,
                // Sai da rota original e fica registrado na rota temporária no mês atual:
                assignedRoute: routeName,
                temporaryRouteName: routeName,
                isTemporaryRoute: true,
                originalRoute: originalRoute,
                temporaryClient: addr.clientName.trim(),
                temporaryStreet: addr.street.trim(),
                temporaryMachines: addr.totalMachines || realAddrObj?.totalMachines || 0,
                ...baseRecordFields,
              };
              return dataService.upsertRecord(record as MaintenanceRecord);
           } else if (addr.street.trim() || addr.clientName.trim()) {
              // Endereço Manual / Avulso
              const record: Partial<MaintenanceRecord> = {
                month,
                addressId: addr.addressId || `TEMP_ADDR_${Math.random().toString(36).substr(2, 9)}`,
                scheduledWeek: 1,
                status: MaintenanceStatus.PENDING,
                isTemporaryRoute: true,
                temporaryRouteName: routeName,
                temporaryClient: addr.clientName.trim(),
                temporaryStreet: addr.street.trim(),
                temporaryMachines: addr.totalMachines || 0,
                ...baseRecordFields,
              };
              if (addr.recordId) {
                record.id = addr.recordId;
                const existing = currentRecords.find(r => r.id === addr.recordId);
                if (existing) record.addressId = existing.addressId;
              }
              return dataService.upsertRecord(record as MaintenanceRecord);
           }
        });
        await Promise.all(promises);
      }
      
      await loadData();
      setRouteModal(prev => ({ ...prev, isOpen: false }));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoute = async () => {
    setLoading(true);
    try {
      await dataService.deleteRoute(deleteConfirm.routeName);
      await loadData();
      setDeleteConfirm({ isOpen: false, routeName: '' });
    } catch (error: any) {
      console.error(error);
      alert(`Erro ao excluir rota: ${error?.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAddressInRoute = async (routeName: string, addressId: string, isIncluded: boolean) => {
    try {
      if (isIncluded) {
        const config = routeConfigs.find(c => c.id === routeName && (c.type === RouteType.FIXED || c.type === RouteType.TEMPORARY));
        
        // Encontrar a maior ordem existente entre os endereços desta rota no mês atual (incluindo atribuídos)
        const routeAddressIds = new Set(addresses.filter(a => (a.route || 'Sem Rota') === routeName).map(a => a.id));
        const maxOrder = records.reduce((max, r) => {
          const belongsToRoute = r.assignedRoute === routeName || (routeAddressIds.has(r.addressId) && !r.assignedRoute);
          if (r.month === month && belongsToRoute && r.itineraryOrder !== undefined && r.itineraryOrder !== null) {
            return Math.max(max, r.itineraryOrder);
          }
          return max;
        }, 0);

        const addressObj = addresses.find(a => a.id === addressId);
        const isFromOtherRoute = addressObj && (addressObj.route || 'Sem Rota') !== routeName;
        const existingRecordForMonth = records.find(r => r.addressId === addressId && r.month === month);

        const recordToCreate: Partial<MaintenanceRecord> = {
          ...(existingRecordForMonth || {}),
          id: existingRecordForMonth?.id,
          month: month,
          addressId: addressId,
          scheduledWeek: existingRecordForMonth?.scheduledWeek || 1,
          status: existingRecordForMonth?.status || MaintenanceStatus.PENDING,
          technician1: config?.technician1 ?? existingRecordForMonth?.technician1 ?? '',
          technician2: config?.technician2 ?? '',
          itineraryOrder: maxOrder + 1,
          ...(isFromOtherRoute ? { assignedRoute: routeName } : {}),
        };
        const existingRouteData = routeStats[routeName];
        if (existingRouteData) {
            recordToCreate.plannedDate = existingRouteData.plannedDate;
            recordToCreate.returnDate = null;
            delete (recordToCreate as any).plannedDates;
            recordToCreate.routeColor = existingRouteData.routeColor;
            recordToCreate.routeNotes = existingRouteData.routeNotes;
            recordToCreate.routeEstimatedCost = existingRouteData.routeEstimatedCost;
            recordToCreate.routeActualCost = existingRouteData.routeActualCost;
            recordToCreate.routeServiceOrdersCount = existingRouteData.routeServiceOrdersCount;
            recordToCreate.routeServicesValue = existingRouteData.routeServicesValue;
            recordToCreate.routePreventiveCount = existingRouteData.routePreventiveCount;
            recordToCreate.routeAttachmentUrl = existingRouteData.routeAttachmentUrl;
            recordToCreate.routeCostItems = existingRouteData.routeCostItems;
            recordToCreate.routeMap1Url = existingRouteData.routeMap1Url;
            recordToCreate.routeMap2Url = existingRouteData.routeMap2Url;
        }

        const id = await dataService.upsertRecord(recordToCreate as any);
        if (id) {
            setRecords(prev => [...prev.filter(r => !(r.addressId === addressId && r.month === month)), { id, ...recordToCreate } as MaintenanceRecord]);
        }
      } else {
        const record = routeStats[routeName].records.find(r => r.addressId === addressId);
        if (record && record.id) {
          await dataService.deleteRecord(record.id);
          setRecords(prev => prev.filter(r => r.id !== record.id));
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleUpdateAddressOrder = async (routeName: string, addressId: string, orderVal: string) => {
    try {
      const parsed = orderVal === '' ? null : parseInt(orderVal, 10);
      const record = records.find(r => 
        r.addressId === addressId && 
        r.month === month && 
        (r.assignedRoute || (r.isTemporaryRoute ? r.temporaryRouteName : (addresses.find(a => a.id === addressId)?.route || 'Sem Rota'))) === routeName
      );
      
      if (record && record.id) {
        const { address, client, ...pureRecord } = record as any;
        const updatedRecord = {
          ...pureRecord,
          itineraryOrder: parsed === null ? null : parsed
        };
        
        // Optimistic update of local state
        setRecords(prev => prev.map(r => r.id === record.id ? { ...r, itineraryOrder: parsed === null ? undefined : parsed } : r));
        
        await dataService.upsertRecord(updatedRecord as MaintenanceRecord);
      }
    } catch (e) {
      console.error("Erro ao atualizar ordem do endereço:", e);
    }
  };

  const handleToggleAllAddressesInRoute = async (routeName: string, selectAll: boolean) => {
    setLoading(true);
    try {
      const routeAddresses = addresses.filter(a => (a.route || 'Sem Rota') === routeName);
      
      if (selectAll) {
        const config = routeConfigs.find(c => c.id === routeName && (c.type === RouteType.FIXED || c.type === RouteType.TEMPORARY));
        const existingRouteData = routeStats[routeName];
        
        const newRecords: Partial<MaintenanceRecord>[] = [];
        
        const routeAddressIds = new Set(routeAddresses.map(a => a.id));
        let currentMaxOrder = records.reduce((max, r) => {
          if (r.month === month && routeAddressIds.has(r.addressId) && r.itineraryOrder !== undefined && r.itineraryOrder !== null) {
            return Math.max(max, r.itineraryOrder);
          }
          return max;
        }, 0);

        const promises = routeAddresses.map(async addr => {
          const isIncluded = records.some(r => 
            r.addressId === addr.id && 
            r.month === month && 
            (r.assignedRoute || (r.isTemporaryRoute ? r.temporaryRouteName : (addr.route || 'Sem Rota'))) === routeName
          );
          if (isIncluded) return; // Already included in this route
          
          currentMaxOrder += 1;
          const orderForThis = currentMaxOrder;

          const existingRecordForMonth = records.find(r => r.addressId === addr.id && r.month === month);

          const recordToCreate: Partial<MaintenanceRecord> = {
            ...(existingRecordForMonth || {}),
            id: existingRecordForMonth?.id,
            month: month,
            addressId: addr.id,
            scheduledWeek: existingRecordForMonth?.scheduledWeek || 1,
            status: existingRecordForMonth?.status || MaintenanceStatus.PENDING,
            technician1: config?.technician1 || existingRecordForMonth?.technician1 || '',
            technician2: config?.technician2 || existingRecordForMonth?.technician2 || '',
            itineraryOrder: orderForThis,
          };
          
          if (existingRouteData) {
            recordToCreate.plannedDate = existingRouteData.plannedDate;
            recordToCreate.returnDate = existingRouteData.returnDate;
            recordToCreate.routeColor = existingRouteData.routeColor;
            recordToCreate.routeNotes = existingRouteData.routeNotes;
            recordToCreate.routeEstimatedCost = existingRouteData.routeEstimatedCost;
            recordToCreate.routeActualCost = existingRouteData.routeActualCost;
            recordToCreate.routeServiceOrdersCount = existingRouteData.routeServiceOrdersCount;
            recordToCreate.routeServicesValue = existingRouteData.routeServicesValue;
            recordToCreate.routePreventiveCount = existingRouteData.routePreventiveCount;
            recordToCreate.routeAttachmentUrl = existingRouteData.routeAttachmentUrl;
            recordToCreate.routeCostItems = existingRouteData.routeCostItems;
            recordToCreate.routeMap1Url = existingRouteData.routeMap1Url;
            recordToCreate.routeMap2Url = existingRouteData.routeMap2Url;
          }
          
          const id = await dataService.upsertRecord(recordToCreate as any);
          if (id) {
            newRecords.push({ id, ...recordToCreate } as MaintenanceRecord);
          }
        });
        
        await Promise.all(promises);
        if (newRecords.length > 0) {
          const newAddressIds = new Set(newRecords.map(nr => nr.addressId));
          setRecords(prev => [...prev.filter(r => !(newAddressIds.has(r.addressId) && r.month === month)), ...newRecords as MaintenanceRecord[]]);
        }
      } else {
        const recordsToDelete = routeStats[routeName].records;
        const promises = recordsToDelete.map(async record => {
          if (record.id) {
            await dataService.deleteRecord(record.id);
          }
        });
        await Promise.all(promises);
        const deletedIds = recordsToDelete.map(r => r.id);
        setRecords(prev => prev.filter(r => !deletedIds.includes(r.id)));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const colors = [
    { name: 'Azul', bg: 'bg-blue-500', hex: '#3b82f6' },
    { name: 'Verde', bg: 'bg-emerald-500', hex: '#10b981' },
    { name: 'Amarelo', bg: 'bg-amber-500', hex: '#f59e0b' },
    { name: 'Vermelho', bg: 'bg-red-500', hex: '#ef4444' },
    { name: 'Roxo', bg: 'bg-purple-500', hex: '#a855f7' },
    { name: 'Rosa', bg: 'bg-pink-500', hex: '#ec4899' },
    { name: 'Ciano', bg: 'bg-cyan-500', hex: '#06b6d4' },
    { name: 'Índigo', bg: 'bg-indigo-500', hex: '#6366f1' },
  ];

  // Calendar logic
  const { daysInMonth, paddingDays } = useMemo(() => {
    const start = startOfMonth(new Date(month + '-02'));
    const end = endOfMonth(start);
    const days = eachDayOfInterval({ start, end });
    const padding = start.getDay(); // 0 for Sunday, 1 for Monday...
    return { daysInMonth: days, paddingDays: padding };
  }, [month]);

  return (
    <div className="space-y-6">
      {/* Abas Principais no topo: Planejamento vs Despesas de Viagem */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-3 print:hidden">
        <button
          type="button"
          onClick={() => setActiveMainTab('planning')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer shadow-xs",
            activeMainTab === 'planning'
              ? "bg-blue-600 text-white shadow-md shadow-blue-200 font-extrabold"
              : "bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200"
          )}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Planejamento & Roteiro</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('expenses')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer shadow-xs",
            activeMainTab === 'expenses'
              ? "bg-blue-600 text-white shadow-md shadow-blue-200 font-extrabold"
              : "bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200"
          )}
        >
          <Receipt className="w-4 h-4" />
          <span>Despesas de Viagem</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('card_summary')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer shadow-xs",
            activeMainTab === 'card_summary'
              ? "bg-blue-600 text-white shadow-md shadow-blue-200 font-extrabold"
              : "bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200"
          )}
        >
          <CreditCard className="w-4 h-4" />
          <span>Prestação de Contas (Cartão)</span>
        </button>
      </div>

      {activeMainTab === 'card_summary' ? (
        <CardSummaryView userRole={userRole} />
      ) : activeMainTab === 'expenses' ? (
        <TechExpensesView userRole={userRole} userProfile={userProfile} />
      ) : (
        <div>
          <div className={cn("space-y-6", (addressSelectionModal.isOpen || routeControlPrintModalOpen) ? "print:hidden" : "")}>
          {/* Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-blue-600" />
            Cronograma Mestre de Rotas
          </h2>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-1">Previsão e Acompanhamento para a Gestão</p>
        </div>
        
        <div className="flex items-center gap-2 print:hidden">
          <button 
            type="button"
            onClick={() => setHideVariableRoutes(!hideVariableRoutes)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm border",
              hideVariableRoutes 
                ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100" 
                : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
            )}
            title={hideVariableRoutes ? "Mostrar rotas da Capital" : "Ocultar rotas da Capital"}
          >
            {hideVariableRoutes ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {hideVariableRoutes ? "Mostrar Capital" : "Ocultar Capital"}
          </button>
          <button 
            type="button"
            onClick={() => setRouteModal({
              isOpen: true,
              mode: 'create',
              originalName: '',
              number: '',
              name: '',
              type: RouteType.VARIABLE,
              tempAddresses: []
            })}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
            style={{ display: isReadOnly ? 'none' : 'inline-flex' }}
          >
            <Plus className="w-4 h-4" />
            Nova Rota
          </button>
          <button 
            type="button"
            onClick={() => setRouteControlPrintModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100 cursor-pointer"
          >
            <ListChecks className="w-4 h-4" />
            Controle de Rotas (A4)
          </button>
          <button 
            type="button"
            onClick={() => { 
                window.focus(); 
                setTimeout(() => window.print(), 200); 
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
          >
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewMode === 'list' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Lista de Rotas
            </button>
            <button 
              onClick={() => setViewMode('calendar')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewMode === 'calendar' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Calendário
            </button>
          </div>
          <input 
            type="month" 
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* Monthly Financial Summary Card */}
      <div id="financial-summary-card" className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="bg-blue-50 p-2.5 rounded-xl text-blue-600">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Resumo Financeiro de Rotas</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Acompanhamento e previsão total para o mês vigente</p>
            </div>
          </div>
          <div className="bg-linear-to-r from-gray-50 to-gray-100/50 border border-gray-200/60 px-3.5 py-1.5 rounded-xl text-xs font-bold text-gray-500 self-start sm:self-auto uppercase tracking-wide shadow-2xs">
            Mês de Referência: <span className="text-gray-800 font-black">{format(parseISO(month + '-01'), 'MMMM yyyy', { locale: ptBR })}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Total Estimado (Custos) */}
          <div className="bg-linear-to-r from-blue-50/40 via-blue-50/10 to-transparent border border-blue-100/50 rounded-xl p-4 flex flex-col justify-between min-h-[102px]">
            <div className="flex items-center justify-between w-full">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest block">Total Previsto das Rotas</span>
                <span className="text-xl font-black text-blue-700 font-mono tracking-tight block">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(financialSummary.totalEstimated)}
                </span>
              </div>
              <div className="w-11 h-11 shrink-0 rounded-full bg-blue-100/40 flex items-center justify-center p-3 text-blue-600 font-black font-mono text-sm shadow-2xs border border-blue-50">
                R$
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-blue-100/30 flex items-center justify-between">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Custo de Viagens</span>
              <span className="text-[9px] font-black uppercase text-blue-700 bg-blue-50 border border-blue-100/65 px-2 py-0.5 rounded-md leading-none">Previsão</span>
            </div>
          </div>

          {/* Rotas com Custos Planejados */}
          <div className="bg-linear-to-r from-emerald-50/40 via-emerald-50/10 to-transparent border border-emerald-100/50 rounded-xl p-4 flex flex-col justify-between min-h-[102px]">
            <div className="flex items-center justify-between w-full">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block">Rotas com Custos Cadastrados</span>
                <span className="text-xl font-black text-emerald-700 font-mono tracking-tight block">
                  {financialSummary.routesWithCostCount} <span className="text-xs font-bold text-emerald-500 uppercase">de {financialSummary.routesCount} rotas</span>
                </span>
              </div>
              <div className="w-11 h-11 shrink-0 rounded-full bg-emerald-100/40 flex items-center justify-center p-3 text-emerald-600 shadow-2xs border border-emerald-50">
                <Calculator className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-emerald-100/30 flex items-center justify-between">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Preenchimento</span>
              <span className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-100/65 px-2 py-0.5 rounded-md leading-none">
                {financialSummary.routesCount > 0 ? Math.round((financialSummary.routesWithCostCount / financialSummary.routesCount) * 100) : 0}% concluído
              </span>
            </div>
          </div>

          {/* Custos Concluídos */}
          <div className="bg-linear-to-r from-purple-50/40 via-purple-50/10 to-transparent border border-purple-100/50 rounded-xl p-4 flex flex-col justify-between min-h-[102px]">
            <div className="flex items-center justify-between w-full">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-purple-600 uppercase tracking-widest block">Custos Concluídos</span>
                <span className="text-xl font-black text-purple-700 font-mono tracking-tight block">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(financialSummary.totalCompletedCosts)}
                </span>
              </div>
              <div className="w-11 h-11 shrink-0 rounded-full bg-purple-100/40 flex items-center justify-center p-2.5 text-purple-600 font-black shadow-2xs border border-purple-50">
                <ListChecks className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-purple-100/30 flex items-center justify-between">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Rotas Executadas</span>
              <span className="text-[9px] font-black uppercase text-purple-700 bg-purple-50 border border-purple-100/65 px-2 py-0.5 rounded-md leading-none font-sans">
                {financialSummary.completedRoutesCount} {financialSummary.completedRoutesCount === 1 ? 'completada' : 'completadas'}
              </span>
            </div>
          </div>

          {/* Faturamento Total Gerado */}
          <div className="bg-linear-to-r from-indigo-50/40 via-indigo-50/10 to-transparent border border-indigo-100/50 rounded-xl p-4 flex flex-col justify-between min-h-[102px]">
            <div className="flex items-center justify-between w-full">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest block">Valor Total Gerado</span>
                <span className="text-xl font-black text-indigo-700 font-mono tracking-tight block">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(financialSummary.totalServicesValue)}
                </span>
              </div>
              <div className="w-11 h-11 shrink-0 rounded-full bg-indigo-100/40 flex items-center justify-center p-3 text-indigo-600 shadow-2xs border border-indigo-50">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            
            {/* Comparativo de Custo vs Faturamento */}
            <div className="mt-2.5 pt-2 border-t border-indigo-100/30 flex items-center justify-between">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Balanço do Mês</span>
              {financialSummary.totalServicesValue === 0 && financialSummary.totalEstimated === 0 ? (
                <span className="text-[9px] font-black uppercase text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md leading-none">Sem dados</span>
              ) : financialSummary.totalServicesValue >= financialSummary.totalEstimated ? (
                <span className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-100/60 px-1.5 py-0.5 rounded-md leading-none flex items-center gap-0.5">
                  ▲ Lucrativo (+{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(financialSummary.totalServicesValue - financialSummary.totalEstimated)})
                </span>
              ) : (
                <span className="text-[9px] font-black uppercase text-red-700 bg-red-50 border border-red-100/60 px-1.5 py-0.5 rounded-md leading-none flex items-center gap-0.5">
                  ▼ Crítico (-{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(financialSummary.totalEstimated - financialSummary.totalServicesValue)})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Breakdown details */}
        {financialSummary.activeRouteCosts.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest shrink-0">Alocação de Custos por Rota</span>
              <div className="h-px bg-gray-100 flex-1" />
            </div>
            <div className="flex flex-wrap gap-2">
              {financialSummary.activeRouteCosts.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(`route-${item.name}`);
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      el.classList.add('ring-[5px]', 'ring-blue-500/15', 'shadow-md');
                      setTimeout(() => {
                        el.classList.remove('ring-[5px]', 'ring-blue-500/15', 'shadow-md');
                      }, 1800);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-blue-50/40 rounded-xl border border-gray-200/80 hover:border-blue-200 text-xs font-semibold text-gray-600 hover:text-blue-800 transition-all cursor-pointer shadow-3xs group"
                  title="Clique para rolar até esta rota"
                >
                  <span className="w-2 h-2 rounded-full shrink-0 group-hover:scale-125 transition-transform" style={{ backgroundColor: item.color || '#3b82f6' }} />
                  <span className="font-extrabold">{item.name}</span>
                  <span className="text-[11px] font-black font-mono bg-white group-hover:bg-blue-100 px-1.5 py-0.5 rounded-md border border-gray-100 group-hover:border-blue-200 text-gray-900 group-hover:text-blue-800 transition-colors">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.cost)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mural de Comunicação Geral */}
      <div id="mural-comunicacao-card" className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-5 mb-4 transition-all duration-300">
        <div 
          onClick={() => setIsMuralCollapsed(prev => !prev)}
          className={cn(
            "flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none group transition-all",
            !isMuralCollapsed ? "border-b border-gray-100 pb-3" : "pb-0"
          )}
        >
          <div className="flex items-center gap-2.5">
            <div className="bg-amber-500/10 p-2.5 rounded-xl text-amber-600 group-hover:bg-amber-500/20 transition-all">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest group-hover:text-amber-700 transition-colors">Mural de Comunicação de Rotas</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Informações importantes e avisos gerais sobre as viagens do mês</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <div className="bg-amber-50 border border-amber-100 text-amber-800 font-extrabold px-3 py-1 rounded-xl text-xs flex items-center gap-1.5 uppercase tracking-wide">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>{muralPosts.length} {muralPosts.length === 1 ? 'comunicado' : 'comunicados'}</span>
            </div>
            <div className="bg-gray-50 text-gray-500 group-hover:bg-amber-50 group-hover:text-amber-750 p-1.5 border border-gray-200/50 rounded-lg transition-all shrink-0">
              {isMuralCollapsed ? <ChevronDown className="w-4 h-4 text-current" /> : <ChevronUp className="w-4 h-4 text-current" />}
            </div>
          </div>
        </div>

        {!isMuralCollapsed && (
          <div className="mt-4 space-y-4">
            {/* Input Form for adding a message */}
            <form onSubmit={handleAddMuralPost} className="space-y-3 bg-gray-50/40 p-4 border border-gray-200/50 rounded-xl">
              <div className="relative">
                <textarea
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder="Digite aqui um aviso ou informação importante sobre este mês para seu gestor (ex: desvios em rodovias, pedágios extras, mudanças urgentes, observações gerais de viagens...)"
                  maxLength={500}
                  className="w-full text-xs font-semibold text-gray-800 placeholder-gray-400/90 p-4 border border-gray-200 rounded-xl focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 focus:bg-white outline-none min-h-[85px] resize-none bg-white/70 transition-all shadow-3xs"
                />
                <div className="absolute right-3 bottom-3 text-[9px] font-extrabold text-gray-400 tracking-wider">
                  {newPostContent.length} / 500
                </div>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400">
                  As mensagens serão fixadas no mês de <span className="font-extrabold text-amber-700">{format(parseISO(month + '-01'), 'MMMM yyyy', { locale: ptBR })}</span>.
                </span>
                <button
                  type="submit"
                  disabled={!newPostContent.trim()}
                  className={cn(
                    "px-4.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-2xs cursor-pointer select-none",
                    newPostContent.trim()
                      ? "bg-amber-600 hover:bg-amber-700 text-white active:scale-95"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200/50"
                  )}
                >
                  <Plus className="w-4 h-4 text-current" /> Publicar Comunicado
                </button>
              </div>
            </form>

            {/* List of Posts */}
            {muralLoading ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 space-y-2.5">
                <div className="animate-spin rounded-full h-5.5 w-5.5 border-2 border-amber-600 border-t-transparent" />
                <span className="text-[9px] font-black uppercase tracking-widest text-amber-700">Buscando mensagens do mural...</span>
              </div>
            ) : muralPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 bg-gray-50/20 rounded-xl border border-dashed border-gray-200/80">
                <div className="bg-amber-100/30 p-3.5 rounded-full text-amber-500 mb-2.5">
                  <Megaphone className="w-6 h-6 stroke-[1.5]" />
                </div>
                <p className="text-xs font-black text-gray-700 uppercase tracking-wider">Mural Sem Avisos</p>
                <p className="text-[10px] text-gray-400 font-bold tracking-wide mt-1">Nenhuma informação geral foi adicionada para este mês ainda.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[360px] overflow-y-auto pr-1">
                {muralPosts.map((post) => {
                  const postOwner = userRole === 'admin' || post.createdBy === userProfile?.uid;
                  return (
                    <div 
                      key={post.id} 
                      className="bg-amber-500/[0.012] hover:bg-amber-500/[0.035] border border-amber-500/10 border-l-4 border-l-amber-500 rounded-xl p-4 flex flex-col justify-between transition-all duration-300 relative group shadow-3xs"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-3 border-b border-amber-500/[0.05] pb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 shrink-0 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-800 font-extrabold text-[10px] select-none border border-amber-500/15 uppercase">
                              {(post.createdByName || 'U').charAt(0)}
                            </div>
                            <span className="text-xs font-bold text-gray-800 tracking-wide truncate">
                              {post.createdByName || 'Usuário'}
                            </span>
                          </div>

                          {/* Delete actions with inline safe validation */}
                          {postOwner && (
                            <div className="shrink-0">
                              {deletingPostId === post.id ? (
                                <div className="flex items-center gap-1 bg-red-50 p-1 border border-red-100 rounded-lg shadow-sm">
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmDeletePost(post.id)}
                                    className="text-[9px] font-black uppercase text-red-700 hover:bg-red-100 px-2 py-0.5 rounded-md transition-all cursor-pointer"
                                  >
                                    Sim
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingPostId(null)}
                                    className="text-[9px] font-black uppercase text-gray-500 hover:bg-gray-100 px-1.5 py-0.5 rounded-md transition-all cursor-pointer"
                                  >
                                    Não
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setDeletingPostId(post.id)}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                                  title="Remover comunicado do mural"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <p className="text-[13px] font-normal text-gray-700 leading-relaxed tracking-wide whitespace-pre-line font-sans antialiased pl-0.5">
                          {post.content}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 text-[9px] text-gray-400 mt-3.5 pt-2.5 border-t border-amber-500/[0.05] select-none font-medium">
                        <Clock className="w-3 h-3 text-amber-500/40" />
                        <span>Postado em: {post.createdAt ? (
                          (() => {
                            const date = typeof post.createdAt.toDate === 'function' ? post.createdAt.toDate() : new Date(post.createdAt);
                            try {
                              return format(date, "dd 'de' MMMM 'às' HH:mm", { locale: ptBR });
                            } catch {
                              return 'Data Recente';
                            }
                          })()
                        ) : 'Postando...'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ordem de Preenchimento Recomendada */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-4 shadow-3xs">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3 mb-4">
          <div className="bg-blue-600/10 p-2 rounded-xl text-blue-600">
            <ListChecks className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Lógica de Preenchimento Recomendada (Viagens)</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Siga estes passos para otimizar a programação do mês</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-3.5 border border-slate-200/80 rounded-xl relative overflow-hidden flex flex-col justify-between">
            <div>
              <span className="absolute right-2.5 top-1 text-4xl font-black text-slate-100 select-none">1</span>
              <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest block mb-1">Passo 1</span>
              <span className="text-xs font-black text-slate-700 block">Técnicos da Rota</span>
              <p className="text-[10px] text-slate-400 mt-1.5 font-semibold leading-relaxed">Selecione os profissionais responsáveis pela execução desta rota.</p>
            </div>
          </div>

          <div className="bg-white p-3.5 border border-slate-200/80 rounded-xl relative overflow-hidden flex flex-col justify-between">
            <div>
              <span className="absolute right-2.5 top-1 text-4xl font-black text-slate-100 select-none">2</span>
              <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest block mb-1">Passo 2</span>
              <span className="text-xs font-black text-slate-700 block">Período de Viagem</span>
              <p className="text-[10px] text-slate-400 mt-1.5 font-semibold leading-relaxed">Insira as datas de Saída e Retorno Previsto do veículo.</p>
            </div>
          </div>

          <div className="bg-white p-3.5 border border-slate-200/80 rounded-xl relative overflow-hidden flex flex-col justify-between">
            <div>
              <span className="absolute right-2.5 top-1 text-4xl font-black text-slate-100 select-none">3</span>
              <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest block mb-1">Passo 3</span>
              <span className="text-xs font-black text-slate-700 block">Atendimentos</span>
              <p className="text-[10px] text-slate-400 mt-1.5 font-semibold leading-relaxed">Clique no ícone de "Lista de Checagem" para escolher os endereços do mês.</p>
            </div>
          </div>

          <div className="bg-white p-3.5 border border-slate-200/80 rounded-xl relative overflow-hidden flex flex-col justify-between">
            <div>
              <span className="absolute right-2.5 top-1 text-4xl font-black text-slate-100 select-none">4</span>
              <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest block mb-1">Passo 4</span>
              <span className="text-xs font-black text-slate-700 block">Análise Financeira</span>
              <p className="text-[10px] text-slate-400 mt-1.5 font-semibold leading-relaxed">Acesse o ícone de "Cifrão" para detalhar os custos e as despesas previstas.</p>
            </div>
          </div>

          <div className="bg-white p-3.5 border border-slate-200/80 rounded-xl relative overflow-hidden flex flex-col justify-between">
            <div>
              <span className="absolute right-2.5 top-1 text-4xl font-black text-slate-100 select-none">5</span>
              <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest block mb-1">Passo 5</span>
              <span className="text-xs font-black text-slate-700 block">O.S. e Faturamento</span>
              <p className="text-[10px] text-slate-400 mt-1.5 font-semibold leading-relaxed">Preencha as O.S., preventivas e valores de faturamento do período.</p>
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2">
          <span className="text-emerald-500 animate-pulse text-xs">💾</span>
          <p className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">
            Persistência Independente Ativada: Os dados de planejamento agora são salvos de forma independente para que você nunca perca o trabalho ao alterar os endereços.
          </p>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="grid grid-cols-1 gap-4">
          {displayRoutes.map(([name, data]) => (
            <div key={name} id={`route-${name}`} className="transition-all duration-500 rounded-2xl">
              <RouteCard 
                name={name}
                data={data}
                colors={colors}
                technicians={technicians}
                onSetColor={handleSetRouteColor}
                onSetNotes={handleSetRouteNotes}
                onSetPlannedDate={handleSetPlannedDate}
                onSetReturnDate={handleSetReturnDate}
                onSetFinancials={handleSetRouteFinancials}
                onSetType={handleSetRouteType}
                onSetStatus={handleSetRouteStatus}
                onSetTechnicians={handleSetRouteTechnicians}
                onOpenCostCalculator={(name) => setCostCalculatorModal({ isOpen: true, routeName: name })}
                onEdit={(name) => {
                  const config = routeConfigs.find(c => c.id === name);
                  const isTemp = config?.type === RouteType.TEMPORARY;
                  const tempAddresses = isTemp ? data.records.map(r => {
                    const isReal = Boolean(r.addressId && !String(r.addressId).startsWith('TEMP_ADDR_'));
                    const realAddr = isReal ? addresses.find(a => a.id === r.addressId) : null;
                    const realClient = realAddr ? clients.find(c => c.id === realAddr.clientId) : null;

                    return {
                      key: r.id || Math.random().toString(36).substr(2, 9),
                      addressId: isReal ? r.addressId : undefined,
                      isRealAddress: isReal,
                      originalRoute: r.originalRoute || realAddr?.route || 'Sem Rota',
                      clientName: isReal ? (realClient?.name || r.temporaryClient || 'Cliente') : (r.temporaryClient || ''),
                      street: isReal ? `${realAddr?.street || ''}${realAddr?.number ? ', ' + realAddr.number : ''}${realAddr?.neighborhood ? ' - ' + realAddr.neighborhood : ''}` : (r.temporaryStreet || ''),
                      totalMachines: isReal ? (realAddr?.totalMachines || r.temporaryMachines || 0) : (r.temporaryMachines || 0),
                      city: realAddr?.city,
                      state: realAddr?.state,
                      recordId: r.id
                    };
                  }) : [];

                  setRouteModal({
                    isOpen: true,
                    mode: 'edit',
                    originalName: name,
                    number: config?.routeNumber || (name.includes('-') ? name.split('-')[0].trim() : ''),
                    name: config?.routeName && config.routeName !== name ? config.routeName : (name.includes('-') ? name.split('-').slice(1).join('-').trim() : name),
                    type: config?.type || RouteType.VARIABLE,
                    tempAddresses
                  });
                }}
                onDelete={(name) => {
                  setDeleteConfirm({ isOpen: true, routeName: name });
                }}
                userRole={userRole}
                addressesCount={data.records.length}
                onOpenAddressSelection={(name) => {
                  const config = routeConfigs.find(c => c.id === name);
                  if (config?.type === RouteType.TEMPORARY) {
                    const tempAddresses = data.records.map(r => {
                      const isReal = Boolean(r.addressId && !String(r.addressId).startsWith('TEMP_ADDR_'));
                      const realAddr = isReal ? addresses.find(a => a.id === r.addressId) : null;
                      const realClient = realAddr ? clients.find(c => c.id === realAddr.clientId) : null;
                      return {
                        key: r.id || Math.random().toString(36).substr(2, 9),
                        addressId: isReal ? r.addressId : undefined,
                        isRealAddress: isReal,
                        originalRoute: r.originalRoute || realAddr?.route || 'Sem Rota',
                        clientName: isReal ? (realClient?.name || r.temporaryClient || 'Cliente') : (r.temporaryClient || ''),
                        street: isReal ? `${realAddr?.street || ''}${realAddr?.number ? ', ' + realAddr.number : ''}${realAddr?.neighborhood ? ' - ' + realAddr.neighborhood : ''}` : (r.temporaryStreet || ''),
                        totalMachines: isReal ? (realAddr?.totalMachines || r.temporaryMachines || 0) : (r.temporaryMachines || 0),
                        city: realAddr?.city,
                        state: realAddr?.state,
                        recordId: r.id
                      };
                    });
                    setRouteModal({
                      isOpen: true,
                      mode: 'edit',
                      originalName: name,
                      number: config?.routeNumber || (name.includes('-') ? name.split('-')[0].trim() : ''),
                      name: config?.routeName && config.routeName !== name ? config.routeName : (name.includes('-') ? name.split('-').slice(1).join('-').trim() : name),
                      type: RouteType.TEMPORARY,
                      tempAddresses
                    });
                    setRealAddressSelectorOpen(true);
                  } else {
                    setAddressSelectionModal({ isOpen: true, routeName: name });
                  }
                }}
              />
            </div>
          ))}
          {displayRoutes.length === 0 && (
            <div className="bg-white border border-dashed border-gray-300 rounded-3xl py-20 text-center">
               <Filter className="w-12 h-12 text-gray-200 mx-auto mb-4" />
               <p className="text-gray-400 font-medium">Nenhuma rota programada para este período.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-7 border-b border-gray-100">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
              <div key={d} className="py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50/50">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: paddingDays }).map((_, i) => (
              <div key={`padding-${i}`} className="min-h-[140px] border-r border-b border-gray-50 bg-gray-50/20" />
            ))}
            {daysInMonth.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const routesToday = displayRoutes.filter(([_, data]) => {
                if (!data.plannedDate) return false;
                
                const start = parseISO(data.plannedDate);
                const end = data.returnDate ? parseISO(data.returnDate) : start;
                
                try {
                  return isWithinInterval(day, { start, end });
                } catch (e) {
                  return isSameDay(day, start);
                }
              });
              
              return (
                <div 
                  key={dateStr} 
                  className={cn(
                    "min-h-[140px] border-r border-b border-gray-50 p-2 transition-colors",
                    isSameDay(day, new Date()) ? "bg-blue-50/30" : "hover:bg-gray-50/50"
                  )}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className={cn(
                      "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full",
                      isSameDay(day, new Date()) ? "bg-blue-600 text-white" : "text-gray-400"
                    )}>
                      {format(day, 'd')}
                    </span>
                  </div>
                  
                  <div className="space-y-1">
                    {routesToday.map(([name, data]) => (
                      <div 
                        key={name}
                        className={cn(
                          "px-2 py-1.5 rounded-lg text-[10px] font-bold border truncate flex items-center gap-1.5 transition-all hover:scale-[1.02]",
                          !data.routeColor && (
                            data.status === 'completed' ? "bg-emerald-50 border-emerald-100 text-emerald-700" :
                            data.status === 'partial' ? "bg-amber-50 border-amber-100 text-amber-700" :
                            "bg-blue-50 border-blue-100 text-blue-700"
                          )
                        )}
                        style={data.routeColor ? { 
                          backgroundColor: data.routeColor + '15', 
                          borderColor: data.routeColor + '40',
                          color: data.routeColor
                        } : {}}
                        title={`${name} (${data.records.length} locais)\nTécnicos: ${[data.config?.technician1, data.config?.technician2].filter(Boolean).join(' e ') || 'Nenhum técnico fixo'}`}
                      >
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          !data.routeColor && (
                            data.status === 'completed' ? "bg-emerald-400" :
                            data.status === 'partial' ? "bg-amber-400" : "bg-blue-400"
                          )
                        )} style={data.routeColor ? { backgroundColor: data.routeColor } : {}} />
                        <span className="truncate flex-1">{name}</span>
                        {data.routeNotes && (
                          <div className="w-1 h-1 bg-gray-400 rounded-full shrink-0" title="Possui observações" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Technician Schedule */}
      <div className="bg-white border flex flex-col border-gray-200 rounded-2xl p-6 shadow-sm overflow-hidden relative">
        {/* Added some nice background gradients to make it pop */}
        <div className="absolute top-0 right-0 p-32 bg-blue-50/50 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        <div className="absolute bottom-0 left-0 p-24 bg-emerald-50/50 rounded-full blur-3xl -ml-12 -mb-12 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 relative z-10">
          <div>
            <h2 className="text-xl font-black text-gray-900 border-b-2 border-blue-600 pb-1 w-fit uppercase tracking-tight">Escala do Técnico</h2>
            <p className="text-sm text-gray-500 mt-1">Selecione um técnico para ver sua disponibilidade este mês em rotas e atendimentos.</p>
          </div>
          <select
            value={selectedTechForSchedule}
            onChange={(e) => setSelectedTechForSchedule(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-bold bg-white w-full md:w-64 shadow-sm"
          >
            <option value="">Selecione o Técnico...</option>
            {technicians.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>

        <div className="relative z-10">
        {selectedTechForSchedule ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {daysInMonth.map((day) => {
              // 1. Check if technician is in a route today
              const techRoutesToday = displayRoutes.filter(([_, data]) => {
                const isT1 = matchesTechnician(data.config.technician1, selectedTechForSchedule, technicians);
                const isT2 = matchesTechnician(data.config.technician2, selectedTechForSchedule, technicians);
                if (!isT1 && !isT2) return false;
                if (!data.plannedDate) return false;
                
                const start = parseISO(data.plannedDate);
                const end = data.returnDate ? parseISO(data.returnDate) : start;
                try {
                  return isWithinInterval(day, { start, end });
                } catch (e) {
                  return isSameDay(day, start);
                }
              });

              // 2. Check if technician is directly assigned to independent records
              const techRecordsToday = records.filter(r => {
                const isT1 = matchesTechnician(r.technician1, selectedTechForSchedule, technicians);
                const isT2 = matchesTechnician(r.technician2, selectedTechForSchedule, technicians);
                if (!isT1 && !isT2) return false;
                const d = r.executionDate || r.plannedDate; // Priority to executionDate if attended, else plannedDate
                if (!d) return false;
                return isSameDay(day, parseISO(d));
              });

              const isBusyRoute = techRoutesToday.length > 0;
              const isBusyRecord = techRecordsToday.length > 0;

              return (
                <div key={day.toISOString()} className={cn(
                  "p-3 rounded-2xl border flex flex-col justify-start min-h-[110px] transition-all hover:scale-[1.02]",
                  isBusyRoute ? "bg-blue-50/80 border-blue-200 shadow-sm shadow-blue-100" :
                  isBusyRecord ? "bg-amber-50/80 border-amber-200 shadow-sm shadow-amber-100" :
                  "bg-emerald-50/80 border-emerald-200 shadow-sm shadow-emerald-100 opacity-80"
                )}>
                  <div className="flex justify-between items-start mb-2">
                    <span className={cn(
                      "text-sm font-black w-8 h-8 flex items-center justify-center rounded-xl shrink-0 transition-colors",
                      isBusyRoute ? "bg-blue-600 text-white shadow-sm" :
                      isBusyRecord ? "bg-amber-600 text-white shadow-sm" :
                      "bg-emerald-600 text-white shadow-sm"
                    )}>
                      {format(day, 'd')}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 mt-1">
                      {format(day, 'EEE', { locale: ptBR })}
                    </span>
                  </div>
                  
                  <div className="mt-auto space-y-1.5">
                    {isBusyRoute ? (
                      <div>
                         <span className="text-[9px] font-black text-blue-800 uppercase tracking-widest block leading-tight mb-1 opacity-70">Rota(s)</span>
                         <div className="space-y-0.5">
                           {techRoutesToday.map(([name]) => (
                             <div key={name} className="text-[10px] font-bold text-blue-900 leading-tight line-clamp-2" title={name}>• {name}</div>
                           ))}
                         </div>
                      </div>
                    ) : isBusyRecord ? (
                      <div>
                        <span className="text-[9px] font-black text-amber-800 uppercase tracking-widest block leading-tight mb-1 opacity-70">Atendimentos</span>
                        <div className="text-[10px] font-bold text-amber-900">{techRecordsToday.length} local(is)</div>
                      </div>
                    ) : (
                      <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest w-full truncate inline-block opacity-70">Livre</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border border-dashed border-gray-200 rounded-3xl py-12 flex flex-col items-center justify-center text-gray-400">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <CalendarDays className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-bold text-gray-500">Selecione um técnico para ver sua escala.</p>
            <p className="text-xs font-medium text-gray-400 mt-1">A visualização inclui dias em rotas e atendimentos locais.</p>
          </div>
        )}
        </div>
      </div>
      </div>

      {/* Route Modal */}
      {routeModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden">
            <div className="p-4 bg-gray-800 border-b flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-wider">
                {routeModal.mode === 'create' ? <Plus className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                {routeModal.mode === 'create' ? 'Cadastrar Nova Rota' : 'Editar Nome da Rota'}
              </h3>
              <button 
                onClick={() => setRouteModal(prev => ({ ...prev, isOpen: false }))}
                className="p-1 hover:bg-white/10 rounded-full text-white/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1 col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                    Nº da Rota <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text"
                    placeholder="Ex: 16"
                    value={routeModal.number}
                    onChange={(e) => setRouteModal(prev => ({ ...prev, number: e.target.value.replace(/[^0-9A-Za-z-]/g, '') }))}
                    className={cn(
                      "w-full px-4 py-2 rounded-xl border text-sm font-bold outline-none transition-all",
                      routeNumberConflict 
                        ? "border-red-500 bg-red-50/60 text-red-900 focus:ring-2 focus:ring-red-400 ring-1 ring-red-400" 
                        : "border-gray-200 focus:ring-2 focus:ring-blue-500/20"
                    )}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                    Nome da Rota <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text"
                    placeholder="Ex: UNIÃO MURICI"
                    value={routeModal.name}
                    onChange={(e) => setRouteModal(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Alerta de ID/Número Duplicado em Tempo Real */}
              {routeNumberConflict && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-start gap-2.5 text-xs text-red-800 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="leading-snug">
                    <strong className="block font-black text-red-900">Número de Rota já em uso:</strong>
                    O número <strong className="underline">"{routeNumberConflict.conflictingNumber}"</strong> já pertence à rota <strong>"{routeNumberConflict.conflictingRouteName}"</strong>. Cada rota precisa ter um número (ID único) exclusivo.
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Tipo de Rota</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <button
                    onClick={() => setRouteModal(prev => ({ ...prev, type: RouteType.VARIABLE }))}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all",
                      routeModal.type === RouteType.VARIABLE 
                        ? "border-blue-200 bg-blue-50 ring-1 ring-blue-200" 
                        : "border-gray-100 bg-gray-50 hover:bg-gray-100"
                    )}
                  >
                    <span className={cn("block text-xs font-bold", routeModal.type === RouteType.VARIABLE ? "text-blue-700" : "text-gray-700")}>Capital</span>
                    <span className="text-[10px] text-gray-500">Técnicos definidos por agendamento mensal.</span>
                  </button>
                  <button
                    onClick={() => setRouteModal(prev => ({ ...prev, type: RouteType.FIXED }))}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all",
                      routeModal.type === RouteType.FIXED 
                        ? "border-amber-200 bg-amber-50 ring-1 ring-amber-200" 
                        : "border-gray-100 bg-gray-50 hover:bg-gray-100"
                    )}
                  >
                    <span className={cn("block text-xs font-bold", routeModal.type === RouteType.FIXED ? "text-amber-700" : "text-gray-700")}>Viagem</span>
                    <span className="text-[10px] text-gray-500">Técnicos fixos para todos os endereços da rota.</span>
                  </button>
                  <button
                    onClick={() => setRouteModal(prev => ({ ...prev, type: RouteType.TEMPORARY }))}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all",
                      routeModal.type === RouteType.TEMPORARY 
                        ? "border-purple-200 bg-purple-50 ring-1 ring-purple-200" 
                        : "border-gray-100 bg-gray-50 hover:bg-gray-100"
                    )}
                  >
                    <span className={cn("block text-xs font-bold", routeModal.type === RouteType.TEMPORARY ? "text-purple-700" : "text-gray-700")}>Temporária</span>
                    <span className="text-[10px] text-gray-500">Viagem especial, não duplica.</span>
                  </button>
                </div>
              </div>

              {routeModal.type === RouteType.TEMPORARY && (
                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest block">
                        Endereços da Viagem Temporária ({routeModal.tempAddresses.length})
                      </label>
                      <p className="text-[11px] text-gray-500">
                        Locais atendidos nesta viagem em {format(parseISO(month + '-01'), 'MMMM/yyyy', { locale: ptBR })}.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRealAddressIds([]);
                          setRealAddressSearch('');
                          setRealAddressFilterRoute('ALL');
                          setRealAddressSelectorOpen(true);
                        }}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:scale-95 px-3 py-1.5 rounded-xl shadow-xs shadow-purple-200 transition-all cursor-pointer"
                        title="Transferir temporariamente endereços reais não concluídos de outras rotas"
                      >
                        <ListPlus className="w-3.5 h-3.5" />
                        Incluir Endereços de Outras Rotas
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRouteModal(prev => ({
                            ...prev,
                            tempAddresses: [...prev.tempAddresses, { clientName: '', street: '', key: Math.random().toString(36).substr(2, 9), totalMachines: 0 }]
                          }));
                        }}
                        className="flex items-center gap-1.5 text-xs font-bold text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 active:scale-95 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer"
                        title="Digitar endereço avulso/manual"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Manual
                      </button>
                    </div>
                  </div>

                  {/* Lista de Endereços */}
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {routeModal.tempAddresses.length === 0 ? (
                      <div className="p-6 text-center border-2 border-dashed border-purple-100 rounded-2xl bg-purple-50/30">
                        <MapPin className="w-8 h-8 text-purple-300 mx-auto mb-2" />
                        <p className="text-xs font-bold text-purple-900 mb-1">Nenhum endereço incluído nesta viagem temporária</p>
                        <p className="text-[11px] text-purple-700/80 mb-3">
                          Você pode transferir endereços reais de outras rotas (não concluídos) ou adicionar novos manuais.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRealAddressIds([]);
                            setRealAddressSearch('');
                            setRealAddressFilterRoute('ALL');
                            setRealAddressSelectorOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 bg-purple-100 hover:bg-purple-200 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                          Selecionar Endereços Reais de Outras Rotas
                        </button>
                      </div>
                    ) : (
                      routeModal.tempAddresses.map((addr, idx) => {
                        if (addr.isRealAddress) {
                          return (
                            <div 
                              key={addr.key} 
                              className="p-3 bg-purple-50/50 border border-purple-200 rounded-xl flex items-start justify-between gap-3 transition-all hover:bg-purple-50/80"
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 mt-0.5">
                                  <MapPin className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                    <span className="text-xs font-black text-gray-900 truncate">
                                      {addr.clientName}
                                    </span>
                                    <span className="px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 rounded border border-purple-200">
                                      Endereço Real
                                    </span>
                                    <span className="px-1.5 py-0.2 text-[9px] font-bold bg-gray-100 text-gray-700 rounded border border-gray-200">
                                      Origem: {addr.originalRoute || 'Sem Rota'}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-gray-600 truncate">
                                    {addr.street}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1 text-[10px] font-semibold text-gray-500">
                                    <span>{addr.totalMachines || 0} máquina(s)</span>
                                    <span>•</span>
                                    <span className="text-purple-700">Retorna à rota original na virada do mês</span>
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const newArr = [...routeModal.tempAddresses];
                                  newArr.splice(idx, 1);
                                  setRouteModal(prev => ({ ...prev, tempAddresses: newArr }));
                                }}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0 transition-colors"
                                title={`Remover da rota temporária (retornará para ${addr.originalRoute || 'rota de origem'})`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        }

                        // Manual / Avulso
                        return (
                          <div key={addr.key} className="flex gap-2 items-center p-2 rounded-xl border border-gray-200 bg-white">
                            <div className="flex-1">
                              <input
                                type="text"
                                placeholder="Cliente / Endereço Manual"
                                value={addr.clientName}
                                onChange={(e) => {
                                  const newArr = [...routeModal.tempAddresses];
                                  newArr[idx].clientName = e.target.value;
                                  newArr[idx].street = e.target.value;
                                  setRouteModal(prev => ({ ...prev, tempAddresses: newArr }));
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold outline-none focus:border-purple-500"
                              />
                            </div>
                            <div className="w-20">
                              <input
                                type="number"
                                placeholder="Qtd"
                                value={addr.totalMachines || ''}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  const newArr = [...routeModal.tempAddresses];
                                  newArr[idx].totalMachines = isNaN(val) ? 0 : val;
                                  setRouteModal(prev => ({ ...prev, tempAddresses: newArr }));
                                }}
                                className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-center outline-none focus:border-purple-500"
                                min="0"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const newArr = [...routeModal.tempAddresses];
                                newArr.splice(idx, 1);
                                setRouteModal(prev => ({ ...prev, tempAddresses: newArr }));
                              }}
                              className="p-1.5 text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 rounded-lg shrink-0"
                              title="Remover endereço manual"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
              <button 
                onClick={() => setRouteModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveRoute}
                disabled={loading || !routeModal.name.trim() || !routeModal.number.trim() || !!routeNumberConflict}
                className={cn(
                  "px-6 py-2 text-white text-sm font-bold rounded-xl transition-all shadow-md flex items-center gap-2",
                  (routeNumberConflict || !routeModal.name.trim() || !routeModal.number.trim() || loading)
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed shadow-none"
                    : "bg-blue-600 hover:bg-blue-700 shadow-blue-200 cursor-pointer"
                )}
                title={routeNumberConflict ? `Bloqueado: O número "${routeNumberConflict.conflictingNumber}" já pertence à rota "${routeNumberConflict.conflictingRouteName}"` : "Salvar Rota"}
              >
                <Save className="w-4 h-4" />
                Salvar Rota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Seletor de Endereços Reais de Outras Rotas */}
      {realAddressSelectorOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-purple-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-800 flex items-center justify-center text-purple-200">
                  <ListPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm uppercase tracking-wider text-white">
                    Incluir Endereços Reais de Outras Rotas
                  </h3>
                  <p className="text-[11px] text-purple-200">
                    Mês de Referência: <b>{format(parseISO(month + '-01'), 'MMMM yyyy', { locale: ptBR })}</b>
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setRealAddressSelectorOpen(false);
                  setSelectedRealAddressIds([]);
                }}
                className="p-1.5 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Aviso Regra de Negócio */}
            <div className="bg-purple-50/70 border-b border-purple-100 p-3 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
              <div className="text-[11px] text-purple-900 leading-tight">
                <b>Regras importantes da Rota Temporária:</b>
                <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-purple-800">
                  <li>Somente endereços <b>AINDA NÃO CONCLUÍDOS</b> no mês aparecem para seleção.</li>
                  <li>Ao serem incluídos, eles <b>saem da rota original</b> e ficam registrados na rota temporária neste mês para evitar duplicações.</li>
                  <li>Na <b>virada do mês</b>, eles retornam automaticamente para suas rotas originais, sem duplicar a rota temporária.</li>
                </ul>
              </div>
            </div>

            {/* Filtros e Busca */}
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 space-y-2.5 shrink-0">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Buscar por cliente, endereço, bairro, cidade ou rota..."
                    value={realAddressSearch}
                    onChange={(e) => setRealAddressSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-gray-200 rounded-xl outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                  />
                  {realAddressSearch && (
                    <button
                      type="button"
                      onClick={() => setRealAddressSearch('')}
                      className="absolute right-2.5 top-2.5 text-xs text-gray-400 hover:text-gray-600 font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="w-full sm:w-56">
                  <select
                    value={realAddressFilterRoute}
                    onChange={(e) => setRealAddressFilterRoute(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl outline-none focus:border-purple-500 font-medium"
                  >
                    <option value="ALL">Todas as Rotas de Origem</option>
                    {Array.from(new Set(addresses.map(a => a.route || 'Sem Rota'))).sort().map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Barra de Seleção Rápida */}
              <div className="flex items-center justify-between text-xs text-gray-600 pt-1">
                <div>
                  <span><b>{eligibleRealAddresses.length}</b> locais elegíveis encontrados</span>
                  {selectedRealAddressIds.length > 0 && (
                    <span className="ml-2 font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                      {selectedRealAddressIds.length} selecionado(s)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRealAddressIds(eligibleRealAddresses.map(a => a.id));
                    }}
                    className="text-[11px] font-bold text-purple-700 hover:underline cursor-pointer"
                  >
                    Selecionar Todos ({eligibleRealAddresses.length})
                  </button>
                  {selectedRealAddressIds.length > 0 && (
                    <>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => setSelectedRealAddressIds([])}
                        className="text-[11px] font-bold text-gray-500 hover:underline cursor-pointer"
                      >
                        Desmarcar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Lista Scrollável de Endereços Elegíveis */}
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {eligibleRealAddresses.length === 0 ? (
                <div className="p-10 text-center text-gray-400">
                  <MapPin className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p className="font-bold text-sm text-gray-600">Nenhum endereço elegível encontrado</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Verifique os termos de busca ou o filtro de rotas. Lembre-se que endereços já concluídos no mês não podem ser transferidos.
                  </p>
                </div>
              ) : (
                eligibleRealAddresses.map(addr => {
                  const client = clients.find(c => c.id === addr.clientId);
                  const recordThisMonth = records.find(r => r.addressId === addr.id && r.month === month);
                  const isChecked = selectedRealAddressIds.includes(addr.id);

                  return (
                    <label
                      key={addr.id}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none",
                        isChecked 
                          ? "bg-purple-50/70 border-purple-300 ring-1 ring-purple-300" 
                          : "bg-white border-gray-200 hover:bg-gray-50"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRealAddressIds(prev => [...prev, addr.id]);
                          } else {
                            setSelectedRealAddressIds(prev => prev.filter(id => id !== addr.id));
                          }
                        }}
                        className="mt-1 w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <span className="font-extrabold text-xs text-gray-900">
                            {client?.name || 'Cliente'}
                          </span>
                          <span className="px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider bg-gray-100 text-gray-700 rounded border border-gray-200">
                            Rota Atual: {addr.route || 'Sem Rota'}
                          </span>
                          {recordThisMonth?.status && recordThisMonth.status !== MaintenanceStatus.PENDING && (
                            <span className="px-1.5 py-0.2 text-[9px] font-bold bg-amber-100 text-amber-800 rounded">
                              Em Andamento
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-gray-600 leading-tight">
                          {addr.street}{addr.number ? `, ${addr.number}` : ''}{addr.neighborhood ? ` - ${addr.neighborhood}` : ''}{addr.city ? `, ${addr.city}` : ''}
                        </p>

                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400 font-medium">
                          <span>{addr.totalMachines || 0} máquina(s)</span>
                          {addr.notes && (
                            <span className="truncate max-w-[200px]" title={addr.notes}>
                              Obs: {addr.notes}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            {/* Rodapé */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
              <span className="text-xs text-gray-500 font-medium">
                {selectedRealAddressIds.length} local(is) selecionado(s) para inclusão
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRealAddressSelectorOpen(false);
                    setSelectedRealAddressIds([]);
                  }}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAddRealAddresses}
                  disabled={selectedRealAddressIds.length === 0}
                  className={cn(
                    "px-5 py-2 text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5",
                    selectedRealAddressIds.length === 0
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-200 cursor-pointer active:scale-95"
                  )}
                >
                  <Check className="w-3.5 h-3.5" />
                  Incluir na Rota ({selectedRealAddressIds.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Excluir Rota?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Você está prestes a remover a configuração da rota <b>{deleteConfirm.routeName}</b>. Isso não removerá os endereços, eles ficarão sem rota atribuída.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteConfirm({ isOpen: false, routeName: '' })}
                  disabled={loading}
                  className="flex-1 px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all disabled:opacity-50"
                >
                  Manter
                </button>
                <button 
                  onClick={handleDeleteRoute}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-red-100 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" />
                      Excluindo...
                    </>
                  ) : (
                    'Sim, Excluir'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Address Selection Modal */}
      {addressSelectionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in print:static print:block print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] print:block print:w-full print:max-h-none print:border-none print:shadow-none print:rounded-none">
            <div className="p-4 bg-gray-800 border-b flex items-center justify-between shrink-0 print:hidden">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-wider">
                <ListChecks className="w-4 h-4" />
                Vincular Locais à Rota "{addressSelectionModal.routeName}"
              </h3>
              <button 
                onClick={() => setAddressSelectionModal({ isOpen: false, routeName: '' })}
                className="p-1 hover:bg-white/10 rounded-full text-white/60 transition-colors"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Print Header (Visible only in print) */}
            {(() => {
              const currentRouteName = addressSelectionModal.routeName;
              const currentRouteDetail = routeStats[currentRouteName];
              const plannedDate = currentRouteDetail?.plannedDate;
              const returnDate = currentRouteDetail?.returnDate;
              
              const formattedDeparture = plannedDate 
                ? format(parseISO(plannedDate), 'dd/MM/yyyy') 
                : null;
              const formattedReturn = returnDate 
                ? format(parseISO(returnDate), 'dd/MM/yyyy') 
                : null;
              
              let durationDaysTxt = '';
              if (plannedDate && returnDate) {
                try {
                  const start = parseISO(plannedDate);
                  const end = parseISO(returnDate);
                  const diffTime = Math.abs(end.getTime() - start.getTime());
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  const displayDays = diffDays + 1;
                  durationDaysTxt = `(${displayDays} ${displayDays === 1 ? 'dia' : 'dias'})`;
                } catch (e) {
                  console.error(e);
                }
              }

              return (
                <div className="hidden print:block p-8 pb-4">
                  <div className="flex items-center justify-between border-b-2 border-gray-900 pb-4 mb-4">
                    <div>
                      <h1 className="text-2xl font-black text-gray-900">{currentRouteName}</h1>
                      <p className="text-gray-500 font-medium">Lista de locais de atendimento</p>
                    </div>
                    <div className="text-right text-sm font-medium">
                      <p>Mês: <b>{format(parseISO(month + '-01'), 'MMMM yyyy', { locale: ptBR })}</b></p>
                      {formattedDeparture && formattedReturn ? (
                        <p>Período: <b>{formattedDeparture} a {formattedReturn} {durationDaysTxt && <span className="text-gray-600 font-semibold">{durationDaysTxt}</span>}</b></p>
                      ) : formattedDeparture ? (
                        <p>Previsão: <b>{formattedDeparture}</b></p>
                      ) : null}
                      {currentRouteDetail?.config?.technician1 && (
                        <p>Técnicos: <b>{currentRouteDetail.config.technician1}</b>
                          {currentRouteDetail.config.technician2 ? ` e ${currentRouteDetail.config.technician2}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="p-0 overflow-y-auto flex-1 print:overflow-visible">
              <div className="bg-gray-50 p-4 border-b border-gray-100 flex flex-col gap-4 print:hidden">
                <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                  <div className="flex-1">
                     <p className="text-sm text-gray-600 font-medium leading-relaxed">
                       Selecione quais endereços desta rota serão atendidos no mês de <b>{format(parseISO(month + '-01'), 'MMMM yyyy', { locale: ptBR })}</b>.
                     </p>
                     {(() => {
                       const currentRouteName = addressSelectionModal.routeName;
                       const currentRouteDetail = routeStats[currentRouteName];
                       const plannedDate = currentRouteDetail?.plannedDate;
                       const returnDate = currentRouteDetail?.returnDate;
                       
                       if (!plannedDate) return null;
                       
                       const formattedDeparture = format(parseISO(plannedDate), 'dd/MM/yyyy');
                       const formattedReturn = returnDate ? format(parseISO(returnDate), 'dd/MM/yyyy') : null;
                       
                       let durationDaysTxt = '';
                       if (plannedDate && returnDate) {
                         try {
                           const start = parseISO(plannedDate);
                           const end = parseISO(returnDate);
                           const diffTime = Math.abs(end.getTime() - start.getTime());
                           const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                           const displayDays = diffDays + 1;
                           durationDaysTxt = `(${displayDays} ${displayDays === 1 ? 'dia' : 'dias'})`;
                         } catch (e) {
                           console.error(e);
                         }
                       }
                       return (
                         <p className="text-xs text-blue-600 font-bold mt-1">
                           Período programado: {formattedDeparture} a {formattedReturn || 'Retorno não definido'} {durationDaysTxt}
                         </p>
                       );
                     })()}
                  </div>
                  <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 shrink-0 w-full lg:w-auto">
                    <div className="flex flex-col gap-1 w-full md:w-auto">
                      <button
                        onClick={() => handleToggleAllAddressesInRoute(addressSelectionModal.routeName, true)}
                        className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors text-center w-full md:w-auto"
                      >
                        Selecionar Todos
                      </button>
                      <button
                        onClick={() => handleToggleAllAddressesInRoute(addressSelectionModal.routeName, false)}
                        className="text-[10px] font-bold uppercase tracking-widest text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors text-center w-full md:w-auto"
                      >
                        Desmarcar Todos
                      </button>
                    </div>
                    <div className="flex flex-row md:flex-col gap-4 md:gap-1.5 items-center md:items-start pt-2 md:pt-0 border-t md:border-t-0 md:border-l border-gray-200 md:pl-4 justify-around w-full md:w-auto">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showOnlySelected}
                          onChange={(e) => setShowOnlySelected(e.target.checked)}
                          className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-gray-700 leading-none">Somente selecionados</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showOtherRoutes}
                          onChange={(e) => setShowOtherRoutes(e.target.checked)}
                          className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-indigo-700 leading-none">Incluir outras rotas</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Barra de pesquisa inteligente */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                    <Search className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    placeholder="Pesquise por cliente, endereço ou rota de origem..."
                    value={addressSearchQuery}
                    onChange={(e) => setAddressSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder:text-gray-400"
                  />
                  {addressSearchQuery && (
                    <button
                      onClick={() => setAddressSearchQuery('')}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>
              <div className="p-4 space-y-2 print:p-8 print:pt-0">
                {sortedAddresses.map(addr => {
                  const client = clients.find(c => c.id === addr.clientId);
                  const currentRouteName = addressSelectionModal.routeName;
                  const record = records.find(r => 
                    r.addressId === addr.id && 
                    r.month === month && 
                    (r.assignedRoute || (r.isTemporaryRoute ? r.temporaryRouteName : (addr.route || 'Sem Rota'))) === currentRouteName
                  );
                  const isIncluded = !!record;
                  const tempAssignedRecord = records.find(r => 
                    r.addressId === addr.id && 
                    r.month === month && 
                    r.isTemporaryRoute &&
                    (r.assignedRoute || r.temporaryRouteName) &&
                    (r.assignedRoute || r.temporaryRouteName) !== currentRouteName
                  );
                  const hasOpenCall = serviceCalls.some(c => c.addressId === addr.id && c.status !== 'resolved');
                  return (
                    <div 
                      key={addr.id} 
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-xl border transition-all print:border-b print:rounded-none print:border-x-0 print:border-t-0 print:border-gray-200 print:mb-2 print:p-2",
                        isIncluded ? "border-emerald-200 bg-emerald-50/30 print:bg-transparent" : "border-gray-200",
                        !isIncluded && showOnlySelected ? "hidden" : "hover:bg-gray-50/80"
                      )}
                    >
                      <input 
                        id={`chk-${addr.id}`}
                        type="checkbox"
                        checked={isIncluded}
                        onChange={(e) => handleToggleAddressInRoute(addressSelectionModal.routeName, addr.id, e.target.checked)}
                        className="mt-2.5 w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 print:hidden cursor-pointer shrink-0"
                      />

                      {/* Coluna de Ordenamento para Impressão */}
                      <div className="flex flex-col items-center gap-0.5 shrink-0 min-w-[36px]">
                        <span className="text-[8px] font-black uppercase tracking-wider text-gray-400 print:hidden leading-none mb-1">Ordem</span>
                        
                        {/* Screen mode: Interactive Input */}
                        <input 
                          type="number"
                          min="1"
                          disabled={!isIncluded}
                          placeholder="-"
                          value={orderValueMap[addr.id] !== undefined ? orderValueMap[addr.id] : (record?.itineraryOrder !== undefined && record?.itineraryOrder !== null ? record.itineraryOrder : '')}
                          onChange={(e) => {
                            const val = e.target.value;
                            setOrderValueMap(prev => ({ ...prev, [addr.id]: val }));
                          }}
                          onBlur={() => {
                            const val = orderValueMap[addr.id] !== undefined ? orderValueMap[addr.id] : (record?.itineraryOrder !== undefined && record?.itineraryOrder !== null ? record.itineraryOrder : '');
                            handleUpdateAddressOrder(addressSelectionModal.routeName, addr.id, String(val));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = orderValueMap[addr.id] !== undefined ? orderValueMap[addr.id] : (record?.itineraryOrder !== undefined && record?.itineraryOrder !== null ? record.itineraryOrder : '');
                              handleUpdateAddressOrder(addressSelectionModal.routeName, addr.id, String(val));
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className={cn(
                            "print:hidden w-10 h-8 text-center text-xs font-black bg-white border rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                            isIncluded 
                              ? "border-emerald-200 text-emerald-950 bg-emerald-50/20" 
                              : "border-gray-200 text-gray-400 bg-gray-50/50 cursor-not-allowed opacity-40"
                          )}
                          title={isIncluded ? "Defina a ordem de atendimento na folha de impressão" : "Selecione o local primeiro para definir a ordem"}
                        />

                        {/* Print mode: Static elegant badge for printed document */}
                        {isIncluded && record?.itineraryOrder ? (
                          <span className="hidden print:inline-flex items-center justify-center font-mono text-xs font-black bg-gray-150 border border-gray-400 rounded-md h-6 min-w-[28px] text-gray-900 leading-none">
                            #{record.itineraryOrder}
                          </span>
                        ) : isIncluded ? (
                          <span className="hidden print:inline-flex items-center justify-center font-mono text-xs font-black bg-gray-100 border border-gray-300 rounded-md h-6 min-w-[28px] text-gray-400 leading-none">
                            -
                          </span>
                        ) : null}
                      </div>

                      <label htmlFor={`chk-${addr.id}`} className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 cursor-pointer">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className={cn("text-sm font-bold print:text-black", isIncluded ? "text-emerald-900 font-extrabold" : "text-gray-900")}>
                              {client?.name || 'Cliente desconhecido'}
                            </h4>
                            {addr.route && addr.route !== addressSelectionModal.routeName && (
                              <span className="inline-flex items-center text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-md leading-none select-none shrink-0 print:hidden">
                                Rota Original: {addr.route}
                              </span>
                            )}
                            {tempAssignedRecord && (
                              <span className="inline-flex items-center text-[10px] font-extrabold uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-md leading-none select-none shrink-0 print:hidden">
                                Em Viagem Temporária: {tempAssignedRecord.assignedRoute || tempAssignedRecord.temporaryRouteName}
                              </span>
                            )}
                            {hasOpenCall && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md leading-none select-none shrink-0">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                Chamado em Aberto
                              </span>
                            )}
                          </div>
                          <p className={cn("text-xs mt-1 print:text-gray-700", isIncluded ? "text-emerald-700/80" : "text-gray-500")}>
                            {addr.street}, {addr.number} {addr.complement ? `- ${addr.complement}` : ''} - {addr.neighborhood}
                          </p>
                        </div>

                        <div className="flex items-center gap-4 shrink-0 sm:ml-4">
                          {/* Coluna Total de Máquinas */}
                          <div className="text-left sm:text-right sm:min-w-[120px] print:text-black">
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Total de Máquinas</span>
                            <span className={cn("text-xs font-black font-mono", isIncluded ? "text-emerald-850" : "text-gray-700")}>
                              {addr.totalMachines || 0} máq.
                            </span>
                          </div>

                          {/* Cidade/Estado */}
                          <div className="text-right sm:min-w-[100px]">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 bg-gray-100 px-2.5 py-1 rounded-md print:bg-transparent print:border print:border-gray-300">
                              {addr.city}/{addr.state}
                            </span>
                          </div>
                        </div>
                      </label>
                      <div className="hidden print:block w-32 border-b border-gray-400 mt-4 h-4"></div>
                    </div>
                  );
                })}
                {sortedAddresses.length === 0 && (
                  <div className="py-8 text-center text-gray-500 text-sm font-medium">
                    Nenhum endereço encontrado com o filtro atual.
                  </div>
                )}

                {/* Imagens do Mapa do Roteiro (Ida e Volta) */}
                {(() => {
                  const currentRouteName = addressSelectionModal.routeName;
                  const currentRouteDetail = routeStats[currentRouteName];
                  const map1Url = currentRouteDetail?.routeMap1Url || '';
                  const map2Url = currentRouteDetail?.routeMap2Url || '';
                  
                  return (
                    <div className="mt-6 space-y-6">
                      {/* Interactive Section (Only on Screen) */}
                      <div className="print:hidden border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-4">
                        <h4 className="text-xs font-black uppercase text-gray-605 tracking-wider flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-blue-650" /> Mapas do Roteiro da Viagem
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">1. Mapa do Trajeto de Ida</span>
                            <div className="bg-white p-2 border border-gray-200 rounded-xl shadow-sm">
                              <ImageUploader 
                                value={map1Url} 
                                onChange={async (val) => {
                                  await updateRouteRecords(currentRouteName, { routeMap1Url: val });
                                }} 
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">2. Mapa do Trajeto de Volta</span>
                            <div className="bg-white p-2 border border-gray-200 rounded-xl shadow-sm">
                              <ImageUploader 
                                value={map2Url} 
                                onChange={async (val) => {
                                  await updateRouteRecords(currentRouteName, { routeMap2Url: val });
                                }} 
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Printed maps layout (extended full width horizontally in a single column) */}
                      {map1Url && (
                        <div className="hidden print:block w-full mt-6 mb-4 break-inside-avoid">
                          <h5 className="text-[10px] uppercase font-black tracking-wider text-gray-950 border-b border-gray-400 pb-1 mb-2">
                            Mapa do Roteiro - Trajeto de Ida
                          </h5>
                          <img 
                            src={map1Url} 
                            alt="Mapa do trajeto de ida" 
                            className="w-full h-auto rounded-lg border border-gray-300 object-contain max-h-[380px]" 
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}

                      {map2Url && (
                        <div className="hidden print:block w-full mt-6 mb-4 break-inside-avoid">
                          <h5 className="text-[10px] uppercase font-black tracking-wider text-gray-950 border-b border-gray-400 pb-1 mb-2">
                            Mapa do Roteiro - Trajeto de Volta
                          </h5>
                          <img 
                            src={map2Url} 
                            alt="Mapa do trajeto de volta" 
                            className="w-full h-auto rounded-lg border border-gray-300 object-contain max-h-[380px]" 
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Observações da Rota na Impressão e Tela */}
                {(() => {
                  const currentRouteName = addressSelectionModal.routeName;
                  const currentRouteDetail = routeStats[currentRouteName];
                  const routeNotes = currentRouteDetail?.routeNotes;
                  const costItems = currentRouteDetail?.routeCostItems || [];
                  const totalCosts = costItems.reduce((acc, item) => acc + (item.value || 0), 0);

                  return (
                    <>
                      {routeNotes && routeNotes.trim() && (
                        <div className="mt-6 border border-amber-200 bg-amber-50/20 rounded-xl p-4 print:border-gray-400 print:bg-transparent print:mt-8">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-amber-600 print:text-black" />
                            <h5 className="text-xs font-black uppercase text-amber-800 tracking-wider print:text-black">Observações da Rota</h5>
                          </div>
                          <p className="text-xs text-gray-700 leading-relaxed font-semibold whitespace-pre-line font-sans antialiased pl-0.5 print:text-black">
                            {routeNotes}
                          </p>
                        </div>
                      )}

                      {costItems && costItems.length > 0 && (
                        <div className="mt-6 border border-indigo-150 bg-indigo-50/10 rounded-xl p-4 print:border-gray-400 print:bg-transparent print:mt-6 print:break-inside-avoid">
                          <div className="flex items-center justify-between border-b border-indigo-100/40 pb-2.5 mb-3 print:border-gray-300">
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-4 h-4 text-indigo-600 print:text-black" />
                              <h5 className="text-xs font-black uppercase text-indigo-800 tracking-wider print:text-black">Custos Previstos / Programados</h5>
                            </div>
                            <div className="text-[10px] uppercase font-black tracking-wider text-indigo-600 print:text-black">
                              {costItems.length} {costItems.length === 1 ? 'item' : 'itens'} solicitados
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            {costItems.map((item) => (
                              <div key={item.id} className="flex justify-between items-center text-xs border-b border-dashed border-gray-100 pb-2 last:border-none last:pb-0 print:border-gray-200">
                                <div className="min-w-0 flex-1">
                                  <span className="font-bold text-gray-800 print:text-black block">{item.description}</span>
                                  {item.date && (
                                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block mt-0.5">
                                      Previsão para: {format(parseISO(item.date), 'dd/MM/yyyy')}
                                    </span>
                                  )}
                                </div>
                                <div className="text-right shrink-0 ml-4">
                                  <span className="font-extrabold font-mono text-gray-950 print:text-black">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          <div className="mt-4 pt-3 border-t border-indigo-100 flex justify-between items-center print:border-gray-300">
                            <span className="text-[10px] font-black uppercase text-indigo-800 tracking-wider print:text-black">Custo Previsto Total</span>
                            <span className="text-sm font-black font-mono text-indigo-950 print:text-black">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCosts)}
                            </span>
                          </div>

                          {(() => {
                            const cardId = currentRouteDetail?.routeCardId;
                            const card = travelCards.find(c => c.id === cardId);
                            if (!card) return null;
                            return (
                              <div className="mt-3 pt-3 border-t border-dashed border-indigo-100/60 flex items-center justify-between text-xs print:border-gray-300">
                                <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider print:text-black flex items-center gap-1">
                                  💳 Cartão para Depósito
                                </span>
                                <span className="font-extrabold text-blue-700 print:text-black font-sans uppercase text-[11px]">
                                  {card.bank} final {card.lastFourDigits} - {card.holderName}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="p-4 bg-gray-50 border-t flex items-center justify-between shrink-0 print:hidden">
               <button
                 onClick={() => {
                   setShowOnlySelected(true);
                   setTimeout(() => window.print(), 100);
                 }}
                 className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 text-sm font-bold rounded-xl transition-all"
               >
                 <Printer className="w-4 h-4" />
                 Imprimir PDF
               </button>
               <button 
                onClick={() => setAddressSelectionModal({ isOpen: false, routeName: '' })}
                className="px-6 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-bold rounded-xl transition-all shadow-md"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cost Prediction Modal */}
      {costCalculatorModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
               <div>
                  <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-blue-600" />
                    Previsão de Custos - {costCalculatorModal.routeName}
                  </h3>
                  <p className="text-[10px] text-gray-400 font-bold mt-0.5 uppercase tracking-wider">Gestão Financeira Auxiliar</p>
               </div>
               <button 
                type="button"
                onClick={() => setCostCalculatorModal({ isOpen: false, routeName: '' })}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer border-0 bg-transparent"
               >
                 <X className="w-5 h-5 text-gray-400" />
               </button>
            </div>

            {/* Content info & list */}
            <div className="p-5 overflow-y-auto max-h-[60vh] space-y-4">
              {/* Trip Dates Info */}
              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-wider text-blue-600 block">Duração e Período</span>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800 mt-1">
                    <CalendarDays className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>{formattedDeparture} a {formattedReturn}</span>
                  </div>
                </div>
                {durationText && (
                  <div className="bg-blue-100/50 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-black self-start sm:self-auto">
                    {durationText} de Viagem
                  </div>
                )}
              </div>

              {/* Card Selector */}
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2">
                <div className="flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-gray-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Cartão de Pagamento da Viagem</span>
                </div>
                <select
                  value={selectedCardId}
                  onChange={(e) => setSelectedCardId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 outline-none focus:border-blue-500 bg-white cursor-pointer"
                >
                  <option value="">Nenhum cartão selecionado</option>
                  {travelCards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.bank} final {card.lastFourDigits} - {card.holderName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Form Input for New Expense */}
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">Nova Despesa</span>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-3">
                    <input 
                      type="date"
                      value={newItemDate}
                      min={activeRouteDataForCalculator?.plannedDate || ''}
                      max={activeRouteDataForCalculator?.returnDate || ''}
                      onChange={(e) => setNewItemDate(e.target.value)}
                      className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-800 outline-none focus:border-blue-500 bg-white"
                      title="Data de ocorrência da despesa"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <input 
                      type="text"
                      placeholder="Ex: Jantar, Hospedagem, Almoço..."
                      value={newItemDesc}
                      onChange={(e) => setNewItemDesc(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddCostItem();
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 outline-none focus:border-blue-500 bg-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 font-mono">R$</span>
                      <input 
                        type="text"
                        placeholder="0,00"
                        value={newItemValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/^[0-9]*[.,]?[0-9]*$/.test(val)) {
                            setNewItemValue(val);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddCostItem();
                        }}
                        className="w-full pl-7 pr-1.5 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-800 outline-none focus:border-blue-500 bg-white text-right font-mono"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddCostItem}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold h-full py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1 transition-all shadow-sm cursor-pointer border-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> ADD
                    </button>
                  </div>
                </div>
                {!activeRouteDataForCalculator?.plannedDate || !activeRouteDataForCalculator?.returnDate ? (
                  <p className="text-[10px] text-red-500 font-black mt-1">
                    ⚠️ Atenção: Defina as datas de Saída e Retorno na rota para habilitar a inclusão de despesas.
                  </p>
                ) : (
                  <p className="text-[9px] text-gray-400 font-black">
                    * Permitido apenas datas entre {formattedDeparture} e {formattedReturn}.
                  </p>
                )}
              </div>

              {/* Expenses list */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                  Itens Cadastrados ({modalCostItems.length})
                </span>
                
                {modalCostItems.length === 0 ? (
                  <div className="border border-dashed border-gray-200 rounded-xl py-6 text-center text-xs text-gray-400 font-medium bg-white">
                    Nenhuma despesa adicionada para este planejamento.
                  </div>
                ) : (
                  <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 overflow-hidden bg-white shadow-sm max-h-[30vh] overflow-y-auto">
                    {modalCostItems.map((item) => (
                      <div key={item.id} className="p-3 flex items-center justify-between hover:bg-gray-50/40 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-gray-800">{item.description}</span>
                            {item.date && (
                              <span className="text-[10px] text-gray-400 font-black font-mono mt-0.5">
                                Data: {format(parseISO(item.date), 'dd/MM/yyyy')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-gray-900 font-mono">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCostItem(item.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer border-0 bg-transparent"
                            title="Remover despesa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer with Summary and SAVE button */}
            <div className="p-4 bg-gray-50 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-wider text-gray-400">Total Previsto da Rota</span>
                <span className="text-lg font-black text-blue-700 font-mono">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                    modalCostItems.reduce((acc, curr) => acc + curr.value, 0)
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setCostCalculatorModal({ isOpen: false, routeName: '' })}
                  className="px-4 py-2 border border-gray-200 hover:bg-gray-100 text-gray-600 hover:text-gray-800 text-xs font-bold rounded-lg transition-all cursor-pointer bg-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const totalVal = modalCostItems.reduce((acc, curr) => acc + curr.value, 0);
                    try {
                      await updateRouteRecords(activeRouteNameForCalculator, { 
                        routeCostItems: modalCostItems,
                        routeEstimatedCost: Number(totalVal),
                        routeCardId: selectedCardId || ''
                      });
                      setCostCalculatorModal({ isOpen: false, routeName: '' });
                    } catch (error) {
                      console.error('Erro ao salvar custos:', error);
                      alert('Erro ao salvar custos da rota.');
                    }
                  }}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-lg transition-all shadow-md flex items-center gap-1.5 cursor-pointer border-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  Salvar Previsão
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Route Control Summary Print Modal (A4) */}
      {routeControlPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in print:static print:block print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh] print:block print:w-full print:max-h-none print:border-none print:shadow-none print:rounded-none">
            
            {/* Modal Header (Hidden in Print) */}
            <div className="p-4 bg-gray-800 border-b flex items-center justify-between shrink-0 print:hidden">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-wider">
                <ListChecks className="w-4.5 h-4.5 text-emerald-400" />
                Controle de Rotas do Mês - Impressão A4
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    window.focus();
                    setTimeout(() => window.print(), 200);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold transition-all shadow-sm cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir Folha A4
                </button>
                <button 
                  onClick={() => setRouteControlPrintModalOpen(false)}
                  className="p-1 hover:bg-white/10 rounded-full text-white/60 transition-colors cursor-pointer"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Document container */}
            <div className="flex-1 p-6 overflow-y-auto bg-gray-50/50 print:bg-white print:p-0 print:overflow-visible">
              
              {/* Document Wrapper */}
              <div className="mx-auto bg-white p-8 border border-gray-200 rounded-xl shadow-xs max-w-[210mm] print:border-none print:shadow-none print:p-0 print:m-0">
                
                {/* Header of the Sheet */}
                <div className="border-b-2 border-gray-950 pb-4 mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-xl font-extrabold text-gray-900 uppercase tracking-tight">
                      Le Frio Refrigeração
                    </h1>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-0.5">
                      Controle Geral de Rotas e Cronogramas
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-block px-3 py-1 bg-gray-100 rounded-lg text-xs font-black text-gray-700 uppercase tracking-wide">
                      Referência: {format(parseISO(month + '-01'), 'MMMM / yyyy', { locale: ptBR })}
                    </span>
                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">
                      Gerado em: {format(new Date(), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                </div>

                {/* KPI/Status Summary Section */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="border border-gray-200 rounded-lg p-3 text-center bg-gray-50/55">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Total de Rotas</span>
                    <span className="text-lg font-black text-gray-800 font-mono mt-0.5 block">
                      {printControlFinancialSummary.routesCount}
                    </span>
                    <span className="text-[8px] text-gray-400 font-black uppercase tracking-wide leading-none block mt-0.5">
                      {printControlFinancialSummary.completedRoutesCount} Concluídas | {printControlFinancialSummary.routesCount - printControlFinancialSummary.completedRoutesCount} Pendentes
                    </span>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-3 text-center bg-gray-50/55">
                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block">Custo Previsto Total</span>
                    <span className="text-lg font-black text-emerald-700 font-mono mt-0.5 block">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(printControlFinancialSummary.totalEstimated)}
                    </span>
                    <span className="text-[8px] text-emerald-600/75 font-black uppercase tracking-wide leading-none block mt-0.5">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(printControlFinancialSummary.totalCompletedCosts)} custos concluídos
                    </span>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-3 text-center bg-emerald-50/30 border-emerald-100">
                    <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest block">Valor Total Gerado</span>
                    <span className="text-lg font-black text-blue-700 font-mono mt-0.5 block">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(printControlFinancialSummary.totalServicesValue)}
                    </span>
                    <span className="text-[8px] text-blue-600/75 font-black uppercase tracking-wide leading-none block mt-0.5">
                      Valores de Rotas Ativas
                    </span>
                  </div>
                </div>

                {/* Detailed Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b-2 border-gray-300 text-[10px] font-black text-gray-700 uppercase bg-gray-50">
                        <th className="py-2.5 px-3">Rota</th>
                        <th className="py-2.5 px-2 text-center">Status</th>
                        <th className="py-2.5 px-2 text-center">Data Saída / Retorno</th>
                        <th className="py-2.5 px-2">Técnicos Escalados</th>
                        <th className="py-2.5 px-2 text-center font-semibold whitespace-nowrap">Qtd. O.S</th>
                        <th className="py-2.5 px-2 text-right font-semibold">Custo Previsto</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Valor Gerado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {printControlRoutes.map(([name, data]) => {
                        const formattedPlanned = data.plannedDate 
                          ? format(parseISO(data.plannedDate), 'dd/MM/yyyy') 
                          : '';
                        const formattedReturn = data.returnDate 
                          ? format(parseISO(data.returnDate), 'dd/MM/yyyy') 
                          : '';
                        
                        const dateText = formattedPlanned 
                          ? `${formattedPlanned}${formattedReturn && formattedReturn !== formattedPlanned ? ` a ${formattedReturn}` : ''}`
                          : 'A definir';

                        const card = travelCards.find(c => c.id === data.routeCardId);
                        const cardDetails = card ? `${card.bank} final ${card.lastFourDigits} - ${card.holderName}` : '';

                        const assignedTechs = [data.config?.technician1, data.config?.technician2]
                          .filter(Boolean)
                          .join(' & ');

                        return (
                          <tr key={name} className="hover:bg-gray-50/40">
                            {/* Rota */}
                            <td className="py-3 px-3">
                              <span className="font-extrabold text-gray-900 block leading-tight">{name}</span>
                              <span className="text-[9px] text-gray-400 font-extrabold uppercase mt-0.5 block leading-none">
                                {data.records.length} {data.records.length === 1 ? 'Endereço registrado' : 'Endereços registrados'}
                              </span>
                              {cardDetails && (
                                <span className="text-[9px] text-blue-600 font-black mt-1.5 flex items-center gap-1 leading-none uppercase print:text-black">
                                  💳 {cardDetails}
                                </span>
                              )}
                            </td>
                            {/* Status */}
                            <td className="py-3 px-2 text-center">
                              <span className={cn(
                                "inline-block text-[9px] font-black px-2 py-0.5 rounded-md border uppercase tracking-wide leading-none",
                                data.status === 'completed' 
                                  ? "text-emerald-700 bg-emerald-50 border-emerald-200" 
                                  : data.status === 'partial'
                                  ? "text-amber-700 bg-amber-50 border-amber-200"
                                  : "text-gray-500 bg-gray-50 border-gray-200"
                              )}>
                                {data.status === 'completed' ? 'Concluída' : data.status === 'partial' ? 'Parcial' : 'Pendente'}
                              </span>
                            </td>
                            {/* Data Prevista */}
                            <td className="py-3 px-2 text-center font-mono font-bold text-gray-700">
                              {dateText}
                            </td>
                            {/* Técnicos */}
                            <td className="py-3 px-2 font-semibold text-gray-800">
                              {assignedTechs || <span className="text-gray-400 font-normal italic">Não escalado</span>}
                            </td>
                            {/* Qtd. O.S */}
                            <td className="py-3 px-2 text-center font-mono font-bold text-gray-700">
                              {data.routeServiceOrdersCount ?? 0}
                            </td>
                            {/* Custo Previsto */}
                            <td className="py-3 px-2 text-right font-mono font-bold text-gray-800">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.routeEstimatedCost || 0)}
                            </td>
                            {/* Valor Gerado (Se concluído) */}
                            <td className="py-3 px-3 text-right font-mono font-extrabold text-gray-900">
                              {data.status === 'completed' ? (
                                <span className="text-blue-700">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.routeServicesValue || 0)}
                                </span>
                              ) : (
                                <span className="text-gray-400 font-normal">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-400 bg-gray-50/50 font-extrabold text-gray-900">
                      <tr>
                        <td colSpan={4} className="py-2.5 px-3 text-right uppercase tracking-wider font-extrabold text-[10px] text-gray-500">
                          Total Geral
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-gray-900 font-extrabold">
                          {printControlFinancialSummary.totalServiceOrders}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-gray-900 font-extrabold">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(printControlFinancialSummary.totalEstimated)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-blue-700 font-black">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(printControlFinancialSummary.totalServicesValue)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Footer notes on Sheet */}
                <div className="mt-8 pt-4 border-t-2 border-gray-200 text-[10px] text-gray-400 text-center font-bold uppercase tracking-wider flex justify-between">
                  <span>Le Frio Soluções Em Refrigeração</span>
                  <span>Documento Oficial de Planejamento de Rotas</span>
                </div>

              </div>
            </div>

            {/* Modal Footer (Hidden in Print) */}
            <div className="p-4 bg-gray-50 border-t flex justify-end gap-2 shrink-0 print:hidden">
              <button
                type="button"
                onClick={() => setRouteControlPrintModalOpen(false)}
                className="px-4 py-2 border border-gray-200 hover:bg-gray-100 text-gray-600 hover:text-gray-800 text-xs font-bold rounded-lg transition-all bg-white cursor-pointer"
              >
                Fechar Visualização
              </button>
              <button
                type="button"
                onClick={() => {
                  window.focus();
                  setTimeout(() => window.print(), 200);
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-lg transition-all shadow-md flex items-center gap-1.5 cursor-pointer border-0"
              >
                <Printer className="w-4 h-4" />
                Imprimir Agora
              </button>
            </div>

          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
}
