import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { 
  FileText, Plus, Search, Filter, Edit, Edit3, Trash2, Printer, 
  X, Save, Calendar, User, Building, MapPin, Wind, 
  AlertCircle, AlertTriangle, DollarSign, Image as ImageIcon, CheckCircle2, Check,
  Trash, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ListPlus, Receipt, Eye, TrendingUp, BarChart2, PieChart as PieChartIcon, Download, Sparkles, FileSpreadsheet,
  Wrench, RotateCcw, XCircle, Ban, Folder, Lock, Unlock, ClipboardCheck, Inbox, Clock, Send, ArrowRight, Zap,
  Maximize2, Minimize2, Smartphone, Layers, Droplets, Loader2
} from 'lucide-react';
import { cn, generateInitialOsNumber, sortOrdersByCreationDateDesc } from '../lib/utils';
import { buildTechnicianIndex, normalizeTechString, isStaffName } from '../lib/technicianIndex';
import { dataService } from '../services/dataService';
import { CompanyLogo, getCompanyConfigFromCache } from './CompanyLogo';
import { Client, Address, Equipment, Technician, ServiceOrder, ServiceOrderItem, UserRole, ServiceOrderSettings, ServiceCompanyConfig, ServiceCatalogItem, ClientPriceOverride, MaintenanceRecord, JettingControl, MaintenanceStatus, TechOSDraft, ServiceCall, ServiceCallStatus } from '../types';
import { ImageUploader } from './ImageUploader';
const JettingControlCenter = React.lazy(() =>
  import('./JettingControlCenter').then((m) => ({ default: m.JettingControlCenter }))
);
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';

const isOSRecord = (r: any): boolean => {
  if (!r) return false;
  if (typeof r.id === 'string' && (r.id.includes('_os_') || r.id.startsWith('OS_') || r.id.startsWith('os_'))) return true;
  if (typeof r.notes === 'string' && (r.notes.includes('[O.S.') || r.notes.startsWith('[O.S.'))) return true;
  if (typeof r.routeNotes === 'string' && (r.routeNotes.includes('[O.S.') || r.routeNotes.startsWith('[O.S.'))) return true;
  return false;
};

const formatDateSafe = (dateStr?: any): string => {
  if (!dateStr) return '';
  try {
    if (typeof dateStr === 'object' && dateStr !== null) {
      if ('seconds' in dateStr && typeof dateStr.seconds === 'number') {
        const dateObj = new Date(dateStr.seconds * 1000);
        return dateObj.toLocaleDateString('pt-BR');
      }
      if ('_seconds' in dateStr && typeof dateStr._seconds === 'number') {
        const dateObj = new Date(dateStr._seconds * 1000);
        return dateObj.toLocaleDateString('pt-BR');
      }
      if (dateStr instanceof Date) {
        return dateStr.toLocaleDateString('pt-BR');
      }
    }
    if (typeof dateStr === 'number') {
      return new Date(dateStr).toLocaleDateString('pt-BR');
    }
    if (typeof dateStr === 'string') {
      const cleanStr = dateStr.trim();
      if (!cleanStr) return '';
      const parts = cleanStr.split('T')[0].split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return cleanStr;
    }
  } catch (e) {
    console.error("Error in formatDateSafe:", e);
  }
  return String(dateStr || '');
};

// Modelos pré-definidos para facilitar a inserção
const PRESET_SERVICES = [
  { code: '61', description: 'MANUTENCAO NIVEL 2- MANUTENCAO DE CARENAGEM,FILTRO DE AR, BANDEJA DE DRENO, APLICACAO DE ANTIBACTERICIDA COM JATEAMENTO DA EVAPORADORA SPLIT 12.000 BTUS', unit: 'UN', unitValue: 77.25, discountPercent: 59.34 },
  { code: '62', description: 'MANUTENCAO NIVEL 2- MANUTENCAO DE CARENAGEM,FILTRO DE AR, BANDEJA DE DRENO, APLICACAO DE ANTIBACTERICIDA COM JATEAMENTO DA EVAPORADORA SPLIT 18.000 A 30.000 BTUS', unit: 'UN', unitValue: 95.00, discountPercent: 0 },
  { code: '63', description: 'CARGA DE GAS FLUIDO REFRIGERANTE R410A / R22', unit: 'UN', unitValue: 150.00, discountPercent: 0 },
  { code: '64', description: 'CONSERTO DE PLACA ELETRONICA OU REPARO ELETRICO', unit: 'UN', unitValue: 120.00, discountPercent: 0 }
];

export const formatEquipmentOptionLabel = (eq: Equipment): string => {
  const sector = (eq.sector || 'Sem Setor').trim();
  const brand = (eq.brand || 'Sem Marca').trim();
  
  let btusStr = '';
  if (eq.btus) {
    const raw = String(eq.btus).trim();
    if (raw.toUpperCase().includes('BTU')) {
      btusStr = raw;
    } else {
      const num = Number(raw.replace(/\./g, '').replace(/,/g, ''));
      if (!isNaN(num) && num > 0) {
        const adjusted = num < 1000 ? num * 1000 : num;
        btusStr = `${adjusted.toLocaleString('pt-BR')} BTUs`;
      } else if (raw) {
        btusStr = `${raw} BTUs`;
      }
    }
  }

  const parts = [sector, brand];
  if (btusStr) {
    parts.push(btusStr);
  }
  return parts.join(' - ');
};

const PRESET_PRODUCTS = [
  { code: '336', description: 'GAS FLUIDO REF R410 DUGOLD 11,30KG', unit: 'KG', unitValue: 42.65, discountPercent: 0 },
  { code: '337', description: 'GAS FLUIDO R22 DUGOLD 13,6KG', unit: 'KG', unitValue: 48.50, discountPercent: 0 },
  { code: '338', description: 'CAPACITOR DE PARTIDA PARA COMPRESSOR', unit: 'UN', unitValue: 35.00, discountPercent: 0 },
  { code: '339', description: 'SENSORS DE TEMPERATURA E DEGELO', unit: 'UN', unitValue: 15.00, discountPercent: 0 }
];

interface SignaturePadProps {
  label: string;
  onChange: (base64: string) => void;
  savedValue?: string;
  disabled?: boolean;
}

function SignaturePad({ label, onChange, savedValue, disabled }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!savedValue);
  const [isLocked, setIsLocked] = useState(Boolean(savedValue && savedValue.trim().length > 0));
  
  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFsDrawing, setIsFsDrawing] = useState(false);
  const [fsHasSignature, setFsHasSignature] = useState(false);

  // Load saved signature into normal canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#1e3a8a'; // Navy/dark blue ink
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (savedValue && savedValue.trim().length > 0) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = savedValue;
      setIsLocked(true);
      setHasSignature(true);
    } else {
      setHasSignature(false);
      setIsLocked(false);
    }
  }, [savedValue]);

  // Load into fullscreen canvas when modal opens
  useEffect(() => {
    if (!isFullscreen) return;

    // Prevent body scrolling
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Try to lock orientation to landscape on mobile browsers
    try {
      const orientation = (screen.orientation || (screen as any).mozOrientation || (screen as any).msOrientation);
      if (orientation && orientation.lock) {
        orientation.lock('landscape').catch(() => {
          // Ignored if user device or browser policy forbids auto-locking
        });
      }
    } catch (e) {}

    // Initialize fullscreen canvas
    const timer = setTimeout(() => {
      const canvas = fsCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.strokeStyle = '#1e3a8a';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (savedValue && savedValue.trim().length > 0) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = savedValue;
        setFsHasSignature(true);
      } else {
        setFsHasSignature(false);
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      try {
        const orientation = (screen.orientation || (screen as any).mozOrientation || (screen as any).msOrientation);
        if (orientation && orientation.unlock) {
          orientation.unlock();
        }
      } catch (e) {}
    };
  }, [isFullscreen, savedValue]);

  const isEffectivelyDisabled = Boolean(disabled || isLocked);

  // Normalized coordinate helper
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  // Regular canvas drawing
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (isEffectivelyDisabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coords = getCoordinates(e, canvas);
    if (!coords) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (isEffectivelyDisabled || !isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coords = getCoordinates(e, canvas);
    if (!coords) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (isEffectivelyDisabled || !isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const clear = () => {
    if (isEffectivelyDisabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setIsLocked(false);
    onChange('');
  };

  // Fullscreen canvas drawing
  const startFsDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = fsCanvasRef.current;
    if (!canvas) return;
    const coords = getCoordinates(e, canvas);
    if (!coords) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsFsDrawing(true);
  };

  const drawFs = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isFsDrawing) return;
    const canvas = fsCanvasRef.current;
    if (!canvas) return;
    const coords = getCoordinates(e, canvas);
    if (!coords) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    setFsHasSignature(true);
  };

  const stopFsDrawing = () => {
    if (!isFsDrawing) return;
    setIsFsDrawing(false);
  };

  const clearFs = () => {
    const canvas = fsCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setFsHasSignature(false);
  };

  const saveFromFullscreen = () => {
    const canvas = fsCanvasRef.current;
    if (!canvas) return;
    if (!fsHasSignature) {
      alert('Por favor, desenhe a assinatura antes de confirmar.');
      return;
    }
    const dataUrl = canvas.toDataURL('image/png');
    onChange(dataUrl);
    setHasSignature(true);
    setIsLocked(false);
    setIsFullscreen(false);
  };

  return (
    <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-3xs">
      {/* Header com Ações e Botão Fullscreen */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <span className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
          {label}
        </span>
        <div className="flex items-center flex-wrap gap-1.5">
          {/* Botão de Tela Cheia / Girar Celular */}
          <button
            type="button"
            onClick={() => {
              if (isLocked) {
                setIsLocked(false);
              }
              setIsFullscreen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl transition-all cursor-pointer shadow-3xs active:scale-95"
            title="Abrir em tela cheia na horizontal para assinar com mais espaço"
          >
            <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
            <span className="flex items-center gap-1">
              <Smartphone className="w-3 h-3 rotate-90 text-blue-500" />
              Tela Cheia (Horizontal)
            </span>
          </button>

          {hasSignature && !disabled && (
            isLocked ? (
              <button
                type="button"
                onClick={() => setIsLocked(false)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl transition-all cursor-pointer shadow-3xs"
                title="Clique para desbloquear o campo de assinatura"
              >
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>Desbloquear</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsLocked(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl transition-all cursor-pointer shadow-3xs"
                title="Travar para evitar toques acidentais"
              >
                <Unlock className="w-3.5 h-3.5 text-slate-600" />
                <span>Travar</span>
              </button>
            )
          )}
          {hasSignature && !isEffectivelyDisabled && (
            <button 
              type="button" 
              onClick={() => {
                if (window.confirm('Deseja realmente limpar a assinatura atual?')) {
                  clear();
                }
              }}
              className="text-[10px] text-rose-600 hover:text-rose-800 font-bold transition-all px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl cursor-pointer"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Área do Canvas Ampliada (Mais Confortável) */}
      <div className="relative rounded-xl overflow-hidden shadow-inner">
        <canvas
          ref={canvasRef}
          width={800}
          height={320}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className={cn(
            "w-full h-48 sm:h-60 bg-white border-2 rounded-xl touch-none transition-all block",
            isLocked
              ? "border-amber-300/90 bg-amber-50/10 cursor-not-allowed"
              : isEffectivelyDisabled
                ? "border-slate-300 cursor-not-allowed opacity-80"
                : "border-slate-300 cursor-crosshair focus:ring-2 focus:ring-blue-500/20 hover:border-blue-400"
          )}
        />

        {/* Linha Guia Sutil de Assinatura */}
        <div className="absolute bottom-4 left-6 right-6 flex items-center gap-2 pointer-events-none opacity-35 select-none">
          <span className="text-xs font-bold text-slate-400">X</span>
          <div className="flex-1 border-b-2 border-dashed border-slate-400"></div>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Assine acima desta linha</span>
        </div>

        {/* Indicador de Trava */}
        {isLocked && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-100/95 border border-amber-200 px-2 py-0.5 rounded-md pointer-events-none shadow-3xs">
            <Lock className="w-2.5 h-2.5" /> Protegido
          </div>
        )}
      </div>

      {/* Dica / Informação */}
      {isLocked ? (
        <p className="text-[10px] font-semibold text-amber-800 bg-amber-50/90 border border-amber-200/80 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>Assinatura protegida contra toques acidentais. Para alterar, clique em <strong>Desbloquear</strong> ou no botão <strong>Tela Cheia</strong>.</span>
        </p>
      ) : (
        <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
          <span className="flex items-center gap-1">
            <Smartphone className="w-3 h-3 text-blue-500 rotate-90" />
            Para assinar com mais espaço, use o botão <strong>Tela Cheia (Horizontal)</strong>.
          </span>
          {hasSignature && (
            <span className="text-emerald-600 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Assinatura desenhada
            </span>
          )}
        </div>
      )}

      {/* MODAL FULLSCREEN / TELA CHEIA PARA ASSINATURA HORIZONTAL */}
      {isFullscreen && (
        <div 
          className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-md flex flex-col p-3 sm:p-5 select-none animate-in fade-in duration-150"
          style={{ height: '100dvh' }}
        >
          {/* Header do Fullscreen */}
          <div className="flex justify-between items-center pb-2 border-b border-slate-800 text-white gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-500/20 border border-blue-400/30 rounded-lg text-blue-400">
                <Maximize2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
                  Assinatura Digital do Cliente
                </h4>
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
                  <Smartphone className="w-3.5 h-3.5 text-blue-400 rotate-90 shrink-0" />
                  <span>Dica: Deite o celular na <strong>horizontal</strong> para assinar com o máximo de conforto.</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              title="Fechar tela cheia"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Área Central: Canvas em Tela Cheia */}
          <div className="flex-1 w-full my-2 bg-white rounded-2xl relative shadow-2xl border-2 border-slate-300 overflow-hidden flex flex-col">
            <canvas
              ref={fsCanvasRef}
              width={1400}
              height={700}
              onMouseDown={startFsDrawing}
              onMouseMove={drawFs}
              onMouseUp={stopFsDrawing}
              onMouseLeave={stopFsDrawing}
              onTouchStart={startFsDrawing}
              onTouchMove={drawFs}
              onTouchEnd={stopFsDrawing}
              className="w-full h-full touch-none cursor-crosshair block bg-white"
            />

            {/* Linha Guia de Assinatura no Fullscreen */}
            <div className="absolute bottom-10 left-8 right-8 flex items-center gap-3 pointer-events-none opacity-40 select-none">
              <span className="text-lg font-black text-slate-600">X</span>
              <div className="flex-1 border-b-2 border-dashed border-slate-400"></div>
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                Assinatura do Representante do Cliente
              </span>
            </div>
          </div>

          {/* Rodapé com Botões de Ação */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearFs}
                className="bg-slate-800 hover:bg-slate-700 text-rose-400 hover:text-rose-300 border border-slate-700 text-xs font-black uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-black uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all cursor-pointer active:scale-95"
              >
                Cancelar
              </button>
            </div>

            <button
              type="button"
              onClick={saveFromFullscreen}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-black uppercase tracking-wider py-2.5 px-6 rounded-xl transition-all shadow-lg flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirmar Assinatura
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ServiceOrdersViewProps {
  managerClientId?: string;
  userRole?: UserRole;
  userProfile?: any;
}

export default function ServiceOrdersView({ managerClientId, userRole, userProfile }: ServiceOrdersViewProps) {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadedOrdersProgress, setLoadedOrdersProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeExactSearch, setActiveExactSearch] = useState('');
  const [isSearchingExact, setIsSearchingExact] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'reports' | 'jetting'>('list');

  // Paginação sob demanda no Firestore (carrega 25 últimas O.S. na página 1 e carrega próximas páginas conforme o usuário avança)
  const [paginationMode, setPaginationMode] = useState<'cursor' | 'filtered_all' | 'exact_search'>('cursor');
  const [serverTotalOrders, setServerTotalOrders] = useState<number | null>(null);
  const [serverWorkshopOrders, setServerWorkshopOrders] = useState<number | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [hasMorePages, setHasMorePages] = useState(false);
  const [loadedPagesCount, setLoadedPagesCount] = useState(0);
  const pagesCacheRef = useRef<Record<number, { orders: ServiceOrder[]; lastDoc: any; hasMore: boolean }>>({});
  const auxiliaryLoadedRef = useRef(false);
  const pageRequestCounterRef = useRef(0);

  // Chamados Técnicos e Modal de Alerta Prévio de Chamado em Aberto
  const [serviceCalls, setServiceCalls] = useState<ServiceCall[]>([]);
  const [isOpenCallsWarningModalOpen, setIsOpenCallsWarningModalOpen] = useState(false);
  const [pendingOpenCallsData, setPendingOpenCallsData] = useState<{
    order: ServiceOrder;
    openCalls: ServiceCall[];
  } | null>(null);
  const [isCallDetailsExpandedInForm, setIsCallDetailsExpandedInForm] = useState(false);

  const serviceCallsLoadedRef = useRef(false);

  const [workshopOnlyFilter, setWorkshopOnlyFilter] = useState<boolean>(false);

  // Estados de Paginação para a Tabela Principal de O.S.
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [jumpPageInput, setJumpPageInput] = useState('');

  // Estados de Paginação para a Tabela do Relatório Avançado (evita renderizar 200-2000 linhas de uma vez no DOM)
  const [reportCurrentPage, setReportCurrentPage] = useState(1);
  const [reportItemsPerPage, setReportItemsPerPage] = useState(25);

  // Estados de Filtro para Relatório Avançado (sob demanda: nada é carregado/exibido até definir filtro e pressionar Enter/Buscar)
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportClientId, setReportClientId] = useState('all');
  const [reportAddressId, setReportAddressId] = useState('all');
  const [reportAddressQuery, setReportAddressQuery] = useState('');
  const [isReportAddressDropdownOpen, setIsReportAddressDropdownOpen] = useState(false);
  const reportAddressDropdownRef = useRef<HTMLDivElement>(null);
  const [reportTechnicianId, setReportTechnicianId] = useState('all');
  const [reportStatus, setReportStatus] = useState('all');
  const [reportCompany, setReportCompany] = useState('all');
  const [reportType, setReportType] = useState('all');
  const [reportWorkshopFilter, setReportWorkshopFilter] = useState<'all' | 'workshop_only' | 'standard_only'>('all');
  const [reportGeneralNotes, setReportGeneralNotes] = useState('');

  const [reportRawOrders, setReportRawOrders] = useState<ServiceOrder[]>([]);
  const [reportHasSearched, setReportHasSearched] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportFiltersDirty, setReportFiltersDirty] = useState(false);
  const [reportAppliedFilters, setReportAppliedFilters] = useState<{
    startDate: string;
    endDate: string;
    clientId: string;
    addressId: string;
    addressQuery: string;
    technicianId: string;
    status: string;
    company: string;
    type: string;
    workshopFilter: 'all' | 'workshop_only' | 'standard_only';
  }>({
    startDate: '',
    endDate: '',
    clientId: 'all',
    addressId: 'all',
    addressQuery: '',
    technicianId: 'all',
    status: 'all',
    company: 'all',
    type: 'all',
    workshopFilter: 'all'
  });

  // Resetar página do Relatório Avançado ao alterar quantidade por página
  useEffect(() => {
    setReportCurrentPage(1);
  }, [reportItemsPerPage]);
  
  // Controle de Modais / Form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [isHydratingMedia, setIsHydratingMedia] = useState(false);
  const activeOrderRequestRef = useRef<string>('');
  const [isOptimizingMedia, setIsOptimizingMedia] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState<{ processed: number; total: number; migrated: number; failed: number } | null>(null);

  const legacyHeavyOrdersCount = useMemo(() => {
    return orders.filter(
      (o) =>
        Boolean(o && o.id) &&
        (Boolean(o.clientSignature && String(o.clientSignature).trim().length > 0) ||
          Boolean(o.techSignature && String(o.techSignature).trim().length > 0) ||
          (Array.isArray(o.photos) && o.photos.length > 0))
    ).length;
  }, [orders]);

  const handleOptimizeLegacyMedia = async () => {
    if (isOptimizingMedia || legacyHeavyOrdersCount === 0) return;
    const confirmed = window.confirm(
      `Identificamos O.S. com fotos/assinaturas gravadas diretamente no documento principal.\n\nDeseja otimizar todas as O.S. legadas do banco movendo essas mídias com segurança para a subcoleção sob demanda?\n\n• Nenhuma foto ou assinatura será perdida (só removemos do documento principal após confirmar a gravação).\n• O carregamento das O.S. ficará drasticamente mais rápido.`
    );
    if (!confirmed) return;
    setIsOptimizingMedia(true);
    setOptimizeProgress({ processed: 0, total: legacyHeavyOrdersCount, migrated: 0, failed: 0 });
    try {
      const allOrdersToScan = await dataService.getServiceOrders(managerClientId, undefined, { forceRefresh: true });
      const result = await dataService.optimizeServiceOrdersMedia(allOrdersToScan, (progress) => {
        setOptimizeProgress(progress);
      });
      await loadData(true);
      alert(
        `Otimização concluída!\n\n• ${result.migrated} O.S. otimizadas com sucesso.\n${
          result.failed > 0
            ? `• ${result.failed} O.S. não puderam ser migradas agora (mantidas intactas).`
            : '• Todas as fotos e assinaturas foram preservadas e carregadas sob demanda.'
        }`
      );
    } catch (err: any) {
      console.error('Erro ao otimizar mídias das O.S.:', err);
      alert('Erro durante a otimização: ' + (err?.message || 'Tente novamente.'));
    } finally {
      setIsOptimizingMedia(false);
      setOptimizeProgress(null);
    }
  };

  // Modal de Compartilhamento de Link de Assinatura Externa (48h)
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareLinkOS, setShareLinkOS] = useState<ServiceOrder | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [shareExpiresAt, setShareExpiresAt] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  const handleGenerateShareLink = async (os: ServiceOrder) => {
    try {
      let token = os.shareSignatureToken;
      let expiresAt = os.shareSignatureExpiresAt;
      const now = Date.now();

      // Se não houver token ou se o token atual já tiver expirado, cria um novo
      if (!token || !expiresAt || new Date(expiresAt).getTime() < now) {
        token = `sign_os_${os.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        expiresAt = new Date(now + 48 * 60 * 60 * 1000).toISOString();

        const shareCreatedAt = new Date().toISOString();
        await dataService.updateServiceOrder(os.id, {
          shareSignatureToken: token,
          shareSignatureCreatedAt: shareCreatedAt,
          shareSignatureExpiresAt: expiresAt
        });

        // Atualiza a O.S. em toda a memória local (lista, cache de páginas e relatório)
        patchOrderInLocalState(os.id, {
          shareSignatureToken: token,
          shareSignatureCreatedAt: shareCreatedAt,
          shareSignatureExpiresAt: expiresAt
        });
      }

      const generatedUrl = `${window.location.origin}${window.location.pathname}?signToken=${token}`;
      setShareUrl(generatedUrl);
      setShareExpiresAt(expiresAt);
      setShareLinkOS(os);
      setShareModalOpen(true);
      setIsCopied(false);
    } catch (err: any) {
      console.error('Erro ao gerar link de assinatura:', err);
      alert('Erro ao gerar link de assinatura: ' + (err?.message || ''));
    }
  };
  
  // Lote de O.S. (Jetting Control)
  const [batchQueue, setBatchQueue] = useState<{jettingControl: JettingControl, machineName: string, originalIndex: number, eqKey: string}[]>([]);
  const [batchIndex, setBatchIndex] = useState(-1);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingNext, setIsSavingNext] = useState(false);
  const [nextOsFeedback, setNextOsFeedback] = useState<{ osNumber: string; count: number } | null>(null);
  const formScrollContainerRef = useRef<HTMLFormElement | null>(null);
  
  // State do Formulário
  const [formId, setFormId] = useState('');
  const [formOsNumber, setFormOsNumber] = useState('');
  const [originalFormOsNumber, setOriginalFormOsNumber] = useState('');
  const [formOsNumberChanged, setFormOsNumberChanged] = useState(false);
  const [formInitialOsNumber, setFormInitialOsNumber] = useState('');
  const [formOsNumberChangedAt, setFormOsNumberChangedAt] = useState<string | null>(null);
  const [formOsNumberResetUsed, setFormOsNumberResetUsed] = useState(false);

  // Cálculo de limite de 24 horas para redefinição de número da O.S. (uso único)
  const osChangedTimestamp = useMemo(() => {
    if (!selectedOrder) return null;
    const changedAt = formOsNumberChangedAt || selectedOrder.osNumberChangedAt;
    if (changedAt) {
      const t = new Date(changedAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (selectedOrder.osNumberChanged) {
      if (selectedOrder.updatedAt) {
        const u = typeof selectedOrder.updatedAt === 'object' && (selectedOrder.updatedAt as any).seconds
          ? (selectedOrder.updatedAt as any).seconds * 1000
          : new Date(selectedOrder.updatedAt as any).getTime();
        if (!isNaN(u) && u > 0) return u;
      }
      if (selectedOrder.createdAt) {
        const c = typeof selectedOrder.createdAt === 'object' && (selectedOrder.createdAt as any).seconds
          ? (selectedOrder.createdAt as any).seconds * 1000
          : new Date(selectedOrder.createdAt as any).getTime();
        if (!isNaN(c) && c > 0) return c;
      }
      if (selectedOrder.openedAt) {
        const o = typeof selectedOrder.openedAt === 'object' && (selectedOrder.openedAt as any).seconds
          ? (selectedOrder.openedAt as any).seconds * 1000
          : new Date(selectedOrder.openedAt as any).getTime();
        if (!isNaN(o) && o > 0) return o;
      }
    }
    return null;
  }, [selectedOrder, formOsNumberChangedAt]);

  const { isWithin24Hours, hoursRemaining } = useMemo(() => {
    if (!osChangedTimestamp) return { isWithin24Hours: true, hoursRemaining: 24 };
    const now = Date.now();
    const diffMs = now - osChangedTimestamp;
    const diffHours = diffMs / (1000 * 60 * 60);
    const within = diffHours <= 24;
    const remaining = Math.max(0, Math.ceil(24 - diffHours));
    return { isWithin24Hours: within, hoursRemaining: remaining };
  }, [osChangedTimestamp]);

  const handleResetOsNumber = async () => {
    if (!selectedOrder) return;
    if (formOsNumberResetUsed || selectedOrder.osNumberResetUsed) {
      alert("A redefinição de numeração já foi utilizada 1 vez nesta O.S. Por medida de segurança e integridade dos dados, não é permitido utilizá-la novamente.");
      return;
    }
    if (!isWithin24Hours) {
      alert("O prazo limite de 24 horas para redefinição da numeração desta O.S. expirou. O número foi permanentemente fixado.");
      return;
    }

    // Identifica o ID originário da O.S.
    const originNumber = formInitialOsNumber || selectedOrder.initialOsNumber || 
      (selectedOrder.id && !selectedOrder.id.startsWith('OS_') ? selectedOrder.id : generateInitialOsNumber());

    const confirmed = window.confirm(
      `ATENÇÃO: Redefinição de Numeração da O.S.\n\n` +
      `Deseja deletar a numeração inserida (${formOsNumber}) e retornar a O.S. para o seu identificador originário (${originNumber})?\n\n` +
      `• O vínculo com o número digitado anteriormente será completamente apagado.\n` +
      `• O campo voltará a ficar liberado para você corrigir e digitar a numeração certa.\n` +
      `• ⚠️ Esta função só pode ser usada UMA ÚNICA VEZ nesta O.S. e dentro do prazo de 24 horas.\n\n` +
      `Deseja prosseguir com o desbloqueio?`
    );

    if (!confirmed) return;

    try {
      setIsSaving(true);
      const nowISO = new Date().toISOString();

      // Atualiza imediatamente no Firestore para registrar o uso e proteger a integridade
      await dataService.updateServiceOrder(selectedOrder.id, {
        osNumber: originNumber,
        osNumberChanged: false,
        initialOsNumber: originNumber,
        osNumberResetUsed: true,
        osNumberResetAt: nowISO
      });

      // Atualiza estado local do formulário
      setFormOsNumber(originNumber);
      setOriginalFormOsNumber(originNumber);
      setFormOsNumberChanged(false);
      setFormInitialOsNumber(originNumber);
      setFormOsNumberChangedAt(null);
      setFormOsNumberResetUsed(true);

      // Atualiza em toda a memória local (selectedOrder, lista, cache de páginas e relatório)
      patchOrderInLocalState(selectedOrder.id, {
        osNumber: originNumber,
        osNumberChanged: false,
        initialOsNumber: originNumber,
        osNumberResetUsed: true,
        osNumberResetAt: nowISO
      });

      alert(`Numeração redefinida com sucesso!\n\nA O.S. retornou ao ID originário (${originNumber}) e o campo foi desbloqueado para que você insira o número correto.`);
    } catch (err) {
      console.error("Erro ao redefinir numeração da O.S.:", err);
      alert("Erro ao redefinir número da O.S. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };
  const [formClientId, setFormClientId] = useState('');
  const [formAddressId, setFormAddressId] = useState('');
  const [formEquipmentId, setFormEquipmentId] = useState('');
  const [formStatus, setFormStatus] = useState<ServiceOrder['status']>('aberta');
  const [formType, setFormType] = useState('MANUTENCAO CORRETIVA CONTRATO');
  const [formIsWorkshop, setFormIsWorkshop] = useState<boolean>(false);
  const [formOpenedAt, setFormOpenedAt] = useState('');
  const [formOpenedBy, setFormOpenedBy] = useState(() => {
    if (userRole !== UserRole.TECHNICIAN && userProfile?.name) {
      return userProfile.name.trim().toUpperCase();
    }
    return '';
  });

  // Garante que no sistema administrativo o responsável pela abertura acompanhe o usuário logado
  useEffect(() => {
    if (userRole !== UserRole.TECHNICIAN && userProfile?.name && !selectedOrder && !formOpenedBy) {
      setFormOpenedBy(userProfile.name.trim().toUpperCase());
    }
  }, [userProfile?.name, userRole, selectedOrder]);
  const [formFinishedAt, setFormFinishedAt] = useState('');
  const [formExternalOs, setFormExternalOs] = useState('');
  const [formPlannedDate, setFormPlannedDate] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDiagnosis, setFormDiagnosis] = useState('');
  const [formSolution, setFormSolution] = useState('');
  const [formTechnicalReport, setFormTechnicalReport] = useState('');
  const [formServices, setFormServices] = useState<ServiceOrderItem[]>([]);
  const [formProducts, setFormProducts] = useState<ServiceOrderItem[]>([]);
  const [formTechnicianId, setFormTechnicianId] = useState('');
  const [formTechnician2Id, setFormTechnician2Id] = useState('');
  const [formRepresentative, setFormRepresentative] = useState('');
  const [formRepresentativeMatricula, setFormRepresentativeMatricula] = useState('');
  const [formRepresentativeRole, setFormRepresentativeRole] = useState('');
  const [formRepresentativeContact, setFormRepresentativeContact] = useState('');
  const [formServiceCompany, setFormServiceCompany] = useState<string>('lefrio');
  const [formPhotos, setFormPhotos] = useState<string[]>([]);
  const [formTechSignature, setFormTechSignature] = useState('');
  const [formClientSignature, setFormClientSignature] = useState('');
  const [formClientSignatureDate, setFormClientSignatureDate] = useState('');
  const [osSettings, setOsSettings] = useState<ServiceOrderSettings | null>(null);
  const [catalogItems, setCatalogItems] = useState<ServiceCatalogItem[]>([]);
  const [selectedProductCategoryFilter, setSelectedProductCategoryFilter] = useState<string>('ALL');
  const [selectedServiceCategoryFilter, setSelectedServiceCategoryFilter] = useState<string>('ALL');

  // Estado para busca/autocomplete de endereço no formulário administrativo de OS
  const [addressSearchTerm, setAddressSearchTerm] = useState('');
  const [isAddressDropdownOpen, setIsAddressDropdownOpen] = useState(false);
  const addressDropdownRef = useRef<HTMLDivElement>(null);

  // Fecha dropdowns de busca de endereço ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addressDropdownRef.current && !addressDropdownRef.current.contains(event.target as Node)) {
        setIsAddressDropdownOpen(false);
      }
      if (reportAddressDropdownRef.current && !reportAddressDropdownRef.current.contains(event.target as Node)) {
        setIsReportAddressDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Estados para fluxo personalizado de técnico (visualização de O.S. geradas / recebidas do ADM / rascunhos)
  const [techActiveTab, setTechActiveTab] = useState<'my_orders' | 'adm_orders' | 'drafts' | 'form'>('my_orders');

  // Inscrição sob demanda para chamados técnicos (evita concorrência e re-renders no carregamento inicial da lista/relatório)
  useEffect(() => {
    const needsLiveCalls = isFormOpen || (userRole === UserRole.TECHNICIAN && techActiveTab === 'form');
    if (!needsLiveCalls) return;

    const unsubscribeCalls = dataService.subscribeServiceCalls((calls) => {
      serviceCallsLoadedRef.current = true;
      setServiceCalls(calls);
    }, managerClientId);
    return () => {
      unsubscribeCalls();
    };
  }, [managerClientId, isFormOpen, userRole, techActiveTab]);
  const [techSearchTerm, setTechSearchTerm] = useState('');
  const [techStatusFilter, setTechStatusFilter] = useState('all');
  const [techSelectedAddressId, setTechSelectedAddressId] = useState<string>('');
  const [techSelectionMode, setTechSelectionMode] = useState<'roteiro' | 'avulso'>('roteiro');

  // Rascunhos de O.S. salvos localmente no dispositivo do técnico (sem gerar ID permanente nem gravar no banco)
  const [techDrafts, setTechDrafts] = useState<TechOSDraft[]>(() => {
    try {
      const saved = localStorage.getItem('lefrio_tech_os_drafts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

  const saveDraftsToStorage = (updatedDrafts: TechOSDraft[]) => {
    setTechDrafts(updatedDrafts);
    try {
      localStorage.setItem('lefrio_tech_os_drafts', JSON.stringify(updatedDrafts));
    } catch (e) {
      console.error('Erro ao salvar rascunhos no localStorage:', e);
    }
  };
  const [techItineraryDate, setTechItineraryDate] = useState(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - (offset * 60 * 1000));
    return localToday.toISOString().split('T')[0];
  });
  const [effectiveTechItineraryDate, setEffectiveTechItineraryDate] = useState<string>('');
  const [techItineraryRecords, setTechItineraryRecords] = useState<any[]>([]);
  const [loadingItinerary, setLoadingItinerary] = useState(false);

  // Estados de Paginação para Abas do Técnico (Minhas O.S. e Recebidas do ADM)
  const [techMyOrdersPage, setTechMyOrdersPage] = useState(1);
  const [techMyOrdersPerPage, setTechMyOrdersPerPage] = useState(12);
  const [techAdmOrdersPage, setTechAdmOrdersPage] = useState(1);
  const [techAdmOrdersPerPage, setTechAdmOrdersPerPage] = useState(12);

  useEffect(() => {
    setTechMyOrdersPage(1);
    setTechAdmOrdersPage(1);
  }, [techSearchTerm, techStatusFilter, techMyOrdersPerPage, techAdmOrdersPerPage]);

  // Sistema canônico de indexação de técnicos em MAIÚSCULAS
  const techIndex = useMemo(() => buildTechnicianIndex(technicians), [technicians]);

  // Resolução rápida O(1) do(s) técnico(s) da O.S. com fallback seguro (evita '---' no Relatório Avançado, CSV e Impressão)
  const resolveSingleTechName = (raw?: string | null): string => {
    if (!raw) return '';
    const trimmed = String(raw).trim();
    if (!trimmed) return '';
    const indexed = techIndex.findTech(trimmed);
    if (indexed?.name) return indexed.name;
    const looksLikeOpaqueId = /^[a-zA-Z0-9_-]{18,}$/.test(trimmed) && !trimmed.includes(' ');
    if (!looksLikeOpaqueId && !isStaffName(trimmed)) {
      return trimmed.toUpperCase();
    }
    return '';
  };

  const resolveOrderTechnicianDisplay = (order?: Partial<ServiceOrder> | null, emptyFallback: string = '---'): string => {
    if (!order) return emptyFallback;
    const anyOrder = order as any;
    const names: string[] = [];
    const pushUnique = (val?: string | null) => {
      const resolved = resolveSingleTechName(val);
      if (resolved && !names.includes(resolved)) {
        names.push(resolved);
      }
    };

    pushUnique(order.technicianId);
    pushUnique(order.technician2Id);

    if (names.length === 0) {
      pushUnique(anyOrder.technicianName);
      pushUnique(anyOrder.technician1);
      pushUnique(anyOrder.technician2);
      pushUnique(anyOrder.technician);
    }

    if (names.length === 0 && order.authenticatedTeam) {
      const teamStr = String(order.authenticatedTeam);
      const appMatch = teamStr.match(/\d{2}:\d{2}(?::\d{2})?\s+([^)]+)\)/);
      if (appMatch && appMatch[1]) {
        appMatch[1].split(/[/,&]+/).forEach(part => pushUnique(part));
      } else {
        for (const it of techIndex.indexedTechs) {
          if (it.name && teamStr.toUpperCase().includes(it.name)) {
            pushUnique(it.name);
          }
        }
      }
    }

    if (names.length === 0 && order.openedBy && !isStaffName(order.openedBy)) {
      pushUnique(order.openedBy);
    }

    return names.length > 0 ? names.join(' / ') : emptyFallback;
  };

  // Identificação do técnico logado
  const currentTechName = useMemo(() => {
    let activeTechName = userProfile?.name || '';
    const savedTech = localStorage.getItem('lefrio_tablet_auth_tech');
    if (savedTech) {
      try {
        const techObj = JSON.parse(savedTech);
        if (techObj && techObj.name) {
          activeTechName = techObj.name;
        }
      } catch (e) {}
    }
    return activeTechName;
  }, [userProfile]);

  const currentTechObj = useMemo(() => {
    if (!currentTechName) return null;
    const indexed = techIndex.findTech(currentTechName);
    if (indexed) {
      return technicians.find(t => t.id === indexed.originalId) || null;
    }
    return technicians.find(t => (t.name || '').trim().toLowerCase() === currentTechName.trim().toLowerCase()) || null;
  }, [technicians, currentTechName, techIndex]);

  // Funções auxiliares com indexação em MAIÚSCULAS e verificação exclusiva do técnico
  // Impede que as ordens de serviço do técnico 1 apareçam para o técnico 2
  const isOrderAssignedToTech = (order?: Partial<ServiceOrder> | null, targetTechId?: string, targetTechName?: string): boolean => {
    if (!order) return false;
    const targetQuery = targetTechId || targetTechName;
    if (!targetQuery) return false;

    // Regra mandatória: a ordem pertence exclusivamente ao técnico titular (technicianId)
    // Transforma todas as letras em MAIÚSCULAS e ignora diferenças de caixa/acentos
    return techIndex.isOrderOwnedByTech(order, targetQuery);
  };

  const isOrderOpenedByTech = (order?: Partial<ServiceOrder> | null, targetTechName?: string): boolean => {
    if (!order || !targetTechName || !order.openedBy) return false;
    return techIndex.matchesTechTitular(order.openedBy, targetTechName);
  };

  const isAdmOrderForTech = (order?: Partial<ServiceOrder> | null, targetTechId?: string, targetTechName?: string): boolean => {
    if (!order) return false;
    const isMyAssigned = isOrderAssignedToTech(order, targetTechId, targetTechName);
    const isOpenedByMe = isOrderOpenedByTech(order, targetTechName);
    
    // Não foi aberta pelo próprio técnico no tablet, mas está atribuída a ele como titular pelo administrativo
    if (!isMyAssigned || isOpenedByMe) return false;
    
    // Pendente de atendimento ou sem solução concluída
    const isPendingOrOpen = order.status === 'aberta' || order.status === 'em_andamento';
    const noSolution = !order.solution || !String(order.solution).trim();
    return isPendingOrOpen || noSolution;
  };

  const isMyGeneratedOrder = (order?: Partial<ServiceOrder> | null, targetTechId?: string, targetTechName?: string): boolean => {
    if (!order) return false;
    const isMyAssigned = isOrderAssignedToTech(order, targetTechId, targetTechName);
    const isOpenedByMe = isOrderOpenedByTech(order, targetTechName);
    const hasSolution = Boolean(order.solution && String(order.solution).trim());
    const isFinished = order.status === 'pre_finalizada' || order.status === 'finalizada';
    
    // Aberta pelo próprio técnico ou atribuída a ele como titular e já atendida/concluída por ele
    return isOpenedByMe || (isMyAssigned && (hasSolution || isFinished));
  };

  // Conjunto de IDs de endereços autorizados para o técnico (Roteiro do dia, último roteiro ou ordens programadas)
  const allowedAddressIdsForTech = useMemo(() => {
    if (userRole !== UserRole.TECHNICIAN) {
      return null;
    }

    const ids = new Set<string>();

    // 1. Endereços do roteiro de manutenção preventiva (dia atual ou último roteiro)
    techItineraryRecords.forEach(r => {
      if (r.addressId) ids.add(r.addressId);
    });

    // 2. Endereços com ordens de serviço programadas/atribuídas para este técnico
    orders.forEach(o => {
      if (!o || !o.addressId) return;
      const isAssigned = isOrderAssignedToTech(o, currentTechObj?.id || '', currentTechName);
      const isOpenedByMe = isOrderOpenedByTech(o, currentTechName);
      
      if (isAssigned || isOpenedByMe) {
        ids.add(o.addressId);
      }
    });

    // 3. Se estiver editando uma O.S. já existente (selectedOrder), mantém o endereço dela permitido
    if (selectedOrder && selectedOrder.addressId) {
      ids.add(selectedOrder.addressId);
    }

    return ids;
  }, [userRole, techItineraryRecords, orders, currentTechObj, currentTechName, technicians, selectedOrder]);

  // Lista de clientes disponíveis no formulário de O.S. (restringe para técnico aos clientes com endereços programados)
  const availableClientsForForm = useMemo(() => {
    if (userRole !== UserRole.TECHNICIAN || !allowedAddressIdsForTech) {
      return clients;
    }

    const currentOrderClientId = selectedOrder?.clientId || formClientId;

    return clients.filter(c => {
      if (currentOrderClientId && c.id === currentOrderClientId) return true;
      const clientAddrs = addresses.filter(a => a.clientId === c.id);
      return clientAddrs.some(a => allowedAddressIdsForTech.has(a.id));
    });
  }, [clients, addresses, userRole, allowedAddressIdsForTech, selectedOrder, formClientId]);

  // Lista de endereços disponíveis no formulário de O.S. para o cliente selecionado
  const availableAddressesForForm = useMemo(() => {
    if (!formClientId) return [];
    const clientAddrs = addresses.filter(a => a.clientId === formClientId);
    if (userRole !== UserRole.TECHNICIAN || !allowedAddressIdsForTech) {
      return clientAddrs;
    }

    const currentOrderAddressId = selectedOrder?.addressId;

    return clientAddrs.filter(a => {
      if (currentOrderAddressId && a.id === currentOrderAddressId) return true;
      return allowedAddressIdsForTech.has(a.id);
    });
  }, [formClientId, addresses, userRole, allowedAddressIdsForTech, selectedOrder]);

  // Lista de endereços do cliente selecionado e lista filtrada por busca
  const formClientAddresses = useMemo(() => {
    if (!formClientId) return [];
    if (userRole === UserRole.TECHNICIAN) {
      return availableAddressesForForm;
    }
    return addresses.filter(a => a.clientId === formClientId);
  }, [addresses, formClientId, userRole, availableAddressesForForm]);

  const filteredFormAddresses = useMemo(() => {
    if (!formClientId) return [];
    if (!addressSearchTerm.trim()) return formClientAddresses;

    const normalizeStr = (str: string) => 
      (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    const queryTerms = normalizeStr(addressSearchTerm).split(/\s+/).filter(Boolean);

    return formClientAddresses.filter(a => {
      const street = normalizeStr(a.street);
      const name = normalizeStr(a.name || '');
      const neighborhood = normalizeStr(a.neighborhood || '');
      const complement = normalizeStr(a.complement || '');
      const route = normalizeStr(a.route || '');
      const number = (a.number || '').toLowerCase();
      const fullCombined = `${street} ${name} ${neighborhood} ${complement} ${route} ${number}`;

      return queryTerms.every(term => fullCombined.includes(term));
    });
  }, [formClientAddresses, addressSearchTerm, formClientId]);

  // Lista de endereços disponíveis para o filtro do Relatório Avançado (vinculada ao cliente selecionado ou geral)
  const reportAvailableAddresses = useMemo(() => {
    const effectiveClient = managerClientId || (reportClientId !== 'all' ? reportClientId : '');
    const baseList = effectiveClient
      ? addresses.filter(a => a.clientId === effectiveClient)
      : addresses;
    return [...baseList].sort((a, b) => (a.street || '').localeCompare(b.street || ''));
  }, [addresses, reportClientId, managerClientId]);

  const filteredReportAddressOptions = useMemo(() => {
    const rawQuery = reportAddressQuery.trim();
    if (!rawQuery) return reportAvailableAddresses.slice(0, 60);

    const normalizeStr = (str: string) =>
      (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const queryTerms = normalizeStr(rawQuery).split(/\s+/).filter(Boolean);
    return reportAvailableAddresses
      .filter(a => {
        const clientName = clients.find(c => c.id === a.clientId)?.name || '';
        const combined = normalizeStr(
          `${a.street || ''} ${a.name || ''} ${a.neighborhood || ''} ${a.complement || ''} ${a.route || ''} ${a.number || ''} ${clientName}`
        );
        return queryTerms.every(term => combined.includes(term));
      })
      .slice(0, 60);
  }, [reportAvailableAddresses, reportAddressQuery, clients]);

  // Estados para busca e abertura rápida de O.S. por ID da Máquina
  const [machineIdSearchInput, setMachineIdSearchInput] = useState('');
  const [isSearchingMachine, setIsSearchingMachine] = useState(false);
  const [machineSearchFeedback, setMachineSearchFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    foundData?: {
      equipment: Equipment;
      address?: Address;
      client?: Client;
    };
  } | null>(null);
  const [quickOpenMachineId, setQuickOpenMachineId] = useState('');
  const [isQuickOpening, setIsQuickOpening] = useState(false);

  const getActiveCompanyForOrder = (companyId?: string) => {
    return osSettings?.companies.find(c => c.id === companyId) || {
      id: 'lefrio',
      shortName: 'JR COMÉRCIO E SERVIÇOS (LEFRIO)',
      fullName: 'JR COMERCIO E SERVICOS DE CLIMATIZACAO LTDA',
      cnpj: '22.731.413/0002-60',
      ie: '247308110',
      im: '901424174',
      address: 'RUA DR. ELISIO ALVES PEROBA, 103 - ANTARES - MACEIO - AL',
      email: 'atendimentomaceio@lefrio.com.br',
      phone: '(82) 3221-1031'
    };
  };

  const getStatusLabel = (status: ServiceOrder['status'] | string) => {
    switch (status) {
      case 'aberta':
        return 'Em Aberto';
      case 'em_andamento':
        return 'Em Andamento';
      case 'pre_finalizada':
        return 'Pré-Finalizada';
      case 'finalizada':
        return 'Finalizada';
      case 'cancelada':
        return 'Cancelada';
      default:
        return status ? status.replace('_', ' ') : '-';
    }
  };

  const printCompany = selectedOrder ? getActiveCompanyForOrder(selectedOrder.serviceCompany) : null;

  const renderCompanyLogo = (companyId?: string, className = "w-14 h-14") => {
    const comp = osSettings?.companies?.find(c => c.id === companyId);
    return (
      <CompanyLogo 
        companyId={companyId} 
        logoUrl={comp?.logoUrl} 
        className={className} 
        alt={comp?.shortName || comp?.fullName} 
      />
    );
  };

  const formatOrdersLoadError = (err: any): string => {
    const raw = String(err?.message || err || '').toLowerCase();
    if (raw.includes('quota') || raw.includes('resource-exhausted')) {
      return 'Limite diário de leituras do banco de dados atingido. Aguarde a renovação da cota ou atualize o plano no Firebase.';
    }
    if (raw.includes('permission') || raw.includes('insufficient')) {
      return 'Sem permissão para acessar as Ordens de Serviço. Verifique se sua sessão está ativa ou faça login novamente.';
    }
    if (raw.includes('timeout') || raw.includes('deadline')) {
      return 'A conexão com o banco de dados demorou mais que o esperado. Clique em "Tentar Novamente" para recarregar as Ordens de Serviço.';
    }
    return 'Não foi possível conectar ao servidor para carregar as Ordens de Serviço. Verifique sua conexão e tente novamente.';
  };

  // Normalização estritamente em memória (sem disparar updateServiceOrder nem invalidar o cache durante a leitura)
  const normalizeOrdersInMemory = (ordersList: ServiceOrder[]): ServiceOrder[] => {
    return ordersList.map(raw => {
      let normalized = raw;
      if (!raw.adminFinalized && raw.status === 'finalizada') {
        normalized = { ...raw, status: 'aberta', techFinalized: true };
      }

      if (normalized.products && normalized.products.length > 0) {
        let orderChanged = false;
        const fixedProducts = normalized.products.map(p => {
          if (p.code === '336' && (p.discountPercent === 74.61 || p.totalValue === 21.66 || p.totalValue === 10.83 || (p.discountPercent && p.discountPercent > 0))) {
            const pQty = typeof p.quantity === 'number' ? p.quantity : (parseFloat(String(p.quantity).replace(',', '.')) || 0);
            const pUnit = typeof p.unitValue === 'number' ? p.unitValue : (parseFloat(String(p.unitValue).replace(',', '.')) || 42.65);
            orderChanged = true;
            return { ...p, discountPercent: 0, totalValue: Number((pQty * pUnit).toFixed(2)) };
          }
          return p;
        });
        if (orderChanged) {
          const sTotal = (normalized.services || []).reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0);
          const pTotal = fixedProducts.reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0);
          normalized = { ...normalized, products: fixedProducts, totalValue: Number((sTotal + pTotal).toFixed(2)) };
        }
      }
      return normalized;
    });
  };

  // Sincroniza instantaneamente uma O.S. salva/alterada em toda a memória local
  // (Relatório Avançado, Lista Principal, Cache de Páginas e O.S. selecionada) com 0 leituras extras no Firestore.
  const syncOrderInLocalState = (updatedOrder: ServiceOrder, options?: { isNew?: boolean }) => {
    const [normalized] = normalizeOrdersInMemory([updatedOrder]);
    if (!normalized) return;

    // 1. Atualiza imediatamente o Relatório Avançado (recalcula tabela, KPIs, gráficos, CSV e impressão em memória)
    setReportRawOrders(prev => {
      const existsIndex = prev.findIndex(o => o.id === normalized.id);
      if (existsIndex >= 0) {
        const next = [...prev];
        next[existsIndex] = { ...next[existsIndex], ...normalized };
        return next;
      }
      if (options?.isNew && reportHasSearched) {
        return sortOrdersByCreationDateDesc([normalized, ...prev]);
      }
      return prev;
    });

    // 2. Atualiza a lista principal em memória (mantém a página atual sem novas leituras)
    setOrders(prev => {
      const existsIndex = prev.findIndex(o => o.id === normalized.id);
      if (existsIndex >= 0) {
        const next = [...prev];
        next[existsIndex] = { ...next[existsIndex], ...normalized };
        return next;
      }
      return prev;
    });

    // 3. Atualiza qualquer página já armazenada no cache de paginação por cursor
    for (const pageKey of Object.keys(pagesCacheRef.current)) {
      const pageNum = Number(pageKey);
      const cachedPage = pagesCacheRef.current[pageNum];
      if (!cachedPage) continue;
      const idx = cachedPage.orders.findIndex(o => o.id === normalized.id);
      if (idx >= 0) {
        const nextOrders = [...cachedPage.orders];
        nextOrders[idx] = { ...nextOrders[idx], ...normalized };
        pagesCacheRef.current[pageNum] = { ...cachedPage, orders: nextOrders };
      }
    }

    // 4. Mantém selectedOrder coerente caso ainda esteja aberta/referenciada
    setSelectedOrder(prev => (prev && prev.id === normalized.id ? { ...prev, ...normalized } : prev));
  };

  // Aplica atualização parcial em memória (cancelamento, reabertura, redefinição de número ou link de assinatura)
  const patchOrderInLocalState = (orderId: string, patch: Partial<ServiceOrder>) => {
    const applyPatch = (list: ServiceOrder[]) => {
      let changed = false;
      const next = list.map(o => {
        if (o.id !== orderId) return o;
        changed = true;
        return { ...o, ...patch };
      });
      return changed ? next : list;
    };

    setReportRawOrders(prev => applyPatch(prev));
    setOrders(prev => applyPatch(prev));

    for (const pageKey of Object.keys(pagesCacheRef.current)) {
      const pageNum = Number(pageKey);
      const cachedPage = pagesCacheRef.current[pageNum];
      if (!cachedPage) continue;
      const updated = applyPatch(cachedPage.orders);
      if (updated !== cachedPage.orders) {
        pagesCacheRef.current[pageNum] = { ...cachedPage, orders: updated };
      }
    }

    setSelectedOrder(prev => (prev && prev.id === orderId ? { ...prev, ...patch } : prev));
  };

  // Carregamento isolado das tabelas auxiliares (clientes, endereços, técnicos, configurações, catálogo)
  const loadAuxiliaryData = async (forceRefresh: boolean = false) => {
    if (auxiliaryLoadedRef.current && !forceRefresh) return;
    const [clientsRes, addressesRes, techsRes, settingsRes, catalogRes] = await Promise.allSettled([
      dataService.getClients(managerClientId),
      dataService.getAddresses(managerClientId),
      dataService.getTechnicians(),
      dataService.getServiceOrderSettings(),
      dataService.getServiceCatalogItems()
    ]);

    if (clientsRes.status === 'fulfilled') setClients(clientsRes.value);
    else console.warn('Falha ao carregar clientes em O.S.:', clientsRes.reason);

    if (addressesRes.status === 'fulfilled') setAddresses(addressesRes.value);
    else console.warn('Falha ao carregar endereços em O.S.:', addressesRes.reason);

    if (techsRes.status === 'fulfilled') setTechnicians(techsRes.value);
    else console.warn('Falha ao carregar técnicos em O.S.:', techsRes.reason);

    if (settingsRes.status === 'fulfilled' && settingsRes.value) {
      const settings = settingsRes.value;
      setOsSettings(settings);
      if (settings.maintenanceTypes && settings.maintenanceTypes.length > 0) {
        setFormType(settings.maintenanceTypes[0]);
      }
      if (settings.companies && settings.companies.length > 0) {
        setFormServiceCompany(settings.companies[0].id);
      }
    } else if (settingsRes.status === 'rejected') {
      console.warn('Falha ao carregar configurações de O.S.:', settingsRes.reason);
    }

    if (catalogRes.status === 'fulfilled') setCatalogItems(catalogRes.value);
    else console.warn('Falha ao carregar catálogo em O.S.:', catalogRes.reason);

    auxiliaryLoadedRef.current = true;
  };

  // Carrega uma página específica sob demanda (Admin/Assistente/Gerente): 25 últimas O.S. na página 1 e avanço por cursor
  const loadOrdersPage = async (
    targetPage: number,
    options?: {
      resetCache?: boolean;
      forceRefresh?: boolean;
      statusOverride?: string;
      workshopOverride?: boolean;
      startDateOverride?: string;
      endDateOverride?: string;
      pageSizeOverride?: number;
    }
  ) => {
    const reqId = ++pageRequestCounterRef.current;
    const effStatus = options?.statusOverride !== undefined ? options.statusOverride : statusFilter;
    const effWorkshop = options?.workshopOverride !== undefined ? options.workshopOverride : workshopOnlyFilter;
    const effStart = options?.startDateOverride !== undefined ? options.startDateOverride : startDateFilter;
    const effEnd = options?.endDateOverride !== undefined ? options.endDateOverride : endDateFilter;
    const effPageSize = options?.pageSizeOverride !== undefined ? options.pageSizeOverride : itemsPerPage;

    const resetCache = Boolean(options?.resetCache);
    const forceRefresh = Boolean(options?.forceRefresh);

    if (resetCache) {
      pagesCacheRef.current = {};
      setLoadedPagesCount(0);
    }

    // Se a página já está em cache no modo cursor e não é refresh forçado, troca instantaneamente (0 leituras no banco!)
    if (!resetCache && !forceRefresh && paginationMode === 'cursor' && pagesCacheRef.current[targetPage]) {
      const cached = pagesCacheRef.current[targetPage];
      setOrders(cached.orders);
      setCurrentPage(targetPage);
      setHasMorePages(cached.hasMore);
      setLoadError(null);
      return;
    }

    setLoadError(null);
    if (orders.length === 0 && targetPage === 1) {
      setLoading(true);
    } else if (targetPage > 1) {
      setIsLoadingPage(true);
    } else {
      setIsRefreshing(true);
    }

    const auxiliaryPromise = loadAuxiliaryData(forceRefresh);

    // Atualiza contagem agregada leve no servidor (sem baixar documentos) na página 1 ou em refresh
    const countsPromise = (targetPage === 1 || forceRefresh || serverTotalOrders === null)
      ? dataService.getServiceOrdersCounts(managerClientId, forceRefresh).then((counts) => {
          if (reqId !== pageRequestCounterRef.current) return;
          if (counts.total !== null) setServerTotalOrders(counts.total);
          if (counts.workshop !== null) setServerWorkshopOrders(counts.workshop);
        }).catch(() => {})
      : Promise.resolve();

    try {
      // Avança passo a passo a partir da última página carregada caso o usuário pule mais de 1 página no modo cursor
      const hasAnyListFilter = Boolean(
        managerClientId ||
        (effStatus && effStatus !== 'all') ||
        effWorkshop ||
        effStart ||
        effEnd
      );

      if (!hasAnyListFilter && targetPage > 1) {
        let highestLoaded = 0;
        for (let p = 1; p < targetPage; p++) {
          if (pagesCacheRef.current[p]) highestLoaded = p;
          else break;
        }

        let currentCursor = highestLoaded > 0 ? pagesCacheRef.current[highestLoaded].lastDoc : null;
        let lastPageLoaded = highestLoaded;

        for (let p = highestLoaded + 1; p <= targetPage; p++) {
          if (p > 1 && !currentCursor) break;
          const res = await dataService.getServiceOrdersPaginated({
            pageSize: effPageSize,
            lastDoc: currentCursor
          });
          if (reqId !== pageRequestCounterRef.current) return;
          const normalized = normalizeOrdersInMemory(res.orders);
          pagesCacheRef.current[p] = {
            orders: normalized,
            lastDoc: res.lastDoc,
            hasMore: res.hasMore
          };
          currentCursor = res.lastDoc;
          lastPageLoaded = p;
          if (!res.hasMore) break;
        }

        const resolvedPage = Math.min(targetPage, Math.max(1, lastPageLoaded));
        const finalCached = pagesCacheRef.current[resolvedPage];
        if (finalCached) {
          setPaginationMode('cursor');
          setOrders(finalCached.orders);
          setCurrentPage(resolvedPage);
          setHasMorePages(finalCached.hasMore);
          setLoadedPagesCount(Object.keys(pagesCacheRef.current).length);
          setLoadError(null);
        }
      } else {
        const res = await dataService.getServiceOrdersPaginated({
          clientId: managerClientId,
          pageSize: effPageSize,
          lastDoc: null,
          status: effStatus,
          workshopOnly: effWorkshop,
          hasDateFilter: Boolean(effStart || effEnd)
        });
        if (reqId !== pageRequestCounterRef.current) return;

        const normalized = normalizeOrdersInMemory(res.orders);
        if (res.mode === 'cursor') {
          pagesCacheRef.current = {
            1: {
              orders: normalized,
              lastDoc: res.lastDoc,
              hasMore: res.hasMore
            }
          };
          setPaginationMode('cursor');
          setOrders(normalized);
          setCurrentPage(1);
          setHasMorePages(res.hasMore);
          setLoadedPagesCount(1);
        } else {
          pagesCacheRef.current = {};
          setPaginationMode('filtered_all');
          setOrders(sortOrdersByCreationDateDesc(normalized));
          setCurrentPage(1);
          setHasMorePages(false);
          setLoadedPagesCount(0);
        }
        setLoadError(null);
      }
    } catch (err) {
      if (reqId !== pageRequestCounterRef.current) return;
      console.error('Erro ao carregar página de Ordens de Serviço:', err);
      setLoadError(formatOrdersLoadError(err));
    } finally {
      if (reqId === pageRequestCounterRef.current) {
        setLoading(false);
        setIsRefreshing(false);
        setIsLoadingPage(false);
      }
    }

    await Promise.allSettled([auxiliaryPromise, countsPromise]);
  };

  // Busca exata pelo número da O.S. (disparada SOMENTE ao pressionar Enter ou clicar em Buscar)
  const handleExactSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = searchTerm.trim();

    // Se o usuário apagou o texto e apertou Enter, volta para a listagem paginada das 25 últimas O.S.
    if (!trimmed) {
      setActiveExactSearch('');
      await loadOrdersPage(1, { resetCache: true });
      return;
    }

    const reqId = ++pageRequestCounterRef.current;
    setIsSearchingExact(true);
    setLoadError(null);
    setActiveExactSearch(trimmed);

    try {
      const found = await dataService.findServiceOrderByExactNumber(trimmed, managerClientId);
      if (reqId !== pageRequestCounterRef.current) return;
      const normalized = normalizeOrdersInMemory(found);
      setPaginationMode('exact_search');
      setOrders(sortOrdersByCreationDateDesc(normalized));
      setCurrentPage(1);
      setHasMorePages(false);
      setLoadError(null);
    } catch (err) {
      if (reqId !== pageRequestCounterRef.current) return;
      console.error('Erro na busca exata de O.S.:', err);
      setLoadError(formatOrdersLoadError(err));
    } finally {
      if (reqId === pageRequestCounterRef.current) {
        setIsSearchingExact(false);
        setLoading(false);
      }
    }
  };

  const handleClearExactSearch = async () => {
    setSearchTerm('');
    setActiveExactSearch('');
    await loadOrdersPage(1, { resetCache: true });
  };

  const goToListPage = async (targetPage: number) => {
    if (targetPage < 1 || isLoadingPage) return;
    if (paginationMode === 'cursor') {
      await loadOrdersPage(targetPage);
    } else {
      setCurrentPage(Math.min(Math.max(1, targetPage), totalPages));
    }
  };

  // Verifica se há pelo menos 1 filtro selecionado no Relatório Avançado
  const hasAnyReportFilterSelected = Boolean(
    reportStartDate ||
    reportEndDate ||
    reportClientId !== 'all' ||
    reportAddressId !== 'all' ||
    reportAddressQuery.trim() ||
    reportTechnicianId !== 'all' ||
    reportStatus !== 'all' ||
    reportCompany !== 'all' ||
    reportType !== 'all' ||
    reportWorkshopFilter !== 'all' ||
    managerClientId
  );

  // Busca sob demanda do Relatório Avançado (somente quando há filtros selecionados e o usuário aperta Enter ou clica em Buscar)
  const handleExecuteReportSearch = async (
    e?: React.FormEvent,
    overrideFilters?: Partial<{
      startDate: string;
      endDate: string;
      clientId: string;
      addressId: string;
      addressQuery: string;
      technicianId: string;
      status: string;
      company: string;
      type: string;
      workshopFilter: 'all' | 'workshop_only' | 'standard_only';
    }>
  ) => {
    if (e) e.preventDefault();

    const nextFilters = {
      startDate: overrideFilters?.startDate !== undefined ? overrideFilters.startDate : reportStartDate,
      endDate: overrideFilters?.endDate !== undefined ? overrideFilters.endDate : reportEndDate,
      clientId: overrideFilters?.clientId !== undefined ? overrideFilters.clientId : reportClientId,
      addressId: overrideFilters?.addressId !== undefined ? overrideFilters.addressId : reportAddressId,
      addressQuery: overrideFilters?.addressQuery !== undefined ? overrideFilters.addressQuery : reportAddressQuery.trim(),
      technicianId: overrideFilters?.technicianId !== undefined ? overrideFilters.technicianId : reportTechnicianId,
      status: overrideFilters?.status !== undefined ? overrideFilters.status : reportStatus,
      company: overrideFilters?.company !== undefined ? overrideFilters.company : reportCompany,
      type: overrideFilters?.type !== undefined ? overrideFilters.type : reportType,
      workshopFilter: overrideFilters?.workshopFilter !== undefined ? overrideFilters.workshopFilter : reportWorkshopFilter
    };

    const hasAny = Boolean(
      nextFilters.startDate ||
      nextFilters.endDate ||
      nextFilters.clientId !== 'all' ||
      nextFilters.addressId !== 'all' ||
      nextFilters.addressQuery ||
      nextFilters.technicianId !== 'all' ||
      nextFilters.status !== 'all' ||
      nextFilters.company !== 'all' ||
      nextFilters.type !== 'all' ||
      nextFilters.workshopFilter !== 'all' ||
      managerClientId
    );

    if (!hasAny) {
      setReportError('Selecione pelo menos um filtro acima (Período, Cliente, Endereço, Técnico, Status, Prestadora, Tipo ou Oficina) e pressione Enter para buscar.');
      return;
    }

    setReportLoading(true);
    setReportError(null);
    setIsReportAddressDropdownOpen(false);
    try {
      const effectiveClientId = managerClientId || (nextFilters.clientId !== 'all' ? nextFilters.clientId : undefined);
      const rawResults = await dataService.queryServiceOrdersForReport({
        clientId: effectiveClientId,
        addressId: nextFilters.addressId !== 'all' ? nextFilters.addressId : undefined,
        status: nextFilters.status,
        serviceCompany: nextFilters.company,
        type: nextFilters.type,
        workshopFilter: nextFilters.workshopFilter,
        startDate: nextFilters.startDate,
        endDate: nextFilters.endDate,
        technicianId: nextFilters.technicianId
      });
      const normalized = normalizeOrdersInMemory(rawResults);
      setReportRawOrders(sortOrdersByCreationDateDesc(normalized));
      setReportAppliedFilters(nextFilters);
      setReportHasSearched(true);
      setReportFiltersDirty(false);
      setReportCurrentPage(1);
    } catch (err) {
      console.error('Erro ao buscar O.S. para o Relatório Avançado:', err);
      setReportError(formatOrdersLoadError(err));
    } finally {
      setReportLoading(false);
    }
  };

  const handleClearReportFilters = () => {
    setReportStartDate('');
    setReportEndDate('');
    setReportClientId('all');
    setReportAddressId('all');
    setReportAddressQuery('');
    setIsReportAddressDropdownOpen(false);
    setReportTechnicianId('all');
    setReportStatus('all');
    setReportCompany('all');
    setReportType('all');
    setReportWorkshopFilter('all');
    setReportRawOrders([]);
    setReportHasSearched(false);
    setReportFiltersDirty(false);
    setReportError(null);
    setReportCurrentPage(1);
  };

  const loadData = async (forceRefresh: boolean = false) => {
    // Perfil Administrativo / Assistente / Gerente: paginação sob demanda (25 últimas O.S. por página)
    if (userRole !== UserRole.TECHNICIAN) {
      if (activeExactSearch) {
        await loadAuxiliaryData(forceRefresh);
        await handleExactSearchSubmit();
      } else {
        await loadOrdersPage(1, { resetCache: true, forceRefresh });
      }
      if (reportHasSearched && forceRefresh) {
        await handleExecuteReportSearch(undefined, reportAppliedFilters);
      }
      return;
    }

    // Perfil Técnico: carrega O.S. para as abas "Minhas O.S." e "O.S. do Administrativo"
    setLoadError(null);
    setLoadedOrdersProgress(0);
    if (orders.length === 0) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }

    const auxiliaryPromise = loadAuxiliaryData(forceRefresh);

    try {
      let pushedInitialBatch = false;
      const hadExistingOrders = orders.length > 0;

      const ordersList = await dataService.getServiceOrders(managerClientId, undefined, {
        forceRefresh,
        onProgress: (partialOrders, count) => {
          setLoadedOrdersProgress(count);
          if (!hadExistingOrders && !pushedInitialBatch && partialOrders.length > 0) {
            pushedInitialBatch = true;
            setOrders(partialOrders);
          }
        }
      });

      const normalizedOrders = normalizeOrdersInMemory(ordersList);
      setOrders(sortOrdersByCreationDateDesc(normalizedOrders));
      setLoadError(null);
    } catch (err) {
      console.error('Erro ao carregar Ordens de Serviço:', err);
      setLoadError(formatOrdersLoadError(err));
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }

    await auxiliaryPromise;
  };

  // Carregar dados iniciais e reagir a mudanças de filtros / tamanho de página na lista principal
  useEffect(() => {
    if (userRole === UserRole.TECHNICIAN) {
      loadData(false);
      return;
    }
    if (activeExactSearch) {
      // Se o usuário mudou filtro de status/oficina/período/tamanho enquanto estava em busca exata, limpa a busca e aplica o filtro
      setActiveExactSearch('');
      setSearchTerm('');
    }
    loadOrdersPage(1, { resetCache: true, forceRefresh: false });
  }, [managerClientId, statusFilter, workshopOnlyFilter, startDateFilter, endDateFilter, itemsPerPage, userRole]);

  // Carrega os equipamentos quando o endereço do formulário muda
  useEffect(() => {
    if (formAddressId) {
      dataService.getEquipments(formAddressId).then(setEquipments).catch(console.error);
    } else {
      setEquipments([]);
    }
  }, [formAddressId]);

  // Carrega o roteiro do técnico para a data selecionada ou busca os endereços da última data ativa
  useEffect(() => {
    if (userRole === UserRole.TECHNICIAN) {
      const loadTechItinerary = async () => {
        setLoadingItinerary(true);
        try {
          // Tenta ler o técnico autenticado no dispositivo/tablet do localStorage primeiro
          let activeTechName = userProfile?.name || '';
          const savedTech = localStorage.getItem('lefrio_tablet_auth_tech');
          if (savedTech) {
            try {
              const techObj = JSON.parse(savedTech);
              if (techObj && techObj.name) {
                activeTechName = techObj.name;
              }
            } catch (e) {
              console.warn('Erro ao ler técnico do localStorage:', e);
            }
          }

          const targetMonth = techItineraryDate.substring(0, 7);
          
          // Mês anterior para garantir busca ampla no histórico recente
          let prevMonthStr = '';
          try {
            const [yStr, mStr] = targetMonth.split('-');
            let y = parseInt(yStr, 10);
            let m = parseInt(mStr, 10) - 1;
            if (m === 0) {
              m = 12;
              y -= 1;
            }
            prevMonthStr = `${y}-${String(m).padStart(2, '0')}`;
          } catch (e) {}

          const [recordsForDate, currentMonthRecords, prevMonthRecords] = await Promise.all([
            dataService.getRecordsByPlannedDate(techItineraryDate).catch(() => []),
            dataService.getRecords(targetMonth).catch(() => []),
            prevMonthStr ? dataService.getRecords(prevMonthStr).catch(() => []) : Promise.resolve([])
          ]);

          const filterForTech = (list: MaintenanceRecord[]) => {
            return (list || []).filter(r => {
              if (!r || isOSRecord(r)) return false;
              if (!activeTechName) return true;
              return (
                (r.technician1 && r.technician1.trim().toLowerCase() === activeTechName.trim().toLowerCase()) ||
                (r.technician2 && r.technician2.trim().toLowerCase() === activeTechName.trim().toLowerCase())
              );
            });
          };

          const filteredDateRecords = filterForTech(recordsForDate);

          // Coleta todos os registros cadastrados do técnico no período recente
          const allRecordsMap = new Map<string, MaintenanceRecord>();
          [...currentMonthRecords, ...prevMonthRecords].forEach(r => {
            if (r && r.id) allRecordsMap.set(r.id, r);
          });
          const allTechRecords = filterForTech(Array.from(allRecordsMap.values()));

          let effectiveDate = techItineraryDate;
          let recordsToShow: MaintenanceRecord[] = [];

          if (filteredDateRecords.length > 0) {
            effectiveDate = techItineraryDate;
            
            // Busca também registros do último roteiro anterior para que ambos os roteiros estejam autorizados
            const pastDates = allTechRecords
              .map(r => r.plannedDate)
              .filter((d): d is string => !!d && d < techItineraryDate);

            let lastRouteRecords: MaintenanceRecord[] = [];
            if (pastDates.length > 0) {
              const sortedPast = [...new Set(pastDates)].sort((a, b) => b.localeCompare(a));
              lastRouteRecords = allTechRecords.filter(r => r.plannedDate === sortedPast[0]);
            }

            const combinedMap = new Map<string, MaintenanceRecord>();
            filteredDateRecords.forEach(r => combinedMap.set(r.id, r));
            lastRouteRecords.forEach(r => combinedMap.set(r.id, r));
            recordsToShow = Array.from(combinedMap.values());
          } else {
            // Se não houver registros na data selecionada, busca a data mais recente com registros cadastrados para este técnico
            const pastDates = allTechRecords
              .map(r => r.plannedDate)
              .filter((d): d is string => !!d && d <= techItineraryDate);

            if (pastDates.length > 0) {
              const sortedPast = [...new Set(pastDates)].sort((a, b) => b.localeCompare(a));
              effectiveDate = sortedPast[0];
              recordsToShow = allTechRecords.filter(r => r.plannedDate === effectiveDate);
            } else {
              // Se não houver data passada, busca qualquer data mais recente do técnico
              const anyDates = allTechRecords
                .map(r => r.plannedDate)
                .filter((d): d is string => !!d);

              if (anyDates.length > 0) {
                const sortedAny = [...new Set(anyDates)].sort((a, b) => b.localeCompare(a));
                effectiveDate = sortedAny[0];
                recordsToShow = allTechRecords.filter(r => r.plannedDate === effectiveDate);
              } else {
                effectiveDate = techItineraryDate;
                recordsToShow = [];
              }
            }
          }

          setEffectiveTechItineraryDate(effectiveDate);

          const enriched = recordsToShow.map(r => {
            const addr = addresses.find(a => a.id === r.addressId);
            const client = clients.find(c => c.id === addr?.clientId);
            return { ...r, address: addr, client };
          }).filter(r => r.address);

          setTechItineraryRecords(enriched);
        } catch (err) {
          console.error('Erro ao carregar roteiro do técnico:', err);
        } finally {
          setLoadingItinerary(false);
        }
      };

      loadTechItinerary();
    }
  }, [techItineraryDate, userRole, addresses, clients, userProfile]);

  // Sync empresa prestadora com o cliente selecionado
  useEffect(() => {
    if (formClientId) {
      const selectedClient = clients.find(c => c.id === formClientId);
      if (selectedClient?.serviceCompany) {
        setFormServiceCompany(selectedClient.serviceCompany);
      } else {
        setFormServiceCompany('lefrio');
      }
    }
  }, [formClientId, clients]);

  // Handler de alteração do Cliente no Formulário para preencher dados denormalizados
  const handleClientChange = (clientId: string) => {
    setFormClientId(clientId);
    setFormEquipmentId('');
    setAddressSearchTerm('');
    setIsAddressDropdownOpen(false);
    
    // Auto-preencher representante (deixar em branco por padrão conforme solicitado) e empresa prestadora cadastrada no cliente
    const selectedClient = clients.find(c => c.id === clientId);
    if (selectedClient) {
      setFormRepresentative('');
      setFormRepresentativeRole('');
      setFormRepresentativeContact('');
      if (selectedClient.serviceCompany) {
        setFormServiceCompany(selectedClient.serviceCompany);
      } else {
        setFormServiceCompany('lefrio');
      }
    }

    // Para técnicos: se houver exatamente um endereço programado para este cliente, seleciona-o automaticamente
    if (userRole === UserRole.TECHNICIAN && clientId) {
      const allowedForThisClient = addresses.filter(
        a => a.clientId === clientId && (!allowedAddressIdsForTech || allowedAddressIdsForTech.has(a.id))
      );
      if (allowedForThisClient.length === 1) {
        const onlyAddr = allowedForThisClient[0];
        setFormAddressId(onlyAddr.id);
        const addrStreet = onlyAddr.street || '';
        const addrNum = onlyAddr.number ? `Nº ${onlyAddr.number}` : 'S/N';
        const addrName = onlyAddr.name ? ` (${onlyAddr.name})` : '';
        setAddressSearchTerm(`${addrStreet}, ${addrNum}${addrName}`);
      } else {
        setFormAddressId('');
      }
    } else {
      setFormAddressId('');
    }
  };

  // Handler de alteração do Endereço no Formulário
  const handleAddressChange = (addressId: string) => {
    setFormAddressId(addressId);
    setFormEquipmentId('');
  };

  // Buscar máquina por ID e preencher automaticamente cabeçalho (Cliente, Endereço, Máquina)
  const handleSearchAndFillByMachineId = async (customId?: string) => {
    const codeToSearch = (customId !== undefined ? customId : machineIdSearchInput).trim();
    if (!codeToSearch) {
      alert('Por favor, digite o ID ou Código da Máquina.');
      return;
    }

    setIsSearchingMachine(true);
    setMachineSearchFeedback(null);

    try {
      const result = await dataService.findEquipmentByIdOrCode(codeToSearch);

      if (!result) {
        setMachineSearchFeedback({
          type: 'error',
          message: `Nenhuma máquina encontrada com o ID/Código "${codeToSearch}". Verifique o número digitado ou preencha o cliente e endereço manualmente.`
        });
        return;
      }

      const { equipment: foundEq, address: foundAddr, client: foundClient } = result;

      // Validação restritiva para técnicos: só aceita máquina se o endereço estiver programado no roteiro
      if (userRole === UserRole.TECHNICIAN && allowedAddressIdsForTech && allowedAddressIdsForTech.size > 0 && foundAddr) {
        if (!allowedAddressIdsForTech.has(foundAddr.id)) {
          setMachineSearchFeedback({
            type: 'error',
            message: `Acesso Bloqueado: A máquina ID #${foundEq.id} pertence ao endereço "${foundAddr.street}, ${foundAddr.number || 'S/N'}" (${foundClient?.name || 'Cliente'}), que NÃO está programado no seu roteiro diário nem possui ordem atribuída para sua equipe. O sistema aceita apenas endereços da sua programação ativa.`
          });
          return;
        }
      }

      if (foundClient) {
        setFormClientId(foundClient.id);
        if (foundClient.serviceCompany) {
          setFormServiceCompany(foundClient.serviceCompany);
        }
      }

      if (foundAddr) {
        setFormAddressId(foundAddr.id);
        const addrStreet = foundAddr.street || '';
        const addrNum = foundAddr.number ? `Nº ${foundAddr.number}` : 'S/N';
        const addrName = foundAddr.name ? ` (${foundAddr.name})` : '';
        setAddressSearchTerm(`${addrStreet}, ${addrNum}${addrName}`);
        setIsAddressDropdownOpen(false);

        // Carrega equipamentos do endereço e seleciona o equipamento encontrado
        const addrEquipments = await dataService.getEquipments(foundAddr.id);
        setEquipments(addrEquipments);
      } else {
        setEquipments([foundEq]);
      }

      setFormEquipmentId(foundEq.id);
      setMachineIdSearchInput(foundEq.id);

      if (userRole === UserRole.TECHNICIAN) {
        setTechSelectionMode('avulso');
      }

      setMachineSearchFeedback({
        type: 'success',
        message: `Máquina ID #${foundEq.id} localizada com sucesso! Cliente e Endereço foram preenchidos automaticamente.`,
        foundData: result
      });
    } catch (error) {
      console.error('Erro ao buscar máquina por ID:', error);
      setMachineSearchFeedback({
        type: 'error',
        message: 'Ocorreu um erro ao buscar a máquina no banco de dados. Tente novamente.'
      });
    } finally {
      setIsSearchingMachine(false);
    }
  };

  // Abertura Rápida de O.S. pelo ID da Máquina a partir da listagem
  const handleQuickOpenByMachineId = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = quickOpenMachineId.trim();
    if (!code) {
      alert('Digite o ID da máquina para abrir a Ordem de Serviço.');
      return;
    }

    setIsQuickOpening(true);
    try {
      const result = await dataService.findEquipmentByIdOrCode(code);
      if (!result) {
        alert(`Nenhuma máquina foi localizada no banco de dados com o ID "${code}". Verifique o número digitado.`);
        return;
      }

      const { equipment: foundEq, address: foundAddr, client: foundClient } = result;

      // Validação restritiva para técnicos: só aceita máquina se o endereço estiver programado no roteiro
      if (userRole === UserRole.TECHNICIAN && allowedAddressIdsForTech && allowedAddressIdsForTech.size > 0 && foundAddr) {
        if (!allowedAddressIdsForTech.has(foundAddr.id)) {
          alert(`Acesso Bloqueado: A máquina ID #${foundEq.id} pertence ao endereço "${foundAddr.street}, ${foundAddr.number || 'S/N'}" (${foundClient?.name || 'Cliente'}), que NÃO consta no seu roteiro programado nem possui ordem atribuída para sua equipe.`);
          return;
        }
      }

      // Inicializa nova OS
      handleCreateNew();

      // Aplica os dados encontrados

      if (foundClient) {
        setFormClientId(foundClient.id);
        if (foundClient.serviceCompany) {
          setFormServiceCompany(foundClient.serviceCompany);
        }
      }

      if (foundAddr) {
        setFormAddressId(foundAddr.id);
        const addrStreet = foundAddr.street || '';
        const addrNum = foundAddr.number ? `Nº ${foundAddr.number}` : 'S/N';
        const addrName = foundAddr.name ? ` (${foundAddr.name})` : '';
        setAddressSearchTerm(`${addrStreet}, ${addrNum}${addrName}`);
        setIsAddressDropdownOpen(false);

        const addrEquipments = await dataService.getEquipments(foundAddr.id);
        setEquipments(addrEquipments);
      } else {
        setEquipments([foundEq]);
      }

      setFormEquipmentId(foundEq.id);
      setMachineIdSearchInput(foundEq.id);
      setQuickOpenMachineId('');

      if (userRole === UserRole.TECHNICIAN) {
        setTechSelectionMode('avulso');
        setTechActiveTab('form');
      } else {
        setIsFormOpen(true);
      }

      setMachineSearchFeedback({
        type: 'success',
        message: `Máquina ID #${foundEq.id} (${foundEq.name || 'Ar-Condicionado'}) localizada! Cabeçalho preenchido automaticamente.`,
        foundData: result
      });
    } catch (error) {
      console.error('Erro na abertura rápida de O.S. por ID:', error);
      alert('Erro ao localizar máquina e iniciar Ordem de Serviço.');
    } finally {
      setIsQuickOpening(false);
    }
  };

  // Auto-gerar número sequencial de OS
  const generateNextOsNumber = () => {
    let maxNum = 60423; // Número base do PDF
    orders.forEach(o => {
      const num = parseInt(o.id, 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    });
    return String(maxNum + 1);
  };

  // Abrir formulário para criação
  const handleCreateNew = () => {
    const now = new Date();
    const localNow = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    const todayStr = localNow.toISOString().substring(0, 16); // format: yyyy-MM-ddThh:mm
    
    // Responsável pela Abertura:
    // No sistema administrativo (userRole !== UserRole.TECHNICIAN), NÃO tem técnico logado;
    // O campo DEVE ser preenchido com o nome do usuário administrativo logado no sistema (userProfile.name).
    // No sistema do técnico (dispositivo externo / tablet), mantém a leitura do técnico autenticado (localStorage ou userProfile).
    let responsibleOpeningName = '';
    let activeTechName = '';

    if (userRole === UserRole.TECHNICIAN) {
      activeTechName = userProfile?.name || '';
      const savedTech = localStorage.getItem('lefrio_tablet_auth_tech');
      if (savedTech) {
        try {
          const techObj = JSON.parse(savedTech);
          if (techObj && techObj.name) {
            activeTechName = techObj.name;
          }
        } catch (e) {
          console.warn('Erro ao ler técnico do localStorage:', e);
        }
      }
      responsibleOpeningName = activeTechName || userProfile?.name || 'TÉCNICO';
    } else {
      // Sistema Administrativo: busca o nome cadastrado do usuário que está logado
      const loggedUserName = (userProfile?.name || (userProfile as any)?.displayName || '').trim();
      responsibleOpeningName = loggedUserName || 'ADMINISTRADOR';
    }

    setNextOsFeedback(null);
    setFormId('');
    setFormOsNumber('');
    setOriginalFormOsNumber('');
    setFormOsNumberChanged(false);
    setFormInitialOsNumber('');
    setFormOsNumberChangedAt(null);
    setFormOsNumberResetUsed(false);
    setFormClientId('');
    setFormAddressId('');
    setFormEquipmentId('');
    setAddressSearchTerm('');
    setIsAddressDropdownOpen(false);
    setMachineIdSearchInput('');
    setMachineSearchFeedback(null);
    setFormStatus('aberta');
    setFormType('MANUTENCAO CORRETIVA CONTRATO');
    setFormIsWorkshop(false);
    setFormOpenedAt(todayStr);
    setFormOpenedBy(responsibleOpeningName.toUpperCase());
    setFormFinishedAt('');
    setFormExternalOs('');
    setFormPlannedDate('');
    setFormDescription('');
    setFormDiagnosis('');
    setFormSolution('');
    setFormTechnicalReport('');
    setFormServices([]);
    setFormProducts([]);
    
    let techId = '';
    if (userRole === UserRole.TECHNICIAN) {
      const matchTech = technicians.find(t => (t.name || '').trim().toLowerCase() === activeTechName.trim().toLowerCase());
      if (matchTech) {
        techId = matchTech.id;
      }
      setTechSelectionMode('roteiro');
    }
    setFormTechnicianId(techId);
    setFormTechnician2Id('');
    setFormRepresentative('');
    setFormRepresentativeMatricula('');
    setFormRepresentativeRole('');
    setFormRepresentativeContact('');
    setFormServiceCompany('lefrio');
    setFormPhotos([]);
    setFormTechSignature('');
    setFormClientSignature('');
    setFormClientSignatureDate('');
    setSelectedServiceCategoryFilter('ALL');
    setSelectedProductCategoryFilter('ALL');
    
    setSelectedOrder(null);
    if (userRole === UserRole.TECHNICIAN) {
      const draftId = 'draft_' + Date.now();
      setFormId(draftId);
      setCurrentDraftId(draftId);
      setTechActiveTab('form');
    } else {
      setFormId('');
      setCurrentDraftId(null);
      setIsFormOpen(true);
    }
  };

  const handleGenerateJettingOS = (item: JettingControl, machines: string[]) => {
    setBatchQueue([]);
    setBatchIndex(-1);
    handleCreateNew();
    
    // Fill specific jetting fields
    setFormType('JATEAMENTO');
    
    // Attempt to find client by addressId (since item has addressId)
    const matchingAddress = addresses.find(a => a.id === item.addressId);
    if (matchingAddress) {
      setFormClientId(matchingAddress.clientId);
      setFormAddressId(matchingAddress.id);
      setAddressSearchTerm(`${matchingAddress.street}, ${matchingAddress.number || 'S/N'}`);
    }

    // Atribuir técnico responsável pelo jateamento se existir
    if (item.technicianName) {
      const matchTech = technicians.find(t => (t.name || '').trim().toLowerCase() === item.technicianName.trim().toLowerCase());
      if (matchTech) {
        setFormTechnicianId(matchTech.id);
      }
    }

    // Prepare description
    if (machines && machines.length > 0) {
      const machinesList = machines.map(m => `- ${m.trim()}`).join('\n');
      setFormDescription(`SERVIÇO DE JATEAMENTO / MANUTENÇÃO PREVENTIVA NAS SEGUINTES MÁQUINAS:\n\n${machinesList}\n\n`);
    } else {
      setFormDescription(`SERVIÇO DE JATEAMENTO / MANUTENÇÃO PREVENTIVA`);
    }
  };

  const handleGenerateJettingOSBatch = (item: JettingControl, machines: {name: string, index: number, eqKey: string, equipmentId?: string}[]) => {
    if (machines.length === 0) return;
    const queue = machines.map(m => ({
      jettingControl: item,
      machineName: m.name,
      originalIndex: m.index,
      eqKey: m.eqKey,
      equipmentId: m.equipmentId
    }));
    setBatchQueue(queue);
    setBatchIndex(0);
    loadBatchItemIntoForm(queue[0]);
  };

  const loadBatchItemIntoForm = (
    batchItem: {jettingControl: JettingControl, machineName: string, originalIndex: number, eqKey: string, equipmentId?: string},
    preservedPlannedDate?: string
  ) => {
    handleCreateNew();
    setFormType('JATEAMENTO');
    
    // Preservar Data Agendada se informada na O.S. anterior do lote
    if (preservedPlannedDate) {
      setFormPlannedDate(preservedPlannedDate);
    }
    
    const item = batchItem.jettingControl;
    const matchingAddress = addresses.find(a => a.id === item.addressId);
    if (matchingAddress) {
      setFormClientId(matchingAddress.clientId);
      setFormAddressId(matchingAddress.id);
      setAddressSearchTerm(`${matchingAddress.street}, ${matchingAddress.number || 'S/N'}`);
    }

    // Atribuir técnico responsável pelo jateamento se existir
    if (item.technicianName) {
      const matchTech = technicians.find(t => (t.name || '').trim().toLowerCase() === item.technicianName.trim().toLowerCase());
      if (matchTech) {
        setFormTechnicianId(matchTech.id);
      }
    }
    
    // Attempt to extract equipment if it is exact match
    // E.g. "SPLIT (SALA DE AULA) - Obs:"
    let pureMachineName = batchItem.machineName;
    if (pureMachineName.includes('- Obs:')) {
      pureMachineName = pureMachineName.split('- Obs:')[0].trim();
    }
    // Try to auto select equipment
    if (batchItem.equipmentId) {
      setFormEquipmentId(batchItem.equipmentId);
    } else if (matchingAddress) {
      const addressEquips = equipments.filter(e => e.addressId === matchingAddress.id);
      const sectorMatch = pureMachineName.match(/\(([^)]+)\)/);
      const targetSector = sectorMatch ? sectorMatch[1].trim().toUpperCase() : '';

      const matched = addressEquips.find(e => {
         if (targetSector && (e.sector || '').trim().toUpperCase() === targetSector) {
           return true;
         }
         const eName = `${e.name || ''} ${e.brand || ''} ${e.btus || ''} (${e.sector || ''})`.toUpperCase().trim().replace(/\s+/g, ' ');
         return eName.includes(pureMachineName.toUpperCase()) || pureMachineName.toUpperCase().includes(eName);
      });
      if (matched) {
        setFormEquipmentId(matched.id);
      }
    }

    // Description is the full text
    setFormDescription(batchItem.machineName);
    
    if (userRole === UserRole.TECHNICIAN) {
      setTechActiveTab('form');
    } else {
      setIsFormOpen(true);
    }
  };

  // Função de busca rápida de chamados em aberto para um endereço (ignorando o chamado de oficina da própria O.S., se informado)
  const getOpenCallsForAddress = (addressId?: string, clientId?: string, excludeOrder?: ServiceOrder | null): ServiceCall[] => {
    if (!addressId && !clientId) return [];
    if (!Array.isArray(serviceCalls)) return [];

    const normAddrId = addressId ? String(addressId).trim() : '';
    const normClientId = clientId ? String(clientId).trim() : '';

    return serviceCalls.filter(call => {
      if (!call) return false;
      if (excludeOrder && (call.id === excludeOrder.linkedWorkshopCallId || call.linkedServiceOrderId === excludeOrder.id)) {
        return false;
      }
      const statusStr = String(call.status || '').toLowerCase();
      const isResolved = statusStr === 'resolved' || statusStr === 'cancelled' || statusStr === 'resolvido' || statusStr === 'cancelado' || statusStr === ServiceCallStatus.RESOLVED || statusStr === ServiceCallStatus.CANCELLED;
      if (isResolved) return false;

      // Se o ID do endereço foi informado, filtra ESTRITAMENTE pelo ID do endereço
      if (normAddrId) {
        return Boolean(call.addressId && String(call.addressId).trim() === normAddrId);
      }

      // Fallback para quando apenas o ID do cliente foi informado
      if (normClientId) {
        return Boolean(call.clientId && String(call.clientId).trim() === normClientId);
      }

      return false;
    });
  };

  // Função de Pré-Carregamento / Verificação de Chamados antes de abrir a tela de edição (carregamento sob demanda com cache)
  const handleEditPreCheck = async (order: ServiceOrder) => {
    if (!order) return;
    try {
      let currentCalls = serviceCalls;
      if (!serviceCallsLoadedRef.current) {
        try {
          currentCalls = await dataService.getServiceCalls(managerClientId);
          serviceCallsLoadedRef.current = true;
          setServiceCalls(currentCalls);
        } catch (fetchErr) {
          console.warn('Falha ao buscar chamados sob demanda:', fetchErr);
        }
      }

      const normAddrId = order.addressId ? String(order.addressId).trim() : '';
      const normClientId = order.clientId ? String(order.clientId).trim() : '';
      const openCalls = Array.isArray(currentCalls)
        ? currentCalls.filter(call => {
            if (!call) return false;
            // Não dispara alerta de chamado aberto para o próprio chamado de oficina vinculado a esta O.S.
            if (call.id === order.linkedWorkshopCallId || call.linkedServiceOrderId === order.id) {
              return false;
            }
            const statusStr = String(call.status || '').toLowerCase();
            const isResolved = statusStr === 'resolved' || statusStr === 'cancelled' || statusStr === 'resolvido' || statusStr === 'cancelado' || statusStr === ServiceCallStatus.RESOLVED || statusStr === ServiceCallStatus.CANCELLED;
            if (isResolved) return false;
            if (normAddrId) return Boolean(call.addressId && String(call.addressId).trim() === normAddrId);
            if (normClientId) return Boolean(call.clientId && String(call.clientId).trim() === normClientId);
            return false;
          })
        : [];

      if (openCalls && openCalls.length > 0) {
        setPendingOpenCallsData({ order, openCalls });
        setIsOpenCallsWarningModalOpen(true);
      } else {
        handleEdit(order);
      }
    } catch (err) {
      console.error('Erro no pré-carregamento de chamados:', err);
      handleEdit(order);
    }
  };

  // Ação ao confirmar no modal de aviso do chamado em aberto
  const handleProceedToEditWithWarning = () => {
    if (pendingOpenCallsData?.order) {
      const orderToEdit = pendingOpenCallsData.order;
      setIsOpenCallsWarningModalOpen(false);
      setPendingOpenCallsData(null);
      setIsCallDetailsExpandedInForm(false);
      handleEdit(orderToEdit);
    } else {
      setIsOpenCallsWarningModalOpen(false);
      setPendingOpenCallsData(null);
    }
  };

  // Abrir formulário para edição
  const handleEdit = (order: ServiceOrder) => {
    setSelectedOrder(order);
    setFormId(order.id);
    const existingOsNumber = order.osNumber || (order.id && !order.id.startsWith('OS_') ? order.id : '00000');
    setFormOsNumber(existingOsNumber);
    setOriginalFormOsNumber(existingOsNumber);
    // If it was explicitly saved as changed, trust it.
    // If it's old data (undefined) and is not 00000 AND not the new AB123 format, assume it was changed.
    const isNewFormat = /^[A-Z]{2}\d{3}$/.test(existingOsNumber);
    const hasChanged = order.osNumberChanged === true || 
                       (order.osNumberChanged === undefined && existingOsNumber !== '00000' && !isNewFormat);
    setFormOsNumberChanged(hasChanged);
    const initialNum = order.initialOsNumber || (isNewFormat ? existingOsNumber : (order.id && !order.id.startsWith('OS_') ? order.id : ''));
    setFormInitialOsNumber(initialNum);
    setFormOsNumberChangedAt(order.osNumberChangedAt || null);
    setFormOsNumberResetUsed(Boolean(order.osNumberResetUsed));
    setFormClientId(order.clientId);
    setFormAddressId(order.addressId);
    const existingAddrObj = addresses.find(a => a.id === order.addressId);
    if (existingAddrObj) {
      setAddressSearchTerm(`${existingAddrObj.street}, ${existingAddrObj.number || 'S/N'}`);
    } else {
      setAddressSearchTerm(order.addressStreet || '');
    }
    setIsAddressDropdownOpen(false);
    const initialEqId = (order.equipmentId === 'OUTRO EQUIPAMENTO' || order.equipmentName === 'OUTRO EQUIPAMENTO')
      ? 'OUTRO EQUIPAMENTO'
      : (order.equipmentId || '');
    setFormEquipmentId(initialEqId);
    setFormStatus(order.status);
    setFormType(order.type);
    setFormIsWorkshop(Boolean(order.isWorkshop));
    
    // Converte datas para input datetime-local
    const formatForInput = (d: any) => {
      if (!d) return '';
      try {
        const dateObj = typeof d === 'string' ? new Date(d) : new Date(d.seconds * 1000);
        return dateObj.toISOString().substring(0, 16);
      } catch {
        return '';
      }
    };

    setFormOpenedAt(formatForInput(order.openedAt));
    setFormOpenedBy(order.openedBy || 'ADMIN');
    setFormFinishedAt(formatForInput(order.finishedAt));
    setFormExternalOs(order.externalOs || '');
    setFormPlannedDate(order.plannedDate || '');
    setFormDescription(order.description || '');
    setFormDiagnosis(order.diagnosis || '');
    setFormSolution(order.solution || '');
    setFormServices(order.services || []);
    const sanitizedProducts = (order.products || []).map(p => {
      if (p.code === '336' || p.discountPercent === 74.61) {
        const qty = typeof p.quantity === 'number' ? p.quantity : (parseFloat(String(p.quantity).replace(',', '.')) || 0);
        const price = typeof p.unitValue === 'number' ? p.unitValue : (parseFloat(String(p.unitValue).replace(',', '.')) || 42.65);
        return {
          ...p,
          discountPercent: 0,
          totalValue: Number((qty * price).toFixed(2))
        };
      }
      return p;
    });
    setFormProducts(sanitizedProducts);
    
    // Encontra o técnico correspondente (por ID, Nome, Resp. Abertura ou Equipe Autenticada)
    let resolvedTech1Id = '';
    if (order.technicianId && !isStaffName(order.technicianId)) {
      const matchTech = technicians.find(t => 
        t.id === order.technicianId || 
        t.name.trim().toLowerCase() === order.technicianId.trim().toLowerCase()
      );
      resolvedTech1Id = matchTech ? matchTech.id : order.technicianId;
    }

    if (!resolvedTech1Id && order.openedBy && !isStaffName(order.openedBy)) {
      const matchOpener = technicians.find(t => 
        t.id === order.openedBy || 
        t.name.trim().toLowerCase() === order.openedBy.trim().toLowerCase()
      );
      if (matchOpener) {
        resolvedTech1Id = matchOpener.id;
      }
    }

    if (!resolvedTech1Id && order.authenticatedTeam) {
      const teamLower = order.authenticatedTeam.toLowerCase();
      const matchTeamTech = technicians.find(t => t.name && teamLower.includes(t.name.trim().toLowerCase()));
      if (matchTeamTech) {
        resolvedTech1Id = matchTeamTech.id;
      }
    }

    setFormTechnicianId(resolvedTech1Id);

    // Resolve o técnico 2 (auxiliar)
    let resolvedTech2Id = order.technician2Id || '';
    if (resolvedTech2Id) {
      const matchTech2 = technicians.find(t => 
        t.id === resolvedTech2Id || 
        t.name.trim().toLowerCase() === resolvedTech2Id.trim().toLowerCase()
      );
      if (matchTech2) resolvedTech2Id = matchTech2.id;
    }
    setFormTechnician2Id(resolvedTech2Id);
    
    setFormRepresentative(order.clientRepresentative || order.clientSigneeName || '');
    setFormRepresentativeMatricula(order.clientRepresentativeMatricula || order.clientSigneeRegistration || '');
    setFormRepresentativeRole(order.clientRepresentativeRole || order.clientSigneeRole || '');
    setFormRepresentativeContact(order.clientRepresentativeContact || order.clientSigneeContact || '');
    setFormTechnicalReport(order.internalNotes || order.technicalReport || order.routeNotes || '');
    setFormServiceCompany(order.serviceCompany || 'lefrio');
    setFormPhotos(order.photos || []);
    setFormTechSignature(order.techSignature || '');
    setFormClientSignature(order.clientSignature || '');
    setFormClientSignatureDate(order.clientSignatureDate || (order.clientSignature ? (order.finishedAt || order.updatedAt || '') : ''));
    setSelectedServiceCategoryFilter('ALL');
    setSelectedProductCategoryFilter('ALL');

    if (userRole === UserRole.TECHNICIAN) {
      setTechActiveTab('form');
    } else {
      setIsFormOpen(true);
    }

    // Hidratação sob demanda: busca fotos e assinaturas da subcoleção /media/attachments sem travar a abertura do modal
    const requestKey = `edit_${order.id}_${Date.now()}`;
    activeOrderRequestRef.current = requestKey;
    const needsMediaHydration = Boolean(
      order.id &&
      (order.mediaExternalized ||
        (order.hasClientSignature && !order.clientSignature) ||
        (order.hasTechSignature && !order.techSignature) ||
        ((order.photoCount || 0) > 0 && (!order.photos || order.photos.length === 0)))
    );

    if (needsMediaHydration) {
      setIsHydratingMedia(true);
      dataService
        .hydrateServiceOrderMedia(order)
        .then((hydrated) => {
          if (activeOrderRequestRef.current !== requestKey) return;
          setSelectedOrder((prev) => (prev && prev.id === hydrated.id ? { ...prev, ...hydrated } : prev));
          setFormPhotos(hydrated.photos || []);
          setFormTechSignature(hydrated.techSignature || '');
          setFormClientSignature(hydrated.clientSignature || '');
          setFormClientSignatureDate(
            hydrated.clientSignatureDate ||
              (hydrated.clientSignature ? (hydrated.finishedAt || hydrated.updatedAt || '') : '')
          );
        })
        .catch((err) => {
          console.warn('Aviso ao hidratar mídias da O.S. para edição:', err);
        })
        .finally(() => {
          if (activeOrderRequestRef.current === requestKey) {
            setIsHydratingMedia(false);
          }
        });
    } else {
      setIsHydratingMedia(false);
    }
  };

  // Cancelar OS (no lugar de excluir da base de dados, para segurança e auditoria)
  const handleCancel = async (id: string) => {
    if (!window.confirm('Tem certeza de que deseja cancelar esta Ordem de Serviço? A O.S. permanecerá segura no sistema para consultas e histórico com status "Cancelada", e só poderá ser reaberta por um Administrador.')) return;
    try {
      await dataService.cancelServiceOrder(id);
      patchOrderInLocalState(id, { status: 'cancelada' });
    } catch (err) {
      console.error(err);
      alert('Erro ao cancelar O.S.');
    }
  };

  // Reabrir OS (Permitido exclusivamente para Administradores)
  const handleReopen = async (id: string) => {
    if (userRole !== UserRole.ADMIN) {
      alert('Apenas Administradores do sistema têm permissão para reabrir uma Ordem de Serviço cancelada.');
      return;
    }
    if (!window.confirm('Deseja reabrir esta Ordem de Serviço? A situação dela voltará para "Em Aberto".')) return;
    try {
      await dataService.reopenServiceOrder(id);
      patchOrderInLocalState(id, { status: 'aberta', adminFinalized: false });
    } catch (err) {
      console.error(err);
      alert('Erro ao reabrir O.S.');
    }
  };

  // Salvar OS
  const handleSave = async (
    e?: React.FormEvent,
    statusOverride?: ServiceOrder['status'],
    finishedAtOverride?: string,
    moveNextBatch: boolean = false,
    isTechFinalize: boolean = false,
    customOsNumber?: string,
    continueSameAddress: boolean = false
  ) => {
    if (e) e.preventDefault();

    if (isSaving) return;
    if (isHydratingMedia) {
      alert('Aguarde um instante: estamos carregando as fotos e assinaturas desta O.S. antes de salvar.');
      return;
    }

    // Preservar valor da Data Agendada para repassar à próxima O.S. no lote
    const currentPlannedDateToPreserve = formPlannedDate;

    // Verificação de bloqueio para técnicos: se a OS já estiver finalizada ou cancelada, não permite salvar/alterar
    if (userRole === UserRole.TECHNICIAN && selectedOrder) {
      if (selectedOrder.techFinalized || selectedOrder.status === 'finalizada' || selectedOrder.status === 'cancelada') {
        alert('Esta Ordem de Serviço já foi finalizada pelo técnico e não pode mais ser alterada pelo aplicativo.');
        return;
      }
    }

    // Regra de segurança: em O.S. já finalizada (Finalizada ou Pré-Finalizada), somente Administradores podem editar/adicionar itens e salvar
    const isSelectedAlreadyFinalized = Boolean(
      selectedOrder &&
      (selectedOrder.status === 'finalizada' ||
        selectedOrder.status === 'pre_finalizada' ||
        selectedOrder.adminFinalized)
    );
    if (isSelectedAlreadyFinalized && userRole !== UserRole.ADMIN) {
      alert('Esta Ordem de Serviço já está finalizada. Somente usuários Administradores podem adicionar/alterar produtos ou serviços e salvar alterações.');
      return;
    }

    if (!formClientId || !formAddressId) {
      alert('Selecione o cliente e o endereço!');
      return;
    }

    if (userRole === UserRole.TECHNICIAN && allowedAddressIdsForTech && allowedAddressIdsForTech.size > 0) {
      if (!allowedAddressIdsForTech.has(formAddressId)) {
        alert('Endereço não permitido: O endereço selecionado não consta no seu roteiro programado nem possui ordem atribuída para sua equipe. Selecione apenas endereços da sua programação diária ou do último roteiro.');
        return;
      }
    }

    const isOtherEquipment = formEquipmentId === 'OUTRO EQUIPAMENTO' || formEquipmentId === 'OUTRO_EQUIPAMENTO';

    if (userRole === UserRole.TECHNICIAN && !formEquipmentId) {
      alert('Por favor, selecione ou informe o equipamento atendido!');
      return;
    }

    if (userRole === UserRole.TECHNICIAN && isOtherEquipment && !formDescription.trim()) {
      alert('Atenção: Como você selecionou a opção "OUTRO EQUIPAMENTO", é obrigatório descrever no campo "Descrição do Problema" os detalhes da máquina encontrada em campo (marca, modelo aproximado, capacidade/BTUs e local/ambiente onde está instalada) para que o Administrativo possa identificar e vincular a máquina correta.');
      return;
    }

    if (formProducts.length > 0 && formServices.length === 0 && userRole !== UserRole.TECHNICIAN) {
      alert('Para adicionar ou manter produtos/peças na Ordem de Serviço, é obrigatório ter pelo menos um serviço adicionado.');
      return;
    }

    const selectedClient = clients.find(c => c.id === formClientId);
    const selectedAddr = addresses.find(a => a.id === formAddressId);
    const selectedEq = isOtherEquipment ? null : equipments.find(eq => eq.id === formEquipmentId);
    const selectedTech = technicians.find(t => t.id === formTechnicianId);
    const selectedTech2 = technicians.find(t => t.id === formTechnician2Id);

    let finalStatus = statusOverride || formStatus;
    let finalFinishedAt = finishedAtOverride !== undefined ? finishedAtOverride : formFinishedAt;

    // REGRA MANDATÓRIA DO ADMINISTRATIVO:
    // Uma O.S. NÃO pode ser finalizada pelo administrativo se estiver com a opção "OUTRO EQUIPAMENTO"
    if (userRole !== UserRole.TECHNICIAN && (finalStatus === 'finalizada' || finalStatus === 'pre_finalizada')) {
      const isOther = isOtherEquipment || (!formEquipmentId && (selectedOrder?.equipmentId === 'OUTRO EQUIPAMENTO' || selectedOrder?.equipmentName === 'OUTRO EQUIPAMENTO'));
      if (isOther) {
        alert('BLOQUEIO DE FINALIZAÇÃO:\n\nEsta Ordem de Serviço está com a opção "OUTRO EQUIPAMENTO".\n\nConforme a regra do sistema administrativo, é obrigatório alterar essa opção e selecionar a máquina correta cadastrada no endereço (com base na descrição informada pelo técnico) antes de finalizar a O.S.');
        return;
      }
    }

    // Regra para técnicos:
    // Quando o técnico atende e aperta em finalizar no aplicativo, ela DEVE aparecer para o sistema
    // administrativo com o status "Em aberto" (aberta). Somente o Administrativo tem autonomia para finalizar.
    if (userRole === UserRole.TECHNICIAN) {
      if (isTechFinalize) {
        finalStatus = 'aberta';
        if (!finalFinishedAt) {
          finalFinishedAt = new Date().toISOString();
        }
      } else if (statusOverride) {
        finalStatus = statusOverride === 'finalizada' ? 'aberta' : statusOverride;
      } else {
        finalStatus = 'aberta';
      }
    }

    // Calcular o total geral
    const servicesTotal = formServices.reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0);
    const productsTotal = formProducts.reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0);
    const totalValue = Number((servicesTotal + productsTotal).toFixed(2));

    // Formatar texto de autenticação
    const formatAuthDate = finalFinishedAt ? new Date(finalFinishedAt) : new Date();
    const formattedDate = formatAuthDate.toLocaleDateString('pt-BR') + ' ' + formatAuthDate.toLocaleTimeString('pt-BR');
    
    let authenticatedTeam = '';
    if (userRole === UserRole.TECHNICIAN) {
      const activeTechName = userProfile?.name || selectedTech?.name || 'Técnico Responsável';
      authenticatedTeam = `Equipe autenticada no aplicativo JDSmartOS (APP: ${formattedDate} ${activeTechName.toUpperCase()})`;
    } else if (selectedTech && selectedTech2) {
      authenticatedTeam = `Equipe autenticada no aplicativo JDSmartOS (APP: ${formattedDate} ${selectedTech.name.toUpperCase()} / ${selectedTech2.name.toUpperCase()})`;
    } else if (selectedTech) {
      authenticatedTeam = `Equipe autenticada no aplicativo JDSmartOS (APP: ${formattedDate} ${selectedTech.name.toUpperCase()})`;
    } else if (selectedTech2) {
      authenticatedTeam = `Equipe autenticada no aplicativo JDSmartOS (APP: ${formattedDate} ${selectedTech2.name.toUpperCase()})`;
    }

    let finalFormId = formId;
    if (!finalFormId || finalFormId.startsWith('draft_')) {
      finalFormId = 'OS_' + Date.now() + '_' + Math.floor(1000 + Math.random() * 9000);
    }
    const trimmedCustomInput = (customOsNumber || formOsNumber).trim();
    const isAdminCreatingWithCustomNumber =
      selectedOrder === null &&
      userRole !== UserRole.TECHNICIAN &&
      Boolean(trimmedCustomInput);
    const generatedOriginNumber = generateInitialOsNumber();
    const finalOsNumber = trimmedCustomInput || generatedOriginNumber;
    const isNewlyGenerated = !trimmedCustomInput || !originalFormOsNumber;
    const isNumberBeingChangedNow =
      isAdminCreatingWithCustomNumber ||
      (!isNewlyGenerated && finalOsNumber !== originalFormOsNumber);
    const finalOsNumberChanged = formOsNumberChanged || isNumberBeingChangedNow;
    const resolvedInitialNumber =
      selectedOrder?.initialOsNumber ||
      formInitialOsNumber ||
      (isAdminCreatingWithCustomNumber
        ? generatedOriginNumber
        : isNumberBeingChangedNow
          ? originalFormOsNumber
          : finalOsNumber) ||
      generatedOriginNumber;
    const resolvedChangedAt = finalOsNumberChanged
      ? (selectedOrder?.osNumberChangedAt && selectedOrder.osNumber === finalOsNumber ? selectedOrder.osNumberChangedAt : (selectedOrder?.osNumberChangedAt || new Date().toISOString()))
      : selectedOrder?.osNumberChangedAt;
    const resolvedResetUsed = Boolean(selectedOrder?.osNumberResetUsed || formOsNumberResetUsed);

    const newOrder: ServiceOrder = {
      id: finalFormId,
      osNumber: finalOsNumber,
      osNumberChanged: finalOsNumberChanged,
      initialOsNumber: resolvedInitialNumber,
      osNumberChangedAt: resolvedChangedAt,
      osNumberResetUsed: resolvedResetUsed,
      osNumberResetAt: selectedOrder?.osNumberResetAt,
      clientId: formClientId,
      clientName: selectedClient?.fullName || selectedClient?.name || '',
      clientCnpj: selectedClient?.cnpj || '',
      clientEmail: selectedClient?.email || '',
      clientPhone: selectedClient?.phone || '',
      clientAddress: selectedAddr 
        ? [
            selectedAddr.street,
            selectedAddr.number ? `Nº ${selectedAddr.number}` : '',
            selectedAddr.complement || '',
            selectedAddr.neighborhood || '',
            selectedAddr.city || '',
            selectedAddr.state || '',
            selectedAddr.cep ? `CEP: ${selectedAddr.cep}` : ''
          ].filter(Boolean).join(' - ')
        : (selectedClient?.fullAddress || ''),
      addressId: formAddressId,
      addressStreet: selectedAddr?.street || '',
      
      equipmentId: formEquipmentId || undefined,
      equipmentName: isOtherEquipment ? 'OUTRO EQUIPAMENTO' : (selectedEq?.name || undefined),
      equipmentBrand: isOtherEquipment ? undefined : (selectedEq?.brand || undefined),
      equipmentSector: isOtherEquipment ? undefined : (selectedEq?.sector || undefined),
      equipmentBtus: isOtherEquipment ? undefined : (selectedEq?.btus ? selectedEq.btus.toUpperCase() : undefined),
      equipmentPatrimony: isOtherEquipment ? undefined : (selectedEq?.patrimony ? selectedEq.patrimony.toUpperCase() : undefined),
      
      status: finalStatus,
      techFinalized: isTechFinalize ? true : (selectedOrder?.techFinalized || false),
      techFinalizedAt: isTechFinalize ? (finalFinishedAt || new Date().toISOString()) : (selectedOrder?.techFinalizedAt || undefined),
      adminFinalized: Boolean(
        selectedOrder?.adminFinalized ||
        (userRole !== UserRole.TECHNICIAN && !isTechFinalize && (finalStatus === 'finalizada' || finalStatus === 'pre_finalizada'))
      ),
      adminFinalizedAt: (selectedOrder?.adminFinalized || (userRole !== UserRole.TECHNICIAN && !isTechFinalize && (finalStatus === 'finalizada' || finalStatus === 'pre_finalizada')))
        ? (selectedOrder?.adminFinalizedAt || finalFinishedAt || new Date().toISOString())
        : undefined,
      type: formType ? formType.toUpperCase() : '',
      isWorkshop: formIsWorkshop,
      openedAt: formOpenedAt ? new Date(formOpenedAt).toISOString() : new Date().toISOString(),
      openedBy: formOpenedBy ? formOpenedBy.toUpperCase() : '',
      finishedAt: finalFinishedAt ? new Date(finalFinishedAt).toISOString() : undefined,
      externalOs: formExternalOs ? formExternalOs.trim().toUpperCase() : undefined,
      plannedDate: formPlannedDate || undefined,
      
      description: formDescription ? formDescription.trim().toUpperCase() : '',
      diagnosis: userRole !== UserRole.TECHNICIAN
        ? (selectedOrder?.diagnosis || (formDiagnosis ? formDiagnosis.trim().toUpperCase() : undefined))
        : (formDiagnosis ? formDiagnosis.trim().toUpperCase() : undefined),
      solution: formSolution ? formSolution.trim().toUpperCase() : undefined,
      internalNotes: formTechnicalReport ? formTechnicalReport.trim().toUpperCase() : undefined,
      technicalReport: formTechnicalReport ? formTechnicalReport.trim().toUpperCase() : undefined,
      routeNotes: formTechnicalReport ? formTechnicalReport.trim().toUpperCase() : undefined,
      
      services: formServices.map(s => ({
        ...s,
        code: (s.code || '').toUpperCase(),
        description: (s.description || '').toUpperCase(),
        unit: (s.unit || '').toUpperCase()
      })),
      products: formProducts.map(p => ({
        ...p,
        code: (p.code || '').toUpperCase(),
        description: (p.description || '').toUpperCase(),
        unit: (p.unit || '').toUpperCase()
      })),
      totalValue,
      
      ...(() => {
        let resolvedTechId: string | undefined;
        if (formTechnicianId) {
          resolvedTechId = formTechnicianId;
        } else if (formOpenedBy && formOpenedBy !== 'ADMIN' && formOpenedBy !== 'Administrativo') {
          const matchOpener = technicians.find(t =>
            t.id === formOpenedBy ||
            t.name.trim().toLowerCase() === formOpenedBy.trim().toLowerCase()
          );
          resolvedTechId = matchOpener ? matchOpener.id : formOpenedBy;
        } else if (userRole === UserRole.TECHNICIAN && userProfile?.name) {
          const matchProfile = technicians.find(t =>
            t.id === userProfile.uid ||
            t.name.trim().toLowerCase() === userProfile.name.trim().toLowerCase()
          );
          if (matchProfile) resolvedTechId = matchProfile.id;
        }

        const resolvedTechObj = resolvedTechId
          ? technicians.find(t => t.id === resolvedTechId || t.name.trim().toLowerCase() === resolvedTechId!.trim().toLowerCase())
          : selectedTech;
        const resolvedTechName = resolvedTechObj?.name?.trim().toUpperCase() || undefined;
        const resolvedTech2Name = selectedTech2?.name?.trim().toUpperCase() || undefined;

        return {
          technicianId: resolvedTechId,
          technician1: resolvedTechName,
          technicianName: resolvedTechName,
          technician2Id: formTechnician2Id || undefined,
          technician2: resolvedTech2Name,
        };
      })(),
      authenticatedTeam,
      clientRepresentative: formRepresentative ? formRepresentative.trim().toUpperCase() : undefined,
      clientRepresentativeMatricula: formRepresentativeMatricula ? formRepresentativeMatricula.trim().toUpperCase() : undefined,
      clientRepresentativeRole: formRepresentativeRole ? formRepresentativeRole.trim().toUpperCase() : undefined,
      clientRepresentativeContact: formRepresentativeContact ? formRepresentativeContact.trim().toUpperCase() : undefined,
      clientSigneeRole: formRepresentativeRole ? formRepresentativeRole.trim().toUpperCase() : undefined,
      clientSigneeContact: formRepresentativeContact ? formRepresentativeContact.trim().toUpperCase() : undefined,
      serviceCompany: selectedClient?.serviceCompany || formServiceCompany || 'lefrio',
      photos: formPhotos,
      techSignature: formTechSignature || undefined,
      clientSignature: formClientSignature || undefined,
      clientSignatureDate: formClientSignature ? (formClientSignatureDate || selectedOrder?.clientSignatureDate || new Date().toISOString()) : undefined,
      createdAt: selectedOrder?.createdAt || selectedOrder?.openedAt || (formOpenedAt ? new Date(formOpenedAt).toISOString() : new Date().toISOString()),
      updatedAt: new Date().toISOString()
    };

    setIsSaving(true);
    if (moveNextBatch || continueSameAddress) {
      setIsSavingNext(true);
    }

    try {
      const saveResult = await dataService.addServiceOrder(newOrder);

      // Sincroniza imediatamente em memória (Relatório Avançado, Lista Principal e Cache de Páginas) com 0 leituras extras
      const orderForLocalSync: ServiceOrder = {
        ...(selectedOrder || {}),
        ...newOrder,
        linkedWorkshopCallId: saveResult?.linkedWorkshopCallId ?? selectedOrder?.linkedWorkshopCallId,
        hasTechSignature: Boolean(formTechSignature),
        hasClientSignature: Boolean(formClientSignature),
        photoCount: Array.isArray(formPhotos) ? formPhotos.length : 0
      };
      syncOrderInLocalState(orderForLocalSync, { isNew: !selectedOrder });

      const workshopChanged = selectedOrder
        ? Boolean(selectedOrder.isWorkshop) !== Boolean(newOrder.isWorkshop)
        : Boolean(newOrder.isWorkshop);

      if (workshopChanged) {
        setServerWorkshopOrders(prev =>
          prev === null ? null : Math.max(0, prev + (newOrder.isWorkshop ? 1 : -1))
        );
        // Invalida o cache local de chamados para refletir o chamado de oficina criado/concluído
        serviceCallsLoadedRef.current = false;
      }

      // Se a ordem foi finalizada pelo técnico ou pelo administrativo, sincronizar checklist na central de jateamento
      if (isTechFinalize || newOrder.techFinalized || finalStatus === 'finalizada' || finalStatus === 'pre_finalizada') {
        dataService.syncJettingControlForFinishedOs(
          formAddressId,
          finalOsNumber,
          formEquipmentId,
          formDescription
        ).catch(err => console.warn('Erro ao sincronizar jateamento na finalização da O.S.:', err));
      }

      // ---------------------------------
      // BATCH JETTING PROCESS (ABERTURA DE O.S. EM LOTE)
      // ---------------------------------
      if (batchIndex >= 0 && batchQueue.length > 0 && batchIndex < batchQueue.length) {
        const currentBatch = batchQueue[batchIndex];
        const jetControl = currentBatch.jettingControl;
        
        const currentChecked = jetControl.checkedEquipments || {};
        // REGRA: Na abertura da O.S. em lote, a máquina recebe o número da O.S. gerada,
        // mas o checklist permanece NÃO marcado (checked: false), pois a máquina ainda não foi atendida/finalizada pelo técnico!
        currentChecked[currentBatch.eqKey] = { checked: false, os: finalOsNumber };
        
        // Add OS to the serviceOrders string of JettingControl if it's not there
        const existingOs = jetControl.serviceOrders ? jetControl.serviceOrders.split(',').map(s=>s.trim()).filter(Boolean) : [];
        if (!existingOs.includes(finalOsNumber)) {
           existingOs.push(finalOsNumber);
        }
        jetControl.serviceOrders = existingOs.join(', ');
        jetControl.checkedEquipments = currentChecked;
        
        // Check if all machines are checked to update status
        const allMachines = jetControl.equipmentsText ? jetControl.equipmentsText.split(';').map(m=>m.trim()).filter(Boolean) : [];
        const allChecked = allMachines.length > 0 && allMachines.every((m, idx) => {
           const mKey = `${idx}_${m.trim()}`;
           return currentChecked[mKey]?.checked || currentChecked[m.trim()]?.checked;
        });
        
        if (allChecked) {
            jetControl.status = 'Concluído';
        } else if (existingOs.length > 0) {
            jetControl.status = 'Em Andamento';
        } else {
            jetControl.status = 'Pendente';
        }
        
        if (jetControl.id) {
            const { id: _, ...jetControlData } = jetControl;
            await dataService.updateJettingControl(jetControl.id, jetControlData);
        }
        
        if (moveNextBatch) {
           const nextIndex = batchIndex + 1;
           if (nextIndex < batchQueue.length) {
              setBatchIndex(nextIndex);
              loadBatchItemIntoForm(batchQueue[nextIndex], currentPlannedDateToPreserve);
              return; // Do NOT close form
           } else {
              setBatchQueue([]);
              setBatchIndex(-1);
              alert('Lote de Ordens de Serviço finalizado!');
           }
        }
      }
      // ---------------------------------
      // PRÓXIMA O.S. NO MESMO CLIENTE E ENDEREÇO
      // Salva a O.S. atual e mantém o modal aberto preservando cliente, endereço e demais cabeçalhos,
      // limpando Equipamento, Descrição, Diagnóstico, Solução, Serviços, Produtos e Imagens (+ ID/Nº para gerar nova O.S.)
      // ---------------------------------
      if (continueSameAddress) {
        setSelectedOrder(null);
        setCurrentDraftId(null);
        setFormId('');
        setFormOsNumber('');
        setOriginalFormOsNumber('');
        setFormOsNumberChanged(false);
        setFormInitialOsNumber('');
        setFormOsNumberChangedAt(null);
        setFormOsNumberResetUsed(false);
        setFormStatus('aberta');

        // Limpa equipamento escolhido, descrição, diagnóstico, solução, serviços, produtos e imagens
        setFormEquipmentId('');
        setMachineIdSearchInput('');
        setMachineSearchFeedback(null);
        setFormDescription('');
        setFormDiagnosis('');
        setFormSolution('');
        setFormServices([]);
        setFormProducts([]);
        setFormPhotos([]);

        setNextOsFeedback(prev => ({
          osNumber: finalOsNumber,
          count: (prev?.count || 0) + 1
        }));
        if (formScrollContainerRef.current) {
          formScrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }

      setNextOsFeedback(null);
      setIsFormOpen(false);
      if (userRole === UserRole.TECHNICIAN) {
        setTechActiveTab('my_orders');
        setTechSelectedAddressId('');
        if (isTechFinalize) {
          alert(`Atendimento finalizado com sucesso!\n\nOrdem de Serviço #${finalOsNumber} gerada e enviada ao sistema administrativo com o status "Em aberto". Somente o administrativo tem autonomia para finalizar a ordem.`);
        } else {
          alert('Ordem de Serviço atualizada com sucesso!');
        }
      }
      // Para edição de O.S. existente no Administrativo/Relatório, a sincronização em memória acima já atualizou
      // instantaneamente Relatório, Lista e Cache de Páginas (0 leituras extras no banco).
      // Recarrega a lista apenas para Técnico ou na criação de uma nova O.S.
      if (userRole === UserRole.TECHNICIAN || !selectedOrder) {
        loadData();
      }
    } catch (err: any) {
      console.error(err);
      alert('Erro ao salvar Ordem de Serviço: ' + (err?.message || JSON.stringify(err)));
    } finally {
      setIsSaving(false);
      setIsSavingNext(false);
    }
  };

  // Salvar O.S como rascunho (Exclusivo para Técnicos - Salva APENAS no dispositivo sem gerar ID nem gravar no banco)
  const handleTechSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formClientId || !formAddressId) {
      alert('Selecione o cliente e o endereço antes de salvar o rascunho!');
      return;
    }

    const selectedClient = clients.find(c => c.id === formClientId);
    const selectedAddr = addresses.find(a => a.id === formAddressId);
    const isOtherEquipment = formEquipmentId === 'OUTRO EQUIPAMENTO' || formEquipmentId === 'OUTRO_EQUIPAMENTO';
    const selectedEq = isOtherEquipment ? null : equipments.find(eq => eq.id === formEquipmentId);

    const draftIdToUse = currentDraftId || (formId && formId.startsWith('draft_') ? formId : ('draft_' + Date.now()));

    const draftData: TechOSDraft = {
      id: draftIdToUse,
      savedAt: new Date().toISOString(),
      clientId: formClientId,
      clientName: selectedClient?.fullName || selectedClient?.name || '',
      addressId: formAddressId,
      addressStreet: selectedAddr?.street || addressSearchTerm || '',
      equipmentId: formEquipmentId || undefined,
      equipmentName: isOtherEquipment ? 'OUTRO EQUIPAMENTO' : (selectedEq?.name || undefined),
      equipmentBrand: isOtherEquipment ? undefined : (selectedEq?.brand || undefined),
      equipmentSector: isOtherEquipment ? undefined : (selectedEq?.sector || undefined),
      equipmentBtus: isOtherEquipment ? undefined : (selectedEq?.btus ? selectedEq.btus.toUpperCase() : undefined),
      equipmentPatrimony: isOtherEquipment ? undefined : (selectedEq?.patrimony ? selectedEq.patrimony.toUpperCase() : undefined),
      type: formType ? formType.toUpperCase() : 'MANUTENCAO CORRETIVA CONTRATO',
      openedAt: formOpenedAt ? new Date(formOpenedAt).toISOString() : new Date().toISOString(),
      openedBy: formOpenedBy || userProfile?.name?.toUpperCase() || 'TÉCNICO',
      plannedDate: formPlannedDate || undefined,
      description: formDescription ? formDescription.trim().toUpperCase() : '',
      diagnosis: formDiagnosis ? formDiagnosis.trim().toUpperCase() : undefined,
      solution: formSolution ? formSolution.trim().toUpperCase() : undefined,
      internalNotes: formTechnicalReport ? formTechnicalReport.trim().toUpperCase() : undefined,
      technicalReport: formTechnicalReport ? formTechnicalReport.trim().toUpperCase() : undefined,
      services: formServices,
      products: formProducts,
      technicianId: formTechnicianId || undefined,
      technician2Id: formTechnician2Id || undefined,
      authenticatedTeam: '',
      clientRepresentative: formRepresentative ? formRepresentative.trim().toUpperCase() : undefined,
      clientRepresentativeMatricula: formRepresentativeMatricula ? formRepresentativeMatricula.trim().toUpperCase() : undefined,
      clientRepresentativeRole: formRepresentativeRole ? formRepresentativeRole.trim().toUpperCase() : undefined,
      clientRepresentativeContact: formRepresentativeContact ? formRepresentativeContact.trim().toUpperCase() : undefined,
      serviceCompany: selectedClient?.serviceCompany || formServiceCompany || 'lefrio',
      photos: formPhotos,
      techSignature: formTechSignature || undefined,
      clientSignature: formClientSignature || undefined,
      clientSignatureDate: formClientSignature ? (formClientSignatureDate || new Date().toISOString()) : undefined
    };

    const existingIndex = techDrafts.findIndex(d => d.id === draftIdToUse);
    let updated: TechOSDraft[];
    if (existingIndex >= 0) {
      updated = [...techDrafts];
      updated[existingIndex] = draftData;
    } else {
      updated = [draftData, ...techDrafts];
    }

    saveDraftsToStorage(updated);
    setCurrentDraftId(draftIdToUse);

    alert('Rascunho salvo no seu dispositivo com sucesso!\n\nNenhuma Ordem de Serviço foi gerada no banco de dados. O ID de 2 letras e 3 números só será gerado e enviado ao sistema administrativo quando você clicar em "Finalizar".');
    setTechActiveTab('drafts');
  };

  // Continuar atendimento de rascunho salvo no aparelho
  const handleContinueDraft = (draft: TechOSDraft) => {
    setSelectedOrder(null);
    setCurrentDraftId(draft.id);
    setFormId(draft.id);
    setFormOsNumber('');
    setOriginalFormOsNumber('');
    setFormOsNumberChanged(false);
    setFormInitialOsNumber('');
    setFormOsNumberChangedAt(null);
    setFormOsNumberResetUsed(false);

    setFormClientId(draft.clientId);
    setFormAddressId(draft.addressId);
    setAddressSearchTerm(draft.addressStreet || '');
    setIsAddressDropdownOpen(false);
    const initialDraftEqId = (draft.equipmentId === 'OUTRO EQUIPAMENTO' || draft.equipmentName === 'OUTRO EQUIPAMENTO')
      ? 'OUTRO EQUIPAMENTO'
      : (draft.equipmentId || '');
    setFormEquipmentId(initialDraftEqId);

    if (draft.addressId) {
      dataService.getEquipments(draft.addressId).then(setEquipments).catch(console.error);
    }

    setFormStatus('aberta');
    setFormType(draft.type || 'MANUTENCAO CORRETIVA CONTRATO');

    const formatForInput = (d: any) => {
      if (!d) return '';
      try {
        const dateObj = typeof d === 'string' ? new Date(d) : new Date(d.seconds * 1000);
        return dateObj.toISOString().substring(0, 16);
      } catch {
        return '';
      }
    };

    setFormOpenedAt(formatForInput(draft.openedAt));
    setFormOpenedBy(draft.openedBy || userProfile?.name?.toUpperCase() || 'TÉCNICO');
    setFormFinishedAt('');
    setFormExternalOs('');
    setFormPlannedDate(draft.plannedDate || '');
    setFormDescription(draft.description || '');
    setFormDiagnosis(draft.diagnosis || '');
    setFormSolution(draft.solution || '');
    setFormTechnicalReport(draft.internalNotes || draft.technicalReport || '');
    setFormServices(draft.services || []);
    setFormProducts(draft.products || []);
    setFormTechnicianId(draft.technicianId || '');
    setFormTechnician2Id(draft.technician2Id || '');
    setFormRepresentative(draft.clientRepresentative || '');
    setFormRepresentativeMatricula(draft.clientRepresentativeMatricula || '');
    setFormRepresentativeRole(draft.clientRepresentativeRole || '');
    setFormRepresentativeContact(draft.clientRepresentativeContact || '');
    setFormServiceCompany(draft.serviceCompany || 'lefrio');
    setFormPhotos(draft.photos || []);
    setFormTechSignature(draft.techSignature || '');
    setFormClientSignature(draft.clientSignature || '');
    setFormClientSignatureDate(draft.clientSignatureDate || '');

    setTechActiveTab('form');
  };

  // Descartar rascunho salvo no aparelho
  const handleDeleteDraft = (draftId: string) => {
    if (!window.confirm('Deseja realmente descartar este rascunho de atendimento?\n\nComo esta O.S. não foi finalizada, nenhum registro ou ID foi gerado no banco de dados.')) {
      return;
    }
    const updated = techDrafts.filter(d => d.id !== draftId);
    saveDraftsToStorage(updated);
    if (currentDraftId === draftId) {
      setCurrentDraftId(null);
    }
  };

  // Finalizar atendimento (Exclusivo para Técnicos)
  // Gera o ID primário (2 letras e 3 números), envia para o ADM com status 'aberta' e bloqueia para o técnico
  const handleTechFinalizeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formClientId || !formAddressId) {
      alert('Selecione o cliente e o endereço antes de finalizar!');
      return;
    }
    if (!formEquipmentId) {
      alert('Por favor, selecione ou informe o equipamento atendido!');
      return;
    }
    const isOtherEquipment = formEquipmentId === 'OUTRO EQUIPAMENTO' || formEquipmentId === 'OUTRO_EQUIPAMENTO';
    if (isOtherEquipment && !formDescription.trim()) {
      alert('Atenção: Como você selecionou a opção "OUTRO EQUIPAMENTO", é obrigatório descrever no campo "Descrição do Problema" os detalhes da máquina encontrada em campo (marca, modelo aproximado, capacidade/BTUs e local/ambiente onde está instalada) para que o Administrativo possa identificar e vincular a máquina correta.');
      return;
    }
    if (!formSolution || !formSolution.trim()) {
      alert('Por favor, informe a Solução Realizada / Andamento antes de finalizar o atendimento!');
      return;
    }
    if (!formRepresentative || !formRepresentative.trim()) {
      alert('Atenção: O nome do responsável/representante do cliente é obrigatório para finalizar o atendimento!');
      return;
    }
    if (!formRepresentativeMatricula || !formRepresentativeMatricula.trim()) {
      alert('Atenção: A matrícula do representante do cliente é obrigatória para finalizar o atendimento!');
      return;
    }
    if (!formClientSignature || !formClientSignature.trim()) {
      alert('Atenção: A assinatura digital do representante do cliente é obrigatória para finalizar o atendimento!');
      return;
    }

    if (!window.confirm('Deseja realmente finalizar este atendimento?\n\nA Ordem de Serviço gerará o seu ID permanente (composto por 2 letras e 3 números) e será enviada ao sistema administrativo com o status "Em aberto". Somente o administrativo tem autonomia para finalizar formalmente a ordem.')) {
      return;
    }

    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localNow = new Date(now.getTime() - (offset * 60 * 1000));
    const finishedAtStr = localNow.toISOString().substring(0, 16);

    // Gera o ID primário de 2 letras e 3 números caso não possua
    const generatedOsNumber = (formOsNumber && formOsNumber !== '00000' && !formOsNumber.startsWith('OS_') && !formOsNumber.startsWith('draft_'))
      ? formOsNumber.trim()
      : generateInitialOsNumber();

    setFormOsNumber(generatedOsNumber);
    setFormFinishedAt(finishedAtStr);
    setFormStatus('aberta');

    await handleSave(e, 'aberta', finishedAtStr, false, true, generatedOsNumber);

    // Remove do rascunho local se existia
    if (currentDraftId) {
      const updated = techDrafts.filter(d => d.id !== currentDraftId);
      saveDraftsToStorage(updated);
      setCurrentDraftId(null);
    }
  };

  // Finalizar OS
  const handleFinalizeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      formStatus === 'finalizada' ||
      formStatus === 'pre_finalizada' ||
      selectedOrder?.status === 'finalizada' ||
      selectedOrder?.status === 'pre_finalizada' ||
      selectedOrder?.adminFinalized
    ) {
      return;
    }
    if (!formClientId || !formAddressId) {
      alert('Selecione o cliente e o endereço!');
      return;
    }

    // REGRA MANDATÓRIA: Bloqueio de OUTRO EQUIPAMENTO pelo Administrativo
    const isOtherEquipment = formEquipmentId === 'OUTRO EQUIPAMENTO' || formEquipmentId === 'OUTRO_EQUIPAMENTO' || (!formEquipmentId && (selectedOrder?.equipmentId === 'OUTRO EQUIPAMENTO' || selectedOrder?.equipmentName === 'OUTRO EQUIPAMENTO'));
    if (isOtherEquipment) {
      alert('BLOQUEIO DE FINALIZAÇÃO:\n\nEsta Ordem de Serviço está com a opção "OUTRO EQUIPAMENTO".\n\nConforme a regra do sistema administrativo, é obrigatório alterar essa opção e selecionar a máquina correta cadastrada no endereço (com base na descrição do problema informada pelo técnico em campo) antes de finalizar formalmente a O.S.');
      return;
    }

    if (!formSolution || !formSolution.trim()) {
      alert('Atenção: É obrigatório preencher o campo "Solução" antes de finalizar a Ordem de Serviço!');
      return;
    }

    // Calcular o total geral
    const servicesTotal = formServices.reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0);
    const productsTotal = formProducts.reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0);
    const totalValue = Number((servicesTotal + productsTotal).toFixed(2));

    const isValued = totalValue > 0;
    const targetStatus: ServiceOrder['status'] = isValued ? 'pre_finalizada' : 'finalizada';

    const confirmMsg = isValued
      ? `Deseja finalizar esta Ordem de Serviço?\n\nComo a O.S. possui valor financeiro lançado (Total: R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}), seu status será alterado para "Pré-Finalizada".`
      : `Deseja finalizar esta Ordem de Serviço?\n\nComo a O.S. não possui custo ou o custo é R$ 0,00 (Total: R$ 0,00), seu status será alterado para "Finalizada".`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    // Define data de finalização se não houver
    let finalFinishedAt = formFinishedAt;
    if (!formFinishedAt) {
      const now = new Date();
      const offset = now.getTimezoneOffset();
      const localNow = new Date(now.getTime() - (offset * 60 * 1000));
      finalFinishedAt = localNow.toISOString().substring(0, 16);
      setFormFinishedAt(finalFinishedAt);
    }

    setFormStatus(targetStatus);
    await handleSave(e, targetStatus, finalFinishedAt);
  };

  // Obter preço e desconto do item do catálogo considerando a tabela do cliente
  const getCatalogItemPriceForClient = (item: ServiceCatalogItem, clientId?: string) => {
    if (clientId && item.clientPrices && item.clientPrices[clientId]) {
      const override = item.clientPrices[clientId];
      const discount = (item.code === '336' || override.discountPercent === 74.61) ? 0 : (override.discountPercent || 0);
      return {
        unitValue: override.price,
        discountPercent: discount,
        isCustom: true
      };
    }
    const discount = (item.code === '336' || item.defaultDiscountPercent === 74.61) ? 0 : (item.defaultDiscountPercent || 0);
    return {
      unitValue: item.defaultPrice,
      discountPercent: discount,
      isCustom: false
    };
  };

  // Funções auxiliares para adicionar linhas nas tabelas de Serviços/Produtos
  const addServiceRow = (preset?: typeof PRESET_SERVICES[0] | ServiceCatalogItem) => {
    if (!preset) {
      const newItem: ServiceOrderItem = {
        code: '',
        description: '',
        unit: 'UN',
        quantity: 1,
        unitValue: 0,
        discountPercent: 0,
        totalValue: 0
      };
      setFormServices(prev => [...prev, newItem]);
      return;
    }

    if ('defaultPrice' in preset) {
      // É um ServiceCatalogItem
      const pricing = getCatalogItemPriceForClient(preset, formClientId);
      const total = Number((pricing.unitValue * 1 * (1 - pricing.discountPercent / 100)).toFixed(2));
      const newItem: ServiceOrderItem = {
        code: (preset.code || '').toUpperCase(),
        description: (preset.description || '').toUpperCase(),
        unit: (preset.unit || 'UN').toUpperCase(),
        quantity: 1,
        unitValue: pricing.unitValue,
        discountPercent: pricing.discountPercent,
        totalValue: total
      };
      setFormServices(prev => [...prev, newItem]);
    } else {
      // É preset antigo fallback
      const newItem: ServiceOrderItem = {
        code: preset.code.toUpperCase(),
        description: preset.description.toUpperCase(),
        unit: preset.unit.toUpperCase(),
        quantity: 1,
        unitValue: preset.unitValue,
        discountPercent: preset.discountPercent,
        totalValue: Number((preset.unitValue * (1 - preset.discountPercent / 100)).toFixed(2))
      };
      setFormServices(prev => [...prev, newItem]);
    }
  };

  const addProductRow = (preset?: typeof PRESET_PRODUCTS[0] | ServiceCatalogItem) => {
    if (formServices.length === 0) {
      alert('Para adicionar qualquer produto/peça, é obrigatório ter pelo menos um serviço adicionado à Ordem de Serviço.');
      return;
    }

    if (!preset) {
      const newItem: ServiceOrderItem = {
        code: '',
        description: '',
        unit: 'KG',
        quantity: 1,
        unitValue: 0,
        discountPercent: 0,
        totalValue: 0
      };
      setFormProducts(prev => [...prev, newItem]);
      return;
    }

    if ('defaultPrice' in preset) {
      // É um ServiceCatalogItem
      const pricing = getCatalogItemPriceForClient(preset, formClientId);
      const discount = (preset.code === '336' || pricing.discountPercent === 74.61) ? 0 : pricing.discountPercent;
      const total = Number((pricing.unitValue * 1 * (1 - discount / 100)).toFixed(2));
      const newItem: ServiceOrderItem = {
        code: (preset.code || '').toUpperCase(),
        description: (preset.description || '').toUpperCase(),
        unit: (preset.unit || 'KG').toUpperCase(),
        quantity: 1,
        unitValue: pricing.unitValue,
        discountPercent: discount,
        totalValue: total
      };
      setFormProducts(prev => [...prev, newItem]);
    } else {
      // É preset antigo fallback
      const discount = (preset.code === '336' || preset.discountPercent === 74.61) ? 0 : preset.discountPercent;
      const newItem: ServiceOrderItem = {
        code: preset.code.toUpperCase(),
        description: preset.description.toUpperCase(),
        unit: preset.unit.toUpperCase(),
        quantity: 1,
        unitValue: preset.unitValue,
        discountPercent: discount,
        totalValue: Number((preset.unitValue * 1 * (1 - discount / 100)).toFixed(2)) || preset.unitValue
      };
      setFormProducts(prev => [...prev, newItem]);
    }
  };

  const updateServiceRow = (index: number, field: keyof ServiceOrderItem, val: any) => {
    const updated = [...formServices];
    const item = { ...updated[index], [field]: val };
    
    // Recalcular total do item
    const qty = typeof item.quantity === 'number' ? item.quantity : (parseFloat(String(item.quantity).replace(',', '.')) || 0);
    const price = typeof item.unitValue === 'number' ? item.unitValue : (parseFloat(String(item.unitValue).replace(',', '.')) || 0);
    const desc = typeof item.discountPercent === 'number' ? item.discountPercent : (parseFloat(String(item.discountPercent).replace(',', '.')) || 0);
    item.totalValue = Number((qty * price * (1 - desc / 100)).toFixed(2));
    
    updated[index] = item;
    setFormServices(updated);
  };

  const updateProductRow = (index: number, field: keyof ServiceOrderItem, val: any) => {
    const updated = [...formProducts];
    const item = { ...updated[index], [field]: val };
    
    // Se for o produto 336 ou se tiver o desconto incorreto de 74.61%, zera o desconto
    if (item.code === '336' || item.discountPercent === 74.61) {
      item.discountPercent = 0;
    }

    // Recalcular total do item
    const qty = typeof item.quantity === 'number' ? item.quantity : (parseFloat(String(item.quantity).replace(',', '.')) || 0);
    const price = typeof item.unitValue === 'number' ? item.unitValue : (parseFloat(String(item.unitValue).replace(',', '.')) || 0);
    const desc = Number(item.discountPercent) || 0;
    item.totalValue = Number((qty * price * (1 - desc / 100)).toFixed(2));
    
    updated[index] = item;
    setFormProducts(updated);
  };

  const removeServiceRow = (index: number) => {
    setFormServices(formServices.filter((_, i) => i !== index));
  };

  const removeProductRow = (index: number) => {
    setFormProducts(formProducts.filter((_, i) => i !== index));
  };

  // CSS 100% autossuficiente (sem depender de Tailwind/variáveis CSS) para renderização fiel da O.S. na tela e na impressão nativa do navegador
  const OS_PRINT_SHEET_CSS = `
    .os-print-sheet {
      width: 210mm;
      color: #000000;
      font-family: Arial, Helvetica, sans-serif;
      display: flex;
      flex-direction: column;
      gap: 20px;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      color-adjust: exact;
    }
    .os-print-sheet *, .os-print-sheet *::before, .os-print-sheet *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      color-adjust: exact;
    }
    .os-print-page {
      width: 210mm;
      min-height: 276mm;
      padding: 12mm;
      background-color: #ffffff;
      border: 1px solid #cbd5e1;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      color: #000000;
    }
    .os-print-body {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .os-print-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid #000000;
      padding-bottom: 8px;
      margin-bottom: 2px;
      gap: 12px;
    }
    .os-print-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .os-print-logo {
      width: 82px;
      height: 54px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .os-print-logo img {
      max-width: 82px;
      max-height: 54px;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
    }
    .os-print-logo svg {
      width: 82px;
      height: 54px;
      display: block;
    }
    .os-print-company {
      font-size: 8.5px;
      color: #000000;
      line-height: 1.3;
    }
    .os-print-company-name {
      display: block;
      font-weight: 700;
      font-size: 9.5px;
      line-height: 1.15;
      margin-bottom: 2px;
      text-transform: uppercase;
      color: #000000;
    }
    .os-print-meta {
      text-align: right;
      font-size: 8px;
      color: #475569;
      font-weight: 600;
      line-height: 1.3;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .os-print-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #000000;
      padding-bottom: 4px;
    }
    .os-print-title-main {
      font-size: 13px;
      font-weight: 900;
      color: #000000;
      text-transform: uppercase;
    }
    .os-print-title-sub {
      font-size: 10px;
      font-weight: 700;
      color: #000000;
    }
    .os-print-box {
      border: 1px solid #000000;
      background-color: #ffffff;
      overflow: hidden;
    }
    .os-print-box-header {
      padding: 4px 8px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      border-bottom: 1px solid #000000;
      color: #000000;
    }
    .os-print-box-header-solo {
      border-bottom: none;
    }
    .os-print-bg-lefrio {
      background-color: #c3d8eb !important;
    }
    .os-print-bg-alclima {
      background-color: #bcf5bc !important;
    }
    .os-print-grid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      font-size: 8.5px;
      line-height: 1.3;
      color: #000000;
      text-transform: uppercase;
    }
    .os-print-c12 { grid-column: span 12 / span 12; }
    .os-print-c8 { grid-column: span 8 / span 8; }
    .os-print-c6 { grid-column: span 6 / span 6; }
    .os-print-c4 { grid-column: span 4 / span 4; }
    .os-print-c3 { grid-column: span 3 / span 3; }
    .os-print-cell {
      padding: 5px 6px;
      word-break: break-word;
    }
    .os-print-br { border-right: 1px solid #000000; }
    .os-print-bb { border-bottom: 1px solid #000000; }
    .os-print-bt { border-top: 1px solid #000000; }
    .os-print-lbl { font-weight: 700; }
    .os-print-val { font-weight: 400; }
    .os-print-subhead {
      padding: 4px 8px;
      font-weight: 700;
      background-color: #f1f5f9 !important;
      border-bottom: 1px solid #000000;
      font-size: 8px;
      text-transform: uppercase;
      color: #000000;
    }
    .os-print-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5px;
      line-height: 1.3;
      color: #000000;
    }
    .os-print-table thead {
      display: table-header-group;
    }
    .os-print-table tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .os-print-table th {
      border-bottom: 1px solid #000000;
      border-right: 1px solid #000000;
      padding: 4px 6px;
      font-weight: 700;
      color: #000000;
    }
    .os-print-table td {
      border-bottom: 1px solid #000000;
      border-right: 1px solid #000000;
      padding: 4px 6px;
      color: #000000;
      text-transform: uppercase;
      vertical-align: middle;
    }
    .os-print-table th:last-child,
    .os-print-table td:last-child {
      border-right: none;
    }
    .os-print-table tbody tr:last-child td {
      border-bottom: none;
    }
    .os-print-tc { text-align: center; }
    .os-print-tl { text-align: left; }
    .os-print-tr { text-align: right; }
    .os-print-bold { font-weight: 700; }
    .os-print-total-row {
      border-top: 1px solid #000000;
      padding: 6px 8px;
      display: flex;
      justify-content: flex-end;
      font-weight: 700;
      font-size: 10px;
      color: #000000;
    }
    .os-print-sigs {
      padding-top: 20px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 28px;
      font-size: 8px;
      align-items: end;
      line-height: 1.35;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .os-print-sig-col {
      text-align: center;
    }
    .os-print-sig-note {
      font-size: 7.5px;
      color: #334155;
      font-style: italic;
      font-weight: 600;
      margin-bottom: 6px;
      line-height: 1.25;
    }
    .os-print-sig-box {
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 4px;
    }
    .os-print-sig-img {
      max-height: 48px;
      max-width: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
    .os-print-sig-line {
      width: 100%;
      border-bottom: 1px solid #000000;
      margin: 0 auto 4px auto;
    }
    .os-print-sig-name {
      display: block;
      font-weight: 700;
      color: #000000;
      text-transform: uppercase;
      font-size: 8px;
    }
    .os-print-sig-sub {
      display: block;
      color: #475569;
      font-size: 7.5px;
    }
    .os-print-sig-date {
      display: block;
      color: #475569;
      font-size: 7.5px;
      font-weight: 700;
    }
    .os-print-sig-org {
      display: block;
      color: #64748b;
      font-size: 7.5px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-weight: 600;
    }
    .os-print-footer {
      border-top: 1px solid #000000;
      padding-top: 6px;
      margin-top: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7.5px;
      color: #64748b;
      font-weight: 600;
      line-height: 1.35;
      gap: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .os-print-footer-company {
      font-weight: 700;
      color: #000000;
      text-transform: uppercase;
    }
    .os-print-footer-meta {
      text-align: right;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .os-print-photos-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      padding-top: 10px;
    }
    .os-print-photo-card {
      border: 1px solid #000000;
      padding: 8px;
      background-color: #f8fafc !important;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .os-print-photo-img {
      height: 176px;
      max-height: 176px;
      width: 100%;
      object-fit: contain;
      display: block;
    }
    .os-print-photo-cap {
      font-size: 8px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #64748b;
      margin-top: 6px;
      display: block;
    }
  `;

  // Abrir Visualização de Impressão
  const handlePrint = (order: ServiceOrder, autoPrint = false) => {
    setSelectedOrder(order);
    setIsPrintPreviewOpen(true);

    const requestKey = `print_${order.id}_${Date.now()}`;
    activeOrderRequestRef.current = requestKey;
    const needsMediaHydration = Boolean(
      order.id &&
      (order.mediaExternalized ||
        (order.hasClientSignature && !order.clientSignature) ||
        (order.hasTechSignature && !order.techSignature) ||
        ((order.photoCount || 0) > 0 && (!order.photos || order.photos.length === 0)))
    );

    if (needsMediaHydration) {
      setIsHydratingMedia(true);
      dataService
        .hydrateServiceOrderMedia(order)
        .then((hydrated) => {
          if (activeOrderRequestRef.current !== requestKey) return;
          setSelectedOrder((prev) => (prev && prev.id === hydrated.id ? { ...prev, ...hydrated } : prev));
        })
        .catch((err) => {
          console.warn('Aviso ao hidratar mídias da O.S. para impressão:', err);
        })
        .finally(() => {
          if (activeOrderRequestRef.current === requestKey) {
            setIsHydratingMedia(false);
            if (autoPrint) {
              setTimeout(() => executePrint('os'), 250);
            }
          }
        });
    } else {
      setIsHydratingMedia(false);
      if (autoPrint) {
        setTimeout(() => executePrint('os'), 250);
      }
    }
  };

  // Abrir pré-visualização e acionar diretamente a tela de impressão do navegador a partir do modal de edição da O.S.
  const handlePrintFromEditModal = () => {
    if (!selectedOrder) return;
    const isOtherEq = formEquipmentId === 'OUTRO EQUIPAMENTO' || formEquipmentId === 'OUTRO_EQUIPAMENTO';
    const currentClient = clients.find(c => c.id === formClientId);
    const currentAddr = addresses.find(a => a.id === formAddressId);
    const currentEq = isOtherEq ? null : equipments.find(eq => eq.id === formEquipmentId);
    const servicesSum = formServices.reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0);
    const productsSum = formProducts.reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0);

    const liveOrder: ServiceOrder = {
      ...selectedOrder,
      osNumber: formOsNumber.trim() || selectedOrder.osNumber,
      clientId: formClientId || selectedOrder.clientId,
      clientName: currentClient?.fullName || currentClient?.name || selectedOrder.clientName,
      clientCnpj: currentClient?.cnpj || selectedOrder.clientCnpj,
      clientEmail: currentClient?.email || selectedOrder.clientEmail,
      clientPhone: currentClient?.phone || selectedOrder.clientPhone,
      addressId: formAddressId || selectedOrder.addressId,
      addressStreet: currentAddr?.street || selectedOrder.addressStreet,
      equipmentId: formEquipmentId || selectedOrder.equipmentId,
      equipmentName: isOtherEq ? 'OUTRO EQUIPAMENTO' : (currentEq?.name || selectedOrder.equipmentName),
      equipmentBrand: isOtherEq ? undefined : (currentEq?.brand || selectedOrder.equipmentBrand),
      equipmentSector: isOtherEq ? undefined : (currentEq?.sector || selectedOrder.equipmentSector),
      equipmentBtus: isOtherEq ? undefined : (currentEq?.btus ? currentEq.btus.toUpperCase() : selectedOrder.equipmentBtus),
      equipmentPatrimony: isOtherEq ? undefined : (currentEq?.patrimony ? currentEq.patrimony.toUpperCase() : selectedOrder.equipmentPatrimony),
      status: formStatus || selectedOrder.status,
      type: formType ? formType.toUpperCase() : selectedOrder.type,
      isWorkshop: formIsWorkshop,
      description: formDescription ? formDescription.trim().toUpperCase() : selectedOrder.description,
      diagnosis: formDiagnosis ? formDiagnosis.trim().toUpperCase() : selectedOrder.diagnosis,
      solution: formSolution ? formSolution.trim().toUpperCase() : selectedOrder.solution,
      internalNotes: formTechnicalReport ? formTechnicalReport.trim().toUpperCase() : (selectedOrder.internalNotes || selectedOrder.technicalReport || selectedOrder.routeNotes),
      technicalReport: formTechnicalReport ? formTechnicalReport.trim().toUpperCase() : (selectedOrder.technicalReport || selectedOrder.routeNotes),
      routeNotes: formTechnicalReport ? formTechnicalReport.trim().toUpperCase() : (selectedOrder.routeNotes || selectedOrder.technicalReport),
      services: formServices,
      products: formProducts,
      totalValue: Number((servicesSum + productsSum).toFixed(2)),
      technicianId: formTechnicianId || selectedOrder.technicianId,
      technician2Id: formTechnician2Id || selectedOrder.technician2Id,
      clientRepresentative: formRepresentative ? formRepresentative.trim().toUpperCase() : selectedOrder.clientRepresentative,
      clientRepresentativeMatricula: formRepresentativeMatricula ? formRepresentativeMatricula.trim().toUpperCase() : selectedOrder.clientRepresentativeMatricula,
      clientRepresentativeRole: formRepresentativeRole ? formRepresentativeRole.trim().toUpperCase() : (selectedOrder.clientRepresentativeRole || selectedOrder.clientSigneeRole),
      clientRepresentativeContact: formRepresentativeContact ? formRepresentativeContact.trim().toUpperCase() : (selectedOrder.clientRepresentativeContact || selectedOrder.clientSigneeContact),
      serviceCompany: currentClient?.serviceCompany || formServiceCompany || selectedOrder.serviceCompany,
      photos: formPhotos.length > 0 ? formPhotos : (selectedOrder.photos || []),
      techSignature: formTechSignature || selectedOrder.techSignature,
      clientSignature: formClientSignature || selectedOrder.clientSignature,
      clientSignatureDate: formClientSignatureDate || selectedOrder.clientSignatureDate
    };

    handlePrint(liveOrder, true);
  };

  // Executar Impressão Nativa do Navegador em iframe isolado com CSS 100% embutido (sem baixar arquivo e sem bugs de layout)
  const executePrint = (target: 'os' | 'batch' | 'report' = 'os') => {
    const isBatchTarget = target === 'batch' && Boolean(document.getElementById('os-batch-print-area'));
    const isOsTarget = (target === 'os' && Boolean(document.getElementById('os-print-area'))) || isBatchTarget;
    const printEl = isBatchTarget
      ? document.getElementById('os-batch-print-area')
      : (target === 'os' && document.getElementById('os-print-area'))
        ? document.getElementById('os-print-area')
        : document.getElementById('report-print-area') || document.getElementById('os-print-area');

    if (!printEl) {
      window.focus();
      window.print();
      return;
    }

    try {
      const existingIframe = document.getElementById('os-isolated-print-iframe');
      if (existingIframe) {
        existingIframe.remove();
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'os-isolated-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.top = '-10000px';
      iframe.style.left = '-10000px';
      iframe.style.width = '210mm';
      iframe.style.height = '297mm';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      const iframeWin = iframe.contentWindow;
      const iframeDoc = iframeWin?.document || iframe.contentDocument;
      if (!iframeWin || !iframeDoc) {
        iframe.remove();
        window.focus();
        window.print();
        return;
      }

      const docTitle = isBatchTarget
        ? `Impressão em Lote de O.S. (${new Date().toLocaleDateString('pt-BR')})`
        : isOsTarget
          ? `Ordem de Serviço ${selectedOrder?.osNumber || ''}`.trim()
          : 'Relatório Consolidado de Ordens de Serviço';

      let headStyles = '';
      if (isOsTarget) {
        headStyles = `
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #000000;
              font-family: Arial, Helvetica, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              color-adjust: exact;
            }
            ${OS_PRINT_SHEET_CSS}
            .os-print-sheet {
              width: 100%;
              gap: 0;
            }
            .os-print-page {
              width: 100%;
              min-height: 268mm;
              padding: 0;
              border: none;
              box-shadow: none;
              margin: 0;
            }
            .os-print-page + .os-print-page {
              page-break-before: always;
              break-before: page;
            }
          </style>
        `;
      } else {
        const inlineStyles = Array.from(document.querySelectorAll('style'))
          .map((s) => s.outerHTML)
          .join('\n');
        const linkStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .map((l) => `<link rel="stylesheet" href="${(l as HTMLLinkElement).href}" />`)
          .join('\n');
        headStyles = `
          ${linkStyles}
          ${inlineStyles}
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              font-family: Arial, Helvetica, sans-serif !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #report-print-root {
              width: 100% !important;
              max-width: 100% !important;
              border: none !important;
              box-shadow: none !important;
              padding: 0 !important;
              margin: 0 !important;
            }
          </style>
        `;
      }

      const bodyHtml = isOsTarget
        ? `<div class="os-print-sheet">${printEl.innerHTML}</div>`
        : `<div id="report-print-root">${printEl.innerHTML}</div>`;

      iframeDoc.open();
      iframeDoc.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${docTitle}</title>
  ${headStyles}
</head>
<body>${bodyHtml}</body>
</html>`);
      iframeDoc.close();

      let triggered = false;
      const triggerPrintDialog = () => {
        if (triggered) return;
        triggered = true;
        try {
          iframeWin.focus();
          iframeWin.print();
        } catch (err) {
          console.error('Erro ao imprimir via iframe isolado, usando fallback:', err);
          window.focus();
          window.print();
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              iframe.remove();
            }
          }, 60000);
        }
      };

      const imgs = Array.from(iframeDoc.querySelectorAll('img'));
      const pendingImgs = imgs.filter((img) => !img.complete);
      if (pendingImgs.length === 0) {
        setTimeout(triggerPrintDialog, isOsTarget ? 60 : 250);
      } else {
        let loaded = 0;
        const onDone = () => {
          loaded += 1;
          if (loaded >= pendingImgs.length) {
            setTimeout(triggerPrintDialog, 60);
          }
        };
        pendingImgs.forEach((img) => {
          img.addEventListener('load', onDone, { once: true });
          img.addEventListener('error', onDone, { once: true });
        });
        setTimeout(triggerPrintDialog, 600);
      }
    } catch (err) {
      console.error('Falha ao preparar iframe de impressão:', err);
      window.focus();
      window.print();
    }
  };

  // Baixar Ordem de Serviço em Formato Excel
  const downloadOsExcel = async (order: ServiceOrder) => {
    try {
      // Garante que todos os dados da O.S. (incluindo assinaturas e anexos fotográficos) estejam completos
      let effectiveOrder: ServiceOrder = { ...order };

      // 1. Verifica assinatura/dados no selectedOrder e nos estados do formulário (mesmo se o modal de impressão estiver aberto)
      if (selectedOrder && (selectedOrder.id === order.id || (order.osNumber && order.osNumber !== '00000' && selectedOrder.osNumber === order.osNumber))) {
        effectiveOrder = {
          ...selectedOrder,
          ...effectiveOrder,
          clientSignature: effectiveOrder.clientSignature || selectedOrder.clientSignature || formClientSignature,
          techSignature: effectiveOrder.techSignature || selectedOrder.techSignature || formTechSignature,
          clientSignatureDate: effectiveOrder.clientSignatureDate || selectedOrder.clientSignatureDate || formClientSignatureDate,
          clientRepresentative: effectiveOrder.clientRepresentative || selectedOrder.clientRepresentative || formRepresentative,
          clientRepresentativeMatricula: effectiveOrder.clientRepresentativeMatricula || selectedOrder.clientRepresentativeMatricula || formRepresentativeMatricula,
          photos: (effectiveOrder.photos && effectiveOrder.photos.length > 0)
            ? effectiveOrder.photos
            : ((selectedOrder.photos && selectedOrder.photos.length > 0) ? selectedOrder.photos : formPhotos)
        };
      }

      // 2. Verifica na lista em memória (orders) caso haja outro registro da mesma O.S. com assinatura preenchida
      if (!effectiveOrder.clientSignature || !effectiveOrder.photos || effectiveOrder.photos.length === 0) {
        const matchedInList = orders.find(o =>
          (o.id === effectiveOrder.id || (effectiveOrder.osNumber && effectiveOrder.osNumber !== '00000' && o.osNumber === effectiveOrder.osNumber)) &&
          (o.clientSignature || (o.photos && o.photos.length > 0))
        );
        if (matchedInList) {
          effectiveOrder = {
            ...matchedInList,
            ...effectiveOrder,
            clientSignature: effectiveOrder.clientSignature || matchedInList.clientSignature,
            techSignature: effectiveOrder.techSignature || matchedInList.techSignature,
            clientSignatureDate: effectiveOrder.clientSignatureDate || matchedInList.clientSignatureDate,
            clientRepresentative: effectiveOrder.clientRepresentative || matchedInList.clientRepresentative,
            clientRepresentativeMatricula: effectiveOrder.clientRepresentativeMatricula || matchedInList.clientRepresentativeMatricula,
            photos: (effectiveOrder.photos && effectiveOrder.photos.length > 0) ? effectiveOrder.photos : (matchedInList.photos || [])
          };
        }
      }

      // 2.5. Hidratação sob demanda na subcoleção /media/attachments (Fase 2)
      if (effectiveOrder.id && (!effectiveOrder.clientSignature || !effectiveOrder.photos || effectiveOrder.photos.length === 0)) {
        try {
          effectiveOrder = await dataService.hydrateServiceOrderMedia(effectiveOrder);
        } catch (hydrateErr) {
          console.warn('Aviso ao hidratar mídias externas para Excel:', hydrateErr);
        }
      }

      // 3. Busca direta no Firestore caso assinatura ou fotos ainda não estejam em memória
      if (effectiveOrder.id && (!effectiveOrder.clientSignature || !effectiveOrder.photos || effectiveOrder.photos.length === 0)) {
        try {
          const freshOrder = await dataService.getServiceOrder(effectiveOrder.id);
          if (freshOrder) {
            effectiveOrder = {
              ...freshOrder,
              ...effectiveOrder,
              clientSignature: effectiveOrder.clientSignature || freshOrder.clientSignature || (freshOrder as any).signature,
              techSignature: effectiveOrder.techSignature || freshOrder.techSignature,
              clientSignatureDate: effectiveOrder.clientSignatureDate || freshOrder.clientSignatureDate,
              clientRepresentative: effectiveOrder.clientRepresentative || freshOrder.clientRepresentative || freshOrder.clientSigneeName,
              clientRepresentativeMatricula: effectiveOrder.clientRepresentativeMatricula || freshOrder.clientRepresentativeMatricula || freshOrder.clientSigneeRegistration,
              photos: (effectiveOrder.photos && effectiveOrder.photos.length > 0) ? effectiveOrder.photos : (freshOrder.photos || [])
            };
          }
        } catch (fetchErr) {
          console.warn('Aviso ao buscar O.S. complementar para Excel:', fetchErr);
        }
      }

      // 4. Fallback adicional: se o modal de pré-visualização A4 estiver aberto, verifica a imagem de assinatura já renderizada no DOM
      if (!effectiveOrder.clientSignature && typeof document !== 'undefined') {
        const domClientSig = document.querySelector('#print-area img[alt="Assinatura Cliente"]') as HTMLImageElement | null;
        if (domClientSig?.src) {
          effectiveOrder.clientSignature = domClientSig.src;
        }
      }

      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const displayOsNum = effectiveOrder.osNumber || (effectiveOrder.id && !effectiveOrder.id.startsWith('OS_') ? effectiveOrder.id : '00000');
      const worksheet = workbook.addWorksheet(`OS ${displayOsNum}`);

      // Set column widths so we have a solid 12-column grid layout like the PDF
      worksheet.columns = [
        { width: 10 },  // A
        { width: 10 },  // B
        { width: 10 },  // C
        { width: 10 },  // D
        { width: 10 },  // E
        { width: 10 },  // F
        { width: 10 },  // G
        { width: 10 },  // H
        { width: 10 },  // I
        { width: 10 },  // J
        { width: 10 },  // K
        { width: 12 }   // L
      ];

      worksheet.views = [{ showGridLines: true }];
      
      const printCompany = getActiveCompanyForOrder(effectiveOrder.serviceCompany);
      const themeColor = effectiveOrder.serviceCompany === 'alclima' ? '90EE90' : '9cbdde';
      
      const colLetter = (colIdx: number) => String.fromCharCode(65 + colIdx - 1);

      // Utilitário assíncrono que carrega qualquer imagem (base64, SVG ou URL) e calcula as dimensões exatas mantendo a proporção original sem achatar
      const prepareImageForExcel = (
        src: string,
        maxWidth: number,
        maxHeight: number,
        options?: { transparentBg?: boolean }
      ): Promise<{ base64: string; width: number; height: number } | null> => {
        return new Promise((resolve) => {
          if (!src || typeof src !== 'string') {
            resolve(null);
            return;
          }
          const trimmedSrc = src.trim();
          const img = new Image();
          if (trimmedSrc.startsWith('http://') || trimmedSrc.startsWith('https://')) {
            img.crossOrigin = 'anonymous';
          }
          img.onload = () => {
            try {
              const natW = img.naturalWidth || img.width || maxWidth;
              const natH = img.naturalHeight || img.height || maxHeight;
              const scale = Math.min(maxWidth / natW, maxHeight / natH);
              const finalW = Math.max(1, Math.round(natW * scale));
              const finalH = Math.max(1, Math.round(natH * scale));

              // Renderiza em 2x no canvas para máxima nitidez no Excel
              const dpr = 2;
              const canvas = document.createElement('canvas');
              canvas.width = finalW * dpr;
              canvas.height = finalH * dpr;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                resolve(null);
                return;
              }
              if (!options?.transparentBg) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
              }
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/png');
              const base64Clean = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
              resolve({ base64: base64Clean, width: finalW, height: finalH });
            } catch (e) {
              console.warn('Erro ao converter imagem no canvas para Excel:', e);
              if (trimmedSrc.startsWith('data:image/')) {
                const b64 = trimmedSrc.split(',')[1];
                if (b64) {
                  resolve({ base64: b64, width: maxWidth, height: maxHeight });
                  return;
                }
              }
              resolve(null);
            }
          };
          img.onerror = () => {
            if (trimmedSrc.startsWith('data:image/')) {
              const b64 = trimmedSrc.split(',')[1];
              if (b64) {
                resolve({ base64: b64, width: maxWidth, height: maxHeight });
                return;
              }
            }
            resolve(null);
          };
          if (trimmedSrc.startsWith('data:') || trimmedSrc.startsWith('http') || trimmedSrc.startsWith('/')) {
            img.src = trimmedSrc;
          } else {
            img.src = `data:image/png;base64,${trimmedSrc}`;
          }
        });
      };

      // Utilitário especializado para Assinatura Digital: recorta automaticamente as bordas vazias do quadro (auto-crop),
      // reforça a nitidez do traço da caneta e renderiza em alta definição sobre fundo branco puro para garantir 100% de visibilidade no Excel
      const prepareSignatureForExcel = (
        src: string,
        maxWidth: number,
        maxHeight: number
      ): Promise<{ base64: string; width: number; height: number } | null> => {
        return new Promise((resolve) => {
          if (!src || typeof src !== 'string' || src.trim().length === 0) {
            resolve(null);
            return;
          }
          const trimmedSrc = src.trim();
          const fallbackBase64 = () => {
            if (trimmedSrc.startsWith('data:image/')) {
              const b64 = trimmedSrc.split(',')[1];
              if (b64) return { base64: b64, width: Math.min(maxWidth, 160), height: maxHeight };
            } else if (!trimmedSrc.startsWith('http') && !trimmedSrc.startsWith('/')) {
              return { base64: trimmedSrc, width: Math.min(maxWidth, 160), height: maxHeight };
            }
            return null;
          };

          const img = new Image();
          if (trimmedSrc.startsWith('http://') || trimmedSrc.startsWith('https://')) {
            img.crossOrigin = 'anonymous';
          }
          img.onload = () => {
            try {
              const natW = img.naturalWidth || img.width || 800;
              const natH = img.naturalHeight || img.height || 320;

              const srcCanvas = document.createElement('canvas');
              srcCanvas.width = natW;
              srcCanvas.height = natH;
              const srcCtx = srcCanvas.getContext('2d');
              if (!srcCtx) {
                resolve(fallbackBase64());
                return;
              }
              srcCtx.drawImage(img, 0, 0, natW, natH);

              let minX = 0;
              let minY = 0;
              let maxX = natW - 1;
              let maxY = natH - 1;

              try {
                const imgData = srcCtx.getImageData(0, 0, natW, natH);
                const data = imgData.data;
                let foundMinX = natW;
                let foundMinY = natH;
                let foundMaxX = 0;
                let foundMaxY = 0;
                let hasInk = false;

                for (let y = 0; y < natH; y++) {
                  for (let x = 0; x < natW; x++) {
                    const idx = (y * natW + x) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    const a = data[idx + 3];

                    // Detecta pixels de tinta (não transparentes e não brancos)
                    if (a > 15 && (r < 245 || g < 245 || b < 245)) {
                      hasInk = true;
                      if (x < foundMinX) foundMinX = x;
                      if (x > foundMaxX) foundMaxX = x;
                      if (y < foundMinY) foundMinY = y;
                      if (y > foundMaxY) foundMaxY = y;

                      // Reforça a opacidade e contraste do traço para não sumir ao redimensionar no Excel
                      data[idx] = Math.min(r, 30);
                      data[idx + 1] = Math.min(g, 58);
                      data[idx + 2] = Math.min(b, 138);
                      data[idx + 3] = Math.min(255, Math.max(a * 2, 235));
                    }
                  }
                }

                if (hasInk && foundMaxX >= foundMinX && foundMaxY >= foundMinY) {
                  srcCtx.putImageData(imgData, 0, 0);
                  const padX = Math.max(8, Math.round((foundMaxX - foundMinX) * 0.06));
                  const padY = Math.max(6, Math.round((foundMaxY - foundMinY) * 0.12));
                  minX = Math.max(0, foundMinX - padX);
                  minY = Math.max(0, foundMinY - padY);
                  maxX = Math.min(natW - 1, foundMaxX + padX);
                  maxY = Math.min(natH - 1, foundMaxY + padY);
                }
              } catch (cropErr) {
                console.warn('Aviso ao recortar área útil da assinatura:', cropErr);
              }

              const cropW = Math.max(1, maxX - minX + 1);
              const cropH = Math.max(1, maxY - minY + 1);
              const scale = Math.min(maxWidth / cropW, maxHeight / cropH);
              const finalW = Math.max(40, Math.round(cropW * scale));
              const finalH = Math.max(18, Math.round(cropH * scale));

              const dpr = 2;
              const outCanvas = document.createElement('canvas');
              outCanvas.width = finalW * dpr;
              outCanvas.height = finalH * dpr;
              const outCtx = outCanvas.getContext('2d');
              if (!outCtx) {
                resolve(fallbackBase64());
                return;
              }

              // Fundo branco puro para garantir contraste perfeito da assinatura em qualquer versão do Excel
              outCtx.fillStyle = '#FFFFFF';
              outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
              outCtx.imageSmoothingEnabled = true;
              outCtx.imageSmoothingQuality = 'high';
              outCtx.drawImage(srcCanvas, minX, minY, cropW, cropH, 0, 0, outCanvas.width, outCanvas.height);

              const dataUrl = outCanvas.toDataURL('image/png');
              const base64Clean = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
              resolve({ base64: base64Clean, width: finalW, height: finalH });
            } catch (err) {
              console.warn('Erro ao processar assinatura no canvas, usando base64 direto:', err);
              resolve(fallbackBase64());
            }
          };
          img.onerror = () => {
            resolve(fallbackBase64());
          };

          if (trimmedSrc.startsWith('data:') || trimmedSrc.startsWith('http') || trimmedSrc.startsWith('/')) {
            img.src = trimmedSrc;
          } else {
            img.src = `data:image/png;base64,${trimmedSrc}`;
          }
        });
      };

      // Helper to write a merged label/value block with thin borders
      const writeMergedLabelField = (startRow: number, startCol: number, endRow: number, endCol: number, label: string, value: string) => {
        const startRef = `${colLetter(startCol)}${startRow}`;
        const endRef = `${colLetter(endCol)}${endRow}`;
        worksheet.mergeCells(`${startRef}:${endRef}`);
        
        const cell = worksheet.getCell(startRef);
        cell.value = {
          richText: [
            { text: label + ': ', font: { bold: true, size: 8.5, name: 'Arial', color: { argb: 'FF000000' } } },
            { text: value || '', font: { bold: false, size: 8.5, name: 'Arial', color: { argb: 'FF333333' } } }
          ]
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        
        for (let r = startRow; r <= endRow; r++) {
          for (let c = startCol; c <= endCol; c++) {
            worksheet.getCell(r, c).border = {
              top: { style: 'thin', color: { argb: 'FF000000' } },
              left: { style: 'thin', color: { argb: 'FF000000' } },
              bottom: { style: 'thin', color: { argb: 'FF000000' } },
              right: { style: 'thin', color: { argb: 'FF000000' } }
            };
          }
        }
      };

      // Helper to write full width section headers
      const writeSectionHeader = (row: number, text: string) => {
        worksheet.mergeCells(`A${row}:L${row}`);
        const cell = worksheet.getCell(`A${row}`);
        cell.value = text;
        cell.font = { bold: true, size: 9, name: 'Arial', color: { argb: 'FF000000' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${themeColor}` }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        
        for (let c = 1; c <= 12; c++) {
          worksheet.getCell(row, c).border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
      };

      // Obtém o SVG/URL oficial da logo exatamente igual ao componente CompanyLogo (proporção fiel sem achatar)
      const getCompanyLogoSource = (companyKey?: string): string => {
        const compFromSettings = osSettings?.companies?.find(c => c.id === companyKey);
        if (compFromSettings?.logoUrl) return compFromSettings.logoUrl;
        const cached = getCompanyConfigFromCache(companyKey);
        if (cached?.logoUrl) return cached.logoUrl;

        const isAlClima = (companyKey || '').toLowerCase().includes('clima');
        if (isAlClima) {
          const svgAlClima = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="230" viewBox="0 0 140 115">
            <rect width="140" height="115" rx="6" fill="#143e1d" />
            <path d="M 10,35 L 10,105 L 130,105 L 130,35" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.6" />
            <path d="M 10,35 L 35,35 M 105,35 L 130,35" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.6" />
            <g transform="translate(64, 28) scale(1.2)" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" fill="none">
              <circle cx="0" cy="0" r="1.5" fill="#ffffff" stroke="none" />
              <line x1="0" y1="-18" x2="0" y2="18" />
              <line x1="-18" y1="0" x2="18" y2="0" />
              <line x1="-12.7" y1="-12.7" x2="12.7" y2="12.7" />
              <line x1="-12.7" y1="12.7" x2="12.7" y2="-12.7" />
              <path d="M -4,-12 L 0,-16 L 4,-12" />
              <path d="M -3,-7 L 0,-10 L 3,-7" />
              <path d="M -4,12 L 0,16 L 4,12" />
              <path d="M -3,7 L 0,10 L 3,7" />
              <path d="M -12,-4 L -16,0 L -12,4" />
              <path d="M -7,-3 L -10,0 L -7,3" />
              <path d="M 12,-4 L 16,0 L 12,4" />
              <path d="M 7,-3 L 10,0 L 7,3" />
            </g>
            <g transform="translate(86, 10) scale(0.75)">
              <rect x="0" y="0" width="8" height="24" rx="4" fill="none" stroke="#ffffff" stroke-width="1.8" />
              <circle cx="4" cy="24" r="6" fill="#39e75f" stroke="#ffffff" stroke-width="1.8" />
              <line x1="4" y1="10" x2="4" y2="21" stroke="#39e75f" stroke-width="3" stroke-linecap="round" />
            </g>
            <g transform="translate(15, 80)">
              <text x="0" y="0" font-family="Arial, sans-serif" font-weight="900" font-size="21" fill="#ffffff" letter-spacing="0.5">AL</text>
              <text x="32" y="0" font-family="Arial, sans-serif" font-weight="900" font-size="21" fill="#2fe058" letter-spacing="0.5">CLIMA</text>
            </g>
            <text x="70" y="98" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="6" fill="#ffffff" letter-spacing="3.2" opacity="0.9">REFRIGERAÇÃO</text>
          </svg>`;
          return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgAlClima)}`;
        }

        const svgLeFrio = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="200" viewBox="0 0 140 100">
          <rect width="140" height="100" fill="#ffffff" />
          <g fill="none" stroke="#68B7F2" stroke-width="6.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M 29,8 Q 50,0.8 71,8 T 113,8" />
            <path d="M 29,20 Q 50,12 71,20 T 113,20" />
            <path d="M 29,32 Q 50,23.2 71,32 T 113,32" />
            <path d="M 29,44 Q 50,34.4 71,44 T 113,44" />
          </g>
          <g fill="none" stroke="#3556A8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M 16,60 L 16,90 L 29,90" />
            <path d="M 49,60 L 37,60 L 37,90 L 49,90" />
            <path d="M 37,75 L 46,75" />
            <path d="M 57,90 L 57,60 L 69,60" />
            <path d="M 57,75 L 66,75" />
            <path d="M 77,90 L 77,60 L 86,60 A 7.5,7.5 0 0,1 86,75 L 77,75" />
            <path d="M 83,75 L 89,90" />
            <path d="M 99,60 L 99,90" />
            <path d="M 114,60 L 120,60 A 6,6 0 0,1 126,66 L 126,84 A 6,6 0 0,1 120,90 L 114,90 A 6,6 0 0,1 108,84 L 108,66 A 6,6 0 0,1 114,60 Z" />
          </g>
        </svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgLeFrio)}`;
      };

      // --- ROW 1-4: COMPANY HEADER ---
      // Define a altura das linhas 1 a 4 ANTES de inserir a imagem para evitar que o Excel achate a logo
      for (let r = 1; r <= 4; r++) {
        worksheet.getRow(r).height = 16;
      }

      worksheet.mergeCells('A1:B4');
      const logoCell = worksheet.getCell('A1');
      logoCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFFFF' }
      };

      try {
        const logoSrc = getCompanyLogoSource(effectiveOrder.serviceCompany);
        const preparedLogo = await prepareImageForExcel(logoSrc, 96, 68);
        if (preparedLogo) {
          const logoImageId = workbook.addImage({
            base64: preparedLogo.base64,
            extension: 'png',
          });
          worksheet.addImage(logoImageId, {
            tl: { col: 0.25, row: 0.2 },
            ext: { width: preparedLogo.width, height: preparedLogo.height }
          } as any);
        }
      } catch (err) {
        console.error("Erro ao inserir logo no Excel:", err);
      }

      // Company info
      worksheet.mergeCells('C1:L1');
      const compNameCell = worksheet.getCell('C1');
      compNameCell.value = printCompany?.fullName?.toUpperCase();
      compNameCell.font = { bold: true, size: 9, name: 'Arial', color: { argb: 'FF000000' } };
      compNameCell.alignment = { vertical: 'middle', horizontal: 'left' };

      worksheet.mergeCells('C2:L2');
      const compCnpjCell = worksheet.getCell('C2');
      compCnpjCell.value = `CNPJ: ${printCompany?.cnpj} - IE: ${printCompany?.ie || '-'} - IM: ${printCompany?.im || '-'}`;
      compCnpjCell.font = { size: 8, name: 'Arial', color: { argb: 'FF000000' } };
      compCnpjCell.alignment = { vertical: 'middle', horizontal: 'left' };

      worksheet.mergeCells('C3:L3');
      const compAddrCell = worksheet.getCell('C3');
      compAddrCell.value = `Endereço: ${printCompany?.address}`;
      compAddrCell.font = { size: 8, name: 'Arial', color: { argb: 'FF000000' } };
      compAddrCell.alignment = { vertical: 'middle', horizontal: 'left' };

      worksheet.mergeCells('C4:L4');
      const compContactCell = worksheet.getCell('C4');
      compContactCell.value = `E-mail: ${printCompany?.email} - Telefone: ${printCompany?.phone}`;
      compContactCell.font = { size: 8, name: 'Arial', color: { argb: 'FF000000' } };
      compContactCell.alignment = { vertical: 'middle', horizontal: 'left' };

      // --- ROW 5: TITLE ---
      worksheet.mergeCells('A5:H5');
      const titleCell = worksheet.getCell('A5');
      titleCell.value = `ORDEM DE SERVIÇO: ${displayOsNum}`;
      titleCell.font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FF000000' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

      worksheet.mergeCells('I5:L5');
      const subTitleCell = worksheet.getCell('I5');
      subTitleCell.value = '1ª Impressão (Exportação Excel)';
      subTitleCell.font = { bold: true, size: 8.5, name: 'Arial', color: { argb: 'FF555555' } };
      subTitleCell.alignment = { vertical: 'middle', horizontal: 'right' };
      worksheet.getRow(5).height = 24;

      // Add empty spacing rows with comfortable shorter heights to separate headers and client data
      worksheet.getRow(6).height = 10;
      worksheet.getRow(7).height = 10;

      // --- ROW 8: SECTION HEADER "CLIENTE" ---
      writeSectionHeader(8, 'CLIENTE');
      worksheet.getRow(8).height = 22;

      // --- ROW 9: CLIENT LINE 1 (Razão Social & CNPJ) ---
      const clientObj = clients.find(c => c.id === effectiveOrder.clientId);
      const clientName = clientObj?.fullName || clientObj?.name || effectiveOrder.clientName;
      const clientCnpj = clientObj?.cnpj || effectiveOrder.clientCnpj || '-';
      writeMergedLabelField(9, 1, 9, 8, 'Razão Social', clientName);
      writeMergedLabelField(9, 9, 9, 12, 'CNPJ', clientCnpj);
      worksheet.getRow(9).height = 20;

      // --- ROW 10: CLIENT LINE 2 (E-mail & Telefone) ---
      const clientEmail = clientObj?.email || effectiveOrder.clientEmail || '-';
      const clientPhone = clientObj?.phone || effectiveOrder.clientPhone || '-';
      writeMergedLabelField(10, 1, 10, 8, 'E-mail', clientEmail);
      writeMergedLabelField(10, 9, 10, 12, 'Telefone', clientPhone);
      worksheet.getRow(10).height = 20;

      // --- ROW 11: CLIENT LINE 3 (Endereço) ---
      const addrObj = addresses.find(a => a.id === effectiveOrder.addressId);
      const computedAddress = addrObj 
        ? [
            addrObj.street,
            addrObj.number ? `Nº ${addrObj.number}` : '',
            addrObj.complement || '',
            addrObj.neighborhood || '',
            addrObj.city || '',
            addrObj.state || '',
            addrObj.cep ? `CEP: ${addrObj.cep}` : ''
          ].filter(Boolean).join(' - ')
        : (effectiveOrder.clientAddress || clientObj?.fullAddress || '-');
      writeMergedLabelField(11, 1, 11, 12, 'Endereço', computedAddress);
      worksheet.getRow(11).height = 20;

      // Add empty spacing rows with comfortable shorter heights to separate client and OS data
      worksheet.getRow(12).height = 10;
      worksheet.getRow(13).height = 10;

      // --- ROW 14: SECTION HEADER "OS: [número]" ---
      writeSectionHeader(14, `OS: ${displayOsNum}`);
      worksheet.getRow(14).height = 22;

      // --- ROW 15: OS LINE 1 (Situação & Tipo) ---
      writeMergedLabelField(15, 1, 15, 4, 'Situação', getStatusLabel(effectiveOrder.status).toUpperCase());
      writeMergedLabelField(15, 5, 15, 12, 'Tipo', effectiveOrder.type);
      worksheet.getRow(15).height = 20;

      // --- ROW 16: OS LINE 2 (Datas e OS Externa) ---
      const openedAtStr = effectiveOrder.openedAt ? new Date(effectiveOrder.openedAt).toLocaleString('pt-BR') : '-';
      const executionAtStr = (effectiveOrder.finishedAt || effectiveOrder.updatedAt) ? new Date(effectiveOrder.finishedAt || effectiveOrder.updatedAt).toLocaleString('pt-BR') : '-';
      writeMergedLabelField(16, 1, 16, 3, 'Data Abertura', openedAtStr);
      writeMergedLabelField(16, 4, 16, 6, 'Resp. Abertura', effectiveOrder.openedBy || '-');
      writeMergedLabelField(16, 7, 16, 9, 'Execução', executionAtStr);
      writeMergedLabelField(16, 10, 16, 12, 'OS Externa', effectiveOrder.externalOs || '-');
      worksheet.getRow(16).height = 20;

      // --- ROW 17: OS LINE 3 (Descrição do Problema) ---
      writeMergedLabelField(17, 1, 17, 12, 'Descrição do Problema', effectiveOrder.description);
      worksheet.getRow(17).height = 20;

      // --- ROW 18: OS LINE 4 (Diagnóstico) ---
      writeMergedLabelField(18, 1, 18, 12, 'Diagnóstico', effectiveOrder.diagnosis || '-');
      worksheet.getRow(18).height = 20;

      // --- ROW 19: OS LINE 5 (Solução) ---
      writeMergedLabelField(19, 1, 19, 12, 'Solução', effectiveOrder.solution || '-');
      worksheet.getRow(19).height = 20;

      // Add empty spacing rows with comfortable shorter heights to separate OS data and Details
      worksheet.getRow(20).height = 10;
      worksheet.getRow(21).height = 10;

      // --- ROW 22: SECTION HEADER "DETALHES" ---
      writeSectionHeader(22, 'DETALHES');
      worksheet.getRow(22).height = 22;

      // --- ROW 23: DETALHES LINE 1 (Equipamento & Marca) ---
      writeMergedLabelField(23, 1, 23, 6, 'Equipamento', effectiveOrder.equipmentName || '-');
      writeMergedLabelField(23, 7, 23, 12, 'Marca', effectiveOrder.equipmentBrand || '-');
      worksheet.getRow(23).height = 20;

      // --- ROW 24: DETALHES LINE 2 (Setor, BTUs, Patrimônio) ---
      writeMergedLabelField(24, 1, 24, 4, 'Setor', effectiveOrder.equipmentSector || '-');
      writeMergedLabelField(24, 5, 24, 8, 'BTUs', effectiveOrder.equipmentBtus || '-');
      writeMergedLabelField(24, 9, 24, 12, 'Patrimônio / Tombamento', effectiveOrder.equipmentPatrimony || '-');
      worksheet.getRow(24).height = 20;

      // Add empty spacing rows with comfortable shorter heights to separate Details and tables
      worksheet.getRow(25).height = 10;
      worksheet.getRow(26).height = 10;

      let currentRow = 27;

      // --- SERVICES TABLE (if present) ---
      if (effectiveOrder.services && effectiveOrder.services.length > 0) {
        worksheet.mergeCells(`A${currentRow}:L${currentRow}`);
        const headerCell = worksheet.getCell(`A${currentRow}`);
        headerCell.value = 'DESCRIÇÃO DOS SERVIÇOS';
        headerCell.font = { bold: true, size: 9, name: 'Arial', color: { argb: 'FF000000' } };
        headerCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' }
        };
        headerCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        for (let c = 1; c <= 12; c++) {
          worksheet.getCell(currentRow, c).border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
        currentRow++;

        const headers = [
          { text: 'Código', startCol: 1, endCol: 1 },
          { text: 'Descrição dos Serviços', startCol: 2, endCol: 7 },
          { text: 'Un.', startCol: 8, endCol: 8 },
          { text: 'Qtd.', startCol: 9, endCol: 9 },
          { text: 'Valor Unit.', startCol: 10, endCol: 10 },
          { text: 'Desc. (%)', startCol: 11, endCol: 11 },
          { text: 'Valor Total', startCol: 12, endCol: 12 }
        ];
        
        headers.forEach(h => {
          const startRef = `${colLetter(h.startCol)}${currentRow}`;
          const endRef = `${colLetter(h.endCol)}${currentRow}`;
          if (h.startCol !== h.endCol) {
            worksheet.mergeCells(`${startRef}:${endRef}`);
          }
          const cell = worksheet.getCell(startRef);
          cell.value = h.text;
          cell.font = { bold: true, size: 8, name: 'Arial', color: { argb: 'FF000000' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: `FF${themeColor}` }
          };
          cell.alignment = { 
            vertical: 'middle', 
            horizontal: h.text.includes('Valor') || h.text.includes('Total') ? 'right' : (h.text.includes('Código') || h.text.includes('Un') || h.text.includes('Qtd') ? 'center' : 'left'),
            wrapText: true 
          };
        });
        
        for (let c = 1; c <= 12; c++) {
          worksheet.getCell(currentRow, c).border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
        currentRow++;

        effectiveOrder.services.forEach(srv => {
          worksheet.getCell(`A${currentRow}`).value = srv.code;
          worksheet.getCell(`A${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

          worksheet.mergeCells(`B${currentRow}:G${currentRow}`);
          const descCell = worksheet.getCell(`B${currentRow}`);
          descCell.value = srv.description;
          descCell.font = { bold: false, size: 8, name: 'Arial' };
          descCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

          worksheet.getCell(`H${currentRow}`).value = srv.unit;
          worksheet.getCell(`H${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

          worksheet.getCell(`I${currentRow}`).value = srv.quantity;
          worksheet.getCell(`I${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };
          worksheet.getCell(`I${currentRow}`).numFmt = '#,##0';

          worksheet.getCell(`J${currentRow}`).value = srv.unitValue;
          worksheet.getCell(`J${currentRow}`).numFmt = '"R$"#,##0.00';
          worksheet.getCell(`J${currentRow}`).alignment = { vertical: 'middle', horizontal: 'right' };

          worksheet.getCell(`K${currentRow}`).value = srv.discountPercent / 100;
          worksheet.getCell(`K${currentRow}`).numFmt = '0.0%';
          worksheet.getCell(`K${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

          worksheet.getCell(`L${currentRow}`).value = srv.totalValue;
          worksheet.getCell(`L${currentRow}`).numFmt = '"R$"#,##0.00';
          worksheet.getCell(`L${currentRow}`).font = { bold: true, size: 8, name: 'Arial' };
          worksheet.getCell(`L${currentRow}`).alignment = { vertical: 'middle', horizontal: 'right' };

          for (let c = 1; c <= 12; c++) {
            const cell = worksheet.getCell(currentRow, c);
            if (c !== 2 && c !== 12) {
              cell.font = { size: 8, name: 'Arial' };
            }
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF000000' } },
              left: { style: 'thin', color: { argb: 'FF000000' } },
              bottom: { style: 'thin', color: { argb: 'FF000000' } },
              right: { style: 'thin', color: { argb: 'FF000000' } }
            };
          }
          currentRow++;
        });

        worksheet.addRow([]);
        currentRow++;
      }

      // --- PRODUCTS TABLE (if present) ---
      if (effectiveOrder.products && effectiveOrder.products.length > 0) {
        worksheet.mergeCells(`A${currentRow}:L${currentRow}`);
        const headerCell = worksheet.getCell(`A${currentRow}`);
        headerCell.value = 'DESCRIÇÃO DOS PRODUTOS';
        headerCell.font = { bold: true, size: 9, name: 'Arial', color: { argb: 'FF000000' } };
        headerCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' }
        };
        headerCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        for (let c = 1; c <= 12; c++) {
          worksheet.getCell(currentRow, c).border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
        currentRow++;

        const headers = [
          { text: 'Código', startCol: 1, endCol: 1 },
          { text: 'Descrição dos Produtos', startCol: 2, endCol: 7 },
          { text: 'Un.', startCol: 8, endCol: 8 },
          { text: 'Qtd.', startCol: 9, endCol: 9 },
          { text: 'Valor Unit.', startCol: 10, endCol: 10 },
          { text: 'Desc. (%)', startCol: 11, endCol: 11 },
          { text: 'Valor Total', startCol: 12, endCol: 12 }
        ];
        
        headers.forEach(h => {
          const startRef = `${colLetter(h.startCol)}${currentRow}`;
          const endRef = `${colLetter(h.endCol)}${currentRow}`;
          if (h.startCol !== h.endCol) {
            worksheet.mergeCells(`${startRef}:${endRef}`);
          }
          const cell = worksheet.getCell(startRef);
          cell.value = h.text;
          cell.font = { bold: true, size: 8, name: 'Arial', color: { argb: 'FF000000' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: `FF${themeColor}` }
          };
          cell.alignment = { 
            vertical: 'middle', 
            horizontal: h.text.includes('Valor') || h.text.includes('Total') ? 'right' : (h.text.includes('Código') || h.text.includes('Un') || h.text.includes('Qtd') ? 'center' : 'left'),
            wrapText: true 
          };
        });
        
        for (let c = 1; c <= 12; c++) {
          worksheet.getCell(currentRow, c).border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
        currentRow++;

        effectiveOrder.products.forEach(prod => {
          worksheet.getCell(`A${currentRow}`).value = prod.code;
          worksheet.getCell(`A${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

          worksheet.mergeCells(`B${currentRow}:G${currentRow}`);
          const descCell = worksheet.getCell(`B${currentRow}`);
          descCell.value = prod.description;
          descCell.font = { bold: false, size: 8, name: 'Arial' };
          descCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

          worksheet.getCell(`H${currentRow}`).value = prod.unit;
          worksheet.getCell(`H${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

          worksheet.getCell(`I${currentRow}`).value = prod.quantity;
          worksheet.getCell(`I${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };
          worksheet.getCell(`I${currentRow}`).numFmt = '#,##0.00';

          worksheet.getCell(`J${currentRow}`).value = prod.unitValue;
          worksheet.getCell(`J${currentRow}`).numFmt = '"R$"#,##0.00';
          worksheet.getCell(`J${currentRow}`).alignment = { vertical: 'middle', horizontal: 'right' };

          worksheet.getCell(`K${currentRow}`).value = prod.discountPercent / 100;
          worksheet.getCell(`K${currentRow}`).numFmt = '0.0%';
          worksheet.getCell(`K${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

          worksheet.getCell(`L${currentRow}`).value = prod.totalValue;
          worksheet.getCell(`L${currentRow}`).numFmt = '"R$"#,##0.00';
          worksheet.getCell(`L${currentRow}`).font = { bold: true, size: 8, name: 'Arial' };
          worksheet.getCell(`L${currentRow}`).alignment = { vertical: 'middle', horizontal: 'right' };

          for (let c = 1; c <= 12; c++) {
            const cell = worksheet.getCell(currentRow, c);
            if (c !== 2 && c !== 12) {
              cell.font = { size: 8, name: 'Arial' };
            }
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF000000' } },
              left: { style: 'thin', color: { argb: 'FF000000' } },
              bottom: { style: 'thin', color: { argb: 'FF000000' } },
              right: { style: 'thin', color: { argb: 'FF000000' } }
            };
          }
          currentRow++;
        });

        worksheet.addRow([]);
        currentRow++;
      }

      // --- ROW TOTAL GENERAL ---
      worksheet.mergeCells(`A${currentRow}:K${currentRow}`);
      const totalLabelCell = worksheet.getCell(`A${currentRow}`);
      totalLabelCell.value = 'Total da OS:';
      totalLabelCell.font = { bold: true, size: 9.5, name: 'Arial', color: { argb: 'FF000000' } };
      totalLabelCell.alignment = { vertical: 'middle', horizontal: 'right' };
      totalLabelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' }
      };

      const totalValueCell = worksheet.getCell(`L${currentRow}`);
      totalValueCell.value = effectiveOrder.totalValue;
      totalValueCell.font = { bold: true, size: 10, name: 'Arial', color: { argb: 'FF000000' } };
      totalValueCell.alignment = { vertical: 'middle', horizontal: 'right' };
      totalValueCell.numFmt = '"R$"#,##0.00';
      totalValueCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' }
      };

      for (let c = 1; c <= 12; c++) {
        worksheet.getCell(currentRow, c).border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      }

      // Espaçamento antes do bloco de assinaturas
      currentRow++;
      worksheet.getRow(currentRow).height = 12;
      currentRow++;

      // --- SIGNATURES SECTION (COM ASSINATURA DIGITAL DO CLIENTE E AUTENTICAÇÃO DA EQUIPE) ---
      const techNames = resolveOrderTechnicianDisplay(effectiveOrder, '');
      const authDate = effectiveOrder.finishedAt ? new Date(effectiveOrder.finishedAt).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');

      // Linha de autenticação da equipe no topo direito (igual à pré-visualização A4)
      worksheet.mergeCells(`G${currentRow}:L${currentRow}`);
      const providerAuthTopCell = worksheet.getCell(`G${currentRow}`);
      providerAuthTopCell.value = `Equipe autenticada no aplicativo JDSmartOS (APP: ${authDate} ${techNames})`;
      providerAuthTopCell.font = { italic: true, bold: true, size: 7.5, name: 'Arial', color: { argb: 'FF334155' } };
      providerAuthTopCell.alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getRow(currentRow).height = 16;

      // Reserva 3 linhas mescladas e inicializadas (igual ao bloco da logo e anexos) ANTES de ancorar a imagem da assinatura
      const sigImageStartRow = currentRow + 1;
      const sigImageEndRow = sigImageStartRow + 2;
      for (let r = sigImageStartRow; r <= sigImageEndRow; r++) {
        worksheet.getRow(r).height = 18;
      }

      // Mescla os blocos de assinatura (A..F para Cliente e G..L para Prestadora) e aplica fundo branco + linha de assinatura inferior
      worksheet.mergeCells(`A${sigImageStartRow}:F${sigImageEndRow}`);
      worksheet.mergeCells(`G${sigImageStartRow}:L${sigImageEndRow}`);
      for (let r = sigImageStartRow; r <= sigImageEndRow; r++) {
        for (let c = 1; c <= 12; c++) {
          const sigCell = worksheet.getCell(r, c);
          sigCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFFFF' }
          };
          if (r === sigImageEndRow) {
            sigCell.border = {
              bottom: { style: 'thin', color: { argb: 'FF000000' } }
            };
          }
        }
      }

      // Insere a imagem da Assinatura Digital do Cliente (Colunas A..F)
      if (effectiveOrder.clientSignature) {
        try {
          const preparedClientSig = await prepareSignatureForExcel(effectiveOrder.clientSignature, 210, 48);
          if (preparedClientSig && preparedClientSig.base64) {
            const clientSigImgId = workbook.addImage({
              base64: preparedClientSig.base64,
              extension: 'png'
            });
            // Centraliza horizontalmente nas 6 colunas da esquerda (A..F ≈ 420px totais)
            const centeredCol = Math.max(0.3, Math.min(2.2, (420 - preparedClientSig.width) / 2 / 70));
            worksheet.addImage(clientSigImgId, {
              tl: { col: centeredCol, row: (sigImageStartRow - 1) + 0.15 },
              ext: { width: preparedClientSig.width, height: preparedClientSig.height }
            } as any);
          }
        } catch (sigErr) {
          console.warn('Erro ao inserir assinatura do cliente no Excel:', sigErr);
        }
      }

      // Insere a imagem da Assinatura Digital do Técnico, se houver (Colunas G..L)
      if (effectiveOrder.techSignature) {
        try {
          const preparedTechSig = await prepareSignatureForExcel(effectiveOrder.techSignature, 200, 46);
          if (preparedTechSig && preparedTechSig.base64) {
            const techSigImgId = workbook.addImage({
              base64: preparedTechSig.base64,
              extension: 'png'
            });
            const centeredTechCol = 6 + Math.max(0.3, Math.min(2.2, (420 - preparedTechSig.width) / 2 / 70));
            worksheet.addImage(techSigImgId, {
              tl: { col: centeredTechCol, row: (sigImageStartRow - 1) + 0.15 },
              ext: { width: preparedTechSig.width, height: preparedTechSig.height }
            } as any);
          }
        } catch (techSigErr) {
          console.warn('Erro ao inserir assinatura do técnico no Excel:', techSigErr);
        }
      }

      currentRow = sigImageEndRow + 1;

      // Nome do Representante do Cliente & Razão Social da Prestadora
      worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
      const clientSignCell = worksheet.getCell(`A${currentRow}`);
      clientSignCell.value = (effectiveOrder.clientRepresentative || 'REPRESENTANTE DO CLIENTE').toUpperCase();
      clientSignCell.font = { bold: true, size: 8.5, name: 'Arial', color: { argb: 'FF000000' } };
      clientSignCell.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.mergeCells(`G${currentRow}:L${currentRow}`);
      const providerSubCell = worksheet.getCell(`G${currentRow}`);
      providerSubCell.value = (printCompany?.fullName || '').toUpperCase();
      providerSubCell.font = { bold: true, size: 8, name: 'Arial', color: { argb: 'FF000000' } };
      providerSubCell.alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getRow(currentRow).height = 16;

      currentRow++;

      // Matrícula/CPF do Cliente & Subtítulo Prestadora Autorizada
      worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
      const clientSubCell = worksheet.getCell(`A${currentRow}`);
      clientSubCell.value = effectiveOrder.clientRepresentativeMatricula
        ? `Matrícula/CPF: ${effectiveOrder.clientRepresentativeMatricula}`
        : (clientName || effectiveOrder.clientName || '').toUpperCase();
      clientSubCell.font = { size: 8, name: 'Arial', color: { argb: 'FF475569' } };
      clientSubCell.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.mergeCells(`G${currentRow}:L${currentRow}`);
      const providerSub2Cell = worksheet.getCell(`G${currentRow}`);
      providerSub2Cell.value = 'PRESTADORA AUTORIZADA';
      providerSub2Cell.font = { bold: true, size: 7.5, name: 'Arial', color: { argb: 'FF64748B' } };
      providerSub2Cell.alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getRow(currentRow).height = 15;

      currentRow++;

      // Data/Hora da Assinatura do Cliente (quando presente)
      if (effectiveOrder.clientSignatureDate) {
        worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
        const sigDateCell = worksheet.getCell(`A${currentRow}`);
        const sigDateObj = new Date(effectiveOrder.clientSignatureDate);
        sigDateCell.value = !isNaN(sigDateObj.getTime())
          ? `Assinado às ${sigDateObj.toLocaleTimeString('pt-BR')} (${sigDateObj.toLocaleDateString('pt-BR')})`
          : `Assinado em: ${effectiveOrder.clientSignatureDate}`;
        sigDateCell.font = { bold: true, size: 8, name: 'Arial', color: { argb: 'FF475569' } };
        sigDateCell.alignment = { vertical: 'middle', horizontal: 'center' };
        worksheet.getRow(currentRow).height = 15;
        currentRow++;
      }

      // Nome do Cliente abaixo da matrícula/data (quando tinha matrícula)
      if (effectiveOrder.clientRepresentativeMatricula) {
        worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
        const clientOrgCell = worksheet.getCell(`A${currentRow}`);
        clientOrgCell.value = (clientName || effectiveOrder.clientName || '').toUpperCase();
        clientOrgCell.font = { bold: true, size: 8, name: 'Arial', color: { argb: 'FF64748B' } };
        clientOrgCell.alignment = { vertical: 'middle', horizontal: 'center' };
        worksheet.getRow(currentRow).height = 15;
        currentRow++;
      }

      // --- ANEXOS FOTOGRÁFICOS (QUANDO HOUVER FOTOS NA O.S.) ---
      const validPhotos = (effectiveOrder.photos || []).filter(p => typeof p === 'string' && p.trim().length > 0);
      if (validPhotos.length > 0) {
        currentRow++;
        worksheet.getRow(currentRow).height = 16;
        currentRow++;

        // Cabeçalho de Seção de Anexos
        worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
        const attachTitleCell = worksheet.getCell(`A${currentRow}`);
        attachTitleCell.value = `ORDEM DE SERVIÇO: ${displayOsNum}`;
        attachTitleCell.font = { bold: true, size: 10.5, name: 'Arial', color: { argb: 'FF000000' } };
        attachTitleCell.alignment = { vertical: 'middle', horizontal: 'left' };

        worksheet.mergeCells(`I${currentRow}:L${currentRow}`);
        const attachSubCell = worksheet.getCell(`I${currentRow}`);
        attachSubCell.value = 'Anexos Fotográficos';
        attachSubCell.font = { bold: true, size: 8.5, name: 'Arial', color: { argb: 'FF333333' } };
        attachSubCell.alignment = { vertical: 'middle', horizontal: 'right' };
        for (let c = 1; c <= 12; c++) {
          worksheet.getCell(currentRow, c).border = { bottom: { style: 'thin', color: { argb: 'FF000000' } } };
        }
        worksheet.getRow(currentRow).height = 22;
        currentRow++;

        worksheet.getRow(currentRow).height = 8;
        currentRow++;

        writeSectionHeader(currentRow, `ANEXOS DO APP - OS: ${displayOsNum}`);
        worksheet.getRow(currentRow).height = 22;
        currentRow++;

        worksheet.getRow(currentRow).height = 8;
        currentRow++;

        // Renderiza as fotos em grade de 2 colunas (Colunas A..F e Colunas G..L) mantendo proporção fiel
        const PHOTO_BOX_ROWS = 10;
        for (let i = 0; i < validPhotos.length; i += 2) {
          const boxStartRow = currentRow;
          const boxEndRow = boxStartRow + PHOTO_BOX_ROWS - 1;

          // Define altura fixa das linhas do quadro de fotos ANTES de inserir as imagens
          for (let r = boxStartRow; r <= boxEndRow; r++) {
            worksheet.getRow(r).height = 18;
          }

          const renderPhotoBox = async (photoSrc: string, photoIdx: number, startCol: number, endCol: number) => {
            const sRef = `${colLetter(startCol)}${boxStartRow}`;
            const eRef = `${colLetter(endCol)}${boxEndRow}`;
            worksheet.mergeCells(`${sRef}:${eRef}`);

            for (let r = boxStartRow; r <= boxEndRow; r++) {
              for (let c = startCol; c <= endCol; c++) {
                const cell = worksheet.getCell(r, c);
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: 'FFF8FAFC' }
                };
                cell.border = {
                  top: r === boxStartRow ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
                  bottom: r === boxEndRow ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
                  left: c === startCol ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
                  right: c === endCol ? { style: 'thin', color: { argb: 'FF000000' } } : undefined
                };
              }
            }

            try {
              const preparedPhoto = await prepareImageForExcel(photoSrc, 250, 195);
              if (preparedPhoto) {
                const photoImgId = workbook.addImage({
                  base64: preparedPhoto.base64,
                  extension: 'png'
                });
                worksheet.addImage(photoImgId, {
                  tl: { col: (startCol - 1) + 0.6, row: (boxStartRow - 1) + 0.35 },
                  ext: { width: preparedPhoto.width, height: preparedPhoto.height }
                } as any);
              }
            } catch (phErr) {
              console.warn(`Erro ao inserir foto ${photoIdx + 1} no Excel:`, phErr);
            }
          };

          await renderPhotoBox(validPhotos[i], i, 1, 6);
          if (validPhotos[i + 1]) {
            await renderPhotoBox(validPhotos[i + 1], i + 1, 7, 12);
          }

          // Linha de legenda abaixo de cada par de fotos
          const captionRow = boxEndRow + 1;
          worksheet.getRow(captionRow).height = 18;

          worksheet.mergeCells(`A${captionRow}:F${captionRow}`);
          const capLeft = worksheet.getCell(`A${captionRow}`);
          capLeft.value = `FOTO ${i + 1} - EVIDÊNCIA DE EXECUÇÃO`;
          capLeft.font = { bold: true, size: 8, name: 'Arial', color: { argb: 'FF475569' } };
          capLeft.alignment = { vertical: 'middle', horizontal: 'center' };
          for (let c = 1; c <= 6; c++) {
            worksheet.getCell(captionRow, c).border = {
              top: { style: 'thin', color: { argb: 'FF000000' } },
              bottom: { style: 'thin', color: { argb: 'FF000000' } },
              left: { style: 'thin', color: { argb: 'FF000000' } },
              right: { style: 'thin', color: { argb: 'FF000000' } }
            };
          }

          if (validPhotos[i + 1]) {
            worksheet.mergeCells(`G${captionRow}:L${captionRow}`);
            const capRight = worksheet.getCell(`G${captionRow}`);
            capRight.value = `FOTO ${i + 2} - EVIDÊNCIA DE EXECUÇÃO`;
            capRight.font = { bold: true, size: 8, name: 'Arial', color: { argb: 'FF475569' } };
            capRight.alignment = { vertical: 'middle', horizontal: 'center' };
            for (let c = 7; c <= 12; c++) {
              worksheet.getCell(captionRow, c).border = {
                top: { style: 'thin', color: { argb: 'FF000000' } },
                bottom: { style: 'thin', color: { argb: 'FF000000' } },
                left: { style: 'thin', color: { argb: 'FF000000' } },
                right: { style: 'thin', color: { argb: 'FF000000' } }
              };
            }
          }

          currentRow = captionRow + 1;
          worksheet.getRow(currentRow).height = 10;
          currentRow++;
        }
      }

      // Write to buffer and trigger download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const displayOsNumDownload = effectiveOrder.osNumber || (effectiveOrder.id && !effectiveOrder.id.startsWith('OS_') ? effectiveOrder.id : '00000');
      link.id = `lnk-download-excel-${effectiveOrder.id}`;
      link.href = downloadUrl;
      link.download = `OS_${displayOsNumDownload}_${(effectiveOrder.clientName || 'Cliente').replace(/\s+/g, '_')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro ao gerar planilha Excel:', err);
      alert('Erro ao gerar o arquivo Excel da Ordem de Serviço.');
    }
  };  // Lista exibida na tabela principal:
  // - Modo cursor (padrão): exibe exatamente a página atual de 25 últimas O.S. carregadas do Firestore
  // - Modo exact_search: exibe exatamente o resultado da busca pelo nº exato da O.S.
  // - Modo filtered_all: aplica refino de filtros secundários sobre o subconjunto filtrado no servidor
  const filteredOrders = useMemo(() => {
    if (userRole !== UserRole.TECHNICIAN && (paginationMode === 'cursor' || paginationMode === 'exact_search')) {
      return orders;
    }

    const list = orders.filter(o => {
      const matchStatus = statusFilter === 'all'
        ? true
        : statusFilter === 'tech_finalized'
          ? Boolean(o.techFinalized && o.status === 'aberta')
          : o.status === statusFilter;

      let matchDate = true;
      if (startDateFilter || endDateFilter) {
        // Regra do sistema: no caso das ordens de serviço a data a ser considerada é a data de finalização
        const finalizedDate = o.finishedAt || o.adminFinalizedAt || o.techFinalizedAt || o.clientSignatureDate;
        const isFinished = o.status === 'finalizada' || o.status === 'pre_finalizada' || o.techFinalized || o.adminFinalized;
        const rawDate = (isFinished && finalizedDate) ? finalizedDate : (finalizedDate || o.createdAt || o.openedAt);
        if (rawDate) {
          const dateStr = typeof rawDate === 'string' ? rawDate : (rawDate.seconds ? new Date(rawDate.seconds * 1000).toISOString() : '');
          if (dateStr) {
            const dateOnly = dateStr.substring(0, 10); // "YYYY-MM-DD"
            if (startDateFilter && dateOnly < startDateFilter) {
              matchDate = false;
            }
            if (endDateFilter && dateOnly > endDateFilter) {
              matchDate = false;
            }
          } else {
            matchDate = false;
          }
        } else {
          matchDate = false;
        }
      }

      const matchWorkshop = !workshopOnlyFilter || Boolean(o.isWorkshop);

      return matchStatus && matchDate && matchWorkshop;
    });

    return sortOrdersByCreationDateDesc(list);
  }, [orders, paginationMode, userRole, statusFilter, workshopOnlyFilter, startDateFilter, endDateFilter]);

  // --- PAGINAÇÃO DA TABELA DE ORDENS DE SERVIÇO ---
  const isServerCursorMode = userRole !== UserRole.TECHNICIAN && paginationMode === 'cursor';
  const totalFilteredOrders = isServerCursorMode
    ? (serverTotalOrders !== null ? serverTotalOrders : ((currentPage - 1) * itemsPerPage + filteredOrders.length))
    : filteredOrders.length;
  const totalPages = isServerCursorMode
    ? (serverTotalOrders !== null
        ? Math.max(1, Math.ceil(serverTotalOrders / itemsPerPage))
        : Math.max(loadedPagesCount + (hasMorePages ? 1 : 0), currentPage))
    : Math.max(1, Math.ceil(totalFilteredOrders / itemsPerPage));
  const safeCurrentPage = isServerCursorMode
    ? Math.max(1, currentPage)
    : Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = isServerCursorMode
    ? startIndex + filteredOrders.length
    : Math.min(startIndex + itemsPerPage, totalFilteredOrders);

  const paginatedOrders = useMemo(() => {
    if (isServerCursorMode) {
      return filteredOrders;
    }
    return filteredOrders.slice(startIndex, endIndex);
  }, [filteredOrders, isServerCursorMode, startIndex, endIndex]);

  // Função auxiliar para gerar range de botões de paginação com reticências (...)
  const getPaginationRange = (currPage: number, totalPgs: number) => {
    if (totalPgs <= 7) {
      return Array.from({ length: totalPgs }, (_, i) => i + 1);
    }
    if (currPage <= 4) {
      return [1, 2, 3, 4, 5, 'DOTS', totalPgs];
    }
    if (currPage >= totalPgs - 3) {
      return [1, 'DOTS', totalPgs - 4, totalPgs - 3, totalPgs - 2, totalPgs - 1, totalPgs];
    }
    return [1, 'DOTS', currPage - 1, currPage, currPage + 1, 'DOTS', totalPgs];
  };

  const handleJumpPage = () => {
    const pageNum = parseInt(jumpPageInput.trim(), 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      goToListPage(pageNum);
      setJumpPageInput('');
    }
  };

  // --- CÁLCULO DE DADOS PARA GRÁFICOS E RELATÓRIO AVANÇADO (SOMENTE APÓS DEFINIR FILTROS E APERTAR ENTER/BUSCAR) ---
  const reportFilteredOrders = useMemo(() => {
    if (!reportHasSearched) return [];

    const f = reportAppliedFilters;
    const normalizeStr = (str: string) =>
      (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const selectedReportAddr = f.addressId !== 'all'
      ? addresses.find(a => a.id === f.addressId)
      : undefined;
    const addressQueryTerms = (f.addressId === 'all' && f.addressQuery)
      ? normalizeStr(f.addressQuery).split(/\s+/).filter(Boolean)
      : [];

    const list = reportRawOrders.filter(o => {
      if (f.clientId !== 'all' && o.clientId !== f.clientId) return false;

      if (f.addressId !== 'all') {
        const directMatch = o.addressId === f.addressId;
        const legacyStreetMatch = Boolean(
          !o.addressId &&
          selectedReportAddr?.street &&
          normalizeStr(o.addressStreet || o.clientAddress || '').includes(normalizeStr(selectedReportAddr.street))
        );
        if (!directMatch && !legacyStreetMatch) return false;
      } else if (addressQueryTerms.length > 0) {
        const orderAddrObj = o.addressId ? addresses.find(a => a.id === o.addressId) : undefined;
        const combinedAddress = normalizeStr(
          `${o.addressStreet || ''} ${o.clientAddress || ''} ${orderAddrObj?.street || ''} ${orderAddrObj?.name || ''} ${orderAddrObj?.neighborhood || ''} ${orderAddrObj?.complement || ''} ${orderAddrObj?.number || ''}`
        );
        if (!addressQueryTerms.every(term => combinedAddress.includes(term))) return false;
      }

      if (f.technicianId !== 'all') {
        const matchesTitular = techIndex.matchesTechTitular(o.technicianId, f.technicianId);
        if (!matchesTitular) return false;
      }
      if (f.status !== 'all' && o.status !== f.status) return false;
      if (f.company !== 'all' && o.serviceCompany !== f.company) return false;
      if (f.type !== 'all' && o.type !== f.type) return false;

      if (f.workshopFilter === 'workshop_only' && !o.isWorkshop) return false;
      if (f.workshopFilter === 'standard_only' && o.isWorkshop) return false;

      if (f.startDate || f.endDate) {
        // Regra do sistema: no caso das ordens de serviço a data a ser considerada é a data de finalização
        const finalizedDate = o.finishedAt || o.adminFinalizedAt || o.techFinalizedAt || o.clientSignatureDate;
        const isFinished = o.status === 'finalizada' || o.status === 'pre_finalizada' || o.techFinalized || o.adminFinalized;
        const rawDate = (isFinished && finalizedDate) ? finalizedDate : (finalizedDate || o.createdAt || o.openedAt);
        if (rawDate) {
          const dateStr = typeof rawDate === 'string' ? rawDate : (rawDate.seconds ? new Date(rawDate.seconds * 1000).toISOString() : '');
          if (dateStr) {
            const dateOnly = dateStr.substring(0, 10);
            if (f.startDate && dateOnly < f.startDate) return false;
            if (f.endDate && dateOnly > f.endDate) return false;
          } else {
            return false;
          }
        } else {
          return false;
        }
      }
      return true;
    });

    return sortOrdersByCreationDateDesc(list);
  }, [reportHasSearched, reportRawOrders, reportAppliedFilters, techIndex, addresses]);

  // Contagem de O.S. na Oficina no sistema (via agregação leve no servidor) e filtradas
  const totalWorkshopOrders = useMemo(() => {
    if (serverWorkshopOrders !== null) return serverWorkshopOrders;
    return orders.filter(o => Boolean(o.isWorkshop)).length;
  }, [serverWorkshopOrders, orders]);

  const reportFilteredWorkshopCount = useMemo(() => {
    return reportFilteredOrders.filter(o => Boolean(o.isWorkshop)).length;
  }, [reportFilteredOrders]);

  // --- PAGINAÇÃO DA TABELA DO RELATÓRIO AVANÇADO ---
  const totalReportOrders = reportFilteredOrders.length;
  const totalReportPages = Math.max(1, Math.ceil(totalReportOrders / reportItemsPerPage));
  const safeReportPage = Math.min(Math.max(1, reportCurrentPage), totalReportPages);
  const reportStartIndex = (safeReportPage - 1) * reportItemsPerPage;
  const reportEndIndex = Math.min(reportStartIndex + reportItemsPerPage, totalReportOrders);

  const paginatedReportOrders = useMemo(() => {
    return reportFilteredOrders.slice(reportStartIndex, reportEndIndex);
  }, [reportFilteredOrders, reportStartIndex, reportEndIndex]);

  // Gráficos memoizados (só recalculam quando reportFilteredOrders muda)
  const clientChartData = useMemo(() => {
    const clientBillingMap: { [key: string]: number } = {};
    reportFilteredOrders.forEach(o => {
      clientBillingMap[o.clientName] = (clientBillingMap[o.clientName] || 0) + (o.totalValue || 0);
    });
    return Object.entries(clientBillingMap)
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [reportFilteredOrders]);

  const statusChartData = useMemo(() => {
    let aberta = 0;
    let emAndamento = 0;
    let preFinalizada = 0;
    let finalizada = 0;
    let cancelada = 0;
    for (const o of reportFilteredOrders) {
      if (o.status === 'aberta') aberta++;
      else if (o.status === 'em_andamento') emAndamento++;
      else if (o.status === 'pre_finalizada') preFinalizada++;
      else if (o.status === 'finalizada') finalizada++;
      else if (o.status === 'cancelada') cancelada++;
    }
    return [
      { name: 'Aberta', value: aberta, fill: '#ef4444' },
      { name: 'Em Andamento', value: emAndamento, fill: '#f59e0b' },
      { name: 'Pré-Finalizada', value: preFinalizada, fill: '#06b6d4' },
      { name: 'Finalizada', value: finalizada, fill: '#10b981' },
      { name: 'Cancelada', value: cancelada, fill: '#94a3b8' },
    ].filter(d => d.value > 0);
  }, [reportFilteredOrders]);

  const handleExportCSV = () => {
    if (reportFilteredOrders.length === 0) return;
    
    // Formatação segura de célula CSV (escapa aspas duplas)
    const escapeCsv = (val: any) => {
      if (val === undefined || val === null) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    // Cabeçalho do CSV com caractere BOM para suporte ao Excel em pt-BR
    const headers = [
      'Nº OS', 
      'Cliente', 
      'Endereço', 
      'CNPJ', 
      'Data Abertura', 
      'Empresa', 
      'Tipo', 
      'Técnico', 
      'Status', 
      'Solução', 
      'Valor Total (R$)'
    ];
    
    const rows = reportFilteredOrders.map(o => {
      const techName = resolveOrderTechnicianDisplay(o, 'Não Atribuído');
      const dateStr = o.openedAt ? new Date(o.openedAt).toLocaleDateString('pt-BR') : '';
      const osNum = o.osNumber || (o.id && !o.id.startsWith('OS_') ? o.id : '00000');
      const solutionText = (o.solution || '').trim();
      
      const addrObj = addresses.find(a => a.id === o.addressId);
      const clientObj = clients.find(c => c.id === o.clientId);
      const addressText = addrObj
        ? [
            addrObj.street,
            addrObj.number ? `Nº ${addrObj.number}` : '',
            addrObj.complement || '',
            addrObj.neighborhood || '',
            addrObj.city || '',
            addrObj.state || '',
            addrObj.cep ? `CEP: ${addrObj.cep}` : ''
          ].filter(Boolean).join(' - ')
        : (o.clientAddress || o.addressStreet || clientObj?.fullAddress || '');
      
      return [
        escapeCsv(osNum),
        escapeCsv(o.clientName || ''),
        escapeCsv(addressText),
        escapeCsv(o.clientCnpj || ''),
        escapeCsv(dateStr),
        escapeCsv(getActiveCompanyForOrder(o.serviceCompany).shortName),
        escapeCsv(o.type || ''),
        escapeCsv(techName),
        escapeCsv(getStatusLabel(o.status)),
        escapeCsv(solutionText),
        escapeCsv((o.totalValue || 0).toFixed(2).replace('.', ','))
      ];
    });
    
    const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(';'), ...rows.map(e => e.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_os_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const [isReportPrintOpen, setIsReportPrintOpen] = useState(false);

  // --- ESTADOS E FUNÇÕES DE IMPRESSÃO EM LOTE DE O.S. (ARQUIVO ÚNICO) ---
  interface BatchPrintOrderEntry {
    key: string;
    queriedNumber: string;
    status: 'loading' | 'found' | 'not_found';
    selected: boolean;
    order?: ServiceOrder;
  }

  const [isBatchPrintModalOpen, setIsBatchPrintModalOpen] = useState(false);
  const [batchPrintMode, setBatchPrintMode] = useState<'manual' | 'report'>('manual');
  const [batchPrintInput, setBatchPrintInput] = useState('');
  const [batchPrintEntries, setBatchPrintEntries] = useState<BatchPrintOrderEntry[]>([]);
  const [batchPrintViewMode, setBatchPrintViewMode] = useState<'selection' | 'preview'>('selection');
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);
  const batchInputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenBatchPrintModal = (mode: 'manual' | 'report') => {
    setBatchPrintViewMode('selection');
    setBatchPrintInput('');

    if (mode === 'report') {
      setBatchPrintMode('report');
      const reportEntries: BatchPrintOrderEntry[] = reportFilteredOrders.map((o) => {
        const displayNum = o.osNumber || (o.id && !o.id.startsWith('OS_') ? o.id : '00000');
        return {
          key: o.id,
          queriedNumber: String(displayNum).replace(/^#+/, '').toUpperCase(),
          status: 'found',
          selected: true,
          order: o
        };
      });
      setBatchPrintEntries(reportEntries);
      setIsBatchPrintModalOpen(true);
    } else {
      if (batchPrintMode === 'report') {
        setBatchPrintEntries([]);
      }
      setBatchPrintMode('manual');
      setIsBatchPrintModalOpen(true);
      setTimeout(() => {
        batchInputRef.current?.focus();
      }, 80);
    }
  };

  const handleAddBatchOsInput = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = batchPrintInput.trim();
    if (!raw) return;

    const tokens = raw
      .split(/[,;\s\n]+/)
      .map((t) => t.replace(/^#+/, '').trim().toUpperCase())
      .filter(Boolean);

    setBatchPrintInput('');
    setTimeout(() => {
      batchInputRef.current?.focus();
    }, 20);

    if (tokens.length === 0) return;

    for (const cleanToken of tokens) {
      const cleanDigits = cleanToken.replace(/^OS[-_\s]*/i, '').trim();

      // Verifica se já está na lista do modal
      let alreadyInBatch = false;
      setBatchPrintEntries((prev) => {
        const existingIndex = prev.findIndex((item) => {
          const itemNum = (item.order?.osNumber || item.queriedNumber || '').replace(/^#+/, '').trim().toUpperCase();
          const itemDigits = itemNum.replace(/^OS[-_\s]*/i, '').trim();
          return (
            itemNum === cleanToken ||
            (cleanDigits && itemDigits === cleanDigits) ||
            item.order?.id?.toUpperCase() === cleanToken
          );
        });
        if (existingIndex >= 0) {
          alreadyInBatch = true;
          const updated = [...prev];
          updated[existingIndex] = { ...updated[existingIndex], selected: true };
          return updated;
        }
        return prev;
      });

      if (alreadyInBatch) continue;

      // Procura primeiro em memória local (orders ou reportRawOrders)
      const localPool = [...orders, ...reportRawOrders];
      const localMatches = localPool.filter((o) => {
        const oNum = String(o.osNumber || '').replace(/^#+/, '').trim().toUpperCase();
        const oDigits = oNum.replace(/^OS[-_\s]*/i, '').trim();
        return (
          oNum === cleanToken ||
          (cleanDigits && oDigits === cleanDigits) ||
          String(o.id || '').toUpperCase() === cleanToken
        );
      });

      const uniqueLocalMap = new Map<string, ServiceOrder>();
      localMatches.forEach((m) => uniqueLocalMap.set(m.id, m));
      const uniqueLocal = Array.from(uniqueLocalMap.values());

      if (uniqueLocal.length > 0) {
        setBatchPrintEntries((prev) => {
          const existingIds = new Set(prev.map((p) => p.order?.id || p.key));
          const toAdd: BatchPrintOrderEntry[] = [];
          for (const ord of uniqueLocal) {
            if (!existingIds.has(ord.id)) {
              const dispNum = ord.osNumber || (ord.id && !ord.id.startsWith('OS_') ? ord.id : cleanToken);
              toAdd.push({
                key: ord.id,
                queriedNumber: String(dispNum).replace(/^#+/, '').toUpperCase(),
                status: 'found',
                selected: true,
                order: ord
              });
            }
          }
          return [...prev, ...toAdd];
        });
        continue;
      }

      // Caso não esteja na memória local, busca diretamente no Firestore sem travar a digitação da próxima O.S.
      const tempKey = `pending_${cleanToken}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setBatchPrintEntries((prev) => [
        ...prev,
        {
          key: tempKey,
          queriedNumber: cleanToken,
          status: 'loading',
          selected: true
        }
      ]);

      dataService
        .findServiceOrderByExactNumber(cleanToken, managerClientId)
        .then((found) => {
          const normalized = normalizeOrdersInMemory(found);
          setBatchPrintEntries((prev) => {
            const idx = prev.findIndex((item) => item.key === tempKey);
            if (idx === -1) return prev;

            if (normalized.length === 0) {
              const copy = [...prev];
              copy[idx] = {
                ...copy[idx],
                status: 'not_found',
                selected: false
              };
              return copy;
            }

            const existingOrderIds = new Set(
              prev.filter((item) => item.key !== tempKey && item.order?.id).map((item) => item.order!.id)
            );
            const newEntries: BatchPrintOrderEntry[] = normalized
              .filter((ord) => !existingOrderIds.has(ord.id))
              .map((ord) => {
                const dispNum = ord.osNumber || (ord.id && !ord.id.startsWith('OS_') ? ord.id : cleanToken);
                return {
                  key: ord.id,
                  queriedNumber: String(dispNum).replace(/^#+/, '').toUpperCase(),
                  status: 'found' as const,
                  selected: true,
                  order: ord
                };
              });

            const copy = [...prev];
            copy.splice(idx, 1, ...newEntries);
            return copy;
          });
        })
        .catch((err) => {
          console.warn(`Erro ao buscar O.S. #${cleanToken} para impressão em lote:`, err);
          setBatchPrintEntries((prev) =>
            prev.map((item) =>
              item.key === tempKey ? { ...item, status: 'not_found', selected: false } : item
            )
          );
        });
    }
  };

  const selectedBatchOrders = useMemo(() => {
    return batchPrintEntries
      .filter((e) => e.status === 'found' && e.selected && e.order)
      .map((e) => e.order!);
  }, [batchPrintEntries]);

  const isAnyBatchEntryLoading = useMemo(() => {
    return batchPrintEntries.some((e) => e.status === 'loading');
  }, [batchPrintEntries]);

  const handleToggleBatchEntry = (entryKey: string) => {
    setBatchPrintEntries((prev) =>
      prev.map((item) =>
        item.key === entryKey && item.status === 'found'
          ? { ...item, selected: !item.selected }
          : item
      )
    );
  };

  const handleRemoveBatchEntry = (entryKey: string) => {
    setBatchPrintEntries((prev) => prev.filter((item) => item.key !== entryKey));
  };

  const handleSelectAllBatchEntries = (selectAll: boolean) => {
    setBatchPrintEntries((prev) =>
      prev.map((item) => (item.status === 'found' ? { ...item, selected: selectAll } : item))
    );
  };

  const handleExecuteBatchPrint = async (openPreviewOnly = false) => {
    const ordersToPrint = batchPrintEntries
      .filter((e) => e.status === 'found' && e.selected && e.order)
      .map((e) => e.order!);

    if (ordersToPrint.length === 0) return;

    setIsBatchPrinting(true);
    try {
      // Hidrata mídias (assinaturas e fotos externalizadas) em lotes paralelos de 5 O.S.
      const hydratedMap = new Map<string, ServiceOrder>();
      const needsHydrationList = ordersToPrint.filter((order) =>
        Boolean(
          order.id &&
          (order.mediaExternalized ||
            (order.hasClientSignature && !order.clientSignature) ||
            (order.hasTechSignature && !order.techSignature) ||
            ((order.photoCount || 0) > 0 && (!order.photos || order.photos.length === 0)))
        )
      );

      const chunkSize = 5;
      for (let i = 0; i < needsHydrationList.length; i += chunkSize) {
        const chunk = needsHydrationList.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map((ord) =>
            dataService.hydrateServiceOrderMedia(ord).catch((err) => {
              console.warn(`Aviso ao hidratar mídias da O.S. ${ord.osNumber}:`, err);
              return ord;
            })
          )
        );
        results.forEach((hyd) => {
          if (hyd && hyd.id) hydratedMap.set(hyd.id, hyd);
        });
      }

      if (hydratedMap.size > 0) {
        setBatchPrintEntries((prev) =>
          prev.map((item) => {
            if (item.order && hydratedMap.has(item.order.id)) {
              return {
                ...item,
                order: { ...item.order, ...hydratedMap.get(item.order.id)! }
              };
            }
            return item;
          })
        );
      }

      if (openPreviewOnly) {
        setBatchPrintViewMode('preview');
      } else {
        setTimeout(() => {
          executePrint('batch');
        }, 180);
      }
    } finally {
      setIsBatchPrinting(false);
    }
  };

  const renderPageHeader = (pageNum: number, totalPages: number, targetOrder: ServiceOrder | null = selectedOrder) => {
    if (!targetOrder) return null;
    const printCompany = getActiveCompanyForOrder(targetOrder.serviceCompany);
    return (
      <div className="os-print-header">
        <div className="os-print-header-left">
          {renderCompanyLogo(targetOrder.serviceCompany, "os-print-logo")}
          <div className="os-print-company">
            <span className="os-print-company-name">
              {printCompany?.fullName}
            </span>
            CNPJ: {printCompany?.cnpj} - IE: {printCompany?.ie || '-'} - IM: {printCompany?.im || '-'}<br />
            Endereço: {printCompany?.address}<br />
            E-mail: {printCompany?.email} - Telefone: {printCompany?.phone}
          </div>
        </div>
        <div className="os-print-meta">
          Página: {pageNum} de {totalPages}<br />
          Usuário: {userProfile?.name || 'JOSE KENNEDY'}<br />
          Gerado em: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}
        </div>
      </div>
    );
  };

  const renderPageFooter = (pageNum: number, totalPages: number, targetOrder: ServiceOrder | null = selectedOrder) => {
    if (!targetOrder) return null;
    const printCompany = getActiveCompanyForOrder(targetOrder.serviceCompany);
    return (
      <div className="os-print-footer">
        <div>
          <span className="os-print-footer-company">{printCompany?.fullName}</span><br />
          CNPJ: {printCompany?.cnpj} - IE: {printCompany?.ie || '-'} - IM: {printCompany?.im || '-'}<br />
          Endereço: {printCompany?.address}<br />
          E-mail: {printCompany?.email} - Telefone: {printCompany?.phone}
        </div>
        <div className="os-print-footer-meta">
          Página: {pageNum} de {totalPages}<br />
          Usuário: {userProfile?.name || 'JOSE KENNEDY'}<br />
          Gerado em: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}
        </div>
      </div>
    );
  };

  // Renderiza as páginas A4 (Página 1 + Página 2 opcional de Anexos Fotográficos) de uma Ordem de Serviço
  const renderOrderPrintPages = (orderToRender: ServiceOrder) => {
    const themeHeaderBg = orderToRender.serviceCompany === 'alclima' ? 'os-print-bg-alclima' : 'os-print-bg-lefrio';
    const displayOsNumber = orderToRender.osNumber || (orderToRender.id && !orderToRender.id.startsWith('OS_') ? orderToRender.id : '00000');
    const hasPhotos = Boolean(orderToRender.photos && orderToRender.photos.length > 0);
    const totalOrderPages = hasPhotos ? 2 : 1;
    const matchedClient = clients.find(c => c.id === orderToRender.clientId);
    const matchedAddress = addresses.find(a => a.id === orderToRender.addressId);
    const orderPrintCompany = getActiveCompanyForOrder(orderToRender.serviceCompany);
    const formattedAddress = (() => {
      if (matchedAddress) {
        const parts = [
          matchedAddress.street,
          matchedAddress.number ? `Nº ${matchedAddress.number}` : '',
          matchedAddress.complement || '',
          matchedAddress.neighborhood || '',
          matchedAddress.city || '',
          matchedAddress.state || '',
          matchedAddress.cep ? `CEP: ${matchedAddress.cep}` : ''
        ].filter(Boolean);
        return (parts.length > 0 ? parts.join(' - ') : (orderToRender.clientAddress || '-')).toUpperCase();
      }
      return (orderToRender.clientAddress || matchedClient?.fullAddress || '-').toUpperCase();
    })();

    return (
      <>
        {/* --- PÁGINA 1 --- */}
        <div className="os-print-page">
          <div className="os-print-body">
            {/* Cabeçalho */}
            {renderPageHeader(1, totalOrderPages, orderToRender)}

            {/* Título OS */}
            <div className="os-print-title-row">
              <span className="os-print-title-main">ORDEM DE SERVIÇO: {displayOsNumber}</span>
              <span className="os-print-title-sub">1ª Impressão</span>
            </div>

            {/* CLIENTE */}
            <div className="os-print-box">
              <div className={`os-print-box-header ${themeHeaderBg}`}>
                CLIENTE
              </div>
              <div className="os-print-grid">
                {/* Linha 1 */}
                <div className="os-print-c8 os-print-cell os-print-br os-print-bb">
                  <span className="os-print-lbl">RAZÃO SOCIAL: </span>
                  <span className="os-print-val">
                    {(matchedClient?.fullName || matchedClient?.name || orderToRender.clientName || '').toUpperCase()}
                  </span>
                </div>
                <div className="os-print-c4 os-print-cell os-print-bb">
                  <span className="os-print-lbl">CNPJ: </span>
                  <span className="os-print-val">{(matchedClient?.cnpj || orderToRender.clientCnpj || '-').toUpperCase()}</span>
                </div>
                {/* Linha 2 */}
                <div className="os-print-c8 os-print-cell os-print-br os-print-bb">
                  <span className="os-print-lbl">E-MAIL: </span>
                  <span className="os-print-val">
                    {(matchedClient?.email || orderToRender.clientEmail || '-').toUpperCase()}
                  </span>
                </div>
                <div className="os-print-c4 os-print-cell os-print-bb">
                  <span className="os-print-lbl">TELEFONE: </span>
                  <span className="os-print-val">{(matchedClient?.phone || orderToRender.clientPhone || '-').toUpperCase()}</span>
                </div>
                {/* Linha 3 */}
                <div className="os-print-c12 os-print-cell">
                  <span className="os-print-lbl">ENDEREÇO: </span>
                  <span className="os-print-val">{formattedAddress}</span>
                </div>
              </div>
            </div>

            {/* OS: [número] */}
            <div className="os-print-box">
              <div className={`os-print-box-header ${themeHeaderBg}`}>
                OS: {displayOsNumber}
              </div>
              <div className="os-print-grid">
                {/* Linha 1 */}
                <div className="os-print-c4 os-print-cell os-print-br os-print-bb">
                  <span className="os-print-lbl">SITUAÇÃO: </span>
                  <span className="os-print-val">{getStatusLabel(orderToRender.status).toUpperCase()}</span>
                </div>
                <div className="os-print-c8 os-print-cell os-print-bb">
                  <span className="os-print-lbl">TIPO: </span>
                  <span className="os-print-val">{(orderToRender.type || '').toUpperCase()}</span>
                </div>
                {/* Linha 2 */}
                <div className="os-print-c3 os-print-cell os-print-br os-print-bb">
                  <span className="os-print-lbl">DATA ABERTURA: </span>
                  <span className="os-print-val">
                    {orderToRender.openedAt ? new Date(orderToRender.openedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </span>
                </div>
                <div className="os-print-c3 os-print-cell os-print-br os-print-bb">
                  <span className="os-print-lbl">RESP. ABERTURA: </span>
                  <span className="os-print-val">{(orderToRender.openedBy || '-').toUpperCase()}</span>
                </div>
                <div className="os-print-c3 os-print-cell os-print-br os-print-bb">
                  <span className="os-print-lbl">EXECUÇÃO: </span>
                  <span className="os-print-val">
                    {(orderToRender.finishedAt || orderToRender.updatedAt) ? new Date(orderToRender.finishedAt || orderToRender.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </span>
                </div>
                <div className="os-print-c3 os-print-cell os-print-bb">
                  <span className="os-print-lbl">OS EXTERNA: </span>
                  <span className="os-print-val">{(orderToRender.externalOs || '-').toUpperCase()}</span>
                </div>
                {/* Linha 3: Descrição do Problema */}
                <div className={`os-print-c12 os-print-cell ${(orderToRender.diagnosis || orderToRender.solution) ? 'os-print-bb' : ''}`}>
                  <span className="os-print-lbl">DESCRIÇÃO DO PROBLEMA: </span>
                  <span className="os-print-val">{(orderToRender.description || '').toUpperCase()}</span>
                </div>
                {/* Linha 4: Diagnóstico */}
                {orderToRender.diagnosis && (
                  <div className={`os-print-c12 os-print-cell ${orderToRender.solution ? 'os-print-bb' : ''}`}>
                    <span className="os-print-lbl">DIAGNÓSTICO: </span>
                    <span className="os-print-val">{(orderToRender.diagnosis || '').toUpperCase()}</span>
                  </div>
                )}
                {/* Linha 5: Solução */}
                {orderToRender.solution && (
                  <div className="os-print-c12 os-print-cell">
                    <span className="os-print-lbl">SOLUÇÃO: </span>
                    <span className="os-print-val">{(orderToRender.solution || '').toUpperCase()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* DETALHES (Equipamento) */}
            <div className="os-print-box">
              <div className={`os-print-box-header ${themeHeaderBg}`}>
                DETALHES
              </div>
              <div className="os-print-grid">
                {/* Linha 1 */}
                <div className="os-print-c6 os-print-cell os-print-br os-print-bb">
                  <span className="os-print-lbl">EQUIPAMENTO: </span>
                  <span className="os-print-val">{(orderToRender.equipmentName || '-').toUpperCase()}</span>
                </div>
                <div className="os-print-c6 os-print-cell os-print-bb">
                  <span className="os-print-lbl">MARCA: </span>
                  <span className="os-print-val">{(orderToRender.equipmentBrand || '-').toUpperCase()}</span>
                </div>
                {/* Linha 2 */}
                <div className="os-print-c4 os-print-cell os-print-br">
                  <span className="os-print-lbl">SETOR: </span>
                  <span className="os-print-val">{(orderToRender.equipmentSector || '-').toUpperCase()}</span>
                </div>
                <div className="os-print-c4 os-print-cell os-print-br">
                  <span className="os-print-lbl">BTUS: </span>
                  <span className="os-print-val">{(orderToRender.equipmentBtus || '-').toUpperCase()}</span>
                </div>
                <div className="os-print-c4 os-print-cell">
                  <span className="os-print-lbl">PATRIMÔNIO / TOMBAMENTO: </span>
                  <span className="os-print-val">{(orderToRender.equipmentPatrimony || '-').toUpperCase()}</span>
                </div>
              </div>
            </div>

            {/* TABELA DE PRODUTOS / SERVIÇOS E TOTAL */}
            {(((orderToRender.services && orderToRender.services.length > 0) || (orderToRender.products && orderToRender.products.length > 0)) || orderToRender.totalValue > 0) && (
              <div className="os-print-box">
                {/* TABELA DE SERVIÇOS */}
                {orderToRender.services && orderToRender.services.length > 0 && (
                  <div>
                    <div className="os-print-subhead">
                      DESCRIÇÃO DOS SERVIÇOS
                    </div>
                    <table className="os-print-table">
                      <thead>
                        <tr className={themeHeaderBg}>
                          <th className="os-print-tc" style={{ width: '8%' }}>Código</th>
                          <th className="os-print-tl" style={{ width: '55%' }}>Descrição dos Serviços</th>
                          <th className="os-print-tc" style={{ width: '6%' }}>Un.</th>
                          <th className="os-print-tc" style={{ width: '6%' }}>Qtd.</th>
                          <th className="os-print-tr" style={{ width: '10%' }}>Valor Unit.</th>
                          <th className="os-print-tc" style={{ width: '7%' }}>Desc. (%)</th>
                          <th className="os-print-tr" style={{ width: '10%' }}>Valor Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderToRender.services.map((srv, index) => (
                          <tr key={index}>
                            <td className="os-print-tc os-print-bold">{(srv.code || '').toUpperCase()}</td>
                            <td className="os-print-tl">{(srv.description || '').toUpperCase()}</td>
                            <td className="os-print-tc">{(srv.unit || '').toUpperCase()}</td>
                            <td className="os-print-tc">{srv.quantity}</td>
                            <td className="os-print-tr">R$ {srv.unitValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="os-print-tc">{srv.discountPercent}%</td>
                            <td className="os-print-tr os-print-bold">R$ {srv.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* TABELA DE PRODUTOS */}
                {orderToRender.products && orderToRender.products.length > 0 && (
                  <div className={orderToRender.services && orderToRender.services.length > 0 ? 'os-print-bt' : ''}>
                    <div className="os-print-subhead">
                      DESCRIÇÃO DOS PRODUTOS
                    </div>
                    <table className="os-print-table">
                      <thead>
                        <tr className={themeHeaderBg}>
                          <th className="os-print-tc" style={{ width: '8%' }}>Código</th>
                          <th className="os-print-tl" style={{ width: '55%' }}>Descrição dos Produtos</th>
                          <th className="os-print-tc" style={{ width: '6%' }}>Un.</th>
                          <th className="os-print-tc" style={{ width: '6%' }}>Qtd.</th>
                          <th className="os-print-tr" style={{ width: '10%' }}>Valor Unit.</th>
                          <th className="os-print-tc" style={{ width: '7%' }}>Desc. (%)</th>
                          <th className="os-print-tr" style={{ width: '10%' }}>Valor Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderToRender.products.map((prod, index) => (
                          <tr key={index}>
                            <td className="os-print-tc os-print-bold">{(prod.code || '').toUpperCase()}</td>
                            <td className="os-print-tl">{(prod.description || '').toUpperCase()}</td>
                            <td className="os-print-tc">{(prod.unit || '').toUpperCase()}</td>
                            <td className="os-print-tc">{prod.quantity.toFixed(2).replace('.', ',')}</td>
                            <td className="os-print-tr">R$ {prod.unitValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="os-print-tc">{prod.discountPercent}%</td>
                            <td className="os-print-tr os-print-bold">R$ {prod.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* LINHA FINAL: TOTAL DA OS */}
                <div className="os-print-total-row">
                  Total da OS: R$ {orderToRender.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            )}

            {/* ASSINATURAS E AUTENTICAÇÃO */}
            <div className="os-print-sigs">
              {/* Coluna Esquerda: Cliente */}
              <div className="os-print-sig-col">
                <div className="os-print-sig-box">
                  {orderToRender.clientSignature ? (
                    <img src={orderToRender.clientSignature} alt="Assinatura Cliente" className="os-print-sig-img" referrerPolicy="no-referrer" />
                  ) : null}
                </div>
                <div className="os-print-sig-line"></div>
                <span className="os-print-sig-name">
                  {orderToRender.clientRepresentative || 'REPRESENTANTE DO CLIENTE'}
                </span>
                {orderToRender.clientRepresentativeMatricula && (
                  <span className="os-print-sig-sub">Matrícula/CPF: {orderToRender.clientRepresentativeMatricula}</span>
                )}
                {(orderToRender.clientRepresentativeRole || orderToRender.clientSigneeRole) && (
                  <span className="os-print-sig-sub">
                    Função: {(orderToRender.clientRepresentativeRole || orderToRender.clientSigneeRole || '').toUpperCase()}
                  </span>
                )}
                {(orderToRender.clientRepresentativeContact || orderToRender.clientSigneeContact) && (
                  <span className="os-print-sig-sub">
                    E-mail/Contato: {(orderToRender.clientRepresentativeContact || orderToRender.clientSigneeContact || '').toUpperCase()}
                  </span>
                )}
                {orderToRender.clientSignatureDate && (
                  <span className="os-print-sig-date">
                    Assinado às {new Date(orderToRender.clientSignatureDate).toLocaleTimeString('pt-BR')} ({new Date(orderToRender.clientSignatureDate).toLocaleDateString('pt-BR')})
                  </span>
                )}
                <span className="os-print-sig-org">
                  {orderToRender.clientName}
                </span>
              </div>

              {/* Coluna Direita: Prestadora */}
              <div className="os-print-sig-col">
                <div className="os-print-sig-note">
                  {(() => {
                    const names = resolveOrderTechnicianDisplay(orderToRender, '');
                    const dateStr = orderToRender.finishedAt ? new Date(orderToRender.finishedAt).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');
                    return `Equipe autenticada no aplicativo JDSmartOS (APP: ${dateStr} ${names})`;
                  })()}
                </div>
                <div className="os-print-sig-box">
                  {orderToRender.techSignature ? (
                    <img src={orderToRender.techSignature} alt="Assinatura Técnico" className="os-print-sig-img" referrerPolicy="no-referrer" />
                  ) : null}
                </div>
                <div className="os-print-sig-line"></div>
                <span className="os-print-sig-name">
                  {orderPrintCompany?.fullName}
                </span>
                <span className="os-print-sig-org">
                  PRESTADORA AUTORIZADA
                </span>
              </div>
            </div>
          </div>

          {/* Rodapé Página 1 */}
          {renderPageFooter(1, totalOrderPages, orderToRender)}
        </div>

        {/* --- PÁGINA 2: ANEXOS FOTOGRÁFICOS --- */}
        {hasPhotos && (
          <div className="os-print-page">
            <div className="os-print-body">
              {/* Cabeçalho */}
              {renderPageHeader(2, 2, orderToRender)}

              {/* Título de Seção */}
              <div className="os-print-title-row">
                <span className="os-print-title-main">ORDEM DE SERVIÇO: {displayOsNumber}</span>
                <span className="os-print-title-sub">Anexos Fotográficos</span>
              </div>

              <div className="os-print-box">
                <div className={`os-print-box-header os-print-box-header-solo ${themeHeaderBg}`}>
                  ANEXOS DO APP - OS: {displayOsNumber}
                </div>
              </div>

              {/* Grid de Fotos */}
              <div className="os-print-photos-grid">
                {(orderToRender.photos || []).slice(0, 4).map((ph, idx) => (
                  <div key={idx} className="os-print-photo-card">
                    <img
                      src={ph}
                      alt={`Evidência ${idx + 1}`}
                      className="os-print-photo-img"
                      referrerPolicy="no-referrer"
                    />
                    <span className="os-print-photo-cap">
                      Foto {idx + 1} - Evidência de Execução
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rodapé Página 2 */}
            {renderPageFooter(2, 2, orderToRender)}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="space-y-6">
      {/* Estilo Especial de Impressão Embutido (100% autossuficiente para tela e Ctrl+P) */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 8mm;
        }
        ${OS_PRINT_SHEET_CSS}
        @media print {
          .no-print,
          .print-hide,
          aside,
          nav,
          header,
          button,
          .print\\:hidden {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            min-height: 0 !important;
            max-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            overflow: hidden !important;
          }

          html, body, #root, #root > div, main, main > div, main > div > div, .print-modal-container {
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
            transition: none !important;
            animation: none !important;
          }

          .print-modal-container {
            width: 100% !important;
            inset: auto !important;
            backdrop-filter: none !important;
            z-index: auto !important;
          }

          .print-modal-card,
          .print-modal-scroll {
            max-width: none !important;
            max-height: none !important;
            height: auto !important;
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: transparent !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
          }

          .os-print-sheet {
            width: 100% !important;
            gap: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .os-print-page {
            width: 100% !important;
            min-height: 268mm !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
          }

          .os-print-page + .os-print-page {
            page-break-before: always !important;
            break-before: page !important;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Container principal ocultado na impressão para evitar vazamento do conteúdo de fundo */}
      <div className="print:hidden space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 border border-slate-200/80 rounded-2xl shadow-3xs no-print">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600/10 p-2.5 rounded-xl text-blue-600">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight uppercase">Ordens de Serviço (O.S.)</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Gestão completa de chamados técnicos e corretivas por equipamento</p>
            </div>
          </div>
          <button
            onClick={handleCreateNew}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-widest py-3 px-5 rounded-xl transition-all shadow-md hover:shadow-blue-100 flex items-center gap-2 self-stretch sm:self-auto justify-center"
          >
            <Plus className="w-4 h-4" /> Nova Ordem de Serviço
          </button>
        </div>

        {/* Abas de Navegação Interna */}
        {userRole === UserRole.TECHNICIAN ? (
          <div className="flex border-b border-slate-200 no-print overflow-x-auto">
            <button
              onClick={() => setTechActiveTab('my_orders')}
              className={cn(
                "px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer",
                techActiveTab === 'my_orders'
                  ? "border-blue-600 text-blue-600 bg-blue-50/20"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>Minhas O.S. Geradas</span>
              {(() => {
                const activeName = currentTechName;
                const tId = currentTechObj?.id || '';
                const myCount = orders.filter(o => isMyGeneratedOrder(o, tId, activeName)).length;

                return (
                  <span className={cn(
                    "text-[10px] font-black px-2 py-0.5 rounded-full transition-colors",
                    techActiveTab === 'my_orders' ? "bg-blue-600 text-white" : "bg-slate-150 text-slate-600"
                  )}>
                    {myCount}
                  </span>
                );
              })()}
            </button>
            <button
              onClick={() => setTechActiveTab('adm_orders')}
              className={cn(
                "px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer relative",
                techActiveTab === 'adm_orders'
                  ? "border-blue-600 text-blue-600 bg-blue-50/20"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              <Inbox className="w-4 h-4" />
              <span>Recebidas do Administrativo</span>
              {(() => {
                const activeName = currentTechName;
                const tId = currentTechObj?.id || '';
                const admCount = orders.filter(o => isAdmOrderForTech(o, tId, activeName)).length;

                return admCount > 0 ? (
                  <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs">
                    {admCount}
                  </span>
                ) : null;
              })()}
            </button>
            <button
              onClick={() => setTechActiveTab('drafts')}
              className={cn(
                "px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer relative",
                techActiveTab === 'drafts'
                  ? "border-amber-500 text-amber-600 bg-amber-50/20"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              <Save className="w-4 h-4" />
              <span>Rascunhos no Aparelho</span>
              {techDrafts.length > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs">
                  {techDrafts.length}
                </span>
              )}
            </button>
          </div>
        ) : (
          <div className="flex border-b border-slate-200 no-print">
            <button
              onClick={() => setActiveTab('list')}
              className={cn(
                "px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer",
                activeTab === 'list'
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              <ListPlus className="w-4 h-4" />
              Ordens de Serviço
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={cn(
                "px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer",
                activeTab === 'reports'
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              <BarChart2 className="w-4 h-4" />
              Relatório Avançado
            </button>
            <button
              onClick={() => setActiveTab('jetting')}
              className={cn(
                "px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer",
                activeTab === 'jetting'
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              <Droplets className="w-4 h-4" />
              Jateamento (Gerador)
            </button>
          </div>
        )}

      {userRole === UserRole.TECHNICIAN ? (
        techActiveTab !== 'form' && (
          <div className="space-y-5 no-print">
            {/* Barra de Abertura Rápida por ID da Máquina para o Técnico */}
            <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white p-4 sm:p-5 rounded-2xl shadow-md space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white/15 text-amber-300 flex items-center justify-center shrink-0 border border-white/20 shadow-xs">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-2">
                      <span>Abertura Rápida de O.S. por ID da Máquina</span>
                      <span className="text-[9px] font-bold bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full uppercase">
                        Atendimento Express
                      </span>
                    </h3>
                    <p className="text-[11px] text-blue-100 font-medium">
                      Digite o ID da máquina para carregar cliente, endereço e equipamento automaticamente e abrir a O.S.
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleQuickOpenByMachineId} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={quickOpenMachineId}
                    onChange={(e) => setQuickOpenMachineId(e.target.value)}
                    placeholder="Digite o ID da Máquina (ex: 0042, 42, 1024, patrimônio)..."
                    className="w-full bg-white text-slate-900 border-0 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-amber-400 shadow-inner uppercase"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isQuickOpening || !quickOpenMachineId.trim()}
                  className={cn(
                    "bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 shrink-0 cursor-pointer font-sans",
                    (isQuickOpening || !quickOpenMachineId.trim()) && "opacity-60 cursor-not-allowed"
                  )}
                >
                  {isQuickOpening ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                      <span>Localizando...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 fill-current" />
                      <span>Localizar e Abrir O.S.</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Barra de Filtro e Busca para o Técnico */}
            <div className="bg-white p-4 border border-slate-200/80 rounded-2xl shadow-3xs flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={techActiveTab === 'my_orders' ? "Buscar por O.S., cliente, setor, endereço, equipamento ou solução..." : "Buscar chamados recebidos do ADM..."}
                  value={techSearchTerm}
                  onChange={(e) => setTechSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
                <select
                  value={techStatusFilter}
                  onChange={(e) => setTechStatusFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                >
                  <option value="all">Todos os Status</option>
                  <option value="aberta">Aberta</option>
                  <option value="em_andamento">Em Andamento</option>
                  <option value="pre_finalizada">Pré-Finalizada</option>
                  <option value="finalizada">Finalizada</option>
                </select>
              </div>
            </div>

            {(() => {
              const activeName = currentTechName;
              const tId = currentTechObj?.id || '';

              if (loading) {
                return (
                  <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Carregando Ordens de Serviço{loadedOrdersProgress > 0 ? ` (${loadedOrdersProgress} carregadas...)` : '...'}
                    </p>
                  </div>
                );
              }

              if (loadError && orders.length === 0) {
                return (
                  <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-8 text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-rose-900 uppercase tracking-wider">Falha de Conexão ao Carregar O.S.</h4>
                      <p className="text-xs text-rose-700 max-w-md mx-auto">{loadError}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadData(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-sm transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Tentar Novamente
                    </button>
                  </div>
                );
              }

              // ABA 1: MINHAS ORDENS DE SERVIÇO GERADAS
              if (techActiveTab === 'my_orders') {
                const myGenerated = orders.filter(o => isMyGeneratedOrder(o, tId, activeName));

                const termUpper = normalizeTechString(techSearchTerm);
                const filtered = sortOrdersByCreationDateDesc(myGenerated.filter(o => {
                  const eqSector = normalizeTechString(o.equipmentSector || (o.equipmentId ? equipments.find(e => e.id === o.equipmentId)?.sector : ''));
                  const matchesSearch = !termUpper ||
                    (o.osNumber && o.osNumber.toUpperCase().includes(termUpper)) ||
                    (o.id && o.id.toUpperCase().includes(termUpper)) ||
                    normalizeTechString(o.clientName).includes(termUpper) ||
                    normalizeTechString(o.addressStreet).includes(termUpper) ||
                    normalizeTechString(o.equipmentName).includes(termUpper) ||
                    eqSector.includes(termUpper) ||
                    normalizeTechString(o.solution).includes(termUpper) ||
                    normalizeTechString(o.diagnosis).includes(termUpper);
                  const matchesStatus = techStatusFilter === 'all' || o.status === techStatusFilter;
                  return matchesSearch && matchesStatus;
                }));

                if (filtered.length === 0) {
                  return (
                    <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto text-xl font-bold">
                        📋
                      </div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Nenhuma O.S. Gerada Encontrada</h4>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        {techSearchTerm || techStatusFilter !== 'all'
                          ? "Nenhuma ordem de serviço corresponde aos filtros de busca aplicados."
                          : "Você ainda não possui ordens de serviço geradas. Clique no botão azul '+ Nova Ordem de Serviço' no topo para iniciar uma nova O.S."}
                      </p>
                    </div>
                  );
                }

                // Paginação para Minhas O.S.
                const techMyTotal = filtered.length;
                const techMyTotalPages = Math.max(1, Math.ceil(techMyTotal / techMyOrdersPerPage));
                const safeTechMyPage = Math.min(Math.max(1, techMyOrdersPage), techMyTotalPages);
                const techMyStartIndex = (safeTechMyPage - 1) * techMyOrdersPerPage;
                const techMyEndIndex = Math.min(techMyStartIndex + techMyOrdersPerPage, techMyTotal);
                const paginatedMyOrders = filtered.slice(techMyStartIndex, techMyEndIndex);

                return (
                  <div className="space-y-4">
                    {/* Top bar de paginação rápida técnico */}
                    <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-600">
                        Mostrando <strong>{techMyStartIndex + 1}–{techMyEndIndex}</strong> de <strong>{techMyTotal}</strong> O.S.
                      </span>
                      {techMyTotalPages > 1 && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setTechMyOrdersPage(prev => Math.max(1, prev - 1))}
                            disabled={safeTechMyPage === 1}
                            className="p-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-black text-slate-800 text-[11px] px-1">
                            {safeTechMyPage} / {techMyTotalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setTechMyOrdersPage(prev => Math.min(techMyTotalPages, prev + 1))}
                            disabled={safeTechMyPage === techMyTotalPages}
                            className="p-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {paginatedMyOrders.map((order) => {
                      const isOrderSigned = Boolean(
                        order.hasClientSignature ||
                        (order.clientSignature && order.clientSignature.trim().length > 0) ||
                        order.clientSignatureDate
                      );
                      const isOrderFinalized = Boolean(order.techFinalized || order.status === 'finalizada' || order.status === 'cancelada');
                      const orderSector = order.equipmentSector || (order.equipmentId ? equipments.find(e => e.id === order.equipmentId)?.sector : '') || '';

                      return (
                        <div
                          key={order.id}
                          className={cn(
                            "bg-white border rounded-2xl p-5 shadow-3xs transition-all flex flex-col justify-between gap-4",
                            isOrderFinalized 
                              ? "border-emerald-200/90 hover:border-emerald-300" 
                              : "border-blue-200/90 hover:border-blue-300 hover:shadow-xs"
                          )}
                        >
                          <div className="space-y-3.5">
                            {/* Cabeçalho do Card */}
                            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-black text-slate-900 tracking-tight">
                                    SO nº {order.osNumber || (order.id && !order.id.startsWith('OS_') ? order.id : '00000')}
                                  </span>
                                  {orderSector && (
                                    <span 
                                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80 rounded-md"
                                      title={`Setor: ${orderSector}`}
                                    >
                                      <Layers className="w-2.5 h-2.5 text-indigo-600 shrink-0" />
                                      <span className="truncate max-w-[130px] xs:max-w-[170px] sm:max-w-[210px]">
                                        Setor: {orderSector}
                                      </span>
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 mt-0.5">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  Aberta em: {formatDateSafe(order.openedAt)}
                                </span>
                              </div>
                              <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5">
                                <span className={cn(
                                  "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-full shrink-0",
                                  order.status === 'aberta' ? "bg-blue-50 text-blue-600 border border-blue-100" :
                                  order.status === 'em_andamento' ? "bg-amber-50 text-amber-600 border border-amber-100" :
                                  order.status === 'pre_finalizada' ? "bg-teal-50 text-teal-600 border border-teal-100" :
                                  order.status === 'finalizada' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                  "bg-rose-50 text-rose-600 border border-rose-100"
                                )}>
                                  {getStatusLabel(order.status)}
                                </span>
                                {order.techFinalized ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1 shrink-0">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-blue-600" /> Enviada ao ADM
                                  </span>
                                ) : isOrderFinalized ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 shrink-0">
                                    <CheckCircle2 className="w-2.5 h-2.5" /> Concluída ADM
                                  </span>
                                ) : isOrderSigned ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1 shrink-0">
                                    <Lock className="w-2.5 h-2.5" /> Rascunho c/ Assinatura
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1 shrink-0">
                                    <Unlock className="w-2.5 h-2.5" /> Rascunho
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Dados Principais: Cliente e Endereço */}
                            <div className="space-y-1.5">
                              <div>
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Cliente</span>
                                <div className="text-xs font-black text-slate-800 uppercase leading-snug">
                                  {order.clientName || 'Cliente não identificado'}
                                </div>
                              </div>

                              <div>
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Endereço de Atendimento</span>
                                <div className="text-[11px] font-bold text-slate-600 flex items-start gap-1.5 leading-tight">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                  <span>{order.addressStreet || 'Endereço não informado'}</span>
                                </div>
                              </div>

                              {/* Equipamento */}
                              {(order.equipmentName || order.equipmentBrand || order.equipmentBtus) && (
                                <div className="bg-slate-50 border border-slate-150 rounded-xl p-2.5 flex items-center gap-2">
                                  <Wind className="w-4 h-4 text-blue-600 shrink-0" />
                                  <div className="text-[11px] font-bold text-slate-700 leading-tight truncate">
                                    {order.equipmentName === 'OUTRO EQUIPAMENTO' || order.equipmentId === 'OUTRO EQUIPAMENTO' ? (
                                      <span className="inline-flex items-center gap-1 font-black text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-[10px] border border-amber-300">
                                        <AlertTriangle className="w-3 h-3 text-amber-700" />
                                        OUTRO EQUIPAMENTO
                                      </span>
                                    ) : (
                                      <span className="font-black text-slate-900">{order.equipmentName || 'Equipamento'}</span>
                                    )}
                                    {order.equipmentBrand && ` • ${order.equipmentBrand}`}
                                    {order.equipmentBtus && ` (${order.equipmentBtus})`}
                                    {order.equipmentPatrimony && ` • Patr: ${order.equipmentPatrimony}`}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Campo de Solução em Destaque */}
                            <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 space-y-1">
                              <div className="text-[10px] font-black uppercase text-emerald-800 tracking-wider flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                Solução Realizada / Andamento:
                              </div>
                              <p className="text-xs font-semibold text-emerald-950 leading-relaxed whitespace-pre-wrap">
                                {order.solution && order.solution.trim() ? (
                                  order.solution
                                ) : (
                                  <span className="text-slate-400 italic font-normal">Nenhuma solução registrada ainda.</span>
                                )}
                              </p>
                            </div>

                            {/* Diagnóstico técnico */}
                            {order.diagnosis && order.diagnosis.trim() && (
                              <div className="text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-150 rounded-xl px-3 py-2">
                                <span className="text-slate-700 font-extrabold uppercase">Diagnóstico Técnico:</span> {order.diagnosis}
                              </div>
                            )}

                            {/* Detalhe de Assinatura salva no rascunho (apenas para O.S. ainda não finalizada) */}
                            {!isOrderFinalized && isOrderSigned && (
                              <div className="text-[10px] font-bold text-emerald-800 bg-emerald-50/90 border border-emerald-200 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>
                                  Assinatura do cliente salva no rascunho • Clique abaixo para continuar editando ou finalizar
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Botão de Ação para o Técnico */}
                          <div className="pt-3 border-t border-slate-100">
                            {isOrderFinalized ? (
                              <button
                                type="button"
                                onClick={() => handleEditPreCheck(order)}
                                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <Eye className="w-4 h-4 text-slate-500" />
                                Visualizar Atendimento (Inalterável)
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleEditPreCheck(order)}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <Edit3 className="w-4 h-4" />
                                Editar / Continuar O.S.
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    </div>

                    {/* Controles de paginação inferior técnico */}
                    {techMyTotalPages > 1 && (
                      <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-500 font-medium">
                          Página <strong>{safeTechMyPage}</strong> de <strong>{techMyTotalPages}</strong>
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setTechMyOrdersPage(prev => Math.max(1, prev - 1))}
                            disabled={safeTechMyPage === 1}
                            className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Anterior
                          </button>
                          {Array.from({ length: techMyTotalPages }, (_, i) => i + 1).slice(0, 6).map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setTechMyOrdersPage(num)}
                              className={cn(
                                "w-7 h-7 rounded-lg text-xs font-black transition-all cursor-pointer",
                                safeTechMyPage === num 
                                  ? "bg-blue-600 text-white shadow-3xs" 
                                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                              )}
                            >
                              {num}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setTechMyOrdersPage(prev => Math.min(techMyTotalPages, prev + 1))}
                            disabled={safeTechMyPage === techMyTotalPages}
                            className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Próxima
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // ABA: RASCUNHOS NO APARELHO (LOCAL - NÃO GERA ID NEM VAI PRO BANCO)
              if (techActiveTab === 'drafts') {
                const filteredDrafts = techDrafts.filter(d => {
                  if (!techSearchTerm) return true;
                  const term = techSearchTerm.toLowerCase();
                  return (
                    (d.clientName && d.clientName.toLowerCase().includes(term)) ||
                    (d.addressStreet && d.addressStreet.toLowerCase().includes(term)) ||
                    (d.equipmentName && d.equipmentName.toLowerCase().includes(term)) ||
                    (d.equipmentSector && d.equipmentSector.toLowerCase().includes(term)) ||
                    (d.solution && d.solution.toLowerCase().includes(term))
                  );
                });

                if (filteredDrafts.length === 0) {
                  return (
                    <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 text-center space-y-4">
                      <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-2xl font-bold border border-amber-200/60">
                        <Save className="w-7 h-7" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Nenhum Rascunho no Aparelho</h4>
                        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                          Quando você iniciar um atendimento e clicar em "Salvar O.S como rascunho", ele ficará guardado apenas na memória do seu dispositivo sem gerar número de O.S. no banco de dados.
                        </p>
                      </div>
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleCreateNew}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all shadow-xs inline-flex items-center gap-2 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" /> Iniciar Novo Atendimento
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredDrafts.map((draft) => (
                        <div key={draft.id} className="bg-white border border-amber-200/90 rounded-2xl p-5 shadow-3xs flex flex-col justify-between gap-4">
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                              <div>
                                <span className="text-xs font-black text-amber-700 uppercase tracking-wider bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200">
                                  Rascunho no Aparelho
                                </span>
                                <div className="text-[10px] font-bold text-slate-400 mt-1 flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> Salvo em: {new Date(draft.savedAt).toLocaleString('pt-BR')}
                                </div>
                              </div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Sem ID no banco
                              </span>
                            </div>

                            <div className="space-y-1">
                              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Cliente</span>
                              <div className="text-xs font-black text-slate-800 uppercase leading-snug">
                                {draft.clientName || 'Cliente selecionado'}
                              </div>
                              <div className="text-[11px] font-bold text-slate-600 flex items-start gap-1.5 leading-tight pt-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                <span>{draft.addressStreet || 'Endereço selecionado'}</span>
                              </div>
                            </div>

                            {(draft.equipmentName || draft.equipmentSector) && (
                              <div className="bg-slate-50 border border-slate-150 rounded-xl p-2.5 flex items-center gap-2 text-[11px] font-bold text-slate-700">
                                <Wind className="w-4 h-4 text-blue-600 shrink-0" />
                                <span>{draft.equipmentName || 'Equipamento'} {draft.equipmentSector ? `• Setor: ${draft.equipmentSector}` : ''}</span>
                              </div>
                            )}

                            {draft.solution && (
                              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-2.5 text-xs text-emerald-950">
                                <span className="font-bold block text-[10px] uppercase text-emerald-800">Solução / Andamento Anotado:</span>
                                <p className="line-clamp-2 mt-0.5 font-medium">{draft.solution}</p>
                              </div>
                            )}

                            {draft.clientSignature && (
                              <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Assinatura do cliente já coletada neste rascunho
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleDeleteDraft(draft.id)}
                              className="px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                              title="Descartar rascunho sem gerar nada no banco"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Descartar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleContinueDraft(draft)}
                              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" /> Continuar Atendimento
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              // ABA 2: ORDENS DE SERVIÇO RECEBIDAS DO ADMINISTRATIVO
              const admOrders = orders.filter(o => isAdmOrderForTech(o, tId, activeName));

              const termAdmUpper = normalizeTechString(techSearchTerm);
              const filteredAdm = sortOrdersByCreationDateDesc(admOrders.filter(o => {
                if (!o) return false;
                const eqSector = normalizeTechString(o.equipmentSector || (o.equipmentId ? equipments.find(e => e.id === o.equipmentId)?.sector : ''));
                const matchesSearch = !termAdmUpper ||
                  String(o.osNumber || '').toUpperCase().includes(termAdmUpper) ||
                  String(o.id || '').toUpperCase().includes(termAdmUpper) ||
                  normalizeTechString(o.clientName).includes(termAdmUpper) ||
                  normalizeTechString(o.addressStreet).includes(termAdmUpper) ||
                  normalizeTechString(o.equipmentName).includes(termAdmUpper) ||
                  eqSector.includes(termAdmUpper) ||
                  normalizeTechString(o.description).includes(termAdmUpper);
                const matchesStatus = techStatusFilter === 'all' || o.status === techStatusFilter;
                return matchesSearch && matchesStatus;
              }));

              if (filteredAdm.length === 0) {
                return (
                  <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-xl font-bold">
                      <Inbox className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Tudo em Dia!</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Nenhuma ordem de serviço pendente de atendimento enviada pelo administrativo para a sua equipe.
                    </p>
                  </div>
                );
              }

              // Paginação para O.S. Recebidas do ADM
              const techAdmTotal = filteredAdm.length;
              const perPage = Math.max(1, Number(techAdmOrdersPerPage) || 12);
              const techAdmTotalPages = Math.max(1, Math.ceil(techAdmTotal / perPage));
              const safeTechAdmPage = Math.min(Math.max(1, Number(techAdmOrdersPage) || 1), techAdmTotalPages);
              const techAdmStartIndex = (safeTechAdmPage - 1) * perPage;
              const techAdmEndIndex = Math.min(techAdmStartIndex + perPage, techAdmTotal);
              const paginatedAdmOrders = filteredAdm.slice(techAdmStartIndex, techAdmEndIndex);

              return (
                <div className="space-y-4">
                  {/* Top bar de paginação rápida */}
                  <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-600">
                      Mostrando <strong>{techAdmStartIndex + 1}–{techAdmEndIndex}</strong> de <strong>{techAdmTotal}</strong> chamados do ADM
                    </span>
                    {Number.isFinite(techAdmTotalPages) && techAdmTotalPages > 1 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setTechAdmOrdersPage(prev => Math.max(1, prev - 1))}
                          disabled={safeTechAdmPage === 1}
                          className="p-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-black text-slate-800 text-[11px] px-1">
                          {safeTechAdmPage} / {techAdmTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setTechAdmOrdersPage(prev => Math.min(techAdmTotalPages, prev + 1))}
                          disabled={safeTechAdmPage === techAdmTotalPages}
                          className="p-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {paginatedAdmOrders.map((order, orderIdx) => {
                      if (!order) return null;
                      const orderKey = order.id ? String(order.id) : `adm_order_${orderIdx}`;
                      const orderSector = order.equipmentSector || (order.equipmentId ? equipments.find(e => e.id === order.equipmentId)?.sector : '') || '';
                      const displayOsNum = order.osNumber || (typeof order.id === 'string' && !order.id.startsWith('OS_') ? order.id : String(order.id || '00000'));

                    return (
                      <div
                        key={orderKey}
                        className="bg-white border-2 border-amber-200/80 hover:border-amber-300 rounded-2xl p-5 shadow-3xs transition-all flex flex-col justify-between gap-4"
                      >
                        <div className="space-y-3.5">
                          {/* Cabeçalho com destaque de chamado do ADM */}
                          <div className="flex items-start justify-between gap-2 border-b border-amber-100 pb-3">
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                <span className="bg-amber-100 text-amber-900 text-[9px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider inline-flex items-center gap-1">
                                  <Inbox className="w-3 h-3 text-amber-700" /> Enviada pelo ADM
                                </span>
                                {orderSector && (
                                  <span 
                                    className="bg-amber-50 text-amber-900 border border-amber-200/90 text-[9px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider inline-flex items-center gap-1" 
                                    title={`Setor: ${orderSector}`}
                                  >
                                    <Layers className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                                    <span className="truncate max-w-[130px] xs:max-w-[170px] sm:max-w-[210px]">
                                      Setor: {orderSector}
                                    </span>
                                  </span>
                                )}
                              </div>
                              <div className="text-sm font-black text-slate-900 tracking-tight">
                                SO nº {displayOsNum}
                              </div>
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {formatDateSafe(order.openedAt)}
                            </span>
                          </div>

                        {/* Dados do Cliente e Endereço */}
                        <div className="space-y-1.5">
                          <div>
                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Cliente</span>
                            <div className="text-xs font-black text-slate-800 uppercase leading-snug">
                              {order.clientName || 'Cliente não identificado'}
                            </div>
                          </div>

                          <div>
                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Endereço de Atendimento</span>
                            <div className="text-[11px] font-bold text-slate-600 flex items-start gap-1.5 leading-tight">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <span>{order.addressStreet || 'Endereço não informado'}</span>
                            </div>
                          </div>

                          {/* Equipamento */}
                          {(order.equipmentName || order.equipmentBrand || order.equipmentBtus) && (
                            <div className="bg-slate-50 border border-slate-150 rounded-xl p-2.5 flex items-center gap-2">
                              <Wind className="w-4 h-4 text-blue-600 shrink-0" />
                              <div className="text-[11px] font-bold text-slate-700 leading-tight truncate">
                                {order.equipmentName === 'OUTRO EQUIPAMENTO' || order.equipmentId === 'OUTRO EQUIPAMENTO' ? (
                                  <span className="inline-flex items-center gap-1 font-black text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-[10px] border border-amber-300">
                                    <AlertTriangle className="w-3 h-3 text-amber-700" />
                                    OUTRO EQUIPAMENTO
                                  </span>
                                ) : (
                                  <span className="font-black text-slate-900">{order.equipmentName || 'Equipamento'}</span>
                                )}
                                {order.equipmentBrand && ` • ${order.equipmentBrand}`}
                                {order.equipmentBtus && ` (${order.equipmentBtus})`}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Instruções / Solicitação do Administrativo */}
                        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 space-y-1">
                          <div className="text-[10px] font-black uppercase text-amber-800 tracking-wider flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            Instrução / Motivo do Chamado (ADM):
                          </div>
                          <p className="text-xs font-semibold text-amber-950 leading-relaxed whitespace-pre-wrap">
                            {order.description || 'Chamado para verificação e atendimento técnico.'}
                          </p>
                        </div>
                      </div>

                      {/* Ação Principal: Iniciar / Preencher O.S. */}
                      <button
                        type="button"
                        onClick={() => handleEditPreCheck(order)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-widest py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Wrench className="w-4 h-4" />
                        Iniciar Atendimento / Preencher O.S.
                      </button>
                    </div>
                  );
                })}
                    </div>

                    {/* Controles de paginação inferior ADM */}
                    {Number.isFinite(techAdmTotalPages) && techAdmTotalPages > 1 && (
                      <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-500 font-medium">
                          Página <strong>{safeTechAdmPage}</strong> de <strong>{techAdmTotalPages}</strong>
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setTechAdmOrdersPage(prev => Math.max(1, prev - 1))}
                            disabled={safeTechAdmPage === 1}
                            className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Anterior
                          </button>
                          {Array.from({ length: Math.min(6, Math.max(1, techAdmTotalPages)) }, (_, i) => i + 1).map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setTechAdmOrdersPage(num)}
                              className={cn(
                                "w-7 h-7 rounded-lg text-xs font-black transition-all cursor-pointer",
                                safeTechAdmPage === num 
                                  ? "bg-blue-600 text-white shadow-3xs" 
                                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                              )}
                            >
                              {num}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setTechAdmOrdersPage(prev => Math.min(techAdmTotalPages, prev + 1))}
                            disabled={safeTechAdmPage === techAdmTotalPages}
                            className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Próxima
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
        )
      ) : (
        activeTab === 'jetting' ? (
          <div className="bg-white rounded-2xl shadow-3xs overflow-hidden">
            <React.Suspense
              fallback={
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                  <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
                  <span className="text-xs font-bold uppercase tracking-wider">Carregando Controle de Jateamento...</span>
                </div>
              }
            >
              <JettingControlCenter onGenerateOS={handleGenerateJettingOS} onGenerateBatchOS={handleGenerateJettingOSBatch} />
            </React.Suspense>
          </div>
        ) : activeTab === 'list' ? (
          <>
            {/* Banner de Otimização de Mídia sob Demanda (Apenas Admin, quando existirem O.S. legadas com mídia inline) */}
            {userRole === UserRole.ADMIN && legacyHeavyOrdersCount > 0 && (
              <div className="bg-indigo-50/90 border border-indigo-200/80 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700 shrink-0">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-indigo-950 uppercase tracking-wide">
                      Acelerar carregamento das Ordens de Serviço ({legacyHeavyOrdersCount} O.S. pendentes de otimização)
                    </p>
                    <p className="text-[11px] font-medium text-indigo-800/90">
                      {isOptimizingMedia && optimizeProgress
                        ? `Otimizando com segurança: ${optimizeProgress.processed} de ${optimizeProgress.total} processadas (${optimizeProgress.migrated} migradas)...`
                        : 'Move fotos e assinaturas antigas para carregamento sob demanda sem perder nenhum dado, deixando a lista muito mais rápida.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOptimizeLegacyMedia}
                  disabled={isOptimizingMedia}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all shrink-0 flex items-center justify-center gap-2 shadow-2xs",
                    isOptimizingMedia
                      ? "bg-indigo-300 text-white cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer active:scale-95"
                  )}
                >
                  {isOptimizingMedia ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>
                        {optimizeProgress
                          ? `${Math.round((optimizeProgress.processed / Math.max(1, optimizeProgress.total)) * 100)}%`
                          : 'Otimizando...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5" />
                      <span>Otimizar O.S. Agora</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Filtros e Busca */}
            <div className="flex flex-col gap-3 bg-white p-4 border border-slate-200/80 rounded-2xl shadow-3xs no-print">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                {/* Busca por Número Exato da O.S. (acionada somente ao apertar Enter ou clicar em Buscar) */}
                <form onSubmit={handleExactSearchSubmit} className="flex items-center gap-1.5 md:col-span-5">
                  <div className="relative flex-1 min-w-0">
                    <input
                      type="text"
                      placeholder="Nº exato da O.S. (ex: DC979) + Enter"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all uppercase"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    {(searchTerm || activeExactSearch) && (
                      <button
                        type="button"
                        onClick={handleClearExactSearch}
                        className="p-1 text-slate-400 hover:text-rose-500 absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                        title="Limpar busca e voltar para as últimas O.S."
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={isSearchingExact}
                    className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-3xs"
                    title="Buscar O.S. pelo número exato (Enter)"
                  >
                    {isSearchingExact ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span>Buscar</span>
                  </button>
                </form>

                {/* Filtro de Status */}
                <div className="flex items-center gap-2 md:col-span-7 min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 shrink-0">Status:</span>
                  <div className="flex-1 flex flex-wrap items-center p-1 bg-slate-100 rounded-xl border border-slate-200/40 gap-1">
                    {['all', 'aberta', 'em_andamento', 'pre_finalizada', 'finalizada', 'cancelada'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        className={cn(
                          "px-2.5 py-1.5 text-[10px] font-black rounded-lg transition-all uppercase tracking-wide leading-none cursor-pointer whitespace-nowrap",
                          statusFilter === st 
                            ? "bg-white text-slate-800 shadow-3xs" 
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        {st === 'all' ? 'Todos' : getStatusLabel(st)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">

            {/* Filtro de Período */}
            <div className="flex items-center gap-2 md:col-span-6">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 shrink-0">Período:</span>
              <div className="flex items-center gap-1.5 w-full">
                <input
                  type="date"
                  value={startDateFilter}
                  onChange={(e) => setStartDateFilter(e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                />
                <span className="text-[10px] text-slate-400 font-black uppercase shrink-0">a</span>
                <input
                  type="date"
                  value={endDateFilter}
                  onChange={(e) => setEndDateFilter(e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                />
                {(startDateFilter || endDateFilter) && (
                  <button 
                    onClick={() => { setStartDateFilter(''); setEndDateFilter(''); }}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0 cursor-pointer"
                    title="Limpar período"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Botão Filtro de Oficina (reduzido pela metade) + Botão de Impressão em Lote + Atualizar */}
            <div className="flex items-center justify-end gap-2 md:col-span-6">
              <button
                type="button"
                onClick={() => setWorkshopOnlyFilter(prev => !prev)}
                className={cn(
                  "flex-1 min-w-0 py-2 px-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-between border cursor-pointer shadow-3xs",
                  workshopOnlyFilter
                    ? "bg-purple-600 text-white border-purple-700 shadow-purple-500/25 ring-2 ring-purple-400/30"
                    : "bg-slate-50 hover:bg-purple-50/60 text-slate-700 border-slate-200 hover:border-purple-200"
                )}
                title={workshopOnlyFilter ? "Clique para desativar filtro de Oficina" : "Filtrar apenas O.S. que estão com Oficina ativa"}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Wrench className={cn("w-3.5 h-3.5 shrink-0", workshopOnlyFilter ? "text-amber-300" : "text-purple-600")} />
                  <span className="truncate">Apenas Oficina</span>
                </div>
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-[9px] font-black shrink-0 ml-1 leading-none transition-all",
                  workshopOnlyFilter
                    ? "bg-amber-400 text-slate-950 shadow-2xs"
                    : totalWorkshopOrders > 0
                      ? "bg-purple-100 text-purple-900 border border-purple-200"
                      : "bg-slate-200 text-slate-600"
                )}>
                  {totalWorkshopOrders}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenBatchPrintModal('manual')}
                className="flex-1 min-w-0 py-2 px-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border border-blue-200 bg-blue-50/80 hover:bg-blue-600 text-blue-700 hover:text-white cursor-pointer shadow-3xs"
                title="Digitar números de O.S. com Enter e imprimir todas de uma só vez em um arquivo único"
              >
                <Printer className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Impressão em Lote</span>
              </button>

              <button
                type="button"
                onClick={() => loadData(true)}
                disabled={loading || isRefreshing}
                className="py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 text-slate-700 hover:text-blue-700 disabled:opacity-50 cursor-pointer shrink-0 shadow-3xs"
                title="Recarregar Ordens de Serviço diretamente do servidor"
              >
                <RotateCcw className={cn("w-3.5 h-3.5", (loading || isRefreshing) && "animate-spin")} />
                <span className="hidden sm:inline">{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
              </button>
            </div>
              </div>
          </div>

          {loadError && orders.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 no-print">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{loadError}</span>
              </div>
              <button
                type="button"
                onClick={() => loadData(true)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black uppercase tracking-wider rounded-lg cursor-pointer"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {activeExactSearch && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 no-print">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
                <Search className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Busca exata pelo número <strong className="uppercase">#{activeExactSearch.replace(/^#+/, '')}</strong>
                  {!isSearchingExact && ` — ${filteredOrders.length} resultado(s)`}
                </span>
              </div>
              <button
                type="button"
                onClick={handleClearExactSearch}
                className="px-3 py-1 bg-white hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-black uppercase tracking-wider rounded-lg cursor-pointer transition-all"
              >
                Voltar para as últimas O.S.
              </button>
            </div>
          )}

          {/* Lista de OS */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-3xs overflow-hidden no-print">
            {(loading && orders.length === 0) || isSearchingExact ? (
              <div className="p-12 text-center space-y-3">
                <Loader2 className="w-7 h-7 text-blue-600 animate-spin mx-auto" />
                <p className="text-slate-500 font-bold uppercase tracking-wider text-xs">
                  {isSearchingExact
                    ? `Buscando O.S. #${activeExactSearch.replace(/^#+/, '')}...`
                    : `Carregando as últimas ${itemsPerPage} Ordens de Serviço...`}
                </p>
              </div>
            ) : loadError && orders.length === 0 ? (
              <div className="p-10 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-black text-slate-800 uppercase tracking-wider">
                    Não foi possível carregar as Ordens de Serviço
                  </p>
                  <p className="text-xs text-slate-500 max-w-lg mx-auto">
                    {loadError}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loadData(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  Tentar Novamente
                </button>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <p className="text-slate-400 font-bold uppercase tracking-wider text-xs">
                  {activeExactSearch
                    ? `Nenhuma Ordem de Serviço encontrada com o número exato "${activeExactSearch}".`
                    : 'Nenhuma Ordem de Serviço encontrada.'}
                </p>
                {activeExactSearch ? (
                  <button
                    type="button"
                    onClick={handleClearExactSearch}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    Limpar busca e exibir últimas O.S.
                  </button>
                ) : orders.length === 0 && (
                  <button
                    type="button"
                    onClick={() => loadData(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Recarregar do Servidor
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Barra Superior de Resumo e Seleção de Itens por Página */}
                <div className="bg-slate-50/80 px-5 py-3 border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <span>Mostrando</span>
                    <span className="font-black text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-3xs">
                      {filteredOrders.length === 0 ? '0' : `${startIndex + 1} - ${endIndex}`}
                    </span>
                    <span>de</span>
                    <span className="font-black text-slate-800">{totalFilteredOrders}</span>
                    <span>ordens de serviço</span>
                    {isServerCursorMode && (
                      <span className="text-[10px] text-slate-400 font-medium ml-1">
                        (carregamento sob demanda por página)
                      </span>
                    )}
                    {(loading || isRefreshing || isLoadingPage) && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 ml-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {isLoadingPage ? 'Carregando página...' : 'Sincronizando...'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Por página:</span>
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-3xs">
                        {[10, 25, 50, 100].map((size) => (
                          <button
                            key={size}
                            type="button"
                            onClick={() => setItemsPerPage(size)}
                            disabled={isLoadingPage}
                            className={cn(
                              "px-2 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer disabled:opacity-50",
                              itemsPerPage === size
                                ? "bg-blue-600 text-white shadow-3xs"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                            )}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>

                    {(totalPages > 1 || (isServerCursorMode && (safeCurrentPage > 1 || hasMorePages))) && (
                      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-3xs">
                        <button
                          type="button"
                          onClick={() => goToListPage(Math.max(1, safeCurrentPage - 1))}
                          disabled={safeCurrentPage === 1 || isLoadingPage}
                          className="p-1 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                          title="Página Anterior"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[11px] font-black text-slate-800 px-1.5">
                          {safeCurrentPage} / {totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => goToListPage(safeCurrentPage + 1)}
                          disabled={isLoadingPage || (isServerCursorMode ? (!hasMorePages && safeCurrentPage >= loadedPagesCount) : safeCurrentPage === totalPages)}
                          className="p-1 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                          title="Próxima Página"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        <th className="px-5 py-3">Nº O.S.</th>
                        <th className="px-5 py-3">Cliente / Endereço</th>
                        <th className="px-5 py-3">Equipamento</th>
                        <th className="px-5 py-3">Tipo / Abertura</th>
                        <th className="px-5 py-3 text-center">Status</th>
                        <th className="px-5 py-3 text-right">Valor Total</th>
                        <th className="px-5 py-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {paginatedOrders.map((o) => (
                        <tr key={o.id} className={cn("transition-colors", o.isWorkshop ? "bg-purple-50/35 hover:bg-purple-50/65 border-l-4 border-l-purple-600" : "hover:bg-slate-50/50")}>
                          <td className="px-5 py-4 font-black text-slate-700">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>#{o.osNumber || (o.id && !o.id.startsWith('OS_') ? o.id : '00000')}</span>
                              {o.isWorkshop && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-purple-100 text-purple-900 border border-purple-200/80 shadow-2xs" title="Equipamento recolhido para conserto na Oficina">
                                  <Wrench className="w-3 h-3 text-purple-700" />
                                  OFICINA
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-extrabold text-slate-800">{o.clientName}</div>
                            <div className="text-[10px] text-slate-400 font-semibold truncate max-w-xs">{o.addressStreet}</div>
                          </td>
                          <td className="px-5 py-4">
                            {o.equipmentName ? (
                              o.equipmentName === 'OUTRO EQUIPAMENTO' || o.equipmentId === 'OUTRO EQUIPAMENTO' ? (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50/90 text-amber-800 border border-amber-200/70 shadow-3xs transition-all hover:bg-amber-100/80 cursor-help" title="Vincular máquina no fechamento da O.S.">
                                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>Outro Equipamento</span>
                                </div>
                              ) : (
                                <div>
                                  <div className="font-bold text-slate-700">{o.equipmentName}</div>
                                  <div className="text-[9px] text-slate-400 font-black uppercase tracking-wider">{o.equipmentBrand} - {o.equipmentBtus} BTUs</div>
                                </div>
                              )
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Geral / Não Especificado</span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-600">{o.type}</div>
                            <div className="text-[9px] text-slate-400 font-bold">
                              {o.openedAt ? new Date(o.openedAt).toLocaleDateString('pt-BR') : 'Sem data'}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className={cn(
                              "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-full",
                              o.status === 'aberta' ? "bg-blue-50 text-blue-600 border border-blue-100" :
                              o.status === 'em_andamento' ? "bg-amber-50 text-amber-600 border border-amber-100" :
                              o.status === 'pre_finalizada' ? "bg-teal-50 text-teal-600 border border-teal-100" :
                              o.status === 'finalizada' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                              "bg-rose-50 text-rose-600 border border-rose-100"
                            )}>
                              {getStatusLabel(o.status)}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right font-black text-slate-800">
                            R$ {o.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {(() => {
                                const isSigned = Boolean(
                                  o.hasClientSignature ||
                                  (o.clientSignature && String(o.clientSignature).trim().length > 10) ||
                                  o.clientSignatureDate ||
                                  o.techFinalized ||
                                  o.adminFinalized
                                );

                                return isSigned ? (
                                  <div
                                    className="p-1.5 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-center shadow-2xs"
                                    title="Ordem de Serviço Assinada pelo Cliente (Atendimento Executado)"
                                  >
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                                  </div>
                                ) : (
                                  <div
                                    className="p-1.5 text-slate-300 bg-slate-50 border border-slate-200/60 rounded-lg flex items-center justify-center"
                                    title="Aguardando Assinatura do Cliente"
                                  >
                                    <CheckCircle2 className="w-4 h-4 text-slate-300 opacity-60" />
                                  </div>
                                );
                              })()}
                              <button
                                onClick={() => handlePrint(o)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 rounded-lg transition-all cursor-pointer"
                                title="Imprimir OS"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleEditPreCheck(o)}
                                className="p-1.5 text-amber-600 hover:bg-amber-50 border border-transparent hover:border-amber-100 rounded-lg transition-all cursor-pointer"
                                title={o.status === 'cancelada' ? "Visualizar O.S. Cancelada" : "Editar OS"}
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              {o.status === 'cancelada' ? (
                                userRole === UserRole.ADMIN ? (
                                  <button
                                    onClick={() => handleReopen(o.id)}
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 rounded-lg transition-all cursor-pointer"
                                    title="Reabrir O.S. (Administrador)"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <button
                                    disabled
                                    className="p-1.5 text-slate-300 border border-transparent rounded-lg cursor-not-allowed"
                                    title="O.S. Cancelada (Reabertura somente por Administrador)"
                                  >
                                    <Ban className="w-4 h-4" />
                                  </button>
                                )
                              ) : (
                                <button
                                  onClick={() => handleCancel(o.id)}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg transition-all cursor-pointer"
                                  title="Cancelar OS"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Barra Inferior de Paginação Completa */}
                <div className="bg-slate-50/90 px-5 py-3.5 border-t border-slate-200/70 flex flex-col md:flex-row items-center justify-between gap-4">
                  {/* Detalhes de registros exibidos */}
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <span>Página</span>
                    <span className="font-black text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-3xs">{safeCurrentPage}</span>
                    <span>de</span>
                    <span className="font-black text-slate-800">{totalPages}</span>
                    <span className="text-slate-300 mx-1">•</span>
                    <span>Exibindo <strong>{startIndex + 1}–{endIndex}</strong> de <strong>{totalFilteredOrders}</strong> O.S.</span>
                  </div>

                  {/* Controles de Navegação de Página */}
                  <div className="flex items-center flex-wrap justify-center gap-1">
                    {/* Botão Primeira Página */}
                    <button
                      type="button"
                      onClick={() => goToListPage(1)}
                      disabled={safeCurrentPage === 1 || isLoadingPage}
                      className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-3xs"
                      title="Primeira Página"
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </button>

                    {/* Botão Página Anterior */}
                    <button
                      type="button"
                      onClick={() => goToListPage(Math.max(1, safeCurrentPage - 1))}
                      disabled={safeCurrentPage === 1 || isLoadingPage}
                      className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-3xs"
                      title="Página Anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    {/* Botões de Números de Página */}
                    {isServerCursorMode ? (
                      Array.from(
                        { length: Math.min(totalPages, Math.max(loadedPagesCount + (hasMorePages ? 1 : 0), safeCurrentPage)) },
                        (_, idx) => idx + 1
                      ).map((pageNum) => {
                        const isActive = pageNum === safeCurrentPage;
                        const isLoaded = Boolean(pagesCacheRef.current[pageNum]);
                        return (
                          <button
                            key={`page-${pageNum}`}
                            type="button"
                            onClick={() => goToListPage(pageNum)}
                            disabled={isLoadingPage}
                            title={isLoaded ? `Página ${pageNum} (em cache)` : `Carregar página ${pageNum} sob demanda`}
                            className={cn(
                              "min-w-[32px] h-8 px-2 text-xs font-black rounded-lg transition-all cursor-pointer flex items-center justify-center disabled:opacity-50",
                              isActive
                                ? "bg-blue-600 text-white shadow-3xs"
                                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 shadow-3xs"
                            )}
                          >
                            {pageNum}
                          </button>
                        );
                      })
                    ) : (
                      getPaginationRange(safeCurrentPage, totalPages).map((p, idx) => {
                        if (p === 'DOTS') {
                          return (
                            <span key={`dots-${idx}`} className="px-2 py-1 text-slate-400 font-black text-xs select-none">
                              ...
                            </span>
                          );
                        }
                        const pageNum = Number(p);
                        const isActive = pageNum === safeCurrentPage;
                        return (
                          <button
                            key={`page-${pageNum}`}
                            type="button"
                            onClick={() => goToListPage(pageNum)}
                            disabled={isLoadingPage}
                            className={cn(
                              "min-w-[32px] h-8 px-2 text-xs font-black rounded-lg transition-all cursor-pointer flex items-center justify-center disabled:opacity-50",
                              isActive
                                ? "bg-blue-600 text-white shadow-3xs"
                                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 shadow-3xs"
                            )}
                          >
                            {pageNum}
                          </button>
                        );
                      })
                    )}

                    {/* Botão Próxima Página */}
                    <button
                      type="button"
                      onClick={() => goToListPage(safeCurrentPage + 1)}
                      disabled={isLoadingPage || (isServerCursorMode ? (!hasMorePages && safeCurrentPage >= loadedPagesCount) : safeCurrentPage === totalPages)}
                      className="px-2.5 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-3xs flex items-center gap-1 text-xs font-bold"
                      title="Próxima Página"
                    >
                      {isLoadingPage ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" /> : <ChevronRight className="w-4 h-4" />}
                    </button>

                    {/* Botão Última Página (apenas no modo de lista filtrada em memória, para evitar leitura de todas as páginas de uma vez no modo sob demanda) */}
                    {!isServerCursorMode && (
                      <button
                        type="button"
                        onClick={() => goToListPage(totalPages)}
                        disabled={safeCurrentPage === totalPages || isLoadingPage}
                        className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-3xs"
                        title="Última Página"
                      >
                        <ChevronsRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Atalho para ir direto a uma página (apenas quando a lista filtrada já está em memória) */}
                  {!isServerCursorMode && totalPages > 3 && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="text-[11px] font-bold text-slate-400">Ir para:</span>
                      <input
                        type="number"
                        min={1}
                        max={totalPages}
                        value={jumpPageInput}
                        onChange={(e) => setJumpPageInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleJumpPage();
                        }}
                        placeholder={String(safeCurrentPage)}
                        className="w-12 px-1.5 py-1 text-center font-bold bg-white border border-slate-200 rounded-lg text-slate-700 text-xs focus:ring-1 focus:ring-blue-500 outline-none shadow-3xs"
                      />
                      <button
                        type="button"
                        onClick={handleJumpPage}
                        className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-lg text-xs transition-colors cursor-pointer shadow-3xs"
                      >
                        Ir
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          {/* RELATÓRIO AVANÇADO DE O.S. (CARREGAMENTO SOB DEMANDA POR FILTROS + ENTER) */}
          <form
            onSubmit={handleExecuteReportSearch}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
                e.preventDefault();
                handleExecuteReportSearch();
              }
            }}
            className="bg-white p-5 border border-slate-200/80 rounded-2xl shadow-3xs space-y-4 no-print"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Filtros do Relatório de O.S.</h3>
                <span className="text-[10px] font-semibold text-slate-400">
                  (Defina os filtros e pressione Enter para buscar)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {(hasAnyReportFilterSelected || reportHasSearched) && (
                  <button
                    type="button"
                    onClick={handleClearReportFilters}
                    disabled={reportLoading}
                    className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 border border-slate-200 rounded-lg transition-all cursor-pointer"
                  >
                    Limpar Filtros
                  </button>
                )}
                <button
                  type="submit"
                  disabled={reportLoading}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-3xs"
                >
                  {reportLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>{reportLoading ? 'Buscando...' : 'Buscar Relatório (Enter)'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              {/* Período De */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Período De</label>
                <input
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => { setReportStartDate(e.target.value); setReportError(null); if (reportHasSearched) setReportFiltersDirty(true); }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                />
              </div>

              {/* Período Até */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Período Até</label>
                <input
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => { setReportEndDate(e.target.value); setReportError(null); if (reportHasSearched) setReportFiltersDirty(true); }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                />
              </div>

              {/* Cliente */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Cliente</label>
                <select
                  value={reportClientId}
                  onChange={(e) => {
                    const nextClientId = e.target.value;
                    setReportClientId(nextClientId);
                    if (reportAddressId !== 'all' && nextClientId !== 'all') {
                      const currentAddr = addresses.find(a => a.id === reportAddressId);
                      if (currentAddr && currentAddr.clientId !== nextClientId) {
                        setReportAddressId('all');
                        setReportAddressQuery('');
                      }
                    }
                    setReportError(null);
                    if (reportHasSearched) setReportFiltersDirty(true);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                >
                  <option value="all">TODOS OS CLIENTES</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Endereço do Cliente (Busca + Seleção) */}
              <div className="relative" ref={reportAddressDropdownRef}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Endereço</label>
                  {reportAddressId !== 'all' && (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-1.5 rounded-full">
                      Selecionado
                    </span>
                  )}
                </div>
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    value={reportAddressQuery}
                    placeholder={
                      reportClientId !== 'all'
                        ? 'Buscar endereço do cliente...'
                        : 'Todos os endereços (digite p/ buscar)'
                    }
                    onFocus={() => setIsReportAddressDropdownOpen(true)}
                    onClick={() => setIsReportAddressDropdownOpen(true)}
                    onChange={(e) => {
                      setReportAddressQuery(e.target.value);
                      if (reportAddressId !== 'all') {
                        setReportAddressId('all');
                      }
                      setIsReportAddressDropdownOpen(true);
                      setReportError(null);
                      if (reportHasSearched) setReportFiltersDirty(true);
                    }}
                    className={cn(
                      "w-full border rounded-xl py-2 pl-8 pr-12 text-xs font-semibold outline-none transition-all",
                      reportAddressId !== 'all'
                        ? "bg-emerald-50/40 border-emerald-300 text-slate-800 focus:ring-2 focus:ring-emerald-500/15"
                        : "bg-slate-50 border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                    )}
                  />
                  <div className="absolute right-1.5 flex items-center gap-0.5">
                    {(reportAddressId !== 'all' || reportAddressQuery) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReportAddressId('all');
                          setReportAddressQuery('');
                          setReportError(null);
                          if (reportHasSearched) setReportFiltersDirty(true);
                        }}
                        title="Limpar filtro de endereço"
                        className="p-1 text-slate-400 hover:text-rose-500 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsReportAddressDropdownOpen(prev => !prev)}
                      title="Exibir lista de endereços"
                      className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors cursor-pointer"
                    >
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isReportAddressDropdownOpen ? "rotate-180" : "")} />
                    </button>
                  </div>
                </div>

                {isReportAddressDropdownOpen && (
                  <div className="absolute z-40 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setReportAddressId('all');
                        setReportAddressQuery('');
                        setIsReportAddressDropdownOpen(false);
                        setReportError(null);
                        if (reportHasSearched) setReportFiltersDirty(true);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-xs font-bold hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer",
                        reportAddressId === 'all' && !reportAddressQuery ? "text-blue-700 bg-blue-50/50" : "text-slate-600"
                      )}
                    >
                      TODOS OS ENDEREÇOS
                    </button>

                    {filteredReportAddressOptions.length === 0 ? (
                      <div className="px-3 py-3 text-[11px] text-slate-400 font-medium text-center">
                        Nenhum endereço cadastrado encontrado. Pressione Enter para buscar pelo texto digitado.
                      </div>
                    ) : (
                      filteredReportAddressOptions.map(addr => {
                        const addrClientName = reportClientId === 'all'
                          ? (clients.find(c => c.id === addr.clientId)?.name || '')
                          : '';
                        const addrLabel = `${addr.street}${addr.number ? `, ${addr.number}` : ''}${addr.name ? ` (${addr.name})` : ''}`;
                        const isSelected = reportAddressId === addr.id;
                        return (
                          <button
                            key={addr.id}
                            type="button"
                            onClick={() => {
                              setReportAddressId(addr.id);
                              setReportAddressQuery(addrLabel);
                              setIsReportAddressDropdownOpen(false);
                              setReportError(null);
                              if (reportHasSearched) setReportFiltersDirty(true);
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2 hover:bg-blue-50/70 transition-colors border-b border-slate-100/70 last:border-b-0 cursor-pointer",
                              isSelected ? "bg-emerald-50/70" : ""
                            )}
                          >
                            <div className="text-[11px] font-bold text-slate-800 leading-snug">
                              {addrLabel}
                            </div>
                            {(addr.neighborhood || addrClientName) && (
                              <div className="text-[10px] text-slate-500 font-medium truncate">
                                {[addr.neighborhood, addrClientName].filter(Boolean).join(' • ')}
                              </div>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Técnico */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Técnico</label>
                <select
                  value={reportTechnicianId}
                  onChange={(e) => { setReportTechnicianId(e.target.value); setReportError(null); if (reportHasSearched) setReportFiltersDirty(true); }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all uppercase"
                >
                  <option value="all">TODOS OS TÉCNICOS</option>
                  {techIndex.indexedTechs.map(it => (
                    <option key={it.id} value={it.originalId}>[{it.indexedCode}] {it.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 pt-1">
              {/* Status */}
              <div className="lg:col-span-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Status</label>
                <select
                  value={reportStatus}
                  onChange={(e) => { setReportStatus(e.target.value); setReportError(null); if (reportHasSearched) setReportFiltersDirty(true); }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                >
                  <option value="all">TODOS OS STATUS</option>
                  <option value="aberta">ABERTA</option>
                  <option value="em_andamento">EM ANDAMENTO</option>
                  <option value="pre_finalizada">PRÉ-FINALIZADA</option>
                  <option value="finalizada">FINALIZADA</option>
                  <option value="cancelada">CANCELADA</option>
                </select>
              </div>

              {/* Empresa Prestadora */}
              <div className="lg:col-span-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Empresa Prestadora</label>
                <select
                  value={reportCompany}
                  onChange={(e) => { setReportCompany(e.target.value); setReportError(null); if (reportHasSearched) setReportFiltersDirty(true); }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                >
                  <option value="all">TODAS</option>
                  {osSettings?.companies.map(c => (
                    <option key={c.id} value={c.id}>{c.shortName}</option>
                  )) || (
                    <>
                      <option value="lefrio">JR Comercio e Servicos (Le Frio)</option>
                      <option value="alclima">Al Clima Refrigeração</option>
                    </>
                  )}
                </select>
              </div>

              {/* Tipo de Manutenção */}
              <div className="lg:col-span-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Tipo de Manutenção</label>
                <select
                  value={reportType}
                  onChange={(e) => { setReportType(e.target.value); setReportError(null); if (reportHasSearched) setReportFiltersDirty(true); }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                >
                  <option value="all">TODOS OS TIPOS</option>
                  {osSettings?.maintenanceTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  )) || (
                    <>
                      <option value="MANUTENCAO CORRETIVA CONTRATO">Manutenção Corretiva Contrato</option>
                      <option value="MANUTENCAO PREVENTIVA">Manutenção Preventiva</option>
                      <option value="JATEAMENTO">Jateamento</option>
                      <option value="INSTALACAO">Instalação / Start-up</option>
                      <option value="AVALIAÇÃO TÉCNICA">Avaliação Técnica</option>
                    </>
                  )}
                </select>
              </div>

              {/* Filtro de Oficina com Indicador */}
              <div className="lg:col-span-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Oficina</label>
                  <span className="text-[9px] font-black text-purple-700 bg-purple-50 border border-purple-200/70 px-1.5 py-0.2 rounded-full">
                    {totalWorkshopOrders} no sistema
                  </span>
                </div>
                <select
                  value={reportWorkshopFilter}
                  onChange={(e) => { setReportWorkshopFilter(e.target.value as any); setReportError(null); if (reportHasSearched) setReportFiltersDirty(true); }}
                  className={cn(
                    "w-full border rounded-xl py-2 px-3 text-xs font-bold outline-none focus:ring-2 transition-all",
                    reportWorkshopFilter === 'workshop_only'
                      ? "bg-purple-50/70 border-purple-400 text-purple-900 focus:ring-purple-500/20"
                      : "bg-slate-50 border-slate-200 text-slate-700 focus:ring-blue-500/10 focus:border-blue-500"
                  )}
                >
                  <option value="all">TODAS (OFICINA E CAMPO)</option>
                  <option value="workshop_only">APENAS EM OFICINA ({totalWorkshopOrders})</option>
                  <option value="standard_only">APENAS SEM OFICINA</option>
                </select>
              </div>

              {/* Botões de Ação do Relatório */}
              <div className="sm:col-span-2 lg:col-span-3 flex items-end gap-1.5">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={reportFilteredOrders.length === 0}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-[10px] font-black uppercase tracking-wider py-2 px-2.5 rounded-xl transition-all border border-slate-200 flex items-center justify-center gap-1.5 h-[38px] cursor-pointer"
                  title="Exportar listagem para planilha CSV"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="truncate">CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsReportPrintOpen(true)}
                  disabled={reportFilteredOrders.length === 0}
                  className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-black uppercase tracking-wider py-2 px-2.5 rounded-xl transition-all border border-blue-200/50 flex items-center justify-center gap-1.5 h-[38px] cursor-pointer"
                  title="Imprimir resumo consolidado do relatório"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Resumo</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenBatchPrintModal('report')}
                  disabled={reportFilteredOrders.length === 0}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-black uppercase tracking-wider py-2 px-2.5 rounded-xl transition-all border border-indigo-700 flex items-center justify-center gap-1.5 h-[38px] cursor-pointer shadow-3xs"
                  title="Abrir modal com as O.S. deste relatório preenchidas para selecionar/desmarcar e imprimir em lote em arquivo único"
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Imprimir em Lote</span>
                </button>
              </div>
            </div>

            {reportError && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{reportError}</span>
              </div>
            )}

            {reportHasSearched && reportFiltersDirty && !reportLoading && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 flex items-center justify-between gap-2 text-xs font-bold text-blue-900">
                <span>Filtros alterados. Pressione Enter ou clique em "Buscar Relatório" para atualizar os dados.</span>
                <button
                  type="submit"
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-wider rounded-lg cursor-pointer shrink-0"
                >
                  Atualizar Agora
                </button>
              </div>
            )}

            {/* Campo de Observações Gerais para o Relatório Impresso */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Observações Gerais (sairá impresso no relatório)
                </label>
                {reportGeneralNotes && (
                  <button
                    type="button"
                    onClick={() => setReportGeneralNotes('')}
                    className="text-[9px] text-red-500 hover:underline cursor-pointer lowercase"
                  >
                    limpar observações
                  </button>
                )}
              </div>
              <textarea
                value={reportGeneralNotes}
                onChange={(e) => setReportGeneralNotes(e.target.value)}
                placeholder="Insira anotações, recomendações técnicas, escopo atendido ou observações gerais que devem constar no relatório impresso..."
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all resize-y placeholder:text-slate-400"
              />
            </div>
          </form>

          {reportLoading ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-14 text-center space-y-3 shadow-3xs no-print">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
              <p className="text-xs font-black uppercase tracking-wider text-slate-600">
                Buscando Ordens de Serviço conforme os filtros definidos...
              </p>
            </div>
          ) : !reportHasSearched ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center space-y-3 shadow-3xs no-print">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100">
                <Filter className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <p className="text-sm font-black uppercase tracking-wider text-slate-700">
                  Defina os filtros para gerar o relatório
                </p>
                <p className="text-xs text-slate-500 font-medium">
                  Para manter o sistema rápido e leve, nenhuma O.S. é carregada automaticamente. Selecione um ou mais filtros acima (Período, Cliente, Técnico, Status, Prestadora, Tipo ou Oficina) e pressione <strong>Enter</strong> ou clique em <strong>Buscar Relatório</strong>.
                </p>
              </div>
            </div>
          ) : (
            <>
          {/* Indicadores do Relatório */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 no-print">
            {/* Total de OS */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-3xs flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block truncate">Total O.S. Filtradas</span>
                <span className="text-xl font-extrabold text-slate-800 leading-none">{reportFilteredOrders.length}</span>
              </div>
            </div>

            {/* O.S. na Oficina (Indicador Imediato) */}
            <div
              onClick={() => {
                const nextWorkshop = reportWorkshopFilter === 'workshop_only' ? 'all' : 'workshop_only';
                setReportWorkshopFilter(nextWorkshop);
                handleExecuteReportSearch(undefined, { workshopFilter: nextWorkshop });
              }}
              className={cn(
                "border p-5 rounded-2xl shadow-3xs flex items-center gap-4 transition-all cursor-pointer group",
                reportAppliedFilters.workshopFilter === 'workshop_only'
                  ? "bg-purple-50/80 border-purple-400 ring-2 ring-purple-400/20"
                  : "bg-white border-slate-200/80 hover:border-purple-200 hover:bg-purple-50/30"
              )}
              title={reportAppliedFilters.workshopFilter === 'workshop_only' ? "Filtro ativo: exibindo apenas O.S. em Oficina. Clique para ver todas." : "Clique para filtrar apenas O.S. em Oficina"}
            >
              <div className={cn(
                "p-3 rounded-xl shrink-0 transition-colors",
                reportAppliedFilters.workshopFilter === 'workshop_only' ? "bg-purple-600 text-white" : "bg-purple-100 text-purple-700 group-hover:bg-purple-600 group-hover:text-white"
              )}>
                <Wrench className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block truncate">Em Oficina</span>
                  {reportAppliedFilters.workshopFilter === 'workshop_only' && (
                    <span className="text-[8px] font-black uppercase bg-purple-200 text-purple-900 px-1.5 py-0.2 rounded-full">Ativo</span>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-extrabold text-purple-900 leading-none">
                    {reportFilteredWorkshopCount}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold">
                    de {totalWorkshopOrders} no sistema
                  </span>
                </div>
              </div>
            </div>

            {/* Faturamento Total */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-3xs flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                <DollarSign className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block truncate">Valor Faturado</span>
                <span className="text-xl font-extrabold text-slate-800 leading-none truncate block">
                  R$ {reportFilteredOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Ticket Médio */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-3xs flex items-center gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block truncate">Ticket Médio por O.S.</span>
                <span className="text-xl font-extrabold text-slate-800 leading-none truncate block">
                  R$ {(reportFilteredOrders.length ? (reportFilteredOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0) / reportFilteredOrders.length) : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Divisão Serviços / Produtos */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-3xs flex items-center gap-4">
              <div className="p-3 bg-teal-50 text-teal-600 rounded-xl shrink-0">
                <Receipt className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block truncate">Serviços vs Produtos</span>
                <div className="text-[10px] text-slate-700 font-bold mt-1 truncate">
                  Serv: <span className="text-blue-600">R$ {reportFilteredOrders.reduce((sum, o) => sum + (o.services ? o.services.reduce((sSum, s) => sSum + (s.totalValue || 0), 0) : 0), 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="text-[10px] text-slate-700 font-bold truncate">
                  Prod: <span className="text-teal-600">R$ {reportFilteredOrders.reduce((sum, o) => sum + (o.products ? o.products.reduce((pSum, p) => pSum + (p.totalValue || 0), 0) : 0), 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Gráficos Recharts */}
          {reportFilteredOrders.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 no-print">
              {/* Gráfico 1: Faturamento por Cliente */}
              <div className="bg-white p-5 border border-slate-200/80 rounded-2xl shadow-3xs space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <BarChart2 className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Top 5 Clientes por Faturamento</h3>
                </div>
                <div className="h-64 text-xs">
                  {clientChartData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-400 font-bold uppercase tracking-wider">Sem dados para exibir</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={clientChartData} margin={{ top: 10, right: 10, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} fontStyle="bold" tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={9} fontStyle="bold" tickLine={false} tickFormatter={(v) => `R$ ${v}`} />
                        <Tooltip formatter={(value) => [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Faturamento']} />
                        <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={45} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Gráfico 2: Quantidade por Status */}
              <div className="bg-white p-5 border border-slate-200/80 rounded-2xl shadow-3xs space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <PieChartIcon className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Distribuição por Status</h3>
                </div>
                <div className="h-64 text-xs flex flex-col sm:flex-row items-center justify-center gap-6">
                  {statusChartData.length === 0 ? (
                    <div className="flex items-center justify-center text-slate-400 font-bold uppercase tracking-wider">Sem dados para exibir</div>
                  ) : (
                    <>
                      <div className="w-full sm:w-1/2 h-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={statusChartData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {statusChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => [value, 'Quantidade']} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="w-full sm:w-1/2 space-y-2">
                        {statusChartData.map((st, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: st.fill }} />
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">{st.name}</span>
                            </div>
                            <span className="text-xs font-extrabold text-slate-800">{st.value} OS</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tabela de Resultados no Relatório (Paginada e com lookup O(1) de Técnico) */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-3xs overflow-hidden no-print">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Ordens de Serviço Filtradas</h3>
                <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  {totalReportOrders} Resultados
                </span>
                {totalReportOrders > 0 && (
                  <button
                    type="button"
                    onClick={() => handleOpenBatchPrintModal('report')}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-3xs"
                    title="Selecionar ou desmarcar as O.S. filtradas para impressão em lote em arquivo único"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Impressão em Lote ({totalReportOrders} O.S.)</span>
                  </button>
                )}
              </div>
              {totalReportOrders > 0 && (
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="font-semibold">
                    Mostrando <strong className="text-slate-800">{reportStartIndex + 1} - {reportEndIndex}</strong> de <strong className="text-slate-800">{totalReportOrders}</strong>
                  </span>
                  <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-3xs">
                    {[25, 50, 100].map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setReportItemsPerPage(size)}
                        className={cn(
                          "px-2 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer",
                          reportItemsPerPage === size
                            ? "bg-blue-600 text-white shadow-3xs"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {reportFilteredOrders.length === 0 ? (
              <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-wider text-xs">
                Nenhuma O.S. atende aos filtros definidos.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto text-xs">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        <th className="px-5 py-3">O.S.</th>
                        <th className="px-5 py-3">Cliente</th>
                        <th className="px-5 py-3">Data</th>
                        <th className="px-5 py-3">Técnico</th>
                        <th className="px-5 py-3">Prestadora</th>
                        <th className="px-5 py-3 text-center">Status</th>
                        <th className="px-5 py-3 text-right">Total</th>
                        <th className="px-5 py-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedReportOrders.map((o) => {
                        const techDisplay = resolveOrderTechnicianDisplay(o, '---');
                        return (
                          <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3.5 font-black text-slate-700">
                              #{o.osNumber || (o.id && !o.id.startsWith('OS_') ? o.id : '00000')}
                            </td>
                            <td className="px-5 py-3.5 font-extrabold text-slate-800">{o.clientName}</td>
                            <td className="px-5 py-3.5 text-slate-500 font-semibold">
                              {o.openedAt ? new Date(o.openedAt).toLocaleDateString('pt-BR') : '---'}
                            </td>
                            <td className="px-5 py-3.5 text-slate-600 font-bold">{techDisplay}</td>
                            <td className="px-5 py-3.5 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                              {getActiveCompanyForOrder(o.serviceCompany).shortName}
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <span className={cn(
                                "px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-full",
                                o.status === 'aberta' ? "bg-blue-50 text-blue-600 border border-blue-100" :
                                o.status === 'em_andamento' ? "bg-amber-50 text-amber-600 border border-amber-100" :
                                o.status === 'pre_finalizada' ? "bg-teal-50 text-teal-600 border border-teal-100" :
                                o.status === 'finalizada' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                "bg-rose-50 text-rose-600 border border-rose-100"
                              )}>
                                {getStatusLabel(o.status)}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-right font-black text-slate-800">
                              R$ {o.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleEditPreCheck(o)}
                                  className="p-1.5 text-amber-600 hover:bg-amber-50 border border-transparent hover:border-amber-100 rounded-lg transition-all cursor-pointer"
                                  title={o.status === 'cancelada' ? "Visualizar O.S. Cancelada" : "Editar O.S."}
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handlePrint(o)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 rounded-lg transition-all cursor-pointer"
                                  title="Imprimir O.S."
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {totalReportPages > 1 && (
                  <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <span className="font-bold text-slate-500">
                      Página <strong className="text-slate-800">{safeReportPage}</strong> de <strong className="text-slate-800">{totalReportPages}</strong>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setReportCurrentPage(1)}
                        disabled={safeReportPage === 1}
                        className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        title="Primeira página"
                      >
                        <ChevronsLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={safeReportPage === 1}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Anterior
                      </button>
                      {getPaginationRange(safeReportPage, totalReportPages).map((pg, idx) =>
                        pg === 'DOTS' ? (
                          <span key={`dots-${idx}`} className="px-1 text-slate-400 font-bold">…</span>
                        ) : (
                          <button
                            key={pg}
                            type="button"
                            onClick={() => setReportCurrentPage(Number(pg))}
                            className={cn(
                              "min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-black transition-all cursor-pointer",
                              safeReportPage === pg
                                ? "bg-blue-600 text-white shadow-3xs"
                                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                            )}
                          >
                            {pg}
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        onClick={() => setReportCurrentPage(prev => Math.min(totalReportPages, prev + 1))}
                        disabled={safeReportPage === totalReportPages}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Próxima
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportCurrentPage(totalReportPages)}
                        disabled={safeReportPage === totalReportPages}
                        className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        title="Última página"
                      >
                        <ChevronsRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
            </>
          )}
        </>
      ))}
    </div>

      {/* MODAL: FORMULÁRIO DE O.S. (CRIAR E EDITAR) */}
      {(isFormOpen || (userRole === UserRole.TECHNICIAN && techActiveTab === 'form')) && (() => {
        const isTechnician = userRole === UserRole.TECHNICIAN;
        const isAdminUser = userRole === UserRole.ADMIN;
        const isAlreadyFinalized = Boolean(
          formStatus === 'finalizada' ||
          formStatus === 'pre_finalizada' ||
          selectedOrder?.status === 'finalizada' ||
          selectedOrder?.status === 'pre_finalizada' ||
          selectedOrder?.adminFinalized
        );
        const isOrderCancelled = Boolean(formStatus === 'cancelada' || selectedOrder?.status === 'cancelada');
        const isOrderFinalized = Boolean(selectedOrder && (selectedOrder.status === 'finalizada' || selectedOrder.status === 'pre_finalizada' || selectedOrder.status === 'cancelada'));
        const isLockedForTech = isTechnician && isOrderFinalized;
        const canEditFinalizedItems = !isOrderCancelled && (!isAlreadyFinalized || isAdminUser);
        const canSaveOrder = !isOrderCancelled && (!isAlreadyFinalized || isAdminUser);

        const isClientSignatureFilled = Boolean(formClientSignature && formClientSignature.trim().length > 0);
        const isClientRepFilled = Boolean(formRepresentative && formRepresentative.trim().length > 0);
        const isClientMatriculaFilled = Boolean(formRepresentativeMatricula && formRepresentativeMatricula.trim().length > 0);
        const isSolutionFilled = Boolean(formSolution && formSolution.trim().length > 0);
        const isSolutionDisabled = Boolean(isLockedForTech || isSaving);
        const isOtherEquipmentSelected = formEquipmentId === 'OUTRO EQUIPAMENTO' || formEquipmentId === 'OUTRO_EQUIPAMENTO' || (!formEquipmentId && (selectedOrder?.equipmentId === 'OUTRO EQUIPAMENTO' || selectedOrder?.equipmentName === 'OUTRO EQUIPAMENTO'));
        const isTechFinalizeReady = isClientSignatureFilled && isClientRepFilled && isClientMatriculaFilled && isSolutionFilled && !isLockedForTech && !isSaving;
        const isFinalizeReady = !isAlreadyFinalized && !isOrderCancelled && isSolutionFilled && !isSolutionDisabled && !isOtherEquipmentSelected;

        const activeOrderOpenCalls = getOpenCallsForAddress(formAddressId || selectedOrder?.addressId || '', formClientId || selectedOrder?.clientId || '', selectedOrder);
        const hasOpenCallsForAddress = activeOrderOpenCalls.length > 0;

        const isExternalOrTechOpenedSO = Boolean(
          selectedOrder && (
            selectedOrder.techFinalized ||
            (selectedOrder.authenticatedTeam && (
              selectedOrder.authenticatedTeam.toLowerCase().includes('jdsmartos') ||
              selectedOrder.authenticatedTeam.toLowerCase().includes('app:') ||
              selectedOrder.authenticatedTeam.toLowerCase().includes('aplicativo') ||
              selectedOrder.authenticatedTeam.toLowerCase().includes('android') ||
              selectedOrder.authenticatedTeam.toLowerCase().includes('pwa') ||
              selectedOrder.authenticatedTeam.toLowerCase().includes('externo') ||
              selectedOrder.authenticatedTeam.toLowerCase().includes('tablet')
            )) ||
            (
              selectedOrder.openedBy &&
              !isStaffName(selectedOrder.openedBy) &&
              technicians.some(t => {
                const openedStr = (selectedOrder.openedBy || '').trim().toUpperCase();
                const tName = (t.name || '').trim().toUpperCase();
                const tFull = (t.fullName || '').trim().toUpperCase();
                const tId = (t.id || '').trim().toUpperCase();
                return (
                  (tName && (openedStr === tName || openedStr.includes(tName))) ||
                  (tFull && (openedStr === tFull || openedStr.includes(tFull))) ||
                  (tId && openedStr === tId)
                );
              })
            ) ||
            (selectedOrder.externalOs && !isStaffName(selectedOrder.openedBy))
          )
        );

        return (
        <div className={cn(
          userRole === UserRole.TECHNICIAN
            ? "w-full no-print print:hidden mt-6"
            : "fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-40 overflow-y-auto no-print print:hidden"
        )}>
          <div className={cn(
            "bg-white border border-slate-200 rounded-2xl flex flex-col w-full",
            userRole === UserRole.TECHNICIAN
              ? "shadow-3xs"
              : "max-w-4xl my-8 shadow-2xl max-h-[90vh]"
          )}>
            {/* Header */}
            <div className={cn(
              "flex items-center justify-between border-b px-5 py-2.5 rounded-t-2xl transition-all",
              hasOpenCallsForAddress
                ? "bg-gradient-to-r from-amber-500/15 via-orange-500/20 to-amber-500/15 border-b-2 border-amber-500 text-amber-950"
                : "border-slate-150 bg-slate-50/70"
            )}>
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  hasOpenCallsForAddress
                    ? "bg-amber-500 text-white shadow-xs animate-pulse"
                    : isLockedForTech ? "bg-amber-100 text-amber-700" : "bg-blue-600/10 text-blue-600"
                )}>
                  {hasOpenCallsForAddress ? <AlertTriangle className="w-4 h-4 text-white" /> : (isLockedForTech ? <Lock className="w-4 h-4" /> : <FileText className="w-4 h-4" />)}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      {selectedOrder ? `Editar O.S. #${formOsNumber || (formId && !formId.startsWith('OS_') ? formId : '00000')}` : 'Nova Ordem de Serviço'}
                    </h3>
                    {hasOpenCallsForAddress && (
                      <span className="px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider bg-amber-600 text-white rounded-full flex items-center gap-1 shadow-2xs animate-pulse">
                        <AlertTriangle className="w-2.5 h-2.5 text-white" />
                        {activeOrderOpenCalls.length === 1 ? '1 Chamado em Aberto' : `${activeOrderOpenCalls.length} Chamados em Aberto`}
                      </span>
                    )}
                    {batchIndex >= 0 && batchQueue.length > 0 && (
                      <span className="px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200 rounded-md flex items-center gap-1">
                        <ListPlus className="w-2.5 h-2.5 text-purple-600" /> Máquina {batchIndex + 1}/{batchQueue.length}
                      </span>
                    )}
                    {isLockedForTech && (
                      <span className="px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 rounded-md flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Finalizada
                      </span>
                    )}
                    {isTechnician && !isLockedForTech && (
                      <span className="px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200 rounded-md flex items-center gap-1">
                        <Edit3 className="w-2.5 h-2.5" /> Rascunho
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedOrder && (
                  <button
                    type="button"
                    onClick={() => handleGenerateShareLink(selectedOrder)}
                    className="px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-3xs"
                    title="Gerar e compartilhar link de assinatura externa com validade de 48 horas"
                  >
                    <Send className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="hidden sm:inline">Link de Assinatura (48h)</span>
                    <span className="sm:hidden">Link (48h)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setNextOsFeedback(null);
                    if (userRole === UserRole.TECHNICIAN) {
                      setTechActiveTab('my_orders');
                    } else {
                      setIsFormOpen(false);
                    }
                  }}
                  className="p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-800 rounded-lg transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Conteúdo do Form */}
            <form ref={formScrollContainerRef} onSubmit={(e) => {
              if (formStatus === 'cancelada') {
                e.preventDefault();
                alert('Esta Ordem de Serviço está cancelada. Para alterá-la ou salvá-la, um Administrador precisa reabri-la primeiro.');
                return;
              }
              handleSave(e);
            }} className={cn("flex-1 p-4 sm:p-5 space-y-3.5", userRole !== UserRole.TECHNICIAN && "overflow-y-auto")}>
              {/* Banner Compacto e Elegante de Alerta de Chamado em Aberto */}
              {hasOpenCallsForAddress && (
                <div className="bg-amber-50/90 border border-amber-300/80 rounded-xl p-2.5 sm:p-3 shadow-3xs transition-all space-y-2 text-amber-950">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="text-xs font-black uppercase tracking-wide text-amber-900 truncate">
                        Atenção: Chamado Técnico em Aberto para este Endereço
                      </span>
                      <span className="bg-amber-200/90 text-amber-950 font-black text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                        {activeOrderOpenCalls.length === 1 ? '1 Chamado' : `${activeOrderOpenCalls.length} Chamados`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCallDetailsExpandedInForm(!isCallDetailsExpandedInForm)}
                      className="text-amber-900 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 text-[10px] font-extrabold px-2.5 py-1 rounded-lg transition-all shrink-0 cursor-pointer flex items-center gap-1 border border-amber-300/80"
                    >
                      <span>{isCallDetailsExpandedInForm ? 'Ocultar Detalhes' : 'Ver Detalhes do Chamado'}</span>
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isCallDetailsExpandedInForm && "rotate-180")} />
                    </button>
                  </div>

                  {/* Conteúdo Expansível com Descrição Completa do Chamado */}
                  {isCallDetailsExpandedInForm && (
                    <div className="space-y-2 pt-2 border-t border-amber-200/80">
                      {activeOrderOpenCalls.map((call, idx) => (
                        <div key={call?.id || idx} className="bg-white text-slate-800 rounded-lg p-2.5 shadow-3xs space-y-1.5 border border-amber-200/90">
                          <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-100 pb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-black text-amber-900 bg-amber-100 border border-amber-250 px-2 py-0.5 rounded">
                                Chamado #{call?.id ? String(call.id).slice(-6).toUpperCase() : '000'}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500 uppercase">
                                Aberto em: {formatDateSafe(call?.createdAt)}
                              </span>
                            </div>
                            <span className={cn(
                              "text-[9px] font-black uppercase px-2 py-0.5 rounded border",
                              call?.priority === 'high' ? "bg-rose-50 text-rose-700 border-rose-200" :
                              call?.priority === 'medium' ? "bg-amber-50 text-amber-800 border-amber-200" :
                              "bg-blue-50 text-blue-700 border-blue-200"
                            )}>
                              Prioridade: {call?.priority === 'high' ? 'Alta' : call?.priority === 'medium' ? 'Média' : 'Baixa'}
                            </span>
                          </div>

                          <div>
                            <span className="text-[9.5px] font-black text-slate-400 uppercase tracking-wider block mb-0.5">
                              Descrição do Problema Relatado:
                            </span>
                            <div className="bg-slate-50 border border-slate-200 p-2 rounded-md text-xs font-semibold text-slate-800 leading-relaxed whitespace-pre-wrap">
                              {call?.description || 'Sem descrição detalhada.'}
                            </div>
                          </div>

                          {call?.resolutionNotes && (
                            <div>
                              <span className="text-[9.5px] font-black text-slate-400 uppercase tracking-wider block mb-0.5">
                                Notas do Atendimento:
                              </span>
                              <p className="text-xs text-slate-700 bg-amber-50/50 p-1.5 rounded border border-amber-100">{call.resolutionNotes}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Banner de Carregamento e Salvamento de Próxima O.S */}
              {isSavingNext && (
                <div className="bg-purple-50 border border-purple-200 text-purple-900 rounded-xl px-3 py-2 flex items-center gap-2.5 shadow-2xs animate-pulse text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-700 shrink-0" />
                  <span className="font-bold">
                    {batchIndex >= 0 && batchIndex < batchQueue.length - 1
                      ? 'Salvando e carregando próxima O.S. da fila...'
                      : 'Salvando O.S. e preparando a próxima para o mesmo cliente e endereço...'}
                  </span>
                </div>
              )}
              {/* Banner de Confirmação ao usar "Próxima" no mesmo cliente/endereço */}
              {!isSavingNext && nextOsFeedback && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-3 py-2 flex items-center justify-between gap-2.5 shadow-2xs text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-bold">
                      O.S. #{nextOsFeedback.osNumber} salva com sucesso! ({nextOsFeedback.count} {nextOsFeedback.count === 1 ? 'criada' : 'criadas'} nesta sequência) — Escolha o próximo equipamento e preencha descrição/solução.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNextOsFeedback(null)}
                    className="p-0.5 text-emerald-600 hover:text-emerald-900 hover:bg-emerald-100 rounded transition-colors shrink-0 cursor-pointer"
                    title="Fechar aviso"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {/* Banner de Aviso para O.S. Cancelada */}
              {formStatus === 'cancelada' && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <Ban className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="font-black text-rose-800 uppercase tracking-wide">Ordem de Serviço Cancelada</span>
                  </div>
                  {userRole === UserRole.ADMIN ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Deseja reabrir esta Ordem de Serviço? A situação voltará para "Em Aberto" e os campos poderão ser salvos.')) {
                          setFormStatus('aberta');
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider py-1 px-2.5 rounded-lg transition-all shadow-xs flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reabrir O.S.
                    </button>
                  ) : (
                    <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider bg-rose-100/70 px-2 py-0.5 rounded-md">
                      Reabertura restrita a Administradores
                    </span>
                  )}
                </div>
              )}

              {/* Banner Informativo para Técnicos: Bloqueada vs Editável */}
              {isLockedForTech && (
                <div className="bg-amber-50 border border-amber-200/80 rounded-xl px-3 py-2 flex items-center gap-2.5 text-amber-900 shadow-2xs text-xs">
                  <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                  <div className="flex-1 flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-black uppercase tracking-wide text-amber-900 text-[11px]">
                      O.S. Assinada e Bloqueada (Modo Auditoria)
                    </span>
                    <span className="text-[10px] font-medium text-amber-800">
                      Assinada pelo representante do cliente{formRepresentative || selectedOrder?.clientRepresentative ? ` (${formRepresentative || selectedOrder?.clientRepresentative})` : ''} e finalizada.
                    </span>
                  </div>
                </div>
              )}

              {isTechnician && !isLockedForTech && selectedOrder && (
                <div className="bg-blue-50 border border-blue-200/80 rounded-xl px-3 py-2 flex items-center gap-2.5 text-blue-900 shadow-2xs text-xs">
                  <Unlock className="w-4 h-4 text-blue-600 shrink-0" />
                  <div className="flex-1 flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-black uppercase tracking-wide text-blue-900 text-[11px]">
                      O.S. em Aberto — Edição Liberada
                    </span>
                    <span className="text-[10px] font-medium text-blue-800">
                      Edição liberada até a assinatura digital do cliente.
                    </span>
                  </div>
                </div>
              )}

              {/* Informações Gerais */}
              {userRole !== UserRole.TECHNICIAN ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-slate-50/70 p-3 border border-slate-200/80 rounded-xl">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block mb-0.5">Empresa Prestadora</label>
                      <select
                        value={formServiceCompany}
                        onChange={(e: any) => setFormServiceCompany(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none"
                      >
                        {osSettings?.companies.map(c => (
                          <option key={c.id} value={c.id}>{c.shortName}</option>
                        )) || (
                          <>
                            <option value="lefrio">JR COMÉRCIO E SERVIÇOS (LEFRIO)</option>
                            <option value="alclima">AL CLIMA REFRIGERAÇÃO</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block mb-0.5">ID do Sistema</label>
                      <input
                        type="text"
                        value={formId || "Geração Automática"}
                        disabled
                        className="w-full bg-slate-100 border border-slate-200 text-slate-400 rounded-lg py-1.5 px-2.5 text-xs font-bold cursor-not-allowed outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block mb-0.5">Número da O.S.</label>
                      <div className="relative flex items-center">
                        {(() => {
                          const isAdminNewOrder = selectedOrder === null;
                          const isOsNumDisabled = !isAdminNewOrder && formOsNumberChanged;
                          return (
                            <input
                              type="text"
                              value={formOsNumber}
                              onChange={(e) => setFormOsNumber(e.target.value)}
                              disabled={isOsNumDisabled}
                              placeholder={isAdminNewOrder ? "Digite o nº (ou vazio p/ gerar)" : undefined}
                              className={cn(
                                "w-full border rounded-lg py-1.5 px-2.5 text-xs font-bold outline-none transition-all",
                                selectedOrder !== null && formOsNumberChanged ? "pr-8" : "",
                                !isOsNumDisabled
                                  ? "bg-white border-blue-200 text-blue-700 placeholder:font-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                                  : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                              )}
                              required={selectedOrder !== null}
                            />
                          );
                        })()}
                        {/* Ícone de Cadeado de Desbloqueio/Redefinição */}
                        {selectedOrder !== null && formOsNumberChanged && (
                          <div className="absolute right-1 flex items-center">
                            {(formOsNumberResetUsed || selectedOrder?.osNumberResetUsed) ? (
                              <button
                                type="button"
                                disabled
                                className="p-1 rounded-md bg-rose-50 text-rose-500 border border-rose-200 cursor-not-allowed opacity-90 transition-all"
                                title="A redefinição de número já foi utilizada 1 vez nesta O.S. Bloqueado por integridade dos dados."
                              >
                                <Lock className="w-3.5 h-3.5 text-rose-600" />
                              </button>
                            ) : !isWithin24Hours ? (
                              <button
                                type="button"
                                disabled
                                className="p-1 rounded-md bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-80 transition-all"
                                title="Prazo expirado: passaram mais de 24 horas desde que o número foi inserido. Número fixado permanentemente."
                              >
                                <Lock className="w-3.5 h-3.5 text-slate-400" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={handleResetOsNumber}
                                disabled={isSaving}
                                className="p-1 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 shadow-2xs hover:scale-105 active:scale-95 transition-all cursor-pointer group"
                                title={`Clique no cadeado para deletar o número inserido e retornar ao ID originário (${hoursRemaining}h restantes para usar - Uso único)`}
                              >
                                <Lock className="w-3.5 h-3.5 text-amber-700 group-hover:text-amber-900 animate-pulse" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">Data Agendada</label>
                        {isOrderFinalized && (
                          <span className="text-[8px] font-bold text-amber-700 bg-amber-100 px-1 py-0.2 rounded border border-amber-200 uppercase">Inalterável</span>
                        )}
                      </div>
                      <input
                        type="date"
                        value={formPlannedDate}
                        onChange={(e) => setFormPlannedDate(e.target.value)}
                        disabled={isOrderFinalized}
                        className={cn(
                          "w-full border rounded-lg py-1.5 px-2.5 text-xs font-semibold outline-none transition-all",
                          isOrderFinalized
                            ? "bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed"
                            : "bg-white border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                        )}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block mb-0.5">Situação / Status</label>
                      <div className="w-full bg-slate-100 border border-slate-200 rounded-lg py-1 px-2.5 flex items-center justify-between min-h-[32px]">
                        <span className={cn(
                          "text-xs font-black uppercase tracking-wider",
                          formStatus === 'aberta' ? "text-blue-600" :
                          formStatus === 'em_andamento' ? "text-amber-600" :
                          formStatus === 'pre_finalizada' ? "text-teal-600" :
                          formStatus === 'finalizada' ? "text-emerald-600" :
                          "text-rose-600"
                        )}>
                          {getStatusLabel(formStatus)}
                        </span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                          {formStatus === 'aberta' ? 'Inicial' :
                           formStatus === 'pre_finalizada' ? 'c/ Valor' :
                           formStatus === 'finalizada' ? 's/ Custo' :
                           formStatus === 'cancelada' ? 'Cancelada' : 'Em Andamento'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block mb-0.5">Tipo de Manutenção</label>
                      <select
                        value={formType}
                        onChange={(e) => setFormType(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none"
                        required
                      >
                        {osSettings?.maintenanceTypes.map(t => (
                          <option key={t} value={t}>{t}</option>
                        )) || (
                          <>
                            <option value="MANUTENCAO CORRETIVA CONTRATO">MANUTENCAO CORRETIVA CONTRATO</option>
                            <option value="MANUTENCAO PREVENTIVA">MANUTENCAO PREVENTIVA</option>
                            <option value="JATEAMENTO">JATEAMENTO</option>
                            <option value="INSTALACAO">INSTALACAO</option>
                            <option value="AVALIAÇÃO TÉCNICA">AVALIAÇÃO TÉCNICA</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">Equipamento na Oficina</label>
                        {formIsWorkshop ? (
                          <span className="text-[8px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded border border-purple-200 uppercase">
                            {selectedOrder?.linkedWorkshopCallId ? 'Chamado Vinculado' : 'Gera Chamado Auto'}
                          </span>
                        ) : selectedOrder?.linkedWorkshopCallId && selectedOrder?.isWorkshop ? (
                          <span className="text-[8px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 uppercase">
                            Concluirá Chamado
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormIsWorkshop(!formIsWorkshop)}
                        className={cn(
                          "w-full border rounded-lg py-1.5 px-2.5 flex items-center justify-between text-xs font-bold transition-all outline-none cursor-pointer h-[34px]",
                          formIsWorkshop
                            ? "bg-purple-600 text-white border-purple-700 shadow-xs"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                        title="Ao ativar e salvar, o sistema gera automaticamente um Chamado de Oficina vinculado a esta O.S. Ao desativar, o chamado vinculado é concluído automaticamente."
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <Wrench className={cn("w-3.5 h-3.5 shrink-0", formIsWorkshop ? "text-amber-300" : "text-slate-400")} />
                          <span className="truncate">{formIsWorkshop ? 'OFICINA (HABILITADO)' : 'DESABILITADO'}</span>
                        </div>
                        <div className={cn(
                          "w-7 h-3.5 rounded-full p-0.5 transition-colors duration-200 ease-in-out flex items-center shrink-0 ml-1",
                          formIsWorkshop ? "bg-amber-400 justify-end" : "bg-slate-200 justify-start"
                        )}>
                          <div className="w-2.5 h-2.5 rounded-full bg-white shadow-2xs" />
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Datas e Outros - Escritório */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">Data/Hora Abertura</label>
                        {isExternalOrTechOpenedSO && (
                          <span className="text-[8px] font-bold text-amber-700 bg-amber-100 px-1 py-0.2 rounded border border-amber-200 uppercase">Auto/Externo</span>
                        )}
                      </div>
                      <input
                        type="datetime-local"
                        value={formOpenedAt}
                        onChange={(e) => setFormOpenedAt(e.target.value)}
                        disabled={isExternalOrTechOpenedSO}
                        className={cn(
                          "w-full border rounded-lg py-1.5 px-2.5 text-xs font-semibold outline-none transition-all",
                          isExternalOrTechOpenedSO
                            ? "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                            : "bg-white border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                        )}
                        required
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">Resp. Abertura</label>
                        {isExternalOrTechOpenedSO && (
                          <span className="text-[8px] font-bold text-amber-700 bg-amber-100 px-1 py-0.2 rounded border border-amber-200 uppercase">Auto/Externo</span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={formOpenedBy}
                        onChange={(e) => setFormOpenedBy(e.target.value)}
                        disabled={isExternalOrTechOpenedSO}
                        className={cn(
                          "w-full border rounded-lg py-1.5 px-2.5 text-xs font-semibold outline-none uppercase transition-all",
                          isExternalOrTechOpenedSO
                            ? "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                            : "bg-white border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                        )}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">Data/Hora Finalização</label>
                        {isExternalOrTechOpenedSO && (
                          <span className="text-[8px] font-bold text-amber-700 bg-amber-100 px-1 py-0.2 rounded border border-amber-200 uppercase">Auto/Externo</span>
                        )}
                      </div>
                      <input
                        type="datetime-local"
                        value={formFinishedAt}
                        onChange={(e) => setFormFinishedAt(e.target.value)}
                        disabled={isExternalOrTechOpenedSO}
                        className={cn(
                          "w-full border rounded-lg py-1.5 px-2.5 text-xs font-semibold outline-none transition-all",
                          isExternalOrTechOpenedSO
                            ? "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                            : "bg-white border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                        )}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">O.S. Externa (Nº Chamado)</label>
                        {isExternalOrTechOpenedSO && (
                          <span className="text-[8px] font-bold text-amber-700 bg-amber-100 px-1 py-0.2 rounded border border-amber-200 uppercase">Auto/Externo</span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={formExternalOs}
                        onChange={(e) => setFormExternalOs(e.target.value)}
                        placeholder="Ex: 0002200316"
                        disabled={isExternalOrTechOpenedSO}
                        className={cn(
                          "w-full border rounded-lg py-1.5 px-2.5 text-xs font-semibold outline-none uppercase transition-all",
                          isExternalOrTechOpenedSO
                            ? "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                            : "bg-white border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                        )}
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* Para Técnico: Oculta campos automáticos e do sistema, exibe apenas Tipo de Manutenção e Chamado Externo */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-50/70 p-3 border border-slate-200/80 rounded-xl">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block mb-0.5">Tipo de Manutenção</label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none"
                      required
                    >
                      {osSettings?.maintenanceTypes.map(t => (
                        <option key={t} value={t}>{t}</option>
                      )) || (
                        <>
                          <option value="MANUTENCAO CORRETIVA CONTRATO">MANUTENCAO CORRETIVA CONTRATO</option>
                          <option value="MANUTENCAO PREVENTIVA">MANUTENCAO PREVENTIVA</option>
                          <option value="JATEAMENTO">JATEAMENTO</option>
                          <option value="INSTALACAO">INSTALACAO</option>
                          <option value="AVALIAÇÃO TÉCNICA">AVALIAÇÃO TÉCNICA</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block mb-0.5">O.S. Externa (Nº Chamado)</label>
                    <input
                      type="text"
                      value={formExternalOs}
                      onChange={(e) => setFormExternalOs(e.target.value)}
                      placeholder="Ex: 0002200316"
                      className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-700 outline-none uppercase"
                    />
                  </div>
                </div>
              )}

              {/* Opção Rápida de Busca por ID da Máquina (Input Alternativo - Exclusivo para Técnico) */}
              {userRole === UserRole.TECHNICIAN && (
                <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-blue-50/90 border border-blue-200/90 rounded-2xl p-4 space-y-3 shadow-3xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <span>Localização Rápida por ID da Máquina</span>
                          <span className="text-[9px] font-extrabold bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Preenchimento Automático
                          </span>
                        </h4>
                        <p className="text-[11px] text-slate-600 font-medium leading-tight">
                          Digite o ID da máquina (ex: 0042) para preencher o cliente, endereço e vincular a máquina automaticamente.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-500" />
                      <input
                        type="text"
                        value={machineIdSearchInput}
                        onChange={(e) => setMachineIdSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSearchAndFillByMachineId();
                          }
                        }}
                        placeholder="Digite o ID da máquina (ex: 0042, 42, 1050, patrimônio ou etiqueta)..."
                        className="w-full bg-white border border-blue-200 rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none uppercase"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSearchAndFillByMachineId()}
                      disabled={isSearchingMachine || !machineIdSearchInput.trim()}
                      className={cn(
                        "bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 shrink-0 cursor-pointer",
                        (isSearchingMachine || !machineIdSearchInput.trim()) && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      {isSearchingMachine ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Buscando...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 text-amber-300" />
                          <span>Localizar Máquina</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Feedback do resultado */}
                  {machineSearchFeedback && (
                    <div className={cn(
                      "p-3 rounded-xl border text-xs font-semibold flex items-start gap-2.5",
                      machineSearchFeedback.type === 'success' 
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : "bg-rose-50 border-rose-200 text-rose-800"
                    )}>
                      {machineSearchFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 space-y-1">
                        <p className="leading-snug">{machineSearchFeedback.message}</p>
                        {machineSearchFeedback.foundData && (
                          <div className="mt-1 pt-1.5 border-t border-emerald-200/60 text-[11px] text-emerald-800 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span><strong>Máquina:</strong> {machineSearchFeedback.foundData.equipment.name || 'Ar-Condicionado'} ({machineSearchFeedback.foundData.equipment.brand || 'Sem marca'} {machineSearchFeedback.foundData.equipment.btus ? `• ${machineSearchFeedback.foundData.equipment.btus} BTUs` : ''})</span>
                            {machineSearchFeedback.foundData.equipment.sector && (
                              <span><strong>Setor:</strong> {machineSearchFeedback.foundData.equipment.sector}</span>
                            )}
                            {machineSearchFeedback.foundData.equipment.patrimony && (
                              <span><strong>Patrimônio:</strong> {machineSearchFeedback.foundData.equipment.patrimony}</span>
                            )}
                            {machineSearchFeedback.foundData.client && (
                              <span><strong>Cliente:</strong> {machineSearchFeedback.foundData.client.name}</span>
                            )}
                            {machineSearchFeedback.foundData.address && (
                              <span><strong>Endereço:</strong> {machineSearchFeedback.foundData.address.street}, {machineSearchFeedback.foundData.address.number || 'S/N'}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Cliente e Endereço */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                      Cliente
                    </label>
                    <select
                      value={formClientId}
                      onChange={(e) => handleClientChange(e.target.value)}
                      disabled={isLockedForTech}
                      className={cn(
                        "w-full rounded-xl py-1.5 px-3 text-xs font-semibold outline-none",
                        isLockedForTech
                          ? "bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed"
                          : "bg-white border border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                      )}
                      required
                    >
                      <option value="">
                        {userRole === UserRole.TECHNICIAN
                          ? (availableClientsForForm.length === 0 ? "Nenhum cliente programado no seu roteiro..." : "Selecione um Cliente...")
                          : "Selecione um Cliente..."}
                      </option>
                      {availableClientsForForm.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="relative" ref={addressDropdownRef}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                        Endereço de Execução
                      </label>
                      {formAddressId && (
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Selecionado
                        </span>
                      )}
                    </div>

                    {userRole === UserRole.TECHNICIAN ? (
                      <select
                        value={formAddressId}
                        onChange={(e) => handleAddressChange(e.target.value)}
                        disabled={isLockedForTech || !formClientId}
                        className={cn(
                          "w-full rounded-xl py-1.5 px-3 text-xs font-semibold outline-none",
                          isLockedForTech
                            ? "bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed"
                            : "bg-white border border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                        )}
                        required
                      >
                        <option value="">
                          {!formClientId 
                            ? "Selecione o cliente primeiro..."
                            : availableAddressesForForm.length === 0
                              ? "Nenhum endereço deste cliente no seu roteiro..."
                              : "Selecione um Endereço..."}
                        </option>
                        {availableAddressesForForm.map(a => (
                          <option key={a.id} value={a.id}>{a.street}, {a.number || 'S/N'}{a.name ? ` (${a.name})` : ''}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="relative">
                        <div className="relative flex items-center">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                          <input
                            type="text"
                            value={addressSearchTerm}
                            disabled={!formClientId}
                            placeholder={
                              !formClientId
                                ? "Selecione o cliente primeiro..."
                                : formAddressId 
                                  ? "Clique para buscar ou alterar endereço..." 
                                  : "Digite parte do endereço, escola ou bairro..."
                            }
                            onFocus={() => {
                              if (formClientId) {
                                setIsAddressDropdownOpen(true);
                              }
                            }}
                            onClick={() => {
                              if (formClientId) {
                                setIsAddressDropdownOpen(true);
                              }
                            }}
                            onChange={(e) => {
                              setAddressSearchTerm(e.target.value);
                              setIsAddressDropdownOpen(true);
                              if (!e.target.value.trim() && formAddressId) {
                                handleAddressChange('');
                              }
                            }}
                            className={cn(
                              "w-full bg-white border rounded-xl py-2 pl-8 pr-14 text-xs font-semibold text-slate-700 outline-none transition-all",
                              !formClientId 
                                ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
                                : formAddressId
                                  ? "border-emerald-300 ring-2 ring-emerald-500/10 bg-emerald-50/20"
                                  : "border-slate-200 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                            )}
                          />
                          <div className="absolute right-1.5 flex items-center gap-0.5">
                            {formAddressId && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddressChange('');
                                  setAddressSearchTerm('');
                                  setIsAddressDropdownOpen(true);
                                }}
                                title="Limpar endereço selecionado"
                                className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-md transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={!formClientId}
                              onClick={() => {
                                if (formClientId) {
                                  setIsAddressDropdownOpen(prev => !prev);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
                            >
                              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isAddressDropdownOpen ? "rotate-180" : "")} />
                            </button>
                          </div>
                        </div>

                        {/* Dropdown com a lista de endereços filtrados */}
                        {isAddressDropdownOpen && formClientId && (
                          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-64 flex flex-col">
                            <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                              <span>Endereços ({filteredFormAddresses.length} de {formClientAddresses.length})</span>
                              {addressSearchTerm && (
                                <span className="text-blue-600 font-normal normal-case truncate max-w-[140px]">
                                  Busca: "{addressSearchTerm}"
                                </span>
                              )}
                            </div>
                            
                            <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
                              {filteredFormAddresses.length === 0 ? (
                                <div className="p-4 text-center text-xs text-slate-400">
                                  Nenhum endereço encontrado para os termos digitados.
                                </div>
                              ) : (
                                filteredFormAddresses.map((addr) => {
                                  const isSelected = formAddressId === addr.id;
                                  const fullText = `${addr.street}, ${addr.number || 'S/N'}`;
                                  return (
                                    <button
                                      key={addr.id}
                                      type="button"
                                      onClick={() => {
                                        handleAddressChange(addr.id);
                                        setAddressSearchTerm(fullText);
                                        setIsAddressDropdownOpen(false);
                                      }}
                                      className={cn(
                                        "w-full text-left p-2.5 transition-colors flex items-start justify-between gap-2 group",
                                        isSelected ? "bg-blue-50/90 text-blue-900 font-semibold" : "hover:bg-slate-50 text-slate-700"
                                      )}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-start gap-1.5">
                                          <MapPin className={cn("w-3.5 h-3.5 flex-shrink-0 mt-0.5", isSelected ? "text-blue-600" : "text-slate-400 group-hover:text-blue-500")} />
                                          <span className="text-xs font-bold leading-tight">{fullText}</span>
                                        </div>
                                        
                                        {addr.name && (
                                          <div className="text-[11px] text-blue-700 font-semibold ml-5 mt-0.5">
                                            {addr.name}
                                          </div>
                                        )}
                                        
                                        <div className="flex flex-wrap items-center gap-1.5 ml-5 mt-1 text-[10px] text-slate-500">
                                          {addr.neighborhood && (
                                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                              {addr.neighborhood}
                                            </span>
                                          )}
                                          {addr.route && (
                                            <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                                              Rota: {addr.route}
                                            </span>
                                          )}
                                          {addr.totalMachines !== undefined && addr.totalMachines > 0 && (
                                            <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                                              {addr.totalMachines} máq.
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {isSelected && (
                                        <span className="flex-shrink-0 text-blue-600 font-bold text-xs mt-1">
                                          <CheckCircle2 className="w-4 h-4" />
                                        </span>
                                      )}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                        {userRole === UserRole.TECHNICIAN ? 'Equipamento / Máquina (Obrigatório)' : 'Equipamento (Obrigatório p/ Finalizar)'}
                      </label>
                      {formEquipmentId === 'OUTRO EQUIPAMENTO' && (
                        <div className="relative group inline-block">
                          <span className="cursor-help inline-flex items-center gap-1 text-[9px] font-black text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2 py-0.5 rounded-md uppercase transition-all shadow-2xs">
                            <AlertTriangle className="w-3 h-3 text-amber-700" />
                            <span>Troca Obrigatória</span>
                          </span>
                          <div className="absolute right-0 top-full mt-1.5 w-72 p-3 bg-slate-900/95 backdrop-blur-xs text-white text-[11px] font-medium leading-relaxed rounded-xl shadow-xl border border-slate-700 opacity-0 group-hover:opacity-100 transition-all pointer-events-none group-hover:pointer-events-auto z-50">
                            <div className="flex items-center gap-1.5 text-amber-400 font-bold mb-1 border-b border-slate-800 pb-1">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>Regra: Troca Obrigatória de Máquina</span>
                            </div>
                            {userRole === UserRole.TECHNICIAN ? (
                              <span>
                                Preencha no campo <strong>"Descrição do Problema"</strong> os detalhes desta máquina (marca, modelo, ambiente, capacidade) para que a administração possa identificar e vincular a máquina correta.
                              </span>
                            ) : (
                              <span>
                                Esta O.S. foi recebida com a opção <strong>"OUTRO EQUIPAMENTO"</strong>. Consulte a <strong>"Descrição do Problema"</strong> informada pelo técnico e selecione a máquina correta cadastrada na listagem acima. A O.S. não poderá ser finalizada com esta opção provisória.
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <select
                      value={formEquipmentId}
                      onChange={(e) => setFormEquipmentId(e.target.value)}
                      disabled={isLockedForTech || !formAddressId}
                      className={cn(
                        "w-full rounded-xl py-1.5 px-3 text-xs font-semibold outline-none transition-all",
                        isLockedForTech
                          ? "bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed"
                          : formEquipmentId === 'OUTRO EQUIPAMENTO'
                          ? "bg-amber-50 border-2 border-amber-400 text-amber-900 focus:ring-2 focus:ring-amber-500/20 font-bold"
                          : "bg-white border border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                      )}
                      required={userRole === UserRole.TECHNICIAN}
                    >
                      {userRole !== UserRole.TECHNICIAN && (
                        <option value="">Geral do Endereço / Não Vinculado</option>
                      )}
                      {userRole === UserRole.TECHNICIAN && (
                        <option value="">Selecione a Máquina...</option>
                      )}
                      <option value="OUTRO EQUIPAMENTO" className="font-black text-amber-800 bg-amber-50">
                        ⚡ OUTRO EQUIPAMENTO
                      </option>
                      {equipments.map(eq => (
                        <option key={eq.id} value={eq.id}>{formatEquipmentOptionLabel(eq)}</option>
                      ))}
                    </select>
                  </div>
                </div>

              {/* Problema, Diagnóstico e Solução */}
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Descrição do Problema</label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    disabled={isLockedForTech}
                    rows={2}
                    placeholder="EX: JATEAMENTO - AR-CONDICIONADO COM BAIXO RENDIMENTO"
                    className={cn(
                      "w-full rounded-xl py-2 px-3 text-xs font-semibold outline-none uppercase",
                      isLockedForTech
                        ? "bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed"
                        : "bg-white border border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                    )}
                    required
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                      <span>Diagnóstico Técnico</span>
                      {userRole !== UserRole.TECHNICIAN && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md">
                          <Lock className="w-2.5 h-2.5 text-amber-600" />
                          Bloqueado p/ Administrativo (Exclusivo do Técnico)
                        </span>
                      )}
                      {isLockedForTech && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md">
                          <Lock className="w-2.5 h-2.5 text-amber-600" />
                          Bloqueado após assinatura
                        </span>
                      )}
                    </label>
                  </div>
                  <textarea
                    value={formDiagnosis}
                    readOnly={userRole !== UserRole.TECHNICIAN || isLockedForTech}
                    disabled={userRole !== UserRole.TECHNICIAN || isLockedForTech}
                    onChange={(e) => setFormDiagnosis(e.target.value)}
                    rows={2}
                    placeholder={
                      userRole !== UserRole.TECHNICIAN
                        ? "Nenhum diagnóstico técnico registrado pelo técnico."
                        : "EX: AR-CONDICIONADO MUITO SUJO E COM BAIXA DE GÁS..."
                    }
                    className={cn(
                      "w-full rounded-xl py-2 px-3 text-xs font-semibold outline-none transition-all uppercase",
                      (userRole !== UserRole.TECHNICIAN || isLockedForTech)
                        ? "bg-slate-100/90 border border-slate-200 text-slate-600 cursor-not-allowed select-none focus:ring-0 focus:border-slate-200"
                        : "bg-white border border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                    )}
                  />
                  {userRole !== UserRole.TECHNICIAN && (
                    <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 font-medium">
                      <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                      O diagnóstico técnico é preenchido exclusivamente pelo técnico em campo e é mantido sem alterações pela equipe administrativa.
                    </p>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                      Solução
                    </label>
                    {!formSolution?.trim() ? (
                      <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">
                        * Obrigatório para liberar "Finalizar O.S."
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" /> Solução preenchida
                      </span>
                    )}
                  </div>
                  <textarea
                    value={formSolution}
                    onChange={(e) => setFormSolution(e.target.value)}
                    disabled={isLockedForTech || isSaving}
                    rows={6}
                    placeholder="EX: FOI REALIZADO JATEAMENTO E UMA CARGA DE GÁS R410..."
                    className={cn(
                      "w-full rounded-xl py-2 px-3 text-xs font-semibold outline-none uppercase",
                      (isLockedForTech || isSaving)
                        ? "bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed"
                        : "bg-white border border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                    )}
                  />
                </div>
                <div className="md:col-span-2">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <label className="text-[10px] font-black uppercase text-slate-600 tracking-wider">
                      Observação Interna
                    </label>
                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                      Uso interno • Não exibida na impressão
                    </span>
                  </div>
                  <textarea
                    value={formTechnicalReport}
                    onChange={(e) => setFormTechnicalReport(e.target.value)}
                    disabled={isLockedForTech || isSaving}
                    rows={3}
                    placeholder="COMUNICAÇÃO INTERNA ENTRE SETORES SOBRE ESTA O.S. (NÃO APARECE NA FOLHA DE IMPRESSÃO)..."
                    className={cn(
                      "w-full rounded-xl py-2 px-3 text-xs font-semibold outline-none uppercase",
                      (isLockedForTech || isSaving)
                        ? "bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed"
                        : "bg-amber-50/40 border border-amber-200/80 text-slate-700 focus:ring-2 focus:ring-amber-500/15 focus:border-amber-400"
                    )}
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Uso exclusivo para comunicação interna entre os setores sobre esta O.S. — este campo não é exibido na folha de impressão.
                  </p>
                </div>
              </div>

              {userRole !== UserRole.TECHNICIAN && (() => {
                const catalogServices = catalogItems
                  .filter(i => i.type === 'service' && i.active !== false)
                  .sort((a, b) => (a.order ?? 999999) - (b.order ?? 999999));
                const catalogProducts = catalogItems
                  .filter(i => i.type === 'product' && i.active !== false)
                  .sort((a, b) => (a.order ?? 999999) - (b.order ?? 999999));
                const selectedClientObj = clients.find(c => c.id === formClientId);

                // Categorias únicas dos serviços do catálogo
                const serviceCategories = Array.from(
                  new Set(
                    catalogServices
                      .map(s => (s.category || '').trim().toUpperCase())
                      .filter(Boolean)
                  )
                ).sort();

                // Serviços filtrados pela categoria selecionada
                const filteredCatalogServices = selectedServiceCategoryFilter === 'ALL'
                  ? catalogServices
                  : (selectedServiceCategoryFilter === '__NO_CATEGORY__'
                      ? catalogServices.filter(s => !s.category || !s.category.trim())
                      : catalogServices.filter(s => (s.category || '').trim().toUpperCase() === selectedServiceCategoryFilter)
                    );

                // Categorias únicas dos produtos do catálogo
                const productCategories = Array.from(
                  new Set(
                    catalogProducts
                      .map(p => (p.category || '').trim().toUpperCase())
                      .filter(Boolean)
                  )
                ).sort();

                // Produtos filtrados pela categoria selecionada
                const filteredCatalogProducts = selectedProductCategoryFilter === 'ALL'
                  ? catalogProducts
                  : (selectedProductCategoryFilter === '__NO_CATEGORY__'
                      ? catalogProducts.filter(p => !p.category || !p.category.trim())
                      : catalogProducts.filter(p => (p.category || '').trim().toUpperCase() === selectedProductCategoryFilter)
                    );

                return (
                  <>
                    {/* Serviços Realizados */}
                    <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-white">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Wind className="w-4 h-4 text-blue-600" />
                          <span className="text-xs font-black uppercase tracking-widest text-slate-700">Tabela de Serviços</span>
                          {selectedClientObj && (
                            <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-150">
                              Tabela: {selectedClientObj.name}
                            </span>
                          )}
                          {isAlreadyFinalized && !isAdminUser && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                              <Lock className="w-2.5 h-2.5" /> Somente Administrador
                            </span>
                          )}
                        </div>
                        
                        {/* Seletor do Catálogo & Atalhos */}
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                          {/* 1. SELEÇÃO DE CATEGORIA DE SERVIÇO */}
                          {catalogServices.length > 0 && serviceCategories.length > 0 && (
                            <div className="flex items-center gap-1">
                              <select
                                value={selectedServiceCategoryFilter}
                                onChange={(e) => setSelectedServiceCategoryFilter(e.target.value)}
                                disabled={!canEditFinalizedItems}
                                className={cn(
                                  "text-xs font-bold border rounded-lg px-2.5 py-1.5 outline-none max-w-[190px] truncate transition-all",
                                  !canEditFinalizedItems
                                    ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                                    : selectedServiceCategoryFilter !== 'ALL'
                                      ? "bg-blue-100/80 border-blue-300 text-blue-900 font-black shadow-xs cursor-pointer"
                                      : "bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-300 cursor-pointer"
                                )}
                              >
                                <option value="ALL">📁 Todas as Categorias ({catalogServices.length})</option>
                                {serviceCategories.map(cat => {
                                  const count = catalogServices.filter(s => (s.category || '').trim().toUpperCase() === cat).length;
                                  return (
                                    <option key={cat} value={cat}>
                                      📁 {cat} ({count})
                                    </option>
                                  );
                                })}
                                {catalogServices.some(s => !s.category || !s.category.trim()) && (
                                  <option value="__NO_CATEGORY__">⚠️ Sem Categoria</option>
                                )}
                              </select>
                            </div>
                          )}

                          {/* 2. SELEÇÃO DO SERVIÇO */}
                          {catalogServices.length > 0 ? (
                            <select
                              disabled={!canEditFinalizedItems}
                              onChange={(e) => {
                                if (!canEditFinalizedItems) return;
                                const itemId = e.target.value;
                                if (!itemId) return;
                                const found = catalogServices.find(s => s.id === itemId);
                                if (found) {
                                  addServiceRow(found);
                                }
                                e.target.value = '';
                              }}
                              defaultValue=""
                              className={cn(
                                "text-xs font-bold border rounded-lg px-2.5 py-1.5 outline-none max-w-[240px] truncate",
                                !canEditFinalizedItems
                                  ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                                  : "text-slate-700 bg-slate-50 border-slate-200 hover:border-blue-300 cursor-pointer"
                              )}
                            >
                              <option value="">
                                {selectedServiceCategoryFilter === 'ALL'
                                  ? '+ Adicionar do Catálogo...'
                                  : `+ Selecionar Serviço (${filteredCatalogServices.length})...`}
                              </option>
                              {filteredCatalogServices.map(item => {
                                const priceInfo = getCatalogItemPriceForClient(item, formClientId);
                                return (
                                  <option key={item.id} value={item.id}>
                                    #{item.code} {item.description.substring(0, 35)}... (R$ {priceInfo.unitValue.toFixed(2)}{priceInfo.isCustom ? ' - Contrato' : ''})
                                  </option>
                                );
                              })}
                            </select>
                          ) : (
                            PRESET_SERVICES.map(p => (
                              <button
                                key={p.code}
                                type="button"
                                disabled={!canEditFinalizedItems}
                                onClick={() => addServiceRow(p)}
                                className="text-[9px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 rounded-md transition-all border border-blue-100"
                              >
                                #{p.code}
                              </button>
                            ))
                          )}

                          <button
                            type="button"
                            disabled={!canEditFinalizedItems}
                            onClick={() => addServiceRow()}
                            className="text-[9px] font-black bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> + Custom
                          </button>
                        </div>
                      </div>

                      {formServices.length === 0 ? (
                        <div className="text-center py-5 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                          <p className="text-xs text-slate-400 font-bold uppercase">Nenhum serviço adicionado a esta O.S.</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Selecione um item no catálogo acima ou crie uma linha personalizada.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-12 gap-2 text-[9px] font-black uppercase tracking-wider text-slate-400 px-2">
                            <div className="col-span-1 text-center">Cód</div>
                            <div className="col-span-5">Descrição do Serviço</div>
                            <div className="col-span-1 text-center">Un</div>
                            <div className="col-span-1 text-center">Qtd</div>
                            <div className="col-span-2 text-right">Unitário (R$)</div>
                            <div className="col-span-1 text-center">Desc %</div>
                            <div className="col-span-1 text-right">Total</div>
                          </div>

                          {formServices.map((srv, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-150">
                              <div className="col-span-1">
                                <input
                                  type="text"
                                  placeholder="CÓD"
                                  disabled={!canEditFinalizedItems}
                                  value={srv.code}
                                  onChange={(e) => updateServiceRow(idx, 'code', e.target.value)}
                                  className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-lg p-1.5 text-xs text-center font-bold text-slate-700 outline-none uppercase"
                                />
                              </div>
                              <div className="col-span-5">
                                <input
                                  type="text"
                                  placeholder="DESCRIÇÃO DOS SERVIÇOS"
                                  disabled={!canEditFinalizedItems}
                                  value={srv.description}
                                  onChange={(e) => updateServiceRow(idx, 'description', e.target.value)}
                                  className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-lg p-1.5 text-xs font-semibold text-slate-700 outline-none uppercase"
                                />
                              </div>
                              <div className="col-span-1">
                                <input
                                  type="text"
                                  placeholder="UN"
                                  disabled={!canEditFinalizedItems}
                                  value={srv.unit}
                                  onChange={(e) => updateServiceRow(idx, 'unit', e.target.value)}
                                  className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-lg p-1.5 text-xs text-center font-bold text-slate-700 outline-none uppercase"
                                />
                              </div>
                              <div className="col-span-1">
                                <input
                                  type="number"
                                  placeholder="QTD"
                                  min="0"
                                  step="1"
                                  disabled={!canEditFinalizedItems}
                                  value={srv.quantity}
                                  onChange={(e) => updateServiceRow(idx, 'quantity', Number(e.target.value))}
                                  className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-lg p-1.5 text-xs text-center font-semibold text-slate-700 outline-none"
                                />
                              </div>
                              <div className="col-span-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="UNITÁRIO"
                                  disabled={!canEditFinalizedItems}
                                  value={srv.unitValue}
                                  onChange={(e) => updateServiceRow(idx, 'unitValue', Number(e.target.value))}
                                  className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-lg p-1.5 text-xs text-right font-bold text-slate-700 outline-none"
                                />
                              </div>
                              <div className="col-span-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="DESC %"
                                  disabled={!canEditFinalizedItems}
                                  value={srv.discountPercent}
                                  onChange={(e) => updateServiceRow(idx, 'discountPercent', Number(e.target.value))}
                                  className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-lg p-1.5 text-xs text-center font-semibold text-slate-700 outline-none"
                                />
                              </div>
                              <div className="col-span-1 flex items-center justify-end gap-1">
                                <span className="font-black text-slate-800 text-xs truncate">
                                  R${srv.totalValue.toFixed(2)}
                                </span>
                                <button
                                  type="button"
                                  disabled={!canEditFinalizedItems}
                                  onClick={() => removeServiceRow(idx)}
                                  className="text-rose-500 hover:text-rose-700 disabled:text-slate-300 disabled:cursor-not-allowed p-1 rounded-md transition cursor-pointer"
                                  title={canEditFinalizedItems ? "Remover linha" : "Somente Administrador pode alterar O.S. finalizada"}
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Produtos Utilizados */}
                    <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-white">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Receipt className="w-4 h-4 text-indigo-650" />
                          <span className="text-xs font-black uppercase tracking-widest text-slate-700">Tabela de Produtos</span>
                          {selectedClientObj && (
                            <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-150">
                              Tabela: {selectedClientObj.name}
                            </span>
                          )}
                          {isAlreadyFinalized && !isAdminUser && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                              <Lock className="w-2.5 h-2.5" /> Somente Administrador
                            </span>
                          )}
                        </div>
                        
                        {/* Seletor do Catálogo & Atalhos */}
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                          {/* 1. SELEÇÃO DE CATEGORIA */}
                          {catalogProducts.length > 0 && productCategories.length > 0 && (
                            <div className="flex items-center gap-1">
                              <select
                                value={selectedProductCategoryFilter}
                                onChange={(e) => setSelectedProductCategoryFilter(e.target.value)}
                                disabled={!canEditFinalizedItems}
                                className={cn(
                                  "text-xs font-bold border rounded-lg px-2.5 py-1.5 outline-none max-w-[190px] truncate transition-all",
                                  !canEditFinalizedItems
                                    ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                                    : selectedProductCategoryFilter !== 'ALL'
                                      ? "bg-indigo-100/80 border-indigo-300 text-indigo-900 font-black shadow-xs cursor-pointer"
                                      : "bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300 cursor-pointer"
                                )}
                              >
                                <option value="ALL">📁 Todas as Categorias ({catalogProducts.length})</option>
                                {productCategories.map(cat => {
                                  const count = catalogProducts.filter(p => (p.category || '').trim().toUpperCase() === cat).length;
                                  return (
                                    <option key={cat} value={cat}>
                                      📁 {cat} ({count})
                                    </option>
                                  );
                                })}
                                {catalogProducts.some(p => !p.category || !p.category.trim()) && (
                                  <option value="__NO_CATEGORY__">⚠️ Sem Categoria</option>
                                )}
                              </select>
                            </div>
                          )}

                          {/* 2. SELEÇÃO DO PRODUTO */}
                          {catalogProducts.length > 0 ? (
                            <select
                              disabled={!canEditFinalizedItems}
                              onChange={(e) => {
                                if (!canEditFinalizedItems) return;
                                const itemId = e.target.value;
                                if (!itemId) return;
                                const found = catalogProducts.find(p => p.id === itemId);
                                if (found) {
                                  addProductRow(found);
                                }
                                e.target.value = '';
                              }}
                              defaultValue=""
                              className={cn(
                                "text-xs font-bold border rounded-lg px-2.5 py-1.5 outline-none max-w-[240px] truncate",
                                !canEditFinalizedItems
                                  ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                                  : "text-slate-700 bg-slate-50 border-slate-200 hover:border-indigo-300 cursor-pointer"
                              )}
                            >
                              <option value="">
                                {selectedProductCategoryFilter === 'ALL' 
                                  ? '+ Adicionar Produto...' 
                                  : `+ Selecionar Produto (${filteredCatalogProducts.length})...`}
                              </option>
                              {filteredCatalogProducts.map(item => {
                                const priceInfo = getCatalogItemPriceForClient(item, formClientId);
                                return (
                                  <option key={item.id} value={item.id}>
                                    #{item.code} {item.description.substring(0, 35)}... (R$ {priceInfo.unitValue.toFixed(2)}{priceInfo.isCustom ? ' - Contrato' : ''})
                                  </option>
                                );
                              })}
                            </select>
                          ) : (
                            PRESET_PRODUCTS.map(p => (
                              <button
                                key={p.code}
                                type="button"
                                disabled={!canEditFinalizedItems}
                                onClick={() => addProductRow(p)}
                                className="text-[9px] font-bold text-indigo-650 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 rounded-md transition-all border border-indigo-100"
                              >
                                #{p.code}
                              </button>
                            ))
                          )}

                          <button
                            type="button"
                            disabled={!canEditFinalizedItems}
                            onClick={() => addProductRow()}
                            className="text-[9px] font-black bg-indigo-650 text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> + Custom
                          </button>
                        </div>
                      </div>

                      {formProducts.length === 0 ? (
                        <div className="text-center py-5 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                          <p className="text-xs text-slate-400 font-bold uppercase">Nenhum produto adicionado a esta O.S.</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Selecione um item no catálogo acima ou crie uma linha personalizada.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-12 gap-2 text-[9px] font-black uppercase tracking-wider text-slate-400 px-2">
                            <div className="col-span-1 text-center">Cód</div>
                            <div className="col-span-6">Descrição do Produto</div>
                            <div className="col-span-1 text-center">Un</div>
                            <div className="col-span-1 text-center">Qtd</div>
                            <div className="col-span-1 text-right">Unitário (R$)</div>
                            <div className="col-span-2 text-right pr-2">Total</div>
                          </div>

                          {formProducts.map((prod, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-150">
                              <div className="col-span-1">
                                <input
                                  type="text"
                                  placeholder="CÓD"
                                  disabled={!canEditFinalizedItems}
                                  value={prod.code}
                                  onChange={(e) => updateProductRow(idx, 'code', e.target.value)}
                                  className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-lg p-1.5 text-xs text-center font-bold text-slate-700 outline-none uppercase"
                                />
                              </div>
                              <div className="col-span-6">
                                <input
                                  type="text"
                                  placeholder="DESCRIÇÃO DO PRODUTO"
                                  disabled={!canEditFinalizedItems}
                                  value={prod.description}
                                  onChange={(e) => updateProductRow(idx, 'description', e.target.value)}
                                  className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-lg p-1.5 text-xs font-semibold text-slate-700 outline-none uppercase"
                                />
                              </div>
                              <div className="col-span-1">
                                <input
                                  type="text"
                                  placeholder="UN"
                                  disabled={!canEditFinalizedItems}
                                  value={prod.unit}
                                  onChange={(e) => updateProductRow(idx, 'unit', e.target.value)}
                                  className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-lg p-1.5 text-xs text-center font-bold text-slate-700 outline-none uppercase"
                                />
                              </div>
                              <div className="col-span-1">
                                <input
                                  type="number"
                                  placeholder="QTD"
                                  min="0"
                                  step="1"
                                  disabled={!canEditFinalizedItems}
                                  value={prod.quantity}
                                  onChange={(e) => updateProductRow(idx, 'quantity', Number(e.target.value))}
                                  className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-lg p-1.5 text-xs text-center font-semibold text-slate-700 outline-none"
                                />
                              </div>
                              <div className="col-span-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="UNIT."
                                  disabled={!canEditFinalizedItems}
                                  value={prod.unitValue}
                                  onChange={(e) => updateProductRow(idx, 'unitValue', Number(e.target.value))}
                                  className="w-full bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed border border-slate-200 rounded-lg p-1.5 text-xs text-right font-bold text-slate-700 outline-none"
                                />
                              </div>
                              <div className="col-span-2 flex items-center justify-end gap-1.5 pr-1">
                                <span className="font-black text-slate-800 text-xs whitespace-nowrap">
                                  R$ {prod.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <button
                                  type="button"
                                  disabled={!canEditFinalizedItems}
                                  onClick={() => removeProductRow(idx)}
                                  className="text-rose-500 hover:text-rose-700 disabled:text-slate-300 disabled:cursor-not-allowed p-1 hover:bg-rose-50 rounded-md transition cursor-pointer shrink-0"
                                  title={canEditFinalizedItems ? "Remover linha" : "Somente Administrador pode alterar O.S. finalizada"}
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}

              {/* Técnicos e Autenticação e Representante do Cliente */}
              {userRole !== UserRole.TECHNICIAN && (() => {
                const isClientInfoLocked = Boolean(
                  formClientSignature || 
                  (selectedOrder && (selectedOrder.clientSignature || selectedOrder.clientRepresentative))
                );

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Técnico Executor 1</label>
                        <select
                          value={formTechnicianId}
                          onChange={(e) => setFormTechnicianId(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none uppercase"
                        >
                          <option value="">Selecione o Técnico 1...</option>
                          {techIndex.indexedTechs.map(it => (
                            <option key={it.id} value={it.originalId}>[{it.indexedCode}] {it.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Técnico Executor 2 (Opcional)</label>
                        <select
                          value={formTechnician2Id}
                          onChange={(e) => setFormTechnician2Id(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none uppercase"
                        >
                          <option value="">Selecione o Técnico 2 (Opcional)...</option>
                          {techIndex.indexedTechs.map(it => (
                            <option key={it.id} value={it.originalId}>[{it.indexedCode}] {it.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Representante do Cliente</label>
                          {isClientInfoLocked && (
                            <span className="text-[8px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200 uppercase">Inalterável</span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={formRepresentative}
                          onChange={(e) => setFormRepresentative(e.target.value)}
                          disabled={isClientInfoLocked}
                          placeholder="EX: ALUÍSIO MELO SIMÕES FILHO"
                          className={cn(
                            "w-full border rounded-xl py-1.5 px-3 text-xs font-semibold outline-none transition-all uppercase",
                            isClientInfoLocked
                              ? "bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed"
                              : "bg-white border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                          )}
                        />
                        {isClientInfoLocked && (
                          <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                            Bloqueado por segurança após assinatura em campo.
                          </p>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Matrícula Representante</label>
                          {isClientInfoLocked && (
                            <span className="text-[8px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200 uppercase">Inalterável</span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={formRepresentativeMatricula}
                          onChange={(e) => setFormRepresentativeMatricula(e.target.value)}
                          disabled={isClientInfoLocked}
                          placeholder="EX: 0813"
                          className={cn(
                            "w-full border rounded-xl py-1.5 px-3 text-xs font-semibold outline-none transition-all uppercase",
                            isClientInfoLocked
                              ? "bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed"
                              : "bg-white border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                          )}
                        />
                        {isClientInfoLocked && (
                          <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                            Bloqueado por segurança após assinatura em campo.
                          </p>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Função do Fiscal</label>
                          {isClientInfoLocked && (
                            <span className="text-[8px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200 uppercase">Inalterável</span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={formRepresentativeRole}
                          onChange={(e) => setFormRepresentativeRole(e.target.value)}
                          disabled={isClientInfoLocked}
                          placeholder="EX: FISCAL DE CONTRATO / GERENTE"
                          className={cn(
                            "w-full border rounded-xl py-1.5 px-3 text-xs font-semibold outline-none transition-all uppercase",
                            isClientInfoLocked
                              ? "bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed"
                              : "bg-white border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                          )}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">E-mail / Contato do Fiscal</label>
                          {isClientInfoLocked && (
                            <span className="text-[8px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200 uppercase">Inalterável</span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={formRepresentativeContact}
                          onChange={(e) => setFormRepresentativeContact(e.target.value)}
                          disabled={isClientInfoLocked}
                          placeholder="EX: FISCAL@EMPRESA.COM / (82) 99999-9999"
                          className={cn(
                            "w-full border rounded-xl py-1.5 px-3 text-xs font-semibold outline-none transition-all uppercase",
                            isClientInfoLocked
                              ? "bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed"
                              : "bg-white border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                          )}
                        />
                      </div>
                    </div>

                    {/* Assinatura do Cliente e Autenticação dos Técnicos */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-slate-200 rounded-2xl p-4 bg-white">
                      {/* Autenticação Automática dos Técnicos */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Autenticação da Equipe Técnica</span>
                            <span className="px-2 py-0.5 text-[8px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 rounded-full border border-emerald-200">
                              Automática no App
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-600 leading-relaxed font-semibold">
                            A assinatura e autenticação da equipe técnica são vinculadas automaticamente pelo sistema via login e atendimento operacional:
                          </p>
                          <div className="mt-3 p-2.5 bg-white rounded-xl border border-slate-200 text-[10px] text-slate-700 font-bold">
                            {formTechnicianId ? technicians.find(t => t.id === formTechnicianId)?.name : 'Técnico Responsável'}
                            {formTechnician2Id && ` / ${technicians.find(t => t.id === formTechnician2Id)?.name}`}
                            <div className="text-[8px] text-slate-400 mt-0.5 uppercase font-sans font-bold">
                              Autenticação registrada eletronicamente
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Assinatura Digital do Representante do Cliente */}
                      <div>
                        <SignaturePad
                          label="Assinatura Digital do Representante do Cliente"
                          savedValue={formClientSignature}
                          onChange={(val) => {
                            setFormClientSignature(val);
                            if (val && val.trim().length > 0) {
                              setFormClientSignatureDate(new Date().toISOString());
                            } else {
                              setFormClientSignatureDate('');
                            }
                          }}
                          disabled={isClientInfoLocked}
                        />
                        {formClientSignature && (formClientSignatureDate || isClientInfoLocked) && (
                          <p className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 rounded-lg px-2.5 py-1 mt-1.5 flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" />
                            Assinatura coletada {formClientSignatureDate ? `às ${new Date(formClientSignatureDate).toLocaleTimeString('pt-BR')}` : ''}
                          </p>
                        )}
                        {isClientInfoLocked && (
                          <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                            Assinatura coletada no atendimento (Bloqueada para alteração)
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Imagens Anexas */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">Anexos Fotográficos (Imagens do App)</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Adicione fotos do antes/depois da corretiva ou jateamento (máx: 4 fotos)</p>
                  </div>
                  {isLockedForTech && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md">
                      <Lock className="w-2.5 h-2.5 text-amber-600" />
                      Fotos Bloqueadas
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[0, 1, 2, 3].map((num) => (
                    <div key={num} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Foto {num + 1}</span>
                        {formPhotos[num] && (
                          <span className="text-[8px] font-black text-emerald-700 bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 rounded uppercase">
                            Anexada
                          </span>
                        )}
                      </div>
                      {isLockedForTech ? (
                        formPhotos[num] ? (
                          <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                            <img src={formPhotos[num]} alt={`Foto ${num + 1}`} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="aspect-video rounded-lg border border-dashed border-slate-200 bg-slate-100 flex items-center justify-center text-[10px] text-slate-400 font-semibold">
                            Sem Foto
                          </div>
                        )
                      ) : (
                        <ImageUploader
                          value={formPhotos[num] || ''}
                          allowUrl={false}
                          onChange={(val) => {
                            const updated = [...formPhotos];
                            if (val) {
                              updated[num] = val;
                            } else {
                              updated.splice(num, 1);
                            }
                            setFormPhotos(updated.filter(Boolean));
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Assinatura Digital do Cliente (Apenas para o Técnico, após os anexos de imagens) */}
              {userRole === UserRole.TECHNICIAN && (
                <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                        Representante do Cliente <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <input
                        type="text"
                        value={formRepresentative}
                        disabled={isLockedForTech}
                        onChange={(e) => setFormRepresentative(e.target.value)}
                        placeholder="Ex: JOÃO PEREIRA"
                        className={cn(
                          "w-full rounded-xl py-2 px-3 text-xs font-semibold outline-none uppercase",
                          isLockedForTech
                            ? "bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed"
                            : "bg-white border border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                        )}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                        Matrícula Representante <span className="text-rose-500 font-bold">*</span>
                      </label>
                      <input
                        type="text"
                        value={formRepresentativeMatricula}
                        disabled={isLockedForTech}
                        onChange={(e) => setFormRepresentativeMatricula(e.target.value)}
                        placeholder="Ex: 01234"
                        className={cn(
                          "w-full rounded-xl py-2 px-3 text-xs font-semibold outline-none uppercase",
                          isLockedForTech
                            ? "bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed"
                            : "bg-white border border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                        )}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                        Função
                      </label>
                      <input
                        type="text"
                        value={formRepresentativeRole}
                        disabled={isLockedForTech}
                        onChange={(e) => setFormRepresentativeRole(e.target.value)}
                        placeholder="EX: FISCAL / GERENTE"
                        className={cn(
                          "w-full rounded-xl py-2 px-3 text-xs font-semibold outline-none uppercase",
                          isLockedForTech
                            ? "bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed"
                            : "bg-white border border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                        )}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                        E-mail / Contato
                      </label>
                      <input
                        type="text"
                        value={formRepresentativeContact}
                        disabled={isLockedForTech}
                        onChange={(e) => setFormRepresentativeContact(e.target.value)}
                        placeholder="EX: FISCAL@EMPRESA.COM / TELEFONE"
                        className={cn(
                          "w-full rounded-xl py-2 px-3 text-xs font-semibold outline-none uppercase",
                          isLockedForTech
                            ? "bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed"
                            : "bg-white border border-slate-200 text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                        )}
                      />
                    </div>
                  </div>
                  <div>
                    <SignaturePad
                      label="Assinatura Digital do Representante do Cliente *"
                      savedValue={formClientSignature}
                      disabled={isLockedForTech}
                      onChange={(val) => {
                        setFormClientSignature(val);
                        if (val && val.trim().length > 0) {
                          setFormClientSignatureDate(new Date().toISOString());
                        } else {
                          setFormClientSignatureDate('');
                        }
                      }}
                    />
                    {formClientSignature && formClientSignatureDate && (
                      <p className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 rounded-xl px-3 py-1 mt-1.5 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        Assinatura registrada às {new Date(formClientSignatureDate).toLocaleTimeString('pt-BR')}
                      </p>
                    )}
                    {isLockedForTech && (
                      <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-wider flex items-center gap-1">
                        <Lock className="w-3 h-3 text-slate-400" />
                        Assinatura registrada e bloqueada para alterações.
                      </p>
                    )}
                  </div>

                  {/* Indicador de liberação da finalização para o técnico */}
                  {!isLockedForTech && (
                    <div className={cn(
                      "p-3 rounded-xl border text-xs font-medium flex items-center gap-2.5 transition-all",
                      isTechFinalizeReady 
                        ? "bg-emerald-50/90 border-emerald-200 text-emerald-800" 
                        : "bg-amber-50/90 border-amber-200 text-amber-800"
                    )}>
                      {isTechFinalizeReady ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div>
                            <span className="font-black text-emerald-900 block text-[11px] uppercase tracking-wide">
                              O.S. pronta para ser finalizada!
                            </span>
                            <span className="text-[11px] text-emerald-700">
                              Nome do responsável, matrícula e assinatura digital preenchidos com sucesso. O botão "Finalizar atendimento" foi liberado.
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          <div className="flex-1">
                            <span className="font-black text-amber-900 block text-[11px] uppercase tracking-wide">
                              Preenchimento obrigatório para liberar a finalização:
                            </span>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              <span className={cn(
                                "px-2 py-0.5 rounded-md text-[10px] font-bold transition-all",
                                isClientRepFilled 
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300" 
                                  : "bg-white border border-amber-300 text-amber-900"
                              )}>
                                {isClientRepFilled ? '✓ Nome do Responsável' : '• Nome do Responsável'}
                              </span>
                              <span className={cn(
                                "px-2 py-0.5 rounded-md text-[10px] font-bold transition-all",
                                isClientMatriculaFilled 
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300" 
                                  : "bg-white border border-amber-300 text-amber-900"
                              )}>
                                {isClientMatriculaFilled ? '✓ Matrícula' : '• Matrícula'}
                              </span>
                              <span className={cn(
                                "px-2 py-0.5 rounded-md text-[10px] font-bold transition-all",
                                isClientSignatureFilled 
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300" 
                                  : "bg-white border border-amber-300 text-amber-900"
                              )}>
                                {isClientSignatureFilled ? '✓ Assinatura Digital' : '• Assinatura Digital'}
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </form>

            {/* Footer */}
            <div className="border-t border-slate-150 px-6 py-4 bg-slate-50/70 rounded-b-2xl flex flex-wrap justify-between items-center gap-3">
              <div className="text-xs font-black text-slate-700 uppercase">
                {userRole !== UserRole.TECHNICIAN && (
                  `Total Geral OS: R$${(formServices.reduce((sum, item) => sum + item.totalValue, 0) + formProducts.reduce((sum, item) => sum + item.totalValue, 0)).toFixed(2)}`
                )}
                {userRole === UserRole.TECHNICIAN && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-bold">
                    <FileText className="w-4 h-4 text-blue-500" />
                    Atendimento Técnico
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {selectedOrder && (
                  <>
                    <button
                      type="button"
                      id={`btn-print-os-modal-${selectedOrder.id}`}
                      onClick={handlePrintFromEditModal}
                      disabled={isSaving || isHydratingMedia}
                      className="inline-flex items-center justify-center p-2.5 text-slate-500 hover:text-blue-600 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                      title="Imprimir Ordem de Serviço"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      id={`btn-download-excel-modal-${selectedOrder.id}`}
                      onClick={() => downloadOsExcel(selectedOrder)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-all cursor-pointer shadow-2xs active:scale-95"
                      title="Baixar Ordem de Serviço em planilha Excel (.xlsx)"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      <span>Baixar Excel</span>
                    </button>
                  </>
                )}
                {(() => {
                  if (userRole === UserRole.TECHNICIAN) {
                    if (isLockedForTech) {
                      return (
                        <button
                          type="button"
                          onClick={() => setTechActiveTab('my_orders')}
                          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-black uppercase tracking-widest py-2.5 px-4 rounded-xl transition-all cursor-pointer"
                        >
                          Voltar para Minhas O.S.
                        </button>
                      );
                    }
                    return (
                      <>
                        <button
                          type="button"
                          onClick={handleTechSaveDraft}
                          disabled={isSaving}
                          className={cn(
                            "bg-white text-slate-700 border border-slate-300 text-xs font-black uppercase tracking-wider py-3 px-5 rounded-xl transition-all shadow-xs flex items-center gap-2",
                            isSaving ? "opacity-50 cursor-not-allowed pointer-events-none" : "hover:bg-slate-50 cursor-pointer"
                          )}
                        >
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" /> : <Save className="w-4 h-4 text-slate-500" />}
                          Salvar O.S como rascunho
                        </button>
                        <button
                          type="button"
                          onClick={handleTechFinalizeOrder}
                          disabled={!isTechFinalizeReady}
                          className={cn(
                            "text-xs font-black uppercase tracking-wider py-3 px-6 rounded-xl transition-all flex items-center gap-2",
                            isTechFinalizeReady
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md cursor-pointer active:scale-95"
                              : "bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60 shadow-none pointer-events-none"
                          )}
                          title={
                            !isSolutionFilled
                              ? "Preencha o campo Solução para liberar a finalização."
                              : !isClientSignatureFilled || !isClientRepFilled || !isClientMatriculaFilled
                              ? "Preencha a assinatura, nome do responsável e matrícula do cliente para liberar a finalização."
                              : "Finalizar e concluir o atendimento"
                          }
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Finalizar atendimento
                        </button>
                      </>
                    );
                  }

                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setNextOsFeedback(null);
                          setIsFormOpen(false);
                        }}
                        disabled={isSaving}
                        className={cn(
                          "border text-xs font-black uppercase tracking-widest py-2.5 px-4 rounded-xl transition-all",
                          isSaving
                            ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed pointer-events-none opacity-50"
                            : "bg-white border-slate-200 hover:bg-slate-50 text-slate-500 cursor-pointer"
                        )}
                      >
                        Cancelar
                      </button>
                      
                      <button
                        type="button"
                        onClick={(e) => handleSave(e, undefined, undefined, false)}
                        disabled={isSaving || !canSaveOrder}
                        title={
                          !canSaveOrder
                            ? (isOrderCancelled
                                ? 'O.S. cancelada não pode ser alterada.'
                                : 'Esta O.S. já está finalizada. Somente Administradores podem salvar alterações.')
                            : (isAlreadyFinalized && isAdminUser
                                ? 'Salvar alterações de produtos/serviços na O.S. finalizada (Administrador)'
                                : 'Salvar Ordem de Serviço')
                        }
                        className={cn(
                          "text-xs font-black uppercase tracking-widest py-2.5 px-5 rounded-xl transition-all flex items-center gap-1.5",
                          !canSaveOrder
                            ? "bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60 shadow-none"
                            : isSaving
                              ? "bg-blue-400 text-white cursor-not-allowed opacity-80 pointer-events-none shadow-md"
                              : "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-95 shadow-md"
                        )}
                      >
                        {isSaving && !isSavingNext ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Salvando...</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            <span>Salvar OS</span>
                          </>
                        )}
                      </button>
                      
                      {batchIndex >= 0 && batchIndex < batchQueue.length - 1 ? (
                        <button
                          type="button"
                          onClick={(e) => handleSave(e, undefined, undefined, true)}
                          disabled={isSaving || !canSaveOrder}
                          className={cn(
                            "text-white text-xs font-black uppercase tracking-widest py-2.5 px-5 rounded-xl transition-all shadow-md flex items-center gap-1.5",
                            isSaving || !canSaveOrder
                              ? "bg-purple-400 cursor-not-allowed opacity-60 pointer-events-none"
                              : "bg-purple-600 hover:bg-purple-700 cursor-pointer active:scale-95"
                          )}
                          title="Salvar esta O.S. e avançar para a próxima máquina do lote"
                        >
                          {isSavingNext ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-white" />
                              <span>Salvando O.S...</span>
                            </>
                          ) : (
                            <>
                              <span>Próxima</span>
                              <ChevronRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      ) : !selectedOrder && (
                        <button
                          type="button"
                          onClick={(e) => handleSave(e, undefined, undefined, false, false, undefined, true)}
                          disabled={isSaving || !canSaveOrder}
                          className={cn(
                            "text-white text-xs font-black uppercase tracking-widest py-2.5 px-5 rounded-xl transition-all shadow-md flex items-center gap-1.5",
                            isSaving || !canSaveOrder
                              ? "bg-purple-400 cursor-not-allowed opacity-60 pointer-events-none"
                              : "bg-purple-600 hover:bg-purple-700 cursor-pointer active:scale-95"
                          )}
                          title="Salvar esta O.S. e manter o modal aberto para criar a próxima no mesmo cliente e endereço"
                        >
                          {isSavingNext ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-white" />
                              <span>Salvando...</span>
                            </>
                          ) : (
                            <>
                              <span>Próxima</span>
                              <ChevronRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      )}

                      {!isOrderCancelled && (
                        <>
                          {!isAlreadyFinalized && isOtherEquipmentSelected && (
                            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              Substitua "OUTRO EQUIPAMENTO" p/ finalizar
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={handleFinalizeOrder}
                            disabled={!isFinalizeReady || isAlreadyFinalized}
                            className={cn(
                              "text-xs font-black uppercase tracking-widest py-2.5 px-5 rounded-xl transition-all flex items-center gap-1.5",
                              isFinalizeReady && !isAlreadyFinalized
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md cursor-pointer active:scale-95"
                                : "bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60 shadow-none"
                            )}
                            title={
                              isAlreadyFinalized
                                ? "Esta Ordem de Serviço já está finalizada."
                                : isOtherEquipmentSelected
                                  ? "Obrigatório alterar a opção 'OUTRO EQUIPAMENTO' para a máquina correta antes de finalizar a O.S."
                                  : !isSolutionFilled
                                    ? "Preencha o campo Solução para liberar o botão de finalizar a O.S."
                                    : isSolutionDisabled
                                      ? "O campo Solução está desabilitado ou a O.S. está sendo salva."
                                      : "Finalizar Ordem de Serviço"
                            }
                          >
                            <CheckCircle2 className="w-4 h-4" /> Finalizar OS
                          </button>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      );
    })()}

      {/* MODAL: VISUALIZAÇÃO E IMPRESSÃO (PERFEITA COMO O MODELO) */}
      {isPrintPreviewOpen && selectedOrder && (
        <div className="print-modal-container fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto print:static print:p-0 print:m-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto">
          <div className="print-modal-card bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full flex flex-col max-h-[95vh] print:border-none print:shadow-none print:rounded-none print:max-w-none print:max-h-none print:w-full print:h-auto print:m-0 print:p-0 print:block">
            {/* Header de Controle */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50 no-print print:hidden print-hide">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-black text-slate-800 uppercase tracking-widest">Pré-visualização de Impressão (A4)</span>
                {isHydratingMedia && (
                  <span className="inline-flex items-center gap-1.5 ml-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                    <Loader2 className="w-3 h-3 animate-spin" /> Carregando anexos e assinaturas...
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  id="btn-download-excel-print-modal"
                  onClick={() => downloadOsExcel(selectedOrder)}
                  disabled={isHydratingMedia}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest py-2 px-4 rounded-lg transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Baixar Excel
                </button>
                <button
                  type="button"
                  onClick={() => executePrint('os')}
                  disabled={isHydratingMedia}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest py-2 px-4 rounded-lg transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" /> Imprimir Agora
                </button>
                <button
                  onClick={() => setIsPrintPreviewOpen(false)}
                  className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-bold py-2 px-4 rounded-lg transition-all cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* Conteúdo Imprimível do Documento */}
            <div className="print-modal-scroll flex-1 overflow-y-auto p-8 bg-slate-100 flex flex-col items-center gap-6">
              <div id="os-print-area" className="os-print-sheet">
                {renderOrderPrintPages(selectedOrder)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: IMPRESSÃO EM LOTE DE ORDENS DE SERVIÇO (ARQUIVO ÚNICO) */}
      {isBatchPrintModalOpen && (
        <div className="print-modal-container fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full flex flex-col max-h-[92vh] overflow-hidden">
            {/* Cabeçalho do Modal */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                    {batchPrintMode === 'report'
                      ? 'Impressão em Lote — O.S. do Relatório Ativo'
                      : 'Impressão em Lote de Ordens de Serviço'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    {batchPrintMode === 'report'
                      ? 'Marque ou desmarque as Ordens de Serviço abaixo para imprimir todas as selecionadas de uma só vez em um arquivo único.'
                      : 'Digite o número da O.S. e pressione Enter para adicionar a próxima. Todas serão impressas de uma só vez em um arquivo único.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {batchPrintViewMode === 'preview' ? (
                  <button
                    type="button"
                    onClick={() => setBatchPrintViewMode('selection')}
                    className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Voltar à Seleção</span>
                  </button>
                ) : (
                  selectedBatchOrders.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleExecuteBatchPrint(true)}
                      disabled={isBatchPrinting || isAnyBatchEntryLoading}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 border border-slate-200 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Visualizar todas as folhas A4 antes de imprimir"
                    >
                      <Eye className="w-4 h-4" />
                      <span className="hidden sm:inline">Pré-visualizar A4</span>
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() => handleExecuteBatchPrint(false)}
                  disabled={selectedBatchOrders.length === 0 || isBatchPrinting || isAnyBatchEntryLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
                >
                  {isBatchPrinting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Preparando Lote...</span>
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4" />
                      <span>Imprimir {selectedBatchOrders.length} O.S. (Arquivo Único)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsBatchPrintModalOpen(false)}
                  className="p-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 rounded-xl transition-all cursor-pointer"
                  title="Fechar modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {batchPrintViewMode === 'selection' ? (
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Caixa para digitar o número da O.S. e apertar Enter */}
                <form onSubmit={handleAddBatchOsInput} className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center justify-between">
                    <span>
                      {batchPrintMode === 'report'
                        ? 'Adicionar outra O.S. avulsa ao lote (Digite o Nº e aperte Enter)'
                        : 'Digite o Número da O.S. e pressione Enter para adicionar à fila'}
                    </span>
                    <span className="text-[10px] font-bold text-blue-600">
                      Pressione ENTER após cada número
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        ref={batchInputRef}
                        type="text"
                        value={batchPrintInput}
                        onChange={(e) => setBatchPrintInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddBatchOsInput();
                          }
                        }}
                        placeholder="Ex: 65367 (aperte Enter para digitar a próxima O.S.)..."
                        className="w-full pl-10 pr-4 py-3 bg-white border-2 border-blue-200 focus:border-blue-600 rounded-xl text-sm font-black text-slate-800 placeholder:text-slate-400 placeholder:font-semibold outline-none transition-all uppercase shadow-2xs"
                        autoFocus={batchPrintMode === 'manual'}
                      />
                      <FileText className="w-4 h-4 text-blue-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                    <button
                      type="submit"
                      disabled={!batchPrintInput.trim()}
                      className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Adicionar (Enter)</span>
                    </button>
                  </div>
                </form>

                {/* Barra de Resumo e Seleção em Massa */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Ordens de Serviço na Fila:
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800">
                      {selectedBatchOrders.length} selecionada(s) de {batchPrintEntries.length}
                    </span>
                    {isAnyBatchEntryLoading && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                        <Loader2 className="w-3 h-3 animate-spin" /> Buscando O.S...
                      </span>
                    )}
                  </div>

                  {batchPrintEntries.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectAllBatchEntries(true)}
                        className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-all cursor-pointer"
                      >
                        Marcar Todas
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectAllBatchEntries(false)}
                        className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-all cursor-pointer"
                      >
                        Desmarcar Todas
                      </button>
                      <button
                        type="button"
                        onClick={() => setBatchPrintEntries([])}
                        className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-all cursor-pointer"
                      >
                        Limpar Lista
                      </button>
                    </div>
                  )}
                </div>

                {/* Lista de O.S. Adicionadas / Preenchidas do Relatório */}
                {batchPrintEntries.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center space-y-2 bg-slate-50/50">
                    <Printer className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                      Nenhuma Ordem de Serviço adicionada ao lote ainda
                    </p>
                    <p className="text-[11px] text-slate-400 font-medium max-w-md mx-auto">
                      Digite o número da O.S. na caixa acima e aperte <strong>Enter</strong> para ir empilhando todas as ordens que deseja imprimir juntas em um único documento.
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white divide-y divide-slate-100 max-h-[48vh] overflow-y-auto">
                    {batchPrintEntries.map((entry, index) => {
                      if (entry.status === 'loading') {
                        return (
                          <div key={entry.key} className="px-4 py-3 flex items-center justify-between bg-slate-50/60">
                            <div className="flex items-center gap-3">
                              <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                              <span className="text-xs font-black text-slate-700">
                                Buscando O.S. #{entry.queriedNumber}...
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveBatchEntry(entry.key)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      }

                      if (entry.status === 'not_found' || !entry.order) {
                        return (
                          <div key={entry.key} className="px-4 py-3 flex items-center justify-between bg-rose-50/60">
                            <div className="flex items-center gap-3">
                              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                              <div>
                                <span className="text-xs font-black text-rose-800">
                                  O.S. #{entry.queriedNumber} não encontrada
                                </span>
                                <span className="text-[10px] font-semibold text-rose-600 block">
                                  Verifique se o número foi digitado corretamente.
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveBatchEntry(entry.key)}
                              className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[10px] font-black uppercase cursor-pointer"
                            >
                              Remover
                            </button>
                          </div>
                        );
                      }

                      const ord = entry.order;
                      const dispOs = ord.osNumber || (ord.id && !ord.id.startsWith('OS_') ? ord.id : entry.queriedNumber);
                      const matchedAddr = addresses.find((a) => a.id === ord.addressId);
                      const addrLabel = ord.addressStreet || matchedAddr?.street || ord.clientAddress || '---';

                      return (
                        <div
                          key={entry.key}
                          onClick={() => handleToggleBatchEntry(entry.key)}
                          className={cn(
                            "px-4 py-3 flex items-center justify-between gap-3 transition-colors cursor-pointer select-none",
                            entry.selected ? "bg-blue-50/40 hover:bg-blue-50/80" : "bg-white hover:bg-slate-50 opacity-60"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={entry.selected}
                              onChange={() => {}}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleBatchEntry(entry.key);
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                            />
                            <span className="text-[11px] font-black text-slate-400 w-6 shrink-0">
                              {index + 1}.
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-black tracking-wider shrink-0">
                              #{String(dispOs).replace(/^#+/, '')}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-800 truncate">
                                  {ord.clientName || 'Cliente'}
                                </span>
                                {ord.isWorkshop && (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[9px] font-black uppercase shrink-0">
                                    Oficina
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-semibold truncate">
                                {addrLabel} • {ord.equipmentName || ord.type || '---'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className={cn(
                              "px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full",
                              ord.status === 'aberta' ? "bg-blue-50 text-blue-600 border border-blue-100" :
                              ord.status === 'em_andamento' ? "bg-amber-50 text-amber-600 border border-amber-100" :
                              ord.status === 'pre_finalizada' ? "bg-teal-50 text-teal-600 border border-teal-100" :
                              ord.status === 'finalizada' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                              "bg-rose-50 text-rose-600 border border-rose-100"
                            )}>
                              {getStatusLabel(ord.status)}
                            </span>
                            <span className="text-xs font-black text-slate-800 w-20 text-right">
                              R$ {(ord.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveBatchEntry(entry.key);
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Remover da fila de impressão"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Modo de Pré-visualização das Folhas A4 Empilhadas */
              <div className="flex-1 overflow-y-auto p-8 bg-slate-100 flex flex-col items-center gap-6">
                <div className="os-print-sheet">
                  {selectedBatchOrders.map((ord) => (
                    <React.Fragment key={`preview_${ord.id}`}>
                      {renderOrderPrintPages(ord)}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* Container A4 oculto sempre pronto para envio imediato ao iframe de impressão em arquivo único */}
            <div style={{ position: 'fixed', left: '-20000px', top: 0, width: '210mm', pointerEvents: 'none', opacity: 0 }} aria-hidden="true">
              <div id="os-batch-print-area" className="os-print-sheet">
                {selectedBatchOrders.map((ord) => (
                  <React.Fragment key={`batch_print_${ord.id}`}>
                    {renderOrderPrintPages(ord)}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VISUALIZAÇÃO E IMPRESSÃO DE RELATÓRIO CONSOLIDADO */}
      {isReportPrintOpen && (
        <div className="print-modal-container fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto print:static print:p-0 print:m-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto">
          <div className="print-modal-card bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full flex flex-col max-h-[95vh] print:border-none print:shadow-none print:rounded-none print:max-w-none print:max-h-none print:w-full print:h-auto print:m-0 print:p-0 print:block">
            {/* Header de Controle */}
            <div className="border-b border-slate-100 p-4 bg-slate-50 no-print print:hidden print-hide space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Printer className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-black text-slate-800 uppercase tracking-widest">Pré-visualização do Relatório (A4)</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => executePrint('report')}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-widest py-2 px-4 rounded-lg transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" /> Imprimir Agora
                  </button>
                  <button
                    onClick={() => setIsReportPrintOpen(false)}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-bold py-2 px-4 rounded-lg transition-all cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>

              {/* Campo de Observações Gerais no Modal de Impressão */}
              <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-1.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-600 tracking-wider">
                    Observações Gerais (sairá impresso no relatório)
                  </span>
                  {reportGeneralNotes && (
                    <button
                      onClick={() => setReportGeneralNotes('')}
                      className="text-[9px] text-red-500 hover:underline cursor-pointer font-semibold"
                    >
                      Limpar observações
                    </button>
                  )}
                </div>
                <textarea
                  value={reportGeneralNotes}
                  onChange={(e) => setReportGeneralNotes(e.target.value)}
                  placeholder="Insira anotações, recomendações técnicas, escopo atendido ou observações gerais que devem constar no relatório impresso..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-y placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Conteúdo Imprimível do Relatório */}
            <div className="print-modal-scroll flex-1 overflow-y-auto p-8 bg-slate-100 print:p-0 print:m-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto">
              <div
                id="report-print-area"
                className="bg-white border border-slate-300 p-8 print:p-0 print:border-none print:shadow-none mx-auto shadow-sm text-black"
                style={{ width: '100%', maxWidth: '210mm', color: '#000000', fontFamily: 'Arial, sans-serif' }}
              >
                <div className="space-y-4 print:space-y-2">
                  {/* Cabeçalho da Empresa */}
                  <div className="flex justify-between items-start border-b border-slate-300 pb-2.5 print:pb-1.5">
                    <div className="flex gap-4 items-center">
                      {renderCompanyLogo(reportCompany === 'all' ? 'lefrio' : reportCompany)}
                      {(() => {
                        const reportCompanyData = getActiveCompanyForOrder(reportCompany === 'all' ? 'lefrio' : reportCompany);
                        return (
                          <div className="text-[9px] text-slate-700 font-semibold leading-normal">
                            <span className="font-bold text-black text-[10px] block">
                              {reportCompanyData.fullName}
                            </span>
                            CNPJ: {reportCompanyData.cnpj} {reportCompanyData.ie ? `- IE: ${reportCompanyData.ie}` : ''} {reportCompanyData.im ? `- IM: ${reportCompanyData.im}` : ''}<br />
                            Endereço: {reportCompanyData.address}<br />
                            E-mail: {reportCompanyData.email} - Telefone: {reportCompanyData.phone}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="text-right text-[8px] text-slate-500 font-semibold leading-tight">
                      Gerado em: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}<br />
                      Usuário: {userProfile?.name || 'JOSE KENNEDY'}
                    </div>
                  </div>

                  {/* Título Relatório */}
                  <div className="border-b border-black pb-1 text-center">
                    <h2 className="text-sm font-black tracking-wide text-black uppercase">RELATÓRIO CONSOLIDADO DE ORDENS DE SERVIÇO</h2>
                  </div>

                  {/* Filtros Aplicados */}
                  <div className="border border-slate-300 p-2.5 print:p-1.5 bg-slate-50 rounded-sm text-[8.5px] grid grid-cols-2 gap-y-1">
                    <div><span className="font-bold text-slate-600">Período:</span> {reportStartDate ? new Date(reportStartDate).toLocaleDateString('pt-BR') : 'Início'} a {reportEndDate ? new Date(reportEndDate).toLocaleDateString('pt-BR') : 'Fim'}</div>
                    <div><span className="font-bold text-slate-600">Cliente:</span> {reportClientId === 'all' ? 'Todos os Clientes' : (clients.find(c => c.id === reportClientId)?.name || '')}</div>
                    {(reportAppliedFilters.addressId !== 'all' || reportAppliedFilters.addressQuery) && (
                      <div className="col-span-2">
                        <span className="font-bold text-slate-600">Endereço:</span>{' '}
                        {reportAppliedFilters.addressId !== 'all'
                          ? (() => {
                              const addr = addresses.find(a => a.id === reportAppliedFilters.addressId);
                              return addr
                                ? `${addr.street}${addr.number ? `, ${addr.number}` : ''}${addr.name ? ` (${addr.name})` : ''}`
                                : reportAppliedFilters.addressQuery;
                            })()
                          : reportAppliedFilters.addressQuery}
                      </div>
                    )}
                    <div><span className="font-bold text-slate-600">Técnico:</span> {reportTechnicianId === 'all' ? 'Todos os Técnicos' : (technicians.find(t => t.id === reportTechnicianId)?.name || '')}</div>
                    <div><span className="font-bold text-slate-600">Status:</span> {reportStatus === 'all' ? 'Todos os Status' : getStatusLabel(reportStatus).toUpperCase()}</div>
                    <div><span className="font-bold text-slate-600">Empresa:</span> {reportCompany === 'all' ? 'Todas' : getActiveCompanyForOrder(reportCompany).shortName}</div>
                    <div><span className="font-bold text-slate-600">Tipo:</span> {reportType === 'all' ? 'Todos os Tipos' : reportType}</div>
                    {reportWorkshopFilter !== 'all' && (
                      <div className="col-span-2 text-purple-900 font-bold">
                        <span className="text-slate-600">Filtro Oficina:</span> {reportWorkshopFilter === 'workshop_only' ? 'Apenas O.S. com equipamento na Oficina' : 'Apenas O.S. sem Oficina'}
                      </div>
                    )}
                  </div>

                  {/* Estatísticas / KPIs */}
                  <div className="grid grid-cols-4 gap-3 print:gap-2">
                    <div className="border border-slate-300 p-2 print:p-1.5 rounded-sm bg-slate-50 text-center">
                      <span className="text-[8px] font-black uppercase text-slate-500 block">Total de O.S.</span>
                      <span className="text-sm font-black text-slate-800">{reportFilteredOrders.length}</span>
                    </div>
                    <div className="border border-slate-300 p-2 print:p-1.5 rounded-sm bg-slate-50 text-center">
                      <span className="text-[8px] font-black uppercase text-slate-500 block">Valor Faturado</span>
                      <span className="text-sm font-black text-emerald-700">
                        R$ {reportFilteredOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="border border-slate-300 p-2 print:p-1.5 rounded-sm bg-slate-50 text-center">
                      <span className="text-[8px] font-black uppercase text-slate-500 block">Ticket Médio</span>
                      <span className="text-sm font-black text-slate-800">
                        R$ {(reportFilteredOrders.length ? (reportFilteredOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0) / reportFilteredOrders.length) : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="border border-slate-300 p-2 print:p-1.5 rounded-sm bg-slate-50 text-center">
                      <span className="text-[8px] font-black uppercase text-slate-500 block">Serviços / Produtos</span>
                      <span className="text-[8.5px] font-bold text-slate-700 block leading-tight">
                        S: R$ {reportFilteredOrders.reduce((sum, o) => sum + (o.services ? o.services.reduce((sSum, s) => sSum + (s.totalValue || 0), 0) : 0), 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}<br/>
                        P: R$ {reportFilteredOrders.reduce((sum, o) => sum + (o.products ? o.products.reduce((pSum, p) => pSum + (p.totalValue || 0), 0) : 0), 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>

                  {/* Listagem de O.S. */}
                  <div className="space-y-1.5">
                    <h3 className="text-[10px] font-black uppercase text-slate-700 border-b border-black pb-1">Relação de Ordens de Serviço</h3>
                    <table className="w-full text-[8.5px] border-collapse table-fixed leading-tight">
                      <thead>
                        <tr className="bg-slate-100 text-left font-bold border-b border-slate-300">
                          <th className="p-1 px-0.5 border border-slate-300 w-[4.5%] text-center whitespace-nowrap">O.S.</th>
                          <th className="p-1 border border-slate-300 w-[20.5%]">Endereço</th>
                          <th className="p-1 px-0.5 border border-slate-300 w-[5.5%] text-center whitespace-nowrap">Data</th>
                          <th className="p-1 border border-slate-300 w-[52%]">Solução</th>
                          <th className="p-1 border border-slate-300 w-[9%] text-center whitespace-nowrap">Status</th>
                          <th className="p-1 border border-slate-300 w-[8.5%] text-right whitespace-nowrap">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportFilteredOrders.map((o) => {
                          const addr = addresses.find(a => a.id === o.addressId);
                          const addressDisplay = o.addressStreet || addr?.street || o.clientAddress || '---';
                          return (
                            <tr key={o.id} className="border-b border-slate-200">
                              <td className="p-1 px-0.5 border border-slate-300 font-bold whitespace-nowrap align-top text-center text-[8px]">
                                #{o.osNumber || (o.id && !o.id.startsWith('OS_') ? o.id : '00000')}
                              </td>
                              <td className="p-1 border border-slate-300 font-semibold break-words align-top">{addressDisplay}</td>
                              <td className="p-1 px-0.5 border border-slate-300 text-center whitespace-nowrap align-top text-[8px]">
                                {o.openedAt ? new Date(o.openedAt).toLocaleDateString('pt-BR') : '---'}
                              </td>
                              <td className="p-1 border border-slate-300 uppercase font-medium break-words align-top leading-snug">
                                {o.solution ? o.solution : '---'}
                              </td>
                              <td className="p-1 border border-slate-300 text-center font-bold whitespace-nowrap align-top">
                                {getStatusLabel(o.status).toUpperCase()}
                              </td>
                              <td className="p-1 border border-slate-300 text-right font-bold whitespace-nowrap align-top">
                                R$ {o.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Observações Gerais no Relatório Impresso */}
                  {reportGeneralNotes && reportGeneralNotes.trim() && (
                    <div className="border border-slate-300 p-2.5 print:p-2 bg-slate-50 rounded-sm text-[8.5px] print-avoid-break">
                      <span className="font-bold text-slate-800 uppercase block mb-1">Observações Gerais:</span>
                      <p className="text-slate-700 whitespace-pre-wrap leading-relaxed font-medium">
                        {reportGeneralNotes}
                      </p>
                    </div>
                  )}

                  {/* Assinatura de Fechamento de Relatório */}
                  <div className="pt-8 print:pt-6 grid grid-cols-2 gap-12 text-[9px] text-center print-avoid-break">
                    <div>
                      <div className="border-b border-black w-2/3 mx-auto mb-1"></div>
                      <span className="font-bold uppercase">RESPONSÁVEL PELA EMISSÃO</span>
                    </div>
                    <div>
                      <div className="border-b border-black w-2/3 mx-auto mb-1"></div>
                      <span className="font-bold uppercase">DIRETORIA / AUDITORIA</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DIALOG: ALERTA DE PRÉ-CARREGAMENTO DE CHAMADO EM ABERTO PARA O ENDEREÇO */}
      {isOpenCallsWarningModalOpen && pendingOpenCallsData && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200 no-print">
          <div className="bg-white border-2 border-amber-500/80 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            
            {/* Header do Modal Dialog */}
            <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-4 sm:p-5 text-white flex items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-2xl text-white shrink-0 shadow-xs">
                  <AlertTriangle className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
                    Atenção: Chamado Técnico em Aberto!
                  </h3>
                  <p className="text-xs text-amber-100 font-medium">
                    Aviso prévio antes da edição da Ordem de Serviço
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsOpenCallsWarningModalOpen(false);
                  setPendingOpenCallsData(null);
                }}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo do Modal Dialog */}
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-950 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-xs uppercase text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded-md">
                    Endereço Correspondente
                  </span>
                  <span className="text-xs font-black text-amber-900">
                    {pendingOpenCallsData.order.clientName}
                  </span>
                </div>
                <p className="text-xs font-extrabold text-amber-900 leading-snug">
                  {pendingOpenCallsData.order.clientAddress || pendingOpenCallsData.order.addressStreet || 'Endereço cadastrado'}
                </p>
                <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                  Foi localizado <strong>{pendingOpenCallsData.openCalls.length} chamado(s) técnico(s) em aberto</strong> para este endereço. Veja a descrição do problema relatado abaixo para dar a devida atenção durante o atendimento da O.S.
                </p>
              </div>

              {/* Lista dos Chamados Encontrados */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Inbox className="w-4 h-4 text-amber-600" />
                  <span>Chamado(s) em Aberto Encontrado(s):</span>
                </h4>

                {pendingOpenCallsData.openCalls.map((call) => (
                  <div key={call.id} className="bg-slate-50 border-2 border-amber-300 rounded-2xl p-4 space-y-3 shadow-3xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-200 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg">
                          Chamado #{call.id ? call.id.slice(-6).toUpperCase() : '000'}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">
                          Aberto em: {formatDateSafe(call.createdAt)}
                        </span>
                      </div>
                      <span className={cn(
                        "text-[10px] font-black uppercase px-2.5 py-1 rounded-full shadow-2xs",
                        call.priority === 'high' ? "bg-rose-100 text-rose-800 border border-rose-300" :
                        call.priority === 'medium' ? "bg-amber-100 text-amber-800 border border-amber-300" :
                        "bg-blue-100 text-blue-800 border border-blue-300"
                      )}>
                        Prioridade: {call.priority === 'high' ? 'Alta' : call.priority === 'medium' ? 'Média' : 'Baixa'}
                      </span>
                    </div>

                    {/* Descrição / Problema Relatado */}
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                        Descrição do Problema Relatado:
                      </label>
                      <div className="bg-white border-2 border-amber-200 rounded-xl p-3 text-xs font-semibold text-slate-800 leading-relaxed whitespace-pre-wrap shadow-inner">
                        {call.description || 'Sem descrição cadastrada no chamado.'}
                      </div>
                    </div>

                    {call.resolutionNotes && (
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                          Notas do Atendimento:
                        </label>
                        <p className="text-xs text-slate-700 bg-slate-100 p-2.5 rounded-xl border border-slate-200">
                          {call.resolutionNotes}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer do Modal com Botões */}
            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsOpenCallsWarningModalOpen(false);
                  setPendingOpenCallsData(null);
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-wider border border-slate-300 rounded-xl transition-all cursor-pointer shadow-3xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleProceedToEditWithWarning}
                className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 hover:from-amber-700 hover:to-orange-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Entendi / Abrir Edição da O.S.</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Compartilhamento de Link de Assinatura Externa (48h) */}
      <AnimatePresence>
        {shareModalOpen && shareLinkOS && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
            <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                    <Send className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                      Link de Assinatura Externa
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium">Validade de 48 horas para fiscal/cliente</p>
                  </div>
                </div>
                <button
                  onClick={() => setShareModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl space-y-1 text-xs">
                  <div className="flex justify-between items-center text-slate-500">
                    <span className="font-bold text-[10px] uppercase tracking-wider">Ordem de Serviço:</span>
                    <span className="font-black text-slate-900">#{shareLinkOS.osNumber || shareLinkOS.id}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span className="font-bold text-[10px] uppercase tracking-wider">Cliente:</span>
                    <span className="font-bold text-slate-800 truncate max-w-[200px]">{shareLinkOS.clientName}</span>
                  </div>
                </div>

                <div className="bg-amber-50/80 border border-amber-200/80 p-3 rounded-2xl flex items-center gap-2 text-amber-900 text-xs">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-black block text-[11px] uppercase tracking-wider">Link Temporário (48h)</span>
                    <span className="text-[10px] text-amber-800">
                      Expira em: {new Date(shareExpiresAt).toLocaleDateString('pt-BR')} às {new Date(shareExpiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                    Endereço do Link Compartilhável
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      className="w-full bg-slate-100 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 outline-none select-all"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(shareUrl);
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 3000);
                      }}
                      className={cn(
                        "px-3.5 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0 flex items-center gap-1.5 shadow-2xs",
                        isCopied
                          ? "bg-emerald-600 text-white"
                          : "bg-indigo-600 hover:bg-indigo-700 text-white"
                      )}
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
                      <span>{isCopied ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `Olá! Segue o link para conferência e assinatura da Ordem de Serviço Nº ${shareLinkOS.osNumber || shareLinkOS.id} (${shareLinkOS.clientName}):\n\n${shareUrl}\n\nEste link possui validade de 48 horas.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider py-3 px-4 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Enviar via WhatsApp</span>
                  </a>
                </div>
              </div>

              <div className="text-center pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-semibold">
                  O cliente/fiscal poderá visualizar os dados e assinar sem precisar de login.
                </p>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
