import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  FileText, Plus, Search, Filter, Edit, Edit3, Trash2, Printer, 
  X, Save, Calendar, User, Building, MapPin, Wind, 
  AlertCircle, AlertTriangle, DollarSign, Image as ImageIcon, CheckCircle2, Check,
  Trash, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ListPlus, Receipt, Eye, TrendingUp, BarChart2, PieChart as PieChartIcon, Download, Sparkles, FileSpreadsheet,
  Wrench, RotateCcw, XCircle, Ban, Folder, Lock, Unlock, ClipboardCheck, Inbox, Clock, Send, ArrowRight, Zap,
  Maximize2, Minimize2, Smartphone, Layers, Droplets, Loader2
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { cn, generateInitialOsNumber, sortOrdersByCreationDateDesc } from '../lib/utils';
import { buildTechnicianIndex, normalizeTechString } from '../lib/technicianIndex';
import { dataService } from '../services/dataService';
import { CompanyLogo, getCompanyConfigFromCache } from './CompanyLogo';
import { Client, Address, Equipment, Technician, ServiceOrder, ServiceOrderItem, UserRole, ServiceOrderSettings, ServiceCompanyConfig, ServiceCatalogItem, ClientPriceOverride, MaintenanceRecord, JettingControl, MaintenanceStatus, TechOSDraft } from '../types';
import { ImageUploader } from './ImageUploader';
import { JettingControlCenter } from './JettingControlCenter';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';

const isOSRecord = (r: any): boolean => {
  if (!r) return false;
  if (typeof r.id === 'string' && (r.id.includes('_os_') || r.id.startsWith('OS_') || r.id.startsWith('os_'))) return true;
  if (typeof r.notes === 'string' && (r.notes.includes('[O.S.') || r.notes.startsWith('[O.S.'))) return true;
  if (typeof r.routeNotes === 'string' && (r.routeNotes.includes('[O.S.') || r.routeNotes.startsWith('[O.S.'))) return true;
  return false;
};

const formatDateSafe = (dateStr?: string): string => {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  } catch (e) {}
  return dateStr;
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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'reports' | 'jetting'>('list');

  // Estados de Paginação para a Tabela Principal de O.S.
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [jumpPageInput, setJumpPageInput] = useState('');

  // Resetar página atual da tabela principal ao alterar termos de busca, filtros ou tamanho de página
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, startDateFilter, endDateFilter, itemsPerPage, managerClientId]);

  // Estados de Filtro para Relatório Avançado
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportClientId, setReportClientId] = useState('all');
  const [reportTechnicianId, setReportTechnicianId] = useState('all');
  const [reportStatus, setReportStatus] = useState('all');
  const [reportCompany, setReportCompany] = useState('all');
  const [reportType, setReportType] = useState('all');
  const [reportGeneralNotes, setReportGeneralNotes] = useState('');
  
  // Controle de Modais / Form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  
  // Lote de O.S. (Jetting Control)
  const [batchQueue, setBatchQueue] = useState<{jettingControl: JettingControl, machineName: string, originalIndex: number, eqKey: string}[]>([]);
  const [batchIndex, setBatchIndex] = useState(-1);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingNext, setIsSavingNext] = useState(false);
  
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

      // Atualiza o selectedOrder em memória
      setSelectedOrder(prev => prev ? {
        ...prev,
        osNumber: originNumber,
        osNumberChanged: false,
        initialOsNumber: originNumber,
        osNumberResetUsed: true,
        osNumberResetAt: nowISO
      } : null);

      // Atualiza na lista de ordens do componente
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? {
        ...o,
        osNumber: originNumber,
        osNumberChanged: false,
        initialOsNumber: originNumber,
        osNumberResetUsed: true,
        osNumberResetAt: nowISO
      } : o));

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
  const [formServices, setFormServices] = useState<ServiceOrderItem[]>([]);
  const [formProducts, setFormProducts] = useState<ServiceOrderItem[]>([]);
  const [formTechnicianId, setFormTechnicianId] = useState('');
  const [formTechnician2Id, setFormTechnician2Id] = useState('');
  const [formRepresentative, setFormRepresentative] = useState('');
  const [formRepresentativeMatricula, setFormRepresentativeMatricula] = useState('');
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

  // Fecha dropdown de busca de endereço ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addressDropdownRef.current && !addressDropdownRef.current.contains(event.target as Node)) {
        setIsAddressDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Estados para fluxo personalizado de técnico (visualização de O.S. geradas / recebidas do ADM / rascunhos)
  const [techActiveTab, setTechActiveTab] = useState<'my_orders' | 'adm_orders' | 'drafts' | 'form'>('my_orders');
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

  // Carregar dados iniciais
  useEffect(() => {
    loadData();
  }, [managerClientId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ordersList, clientsList, addressesList, techsList, settings, catalog] = await Promise.all([
        dataService.getServiceOrders(managerClientId),
        dataService.getClients(managerClientId),
        dataService.getAddresses(managerClientId),
        dataService.getTechnicians(),
        dataService.getServiceOrderSettings(),
        dataService.getServiceCatalogItems()
      ]);
      
      // REGRA: Somente o sistema administrativo tem autonomia para finalizar uma O.S.
      // Toda ordem de serviço atendida pelo técnico em campo deve aparecer com status 'aberta' (Em aberto).
      // Caso alguma O.S. tenha sido gravada com status 'finalizada' sem a homologação administrativa (adminFinalized === true),
      // ela é normalizada para 'aberta' e tem o flag techFinalized: true atualizado no banco.
      ordersList.forEach(o => {
        if (!o.adminFinalized && o.status === 'finalizada') {
          o.status = 'aberta';
          o.techFinalized = true;
          dataService.updateServiceOrder(o.id, { status: 'aberta', techFinalized: true, adminFinalized: false }).catch(console.error);
        }

        // Corrige bug legado onde o item 336 (Gás R410) estava gravado com desconto indevido de 74.61% gerando valor unitário de ~10
        let orderChanged = false;
        if (o.products && o.products.length > 0) {
          o.products.forEach(p => {
            if (p.code === '336' && (p.discountPercent === 74.61 || p.totalValue === 21.66 || p.totalValue === 10.83 || (p.discountPercent && p.discountPercent > 0))) {
              p.discountPercent = 0;
              const pQty = typeof p.quantity === 'number' ? p.quantity : (parseFloat(String(p.quantity).replace(',', '.')) || 0);
              const pUnit = typeof p.unitValue === 'number' ? p.unitValue : (parseFloat(String(p.unitValue).replace(',', '.')) || 42.65);
              p.totalValue = Number((pQty * pUnit).toFixed(2));
              orderChanged = true;
            }
          });
          if (orderChanged) {
            const sTotal = (o.services || []).reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0);
            const pTotal = o.products.reduce((sum, item) => sum + (Number(item.totalValue) || 0), 0);
            o.totalValue = Number((sTotal + pTotal).toFixed(2));
            dataService.updateServiceOrder(o.id, { products: o.products, totalValue: o.totalValue }).catch(console.error);
          }
        }
      });

      setOrders(sortOrdersByCreationDateDesc(ordersList));
      setClients(clientsList);
      setAddresses(addressesList);
      setTechnicians(techsList);
      setOsSettings(settings);
      setCatalogItems(catalog);

      if (settings) {
        if (settings.maintenanceTypes && settings.maintenanceTypes.length > 0) {
          setFormType(settings.maintenanceTypes[0]);
        }
        if (settings.companies && settings.companies.length > 0) {
          setFormServiceCompany(settings.companies[0].id);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados de OS:', err);
    } finally {
      setLoading(false);
    }
  };

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
    setFormOpenedAt(todayStr);
    setFormOpenedBy(responsibleOpeningName.toUpperCase());
    setFormFinishedAt('');
    setFormExternalOs('');
    setFormPlannedDate('');
    setFormDescription('');
    setFormDiagnosis('');
    setFormSolution('');
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
    
    // Encontra o técnico correspondente com base no texto de autenticação
    if (order.technicianId) {
      setFormTechnicianId(order.technicianId);
    } else {
      const techName = order.authenticatedTeam?.split('AILTON')[1]?.trim() || '';
      const matchTech = technicians.find(t => t.name === techName);
      setFormTechnicianId(matchTech?.id || '');
    }
    setFormTechnician2Id(order.technician2Id || '');
    
    setFormRepresentative(order.clientRepresentative || '');
    setFormRepresentativeMatricula(order.clientRepresentativeMatricula || '');
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
  };

  // Cancelar OS (no lugar de excluir da base de dados, para segurança e auditoria)
  const handleCancel = async (id: string) => {
    if (!window.confirm('Tem certeza de que deseja cancelar esta Ordem de Serviço? A O.S. permanecerá segura no sistema para consultas e histórico com status "Cancelada", e só poderá ser reaberta por um Administrador.')) return;
    try {
      await dataService.cancelServiceOrder(id);
      await loadData();
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
      await loadData();
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
    customOsNumber?: string
  ) => {
    if (e) e.preventDefault();

    if (isSaving) return;

    // Preservar valor da Data Agendada para repassar à próxima O.S. no lote
    const currentPlannedDateToPreserve = formPlannedDate;

    // Verificação de bloqueio para técnicos: se a OS já estiver finalizada ou cancelada, não permite salvar/alterar
    if (userRole === UserRole.TECHNICIAN && selectedOrder) {
      if (selectedOrder.techFinalized || selectedOrder.status === 'finalizada' || selectedOrder.status === 'cancelada') {
        alert('Esta Ordem de Serviço já foi finalizada pelo técnico e não pode mais ser alterada pelo aplicativo.');
        return;
      }
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
    const servicesTotal = formServices.reduce((sum, item) => sum + item.totalValue, 0);
    const productsTotal = formProducts.reduce((sum, item) => sum + item.totalValue, 0);
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
    const finalOsNumber = customOsNumber || formOsNumber.trim() || generateInitialOsNumber();
    const isNewlyGenerated = !formOsNumber.trim() || !originalFormOsNumber;
    const isNumberBeingChangedNow = !isNewlyGenerated && finalOsNumber !== originalFormOsNumber;
    const finalOsNumberChanged = formOsNumberChanged || isNumberBeingChangedNow;
    const resolvedInitialNumber = selectedOrder?.initialOsNumber || formInitialOsNumber || (isNumberBeingChangedNow ? originalFormOsNumber : finalOsNumber) || generateInitialOsNumber();
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
      adminFinalized: userRole !== UserRole.TECHNICIAN && !isTechFinalize && (finalStatus === 'finalizada' || finalStatus === 'pre_finalizada'),
      adminFinalizedAt: (userRole !== UserRole.TECHNICIAN && !isTechFinalize && (finalStatus === 'finalizada' || finalStatus === 'pre_finalizada')) 
        ? (finalFinishedAt || new Date().toISOString()) 
        : (selectedOrder?.adminFinalizedAt || undefined),
      type: formType ? formType.toUpperCase() : '',
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
      
      technicianId: formTechnicianId || undefined,
      technician2Id: formTechnician2Id || undefined,
      authenticatedTeam,
      clientRepresentative: formRepresentative ? formRepresentative.trim().toUpperCase() : undefined,
      clientRepresentativeMatricula: formRepresentativeMatricula ? formRepresentativeMatricula.trim().toUpperCase() : undefined,
      serviceCompany: selectedClient?.serviceCompany || formServiceCompany || 'lefrio',
      photos: formPhotos,
      techSignature: formTechSignature || undefined,
      clientSignature: formClientSignature || undefined,
      clientSignatureDate: formClientSignature ? (formClientSignatureDate || selectedOrder?.clientSignatureDate || new Date().toISOString()) : undefined,
      createdAt: selectedOrder?.createdAt || selectedOrder?.openedAt || (formOpenedAt ? new Date(formOpenedAt).toISOString() : new Date().toISOString()),
      updatedAt: new Date().toISOString()
    };

    setIsSaving(true);
    if (moveNextBatch) {
      setIsSavingNext(true);
    }

    try {
      await dataService.addServiceOrder(newOrder);

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
      loadData();
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
      services: formServices,
      products: formProducts,
      technicianId: formTechnicianId || undefined,
      technician2Id: formTechnician2Id || undefined,
      authenticatedTeam: '',
      clientRepresentative: formRepresentative ? formRepresentative.trim().toUpperCase() : undefined,
      clientRepresentativeMatricula: formRepresentativeMatricula ? formRepresentativeMatricula.trim().toUpperCase() : undefined,
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
    setFormServices(draft.services || []);
    setFormProducts(draft.products || []);
    setFormTechnicianId(draft.technicianId || '');
    setFormTechnician2Id(draft.technician2Id || '');
    setFormRepresentative(draft.clientRepresentative || '');
    setFormRepresentativeMatricula(draft.clientRepresentativeMatricula || '');
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

  // Abrir Visualização de Impressão
  const handlePrint = (order: ServiceOrder) => {
    setSelectedOrder(order);
    setIsPrintPreviewOpen(true);
  };

  // Executar Impressão Real do Navegador
  const executePrint = () => {
    window.print();
  };

  // Baixar Ordem de Serviço em Formato Excel
  const downloadOsExcel = async (order: ServiceOrder) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const displayOsNum = order.osNumber || (order.id && !order.id.startsWith('OS_') ? order.id : '00000');
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
      
      const printCompany = getActiveCompanyForOrder(order.serviceCompany);
      const themeColor = order.serviceCompany === 'alclima' ? '90EE90' : '9cbdde'; // ARGB format (omitting first FF because we can use solid pattern with hex)
      
      const colLetter = (colIdx: number) => String.fromCharCode(65 + colIdx - 1);

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
        
        // Apply borders
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

      // Gerar Logo Base64 dinamicamente usando Canvas HTML5 (ou usar imagem anexada se houver)
      const getCompanyLogoBase64 = (companyKey: string): string => {
        const cached = getCompanyConfigFromCache(companyKey);
        if (cached?.logoUrl) {
          return cached.logoUrl;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 280;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        if (companyKey === 'lefrio') {
          // Design do logo Le Frio
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, 280, 200);

          // Ondas em #68B7F2
          ctx.strokeStyle = '#68B7F2';
          ctx.lineWidth = 10;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          const drawWave = (yOffset: number) => {
            ctx.beginPath();
            ctx.moveTo(65, yOffset);
            ctx.bezierCurveTo(105, yOffset - 35, 175, yOffset + 35, 215, yOffset);
            ctx.stroke();
          };
          drawWave(25);
          drawWave(48);
          drawWave(71);
          drawWave(94);

          // Letras LE FRIO em #3556A8
          ctx.strokeStyle = '#3556A8';
          ctx.lineWidth = 10;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          // L
          ctx.beginPath();
          ctx.moveTo(35, 125);
          ctx.lineTo(35, 175);
          ctx.lineTo(55, 175);
          ctx.stroke();

          // E
          ctx.beginPath();
          ctx.moveTo(85, 125);
          ctx.lineTo(65, 125);
          ctx.lineTo(65, 175);
          ctx.lineTo(85, 175);
          ctx.moveTo(65, 150);
          ctx.lineTo(80, 150);
          ctx.stroke();

          // F
          ctx.beginPath();
          ctx.moveTo(105, 175);
          ctx.lineTo(105, 125);
          ctx.lineTo(125, 125);
          ctx.moveTo(105, 150);
          ctx.lineTo(120, 150);
          ctx.stroke();

          // R
          ctx.beginPath();
          ctx.moveTo(140, 175);
          ctx.lineTo(140, 125);
          ctx.lineTo(158, 125);
          ctx.bezierCurveTo(172, 125, 172, 150, 158, 150);
          ctx.lineTo(140, 150);
          ctx.moveTo(154, 150);
          ctx.lineTo(168, 175);
          ctx.stroke();

          // I
          ctx.beginPath();
          ctx.moveTo(185, 125);
          ctx.lineTo(185, 175);
          ctx.stroke();

          // O
          ctx.beginPath();
          ctx.moveTo(215, 130);
          ctx.lineTo(235, 130);
          ctx.bezierCurveTo(248, 130, 248, 170, 235, 170);
          ctx.lineTo(215, 170);
          ctx.bezierCurveTo(202, 170, 202, 130, 215, 130);
          ctx.closePath();
          ctx.stroke();
        } else {
          // Design do logo Al Clima
          ctx.fillStyle = '#143e1d';
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(0, 0, 280, 200, 12);
          } else {
            ctx.rect(0, 0, 280, 200);
          }
          ctx.fill();

          // Moldura branca fina
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(20, 70);
          ctx.lineTo(20, 180);
          ctx.lineTo(260, 180);
          ctx.lineTo(260, 70);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(20, 70);
          ctx.lineTo(70, 70);
          ctx.moveTo(210, 70);
          ctx.lineTo(260, 70);
          ctx.stroke();

          // Floco de Neve hexagonal no topo centro (x=115, y=56)
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          
          const cx = 115;
          const cy = 56;
          
          for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4;
            const x2 = cx + Math.cos(angle) * 30;
            const y2 = cy + Math.sin(angle) * 30;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            const xSmall = cx + Math.cos(angle) * 20;
            const ySmall = cy + Math.sin(angle) * 20;
            const angleLeft = angle + Math.PI / 4;
            const angleRight = angle - Math.PI / 4;
            ctx.beginPath();
            ctx.moveTo(xSmall, ySmall);
            ctx.lineTo(xSmall + Math.cos(angleLeft) * 8, ySmall + Math.sin(angleLeft) * 8);
            ctx.moveTo(xSmall, ySmall);
            ctx.lineTo(xSmall + Math.cos(angleRight) * 8, ySmall + Math.sin(angleRight) * 8);
            ctx.stroke();
          }

          // Ponto central
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
          ctx.fill();

          // Termômetro no topo direito
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.fillStyle = '#39e75f';
          ctx.beginPath();
          ctx.arc(190, 24, 10, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(184, 4, 12, 16, 6);
          } else {
            ctx.rect(184, 4, 12, 16);
          }
          ctx.stroke();

          // Texto AL CLIMA
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 36px Arial';
          ctx.fillText('AL', 35, 140);
          ctx.fillStyle = '#2fe058';
          ctx.fillText('CLIMA', 95, 140);

          // Texto REFRIGERAÇÃO
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px Arial';
          ctx.fillText('REFRIGERAÇÃO', 70, 168);
        }

        return canvas.toDataURL('image/png');
      };

      // --- ROW 1-4: COMPANY HEADER ---
      worksheet.mergeCells('A1:B4');
      const logoCell = worksheet.getCell('A1');
      logoCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFFFF' }
      };

      try {
        const logoDataUrl = getCompanyLogoBase64(order.serviceCompany);
        const logoImageId = workbook.addImage({
          base64: logoDataUrl.split(',')[1],
          extension: 'png',
        });
        worksheet.addImage(logoImageId, {
          tl: { col: 0.2, row: 0.25 },
          ext: { width: 118, height: 84 },
          editAs: 'oneCell'
        } as any);
      } catch (err) {
        console.error("Erro ao inserir logo no Excel:", err);
      }

      // Company info
      worksheet.mergeCells('C1:L1');
      const compNameCell = worksheet.getCell('C1');
      compNameCell.value = printCompany?.fullName?.toUpperCase();
      compNameCell.font = { bold: false, size: 8.5, name: 'Arial', color: { argb: 'FF000000' } };
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

      // Set explicit compact row heights for company header block
      for (let r = 1; r <= 4; r++) {
        worksheet.getRow(r).height = 13;
      }

      // --- ROW 5: TITLE ---
      worksheet.mergeCells('A5:H5');
      const titleCell = worksheet.getCell('A5');
      titleCell.value = `ORDEM DE SERVIÇO: ${order.osNumber || (order.id && !order.id.startsWith('OS_') ? order.id : '00000')}`;
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
      const clientObj = clients.find(c => c.id === order.clientId);
      const clientName = clientObj?.fullName || clientObj?.name || order.clientName;
      const clientCnpj = clientObj?.cnpj || order.clientCnpj || '-';
      writeMergedLabelField(9, 1, 9, 8, 'Razão Social', clientName);
      writeMergedLabelField(9, 9, 9, 12, 'CNPJ', clientCnpj);
      worksheet.getRow(9).height = 20;

      // --- ROW 10: CLIENT LINE 2 (E-mail & Telefone) ---
      const clientEmail = clientObj?.email || order.clientEmail || '-';
      const clientPhone = clientObj?.phone || order.clientPhone || '-';
      writeMergedLabelField(10, 1, 10, 8, 'E-mail', clientEmail);
      writeMergedLabelField(10, 9, 10, 12, 'Telefone', clientPhone);
      worksheet.getRow(10).height = 20;

      // --- ROW 11: CLIENT LINE 3 (Endereço) ---
      const addrObj = addresses.find(a => a.id === order.addressId);
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
        : (order.clientAddress || clientObj?.fullAddress || '-');
      writeMergedLabelField(11, 1, 11, 12, 'Endereço', computedAddress);
      worksheet.getRow(11).height = 20;

      // Add empty spacing rows with comfortable shorter heights to separate client and OS data
      worksheet.getRow(12).height = 10;
      worksheet.getRow(13).height = 10;

      // --- ROW 14: SECTION HEADER "OS: [número]" ---
      writeSectionHeader(14, `OS: ${order.osNumber || (order.id && !order.id.startsWith('OS_') ? order.id : '00000')}`);
      worksheet.getRow(14).height = 22;

      // --- ROW 15: OS LINE 1 (Situação & Tipo) ---
      writeMergedLabelField(15, 1, 15, 4, 'Situação', getStatusLabel(order.status).toUpperCase());
      writeMergedLabelField(15, 5, 15, 12, 'Tipo', order.type);
      worksheet.getRow(15).height = 20;

      // --- ROW 16: OS LINE 2 (Datas e OS Externa) ---
      const openedAtStr = order.openedAt ? new Date(order.openedAt).toLocaleString('pt-BR') : '-';
      const executionAtStr = (order.finishedAt || order.updatedAt) ? new Date(order.finishedAt || order.updatedAt).toLocaleString('pt-BR') : '-';
      writeMergedLabelField(16, 1, 16, 3, 'Data Abertura', openedAtStr);
      writeMergedLabelField(16, 4, 16, 6, 'Resp. Abertura', order.openedBy || '-');
      writeMergedLabelField(16, 7, 16, 9, 'Execução', executionAtStr);
      writeMergedLabelField(16, 10, 16, 12, 'OS Externa', order.externalOs || '-');
      worksheet.getRow(16).height = 20;

      // --- ROW 17: OS LINE 3 (Descrição do Problema) ---
      writeMergedLabelField(17, 1, 17, 12, 'Descrição do Problema', order.description);
      worksheet.getRow(17).height = 20;

      // --- ROW 18: OS LINE 4 (Diagnóstico) ---
      writeMergedLabelField(18, 1, 18, 12, 'Diagnóstico', order.diagnosis || '-');
      worksheet.getRow(18).height = 20;

      // --- ROW 19: OS LINE 5 (Solução) ---
      writeMergedLabelField(19, 1, 19, 12, 'Solução', order.solution || '-');
      worksheet.getRow(19).height = 20;

      // Add empty spacing rows with comfortable shorter heights to separate OS data and Details
      worksheet.getRow(20).height = 10;
      worksheet.getRow(21).height = 10;

      // --- ROW 22: SECTION HEADER "DETALHES" ---
      writeSectionHeader(22, 'DETALHES');
      worksheet.getRow(22).height = 22;

      // --- ROW 23: DETALHES LINE 1 (Equipamento & Marca) ---
      writeMergedLabelField(23, 1, 23, 6, 'Equipamento', order.equipmentName || '-');
      writeMergedLabelField(23, 7, 23, 12, 'Marca', order.equipmentBrand || '-');
      worksheet.getRow(23).height = 20;

      // --- ROW 24: DETALHES LINE 2 (Setor, BTUs, Patrimônio) ---
      writeMergedLabelField(24, 1, 24, 4, 'Setor', order.equipmentSector || '-');
      writeMergedLabelField(24, 5, 24, 8, 'BTUs', order.equipmentBtus || '-');
      writeMergedLabelField(24, 9, 24, 12, 'Patrimônio / Tombamento', order.equipmentPatrimony || '-');
      worksheet.getRow(24).height = 20;

      // Add empty spacing rows with comfortable shorter heights to separate Details and tables
      worksheet.getRow(25).height = 10;
      worksheet.getRow(26).height = 10;

      let currentRow = 27;

      // --- SERVICES TABLE (if present) ---
      if (order.services && order.services.length > 0) {
        // Section Header Row
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

        // Table Header
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

        // Row details
        order.services.forEach(srv => {
          // Code
          worksheet.getCell(`A${currentRow}`).value = srv.code;
          worksheet.getCell(`A${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

          // Description
          worksheet.mergeCells(`B${currentRow}:G${currentRow}`);
          const descCell = worksheet.getCell(`B${currentRow}`);
          descCell.value = srv.description;
          descCell.font = { bold: false, size: 8, name: 'Arial' };
          descCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

          // Unit
          worksheet.getCell(`H${currentRow}`).value = srv.unit;
          worksheet.getCell(`H${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

          // Qty
          worksheet.getCell(`I${currentRow}`).value = srv.quantity;
          worksheet.getCell(`I${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };
          worksheet.getCell(`I${currentRow}`).numFmt = '#,##0';

          // Unit value
          worksheet.getCell(`J${currentRow}`).value = srv.unitValue;
          worksheet.getCell(`J${currentRow}`).numFmt = '"R$"#,##0.00';
          worksheet.getCell(`J${currentRow}`).alignment = { vertical: 'middle', horizontal: 'right' };

          // Discount
          worksheet.getCell(`K${currentRow}`).value = srv.discountPercent / 100;
          worksheet.getCell(`K${currentRow}`).numFmt = '0.0%';
          worksheet.getCell(`K${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

          // Total value
          worksheet.getCell(`L${currentRow}`).value = srv.totalValue;
          worksheet.getCell(`L${currentRow}`).numFmt = '"R$"#,##0.00';
          worksheet.getCell(`L${currentRow}`).font = { bold: true, size: 8, name: 'Arial' };
          worksheet.getCell(`L${currentRow}`).alignment = { vertical: 'middle', horizontal: 'right' };

          // Borders & standard fonts
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

        // Spacing row
        worksheet.addRow([]);
        currentRow++;
      }

      // --- PRODUCTS TABLE (if present) ---
      if (order.products && order.products.length > 0) {
        // Section Header Row
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

        // Table Header
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

        // Row details
        order.products.forEach(prod => {
          // Code
          worksheet.getCell(`A${currentRow}`).value = prod.code;
          worksheet.getCell(`A${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

          // Description
          worksheet.mergeCells(`B${currentRow}:G${currentRow}`);
          const descCell = worksheet.getCell(`B${currentRow}`);
          descCell.value = prod.description;
          descCell.font = { bold: false, size: 8, name: 'Arial' };
          descCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

          // Unit
          worksheet.getCell(`H${currentRow}`).value = prod.unit;
          worksheet.getCell(`H${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

          // Qty
          worksheet.getCell(`I${currentRow}`).value = prod.quantity;
          worksheet.getCell(`I${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };
          worksheet.getCell(`I${currentRow}`).numFmt = '#,##0.00';

          // Unit value
          worksheet.getCell(`J${currentRow}`).value = prod.unitValue;
          worksheet.getCell(`J${currentRow}`).numFmt = '"R$"#,##0.00';
          worksheet.getCell(`J${currentRow}`).alignment = { vertical: 'middle', horizontal: 'right' };

          // Discount
          worksheet.getCell(`K${currentRow}`).value = prod.discountPercent / 100;
          worksheet.getCell(`K${currentRow}`).numFmt = '0.0%';
          worksheet.getCell(`K${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };

          // Total value
          worksheet.getCell(`L${currentRow}`).value = prod.totalValue;
          worksheet.getCell(`L${currentRow}`).numFmt = '"R$"#,##0.00';
          worksheet.getCell(`L${currentRow}`).font = { bold: true, size: 8, name: 'Arial' };
          worksheet.getCell(`L${currentRow}`).alignment = { vertical: 'middle', horizontal: 'right' };

          // Borders & standard fonts
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

        // Spacing row
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
      totalValueCell.value = order.totalValue;
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
      // Add 4 empty spacing rows before signatures section
      for (let s = 0; s < 4; s++) {
        currentRow++;
        worksheet.getRow(currentRow).height = 12;
      }
      currentRow++;

      // --- SIGNATURES SECTION ---
      worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
      const clientSignUnderline = worksheet.getCell(`A${currentRow}`);
      clientSignUnderline.border = { bottom: { style: 'thin', color: { argb: 'FF000000' } } };

      worksheet.mergeCells(`G${currentRow}:L${currentRow}`);
      const providerSignUnderline = worksheet.getCell(`G${currentRow}`);
      providerSignUnderline.border = { bottom: { style: 'thin', color: { argb: 'FF000000' } } };
      
      currentRow++;

      // Signatures text
      worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
      const clientSignCell = worksheet.getCell(`A${currentRow}`);
      clientSignCell.value = order.clientRepresentative || 'REPRESENTANTE DO CLIENTE';
      clientSignCell.font = { bold: true, size: 8.5, name: 'Arial' };
      clientSignCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Provider team names
      const pTech1 = technicians.find(t => t.id === order.technicianId);
      const pTech2 = order.technician2Id ? technicians.find(t => t.id === order.technician2Id) : null;
      const techNames = [pTech1?.name, pTech2?.name].filter(Boolean).join(' / ');
      const authDate = order.finishedAt ? new Date(order.finishedAt).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');

      worksheet.mergeCells(`G${currentRow}:L${currentRow}`);
      const providerSignCell = worksheet.getCell(`G${currentRow}`);
      providerSignCell.value = `Equipe autenticada no app JDSmartOS (APP: ${authDate} ${techNames})`;
      providerSignCell.font = { italic: true, size: 7.5, name: 'Arial', color: { argb: 'FF475569' } };
      providerSignCell.alignment = { vertical: 'middle', horizontal: 'center' };

      currentRow++;

      // Signatures subtitle
      worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
      const clientSubCell = worksheet.getCell(`A${currentRow}`);
      clientSubCell.value = order.clientRepresentativeMatricula ? `Matrícula/CPF: ${order.clientRepresentativeMatricula} — ${order.clientName}` : order.clientName;
      clientSubCell.font = { size: 8, name: 'Arial', color: { argb: 'FF475569' } };
      clientSubCell.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.mergeCells(`G${currentRow}:L${currentRow}`);
      const providerSubCell = worksheet.getCell(`G${currentRow}`);
      providerSubCell.value = printCompany?.fullName;
      providerSubCell.font = { bold: true, size: 8, name: 'Arial', color: { argb: 'FF000000' } };
      providerSubCell.alignment = { vertical: 'middle', horizontal: 'center' };

      currentRow++;

      worksheet.mergeCells(`G${currentRow}:L${currentRow}`);
      const providerSub2Cell = worksheet.getCell(`G${currentRow}`);
      providerSub2Cell.value = 'PRESTADORA AUTORIZADA';
      providerSub2Cell.font = { bold: true, size: 7.5, name: 'Arial', color: { argb: 'FF64748B' } };
      providerSub2Cell.alignment = { vertical: 'middle', horizontal: 'center' };

      currentRow++;

      // Write to buffer and trigger download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const displayOsNumDownload = order.osNumber || (order.id && !order.id.startsWith('OS_') ? order.id : '00000');
      link.id = `lnk-download-excel-${order.id}`;
      link.href = downloadUrl;
      link.download = `OS_${displayOsNumDownload}_${order.clientName.replace(/\s+/g, '_')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro ao gerar planilha Excel:', err);
      alert('Erro ao gerar o arquivo Excel da Ordem de Serviço.');
    }
  };  // Filtros de busca com ordenação estrita por data de criação: mais recente para a mais antiga (independente de edição)
  const filteredOrders = useMemo(() => {
    const termClean = (searchTerm || '').trim();
    const termUpper = normalizeTechString(termClean);

    const list = orders.filter(o => {
      let matchSearch = true;
      if (termClean) {
        const idUpper = (o.id || '').toUpperCase();
        const osNumUpper = (o.osNumber || '').toUpperCase();
        const clientUpper = normalizeTechString(o.clientName);
        const equipUpper = normalizeTechString(o.equipmentName);
        const addrUpper = normalizeTechString(o.addressStreet);

        // Busca por técnico transformando tudo em MAIÚSCULAS
        const t1 = techIndex.findTech(o.technicianId);
        const t2 = techIndex.findTech(o.technician2Id);
        const tech1Upper = t1 ? t1.normalizedUpper : normalizeTechString(o.technicianId);
        const tech2Upper = t2 ? t2.normalizedUpper : normalizeTechString(o.technician2Id);
        const techCode1 = t1 ? t1.indexedCode.toUpperCase() : '';
        const techCode2 = t2 ? t2.indexedCode.toUpperCase() : '';

        matchSearch = 
          idUpper.includes(termUpper) || 
          osNumUpper.includes(termUpper) ||
          clientUpper.includes(termUpper) || 
          equipUpper.includes(termUpper) ||
          addrUpper.includes(termUpper) ||
          tech1Upper.includes(termUpper) ||
          tech2Upper.includes(termUpper) ||
          techCode1.includes(termUpper) ||
          techCode2.includes(termUpper);
      }
        
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
      
      return matchSearch && matchStatus && matchDate;
    });

    return sortOrdersByCreationDateDesc(list);
  }, [orders, searchTerm, statusFilter, startDateFilter, endDateFilter, techIndex]);

  // --- PAGINAÇÃO DA TABELA DE ORDENS DE SERVIÇO ---
  const totalFilteredOrders = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredOrders / itemsPerPage));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalFilteredOrders);

  const paginatedOrders = useMemo(() => {
    return filteredOrders.slice(startIndex, endIndex);
  }, [filteredOrders, startIndex, endIndex]);

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
      setCurrentPage(pageNum);
      setJumpPageInput('');
    }
  };

  // --- CÁLCULO DE DADOS PARA GRÁFICOS E RELATÓRIO AVANÇADO ---
  const reportFilteredOrders = useMemo(() => {
    const list = orders.filter(o => {
      if (reportClientId !== 'all' && o.clientId !== reportClientId) return false;
      if (reportTechnicianId !== 'all') {
        const matchesTitular = techIndex.matchesTechTitular(o.technicianId, reportTechnicianId);
        if (!matchesTitular) return false;
      }
      if (reportStatus !== 'all' && o.status !== reportStatus) return false;
      if (reportCompany !== 'all' && o.serviceCompany !== reportCompany) return false;
      if (reportType !== 'all' && o.type !== reportType) return false;
      
      if (reportStartDate || reportEndDate) {
        // Regra do sistema: no caso das ordens de serviço a data a ser considerada é a data de finalização
        const finalizedDate = o.finishedAt || o.adminFinalizedAt || o.techFinalizedAt || o.clientSignatureDate;
        const isFinished = o.status === 'finalizada' || o.status === 'pre_finalizada' || o.techFinalized || o.adminFinalized;
        const rawDate = (isFinished && finalizedDate) ? finalizedDate : (finalizedDate || o.createdAt || o.openedAt);
        if (rawDate) {
          const dateStr = typeof rawDate === 'string' ? rawDate : (rawDate.seconds ? new Date(rawDate.seconds * 1000).toISOString() : '');
          if (dateStr) {
            const dateOnly = dateStr.substring(0, 10);
            if (reportStartDate && dateOnly < reportStartDate) return false;
            if (reportEndDate && dateOnly > reportEndDate) return false;
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
  }, [orders, reportClientId, reportTechnicianId, reportStatus, reportCompany, reportType, reportStartDate, reportEndDate]);

  const clientBillingMap: { [key: string]: number } = {};
  reportFilteredOrders.forEach(o => {
    clientBillingMap[o.clientName] = (clientBillingMap[o.clientName] || 0) + (o.totalValue || 0);
  });
  const clientChartData = Object.entries(clientBillingMap)
    .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const statusChartData = [
    { name: 'Aberta', value: reportFilteredOrders.filter(o => o.status === 'aberta').length, fill: '#ef4444' },
    { name: 'Em Andamento', value: reportFilteredOrders.filter(o => o.status === 'em_andamento').length, fill: '#f59e0b' },
    { name: 'Pré-Finalizada', value: reportFilteredOrders.filter(o => o.status === 'pre_finalizada').length, fill: '#06b6d4' },
    { name: 'Finalizada', value: reportFilteredOrders.filter(o => o.status === 'finalizada').length, fill: '#10b981' },
    { name: 'Cancelada', value: reportFilteredOrders.filter(o => o.status === 'cancelada').length, fill: '#94a3b8' },
  ].filter(d => d.value > 0);

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
      const tech = technicians.find(t => t.id === o.technicianId);
      const tech2 = o.technician2Id ? technicians.find(t => t.id === o.technician2Id) : null;
      const techName = tech && tech2 ? `${tech.name} / ${tech2.name}` : (tech ? tech.name : (tech2 ? tech2.name : 'Não Atribuído'));
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

  const renderPageHeader = (pageNum: number, totalPages: number) => {
    if (!selectedOrder) return null;
    const printCompany = getActiveCompanyForOrder(selectedOrder.serviceCompany);
    return (
      <div className="flex justify-between items-start border-b border-black pb-2 mb-3">
        <div className="flex gap-3 items-center">
          {renderCompanyLogo(selectedOrder.serviceCompany, "w-[82px] h-[54px]")}
          <div className="text-[8.5px] text-black leading-tight">
            <span className="font-bold text-[9.5px] block leading-none mb-0.5 uppercase">
              {printCompany?.fullName}
            </span>
            CNPJ: {printCompany?.cnpj} - IE: {printCompany?.ie || '-'} - IM: {printCompany?.im || '-'}<br />
            Endereço: {printCompany?.address}<br />
            E-mail: {printCompany?.email} - Telefone: {printCompany?.phone}
          </div>
        </div>
        <div className="text-right text-[8px] text-slate-600 font-semibold leading-tight shrink-0">
          Página: {pageNum} de {totalPages}<br />
          Usuário: {userProfile?.name || 'JOSE KENNEDY'}<br />
          Gerado em: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}
        </div>
      </div>
    );
  };

  const renderPageFooter = (pageNum: number, totalPages: number) => {
    if (!selectedOrder) return null;
    const printCompany = getActiveCompanyForOrder(selectedOrder.serviceCompany);
    return (
      <div className="border-t border-black pt-2 flex justify-between items-center text-[7.5px] text-slate-500 font-semibold leading-normal mt-3">
        <div>
          <span className="font-bold text-black uppercase">{printCompany?.fullName}</span><br />
          CNPJ: {printCompany?.cnpj} - IE: {printCompany?.ie || '-'} - IM: {printCompany?.im || '-'}<br />
          Endereço: {printCompany?.address}<br />
          E-mail: {printCompany?.email} - Telefone: {printCompany?.phone}
        </div>
        <div className="text-right shrink-0">
          Página: {pageNum} de {totalPages}<br />
          Usuário: {userProfile?.name || 'JOSE KENNEDY'}<br />
          Gerado em: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Estilo Especial de Impressão Embutido */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0mm !important;
          }

          /* Esconder elementos desnecessários na impressão */
          .no-print,
          .print-hide,
          aside,
          nav,
          header,
          button,
          .print\:hidden {
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

          /* Forçar que todos os containers pais do print-area não restrinjam tamanho e fiquem no fluxo normal */
          html, body, #root, #root > div, main, main > div, main > div > div, main > div > div > div, .print-modal-container {
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

          /* O contêiner do modal deve se comportar de forma estática sem deixar páginas em branco */
          .print-modal-container {
            position: static !important;
            display: block !important;
            background: #ffffff !important;
            backdrop-filter: none !important;
            overflow: visible !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            width: 100% !important;
            inset: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            z-index: auto !important;
          }

          /* O contêiner de cartão do modal */
          .max-w-5xl, .max-h-\\[95vh\\], .rounded-2xl, .shadow-2xl {
            max-width: none !important;
            max-height: none !important;
            height: auto !important;
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: transparent !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
          }

          /* O contêiner do conteúdo imprimível */
          .bg-slate-100, .overflow-y-auto, .flex-1 {
            background: transparent !important;
            overflow: visible !important;
            max-height: none !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }

          #print-area {
            position: relative !important;
            width: 100% !important;
            max-width: 210mm !important;
            min-height: auto !important;
            height: auto !important;
            margin: 0 auto !important;
            padding: 4mm 6mm !important;
            background: transparent !important;
            box-shadow: none !important;
            border: none !important;
            page-break-before: avoid !important;
            break-before: avoid !important;
          }

          .page-container {
            width: 210mm !important;
            min-height: 275mm !important;
            padding: 10mm 12mm !important;
            box-sizing: border-box !important;
            position: relative !important;
            background: white !important;
            page-break-before: auto !important;
            break-before: auto !important;
            page-break-after: always !important;
            break-after: page !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            margin: 0 auto !important;
          }

          .page-container:first-child {
            page-break-before: avoid !important;
            break-before: avoid !important;
            margin-top: 0 !important;
          }

          .page-container:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }

          /* Garante cores fortes */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Permite que a tabela e corpo fluam naturalmente entre as páginas */
          table, tbody {
            page-break-inside: auto !important;
            break-inside: auto !important;
          }

          thead {
            display: table-header-group !important;
          }

          /* Evita quebras no meio de uma linha ou imagem */
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          img, .print-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
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
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Carregando Ordens de Serviço...</p>
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
                      const isOrderSigned = Boolean(order.clientSignature && order.clientSignature.trim().length > 0);
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
                                onClick={() => handleEdit(order)}
                                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <Eye className="w-4 h-4 text-slate-500" />
                                Visualizar Atendimento (Inalterável)
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleEdit(order)}
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
                        onClick={() => handleEdit(order)}
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
            <JettingControlCenter onGenerateOS={handleGenerateJettingOS} onGenerateBatchOS={handleGenerateJettingOSBatch} />
          </div>
        ) : activeTab === 'list' ? (
          <>
            {/* Filtros e Busca */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 border border-slate-200/80 rounded-2xl shadow-3xs no-print">
            {/* Busca */}
            <div className="relative">
              <input 
                type="text" 
                placeholder="Buscar por O.S., Cliente, Equipamento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>

            {/* Filtro de Status */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Status:</span>
              <div className="flex-1 grid grid-cols-3 sm:grid-cols-6 p-1 bg-slate-100 rounded-xl border border-slate-200/40 gap-1">
                {['all', 'aberta', 'em_andamento', 'pre_finalizada', 'finalizada', 'cancelada'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={cn(
                      "py-1.5 text-[8px] font-black rounded-lg transition-all uppercase tracking-widest leading-none cursor-pointer text-center",
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

            {/* Filtro de Período */}
            <div className="flex items-center gap-2">
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
          </div>

          {/* Lista de OS */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-3xs overflow-hidden no-print">
            {loading ? (
              <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-wider text-xs">
                Carregando Ordens de Serviço...
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-wider text-xs">
                Nenhuma Ordem de Serviço encontrada.
              </div>
            ) : (
              <>
                {/* Barra Superior de Resumo e Seleção de Itens por Página */}
                <div className="bg-slate-50/80 px-5 py-3 border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <span>Mostrando</span>
                    <span className="font-black text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-3xs">
                      {totalFilteredOrders === 0 ? '0' : `${startIndex + 1} - ${endIndex}`}
                    </span>
                    <span>de</span>
                    <span className="font-black text-slate-800">{totalFilteredOrders}</span>
                    <span>ordens de serviço</span>
                    {filteredOrders.length !== orders.length && (
                      <span className="text-[10px] text-slate-400 font-medium ml-1">
                        (filtradas do total de {orders.length})
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
                            className={cn(
                              "px-2 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer",
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

                    {totalPages > 1 && (
                      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-3xs">
                        <button
                          type="button"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={safeCurrentPage === 1}
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
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={safeCurrentPage === totalPages}
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
                        <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-4 font-black text-slate-700">
                            #{o.osNumber || (o.id && !o.id.startsWith('OS_') ? o.id : '00000')}
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-extrabold text-slate-800">{o.clientName}</div>
                            <div className="text-[10px] text-slate-400 font-semibold truncate max-w-xs">{o.addressStreet}</div>
                          </td>
                          <td className="px-5 py-4">
                            {o.equipmentName ? (
                              o.equipmentName === 'OUTRO EQUIPAMENTO' || o.equipmentId === 'OUTRO EQUIPAMENTO' ? (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                    <AlertTriangle className="w-3 h-3 text-amber-700" />
                                    OUTRO EQUIPAMENTO
                                  </span>
                                  <div className="text-[9px] text-amber-700 font-bold">Vincular máquina no fechamento</div>
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
                              <button
                                id={`btn-download-excel-allorder-${o.id}`}
                                onClick={() => downloadOsExcel(o)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 rounded-lg transition-all cursor-pointer"
                                title="Baixar Excel"
                              >
                                <FileSpreadsheet className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handlePrint(o)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 rounded-lg transition-all cursor-pointer"
                                title="Imprimir OS"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleEdit(o)}
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
                      onClick={() => setCurrentPage(1)}
                      disabled={safeCurrentPage === 1}
                      className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-3xs"
                      title="Primeira Página"
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </button>

                    {/* Botão Página Anterior */}
                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={safeCurrentPage === 1}
                      className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-3xs"
                      title="Página Anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    {/* Botões de Números de Página */}
                    {getPaginationRange(safeCurrentPage, totalPages).map((p, idx) => {
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
                          onClick={() => setCurrentPage(pageNum)}
                          className={cn(
                            "min-w-[32px] h-8 px-2 text-xs font-black rounded-lg transition-all cursor-pointer flex items-center justify-center",
                            isActive
                              ? "bg-blue-600 text-white shadow-3xs"
                              : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 shadow-3xs"
                          )}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    {/* Botão Próxima Página */}
                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={safeCurrentPage === totalPages}
                      className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-3xs"
                      title="Próxima Página"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>

                    {/* Botão Última Página */}
                    <button
                      type="button"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={safeCurrentPage === totalPages}
                      className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-3xs"
                      title="Última Página"
                    >
                      <ChevronsRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Atalho para ir direto a uma página */}
                  {totalPages > 3 && (
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
          {/* RELATÓRIO AVANÇADO DE O.S. */}
          <div className="bg-white p-5 border border-slate-200/80 rounded-2xl shadow-3xs space-y-4 no-print">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Filter className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Filtros do Relatório de O.S.</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              {/* Período De */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Período De</label>
                <input
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                />
              </div>

              {/* Período Até */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Período Até</label>
                <input
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => setReportEndDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                />
              </div>

              {/* Cliente */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Cliente</label>
                <select
                  value={reportClientId}
                  onChange={(e) => setReportClientId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                >
                  <option value="all">TODOS OS CLIENTES</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Técnico */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Técnico</label>
                <select
                  value={reportTechnicianId}
                  onChange={(e) => setReportTechnicianId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all uppercase"
                >
                  <option value="all">TODOS OS TÉCNICOS</option>
                  {techIndex.indexedTechs.map(it => (
                    <option key={it.id} value={it.originalId}>[{it.indexedCode}] {it.name}</option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Status</label>
                <select
                  value={reportStatus}
                  onChange={(e) => setReportStatus(e.target.value)}
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
              {/* Empresa Prestadora */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Empresa Prestadora</label>
                <select
                  value={reportCompany}
                  onChange={(e) => setReportCompany(e.target.value)}
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
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">Tipo de Manutenção</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
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

              {/* Botões de Ação do Relatório */}
              <div className="flex items-end gap-2">
                <button
                  onClick={handleExportCSV}
                  disabled={reportFilteredOrders.length === 0}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-[10px] font-black uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all border border-slate-200 flex items-center justify-center gap-2 h-[38px] cursor-pointer"
                >
                  <Download className="w-4 h-4 text-slate-500" /> Exportar CSV
                </button>
                <button
                  onClick={() => setIsReportPrintOpen(true)}
                  disabled={reportFilteredOrders.length === 0}
                  className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-black uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all border border-blue-200/50 flex items-center justify-center gap-2 h-[38px] cursor-pointer"
                >
                  <Printer className="w-4 h-4" /> Imprimir Resumo
                </button>
              </div>
            </div>

            {/* Campo de Observações Gerais para o Relatório Impresso */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Observações Gerais (sairá impresso no relatório)
                </label>
                {reportGeneralNotes && (
                  <button
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
          </div>

          {/* Indicadores do Relatório */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
            {/* Total de OS */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-3xs flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Total O.S. Filtradas</span>
                <span className="text-xl font-extrabold text-slate-800 leading-none">{reportFilteredOrders.length}</span>
              </div>
            </div>

            {/* Faturamento Total */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-3xs flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Valor Faturado</span>
                <span className="text-xl font-extrabold text-slate-800 leading-none">
                  R$ {reportFilteredOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Ticket Médio */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-3xs flex items-center gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Ticket Médio por O.S.</span>
                <span className="text-xl font-extrabold text-slate-800 leading-none">
                  R$ {(reportFilteredOrders.length ? (reportFilteredOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0) / reportFilteredOrders.length) : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Divisão Serviços / Produtos */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-3xs flex items-center gap-4">
              <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
                <Receipt className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Serviços vs Produtos</span>
                <div className="text-[10px] text-slate-700 font-bold mt-1">
                  Serv: <span className="text-blue-600">R$ {reportFilteredOrders.reduce((sum, o) => sum + (o.services ? o.services.reduce((sSum, s) => sSum + (s.totalValue || 0), 0) : 0), 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="text-[10px] text-slate-700 font-bold">
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

          {/* Tabela de Resultados no Relatório */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-3xs overflow-hidden no-print">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Ordens de Serviço Filtradas</h3>
              <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full uppercase tracking-wider">
                {reportFilteredOrders.length} Resultados
              </span>
            </div>
            {reportFilteredOrders.length === 0 ? (
              <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-wider text-xs">
                Nenhuma O.S. atende aos filtros definidos.
              </div>
            ) : (
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
                    {reportFilteredOrders.map((o) => {
                      const tech = technicians.find(t => t.id === o.technicianId);
                      const tech2 = o.technician2Id ? technicians.find(t => t.id === o.technician2Id) : null;
                      const techDisplay = tech && tech2 ? `${tech.name} / ${tech2.name}` : (tech ? tech.name : (tech2 ? tech2.name : '---'));
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
                                onClick={() => handleEdit(o)}
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
            )}
          </div>
        </>
      ))}
    </div>

      {/* MODAL: FORMULÁRIO DE O.S. (CRIAR E EDITAR) */}
      {(isFormOpen || (userRole === UserRole.TECHNICIAN && techActiveTab === 'form')) && (() => {
        const isTechnician = userRole === UserRole.TECHNICIAN;
        const isOrderFinalized = Boolean(selectedOrder && (selectedOrder.status === 'finalizada' || selectedOrder.status === 'cancelada'));
        const isLockedForTech = isTechnician && isOrderFinalized;

        const isClientSignatureFilled = Boolean(formClientSignature && formClientSignature.trim().length > 0);
        const isClientRepFilled = Boolean(formRepresentative && formRepresentative.trim().length > 0);
        const isClientMatriculaFilled = Boolean(formRepresentativeMatricula && formRepresentativeMatricula.trim().length > 0);
        const isSolutionFilled = Boolean(formSolution && formSolution.trim().length > 0);
        const isSolutionDisabled = Boolean(isLockedForTech || isSaving);
        const isOtherEquipmentSelected = formEquipmentId === 'OUTRO EQUIPAMENTO' || formEquipmentId === 'OUTRO_EQUIPAMENTO' || (!formEquipmentId && (selectedOrder?.equipmentId === 'OUTRO EQUIPAMENTO' || selectedOrder?.equipmentName === 'OUTRO EQUIPAMENTO'));
        const isTechFinalizeReady = isClientSignatureFilled && isClientRepFilled && isClientMatriculaFilled && isSolutionFilled && !isLockedForTech && !isSaving;
        const isFinalizeReady = isSolutionFilled && !isSolutionDisabled && !isOtherEquipmentSelected;

        return (
        <div className={cn(
          userRole === UserRole.TECHNICIAN
            ? "w-full no-print mt-6"
            : "fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-40 overflow-y-auto no-print"
        )}>
          <div className={cn(
            "bg-white border border-slate-200 rounded-2xl flex flex-col w-full",
            userRole === UserRole.TECHNICIAN
              ? "shadow-3xs"
              : "max-w-4xl my-8 shadow-2xl max-h-[90vh]"
          )}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-150 px-5 py-2.5 bg-slate-50/70 rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  isLockedForTech ? "bg-amber-100 text-amber-700" : "bg-blue-600/10 text-blue-600"
                )}>
                  {isLockedForTech ? <Lock className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      {selectedOrder ? `Editar O.S. #${formOsNumber || (formId && !formId.startsWith('OS_') ? formId : '00000')}` : 'Nova Ordem de Serviço'}
                    </h3>
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
              <button
                type="button"
                onClick={() => userRole === UserRole.TECHNICIAN ? setTechActiveTab('my_orders') : setIsFormOpen(false)}
                className="p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-800 rounded-lg transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo do Form */}
            <form onSubmit={(e) => {
              if (formStatus === 'cancelada') {
                e.preventDefault();
                alert('Esta Ordem de Serviço está cancelada. Para alterá-la ou salvá-la, um Administrador precisa reabri-la primeiro.');
                return;
              }
              handleSave(e);
            }} className={cn("flex-1 p-4 sm:p-5 space-y-3.5", userRole !== UserRole.TECHNICIAN && "overflow-y-auto")}>
              {/* Banner de Carregamento e Salvamento de Próxima O.S */}
              {isSavingNext && (
                <div className="bg-purple-50 border border-purple-200 text-purple-900 rounded-xl px-3 py-2 flex items-center gap-2.5 shadow-2xs animate-pulse text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-700 shrink-0" />
                  <span className="font-bold">Salvando e carregando próxima O.S. da fila...</span>
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
                        <input
                          type="text"
                          value={formOsNumber}
                          onChange={(e) => setFormOsNumber(e.target.value)}
                          disabled={selectedOrder === null || formOsNumberChanged}
                          className={cn(
                            "w-full border rounded-lg py-1.5 px-2.5 text-xs font-bold outline-none transition-all",
                            selectedOrder !== null && formOsNumberChanged ? "pr-8" : "",
                            (selectedOrder !== null && !formOsNumberChanged)
                              ? "bg-white border-blue-200 text-blue-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                              : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                          )}
                          required
                        />
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
                  </div>

                  {/* Datas e Outros - Escritório */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block mb-0.5">Data/Hora Abertura</label>
                      <input
                        type="datetime-local"
                        value={formOpenedAt}
                        onChange={(e) => setFormOpenedAt(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-700 outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block mb-0.5">Resp. Abertura</label>
                      <input
                        type="text"
                        value={formOpenedBy}
                        onChange={(e) => setFormOpenedBy(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-700 outline-none uppercase"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block mb-0.5">Data/Hora Finalização</label>
                      <input
                        type="datetime-local"
                        value={formFinishedAt}
                        onChange={(e) => setFormFinishedAt(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-700 outline-none"
                      />
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
                        <span className="text-[9px] font-black text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded uppercase">
                          Outro Equipamento
                        </span>
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

                    {/* Alerta explicativo dinâmico para OUTRO EQUIPAMENTO */}
                    {formEquipmentId === 'OUTRO EQUIPAMENTO' && (
                      <div className={cn(
                        "mt-2 p-2.5 rounded-xl text-xs flex items-start gap-2 animate-fadeIn",
                        userRole === UserRole.TECHNICIAN
                          ? "bg-amber-50 border border-amber-200 text-amber-900"
                          : "bg-amber-500/15 border-2 border-amber-500/40 text-amber-950 font-medium"
                      )}>
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1 text-[11px] leading-relaxed">
                          {userRole === UserRole.TECHNICIAN ? (
                            <>
                              <strong className="block text-amber-900 font-bold mb-0.5">Opção "OUTRO EQUIPAMENTO" selecionada:</strong>
                              Preencha abaixo no campo <strong>"Descrição do Problema"</strong> os detalhes desta máquina (marca, modelo, ambiente/sala, capacidade aproximada) para que a administração possa identificar e vincular o equipamento correto.
                            </>
                          ) : (
                            <>
                              <strong className="block text-amber-950 font-black uppercase text-[10px] tracking-wide mb-0.5">
                                Regra Administrativa: Troca Obrigatória de Máquina
                              </strong>
                              Esta O.S. foi recebida com a opção <strong>"OUTRO EQUIPAMENTO"</strong>. Consulte as informações descritas pelo técnico em <strong>"Descrição do Problema"</strong> e <strong>selecione a máquina correta cadastrada na listagem acima</strong>. A O.S. não poderá ser finalizada com esta opção provisória.
                            </>
                          )}
                        </div>
                      </div>
                    )}
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
                        <div className="flex items-center gap-2">
                          <Wind className="w-4 h-4 text-blue-600" />
                          <span className="text-xs font-black uppercase tracking-widest text-slate-700">Tabela de Serviços</span>
                          {selectedClientObj && (
                            <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-150">
                              Tabela: {selectedClientObj.name}
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
                                className={cn(
                                  "text-xs font-bold border rounded-lg px-2.5 py-1.5 outline-none cursor-pointer max-w-[190px] truncate transition-all",
                                  selectedServiceCategoryFilter !== 'ALL'
                                    ? "bg-blue-100/80 border-blue-300 text-blue-900 font-black shadow-xs"
                                    : "bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-300"
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
                              onChange={(e) => {
                                const itemId = e.target.value;
                                if (!itemId) return;
                                const found = catalogServices.find(s => s.id === itemId);
                                if (found) {
                                  addServiceRow(found);
                                }
                                e.target.value = '';
                              }}
                              defaultValue=""
                              className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 hover:border-blue-300 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer max-w-[240px] truncate"
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
                                onClick={() => addServiceRow(p)}
                                className="text-[9px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition-all border border-blue-100"
                              >
                                #{p.code}
                              </button>
                            ))
                          )}

                          <button
                            type="button"
                            onClick={() => addServiceRow()}
                            className="text-[9px] font-black bg-blue-600 text-white hover:bg-blue-700 px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 shrink-0"
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
                                  value={srv.code}
                                  onChange={(e) => updateServiceRow(idx, 'code', e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-center font-bold text-slate-700 outline-none uppercase"
                                />
                              </div>
                              <div className="col-span-5">
                                <input
                                  type="text"
                                  placeholder="DESCRIÇÃO DOS SERVIÇOS"
                                  value={srv.description}
                                  onChange={(e) => updateServiceRow(idx, 'description', e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs font-semibold text-slate-700 outline-none uppercase"
                                />
                              </div>
                              <div className="col-span-1">
                                <input
                                  type="text"
                                  placeholder="UN"
                                  value={srv.unit}
                                  onChange={(e) => updateServiceRow(idx, 'unit', e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-center font-bold text-slate-700 outline-none uppercase"
                                />
                              </div>
                              <div className="col-span-1">
                                <input
                                  type="number"
                                  placeholder="QTD"
                                  min="0"
                                  step="1"
                                  value={srv.quantity}
                                  onChange={(e) => updateServiceRow(idx, 'quantity', Number(e.target.value))}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-center font-semibold text-slate-700 outline-none"
                                />
                              </div>
                              <div className="col-span-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="UNITÁRIO"
                                  value={srv.unitValue}
                                  onChange={(e) => updateServiceRow(idx, 'unitValue', Number(e.target.value))}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-right font-bold text-slate-700 outline-none"
                                />
                              </div>
                              <div className="col-span-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="DESC %"
                                  value={srv.discountPercent}
                                  onChange={(e) => updateServiceRow(idx, 'discountPercent', Number(e.target.value))}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-center font-semibold text-slate-700 outline-none"
                                />
                              </div>
                              <div className="col-span-1 flex items-center justify-end gap-1">
                                <span className="font-black text-slate-800 text-xs truncate">
                                  R${srv.totalValue.toFixed(2)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeServiceRow(idx)}
                                  className="text-rose-500 hover:text-rose-700 p-1 rounded-md transition"
                                  title="Remover linha"
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
                        <div className="flex items-center gap-2">
                          <Receipt className="w-4 h-4 text-indigo-650" />
                          <span className="text-xs font-black uppercase tracking-widest text-slate-700">Tabela de Produtos</span>
                          {selectedClientObj && (
                            <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-150">
                              Tabela: {selectedClientObj.name}
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
                                className={cn(
                                  "text-xs font-bold border rounded-lg px-2.5 py-1.5 outline-none cursor-pointer max-w-[190px] truncate transition-all",
                                  selectedProductCategoryFilter !== 'ALL'
                                    ? "bg-indigo-100/80 border-indigo-300 text-indigo-900 font-black shadow-xs"
                                    : "bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300"
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
                              onChange={(e) => {
                                const itemId = e.target.value;
                                if (!itemId) return;
                                const found = catalogProducts.find(p => p.id === itemId);
                                if (found) {
                                  addProductRow(found);
                                }
                                e.target.value = '';
                              }}
                              defaultValue=""
                              className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 hover:border-indigo-300 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer max-w-[240px] truncate"
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
                                onClick={() => addProductRow(p)}
                                className="text-[9px] font-bold text-indigo-650 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-md transition-all border border-indigo-100"
                              >
                                #{p.code}
                              </button>
                            ))
                          )}

                          <button
                            type="button"
                            onClick={() => addProductRow()}
                            className="text-[9px] font-black bg-indigo-650 text-white hover:bg-indigo-700 px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 shrink-0 cursor-pointer"
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
                                  value={prod.code}
                                  onChange={(e) => updateProductRow(idx, 'code', e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-center font-bold text-slate-700 outline-none uppercase"
                                />
                              </div>
                              <div className="col-span-6">
                                <input
                                  type="text"
                                  placeholder="DESCRIÇÃO DO PRODUTO"
                                  value={prod.description}
                                  onChange={(e) => updateProductRow(idx, 'description', e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs font-semibold text-slate-700 outline-none uppercase"
                                />
                              </div>
                              <div className="col-span-1">
                                <input
                                  type="text"
                                  placeholder="UN"
                                  value={prod.unit}
                                  onChange={(e) => updateProductRow(idx, 'unit', e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-center font-bold text-slate-700 outline-none uppercase"
                                />
                              </div>
                              <div className="col-span-1">
                                <input
                                  type="number"
                                  placeholder="QTD"
                                  min="0"
                                  step="1"
                                  value={prod.quantity}
                                  onChange={(e) => updateProductRow(idx, 'quantity', Number(e.target.value))}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-center font-semibold text-slate-700 outline-none"
                                />
                              </div>
                              <div className="col-span-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="UNIT."
                                  value={prod.unitValue}
                                  onChange={(e) => updateProductRow(idx, 'unitValue', Number(e.target.value))}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-right font-bold text-slate-700 outline-none"
                                />
                              </div>
                              <div className="col-span-2 flex items-center justify-end gap-1.5 pr-1">
                                <span className="font-black text-slate-800 text-xs whitespace-nowrap">
                                  R$ {prod.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeProductRow(idx)}
                                  className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded-md transition cursor-pointer shrink-0"
                                  title="Remover linha"
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
                        onClick={() => setIsFormOpen(false)}
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
                        disabled={isSaving}
                        className={cn(
                          "text-white text-xs font-black uppercase tracking-widest py-2.5 px-5 rounded-xl transition-all shadow-md flex items-center gap-1.5",
                          isSaving
                            ? "bg-blue-400 cursor-not-allowed opacity-80 pointer-events-none"
                            : "bg-blue-600 hover:bg-blue-700 cursor-pointer active:scale-95"
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
                      
                      {batchIndex >= 0 && batchIndex < batchQueue.length - 1 && (
                        <button
                          type="button"
                          onClick={(e) => handleSave(e, undefined, undefined, true)}
                          disabled={isSaving}
                          className={cn(
                            "text-white text-xs font-black uppercase tracking-widest py-2.5 px-5 rounded-xl transition-all shadow-md flex items-center gap-1.5",
                            isSaving
                              ? "bg-purple-400 cursor-wait opacity-80 pointer-events-none ring-2 ring-purple-300"
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
                      )}

                      {formStatus !== 'finalizada' && formStatus !== 'cancelada' && (
                        <>
                          {isOtherEquipmentSelected && (
                            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              Substitua "OUTRO EQUIPAMENTO" p/ finalizar
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={handleFinalizeOrder}
                            disabled={!isFinalizeReady}
                            className={cn(
                              "text-xs font-black uppercase tracking-widest py-2.5 px-5 rounded-xl transition-all shadow-md flex items-center gap-1.5",
                              isFinalizeReady
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-95"
                                : "bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60 shadow-none pointer-events-none"
                            )}
                            title={
                              isOtherEquipmentSelected
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
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full flex flex-col max-h-[95vh] print:border-none print:shadow-none print:rounded-none print:max-w-none print:max-h-none print:w-full print:h-auto print:m-0 print:p-0 print:block">
            {/* Header de Controle */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50 no-print print:hidden print-hide">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-black text-slate-800 uppercase tracking-widest">Pré-visualização de Impressão (A4)</span>
              </div>
              <div className="flex gap-2">
                <button
                  id="btn-download-excel-print-modal"
                  onClick={() => downloadOsExcel(selectedOrder)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest py-2 px-4 rounded-lg transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Baixar Excel
                </button>
                <button
                  onClick={executePrint}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-widest py-2 px-4 rounded-lg transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
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
            <div className="flex-1 overflow-y-auto p-8 bg-slate-100 flex flex-col items-center gap-6 print:p-0 print:m-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto">
              <div 
                id="print-area" 
                className="flex flex-col gap-6"
                style={{ width: '210mm', color: '#000000', fontFamily: 'Arial, sans-serif' }}
              >
                {/* --- PÁGINA 1 --- */}
                <div className="page-container bg-white p-[12mm] border border-slate-300 shadow-sm relative flex flex-col justify-between print:border-none print:shadow-none print:p-0">
                  <div className="space-y-4">
                    {/* Cabeçalho */}
                    {renderPageHeader(1, selectedOrder.photos && selectedOrder.photos.length > 0 ? 2 : 1)}

                    {/* Título OS */}
                    <div className="flex justify-between items-center border-b border-black pb-1">
                      <span className="text-sm font-black text-black">ORDEM DE SERVIÇO: {selectedOrder.osNumber || (selectedOrder.id && !selectedOrder.id.startsWith('OS_') ? selectedOrder.id : '00000')}</span>
                      <span className="text-[10px] font-bold text-black">1ª Impressão</span>
                    </div>

                    {/* CLIENTE */}
                    <div className="border border-black rounded-none overflow-hidden">
                      <div className={cn(
                        "px-2 py-1 text-[9px] font-bold uppercase border-b border-black text-black",
                        selectedOrder.serviceCompany === 'alclima' ? 'bg-[#90EE90]/60' : 'bg-[#9cbdde]/60'
                      )}>
                        CLIENTE
                      </div>
                      <div className="grid grid-cols-12 text-[8.5px] leading-tight text-black uppercase">
                        {/* Linha 1 */}
                        <div className="col-span-8 p-1.5 border-r border-b border-black">
                          <span className="font-bold">Razão Social: </span>
                          <span className="font-normal">
                            {(clients.find(c => c.id === selectedOrder.clientId)?.fullName || clients.find(c => c.id === selectedOrder.clientId)?.name || selectedOrder.clientName || '').toUpperCase()}
                          </span>
                        </div>
                        <div className="col-span-4 p-1.5 border-b border-black">
                          <span className="font-bold">CNPJ: </span>
                          <span className="font-normal">{(clients.find(c => c.id === selectedOrder.clientId)?.cnpj || selectedOrder.clientCnpj || '-').toUpperCase()}</span>
                        </div>
                        {/* Linha 2 */}
                        <div className="col-span-8 p-1.5 border-r border-b border-black">
                          <span className="font-bold">E-mail: </span>
                          <span className="font-normal">
                            {(clients.find(c => c.id === selectedOrder.clientId)?.email || selectedOrder.clientEmail || '-').toUpperCase()}
                          </span>
                        </div>
                        <div className="col-span-4 p-1.5 border-b border-black">
                          <span className="font-bold">Telefone: </span>
                          <span className="font-normal">{(clients.find(c => c.id === selectedOrder.clientId)?.phone || selectedOrder.clientPhone || '-').toUpperCase()}</span>
                        </div>
                        {/* Linha 3 */}
                        <div className="col-span-12 p-1.5">
                          <span className="font-bold">Endereço: </span>
                          <span className="font-normal">
                            {(() => {
                              const addr = addresses.find(a => a.id === selectedOrder.addressId);
                              if (addr) {
                                const parts = [
                                  addr.street,
                                  addr.number ? `Nº ${addr.number}` : '',
                                  addr.complement || '',
                                  addr.neighborhood || '',
                                  addr.city || '',
                                  addr.state || '',
                                  addr.cep ? `CEP: ${addr.cep}` : ''
                                ].filter(Boolean);
                                return (parts.length > 0 ? parts.join(' - ') : (selectedOrder.clientAddress || '-')).toUpperCase();
                              }
                              return (selectedOrder.clientAddress || clients.find(c => c.id === selectedOrder.clientId)?.fullAddress || '-').toUpperCase();
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* OS: [número] */}
                    <div className="border border-black rounded-none overflow-hidden">
                      <div className={cn(
                        "px-2 py-1 text-[9px] font-bold uppercase border-b border-black text-black",
                        selectedOrder.serviceCompany === 'alclima' ? 'bg-[#90EE90]/60' : 'bg-[#9cbdde]/60'
                      )}>
                        OS: {selectedOrder.osNumber || (selectedOrder.id && !selectedOrder.id.startsWith('OS_') ? selectedOrder.id : '00000')}
                      </div>
                      <div className="grid grid-cols-12 text-[8.5px] leading-tight text-black uppercase">
                        {/* Linha 1 */}
                        <div className="col-span-4 p-1.5 border-r border-b border-black">
                          <span className="font-bold">Situação: </span>
                          <span className="font-normal">{getStatusLabel(selectedOrder.status).toUpperCase()}</span>
                        </div>
                        <div className="col-span-8 p-1.5 border-b border-black">
                          <span className="font-bold">Tipo: </span>
                          <span className="font-normal">{(selectedOrder.type || '').toUpperCase()}</span>
                        </div>
                        {/* Linha 2 */}
                        <div className="col-span-3 p-1.5 border-r border-b border-black">
                          <span className="font-bold">Data Abertura: </span>
                          <span className="font-normal">
                            {selectedOrder.openedAt ? new Date(selectedOrder.openedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                          </span>
                        </div>
                        <div className="col-span-3 p-1.5 border-r border-b border-black">
                          <span className="font-bold">Resp. Abertura: </span>
                          <span className="font-normal">{(selectedOrder.openedBy || '-').toUpperCase()}</span>
                        </div>
                        <div className="col-span-3 p-1.5 border-r border-b border-black">
                          <span className="font-bold">Execução: </span>
                          <span className="font-normal">
                            {(selectedOrder.finishedAt || selectedOrder.updatedAt) ? new Date(selectedOrder.finishedAt || selectedOrder.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                          </span>
                        </div>
                        <div className="col-span-3 p-1.5 border-b border-black">
                          <span className="font-bold">OS Externa: </span>
                          <span className="font-normal">{(selectedOrder.externalOs || '-').toUpperCase()}</span>
                        </div>
                        {/* Linha 3: Descrição do Problema */}
                        <div className={cn("col-span-12 p-1.5", (selectedOrder.diagnosis || selectedOrder.solution) && "border-b border-black")}>
                          <span className="font-bold">Descrição do Problema: </span>
                          <span className="font-normal">{(selectedOrder.description || '').toUpperCase()}</span>
                        </div>
                        {/* Linha 4: Diagnóstico */}
                        {selectedOrder.diagnosis && (
                          <div className={cn("col-span-12 p-1.5", selectedOrder.solution && "border-b border-black")}>
                            <span className="font-bold">Diagnóstico: </span>
                            <span className="font-normal">{(selectedOrder.diagnosis || '').toUpperCase()}</span>
                          </div>
                        )}
                        {/* Linha 5: Solução */}
                        {selectedOrder.solution && (
                          <div className="col-span-12 p-1.5">
                            <span className="font-bold">Solução: </span>
                            <span className="font-normal">{(selectedOrder.solution || '').toUpperCase()}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* DETALHES (Equipamento) */}
                    <div className="border border-black rounded-none overflow-hidden">
                      <div className={cn(
                        "px-2 py-1 text-[9px] font-bold uppercase border-b border-black text-black",
                        selectedOrder.serviceCompany === 'alclima' ? 'bg-[#90EE90]/60' : 'bg-[#9cbdde]/60'
                      )}>
                        DETALHES
                      </div>
                      <div className="grid grid-cols-12 text-[8.5px] leading-tight text-black uppercase">
                        {/* Linha 1 */}
                        <div className="col-span-6 p-1.5 border-r border-b border-black">
                          <span className="font-bold">Equipamento: </span>
                          <span className="font-normal">{(selectedOrder.equipmentName || '-').toUpperCase()}</span>
                        </div>
                        <div className="col-span-6 p-1.5 border-b border-black">
                          <span className="font-bold">Marca: </span>
                          <span className="font-normal">{(selectedOrder.equipmentBrand || '-').toUpperCase()}</span>
                        </div>
                        {/* Linha 2 */}
                        <div className="col-span-4 p-1.5 border-r border-black">
                          <span className="font-bold">Setor: </span>
                          <span className="font-normal">{(selectedOrder.equipmentSector || '-').toUpperCase()}</span>
                        </div>
                        <div className="col-span-4 p-1.5 border-r border-black">
                          <span className="font-bold">BTUs: </span>
                          <span className="font-normal">{(selectedOrder.equipmentBtus || '-').toUpperCase()}</span>
                        </div>
                        <div className="col-span-4 p-1.5">
                          <span className="font-bold">Patrimônio / Tombamento: </span>
                          <span className="font-normal">{(selectedOrder.equipmentPatrimony || '-').toUpperCase()}</span>
                        </div>
                      </div>
                    </div>

                    {/* TABELA DE PRODUTOS / SERVIÇOS E TOTAL */}
                    {(((selectedOrder.services && selectedOrder.services.length > 0) || (selectedOrder.products && selectedOrder.products.length > 0)) || selectedOrder.totalValue > 0) && (
                      <div className="border border-black rounded-none overflow-hidden">
                        {/* TABELA DE SERVIÇOS */}
                        {selectedOrder.services && selectedOrder.services.length > 0 && (
                          <div>
                            <div className="p-1 font-bold bg-slate-100 border-b border-black text-[8px] uppercase px-2">
                              Descrição dos Serviços
                            </div>
                            <table className="min-w-full text-[8.5px] leading-tight border-collapse">
                              <thead>
                                <tr className={cn(
                                  "border-b border-black text-black",
                                  selectedOrder.serviceCompany === 'alclima' ? 'bg-[#90EE90]/60' : 'bg-[#9cbdde]/60'
                                )}>
                                  <th className="border-r border-black px-2 py-1 font-bold text-center" style={{ width: '8%' }}>Código</th>
                                  <th className="border-r border-black px-2 py-1 font-bold text-left" style={{ width: '55%' }}>Descrição dos Serviços</th>
                                  <th className="border-r border-black px-2 py-1 font-bold text-center" style={{ width: '6%' }}>Un.</th>
                                  <th className="border-r border-black px-2 py-1 font-bold text-center" style={{ width: '6%' }}>Qtd.</th>
                                  <th className="border-r border-black px-2 py-1 font-bold text-right" style={{ width: '10%' }}>Valor Unit.</th>
                                  <th className="border-r border-black px-2 py-1 font-bold text-center" style={{ width: '7%' }}>Desc. (%)</th>
                                  <th className="px-2 py-1 font-bold text-right" style={{ width: '10%' }}>Valor Total</th>
                                </tr>
                              </thead>
                              <tbody className="uppercase">
                                {selectedOrder.services.map((srv, index) => (
                                  <tr key={index} className="border-b border-black last:border-b-0">
                                    <td className="border-r border-black px-2 py-1 text-center font-bold">{(srv.code || '').toUpperCase()}</td>
                                    <td className="border-r border-black px-2 py-1 font-normal leading-relaxed text-left text-black">{(srv.description || '').toUpperCase()}</td>
                                    <td className="border-r border-black px-2 py-1 text-center">{(srv.unit || '').toUpperCase()}</td>
                                    <td className="border-r border-black px-2 py-1 text-center">{srv.quantity}</td>
                                    <td className="border-r border-black px-2 py-1 text-right">R$ {srv.unitValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="border-r border-black px-2 py-1 text-center">{srv.discountPercent}%</td>
                                    <td className="px-2 py-1 text-right font-bold">R$ {srv.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* TABELA DE PRODUTOS */}
                        {selectedOrder.products && selectedOrder.products.length > 0 && (
                          <div className={cn(selectedOrder.services && selectedOrder.services.length > 0 && "border-t border-black")}>
                            <div className="p-1 font-bold bg-slate-100 border-b border-black text-[8px] uppercase px-2">
                              Descrição dos Produtos
                            </div>
                            <table className="min-w-full text-[8.5px] leading-tight border-collapse">
                              <thead>
                                <tr className={cn(
                                  "border-b border-black text-black",
                                  selectedOrder.serviceCompany === 'alclima' ? 'bg-[#90EE90]/60' : 'bg-[#9cbdde]/60'
                                )}>
                                  <th className="border-r border-black px-2 py-1 font-bold text-center" style={{ width: '8%' }}>Código</th>
                                  <th className="border-r border-black px-2 py-1 font-bold text-left" style={{ width: '55%' }}>Descrição dos Produtos</th>
                                  <th className="border-r border-black px-2 py-1 font-bold text-center" style={{ width: '6%' }}>Un.</th>
                                  <th className="border-r border-black px-2 py-1 font-bold text-center" style={{ width: '6%' }}>Qtd.</th>
                                  <th className="border-r border-black px-2 py-1 font-bold text-right" style={{ width: '10%' }}>Valor Unit.</th>
                                  <th className="border-r border-black px-2 py-1 font-bold text-center" style={{ width: '7%' }}>Desc. (%)</th>
                                  <th className="px-2 py-1 font-bold text-right" style={{ width: '10%' }}>Valor Total</th>
                                </tr>
                              </thead>
                              <tbody className="uppercase">
                                {selectedOrder.products.map((prod, index) => (
                                  <tr key={index} className="border-b border-black last:border-b-0">
                                    <td className="border-r border-black px-2 py-1 text-center font-bold">{(prod.code || '').toUpperCase()}</td>
                                    <td className="border-r border-black px-2 py-1 font-normal leading-relaxed text-left text-black">{(prod.description || '').toUpperCase()}</td>
                                    <td className="border-r border-black px-2 py-1 text-center">{(prod.unit || '').toUpperCase()}</td>
                                    <td className="border-r border-black px-2 py-1 text-center">{prod.quantity.toFixed(2).replace('.', ',')}</td>
                                    <td className="border-r border-black px-2 py-1 text-right">R$ {prod.unitValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="border-r border-black px-2 py-1 text-center">{prod.discountPercent}%</td>
                                    <td className="px-2 py-1 text-right font-bold">R$ {prod.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* LINHA FINAL: TOTAL DA OS */}
                        <div className="border-t border-black p-2 flex justify-end">
                          <div className="text-right font-bold text-black text-[10px]">
                            Total da OS: R$ {selectedOrder.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ASSINATURAS E AUTENTICAÇÃO */}
                    <div className="pt-6 grid grid-cols-12 gap-8 text-[8px] items-end leading-normal">
                      {/* Coluna Esquerda: Cliente */}
                      <div className="col-span-6 text-center space-y-1">
                        <div className="h-12 flex items-center justify-center">
                          {selectedOrder.clientSignature ? (
                            <img src={selectedOrder.clientSignature} alt="Assinatura Cliente" className="max-h-12 object-contain" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="h-10"></div>
                          )}
                        </div>
                        <div className="w-full border-b border-black mx-auto mb-1"></div>
                        <span className="font-bold text-black uppercase block">
                          {selectedOrder.clientRepresentative || 'REPRESENTANTE DO CLIENTE'}
                        </span>
                        {selectedOrder.clientRepresentativeMatricula && (
                          <span className="text-slate-600 block">Matrícula/CPF: {selectedOrder.clientRepresentativeMatricula}</span>
                        )}
                        {selectedOrder.clientSignatureDate && (
                          <span className="text-slate-600 block text-[8px] font-bold">
                            Assinado às {new Date(selectedOrder.clientSignatureDate).toLocaleTimeString('pt-BR')} ({new Date(selectedOrder.clientSignatureDate).toLocaleDateString('pt-BR')})
                          </span>
                        )}
                        <span className="text-slate-500 block text-[8px] uppercase tracking-wider font-semibold">
                          {selectedOrder.clientName}
                        </span>
                      </div>

                      {/* Coluna Direita: Prestadora */}
                      <div className="col-span-6 text-center space-y-1">
                        <div className="text-[8px] text-slate-700 italic font-semibold mb-2 leading-tight">
                          {(() => {
                            const t1 = technicians.find(t => t.id === selectedOrder.technicianId);
                            const t2 = selectedOrder.technician2Id ? technicians.find(t => t.id === selectedOrder.technician2Id) : null;
                            const names = [t1?.name, t2?.name].filter(Boolean).join(' / ');
                            const dateStr = selectedOrder.finishedAt ? new Date(selectedOrder.finishedAt).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');
                            return `Equipe autenticada no aplicativo JDSmartOS (APP: ${dateStr} ${names})`;
                          })()}
                        </div>
                        <div className="h-12 flex items-center justify-center">
                          {selectedOrder.techSignature ? (
                            <img src={selectedOrder.techSignature} alt="Assinatura Técnico" className="max-h-12 object-contain" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="h-10"></div>
                          )}
                        </div>
                        <div className="w-full border-b border-black mx-auto mb-1"></div>
                        <span className="font-bold text-black uppercase block">
                          {printCompany?.fullName}
                        </span>
                        <span className="text-slate-500 block text-[8px] uppercase tracking-wider font-semibold">
                          PRESTADORA AUTORIZADA
                        </span>
                      </div>
                    </div>


                  </div>

                  {/* Rodapé Página 1 */}
                  {renderPageFooter(1, selectedOrder.photos && selectedOrder.photos.length > 0 ? 2 : 1)}
                </div>

                {/* --- PÁGINA 2: ANEXOS FOTOGRÁFICOS --- */}
                {selectedOrder.photos && selectedOrder.photos.length > 0 && (
                  <div className="page-container bg-white p-[12mm] border border-slate-300 shadow-sm relative flex flex-col justify-between page-break print:border-none print:shadow-none print:p-0">
                    <div className="space-y-4">
                      {/* Cabeçalho */}
                      {renderPageHeader(2, 2)}

                      {/* Título de Seção */}
                      <div className="flex justify-between items-center border-b border-black pb-1">
                        <span className="text-sm font-black text-black">ORDEM DE SERVIÇO: {selectedOrder.osNumber || (selectedOrder.id && !selectedOrder.id.startsWith('OS_') ? selectedOrder.id : '00000')}</span>
                        <span className="text-[10px] font-bold text-black">Anexos Fotográficos</span>
                      </div>

                      <div className="border border-black rounded-none overflow-hidden">
                        <div className={cn(
                          "px-2 py-1 text-[9px] font-bold uppercase text-black",
                          selectedOrder.serviceCompany === 'alclima' ? 'bg-[#90EE90]/60' : 'bg-[#9cbdde]/60'
                        )}>
                          ANEXOS DO APP - OS: {selectedOrder.osNumber || (selectedOrder.id && !selectedOrder.id.startsWith('OS_') ? selectedOrder.id : '00000')}
                        </div>
                      </div>

                      {/* Grid de Fotos */}
                      <div className="grid grid-cols-2 gap-4 pt-4">
                        {selectedOrder.photos.slice(0, 4).map((ph, idx) => (
                          <div key={idx} className="border border-black p-2 rounded-none bg-slate-50 flex flex-col items-center justify-center">
                            <img 
                              src={ph} 
                              alt={`Evidência ${idx + 1}`} 
                              className="h-44 w-full object-contain rounded-none"
                              referrerPolicy="no-referrer"
                            />
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 mt-2 block">
                              Foto {idx + 1} - Evidência de Execução
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VISUALIZAÇÃO E IMPRESSÃO DE RELATÓRIO CONSOLIDADO */}
      {isReportPrintOpen && (
        <div className="print-modal-container fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto print:static print:p-0 print:m-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full flex flex-col max-h-[95vh] print:border-none print:shadow-none print:rounded-none print:max-w-none print:max-h-none print:w-full print:h-auto print:m-0 print:p-0 print:block">
            {/* Header de Controle */}
            <div className="border-b border-slate-100 p-4 bg-slate-50 no-print print:hidden print-hide space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Printer className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-black text-slate-800 uppercase tracking-widest">Pré-visualização do Relatório (A4)</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={executePrint}
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
            <div className="flex-1 overflow-y-auto p-8 bg-slate-100 print:p-0 print:m-0 print:bg-white print:overflow-visible print:block print:w-full print:h-auto">
              <div 
                id="print-area" 
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
                    <div><span className="font-bold text-slate-600">Técnico:</span> {reportTechnicianId === 'all' ? 'Todos os Técnicos' : (technicians.find(t => t.id === reportTechnicianId)?.name || '')}</div>
                    <div><span className="font-bold text-slate-600">Status:</span> {reportStatus === 'all' ? 'Todos os Status' : getStatusLabel(reportStatus).toUpperCase()}</div>
                    <div><span className="font-bold text-slate-600">Empresa:</span> {reportCompany === 'all' ? 'Todas' : getActiveCompanyForOrder(reportCompany).shortName}</div>
                    <div><span className="font-bold text-slate-600">Tipo:</span> {reportType === 'all' ? 'Todos os Tipos' : reportType}</div>
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
    </div>
  );
}
