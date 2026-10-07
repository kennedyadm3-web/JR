import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  DollarSign, 
  Receipt, 
  Camera, 
  Upload, 
  Calendar, 
  Route, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertCircle, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  Filter, 
  Search, 
  Check, 
  FileText, 
  User, 
  ArrowUpRight, 
  Tag, 
  Layers, 
  TrendingUp, 
  TrendingDown, 
  Sparkles,
  Info,
  RefreshCw,
  Eye,
  CreditCard,
  MapPin,
  Crop,
  Loader2,
  Sliders,
  AlertTriangle,
  ImageOff
} from 'lucide-react';
import { isValidImageUrl, compressImageToBase64 } from '../lib/image-utils';
import { dataService } from '../services/dataService';

// Helper seguro para carregar imagens e contornar restrições de CORS
async function loadImageSafe(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => {
      const fallbackImg = new Image();
      fallbackImg.onload = () => resolve(fallbackImg);
      fallbackImg.onerror = (err) => reject(err);
      fallbackImg.src = src;
    };
    img.src = src;
  });
}

// Gira a imagem em 90 graus no canvas e exporta como JPEG de alta qualidade
async function rotateImageDataUrl(src: string, degrees: number = 90): Promise<string> {
  const img = await loadImageSafe(src);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexto 2D do Canvas não disponível');

  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;

  const normDeg = ((degrees % 360) + 360) % 360;
  const isPerpendicular = normDeg === 90 || normDeg === 270;

  canvas.width = isPerpendicular ? natH : natW;
  canvas.height = isPerpendicular ? natW : natH;

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normDeg * Math.PI) / 180);
  ctx.drawImage(img, -natW / 2, -natH / 2);

  return canvas.toDataURL('image/jpeg', 0.92);
}

// Recorta a imagem com base nas margens percentuais selecionadas e exporta em alta resolução
async function cropImageDataUrl(
  src: string, 
  margins: { top: number; bottom: number; left: number; right: number }
): Promise<string> {
  const img = await loadImageSafe(src);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexto 2D do Canvas não disponível');

  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;

  const leftPx = Math.max(0, (margins.left / 100) * natW);
  const rightPx = Math.max(0, (margins.right / 100) * natW);
  const topPx = Math.max(0, (margins.top / 100) * natH);
  const bottomPx = Math.max(0, (margins.bottom / 100) * natH);

  const cropW = Math.max(20, natW - leftPx - rightPx);
  const cropH = Math.max(20, natH - topPx - bottomPx);

  canvas.width = cropW;
  canvas.height = cropH;

  ctx.drawImage(
    img,
    leftPx, topPx, cropW, cropH,
    0, 0, cropW, cropH
  );

  return canvas.toDataURL('image/jpeg', 0.92);
}
import { 
  UserProfile, 
  UserRole, 
  RouteExpense, 
  RouteExpenseStatus, 
  RouteMonthlyPlanning, 
  RouteCostItem, 
  MaintenanceRecord,
  Address
} from '../types';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import TechMobileExpenseView from './TechMobileExpenseView';

interface TechExpensesViewProps {
  userRole?: string | UserRole;
  userProfile?: UserProfile | null;
}

const EXPENSE_CATEGORIES = [
  { label: 'Alimentação', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { label: 'Combustível', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { label: 'Hospedagem', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { label: 'Pedágio', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { label: 'Peças / Emergência', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { label: 'Outros', color: 'bg-gray-50 text-gray-700 border-gray-200' },
];

export default function TechExpensesView({ userRole, userProfile }: TechExpensesViewProps) {
  // If user is a technician, render the mobile-optimized technician screen directly
  const isTechnician = userRole === UserRole.TECHNICIAN;
  const [viewMode, setViewMode] = useState<'admin' | 'tech_mobile'>(isTechnician ? 'tech_mobile' : 'admin');

  // Current month state (YYYY-MM)
  const [month, setMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  
  // Data state
  const [loading, setLoading] = useState<boolean>(true);
  const [allRoutePlannings, setAllRoutePlannings] = useState<RouteMonthlyPlanning[]>([]);
  const [allRecords, setAllRecords] = useState<MaintenanceRecord[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [expenses, setExpenses] = useState<RouteExpense[]>([]);

  // Selected Route state
  const [selectedRouteName, setSelectedRouteName] = useState<string>('');
  
  // New / Editing Expense Form State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [plannedCostItemId, setPlannedCostItemId] = useState<string>('');
  const [category, setCategory] = useState<string>('Alimentação');
  const [description, setDescription] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [receiptUrl, setReceiptUrl] = useState<string>('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formSuccessMessage, setFormSuccessMessage] = useState<string | null>(null);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);

  // Receipt Zoom Modal State
  const [zoomReceiptUrl, setZoomReceiptUrl] = useState<string | null>(null);
  const [zoomReceiptTitle, setZoomReceiptTitle] = useState<string>('');
  const [zoomExpense, setZoomExpense] = useState<RouteExpense | null>(null);
  const [receiptRotation, setReceiptRotation] = useState<number>(0);
  const [receiptZoom, setReceiptZoom] = useState<number>(1);
  const [isSavingImage, setIsSavingImage] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState<boolean>(false);
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const [isUploadingReplacement, setIsUploadingReplacement] = useState<boolean>(false);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const [cropMargins, setCropMargins] = useState<{ top: number; bottom: number; left: number; right: number }>({
    top: 5,
    bottom: 5,
    left: 5,
    right: 5
  });

  // Substituir/reanexar imagem do comprovante
  const handleUploadReplacement = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !zoomExpense?.id) return;
    try {
      setIsUploadingReplacement(true);
      setSaveFeedback('Processando e gravando novo comprovante...');
      const base64 = await compressImageToBase64(file, 1280, 1280, 0.75);
      if (!isValidImageUrl(base64)) {
        throw new Error('Falha ao processar imagem comprimida');
      }

      await dataService.saveRouteExpense({
        ...zoomExpense,
        id: zoomExpense.id,
        receiptUrl: base64
      });

      setExpenses(prev => prev.map(item => item.id === zoomExpense.id ? { ...item, receiptUrl: base64 } : item));
      setZoomReceiptUrl(base64);
      setZoomExpense(prev => prev ? { ...prev, receiptUrl: base64 } : null);
      setImageLoadError(false);
      setReceiptRotation(0);
      setReceiptZoom(1);
      setIsCropping(false);
      setSaveFeedback('✓ Comprovante atualizado com sucesso no banco!');
      setTimeout(() => setSaveFeedback(null), 3500);
    } catch (err: any) {
      console.error('Erro ao substituir comprovante:', err);
      setSaveFeedback('Erro ao gravar novo comprovante. Tente novamente.');
      setTimeout(() => setSaveFeedback(null), 3500);
    } finally {
      setIsUploadingReplacement(false);
      if (e.target) e.target.value = '';
    }
  };

  // Rotaciona a imagem em 90 graus e salva permanentemente no banco de dados
  const handleRotateAndSave = async () => {
    if (!zoomReceiptUrl || isSavingImage) return;
    try {
      setIsSavingImage(true);
      setSaveFeedback('Rotacionando e salvando...');

      const rotatedUrl = await rotateImageDataUrl(zoomReceiptUrl, 90);

      if (zoomExpense && zoomExpense.id) {
        await dataService.saveRouteExpense({
          ...zoomExpense,
          id: zoomExpense.id,
          receiptUrl: rotatedUrl
        });

        setExpenses(prev => prev.map(e => e.id === zoomExpense.id ? { ...e, receiptUrl: rotatedUrl } : e));
        setZoomExpense(prev => prev ? { ...prev, receiptUrl: rotatedUrl } : null);
      }

      setZoomReceiptUrl(rotatedUrl);
      setReceiptRotation(0);
      setSaveFeedback('✓ Rotação salva no banco de dados!');
      setTimeout(() => setSaveFeedback(null), 3000);
    } catch (err) {
      console.error('Erro ao rotacionar e salvar comprovante:', err);
      setSaveFeedback('Erro ao salvar rotação');
      setTimeout(() => setSaveFeedback(null), 3000);
    } finally {
      setIsSavingImage(false);
    }
  };

  // Recorta a imagem com base nas margens e salva permanentemente no banco de dados
  const handleApplyCropAndSave = async () => {
    if (!zoomReceiptUrl || isSavingImage) return;
    try {
      setIsSavingImage(true);
      setSaveFeedback('Recortando e salvando...');

      const croppedUrl = await cropImageDataUrl(zoomReceiptUrl, cropMargins);

      if (zoomExpense && zoomExpense.id) {
        await dataService.saveRouteExpense({
          ...zoomExpense,
          id: zoomExpense.id,
          receiptUrl: croppedUrl
        });

        setExpenses(prev => prev.map(e => e.id === zoomExpense.id ? { ...e, receiptUrl: croppedUrl } : e));
        setZoomExpense(prev => prev ? { ...prev, receiptUrl: croppedUrl } : null);
      }

      setZoomReceiptUrl(croppedUrl);
      setIsCropping(false);
      setCropMargins({ top: 5, bottom: 5, left: 5, right: 5 });
      setSaveFeedback('✓ Imagem recortada e salva no banco!');
      setTimeout(() => setSaveFeedback(null), 3000);
    } catch (err) {
      console.error('Erro ao recortar e salvar comprovante:', err);
      setSaveFeedback('Erro ao salvar recorte');
      setTimeout(() => setSaveFeedback(null), 3000);
    } finally {
      setIsSavingImage(false);
    }
  };

  // Filter & Search
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'pending' | 'approved' | 'rejected'>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const technicianName = useMemo(() => {
    return userProfile?.name || 'Técnico';
  }, [userProfile]);

  // Load initial data and real-time subscription
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
      const [plannings, records, addrs, loadedExpenses] = await Promise.all([
        dataService.getRoutePlannings(month),
        dataService.getRecords(month),
        dataService.getAddresses(),
        dataService.getRouteExpenses(month)
      ]);
      setAllRoutePlannings(plannings);
      setAllRecords(records);
      setAddresses(addrs);
      setExpenses(loadedExpenses);
    } catch (err) {
      console.error('Erro ao carregar dados de despesas:', err);
    } finally {
      setLoading(false);
    }
  };

  // Compile unique routes for this month with cost forecasts and assigned technicians
  const monthlyRoutes = useMemo(() => {
    const routeMap: Record<string, {
      routeName: string;
      month: string;
      plannedDate?: string;
      returnDate?: string;
      routeEstimatedCost: number;
      routeCostItems: RouteCostItem[];
      technicians: string[];
      routeNotes?: string;
      routeColor?: string;
      isActiveToday: boolean;
      isAssignedToUser: boolean;
    }> = {};

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const userNorm = technicianName.trim().toLowerCase();

    // 1. Process records
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
          routeNotes: r.routeNotes,
          routeColor: r.routeColor,
          isActiveToday: false,
          isAssignedToUser: false
        };
      }

      // Add technicians
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

    // 2. Process routePlannings override
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
          routeNotes: p.routeNotes,
          routeColor: p.routeColor,
          isActiveToday: false,
          isAssignedToUser: false
        };
      } else {
        if (p.plannedDate) routeMap[p.routeName].plannedDate = p.plannedDate;
        if (p.returnDate) routeMap[p.routeName].returnDate = p.returnDate;
        if (p.routeEstimatedCost !== undefined) routeMap[p.routeName].routeEstimatedCost = p.routeEstimatedCost;
        if (p.routeCostItems && p.routeCostItems.length > 0) routeMap[p.routeName].routeCostItems = p.routeCostItems;
        if (p.routeNotes) routeMap[p.routeName].routeNotes = p.routeNotes;
        if (p.routeColor) routeMap[p.routeName].routeColor = p.routeColor;
      }
    });

    // 3. Ensure routeEstimatedCost is computed from items if zero, and mark active today and assigned to user
    Object.values(routeMap).forEach(r => {
      const itemsSum = (r.routeCostItems || []).reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
      if ((!r.routeEstimatedCost || r.routeEstimatedCost === 0) && itemsSum > 0) {
        r.routeEstimatedCost = itemsSum;
      }

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
  }, [allRecords, allRoutePlannings, addresses, month, technicianName, userRole]);

  // Auto-select the active route for the technician
  useEffect(() => {
    if (monthlyRoutes.length === 0) return;
    
    // If selectedRouteName is already in the list, keep it
    if (selectedRouteName && monthlyRoutes.some(r => r.routeName === selectedRouteName)) {
      return;
    }

    // 1. Look for a route active today and assigned to this technician
    const activeAssigned = monthlyRoutes.find(r => r.isActiveToday && r.isAssignedToUser);
    if (activeAssigned) {
      setSelectedRouteName(activeAssigned.routeName);
      return;
    }

    // 2. Look for any route assigned to this technician with cost items or forecast
    const assignedWithCost = monthlyRoutes.find(r => r.isAssignedToUser && (r.routeEstimatedCost > 0 || r.routeCostItems.length > 0));
    if (assignedWithCost) {
      setSelectedRouteName(assignedWithCost.routeName);
      return;
    }

    // 3. Look for any route assigned to this technician
    const anyAssigned = monthlyRoutes.find(r => r.isAssignedToUser);
    if (anyAssigned) {
      setSelectedRouteName(anyAssigned.routeName);
      return;
    }

    // 4. Fallback to first route in the list
    if (monthlyRoutes[0]) {
      setSelectedRouteName(monthlyRoutes[0].routeName);
    }
  }, [monthlyRoutes, selectedRouteName]);

  // Active route data
  const currentRouteData = useMemo(() => {
    return monthlyRoutes.find(r => r.routeName === selectedRouteName);
  }, [monthlyRoutes, selectedRouteName]);

  // Filtered expenses for the active route (or all user expenses)
  const routeExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (selectedRouteName && e.routeName !== selectedRouteName) return false;
      if (userRole === UserRole.TECHNICIAN) {
        // Show expenses logged by this technician or in this route
        const matchesUser = e.technicianName?.trim().toLowerCase() === technicianName.trim().toLowerCase() 
          || e.technicianId === userProfile?.uid;
        if (!matchesUser && selectedRouteName !== e.routeName) return false;
      }
      if (filterStatus !== 'ALL' && e.status !== filterStatus) return false;
      if (filterCategory !== 'ALL' && e.category !== filterCategory) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const descMatch = (e.description || '').toLowerCase().includes(term);
        const catMatch = (e.category || '').toLowerCase().includes(term);
        const techMatch = (e.technicianName || '').toLowerCase().includes(term);
        if (!descMatch && !catMatch && !techMatch) return false;
      }
      return true;
    });
  }, [expenses, selectedRouteName, userRole, technicianName, userProfile, filterStatus, filterCategory, searchTerm]);

  // Financial statistics
  const stats = useMemo(() => {
    const costFromItems = (currentRouteData?.routeCostItems || []).reduce((acc, it) => acc + (Number(it.value) || 0), 0);
    const routeTotalEstimated = (currentRouteData?.routeEstimatedCost && currentRouteData.routeEstimatedCost > 0)
      ? currentRouteData.routeEstimatedCost
      : costFromItems;
    
    const allExpensesInRoute = expenses.filter(e => e.routeName === selectedRouteName);
    const totalSpent = allExpensesInRoute.reduce((acc, curr) => acc + (curr.actualValue || 0), 0);
    const totalApproved = allExpensesInRoute.filter(e => e.status === 'approved').reduce((acc, curr) => acc + (curr.actualValue || 0), 0);
    const totalPending = allExpensesInRoute.filter(e => e.status === 'pending').reduce((acc, curr) => acc + (curr.actualValue || 0), 0);
    const totalRejected = allExpensesInRoute.filter(e => e.status === 'rejected').reduce((acc, curr) => acc + (curr.actualValue || 0), 0);

    const remainingBudget = routeTotalEstimated - totalSpent;
    const percentageUsed = routeTotalEstimated > 0 ? Math.min(100, Math.round((totalSpent / routeTotalEstimated) * 100)) : 0;

    return {
      routeTotalEstimated,
      totalSpent,
      totalApproved,
      totalPending,
      totalRejected,
      remainingBudget,
      percentageUsed,
      itemsCount: allExpensesInRoute.length,
      pendingCount: allExpensesInRoute.filter(e => e.status === 'pending').length,
      approvedCount: allExpensesInRoute.filter(e => e.status === 'approved').length,
      rejectedCount: allExpensesInRoute.filter(e => e.status === 'rejected').length
    };
  }, [currentRouteData, expenses, selectedRouteName]);

  // Handle Photo upload / capture
  const handleProcessImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Selecione apenas arquivos de imagem (PNG, JPG, JPEG).');
      return;
    }
    try {
      setIsProcessingPhoto(true);
      const base64 = await compressImageToBase64(file, 1000, 1000, 0.65);
      setReceiptUrl(base64);
    } catch (err: any) {
      console.error('Erro ao processar imagem:', err);
      alert('Erro ao comprimir imagem do comprovante. Tente novamente.');
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  // Pre-fill form from a Planned Item
  const handleSelectPlannedItem = (item: RouteCostItem) => {
    setPlannedCostItemId(item.id);
    setDescription(item.description || '');
    setAmountStr(String(item.value || '').replace('.', ','));
    if (item.date) {
      setExpenseDate(item.date);
    }
    // Try to match category by keywords
    const lowerDesc = item.description.toLowerCase();
    if (lowerDesc.includes('almoço') || lowerDesc.includes('jantar') || lowerDesc.includes('aliment') || lowerDesc.includes('lanche')) {
      setCategory('Alimentação');
    } else if (lowerDesc.includes('combust') || lowerDesc.includes('gasolin') || lowerDesc.includes('diesel') || lowerDesc.includes('abastec')) {
      setCategory('Combustível');
    } else if (lowerDesc.includes('pousada') || lowerDesc.includes('hotel') || lowerDesc.includes('hosped')) {
      setCategory('Hospedagem');
    } else if (lowerDesc.includes('pedag')) {
      setCategory('Pedágio');
    } else {
      setCategory('Outros');
    }
    setIsFormOpen(true);
    // Smooth scroll to form
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  // Open Form to Edit existing expense
  const handleEditExpense = (expense: RouteExpense) => {
    setEditingExpenseId(expense.id);
    setSelectedRouteName(expense.routeName);
    setCategory(expense.category || 'Alimentação');
    setDescription(expense.description);
    setAmountStr(String(expense.actualValue).replace('.', ','));
    setExpenseDate(expense.expenseDate || format(new Date(), 'yyyy-MM-dd'));
    setReceiptUrl(expense.receiptUrl || '');
    setPlannedCostItemId(expense.plannedCostItemId || '');
    setIsFormOpen(true);
    window.scrollTo({ top: 300, behavior: 'smooth' });
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
    setFormSuccessMessage(null);
    setFormErrorMessage(null);
  };

  // Save Expense
  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrorMessage(null);
    setFormSuccessMessage(null);

    if (!selectedRouteName) {
      setFormErrorMessage('Selecione uma rota para vincular a despesa.');
      return;
    }

    const cleanAmount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
      setFormErrorMessage('Informe um valor monetário válido maior que zero.');
      return;
    }

    if (!description.trim()) {
      setFormErrorMessage('Informe a descrição da despesa.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: Omit<RouteExpense, 'id'> & { id?: string } = {
        routeName: selectedRouteName,
        month,
        technicianId: userProfile?.uid || '',
        technicianName,
        plannedCostItemId: plannedCostItemId || undefined,
        category,
        description: description.trim(),
        actualValue: cleanAmount,
        expenseDate,
        receiptUrl: receiptUrl || undefined,
        status: editingExpenseId ? (expenses.find(e => e.id === editingExpenseId)?.status || 'pending') : 'pending'
      };

      if (editingExpenseId) {
        payload.id = editingExpenseId;
      }

      await dataService.saveRouteExpense(payload);
      
      setFormSuccessMessage(editingExpenseId ? 'Despesa atualizada com sucesso!' : 'Despesa lançada e sincronizada com sucesso!');
      setTimeout(() => {
        resetForm();
        setIsFormOpen(false);
      }, 1200);
    } catch (err: any) {
      console.error('Erro ao salvar despesa:', err);
      setFormErrorMessage('Falha ao salvar despesa. Verifique sua conexão e tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta despesa lançada?')) return;
    try {
      await dataService.deleteRouteExpense(id);
    } catch (err) {
      console.error('Erro ao excluir despesa:', err);
      alert('Erro ao excluir despesa.');
    }
  };

  // Format currency helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  // If user is technician or selected mobile tech mode
  if (isTechnician) {
    return <TechMobileExpenseView userRole={userRole} userProfile={userProfile} />;
  }

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto">
      {/* Switcher para Administrador / Assistente */}
      <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-gray-200 shadow-xs print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase text-gray-500 tracking-wider">
            Modo de Visualização:
          </span>
          <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('admin')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                viewMode === 'admin'
                  ? "bg-white text-blue-800 shadow-xs font-black"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              💼 Gestão Administrativa & Auditoria
            </button>
            <button
              type="button"
              onClick={() => setViewMode('tech_mobile')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                viewMode === 'tech_mobile'
                  ? "bg-blue-600 text-white shadow-xs font-black"
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              📱 Modo Técnico de Campo (Dispositivo Móvel)
            </button>
          </div>
        </div>

        <span className="text-xs text-gray-400 font-semibold hidden md:inline">
          {viewMode === 'admin' 
            ? 'Aprovações, auditoria e conferência de despesas' 
            : 'Interface simplificada para o técnico anexar comprovantes'}
        </span>
      </div>

      {viewMode === 'tech_mobile' ? (
        <TechMobileExpenseView userRole={userRole} userProfile={userProfile} />
      ) : (
        <>
          {/* Top Header Card */}
          <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="bg-white/20 backdrop-blur-md p-2 rounded-xl">
                <Receipt className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-200 block">
                  Controle de Viagem & Gastos
                </span>
                <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
                  Despesas de Rotas
                </h1>
              </div>
            </div>
            <p className="text-xs text-blue-100/90 font-medium">
              Preencha os gastos realizados durante sua rota conforme a previsão planejada e anexe seus comprovantes.
            </p>
          </div>

          {/* Month Selector & New Expense Action */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-md border border-white/20 rounded-xl px-3 py-1.5 shadow-xs">
              <Calendar className="w-4 h-4 text-blue-200" />
              <input 
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (isFormOpen) {
                  setIsFormOpen(false);
                  resetForm();
                } else {
                  resetForm();
                  setIsFormOpen(true);
                }
              }}
              className="bg-white text-blue-700 hover:bg-blue-50 font-black text-xs px-4 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              {isFormOpen ? (
                <>
                  <X className="w-4 h-4 text-blue-700" /> Fechar Formulário
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-blue-700" /> Lançar Nova Despesa
                </>
              )}
            </button>
          </div>
        </div>

        {/* Route Selector Tabs / Pills */}
        <div className="mt-5 pt-4 border-t border-white/15 flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
          <span className="text-[11px] font-black uppercase tracking-wider text-blue-200 whitespace-nowrap flex items-center gap-1">
            <Route className="w-3.5 h-3.5" /> Rotas do Mês:
          </span>
          {monthlyRoutes.length === 0 ? (
            <span className="text-xs text-blue-200 italic">Nenhuma rota programada para este mês</span>
          ) : (
            monthlyRoutes.map(r => {
              const isSelected = r.routeName === selectedRouteName;
              return (
                <button
                  key={r.routeName}
                  type="button"
                  onClick={() => {
                    setSelectedRouteName(r.routeName);
                    if (isFormOpen && editingExpenseId) resetForm();
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer",
                    isSelected 
                      ? "bg-white text-blue-800 shadow-md font-extrabold scale-105" 
                      : "bg-white/15 text-white hover:bg-white/25 border border-white/10"
                  )}
                >
                  {r.isActiveToday && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" title="Em rota hoje" />
                  )}
                  <span>{r.routeName}</span>
                  {r.routeEstimatedCost > 0 && (
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.2 rounded-md font-mono",
                      isSelected ? "bg-blue-100 text-blue-800" : "bg-white/20 text-white"
                    )}>
                      {formatCurrency(r.routeEstimatedCost)}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Selected Route Banner & Financial Overview */}
      {currentRouteData ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Active Route Summary Info */}
          <div className="md:col-span-4 bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-extrabold text-gray-900 flex items-center gap-1.5">
                  <Route className="w-4 h-4 text-blue-600" />
                  {currentRouteData.routeName}
                </span>
                {currentRouteData.isActiveToday && (
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Rota em Andamento Hoje
                  </span>
                )}
                {currentRouteData.isAssignedToUser && (
                  <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                    Sua Escala
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 font-medium flex-wrap">
                {currentRouteData.plannedDate && (
                  <span className="flex items-center gap-1 font-mono">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    Período: {format(parseISO(currentRouteData.plannedDate), 'dd/MM/yyyy')} {currentRouteData.returnDate && `a ${format(parseISO(currentRouteData.returnDate), 'dd/MM/yyyy')}`}
                  </span>
                )}
                {currentRouteData.technicians.length > 0 && (
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    Técnicos: <strong className="text-gray-700">{currentRouteData.technicians.join(', ')}</strong>
                  </span>
                )}
                {currentRouteData.routeNotes && (
                  <span className="text-gray-600 italic">
                    Obs: "{currentRouteData.routeNotes}"
                  </span>
                )}
              </div>
            </div>

            {/* Quick Status Badges */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-600" /> {stats.pendingCount} Em Análise
              </span>
              <span className="text-[11px] font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> {stats.approvedCount} Aprovados
              </span>
            </div>
          </div>

          {/* Metric 1: Previsão Total */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Previsão Orçada</span>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-xl font-extrabold text-gray-900 font-mono block">
                {formatCurrency(stats.routeTotalEstimated)}
              </span>
              <span className="text-[11px] text-gray-500 font-medium mt-0.5 block">
                {currentRouteData.routeCostItems.length} {currentRouteData.routeCostItems.length === 1 ? 'item programado' : 'itens programados'}
              </span>
            </div>
          </div>

          {/* Metric 2: Total Lançado */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Total Gasto (Lançado)</span>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-xl font-extrabold text-indigo-700 font-mono block">
                {formatCurrency(stats.totalSpent)}
              </span>
              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2 overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all",
                    stats.percentageUsed > 100 ? "bg-rose-500" : stats.percentageUsed > 80 ? "bg-amber-500" : "bg-indigo-600"
                  )}
                  style={{ width: `${Math.min(100, stats.percentageUsed)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Metric 3: Total Aprovado */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Total Aprovado</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-xl font-extrabold text-emerald-600 font-mono block">
                {formatCurrency(stats.totalApproved)}
              </span>
              <span className="text-[11px] text-gray-500 font-medium mt-0.5 block">
                {stats.approvedCount} comprovantes validados
              </span>
            </div>
          </div>

          {/* Metric 4: Saldo Restante */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Saldo Restante</span>
              <div className={cn(
                "p-2 rounded-xl",
                stats.remainingBudget >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              )}>
                {stats.remainingBudget >= 0 ? <TrendingUp className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              </div>
            </div>
            <div className="mt-2">
              <span className={cn(
                "text-xl font-extrabold font-mono block",
                stats.remainingBudget >= 0 ? "text-emerald-700" : "text-rose-600"
              )}>
                {formatCurrency(stats.remainingBudget)}
              </span>
              <span className="text-[11px] text-gray-500 font-medium mt-0.5 block">
                {stats.remainingBudget >= 0 ? 'Dentro do orçamento' : 'Excedeu a previsão'}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Planned Cost Items Bar (Previsão Programada pelo Admin) */}
      {currentRouteData && currentRouteData.routeCostItems.length > 0 && (
        <div className="bg-white border border-blue-100 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-800">
                Itens Programados nesta Viagem ({currentRouteData.routeCostItems.length})
              </h3>
            </div>
            <span className="text-[11px] text-gray-400 font-medium">
              Clique em um item programado para preencher rapidamente
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {currentRouteData.routeCostItems.map((item) => {
              // Check how much has already been logged for this item
              const loggedForThisItem = expenses
                .filter(e => e.plannedCostItemId === item.id || (e.description.toLowerCase() === item.description.toLowerCase() && e.routeName === selectedRouteName))
                .reduce((acc, curr) => acc + (curr.actualValue || 0), 0);
              
              const isFilled = loggedForThisItem > 0;

              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectPlannedItem(item)}
                  className={cn(
                    "p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group",
                    isFilled 
                      ? "bg-emerald-50/40 border-emerald-200 hover:border-emerald-300" 
                      : "bg-gray-50/60 border-gray-200 hover:bg-blue-50/50 hover:border-blue-300 hover:shadow-xs"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      isFilled ? "bg-emerald-500" : "bg-blue-500"
                    )} />
                    <div className="truncate">
                      <p className="text-xs font-bold text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                        {item.description}
                      </p>
                      {item.date && (
                        <p className="text-[10px] text-gray-400 font-mono">
                          Previsto: {format(parseISO(item.date), 'dd/MM/yyyy')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-extrabold text-blue-700 font-mono block">
                      {formatCurrency(item.value)}
                    </span>
                    {isFilled && (
                      <span className="text-[9px] font-bold text-emerald-600 block">
                        Lançado: {formatCurrency(loggedForThisItem)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expense Form Modal / Collapsible Section */}
      {isFormOpen && (
        <div className="bg-white border-2 border-blue-500/80 rounded-2xl p-6 shadow-xl animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-600 text-white rounded-xl">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-gray-900">
                  {editingExpenseId ? 'Editar Despesa Lançada' : 'Lançar Despesa de Viagem'}
                </h3>
                <p className="text-xs text-gray-500">
                  Rota: <strong className="text-blue-700">{selectedRouteName}</strong> | Técnico: <strong className="text-gray-800">{technicianName}</strong>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                resetForm();
              }}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {formErrorMessage && (
            <div className="p-3 mb-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formErrorMessage}</span>
            </div>
          )}

          {formSuccessMessage && (
            <div className="p-3 mb-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{formSuccessMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmitExpense} className="space-y-4">
            {/* Category Selector Pills */}
            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-gray-500 block mb-2">
                Categoria da Despesa
              </label>
              <div className="flex flex-wrap gap-2">
                {EXPENSE_CATEGORIES.map(cat => (
                  <button
                    key={cat.label}
                    type="button"
                    onClick={() => setCategory(cat.label)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                      category === cat.label
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Description */}
              <div className="sm:col-span-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-gray-500 block mb-1.5">
                  Descrição do Gasto *
                </label>
                <input 
                  type="text"
                  placeholder="Ex: Almoço Restaurante Boiadeiro, Abastecimento Posto BR, Pousada..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                  required
                />
              </div>

              {/* Amount (R$) */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-gray-500 block mb-1.5">
                  Valor Pago (R$) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 font-mono">
                    R$
                  </span>
                  <input 
                    type="text"
                    placeholder="0,00"
                    value={amountStr}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^[0-9]*[.,]?[0-9]*$/.test(val)) {
                        setAmountStr(val);
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-sm font-extrabold text-gray-900 outline-none focus:border-blue-500 focus:bg-white text-right font-mono transition-all"
                    required
                  />
                </div>
              </div>

              {/* Expense Date */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-gray-500 block mb-1.5">
                  Data do Gasto
                </label>
                <input 
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-blue-500 focus:bg-white transition-all font-mono"
                  required
                />
              </div>

              {/* Receipt Attachment Section */}
              <div className="sm:col-span-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-gray-500 block mb-1.5">
                  Foto do Comprovante / Cupom Fiscal (Recomendado)
                </label>
                
                <div className="flex items-center gap-3">
                  {/* Camera Direct Capture */}
                  <input 
                    type="file"
                    accept="image/*"
                    capture="environment"
                    ref={cameraInputRef}
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleProcessImage(e.target.files[0]);
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isProcessingPhoto}
                    className="px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" /> Tirar Foto
                  </button>

                  {/* File / Gallery Upload */}
                  <input 
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleProcessImage(e.target.files[0]);
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingPhoto}
                    className="px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" /> Galeria / Arquivo
                  </button>

                  {/* Receipt Preview Thumbnail */}
                  {receiptUrl && (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                      <img 
                        src={receiptUrl} 
                        alt="Comprovante" 
                        className="w-8 h-8 rounded-lg object-cover border border-emerald-300 cursor-pointer"
                        onClick={() => {
                          setZoomReceiptUrl(receiptUrl);
                          setZoomReceiptTitle(description || 'Comprovante');
                        }}
                      />
                      <span className="text-[11px] font-bold text-emerald-700">Comprovante Anexado</span>
                      <button
                        type="button"
                        onClick={() => setReceiptUrl('')}
                        className="p-1 text-gray-400 hover:text-red-500 rounded-md cursor-pointer"
                        title="Remover foto"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {isProcessingPhoto && (
                    <span className="text-xs text-blue-600 font-bold flex items-center gap-1 animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Otimizando foto...
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  resetForm();
                }}
                className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSubmitting || isProcessingPhoto}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Save className="w-4 h-4" />
                {isSubmitting ? 'Salvando...' : editingExpenseId ? 'Atualizar Despesa' : 'Salvar e Sincronizar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Expenses History List Header & Filters */}
      <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-black uppercase tracking-wider text-gray-900">
              Despesas Lançadas ({routeExpenses.length})
            </h3>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                placeholder="Buscar despesa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 outline-none focus:border-blue-500 w-44"
              />
            </div>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-blue-500"
            >
              <option value="ALL">Todos os Status</option>
              <option value="pending">Em Análise (Pendente)</option>
              <option value="approved">Aprovados</option>
              <option value="rejected">Reprovados</option>
            </select>

            {/* Category Filter */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-blue-500"
            >
              <option value="ALL">Todas Categorias</option>
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c.label} value={c.label}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Expenses List */}
        {loading ? (
          <div className="py-12 text-center text-xs text-gray-400 font-medium flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" /> Carregando despesas...
          </div>
        ) : routeExpenses.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-2xl py-12 px-4 text-center bg-gray-50/50">
            <Receipt className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-gray-700">Nenhuma despesa lançada nesta rota</p>
            <p className="text-xs text-gray-400 mt-1">
              Clique em "Lançar Nova Despesa" ou em um dos itens programados acima para registrar seus gastos.
            </p>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setIsFormOpen(true);
              }}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Lançar Despesa Agora
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden shadow-xs">
            {routeExpenses.map((expense) => {
              const statusColor = 
                expense.status === 'approved' 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : expense.status === 'rejected' 
                  ? 'bg-rose-50 text-rose-700 border-rose-200' 
                  : 'bg-amber-50 text-amber-700 border-amber-200';

              const statusLabel = 
                expense.status === 'approved' 
                  ? 'Aprovado' 
                  : expense.status === 'rejected' 
                  ? 'Reprovado' 
                  : 'Em Análise';

              return (
                <div 
                  key={expense.id}
                  className="p-4 bg-white hover:bg-gray-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    {/* Receipt thumbnail or category badge */}
                    {expense.receiptUrl ? (
                      isValidImageUrl(expense.receiptUrl) ? (
                        <div 
                          onClick={() => {
                            setZoomExpense(expense);
                            setZoomReceiptUrl(expense.receiptUrl!);
                            setZoomReceiptTitle(expense.description);
                            setReceiptRotation(0);
                            setReceiptZoom(1);
                            setIsCropping(false);
                            setImageLoadError(false);
                            setCropMargins({ top: 5, bottom: 5, left: 5, right: 5 });
                          }}
                          className="relative group cursor-pointer shrink-0"
                          title="Clique para ampliar o comprovante"
                        >
                          <img 
                            src={expense.receiptUrl} 
                            alt="Comprovante" 
                            className="w-12 h-12 rounded-xl object-cover border border-gray-200 group-hover:border-blue-500 shadow-2xs transition-all"
                            onError={() => setImageLoadError(true)}
                          />
                          <div className="absolute inset-0 bg-black/30 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Eye className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div 
                          onClick={() => {
                            setZoomExpense(expense);
                            setZoomReceiptUrl(expense.receiptUrl!);
                            setZoomReceiptTitle(expense.description);
                            setReceiptRotation(0);
                            setReceiptZoom(1);
                            setIsCropping(false);
                            setImageLoadError(true);
                            setCropMargins({ top: 5, bottom: 5, left: 5, right: 5 });
                          }}
                          className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-300 flex flex-col items-center justify-center text-amber-700 shrink-0 cursor-pointer hover:bg-amber-100 transition-colors"
                          title="Comprovante corrompido. Clique para reanexar."
                        >
                          <AlertTriangle className="w-5 h-5 text-amber-600" />
                          <span className="text-[8px] font-black uppercase tracking-tighter">Corrompido</span>
                        </div>
                      )
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 shrink-0">
                        <Receipt className="w-6 h-6" />
                      </div>
                    )}

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold text-gray-900 truncate">
                          {expense.description}
                        </span>
                        {expense.category && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
                            {expense.category}
                          </span>
                        )}
                        <span className={cn("text-[10px] font-black uppercase px-2 py-0.5 rounded-full border", statusColor)}>
                          {statusLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
                        <span className="font-mono font-medium">
                          Data: <strong>{expense.expenseDate ? format(parseISO(expense.expenseDate), 'dd/MM/yyyy') : '-'}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Lançado por: <strong className="text-gray-700">{expense.technicianName}</strong>
                        </span>
                        {expense.reviewedByName && (
                          <>
                            <span>•</span>
                            <span className="text-gray-600">
                              Revisado por: <strong>{expense.reviewedByName}</strong>
                            </span>
                          </>
                        )}
                      </div>

                      {/* Rejection Note Warning */}
                      {expense.status === 'rejected' && expense.reviewNotes && (
                        <p className="text-[11px] text-rose-700 font-bold bg-rose-50/80 p-2 rounded-lg border border-rose-200 mt-1.5 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          Motivo da Reprovação: {expense.reviewNotes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Amount and Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                    <div className="text-right">
                      <span className="text-base font-black text-gray-900 font-mono block">
                        {formatCurrency(expense.actualValue)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {expense.receiptUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setZoomExpense(expense);
                            setZoomReceiptUrl(expense.receiptUrl!);
                            setZoomReceiptTitle(expense.description);
                            setReceiptRotation(0);
                            setReceiptZoom(1);
                            setIsCropping(false);
                            setCropMargins({ top: 5, bottom: 5, left: 5, right: 5 });
                          }}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all cursor-pointer"
                          title="Ver comprovante"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}

                      {/* Edit allowed if pending or admin */}
                      {(expense.status === 'pending' || userRole === UserRole.ADMIN) && (
                        <button
                          type="button"
                          onClick={() => handleEditExpense(expense)}
                          className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all cursor-pointer"
                          title="Editar despesa"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}

                      {/* Delete allowed if pending or admin */}
                      {(expense.status === 'pending' || userRole === UserRole.ADMIN) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(expense.id)}
                          className="p-2 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                          title="Excluir despesa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* High Resolution Receipt Zoom & Edit Modal */}
      {zoomReceiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-gray-900 text-white rounded-2xl shadow-2xl border border-gray-800 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-3.5 sm:p-4 bg-gray-850 flex items-center justify-between border-b border-gray-800">
              <div className="flex items-center gap-2 max-w-[50%] sm:max-w-[60%]">
                <div className="p-1.5 bg-blue-600/30 text-blue-400 rounded-lg">
                  {isCropping ? <Crop className="w-4 h-4" /> : <Receipt className="w-4 h-4" />}
                </div>
                <div className="truncate">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white truncate">
                    {isCropping ? 'Recortar Comprovante' : (zoomReceiptTitle || 'Comprovante')}
                  </h4>
                  {saveFeedback && (
                    <span className="text-[10px] text-emerald-400 font-bold animate-pulse">
                      {saveFeedback}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 sm:gap-1.5">
                {!isCropping ? (
                  <>
                    <input 
                      type="file"
                      ref={replaceFileInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={handleUploadReplacement}
                    />
                    <button
                      type="button"
                      disabled={isUploadingReplacement || isSavingImage}
                      onClick={() => replaceFileInputRef.current?.click()}
                      className="p-1.5 text-emerald-400 hover:text-white hover:bg-emerald-600/40 rounded-lg transition-all cursor-pointer flex items-center gap-1 font-bold text-xs"
                      title="Substituir ou Anexar Novo Comprovante"
                    >
                      {isUploadingReplacement ? (
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      <span className="hidden sm:inline text-[11px]">Substituir Foto</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptZoom(prev => Math.min(3, prev + 0.25))}
                      className="p-1.5 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                      title="Aumentar Zoom"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptZoom(prev => Math.max(0.5, prev - 0.25))}
                      className="p-1.5 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                      title="Diminuir Zoom"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    {isValidImageUrl(zoomReceiptUrl) && !imageLoadError && (
                      <>
                        <button
                          type="button"
                          disabled={isSavingImage}
                          onClick={handleRotateAndSave}
                          className="p-1.5 text-blue-400 hover:text-white hover:bg-blue-600/40 rounded-lg transition-all cursor-pointer flex items-center gap-1 font-bold text-xs"
                          title="Girar 90° e Salvar no Banco de Dados"
                        >
                          {isSavingImage ? (
                            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                          ) : (
                            <RotateCw className="w-4 h-4" />
                          )}
                          <span className="hidden sm:inline text-[11px]">Girar & Salvar</span>
                        </button>
                        <button
                          type="button"
                          disabled={isSavingImage}
                          onClick={() => {
                            setIsCropping(true);
                            setCropMargins({ top: 5, bottom: 5, left: 5, right: 5 });
                          }}
                          className="p-1.5 text-amber-400 hover:text-white hover:bg-amber-600/40 rounded-lg transition-all cursor-pointer flex items-center gap-1 font-bold text-xs"
                          title="Recortar Imagem e Salvar"
                        >
                          <Crop className="w-4 h-4" />
                          <span className="hidden sm:inline text-[11px]">Recortar</span>
                        </button>
                        <a
                          href={zoomReceiptUrl}
                          download="comprovante.jpg"
                          className="p-1.5 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                          title="Baixar Arquivo"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setZoomReceiptUrl(null);
                        setReceiptRotation(0);
                        setReceiptZoom(1);
                        setIsCropping(false);
                        setImageLoadError(false);
                        setSaveFeedback(null);
                      }}
                      className="p-1.5 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors cursor-pointer ml-1"
                      title="Fechar"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isSavingImage}
                      onClick={() => setIsCropping(false)}
                      className="px-2.5 py-1.5 text-xs font-bold text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={isSavingImage}
                      onClick={handleApplyCropAndSave}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {isSavingImage ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      Salvar Recorte
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Controles de Recorte */}
            {isCropping && (
              <div className="bg-gray-950/90 border-b border-gray-800 p-3 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-400 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    Ajuste as margens de corte:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCropMargins({ top: 0, bottom: 0, left: 0, right: 0 })}
                      className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] font-bold text-gray-300"
                    >
                      Zerar (0%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCropMargins({ top: 5, bottom: 5, left: 5, right: 5 })}
                      className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] font-bold text-amber-300"
                    >
                      Bordas (5%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCropMargins({ top: 12, bottom: 12, left: 10, right: 10 })}
                      className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] font-bold text-blue-300"
                    >
                      Foco Central (12%)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-gray-900 border border-gray-800 rounded-lg p-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-gray-400">
                      <span>Topo</span>
                      <span className="text-white font-mono">{cropMargins.top}%</span>
                    </div>
                    <input 
                      type="range" 
                      min={0} 
                      max={40} 
                      value={cropMargins.top} 
                      onChange={(e) => setCropMargins(prev => ({ ...prev, top: Number(e.target.value) }))}
                      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                    />
                  </div>

                  <div className="bg-gray-900 border border-gray-800 rounded-lg p-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-gray-400">
                      <span>Base</span>
                      <span className="text-white font-mono">{cropMargins.bottom}%</span>
                    </div>
                    <input 
                      type="range" 
                      min={0} 
                      max={40} 
                      value={cropMargins.bottom} 
                      onChange={(e) => setCropMargins(prev => ({ ...prev, bottom: Number(e.target.value) }))}
                      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                    />
                  </div>

                  <div className="bg-gray-900 border border-gray-800 rounded-lg p-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-gray-400">
                      <span>Esquerda</span>
                      <span className="text-white font-mono">{cropMargins.left}%</span>
                    </div>
                    <input 
                      type="range" 
                      min={0} 
                      max={40} 
                      value={cropMargins.left} 
                      onChange={(e) => setCropMargins(prev => ({ ...prev, left: Number(e.target.value) }))}
                      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                    />
                  </div>

                  <div className="bg-gray-900 border border-gray-800 rounded-lg p-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-gray-400">
                      <span>Direita</span>
                      <span className="text-white font-mono">{cropMargins.right}%</span>
                    </div>
                    <input 
                      type="range" 
                      min={0} 
                      max={40} 
                      value={cropMargins.right} 
                      onChange={(e) => setCropMargins(prev => ({ ...prev, right: Number(e.target.value) }))}
                      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Imagem */}
            <div className="p-4 sm:p-6 bg-gray-950 flex items-center justify-center overflow-auto min-h-[380px] max-h-[70vh] relative">
              {!isValidImageUrl(zoomReceiptUrl) || imageLoadError ? (
                <div className="flex flex-col items-center justify-center p-8 max-w-md text-center bg-gray-900/90 border border-gray-800 rounded-2xl shadow-xl my-6">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3 shadow-inner">
                    <ImageOff className="w-8 h-8" />
                  </div>
                  <h4 className="text-white font-bold text-sm mb-1">
                    Comprovante com Imagem Indisponível
                  </h4>
                  <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                    O envio anterior desta despesa no dispositivo móvel gerou um arquivo corrompido ou vazio (0 bytes). Você pode reanexar o cupom/comprovante correto agora mesmo.
                  </p>
                  
                  <button
                    type="button"
                    disabled={isUploadingReplacement}
                    onClick={() => replaceFileInputRef.current?.click()}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-blue-600/30 cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingReplacement ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Gravando no Banco de Dados...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Selecionar e Gravar Comprovante</span>
                      </>
                    )}
                  </button>
                </div>
              ) : isCropping ? (
                <div className="relative inline-block max-w-full max-h-[58vh]">
                  <img 
                    src={zoomReceiptUrl} 
                    alt="Recorte de Comprovante"
                    className="max-w-full max-h-[58vh] object-contain rounded select-none opacity-90"
                    referrerPolicy="no-referrer"
                    onError={() => setImageLoadError(true)}
                  />
                  <div 
                    className="absolute border-2 border-dashed border-amber-400 bg-amber-400/10 shadow-2xl transition-all pointer-events-none rounded"
                    style={{
                      top: `${cropMargins.top}%`,
                      bottom: `${cropMargins.bottom}%`,
                      left: `${cropMargins.left}%`,
                      right: `${cropMargins.right}%`,
                    }}
                  >
                    <span className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-amber-400 border border-white rounded-full"></span>
                    <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-400 border border-white rounded-full"></span>
                    <span className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-amber-400 border border-white rounded-full"></span>
                    <span className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-amber-400 border border-white rounded-full"></span>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="bg-black/75 text-amber-300 text-[10px] font-black uppercase px-2 py-0.5 rounded shadow">
                        Área Mantida
                      </span>
                    </div>
                  </div>

                  <div className="absolute top-0 left-0 right-0 bg-black/60 pointer-events-none" style={{ height: `${cropMargins.top}%` }} />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 pointer-events-none" style={{ height: `${cropMargins.bottom}%` }} />
                  <div className="absolute top-0 bottom-0 left-0 bg-black/60 pointer-events-none" style={{ top: `${cropMargins.top}%`, bottom: `${cropMargins.bottom}%`, width: `${cropMargins.left}%` }} />
                  <div className="absolute top-0 bottom-0 right-0 bg-black/60 pointer-events-none" style={{ top: `${cropMargins.top}%`, bottom: `${cropMargins.bottom}%`, width: `${cropMargins.right}%` }} />
                </div>
              ) : (
                <img 
                  src={zoomReceiptUrl} 
                  alt="Comprovante Ampliado"
                  style={{ 
                    transform: `scale(${receiptZoom}) rotate(${receiptRotation}deg)`,
                    transition: 'transform 0.2s ease-in-out'
                  }}
                  className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg"
                  referrerPolicy="no-referrer"
                  onError={() => setImageLoadError(true)}
                />
              )}
            </div>

            {/* Rodapé informativo */}
            <div className="px-4 py-2 bg-gray-900 border-t border-gray-800 text-[11px] text-gray-400 flex items-center justify-between">
              <span>
                {isCropping 
                  ? 'Ajuste as réguas acima e clique em "Salvar Recorte" para gravar no banco.' 
                  : 'Ao girar ou recortar, a nova imagem é gravada permanentemente no banco.'}
              </span>
              {zoomExpense?.actualValue && (
                <span className="font-bold text-gray-300 font-mono">
                  Valor: {formatCurrency(zoomExpense.actualValue)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
