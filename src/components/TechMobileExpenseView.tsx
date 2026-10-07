import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Camera, 
  Upload, 
  Receipt, 
  Plus, 
  X, 
  Check, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Edit2, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  DollarSign, 
  Calendar, 
  ChevronRight, 
  Sparkles, 
  Utensils, 
  Fuel, 
  Hotel, 
  ShieldAlert, 
  HelpCircle, 
  Milestone,
  ArrowLeft
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { 
  RouteExpense, 
  RouteCostItem, 
  UserProfile, 
  UserRole, 
  RouteMonthlyPlanning, 
  MaintenanceRecord, 
  Address,
  Technician
} from '../types';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { compressImageToBase64, isValidImageUrl } from '../lib/image-utils';

interface TechMobileExpenseViewProps {
  userRole?: string | UserRole;
  userProfile?: UserProfile | null;
  technicianNameOverride?: string;
  defaultRouteName?: string;
  onClose?: () => void;
  isModal?: boolean;
}

const CATEGORIES = [
  { label: 'Alimentação', icon: Utensils, color: 'bg-amber-500 text-white', border: 'border-amber-400 bg-amber-50/70 text-amber-900' },
  { label: 'Combustível', icon: Fuel, color: 'bg-blue-500 text-white', border: 'border-blue-400 bg-blue-50/70 text-blue-900' },
  { label: 'Hospedagem', icon: Hotel, color: 'bg-purple-500 text-white', border: 'border-purple-400 bg-purple-50/70 text-purple-900' },
  { label: 'Pedágio', icon: Milestone, color: 'bg-emerald-500 text-white', border: 'border-emerald-400 bg-emerald-50/70 text-emerald-900' },
  { label: 'Peças / Emergência', icon: ShieldAlert, color: 'bg-rose-500 text-white', border: 'border-rose-400 bg-rose-50/70 text-rose-900' },
  { label: 'Outros', icon: HelpCircle, color: 'bg-gray-500 text-white', border: 'border-gray-400 bg-gray-50/70 text-gray-900' },
];

export default function TechMobileExpenseView({
  userRole,
  userProfile,
  technicianNameOverride,
  defaultRouteName,
  onClose,
  isModal = false
}: TechMobileExpenseViewProps) {
  // Current month (YYYY-MM)
  const [month, setMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState<boolean>(true);

  // Raw data from Firestore
  const [allRoutePlannings, setAllRoutePlannings] = useState<RouteMonthlyPlanning[]>([]);
  const [allRecords, setAllRecords] = useState<MaintenanceRecord[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [expenses, setExpenses] = useState<RouteExpense[]>([]);

  // Selected route for the technician
  const [selectedRouteName, setSelectedRouteName] = useState<string>(defaultRouteName || '');

  // Form State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('Alimentação');
  const [description, setDescription] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [receiptUrl, setReceiptUrl] = useState<string>('');
  const [plannedCostItemId, setPlannedCostItemId] = useState<string>('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formFeedback, setFormFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Zoom Receipt Modal
  const [zoomReceiptUrl, setZoomReceiptUrl] = useState<string | null>(null);
  const [zoomReceiptTitle, setZoomReceiptTitle] = useState<string>('');
  const [receiptRotation, setReceiptRotation] = useState<number>(0);
  const [receiptZoom, setReceiptZoom] = useState<number>(1);

  // Hidden file inputs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [allTechnicians, setAllTechnicians] = useState<Technician[]>([]);
  const [selectedTechOverride, setSelectedTechOverride] = useState<string>("");

  // Active technician name
  const currentTechName = useMemo(() => {
    if (selectedTechOverride) return selectedTechOverride;
    if (technicianNameOverride) return technicianNameOverride;
    try {
      const savedAuthTech = localStorage.getItem("lefrio_tablet_auth_tech");
      if (savedAuthTech) {
        const parsed = JSON.parse(savedAuthTech);
        if (parsed?.name) return parsed.name;
      }
    } catch {}
    if (userProfile?.name) return userProfile.name;
    return "Técnico";
  }, [selectedTechOverride, technicianNameOverride, userProfile]);

  // Subscribe to real-time expenses for this month
  useEffect(() => {
    loadData();
    const unsub = dataService.subscribeRouteExpenses((updatedExpenses) => {
      setExpenses(updatedExpenses);
    }, month);
    return () => unsub();
  }, [month]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [plannings, records, addrs, loadedExpenses, loadedTechs] = await Promise.all([
        dataService.getRoutePlannings(month),
        dataService.getRecords(month),
        dataService.getAddresses(),
        dataService.getRouteExpenses(month),
        dataService.getTechnicians()
      ]);
      setAllTechnicians(loadedTechs || []);
      setAllRoutePlannings(plannings);
      setAllRecords(records);
      setAddresses(addrs);
      setExpenses(loadedExpenses);
    } catch (err) {
      console.error('Erro ao carregar dados móveis de despesas:', err);
    } finally {
      setLoading(false);
    }
  };

  // Compile unique routes for this month
  const monthlyRoutes = useMemo(() => {
    const routeMap: Record<string, {
      routeName: string;
      month: string;
      plannedDate?: string;
      returnDate?: string;
      routeEstimatedCost: number;
      routeCostItems: RouteCostItem[];
      technicians: string[];
      isActiveToday: boolean;
      isAssignedToUser: boolean;
    }> = {};

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const userNorm = currentTechName.trim().toLowerCase();

    // 1. Records
    allRecords.forEach(r => {
      let rName = '';
      if (r.isTemporaryRoute) {
        rName = r.temporaryRouteName || 'Rota Temporária';
      } else {
        const addr = addresses.find(a => a.id === r.addressId);
        if (addr && addr.route) {
          rName = addr.route;
        }
      }
      if (!rName) return;

      if (!routeMap[rName]) {
        routeMap[rName] = {
          routeName: rName,
          month,
          plannedDate: r.plannedDate,
          returnDate: r.returnDate,
          routeEstimatedCost: r.routeEstimatedCost || 0,
          routeCostItems: r.routeCostItems || [],
          technicians: [],
          isActiveToday: false,
          isAssignedToUser: false
        };
      }

      if (r.technician1 && !routeMap[rName].technicians.includes(r.technician1)) {
        routeMap[rName].technicians.push(r.technician1);
      }
      if (r.technician2 && !routeMap[rName].technicians.includes(r.technician2)) {
        routeMap[rName].technicians.push(r.technician2);
      }
      if (r.plannedDate && !routeMap[rName].plannedDate) routeMap[rName].plannedDate = r.plannedDate;
      if (r.returnDate && !routeMap[rName].returnDate) routeMap[rName].returnDate = r.returnDate;
      if (r.routeEstimatedCost && (!routeMap[rName].routeEstimatedCost || r.routeEstimatedCost > routeMap[rName].routeEstimatedCost)) {
        routeMap[rName].routeEstimatedCost = r.routeEstimatedCost;
      }
      if (r.routeCostItems && r.routeCostItems.length > 0 && routeMap[rName].routeCostItems.length === 0) {
        routeMap[rName].routeCostItems = r.routeCostItems;
      }
    });

    // 2. Route Plannings override
    allRoutePlannings.forEach(p => {
      if (!routeMap[p.routeName]) {
        routeMap[p.routeName] = {
          routeName: p.routeName,
          month,
          plannedDate: p.plannedDate,
          returnDate: p.returnDate,
          routeEstimatedCost: p.routeEstimatedCost || 0,
          routeCostItems: p.routeCostItems || [],
          technicians: [],
          isActiveToday: false,
          isAssignedToUser: false
        };
      } else {
        if (p.plannedDate) routeMap[p.routeName].plannedDate = p.plannedDate;
        if (p.returnDate) routeMap[p.routeName].returnDate = p.returnDate;
        if (p.routeEstimatedCost !== undefined) routeMap[p.routeName].routeEstimatedCost = p.routeEstimatedCost;
        if (p.routeCostItems && p.routeCostItems.length > 0) routeMap[p.routeName].routeCostItems = p.routeCostItems;
      }
    });

    // 3. Mark active today & assigned to current technician
    Object.values(routeMap).forEach(r => {
      const isAssigned = r.technicians.some(t => t.trim().toLowerCase().includes(userNorm) || userNorm.includes(t.trim().toLowerCase()))
        || userRole === UserRole.ADMIN
        || userRole === UserRole.ASSISTANT;
      r.isAssignedToUser = isAssigned;

      if (r.plannedDate && r.returnDate) {
        const start = r.plannedDate;
        const end = r.returnDate;
        if (todayStr >= start && todayStr <= end) {
          r.isActiveToday = true;
        }
      } else if (r.plannedDate === todayStr || r.returnDate === todayStr) {
        r.isActiveToday = true;
      }
    });

    return Object.values(routeMap);
  }, [allRecords, allRoutePlannings, addresses, month, currentTechName, userRole]);

  // Auto-select route
  useEffect(() => {
    if (defaultRouteName && monthlyRoutes.some(r => r.routeName === defaultRouteName)) {
      setSelectedRouteName(defaultRouteName);
      return;
    }
    if (selectedRouteName && monthlyRoutes.some(r => r.routeName === selectedRouteName)) {
      return;
    }
    if (monthlyRoutes.length === 0) return;

    // 1. Look for active today & assigned
    const activeAssigned = monthlyRoutes.find(r => r.isActiveToday && r.isAssignedToUser);
    if (activeAssigned) {
      setSelectedRouteName(activeAssigned.routeName);
      return;
    }
    // 2. Any assigned
    const anyAssigned = monthlyRoutes.find(r => r.isAssignedToUser);
    if (anyAssigned) {
      setSelectedRouteName(anyAssigned.routeName);
      return;
    }
    // 3. First route
    setSelectedRouteName(monthlyRoutes[0].routeName);
  }, [monthlyRoutes, defaultRouteName, selectedRouteName]);

  // Current selected route data
  const currentRoute = useMemo(() => {
    return monthlyRoutes.find(r => r.routeName === selectedRouteName);
  }, [monthlyRoutes, selectedRouteName]);

  // My expenses in this route
  const myRouteExpenses = useMemo(() => {
    const userNorm = currentTechName.trim().toLowerCase();
    return expenses.filter(e => {
      if (selectedRouteName && e.routeName !== selectedRouteName) return false;
      // In mobile tech view, filter primarily for this tech's submissions unless admin
      if (userRole === UserRole.TECHNICIAN) {
        const matchesTech = e.technicianName?.trim().toLowerCase() === userNorm
          || e.technicianId === userProfile?.uid;
        return matchesTech;
      }
      return true;
    });
  }, [expenses, selectedRouteName, currentTechName, userRole, userProfile]);

  // Stats for the technician
  const technicianStats = useMemo(() => {
    const totalSpent = myRouteExpenses.reduce((acc, curr) => acc + (curr.actualValue || 0), 0);
    const totalApproved = myRouteExpenses.filter(e => e.status === 'approved').reduce((acc, curr) => acc + (curr.actualValue || 0), 0);
    const totalPending = myRouteExpenses.filter(e => e.status === 'pending').reduce((acc, curr) => acc + (curr.actualValue || 0), 0);
    const rejectedList = myRouteExpenses.filter(e => e.status === 'rejected');
    return {
      totalSpent,
      totalApproved,
      totalPending,
      rejectedCount: rejectedList.length,
      count: myRouteExpenses.length
    };
  }, [myRouteExpenses]);

  // Handle Photo Capture / Upload with automatic compression
  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingPhoto(true);
    setFormFeedback(null);
    try {
      const base64 = await compressImageToBase64(file, 1280, 1280, 0.75);
      if (!isValidImageUrl(base64)) {
        throw new Error('Imagem inválida gerada pela compressão');
      }
      setReceiptUrl(base64);
    } catch (err) {
      console.error('Erro ao processar imagem do comprovante:', err);
      setFormFeedback({ type: 'error', message: 'Não foi possível carregar a imagem. Tente novamente.' });
    } finally {
      setIsProcessingPhoto(false);
      if (e.target) e.target.value = '';
    }
  };

  // Reset form
  const resetForm = () => {
    setEditingExpenseId(null);
    setPlannedCostItemId('');
    setCategory('Alimentação');
    setDescription('');
    setAmountStr('');
    setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
    setReceiptUrl('');
    setFormFeedback(null);
    setIsFormOpen(false);
  };

  // Edit existing expense
  const handleEditExpense = (expense: RouteExpense) => {
    setEditingExpenseId(expense.id);
    setPlannedCostItemId(expense.plannedCostItemId || '');
    setCategory(expense.category || 'Alimentação');
    setDescription(expense.description || '');
    setAmountStr(expense.actualValue ? String(expense.actualValue) : '');
    setExpenseDate(expense.expenseDate || format(new Date(), 'yyyy-MM-dd'));
    setReceiptUrl(expense.receiptUrl || '');
    setFormFeedback(null);
    setIsFormOpen(true);
  };

  // Delete expense
  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja remover este comprovante de despesa?')) return;
    try {
      await dataService.deleteRouteExpense(id);
    } catch (err) {
      console.error('Erro ao excluir despesa:', err);
      alert('Erro ao excluir despesa. Tente novamente.');
    }
  };

  // Submit expense form
  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouteName) {
      setFormFeedback({ type: 'error', message: 'Selecione uma rota/viagem para vincular a despesa.' });
      return;
    }

    if (!description || !description.trim()) {
      setFormFeedback({ type: 'error', message: 'Informe a descrição do gasto (campo obrigatório).' });
      return;
    }

    const cleanAmount = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
      setFormFeedback({ type: 'error', message: 'Informe o valor pago maior que zero (campo obrigatório).' });
      return;
    }

    if (!expenseDate || !expenseDate.trim()) {
      setFormFeedback({ type: 'error', message: 'Informe a data da despesa (campo obrigatório).' });
      return;
    }

    if (!isValidImageUrl(receiptUrl)) {
      setFormFeedback({ type: 'error', message: 'Anexe a foto do comprovante / cupom fiscal (campo obrigatório com imagem legível).' });
      return;
    }

    setIsSubmitting(true);
    setFormFeedback(null);

    try {
      await dataService.saveRouteExpense({
        id: editingExpenseId || undefined,
        routeName: selectedRouteName,
        month,
        technicianId: userProfile?.uid || 'tech_mobile',
        technicianName: currentTechName,
        plannedCostItemId: plannedCostItemId || undefined,
        category,
        description: description.trim(),
        actualValue: cleanAmount,
        expenseDate: expenseDate.trim(),
        receiptUrl: receiptUrl || undefined,
        status: 'pending' // Volta para pending se foi editado para nova conferência
      });

      resetForm();
    } catch (err) {
      console.error('Erro ao salvar despesa:', err);
      setFormFeedback({ type: 'error', message: 'Erro ao enviar comprovante. Verifique sua conexão e tente novamente.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn("space-y-4 max-w-2xl mx-auto pb-20", isModal ? "p-4" : "")}>
      {/* Top Header Card - Clean Mobile Header */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white rounded-3xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-6 -translate-y-6 w-48 h-48 bg-white/10 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isModal && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-2xl bg-white/15 hover:bg-white/25 active:scale-95 transition-all text-white"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-200 block">
                  Atendimento em Campo
                </span>
                <h1 className="text-lg font-black text-white leading-tight">
                  Despesas & Comprovantes
                </h1>
              </div>
            </div>

            {/* Mês Seletor */}
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="bg-white/20 hover:bg-white/30 border border-white/20 text-white font-bold text-xs rounded-xl px-2.5 py-1.5 outline-none cursor-pointer backdrop-blur-sm"
            />
          </div>

          {/* Rota Ativa / Seletor de Rota */}
          <div className="bg-black/20 backdrop-blur-md rounded-2xl p-3 border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[11px] font-bold text-blue-200 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Viagem / Rota Selecionada:
              </span>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/90">
                <span>Técnico:</span>
                {(userRole === UserRole.ADMIN || userRole === UserRole.ASSISTANT) && allTechnicians.length > 0 ? (
                  <select
                    value={selectedTechOverride || currentTechName}
                    onChange={(e) => setSelectedTechOverride(e.target.value)}
                    className="bg-white/25 text-white font-bold text-[11px] rounded-lg px-2 py-0.5 border border-white/30 outline-none"
                  >
                    {allTechnicians.map(t => (
                      <option key={t.id} value={t.name} className="text-gray-900">{t.name}</option>
                    ))}
                  </select>
                ) : (
                  <strong className="text-white font-bold">{currentTechName}</strong>
                )}
              </div>
            </div>

            {/* Select Dropdown da Rota */}
            <select
              value={selectedRouteName}
              onChange={(e) => {
                setSelectedRouteName(e.target.value);
                if (isFormOpen && editingExpenseId) resetForm();
              }}
              className="w-full bg-white text-gray-900 font-extrabold text-sm rounded-xl px-3.5 py-2.5 outline-none shadow-sm cursor-pointer border border-white/30"
            >
              {monthlyRoutes.length === 0 ? (
                <option value="">Nenhuma rota encontrada para este mês</option>
              ) : (
                monthlyRoutes.map(r => (
                  <option key={r.routeName} value={r.routeName}>
                    {r.routeName} {r.isActiveToday ? '⭐ (Em Andamento Hoje)' : ''} {r.isAssignedToUser ? '👤 (Sua Escala)' : ''}
                  </option>
                ))
              )}
            </select>

            {currentRoute?.plannedDate && (
              <p className="text-[11px] text-blue-100 font-medium">
                Período: {currentRoute.plannedDate} {currentRoute.returnDate ? `até ${currentRoute.returnDate}` : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Botão de Ação Primária: Lançar Nova Despesa */}
      {!isFormOpen && (
        <button
          type="button"
          onClick={() => {
            resetForm();
            setIsFormOpen(true);
          }}
          className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.99] text-white font-extrabold text-base py-4 px-5 rounded-2xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2.5 transition-all cursor-pointer"
        >
          <Camera className="w-5 h-5 text-emerald-100" />
          <span>+ Tirar Foto & Lançar Nova Despesa</span>
        </button>
      )}

      {/* FORMULÁRIO DO TÉCNICO: LANÇAMENTO LIVRE DE DESPESA */}
      {isFormOpen && (
        <div className="bg-white rounded-3xl p-5 border-2 border-blue-500 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                <Receipt className="w-4 h-4" />
              </div>
              <h3 className="text-base font-black text-gray-900">
                {editingExpenseId ? 'Editar Despesa' : 'Novo Lançamento de Despesa'}
              </h3>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {formFeedback && (
            <div className={cn(
              "p-3 rounded-xl text-xs font-bold flex items-center gap-2",
              formFeedback.type === 'error' ? "bg-rose-50 border border-rose-200 text-rose-800" : "bg-emerald-50 border border-emerald-200 text-emerald-800"
            )}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formFeedback.message}</span>
            </div>
          )}

          <form onSubmit={handleSubmitExpense} className="space-y-4">
            {/* 1. FOTO DO COMPROVANTE (DESTAQUE MÁXIMO) */}
            <div>
              <label className="block text-xs font-black uppercase text-gray-700 tracking-wider mb-2">
                📸 Foto do Comprovante / Cupom Fiscal <span className="text-rose-500 font-extrabold">* (Obrigatório)</span>
              </label>

              {/* Se já tem foto carregada */}
              {receiptUrl ? (
                <div className="relative border-2 border-emerald-500 rounded-2xl overflow-hidden bg-slate-900 group">
                  <img
                    src={receiptUrl}
                    alt="Comprovante"
                    className="w-full h-48 object-contain cursor-pointer"
                    onClick={() => {
                      setZoomReceiptUrl(receiptUrl);
                      setZoomReceiptTitle(description || 'Comprovante');
                    }}
                  />
                  <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-md p-1.5 rounded-xl">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="px-2.5 py-1 bg-white text-gray-900 rounded-lg text-xs font-bold hover:bg-gray-100 flex items-center gap-1"
                    >
                      <Camera className="w-3.5 h-3.5" /> Trocar Foto
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptUrl('')}
                      className="p-1 text-rose-400 hover:text-rose-300"
                      title="Remover Foto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm">
                    <Check className="w-3 h-3" /> Foto Anexada
                  </div>
                </div>
              ) : (
                /* Botões de Captura de Foto */
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isProcessingPhoto}
                    onClick={() => cameraInputRef.current?.click()}
                    className="h-28 border-2 border-dashed border-blue-400 bg-blue-50/50 hover:bg-blue-100/70 active:scale-[0.98] rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all text-blue-700 font-extrabold cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/30">
                      <Camera className="w-5 h-5" />
                    </div>
                    <span className="text-xs">Tirar Foto Agora</span>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-28 border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 active:scale-[0.98] rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all text-gray-700 font-bold cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center">
                      <Upload className="w-5 h-5" />
                    </div>
                    <span className="text-xs">Escolher da Galeria</span>
                  </button>
                </div>
              )}

              {/* Inputs de arquivo ocultos */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoFile}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoFile}
                className="hidden"
              />

              {isProcessingPhoto && (
                <div className="mt-2 text-center text-xs font-bold text-blue-600 flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  Otimizando imagem do comprovante...
                </div>
              )}
            </div>

            {/* 2. DESCRIÇÃO RÁPIDA (OBRIGATÓRIO) */}
            <div>
              <label className="block text-xs font-black uppercase text-gray-700 tracking-wider mb-1.5">
                Descrição do Gasto / Local <span className="text-rose-500 font-extrabold">* (Obrigatório)</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Almoço Restaurante Silva, Abastecimento Posto Shell, Hotel..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-white focus:bg-white border-2 border-gray-200 focus:border-blue-600 rounded-2xl text-sm font-semibold text-gray-900 outline-none transition-all shadow-xs"
              />
            </div>

            {/* 3. VALOR DO GASTO (R$) (OBRIGATÓRIO) */}
            <div>
              <label className="block text-xs font-black uppercase text-gray-700 tracking-wider mb-1.5">
                Valor Pago (R$) <span className="text-rose-500 font-extrabold">* (Obrigatório)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-gray-400 text-base">
                  R$
                </span>
                <input
                  type="text"
                  required
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 hover:bg-white focus:bg-white border-2 border-gray-200 focus:border-blue-600 rounded-2xl text-xl font-black text-gray-900 outline-none transition-all shadow-xs"
                />
              </div>
            </div>

            {/* 4. DATA DA DESPESA (OBRIGATÓRIO) */}
            <div>
              <label className="block text-xs font-black uppercase text-gray-700 tracking-wider mb-1.5">
                Data do Gasto <span className="text-rose-500 font-extrabold">* (Obrigatório)</span>
              </label>
              <input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-white focus:bg-white border-2 border-gray-200 focus:border-blue-600 rounded-2xl text-sm font-bold text-gray-800 outline-none cursor-pointer shadow-xs"
              />
            </div>

            {/* 5. CATEGORIA (BOTÕES DE 1-TOQUE) */}
            <div>
              <label className="block text-xs font-black uppercase text-gray-700 tracking-wider mb-2">
                Categoria da Despesa
              </label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map(cat => {
                  const Icon = cat.icon;
                  const isSelected = category === cat.label;
                  return (
                    <button
                      key={cat.label}
                      type="button"
                      onClick={() => setCategory(cat.label)}
                      className={cn(
                        "py-2.5 px-2 rounded-xl text-xs font-extrabold flex flex-col items-center justify-center gap-1 border-2 transition-all cursor-pointer",
                        isSelected 
                          ? "border-blue-600 bg-blue-50 text-blue-800 shadow-sm scale-[1.02]" 
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      <Icon className={cn("w-4 h-4", isSelected ? "text-blue-600" : "text-gray-400")} />
                      <span className="truncate w-full text-center">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* BOTÕES DE SALVAR / CANCELAR */}
            <div className="pt-2 flex items-center gap-2.5">
              <button
                type="button"
                onClick={resetForm}
                className="w-1/3 py-3.5 px-4 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isProcessingPhoto}
                className="w-2/3 py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50 text-white rounded-xl text-sm font-black shadow-md shadow-blue-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{editingExpenseId ? 'Salvar Alteração' : 'Enviar Comprovante'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MINHAS DESPESAS LANÇADAS NESTA ROTA */}
      <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-gray-900 flex items-center gap-1.5 flex-wrap">
              <Receipt className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Comprovantes Enviados</span>
              <span className="text-[11px] bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded-full shrink-0">
                {myRouteExpenses.length}
              </span>
            </h3>
            <p className="text-[11px] text-gray-400 font-medium truncate">Nesta rota / viagem selecionada</p>
          </div>

          <div className="text-right shrink-0">
            <span className="text-[10px] uppercase font-black text-gray-400 block leading-tight">Total Lançado</span>
            <span className="text-sm font-black text-gray-900">
              R$ {technicianStats.totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Mini Resumo de Status */}
        {myRouteExpenses.length > 0 && (
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold">
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-2 rounded-xl">
              <span className="text-[10px] font-black uppercase block text-amber-600">Em Análise</span>
              <span className="text-xs font-black">
                R$ {technicianStats.totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2 rounded-xl">
              <span className="text-[10px] font-black uppercase block text-emerald-600">Aprovados</span>
              <span className="text-xs font-black">
                R$ {technicianStats.totalApproved.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 text-slate-700 p-2 rounded-xl">
              <span className="text-[10px] font-black uppercase block text-slate-500">Comprovantes</span>
              <span className="text-xs font-black">{technicianStats.count}</span>
            </div>
          </div>
        )}

        {/* Lista de Comprovantes */}
        {loading ? (
          <div className="py-8 text-center text-xs font-bold text-gray-400">
            <span className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin inline-block mb-2" />
            <p>Carregando comprovantes...</p>
          </div>
        ) : myRouteExpenses.length === 0 ? (
          <div className="py-12 text-center text-gray-400 space-y-2">
            <Receipt className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-xs font-bold text-gray-600">Nenhum gasto lançado para esta rota ainda.</p>
            <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
              Toque no botão verde acima para tirar foto do seu primeiro comprovante fiscal ou cupom.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {myRouteExpenses.map((expense) => {
              const isApproved = expense.status === 'approved';
              const isRejected = expense.status === 'rejected';
              const isPending = expense.status === 'pending' || !expense.status;

              return (
                <div
                  key={expense.id}
                  className={cn(
                    "p-3.5 rounded-2xl border transition-all flex flex-col gap-3",
                    isApproved ? "bg-emerald-50/20 border-emerald-200" :
                    isRejected ? "bg-rose-50/40 border-rose-300" :
                    "bg-white border-gray-200 shadow-xs"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Miniatura do Comprovante */}
                      {expense.receiptUrl ? (
                        <div
                          onClick={() => {
                            setZoomReceiptUrl(expense.receiptUrl!);
                            setZoomReceiptTitle(expense.description);
                          }}
                          className="relative group cursor-pointer shrink-0"
                        >
                          <img
                            src={expense.receiptUrl}
                            alt="Comprovante"
                            className="w-14 h-14 rounded-xl object-cover border border-gray-200 shadow-xs group-hover:opacity-90 transition-opacity"
                          />
                          <div className="absolute inset-0 bg-black/30 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                            <ZoomIn className="w-4 h-4" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 shrink-0">
                          <Receipt className="w-6 h-6" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-lg bg-gray-100 text-gray-700">
                            {expense.category}
                          </span>
                          <span className="text-[10px] text-gray-400 font-bold">
                            {expense.expenseDate ? format(parseISO(expense.expenseDate), 'dd/MM/yyyy') : ''}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-gray-900 truncate mt-0.5">
                          {expense.description}
                        </h4>
                        <span className="text-base font-black text-blue-700 block mt-0.5">
                          R$ {Number(expense.actualValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {isApproved && (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-1 rounded-xl flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Aprovado
                        </span>
                      )}
                      {isPending && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2.5 py-1 rounded-xl flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Em Análise
                        </span>
                      )}
                      {isRejected && (
                        <span className="bg-rose-100 text-rose-800 text-[10px] font-extrabold px-2.5 py-1 rounded-xl flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Ajustar
                        </span>
                      )}

                      {/* Botões de Ação para o Técnico */}
                      {!isApproved && (
                        <div className="flex items-center gap-1 mt-1">
                          <button
                            type="button"
                            onClick={() => handleEditExpense(expense)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-gray-100 transition-colors"
                            title="Editar Despesa"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(expense.id)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-gray-100 transition-colors"
                            title="Excluir Comprovante"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Mensagem de Ajuste caso o Financeiro tenha Rejeitado */}
                  {isRejected && expense.reviewNotes && (
                    <div className="bg-rose-100/70 border border-rose-200 rounded-xl p-2.5 text-xs text-rose-900 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-rose-950">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Observação da Gestão:</span>
                      </div>
                      <p className="text-rose-800 font-medium pl-5">{expense.reviewNotes}</p>
                      <button
                        type="button"
                        onClick={() => handleEditExpense(expense)}
                        className="text-[11px] font-black text-rose-950 underline pl-5 hover:text-black mt-1"
                      >
                        Toque aqui para reenviar ou corrigir o comprovante
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL ZOOM COMPROVANTE */}
      {zoomReceiptUrl && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between p-4 animate-in fade-in duration-200"
          onClick={() => setZoomReceiptUrl(null)}
        >
          <div className="flex items-center justify-between text-white pt-2 px-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-sm font-bold truncate max-w-xs">{zoomReceiptTitle}</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setReceiptRotation((r) => (r + 90) % 360)}
                className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold"
                title="Girar"
              >
                <RotateCw className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setReceiptZoom((z) => (z === 1 ? 1.8 : 1))}
                className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold"
                title="Zoom"
              >
                {receiptZoom === 1 ? <ZoomIn className="w-5 h-5" /> : <ZoomOut className="w-5 h-5" />}
              </button>
              <button
                type="button"
                onClick={() => setZoomReceiptUrl(null)}
                className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div 
            className="flex-1 flex items-center justify-center overflow-auto p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={zoomReceiptUrl}
              alt="Comprovante em alta resolução"
              style={{
                transform: `rotate(${receiptRotation}deg) scale(${receiptZoom})`,
                transition: 'transform 0.2s ease'
              }}
              className="max-h-[75vh] max-w-full rounded-2xl object-contain shadow-2xl"
            />
          </div>

          <div className="text-center text-white/70 text-xs pb-2" onClick={(e) => e.stopPropagation()}>
            Toque em fechar ou no fundo escuro para retornar.
          </div>
        </div>
      )}
    </div>
  );
}
