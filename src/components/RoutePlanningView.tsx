import { useState, useEffect, useMemo } from 'react';
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
  ListChecks
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { MaintenanceRecord, Address, Client, MaintenanceStatus, RouteConfiguration, RouteType, Technician } from '../types';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ImageUploader } from './ImageUploader';
import { cn } from '../lib/utils';

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
}

const RouteCard = ({ name, data, colors, technicians, onSetColor, onSetNotes, onSetPlannedDate, onSetReturnDate, onSetFinancials, onSetType, onSetStatus, onSetTechnicians, onEdit, onDelete, onOpenAddressSelection }: RouteCardProps) => {
  const [localNotes, setLocalNotes] = useState(data.routeNotes || '');
  const [localPlannedDate, setLocalPlannedDate] = useState(data.plannedDate || '');
  const [localReturnDate, setLocalReturnDate] = useState(data.returnDate || '');
  const [localEstimatedCost, setLocalEstimatedCost] = useState<number | ''>(data.routeEstimatedCost ?? '');
  const [localActualCost, setLocalActualCost] = useState<number | ''>(data.routeActualCost ?? '');
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
    setLocalEstimatedCost(data.routeEstimatedCost ?? '');
  }, [data.routeEstimatedCost]);

  useEffect(() => {
    setLocalActualCost(data.routeActualCost ?? '');
  }, [data.routeActualCost]);

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
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
      <div className="flex flex-col xl:flex-row xl:items-start p-4 gap-4 xl:gap-6">
        <div className="flex-1 xl:max-w-xs">
          <div className="flex items-center gap-3 mb-2">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
              data.routeColor ? "" : (
                data.status === 'completed' ? "bg-emerald-50 text-emerald-600" : 
                data.status === 'partial' ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
              )
            )} style={data.routeColor ? { backgroundColor: data.routeColor, color: 'white' } : {}}>
              <MapPin className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 text-lg uppercase tracking-tight">{name}</h3>
                <div className="flex items-center gap-1">
                  {data.config.type !== RouteType.TEMPORARY && (
                    <button 
                      onClick={() => onOpenAddressSelection(name)}
                      className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                      title="Selecionar locais de atendimento"
                    >
                      <ListChecks className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button 
                    onClick={() => onEdit(name)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                    title={data.config.type === RouteType.TEMPORARY ? "Editar Rota e Endereços" : "Editar nome da rota"}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => onDelete(name)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    title="Remover rota"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                {colors.map(c => (
                  <button
                    key={c.hex}
                    onClick={() => onSetColor(name, c.hex)}
                    className={cn(
                      "w-3 h-3 rounded-full transition-all border border-white hover:scale-125",
                      data.routeColor === c.hex ? "ring-2 ring-offset-1 ring-gray-400" : "opacity-40"
                    )}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row xl:flex-col gap-2 mt-2">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block w-[120px] shrink-0 xl:w-auto xl:mb-[-4px]">Categoria da Rota</label>
            <div className="flex bg-gray-100 p-0.5 rounded-lg w-fit">
              <button
                onClick={() => onSetType(name, RouteType.VARIABLE)}
                className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-bold transition-all",
                  data.config.type === RouteType.VARIABLE ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
                )}
              >
                Variável
              </button>
              <button
                onClick={() => onSetType(name, RouteType.FIXED)}
                className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-bold transition-all",
                  data.config.type === RouteType.FIXED ? "bg-white text-amber-600 shadow-sm" : "text-gray-500"
                )}
              >
                Pré-definida
              </button>
              <button
                onClick={() => onSetType(name, RouteType.TEMPORARY)}
                className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-bold transition-all",
                  data.config.type === RouteType.TEMPORARY ? "bg-white text-purple-600 shadow-sm" : "text-gray-500"
                )}
              >
                Temporária
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4 xl:gap-6 items-start">
            {/* Fixed Technicians if category is FIXED */}
            {data.config.type === RouteType.FIXED && (
              <div className="w-full md:w-auto xl:w-48 space-y-1.5 p-2 bg-amber-50/50 rounded-lg border border-amber-100 flex-shrink-0">
                <label className="text-[9px] font-black text-amber-600 uppercase tracking-widest block">Técnicos Fixos</label>
                <div className="flex flex-col gap-2">
                  <select
                    value={data.config.technician1 || ''}
                    onChange={(e) => onSetTechnicians(name, e.target.value, data.config.technician2)}
                    className="w-full px-2 py-1 bg-white border border-amber-200 rounded-md text-xs font-bold text-amber-900 outline-none"
                  >
                    <option value="">Técnico 1</option>
                    {technicians.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                  <select
                    value={data.config.technician2 || ''}
                    onChange={(e) => onSetTechnicians(name, data.config.technician1, e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-amber-200 rounded-md text-xs font-bold text-amber-900 outline-none"
                  >
                    <option value="">Técnico 2 (Opcional)</option>
                    {technicians.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div className="w-full md:w-auto flex flex-col sm:flex-row gap-4 xl:gap-6 flex-shrink-0 md:ml-auto">
              {/* Planned Date Control */}
              <div className="flex-1 sm:w-[240px] space-y-1 flex flex-col justify-end">
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Saída</label>
                    <input 
                      type="date"
                      value={localPlannedDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLocalPlannedDate(val);
                        onSetPlannedDate(name, val);
                      }}
                      className={cn(
                        "w-full px-2 py-1.5 rounded-lg border text-xs font-bold outline-none transition-all",
                        localPlannedDate ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-100 bg-gray-50 text-gray-400"
                      )}
                    />
                  </div>

                  <div className="flex-1 space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Retorno Prev.</label>
                    <input 
                      type="date"
                      value={localReturnDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLocalReturnDate(val);
                        onSetReturnDate(name, val);
                      }}
                      className={cn(
                        "w-full px-2 py-1.5 rounded-lg border text-xs font-bold outline-none transition-all",
                        localReturnDate ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-100 bg-gray-50 text-gray-400"
                      )}
                    />
                  </div>
                </div>
              </div>

              {/* Status Summary */}
              <div className="flex-1 sm:w-auto xl:w-[180px] space-y-1 flex flex-col justify-end">
                 <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Status do Mês</label>
                 <div className="flex items-center gap-2">
                    <select 
                      value={data.status}
                      onChange={(e) => onSetStatus(name, e.target.value as MaintenanceStatus)}
                      className={cn(
                        "flex-1 items-center gap-1.5 font-bold text-xs px-2 py-1.5 rounded-lg border outline-none transition-all cursor-pointer h-[32px]",
                        data.status === 'completed' ? "text-emerald-600 bg-emerald-50 border-emerald-100" : 
                        data.status === 'partial' ? "text-amber-600 bg-amber-50 border-amber-100" : 
                        "text-gray-500 bg-gray-50 border-gray-200"
                      )}
                    >
                      <option value={MaintenanceStatus.PENDING}>Pendente</option>
                      <option value={MaintenanceStatus.PARTIAL}>Em Andamento</option>
                      <option value={MaintenanceStatus.COMPLETED}>Concluída</option>
                    </select>
                    <span className="text-xs font-bold text-gray-500 min-w-10 text-center bg-gray-100 rounded-lg py-1.5 px-2 h-[32px] flex items-center justify-center">
                      {data.records.filter(r => r.status === MaintenanceStatus.COMPLETED).length}/{data.records.length}
                    </span>
                 </div>
              </div>
            </div>
          </div>

          {/* Notes Control */}
          <div className="w-full space-y-1 mt-auto">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Observações da Rota / Viagem</label>
            <textarea 
              placeholder="Ex: Rota com pernoite, imprevistos, prioridades específicas..."
              value={localNotes}
              onChange={(e) => setLocalNotes(e.target.value)}
              onBlur={() => {
                if (localNotes !== data.routeNotes) {
                  onSetNotes(name, localNotes);
                }
              }}
              className="w-full px-3 py-1.5 rounded-lg border border-gray-100 bg-gray-50/50 text-xs font-medium outline-none focus:border-blue-500 h-16 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Financials & Analysis (Added section) */}
      <div className="px-4 py-3 bg-gray-50/50 border-t border-gray-100">
        <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-2">Análise Financeira e Desempenho / Anexo</label>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-3 items-start">
          <div className="space-y-1">
            <label className="text-[8px] font-bold text-gray-500 uppercase">Custo Prev. (R$)</label>
            <input 
              type="number"
              value={localEstimatedCost === '' ? '' : localEstimatedCost}
              onChange={(e) => setLocalEstimatedCost(e.target.value ? Number(e.target.value) : '')}
              onBlur={() => {
                if (localEstimatedCost !== (data.routeEstimatedCost ?? '')) {
                  onSetFinancials(name, { routeEstimatedCost: localEstimatedCost === '' ? undefined : localEstimatedCost });
                }
              }}
              placeholder="Ex: 1500"
              className="w-full px-2 py-1.5 rounded-md border border-gray-200 text-xs font-bold text-gray-700 outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[8px] font-bold text-gray-500 uppercase">Custo Real. (R$)</label>
            <input 
              type="number"
              value={localActualCost === '' ? '' : localActualCost}
              onChange={(e) => setLocalActualCost(e.target.value ? Number(e.target.value) : '')}
              onBlur={() => {
                if (localActualCost !== (data.routeActualCost ?? '')) {
                  onSetFinancials(name, { routeActualCost: localActualCost === '' ? undefined : localActualCost });
                }
              }}
              placeholder="Ex: 1650"
              className={cn(
                "w-full px-2 py-1.5 rounded-md border text-xs font-bold outline-none focus:border-blue-500",
                (localActualCost !== '' && localEstimatedCost !== '' && localActualCost > localEstimatedCost) 
                  ? "border-red-200 bg-red-50 text-red-700" 
                  : "border-gray-200 text-gray-700"
              )}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[8px] font-bold text-gray-500 uppercase">O.S. (Qtd)</label>
            <input 
              type="number"
              value={localOrdersCount === '' ? '' : localOrdersCount}
              onChange={(e) => setLocalOrdersCount(e.target.value ? Number(e.target.value) : '')}
              onBlur={() => {
                if (localOrdersCount !== (data.routeServiceOrdersCount ?? '')) {
                  onSetFinancials(name, { routeServiceOrdersCount: localOrdersCount === '' ? undefined : localOrdersCount });
                }
              }}
              placeholder="Ex: 5"
              className="w-full px-2 py-1.5 rounded-md border border-gray-200 text-xs font-bold text-gray-700 outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[8px] font-bold text-gray-500 uppercase">Preventivas</label>
            <input 
              type="number"
              value={localPreventiveCount === '' ? '' : localPreventiveCount}
              onChange={(e) => setLocalPreventiveCount(e.target.value ? Number(e.target.value) : '')}
              onBlur={() => {
                if (localPreventiveCount !== (data.routePreventiveCount ?? '')) {
                  onSetFinancials(name, { routePreventiveCount: localPreventiveCount === '' ? undefined : localPreventiveCount });
                }
              }}
              placeholder="Ex: 3"
              className="w-full px-2 py-1.5 rounded-md border border-gray-200 text-xs font-bold text-gray-700 outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[8px] font-bold text-gray-500 uppercase">Valor O.S. (R$)</label>
            <input 
              type="number"
              value={localServicesValue === '' ? '' : localServicesValue}
              onChange={(e) => setLocalServicesValue(e.target.value ? Number(e.target.value) : '')}
              onBlur={() => {
                if (localServicesValue !== (data.routeServicesValue ?? '')) {
                  onSetFinancials(name, { routeServicesValue: localServicesValue === '' ? undefined : localServicesValue });
                }
              }}
              placeholder="Ex: 5000"
              className="w-full px-2 py-1.5 rounded-md border border-gray-200 text-xs font-bold text-gray-700 outline-none focus:border-blue-500"
            />
          </div>

          <div className="col-span-2 space-y-1">
            <label className="text-[8px] font-bold text-gray-500 uppercase">Anexo (Imagem / Link)</label>
            <div className="bg-white p-1 border border-gray-200 rounded-lg shadow-sm">
              <ImageUploader 
                value={localAttachmentUrl} 
                onChange={(val) => {
                  setLocalAttachmentUrl(val);
                  onSetFinancials(name, { routeAttachmentUrl: val });
                }} 
              />
            </div>
            {localAttachmentUrl && !localAttachmentUrl.startsWith('data:image') && (
              <a 
                href={localAttachmentUrl.startsWith('http') ? localAttachmentUrl : `https://${localAttachmentUrl}`} 
                target="_blank" 
                rel="noreferrer" 
                className="text-[10px] text-blue-600 hover:underline font-bold inline-flex items-center gap-1 mt-1 pl-1" 
                title="Abrir anexo"
              >
                <ExternalLink className="w-3 h-3" /> Testar Link
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RoutePlanningView() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [routeConfigs, setRouteConfigs] = useState<RouteConfiguration[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [hideVariableRoutes, setHideVariableRoutes] = useState(false);
  const [selectedTechForSchedule, setSelectedTechForSchedule] = useState<string>('');
  
  const [routeModal, setRouteModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    originalName: string;
    name: string;
    type: RouteType;
    tempAddresses: { street: string, clientName: string, key: string, recordId?: string }[];
  }>({
    isOpen: false,
    mode: 'create',
    originalName: '',
    name: '',
    type: RouteType.VARIABLE,
    tempAddresses: []
  });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    routeName: string;
  }>({ isOpen: false, routeName: '' });

  const [addressSelectionModal, setAddressSelectionModal] = useState<{
    isOpen: boolean;
    routeName: string;
  }>({ isOpen: false, routeName: '' });
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  useEffect(() => {
    loadData();
  }, [month]);

  const loadData = async () => {
    setLoading(true);
    const [r, a, c, rcs, techs] = await Promise.all([
      dataService.getRecords(month),
      dataService.getAddresses(),
      dataService.getClients(),
      dataService.getRouteConfigs(),
      dataService.getTechnicians()
    ]);
    setRecords(r);
    setAddresses(a);
    setClients(c);
    setRouteConfigs(rcs);
    setTechnicians(techs);
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
      const addr = isTemp ? undefined : addresses.find(a => a.id === r.addressId);
      const client = isTemp ? undefined : clients.find(c => c.id === addr?.clientId);
      const routeName = isTemp ? (r.temporaryRouteName || 'Rota Temp. Indefinida') : (addr?.route || 'Sem Rota');
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

      const pseudoAddr = isTemp ? { id: r.addressId, street: r.temporaryStreet || 'Endereço Indefinido', clientId: 'TEMP', route: routeName, totalMachines: 0, clientName: r.temporaryClient } as Address : addr;
      const pseudoClient = isTemp && r.temporaryClient ? { id: 'TEMP', name: r.temporaryClient } as Client : client;

      groups[routeName].records.push({ ...r, address: pseudoAddr, client: pseudoClient });
      
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
    });

    Object.keys(groups).forEach(name => {
      const g = groups[name];
      if (g.records.length === 0) {
        g.status = 'pending';
        return;
      }
      const allDone = g.records.every(r => r.status === MaintenanceStatus.COMPLETED);
      const someDone = g.records.some(r => r.status !== MaintenanceStatus.PENDING);
      
      if (allDone) g.status = 'completed';
      else if (someDone) g.status = 'partial';
      else g.status = 'pending';
    });

    return groups;
  }, [records, addresses, clients, routeConfigs]);

  const displayRoutes = useMemo(() => {
    return (Object.entries(routeStats) as [string, RouteGroup][])
      .filter(([_, data]) => !hideVariableRoutes || data.config.type === RouteType.FIXED)
      .sort((a, b) => {
        const dateA = a[1].plannedDate;
        const dateB = b[1].plannedDate;
        if (dateA && dateB) {
          const diff = dateA.localeCompare(dateB);
          if (diff !== 0) return diff;
        }
        if (dateA) return -1;
        if (dateB) return 1;
        return a[0].localeCompare(b[0]);
      });
  }, [routeStats, hideVariableRoutes]);

  const updateRouteRecords = async (routeName: string, overrides: Partial<MaintenanceRecord>) => {
    const routeRecords = routeStats[routeName].records;

    if (routeRecords.length === 0) {
      alert(`⚠️ Atenção: Por favor, selecione os locais de atendimento da rota "${routeName}" ANTES de preencher os dados ou planejamento da viagem.\n\nClique no botão com ícone de "Lista de Checagem" (ao lado de Editar Nome da Rota) para escolher quais endereços serão atendidos neste mês.`);
      await loadData();
      return;
    } else {
      const promises = routeRecords.map(r => {
        const { address, client, ...pureRecord } = r;
        return dataService.upsertRecord({ ...pureRecord, ...overrides } as any);
      });
      await Promise.all(promises);
      
      setRecords(prev => prev.map(r => {
        const addr = addresses.find(a => a.id === r.addressId);
        if (addr?.route === routeName) {
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
  const handleSetRouteStatus = async (routeName: string, status: MaintenanceStatus) => updateRouteRecords(routeName, { status });
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

    // If it's fixed, sync to the records of the month
    if (newConfig.type === RouteType.FIXED) {
      await dataService.syncRouteTechnicians(month, routeName, t1, t2);
      // Refresh local records
      const updatedRecords = await dataService.getRecords(month);
      setRecords(updatedRecords);
    }
  };

  const handleSaveRoute = async () => {
    if (!routeModal.name.trim()) return;

    setLoading(true);
    try {
      if (routeModal.mode === 'create') {
        const config: RouteConfiguration = {
          id: routeModal.name.trim(),
          routeName: routeModal.name.trim(),
          type: routeModal.type,
          updatedAt: null
        };
        await dataService.upsertRouteConfig(config);
      } else {
        // Edit mode (Rename)
        if (routeModal.name.trim() !== routeModal.originalName) {
          await dataService.renameRoute(routeModal.originalName, routeModal.name.trim());
        }
        
        // Update type regardless of rename
        const config = routeConfigs.find(c => c.id === routeModal.name.trim()) || {
          id: routeModal.name.trim(),
          routeName: routeModal.name.trim(),
          type: routeModal.type,
          updatedAt: null
        };
        await dataService.upsertRouteConfig({ ...config, type: routeModal.type });
      }
      
      if (routeModal.type === RouteType.TEMPORARY) {
        const currentRecords = routeStats[routeModal.originalName]?.records || [];
        
        // 1. Delete ones that are no longer in the modal
        const idsToKeep = routeModal.tempAddresses.filter(a => a.recordId).map(a => a.recordId);
        const recordsToDelete = currentRecords.filter(r => r.id && !idsToKeep.includes(r.id));
        await Promise.all(recordsToDelete.map(r => r.id && dataService.deleteRecord(r.id)));

        // 2. Upsert existing ones and create new ones
        const routeName = routeModal.name.trim();
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
        } : {};

        const promises = routeModal.tempAddresses.map(addr => {
           if (addr.street.trim() || addr.clientName.trim()) {
              const record: Partial<MaintenanceRecord> = {
                month,
                addressId: `TEMP_ADDR_${Math.random().toString(36).substr(2, 9)}`,
                scheduledWeek: 1,
                status: MaintenanceStatus.PENDING,
                isTemporaryRoute: true,
                temporaryRouteName: routeName,
                temporaryClient: addr.clientName.trim(),
                temporaryStreet: addr.street.trim(),
                ...baseRecordFields,
              };
              if (addr.recordId) {
                record.id = addr.recordId;
                // Preserve the original dummy addressId if it had one
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
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAddressInRoute = async (routeName: string, addressId: string, isIncluded: boolean) => {
    try {
      if (isIncluded) {
        const config = routeConfigs.find(c => c.id === routeName && c.type === RouteType.FIXED);
        const recordToCreate: Partial<MaintenanceRecord> = {
          month: month,
          addressId: addressId,
          scheduledWeek: 1,
          status: MaintenanceStatus.PENDING,
          technician1: config?.technician1 || '',
          technician2: config?.technician2 || '',
        };
        const existingRecordInRoute = routeStats[routeName].records[0];
        if (existingRecordInRoute) {
            recordToCreate.plannedDate = existingRecordInRoute.plannedDate;
            recordToCreate.returnDate = existingRecordInRoute.returnDate;
            recordToCreate.routeColor = existingRecordInRoute.routeColor;
            recordToCreate.routeNotes = existingRecordInRoute.routeNotes;
            recordToCreate.routeEstimatedCost = existingRecordInRoute.routeEstimatedCost;
            recordToCreate.routeActualCost = existingRecordInRoute.routeActualCost;
            recordToCreate.routeServiceOrdersCount = existingRecordInRoute.routeServiceOrdersCount;
            recordToCreate.routeServicesValue = existingRecordInRoute.routeServicesValue;
            recordToCreate.routePreventiveCount = existingRecordInRoute.routePreventiveCount;
            recordToCreate.routeAttachmentUrl = existingRecordInRoute.routeAttachmentUrl;
        }

        const id = await dataService.upsertRecord(recordToCreate as any);
        if (id) {
            setRecords(prev => [...prev, { id, ...recordToCreate } as MaintenanceRecord]);
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

  const handleToggleAllAddressesInRoute = async (routeName: string, selectAll: boolean) => {
    setLoading(true);
    try {
      const routeAddresses = addresses.filter(a => (a.route || 'Sem Rota') === routeName);
      
      if (selectAll) {
        const config = routeConfigs.find(c => c.id === routeName && c.type === RouteType.FIXED);
        const existingRecordInRoute = routeStats[routeName].records[0];
        
        const newRecords: Partial<MaintenanceRecord>[] = [];
        
        const promises = routeAddresses.map(async addr => {
          const isIncluded = records.some(r => r.addressId === addr.id);
          if (isIncluded) return; // Already included
          
          const recordToCreate: Partial<MaintenanceRecord> = {
            month: month,
            addressId: addr.id,
            scheduledWeek: 1,
            status: MaintenanceStatus.PENDING,
            technician1: config?.technician1 || '',
            technician2: config?.technician2 || '',
          };
          
          if (existingRecordInRoute) {
            recordToCreate.plannedDate = existingRecordInRoute.plannedDate;
            recordToCreate.returnDate = existingRecordInRoute.returnDate;
            recordToCreate.routeColor = existingRecordInRoute.routeColor;
            recordToCreate.routeNotes = existingRecordInRoute.routeNotes;
            recordToCreate.routeEstimatedCost = existingRecordInRoute.routeEstimatedCost;
            recordToCreate.routeActualCost = existingRecordInRoute.routeActualCost;
            recordToCreate.routeServiceOrdersCount = existingRecordInRoute.routeServiceOrdersCount;
            recordToCreate.routeServicesValue = existingRecordInRoute.routeServicesValue;
            recordToCreate.routePreventiveCount = existingRecordInRoute.routePreventiveCount;
            recordToCreate.routeAttachmentUrl = existingRecordInRoute.routeAttachmentUrl;
          }
          
          const id = await dataService.upsertRecord(recordToCreate as any);
          if (id) {
            newRecords.push({ id, ...recordToCreate } as MaintenanceRecord);
          }
        });
        
        await Promise.all(promises);
        if (newRecords.length > 0) {
          setRecords(prev => [...prev, ...newRecords as MaintenanceRecord[]]);
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
    <div>
      <div className={cn("space-y-6", addressSelectionModal.isOpen ? "print:hidden" : "")}>
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
            title={hideVariableRoutes ? "Mostrar rotas variáveis" : "Ocultar rotas variáveis"}
          >
            {hideVariableRoutes ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {hideVariableRoutes ? "Mostrar Variáveis" : "Ocultar Variáveis"}
          </button>
          <button 
            type="button"
            onClick={() => setRouteModal({
              isOpen: true,
              mode: 'create',
              originalName: '',
              name: '',
              type: RouteType.VARIABLE,
              tempAddresses: []
            })}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
          >
            <Plus className="w-4 h-4" />
            Nova Rota
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

      {viewMode === 'list' ? (
        <div className="grid grid-cols-1 gap-4">
          {displayRoutes.map(([name, data]) => (
            <div key={name}>
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
                onEdit={(name) => {
                  const config = routeConfigs.find(c => c.id === name);
                  const isTemp = config?.type === RouteType.TEMPORARY;
                  const tempAddresses = isTemp ? data.records.map(r => ({
                    key: r.id || Math.random().toString(36).substr(2, 9),
                    clientName: r.temporaryClient || '',
                    street: r.temporaryStreet || '',
                    recordId: r.id
                  })) : [];

                  setRouteModal({
                    isOpen: true,
                    mode: 'edit',
                    originalName: name,
                    name: name,
                    type: config?.type || RouteType.VARIABLE,
                    tempAddresses
                  });
                }}
                onDelete={(name) => {
                  setDeleteConfirm({ isOpen: true, routeName: name });
                }}
                onOpenAddressSelection={(name) => {
                  setAddressSelectionModal({ isOpen: true, routeName: name });
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
                if (data.config.technician1 !== selectedTechForSchedule && data.config.technician2 !== selectedTechForSchedule) return false;
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
                if (r.technician1 !== selectedTechForSchedule && r.technician2 !== selectedTechForSchedule) return false;
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
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Nome da Rota</label>
                <input 
                  type="text"
                  placeholder="Ex: Rota Sul 1, Interior, etc."
                  value={routeModal.name}
                  onChange={(e) => setRouteModal(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

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
                    <span className={cn("block text-xs font-bold", routeModal.type === RouteType.VARIABLE ? "text-blue-700" : "text-gray-700")}>Variável</span>
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
                    <span className={cn("block text-xs font-bold", routeModal.type === RouteType.FIXED ? "text-amber-700" : "text-gray-700")}>Pré-definida</span>
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
                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                     Endereços da Viagem (Inclusão Direta)
                  </label>
                  <div className="space-y-2">
                    {routeModal.tempAddresses.map((addr, idx) => (
                      <div key={addr.key} className="flex gap-2 items-start">
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            placeholder="Nome do Cliente"
                            value={addr.clientName}
                            onChange={(e) => {
                              const newArr = [...routeModal.tempAddresses];
                              newArr[idx].clientName = e.target.value;
                              setRouteModal(prev => ({ ...prev, tempAddresses: newArr }));
                            }}
                            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium outline-none focus:border-purple-500"
                          />
                          <input
                            type="text"
                            placeholder="Endereço"
                            value={addr.street}
                            onChange={(e) => {
                              const newArr = [...routeModal.tempAddresses];
                              newArr[idx].street = e.target.value;
                              setRouteModal(prev => ({ ...prev, tempAddresses: newArr }));
                            }}
                            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium outline-none focus:border-purple-500"
                          />
                        </div>
                        <button
                          onClick={() => {
                            const newArr = [...routeModal.tempAddresses];
                            newArr.splice(idx, 1);
                            setRouteModal(prev => ({ ...prev, tempAddresses: newArr }));
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 rounded-lg mt-0.5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setRouteModal(prev => ({
                        ...prev,
                        tempAddresses: [...prev.tempAddresses, { clientName: '', street: '', key: Math.random().toString(36).substr(2, 9) }]
                      }));
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 px-3 py-2 rounded-xl transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Endereço Manual
                  </button>
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
                disabled={loading || !routeModal.name.trim()}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-blue-200 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Salvar Rota
              </button>
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
                  className="flex-1 px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all"
                >
                  Manter
                </button>
                <button 
                  onClick={handleDeleteRoute}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-red-100"
                >
                  Sim, Excluir
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
            <div className="hidden print:block p-8 pb-4">
              <div className="flex items-center justify-between border-b-2 border-gray-900 pb-4 mb-4">
                <div>
                  <h1 className="text-2xl font-black text-gray-900">{addressSelectionModal.routeName}</h1>
                  <p className="text-gray-500 font-medium">Lista de locais de atendimento</p>
                </div>
                <div className="text-right text-sm font-medium">
                  <p>Mês: <b>{format(parseISO(month + '-01'), 'MMMM yyyy', { locale: ptBR })}</b></p>
                  {routeStats[addressSelectionModal.routeName]?.plannedDate && (
                    <p>Previsão: <b>{format(parseISO(routeStats[addressSelectionModal.routeName].plannedDate as string), 'dd/MM/yyyy')}</b></p>
                  )}
                  {routeStats[addressSelectionModal.routeName]?.config?.technician1 && (
                    <p>Técnicos: <b>{routeStats[addressSelectionModal.routeName].config.technician1}</b>
                      {routeStats[addressSelectionModal.routeName].config.technician2 ? ` e ${routeStats[addressSelectionModal.routeName].config.technician2}` : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-0 overflow-y-auto flex-1 print:overflow-visible">
              <div className="bg-gray-50 p-4 border-b border-gray-100 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between print:hidden">
                <div className="flex-1">
                   <p className="text-sm text-gray-600 font-medium leading-relaxed">
                     Selecione quais endereços desta rota serão atendidos no mês de <b>{format(parseISO(month + '-01'), 'MMMM yyyy', { locale: ptBR })}</b>.
                   </p>
                </div>
                <div className="flex flex-col md:flex-row items-start md:items-center gap-4 shrink-0">
                  <div className="flex flex-col gap-1 w-full md:w-auto">
                    <button
                      onClick={() => handleToggleAllAddressesInRoute(addressSelectionModal.routeName, true)}
                      className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors text-left md:text-center w-full md:w-auto"
                    >
                      Selecionar Todos
                    </button>
                    <button
                      onClick={() => handleToggleAllAddressesInRoute(addressSelectionModal.routeName, false)}
                      className="text-[10px] font-bold uppercase tracking-widest text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors text-left md:text-center w-full md:w-auto"
                    >
                      Desmarcar Todos
                    </button>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pt-2 md:pt-0 border-t md:border-t-0 md:border-l border-gray-200 md:pl-4">
                    <input
                      type="checkbox"
                      checked={showOnlySelected}
                      onChange={(e) => setShowOnlySelected(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-bold text-gray-700">Somente selecionados</span>
                  </label>
                </div>
              </div>
              <div className="p-4 space-y-2 print:p-8 print:pt-0">
                {addresses
                  .filter(a => (a.route || 'Sem Rota') === addressSelectionModal.routeName)
                  .filter(a => !showOnlySelected || records.some(r => r.addressId === a.id))
                  .map(addr => {
                  const client = clients.find(c => c.id === addr.clientId);
                  const isIncluded = records.some(r => r.addressId === addr.id);
                  return (
                    <label 
                      key={addr.id} 
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-xl border transition-all print:border-b print:rounded-none print:border-x-0 print:border-t-0 print:border-gray-200 print:mb-2 print:p-2",
                        isIncluded ? "border-emerald-200 bg-emerald-50/30 print:bg-transparent" : "border-gray-200",
                        !isIncluded && showOnlySelected ? "hidden" : "cursor-pointer hover:bg-gray-50"
                      )}
                    >
                      <input 
                        type="checkbox"
                        checked={isIncluded}
                        onChange={(e) => handleToggleAddressInRoute(addressSelectionModal.routeName, addr.id, e.target.checked)}
                        className="mt-1 w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 print:hidden"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className={cn("text-sm font-bold print:text-black", isIncluded ? "text-emerald-900" : "text-gray-900")}>
                            {client?.name || 'Cliente desconhecido'}
                          </h4>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md print:bg-transparent print:border print:border-gray-300">
                            {addr.city}/{addr.state}
                          </span>
                        </div>
                        <p className={cn("text-xs mt-0.5 print:text-gray-700", isIncluded ? "text-emerald-700/80" : "text-gray-500")}>
                          {addr.street}, {addr.number} {addr.complement ? `- ${addr.complement}` : ''} - {addr.neighborhood}
                        </p>
                      </div>
                      <div className="hidden print:block w-32 border-b border-gray-400 mt-4 h-4"></div>
                    </label>
                  );
                })}
                {addresses.filter(a => (a.route || 'Sem Rota') === addressSelectionModal.routeName).filter(a => !showOnlySelected || records.some(r => r.addressId === a.id)).length === 0 && (
                  <div className="py-8 text-center text-gray-500 text-sm font-medium">
                    Nenhum endereço encontrado com o filtro atual.
                  </div>
                )}
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
    </div>
  );
}
