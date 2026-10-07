import React, { useState, useEffect, useMemo } from 'react';
import { 
  RouteMonthlyPlanning, 
  MaintenanceRecord, 
  Address, 
  RouteExpense, 
  UserProfile,
  RouteCostItem
} from '../types';
import { dataService } from '../services/dataService';
import { format, parseISO } from 'date-fns';
import { 
  Receipt, 
  Calendar, 
  Route, 
  User, 
  Eye, 
  ChevronDown, 
  ChevronUp, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  X, 
  Plus,
  Check, 
  Download, 
  Search, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  FileSpreadsheet, 
  Printer,
  Sparkles,
  ShieldCheck,
  FileText,
  Crop,
  Loader2,
  Sliders,
  Scissors,
  Maximize2,
  Upload,
  AlertTriangle,
  ImageOff
} from 'lucide-react';
import { cn } from '../lib/utils';
import { isValidImageUrl, compressImageToBase64 } from '../lib/image-utils';

// Helper seguro para carregar imagens e contornar restrições de CORS
async function loadImageSafe(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => {
      // Fallback tentando carregar sem anonymous se for URL pública
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

interface Props {
  managerClientId?: string;
  userProfile?: UserProfile | null;
}

export function RouteExpensesReport({ managerClientId, userProfile }: Props) {
  const [month, setMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState<boolean>(true);
  
  // Data
  const [allRoutePlannings, setAllRoutePlannings] = useState<RouteMonthlyPlanning[]>([]);
  const [allRecords, setAllRecords] = useState<MaintenanceRecord[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [expenses, setExpenses] = useState<RouteExpense[]>([]);

  // Filters
  const [selectedRoute, setSelectedRoute] = useState<string>('ALL');
  const [selectedTechnician, setSelectedTechnician] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Modal for Printable Route Dossier
  const [reportModalRoute, setReportModalRoute] = useState<any | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<boolean>(false);

  // Expanded routes accordion state
  const [expandedRoutes, setExpandedRoutes] = useState<Record<string, boolean>>({});

  // Receipt Modal State
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
  const replaceFileInputRef = React.useRef<HTMLInputElement>(null);
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
      setSaveFeedback('Processando e salvando novo comprovante no banco...');
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

      if (reportModalRoute && reportModalRoute.expenses) {
        setReportModalRoute((prev: any) => {
          if (!prev) return null;
          return {
            ...prev,
            expenses: prev.expenses.map((e: any) => e.id === zoomExpense.id ? { ...e, receiptUrl: base64 } : e)
          };
        });
      }

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

      // Persistir no banco de dados caso haja a despesa
      if (zoomExpense && zoomExpense.id) {
        await dataService.saveRouteExpense({
          ...zoomExpense,
          id: zoomExpense.id,
          receiptUrl: rotatedUrl
        });

        // Atualizar lista de despesas em memória
        setExpenses(prev => prev.map(e => e.id === zoomExpense.id ? { ...e, receiptUrl: rotatedUrl } : e));
        setZoomExpense(prev => prev ? { ...prev, receiptUrl: rotatedUrl } : null);

        // Se o modal de impressão estiver aberto, atualizar a rota impressa
        if (reportModalRoute && reportModalRoute.expenses) {
          setReportModalRoute((prev: any) => {
            if (!prev) return null;
            return {
              ...prev,
              expenses: prev.expenses.map((e: any) => e.id === zoomExpense.id ? { ...e, receiptUrl: rotatedUrl } : e)
            };
          });
        }
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

      // Persistir no banco de dados caso haja a despesa
      if (zoomExpense && zoomExpense.id) {
        await dataService.saveRouteExpense({
          ...zoomExpense,
          id: zoomExpense.id,
          receiptUrl: croppedUrl
        });

        // Atualizar lista de despesas em memória
        setExpenses(prev => prev.map(e => e.id === zoomExpense.id ? { ...e, receiptUrl: croppedUrl } : e));
        setZoomExpense(prev => prev ? { ...prev, receiptUrl: croppedUrl } : null);

        // Se o modal de impressão estiver aberto, atualizar a rota impressa
        if (reportModalRoute && reportModalRoute.expenses) {
          setReportModalRoute((prev: any) => {
            if (!prev) return null;
            return {
              ...prev,
              expenses: prev.expenses.map((e: any) => e.id === zoomExpense.id ? { ...e, receiptUrl: croppedUrl } : e)
            };
          });
        }
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

  // Reject Modal State
  const [rejectModalExpense, setRejectModalExpense] = useState<RouteExpense | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Add Expense Modal State
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [addExpenseRouteName, setAddExpenseRouteName] = useState<string>('');
  const [newExpenseDate, setNewExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newExpenseTechnicianName, setNewExpenseTechnicianName] = useState('');
  const [newExpenseCategory, setNewExpenseCategory] = useState('Alimentação');
  const [newExpenseDescription, setNewExpenseDescription] = useState('');
  const [newExpenseValue, setNewExpenseValue] = useState<string>('');
  const [newExpenseReceiptUrl, setNewExpenseReceiptUrl] = useState<string | null>(null);
  const [isUploadingNewExpenseImage, setIsUploadingNewExpenseImage] = useState(false);
  const [isAddingExpense, setIsAddingExpense] = useState(false);

  // Load Data
  useEffect(() => {
    loadData();
    const unsub = dataService.subscribeRouteExpenses((updated) => {
      setExpenses(updated);
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
      console.error('Erro ao carregar despesas de rotas para o relatório:', err);
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
      routeNotes?: string;
      routeColor?: string;
    }> = {};

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
          routeColor: r.routeColor
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
          routeColor: p.routeColor
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

    // Also include any routes that have expenses registered
    expenses.forEach(e => {
      if (e.routeName && !routeMap[e.routeName]) {
        routeMap[e.routeName] = {
          routeName: e.routeName,
          month,
          routeEstimatedCost: 0,
          routeCostItems: [],
          technicians: [e.technicianName].filter(Boolean)
        };
      }
    });

    return Object.values(routeMap);
  }, [allRecords, allRoutePlannings, addresses, month, expenses]);

  // Unique technician list for filter
  const technicianList = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach(e => {
      if (e.technicianName) set.add(e.technicianName);
    });
    monthlyRoutes.forEach(r => {
      r.technicians.forEach(t => set.add(t));
    });
    return Array.from(set).sort();
  }, [expenses, monthlyRoutes]);

  // General Global Stats
  const globalStats = useMemo(() => {
    const totalEstimated = monthlyRoutes.reduce((acc, curr) => acc + (curr.routeEstimatedCost || 0), 0);
    const totalSpent = expenses.reduce((acc, curr) => acc + (curr.actualValue || 0), 0);
    const totalApproved = expenses.filter(e => e.status === 'approved').reduce((acc, curr) => acc + (curr.actualValue || 0), 0);
    const totalPending = expenses.filter(e => e.status === 'pending').reduce((acc, curr) => acc + (curr.actualValue || 0), 0);
    const totalRejected = expenses.filter(e => e.status === 'rejected').reduce((acc, curr) => acc + (curr.actualValue || 0), 0);

    const pendingCount = expenses.filter(e => e.status === 'pending').length;
    const approvedCount = expenses.filter(e => e.status === 'approved').length;
    const rejectedCount = expenses.filter(e => e.status === 'rejected').length;

    const remainingBudget = totalEstimated - totalSpent;

    return {
      totalEstimated,
      totalSpent,
      totalApproved,
      totalPending,
      totalRejected,
      pendingCount,
      approvedCount,
      rejectedCount,
      remainingBudget
    };
  }, [monthlyRoutes, expenses]);

  // Group and filter routes data
  const routeGroups = useMemo(() => {
    return monthlyRoutes.map(r => {
      const routeExpList = expenses.filter(e => {
        if (e.routeName !== r.routeName) return false;
        if (selectedTechnician !== 'ALL' && e.technicianName !== selectedTechnician) return false;
        if (selectedStatus !== 'ALL' && e.status !== selectedStatus) return false;
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const descMatch = (e.description || '').toLowerCase().includes(term);
          const techMatch = (e.technicianName || '').toLowerCase().includes(term);
          const catMatch = (e.category || '').toLowerCase().includes(term);
          if (!descMatch && !techMatch && !catMatch) return false;
        }
        return true;
      });

      const totalRouteSpent = routeExpList.reduce((acc, curr) => acc + (curr.actualValue || 0), 0);
      const totalRouteApproved = routeExpList.filter(e => e.status === 'approved').reduce((acc, curr) => acc + (curr.actualValue || 0), 0);
      const totalRoutePending = routeExpList.filter(e => e.status === 'pending').reduce((acc, curr) => acc + (curr.actualValue || 0), 0);
      const routePendingCount = routeExpList.filter(e => e.status === 'pending').length;
      const percentageUsed = r.routeEstimatedCost > 0 ? Math.round((totalRouteSpent / r.routeEstimatedCost) * 100) : 0;

      return {
        ...r,
        expenses: routeExpList,
        totalRouteSpent,
        totalRouteApproved,
        totalRoutePending,
        routePendingCount,
        percentageUsed,
        balance: r.routeEstimatedCost - totalRouteSpent
      };
    }).filter(rg => {
      if (selectedRoute !== 'ALL' && rg.routeName !== selectedRoute) return false;
      if (selectedStatus !== 'ALL' && rg.expenses.length === 0) return false;
      if (selectedTechnician !== 'ALL' && rg.expenses.length === 0 && !rg.technicians.includes(selectedTechnician)) return false;
      return true;
    });
  }, [monthlyRoutes, expenses, selectedRoute, selectedTechnician, selectedStatus, searchTerm]);

  // Keep modal route in sync with live data if open
  useEffect(() => {
    if (reportModalRoute) {
      const updated = routeGroups.find(r => r.routeName === reportModalRoute.routeName);
      if (updated) {
        setReportModalRoute(updated);
      }
    }
  }, [routeGroups]);

  // Approve expense action
  const handleApproveExpense = async (expense: RouteExpense) => {
    try {
      setIsUpdatingStatus(true);
      await dataService.updateRouteExpenseStatus(
        expense.id,
        'approved',
        undefined,
        userProfile?.name || 'Administrador',
        userProfile?.uid
      );
    } catch (err) {
      console.error('Erro ao aprovar despesa:', err);
      alert('Erro ao aprovar despesa.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Revert to pending action
  const handleRevertExpense = async (expense: RouteExpense) => {
    try {
      setIsUpdatingStatus(true);
      await dataService.updateRouteExpenseStatus(
        expense.id,
        'pending',
        undefined,
        undefined,
        undefined
      );
    } catch (err) {
      console.error('Erro ao reverter status da despesa:', err);
      alert('Erro ao reverter status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Confirm rejection
  const handleConfirmRejection = async () => {
    if (!rejectModalExpense) return;
    try {
      setIsUpdatingStatus(true);
      await dataService.updateRouteExpenseStatus(
        rejectModalExpense.id,
        'rejected',
        rejectionReason.trim() || 'Despesa rejeitada na auditoria',
        userProfile?.name || 'Administrador',
        userProfile?.uid
      );
      setRejectModalExpense(null);
      setRejectionReason('');
    } catch (err) {
      console.error('Erro ao reprovar despesa:', err);
      alert('Erro ao reprovar despesa.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const openAddExpenseModal = (group: any) => {
    setAddExpenseRouteName(group.routeName);
    setNewExpenseDate(format(new Date(), 'yyyy-MM-dd'));
    setNewExpenseTechnicianName(group.technicians?.[0] || '');
    setNewExpenseCategory('Alimentação');
    setNewExpenseDescription('');
    setNewExpenseValue('');
    setNewExpenseReceiptUrl(null);
    setIsAddExpenseModalOpen(true);
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addExpenseRouteName || !newExpenseDate || !newExpenseDescription || !newExpenseValue) {
      alert("Preencha os campos obrigatórios.");
      return;
    }

    const valueNum = parseFloat(newExpenseValue.replace(',', '.'));
    if (isNaN(valueNum) || valueNum <= 0) {
      alert("Valor inválido.");
      return;
    }

    try {
      setIsAddingExpense(true);
      const newExpense: any = {
        routeName: addExpenseRouteName,
        month,
        technicianName: newExpenseTechnicianName || 'Administrador',
        category: newExpenseCategory,
        description: newExpenseDescription,
        actualValue: valueNum,
        expenseDate: newExpenseDate,
        receiptUrl: newExpenseReceiptUrl || undefined,
        status: 'approved', // Auto-approve if created by admin
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        reviewNotes: 'Despesa lançada via Administrativo',
        reviewerName: userProfile?.name || 'Administrador'
      };

      await dataService.saveRouteExpense(newExpense);
      
      setIsAddExpenseModalOpen(false);
      
      // Reload data to show new expense
      loadData();
    } catch (err) {
      console.error('Erro ao adicionar despesa:', err);
      alert('Erro ao adicionar despesa.');
    } finally {
      setIsAddingExpense(false);
    }
  };

  // Delete expense
  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta despesa permanentemente?')) return;
    try {
      await dataService.deleteRouteExpense(id);
      loadData();
    } catch (err) {
      console.error('Erro ao excluir despesa:', err);
      alert('Erro ao excluir despesa.');
    }
  };

  // Currency helper
  const formatCurrency = (val?: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Mês',
      'Rota',
      'Data Despesa',
      'Técnico',
      'Categoria',
      'Descrição',
      'Valor Real (R$)',
      'Status',
      'Aprovado Por',
      'Motivo Reprovação / Notas',
      'Possui Comprovante'
    ];

    const rows: string[][] = [headers];

    expenses.forEach(e => {
      rows.push([
        month,
        `"${(e.routeName || '').replace(/"/g, '""')}"`,
        e.expenseDate || '',
        `"${(e.technicianName || '').replace(/"/g, '""')}"`,
        `"${(e.category || '').replace(/"/g, '""')}"`,
        `"${(e.description || '').replace(/"/g, '""')}"`,
        (e.actualValue || 0).toFixed(2).replace('.', ','),
        e.status === 'approved' ? 'Aprovado' : e.status === 'rejected' ? 'Reprovado' : 'Em Análise',
        `"${(e.reviewedByName || '').replace(/"/g, '""')}"`,
        `"${(e.reviewNotes || '').replace(/"/g, '""')}"`,
        e.receiptUrl ? 'Sim' : 'Não'
      ]);
    });

    const csvContent = '\uFEFF' + rows.map(r => r.join(';')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Relatorio_Despesas_Rotas_${month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Toggle Route Accordion
  const toggleRouteAccordion = (routeName: string) => {
    setExpandedRoutes(prev => ({
      ...prev,
      [routeName]: !prev[routeName]
    }));
  };

  const expandAll = () => {
    const newState: Record<string, boolean> = {};
    monthlyRoutes.forEach(r => { newState[r.routeName] = true; });
    setExpandedRoutes(newState);
  };

  const collapseAll = () => {
    const newState: Record<string, boolean> = {};
    monthlyRoutes.forEach(r => { newState[r.routeName] = false; });
    setExpandedRoutes(newState);
  };

  const handlePrintRouteReport = () => {
    const reportElement = document.getElementById('printable-route-report-a4');
    if (!reportElement) {
      window.print();
      return;
    }

    try {
      // Coleta todos os estilos e fontes carregados no documento
      const styleNodes = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'));
      const stylesHtml = styleNodes.map(node => node.outerHTML).join('\n');
      const contentHtml = reportElement.innerHTML;

      // Remove iframe anterior se existir
      const existingIframe = document.getElementById('print-isolated-report-iframe');
      if (existingIframe) {
        existingIframe.remove();
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'print-isolated-report-iframe';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.visibility = 'hidden';

      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!iframeDoc) throw new Error('Não foi possível inicializar o frame de impressão');

      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <title>Relatório de Prestação de Contas - ${reportModalRoute?.routeName || 'Rota'}</title>
          ${stylesHtml}
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm 10mm 10mm 10mm !important;
            }
            *, *::before, *::after {
              box-sizing: border-box !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              height: auto !important;
              min-height: auto !important;
              overflow: visible !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            }
            .print-avoid-break {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .print-page-break {
              page-break-before: always !important;
              break-before: page !important;
            }
            table {
              width: 100% !important;
              border-collapse: collapse !important;
            }
            tr {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            img {
              max-width: 100% !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          </style>
        </head>
        <body class="bg-white text-gray-900 p-0 m-0">
          <div style="width: 100%; max-width: 210mm; margin: 0 auto; background: #ffffff;">
            ${contentHtml}
          </div>
        </body>
        </html>
      `);
      iframeDoc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (printErr) {
          console.error('Falha ao acionar print no iframe, fallback para janela:', printErr);
          window.print();
        }
      }, 350);
    } catch (err) {
      console.error('Erro na impressão isolada:', err);
      const modalEl = document.querySelector('.route-report-modal-backdrop');
      if (modalEl) modalEl.scrollTop = 0;
      window.scrollTo(0, 0);
      setTimeout(() => window.print(), 100);
    }
  };

  const handleDownloadRouteReportPDF = async () => {
    if (!reportModalRoute || isGeneratingPDF) return;
    setIsGeneratingPDF(true);
    try {
      const element = document.getElementById('printable-route-report-a4');
      if (!element) throw new Error('Elemento do relatório não encontrado');

      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;

      // Captura o elemento do relatório A4 com resolução nítida
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 1200
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      
      // Documento PDF em formato A4 retrato
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;
      
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      // Adiciona a primeira página
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      // Adiciona páginas subsequentes se o relatório for mais longo que 1 folha A4
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const cleanRouteName = (reportModalRoute.routeName || 'Rota')
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `Relatorio_Despesas_${cleanRouteName}_${month}.pdf`;

      pdf.save(filename);
    } catch (err) {
      console.error('Erro ao gerar PDF diretamente:', err);
      // Fallback: caso a captura do canvas seja restrita, aciona o print do navegador
      handlePrintRouteReport();
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <>
      {/* Folha de estilos estrita de impressão para garantir que o Relatório A4 saia perfeito desde a 1ª página sem folhas em branco */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 10mm 10mm 10mm !important;
          }

          /* Reset total para corpo e html - elimina páginas em branco */
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Esconder elementos externos de navegação, cabeçalhos e botões */
          aside,
          nav,
          header,
          footer,
          #app-header,
          .no-print,
          .print\\:hidden,
          .print-hide,
          button,
          input,
          select {
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

          /* Esconder o conteúdo de tela apenas quando o modal A4 estiver aberto */
          ${reportModalRoute ? `
          .route-expenses-screen-content {
            display: none !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
          }
          ` : `
          .route-expenses-screen-content {
            display: block !important;
            height: auto !important;
            overflow: visible !important;
          }
          `}

          /* Forçar que todos os contêineres ancestrais fiquem no fluxo normal sem limites de altura nem transforms que quebram a 1ª página */
          #root,
          #root > div,
          main,
          main > div,
          div[class*="overflow-auto"],
          div[class*="overflow-y-auto"],
          div[class*="h-full"],
          div[class*="flex-1"] {
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
            box-shadow: none !important;
            border: none !important;
          }

          /* O modal de impressão se transforma em contêiner plano sem backdrop escuro */
          .route-report-modal-backdrop {
            position: static !important;
            display: block !important;
            background: #ffffff !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            inset: auto !important;
            z-index: auto !important;
          }

          /* O documento executivo A4 impresso limpo a partir do topo da página 1 */
          #printable-route-report-a4 {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
          }

          /* Regras de quebra de página */
          .print-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .print-page-break {
            page-break-before: always !important;
            break-before: page !important;
          }

          table {
            border-collapse: collapse !important;
            width: 100% !important;
          }

          thead {
            display: table-header-group !important;
          }

          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          img {
            max-width: 100% !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Garantir nitidez de cores de impressão */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div className="space-y-6 pb-12 print:hidden route-expenses-screen-content">
        {/* Top Header & Month Filter */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-600 text-white rounded-xl">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-gray-900">
                  Auditoria & Gestão de Despesas de Rotas
                </h2>
                <p className="text-xs text-gray-500 font-medium">
                  Monitore os custos previstos, audite os comprovantes anexados pelos técnicos e emita relatórios executivos para a diretoria.
                </p>
              </div>
            </div>
          </div>

          {/* Month Selector & Export Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 shadow-2xs">
              <Calendar className="w-4 h-4 text-gray-500" />
              <input 
                type="month" 
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="bg-transparent text-xs font-bold text-gray-800 outline-none cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Exportar CSV de Despesas"
            >
              <FileSpreadsheet className="w-4 h-4" /> Exportar CSV
            </button>

            <button
              type="button"
              onClick={() => {
                if (selectedRoute !== 'ALL') {
                  const match = routeGroups.find(r => r.routeName === selectedRoute);
                  if (match) {
                    setReportModalRoute(match);
                    return;
                  }
                }
                if (routeGroups.length > 0) {
                  setReportModalRoute(routeGroups[0]);
                }
              }}
              className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Visualizar e Imprimir Relatório Executivo da Rota (A4)"
            >
              <Printer className="w-4 h-4" /> Imprimir Relatório da Rota
            </button>
          </div>
        </div>

        {/* Global KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Total Previsto */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Total Previsto (Mês)</span>
              <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-xl font-black text-gray-900 font-mono block">
                {formatCurrency(globalStats.totalEstimated)}
              </span>
              <span className="text-[11px] text-gray-500 font-medium mt-0.5 block">
                {monthlyRoutes.length} rotas programadas
              </span>
            </div>
          </div>

          {/* Card 2: Total Lançado */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Total Lançado</span>
              <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-xl font-black text-indigo-700 font-mono block">
                {formatCurrency(globalStats.totalSpent)}
              </span>
              <span className="text-[11px] text-gray-500 font-medium mt-0.5 block">
                {expenses.length} despesas registradas
              </span>
            </div>
          </div>

          {/* Card 3: Total Aprovado */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Aprovados</span>
              <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-xl font-black text-emerald-600 font-mono block">
                {formatCurrency(globalStats.totalApproved)}
              </span>
              <span className="text-[11px] text-emerald-700 font-bold mt-0.5 block">
                {globalStats.approvedCount} validados
              </span>
            </div>
          </div>

          {/* Card 4: Pendentes */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Pendentes de Ação</span>
              <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-xl font-black text-amber-600 font-mono block">
                {formatCurrency(globalStats.totalPending)}
              </span>
              <span className="text-[11px] text-amber-700 font-bold mt-0.5 block">
                {globalStats.pendingCount} aguardando análise
              </span>
            </div>
          </div>

          {/* Card 5: Saldo / Economia */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Saldo / Desvio</span>
              <div className={cn(
                "p-1.5 rounded-lg",
                globalStats.remainingBudget >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              )}>
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className={cn(
                "text-xl font-black font-mono block",
                globalStats.remainingBudget >= 0 ? "text-emerald-700" : "text-rose-600"
              )}>
                {formatCurrency(globalStats.remainingBudget)}
              </span>
              <span className="text-[11px] text-gray-500 font-medium mt-0.5 block">
                {globalStats.remainingBudget >= 0 ? 'Economia no mês' : 'Excedeu orçamento'}
              </span>
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search Input */}
            <div className="relative min-w-[220px] flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                placeholder="Buscar por descrição ou técnico..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:border-blue-500"
              />
            </div>

            {/* Route Filter */}
            <select
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
              className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-blue-500"
            >
              <option value="ALL">Todas as Rotas ({monthlyRoutes.length})</option>
              {monthlyRoutes.map(r => (
                <option key={r.routeName} value={r.routeName}>
                  {r.routeName}
                </option>
              ))}
            </select>

            {/* Technician Filter */}
            <select
              value={selectedTechnician}
              onChange={(e) => setSelectedTechnician(e.target.value)}
              className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-blue-500"
            >
              <option value="ALL">Todos os Técnicos</option>
              {technicianList.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-blue-500"
            >
              <option value="ALL">Todos os Status</option>
              <option value="pending">Aguardando Análise (Pendente)</option>
              <option value="approved">Aprovados</option>
              <option value="rejected">Reprovados</option>
            </select>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              type="button"
              onClick={expandAll}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-1"
            >
              Expandir Todas
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={collapseAll}
              className="text-xs font-bold text-gray-500 hover:text-gray-800 px-2 py-1"
            >
              Recolher Todas
            </button>
          </div>
        </div>

        {/* Routes Accordion List */}
        {loading ? (
          <div className="bg-white border border-gray-200/80 rounded-2xl p-12 text-center text-xs text-gray-400 font-medium">
            Carregando despesas e rotas...
          </div>
        ) : routeGroups.length === 0 ? (
          <div className="bg-white border border-gray-200/80 rounded-2xl p-12 text-center">
            <Route className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-gray-800">Nenhuma rota encontrada</h3>
            <p className="text-xs text-gray-400 mt-1">
              Verifique os filtros selecionados ou cadastre despesas no módulo mobile do técnico.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {routeGroups.map((group) => {
              const isExpanded = expandedRoutes[group.routeName] ?? true;

              return (
                <div 
                  key={group.routeName}
                  className="bg-white border border-gray-200/90 rounded-2xl overflow-hidden shadow-xs transition-all"
                >
                  {/* Route Header Card */}
                  <div 
                    onClick={() => toggleRouteAccordion(group.routeName)}
                    className="p-4 bg-gray-50/70 hover:bg-gray-100/60 transition-colors cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200/70"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-blue-600 text-white rounded-xl shrink-0">
                        <Route className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-extrabold text-gray-900 truncate">
                            {group.routeName}
                          </h3>
                          {group.routePendingCount > 0 && (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                              {group.routePendingCount} {group.routePendingCount === 1 ? 'pendência' : 'pendências'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                          {group.plannedDate && (
                            <span className="font-mono font-medium">
                              {format(parseISO(group.plannedDate), 'dd/MM/yyyy')} {group.returnDate && `a ${format(parseISO(group.returnDate), 'dd/MM/yyyy')}`}
                            </span>
                          )}
                          {group.technicians.length > 0 && (
                            <span>
                              Técnicos: <strong className="text-gray-700">{group.technicians.join(', ')}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Route Financial Quick Summary & Action Buttons */}
                    <div className="flex items-center gap-4 sm:gap-6 self-end md:self-auto shrink-0 flex-wrap">
                      <div className="text-right">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Previsto</span>
                        <span className="text-xs font-black text-gray-900 font-mono">
                          {formatCurrency(group.routeEstimatedCost)}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Lançado</span>
                        <span className="text-xs font-black text-indigo-700 font-mono">
                          {formatCurrency(group.totalRouteSpent)}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Aprovado</span>
                        <span className="text-xs font-black text-emerald-600 font-mono">
                          {formatCurrency(group.totalRouteApproved)}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Saldo</span>
                        <span className={cn(
                          "text-xs font-black font-mono",
                          group.balance >= 0 ? "text-emerald-700" : "text-rose-600"
                        )}>
                          {formatCurrency(group.balance)}
                        </span>
                      </div>

                      {/* Botões de Ação Direto na Rota */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAddExpenseModal(group);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold text-xs rounded-xl border border-emerald-200 shadow-xs transition-all cursor-pointer"
                          title="Adicionar Despesa Manualmente"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Nova Despesa</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReportModalRoute(group);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold text-xs rounded-xl border border-blue-200 shadow-xs transition-all cursor-pointer"
                          title="Visualizar e Imprimir Relatório A4 desta Rota para Diretoria"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Imprimir Relatório</span>
                        </button>
                      </div>

                      <div className="p-1 text-gray-400 hover:text-gray-600">
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </div>
                    </div>
                  </div>

                  {/* Collapsible Content */}
                  {isExpanded && (
                    <div className="p-5 space-y-4">
                      {/* Comparison: Planned items vs submitted */}
                      {group.routeCostItems.length > 0 && (
                        <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3.5 space-y-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 block">
                            Previsão Programada pelo Administrativo ({group.routeCostItems.length} itens)
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                            {group.routeCostItems.map(item => (
                              <div key={item.id} className="p-2 bg-white border border-blue-200/60 rounded-lg flex items-center justify-between text-xs">
                                <span className="font-bold text-gray-800 truncate mr-2">{item.description}</span>
                                <span className="font-mono font-extrabold text-blue-700 shrink-0">
                                  {formatCurrency(item.value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Expenses Table */}
                      {group.expenses.length === 0 ? (
                        <div className="border border-dashed border-gray-200 rounded-xl py-6 text-center text-xs text-gray-400">
                          Nenhuma despesa preenchida pelos técnicos nesta rota até o momento.
                        </div>
                      ) : (
                        <div className="border border-gray-150 rounded-xl overflow-hidden shadow-2xs">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-gray-100/70 border-b border-gray-200 text-[10px] font-black uppercase tracking-wider text-gray-500">
                                  <th className="p-3">Data</th>
                                  <th className="p-3">Técnico</th>
                                  <th className="p-3">Categoria</th>
                                  <th className="p-3">Descrição do Gasto</th>
                                  <th className="p-3 text-right">Valor (R$)</th>
                                  <th className="p-3 text-center">Comprovante</th>
                                  <th className="p-3 text-center">Status</th>
                                  <th className="p-3 text-right">Ações de Auditoria</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 bg-white">
                                {group.expenses.map((expense) => {
                                  const isApproved = expense.status === 'approved';
                                  const isRejected = expense.status === 'rejected';
                                  const isPending = expense.status === 'pending';

                                  return (
                                    <tr key={expense.id} className="hover:bg-gray-50/70 transition-colors">
                                      <td className="p-3 font-medium text-gray-700 whitespace-nowrap">
                                        {expense.expenseDate 
                                          ? format(parseISO(expense.expenseDate), 'dd/MM/yyyy')
                                          : '--'}
                                      </td>
                                      <td className="p-3 font-bold text-gray-900 whitespace-nowrap">
                                        <div className="flex items-center gap-1.5">
                                          <User className="w-3.5 h-3.5 text-gray-400" />
                                          <span>{expense.technicianName || 'Técnico'}</span>
                                        </div>
                                      </td>
                                      <td className="p-3 whitespace-nowrap">
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 font-semibold rounded-md text-[11px]">
                                          {expense.category || 'Geral'}
                                        </span>
                                      </td>
                                      <td className="p-3 font-semibold text-gray-900">
                                        <div>
                                          <p className="line-clamp-1">{expense.description}</p>
                                          {expense.reviewNotes && (
                                            <p className="text-[10px] text-rose-600 italic mt-0.5">
                                              Obs Auditoria: {expense.reviewNotes}
                                            </p>
                                          )}
                                          {expense.reviewedByName && (
                                            <p className="text-[10px] text-gray-400 font-normal">
                                              {isApproved ? 'Aprovado por' : 'Avaliado por'}: {expense.reviewedByName}
                                            </p>
                                          )}
                                        </div>
                                      </td>
                                      <td className="p-3 text-right font-mono font-black text-gray-900 whitespace-nowrap">
                                        {formatCurrency(expense.actualValue)}
                                      </td>
                                      <td className="p-3 text-center whitespace-nowrap">
                                        {expense.receiptUrl ? (
                                          isValidImageUrl(expense.receiptUrl) ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setZoomExpense(expense);
                                                setZoomReceiptUrl(expense.receiptUrl!);
                                                setZoomReceiptTitle(expense.description || 'Comprovante');
                                                setReceiptRotation(0);
                                                setReceiptZoom(1);
                                                setIsCropping(false);
                                                setImageLoadError(false);
                                                setCropMargins({ top: 5, bottom: 5, left: 5, right: 5 });
                                              }}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                                            >
                                              <Eye className="w-3 h-3" /> Ver Foto
                                            </button>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setZoomExpense(expense);
                                                setZoomReceiptUrl(expense.receiptUrl!);
                                                setZoomReceiptTitle(expense.description || 'Comprovante');
                                                setReceiptRotation(0);
                                                setReceiptZoom(1);
                                                setIsCropping(false);
                                                setImageLoadError(true);
                                                setCropMargins({ top: 5, bottom: 5, left: 5, right: 5 });
                                              }}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 rounded-lg font-bold text-[11px] transition-colors cursor-pointer shadow-xs"
                                              title="A imagem enviada pelo dispositivo está corrompida. Clique para visualizar e reanexar."
                                            >
                                              <AlertTriangle className="w-3 h-3 text-amber-600" /> Reanexar Foto
                                            </button>
                                          )
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setZoomExpense(expense);
                                              setZoomReceiptUrl(null);
                                              setZoomReceiptTitle(expense.description || 'Comprovante');
                                              setReceiptRotation(0);
                                              setReceiptZoom(1);
                                              setIsCropping(false);
                                              setImageLoadError(false);
                                              setCropMargins({ top: 5, bottom: 5, left: 5, right: 5 });
                                            }}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg font-bold text-[11px] transition-colors cursor-pointer shadow-xs"
                                            title="Clique para anexar comprovante a esta despesa"
                                          >
                                            <Upload className="w-3 h-3" /> Anexar
                                          </button>
                                        )}
                                      </td>
                                      <td className="p-3 text-center whitespace-nowrap">
                                        <span className={cn(
                                          "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider inline-block",
                                          isApproved && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                                          isRejected && "bg-rose-50 text-rose-700 border border-rose-200",
                                          isPending && "bg-amber-50 text-amber-700 border border-amber-200"
                                        )}>
                                          {isApproved ? 'Aprovado' : isRejected ? 'Reprovado' : 'Em Análise'}
                                        </span>
                                      </td>
                                      <td className="p-3 text-right whitespace-nowrap">
                                        <div className="flex items-center justify-end gap-1.5">
                                          {isPending && (
                                            <>
                                              <button
                                                type="button"
                                                disabled={isUpdatingStatus}
                                                onClick={() => handleApproveExpense(expense)}
                                                className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                                                title="Aprovar Despesa"
                                              >
                                                <Check className="w-3.5 h-3.5" />
                                              </button>
                                              <button
                                                type="button"
                                                disabled={isUpdatingStatus}
                                                onClick={() => {
                                                  setRejectModalExpense(expense);
                                                  setRejectionReason('');
                                                }}
                                                className="p-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                                                title="Reprovar Despesa"
                                              >
                                                <X className="w-3.5 h-3.5" />
                                              </button>
                                            </>
                                          )}

                                          {isApproved && (
                                            <button
                                              type="button"
                                              disabled={isUpdatingStatus}
                                              onClick={() => {
                                                setRejectModalExpense(expense);
                                                setRejectionReason('');
                                              }}
                                              className="px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                              title="Alterar para Reprovado"
                                            >
                                              <X className="w-3 h-3" /> Reprovar
                                            </button>
                                          )}

                                          {isRejected && (
                                            <button
                                              type="button"
                                              disabled={isUpdatingStatus}
                                              onClick={() => handleApproveExpense(expense)}
                                              className="px-2 py-1 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                              title="Alterar para Aprovado"
                                            >
                                              <Check className="w-3 h-3" /> Aprovar
                                            </button>
                                          )}

                                          {!isPending && (
                                            <button
                                              type="button"
                                              disabled={isUpdatingStatus}
                                              onClick={() => handleRevertExpense(expense)}
                                              className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                                              title="Voltar para Em Análise"
                                            >
                                              <RotateCw className="w-3 h-3" />
                                            </button>
                                          )}

                                          <button
                                            type="button"
                                            onClick={() => handleDeleteExpense(expense.id)}
                                            className="p-1 text-gray-300 hover:text-rose-600 rounded transition-colors ml-1"
                                            title="Excluir Despesa"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de Adição de Nova Despesa (Administrativo) */}
        {isAddExpenseModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-600" /> Adicionar Despesa ({addExpenseRouteName})
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddExpenseModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddExpense} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">Data</label>
                    <input
                      type="date"
                      required
                      value={newExpenseDate}
                      onChange={(e) => setNewExpenseDate(e.target.value)}
                      className="w-full text-xs p-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">Valor (R$)</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: 50,00"
                      value={newExpenseValue}
                      onChange={(e) => {
                        let v = e.target.value.replace(/[^\d.,]/g, '');
                        setNewExpenseValue(v);
                      }}
                      className="w-full text-xs p-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">Categoria</label>
                    <select
                      value={newExpenseCategory}
                      onChange={(e) => setNewExpenseCategory(e.target.value)}
                      className="w-full text-xs p-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      <option value="Alimentação">Alimentação</option>
                      <option value="Hospedagem">Hospedagem</option>
                      <option value="Combustível">Combustível</option>
                      <option value="Pedágio">Pedágio</option>
                      <option value="Peças / Emergência">Peças / Emergência</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">Técnico (Opcional)</label>
                    <input
                      type="text"
                      value={newExpenseTechnicianName}
                      onChange={(e) => setNewExpenseTechnicianName(e.target.value)}
                      placeholder="Nome do técnico"
                      className="w-full text-xs p-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">Descrição do Gasto</label>
                  <input
                    type="text"
                    required
                    value={newExpenseDescription}
                    onChange={(e) => setNewExpenseDescription(e.target.value)}
                    placeholder="Ex: Almoço restaurante central"
                    className="w-full text-xs p-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">Comprovante / Cupom Fiscal (Opcional)</label>
                  {newExpenseReceiptUrl ? (
                    <div className="flex items-center gap-3 p-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <img 
                        src={newExpenseReceiptUrl} 
                        alt="Comprovante" 
                        className="w-12 h-12 object-cover rounded-lg border border-emerald-300 shadow-xs" 
                      />
                      <div className="flex-1 truncate">
                        <span className="text-xs font-bold text-emerald-800 block truncate">Comprovante anexado</span>
                        <span className="text-[10px] text-emerald-600">Pronto para salvar com a despesa</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewExpenseReceiptUrl(null)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Remover anexo"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/40 rounded-xl cursor-pointer transition-colors text-xs font-bold text-gray-600">
                      {isUploadingNewExpenseImage ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                          <span>Processando imagem...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-emerald-600" />
                          <span>Clique para anexar foto do comprovante</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={isUploadingNewExpenseImage}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            setIsUploadingNewExpenseImage(true);
                            const base64 = await compressImageToBase64(file, 1280, 1280, 0.75);
                            setNewExpenseReceiptUrl(base64);
                          } catch (err) {
                            console.error('Erro ao processar imagem:', err);
                            alert('Falha ao processar arquivo de imagem');
                          } finally {
                            setIsUploadingNewExpenseImage(false);
                            if (e.target) e.target.value = '';
                          }
                        }}
                      />
                    </label>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsAddExpenseModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isAddingExpense}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-70"
                  >
                    {isAddingExpense ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Adicionar
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Reprovação de Despesa */}
        {rejectModalExpense && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <X className="w-4 h-4 text-rose-600" /> Reprovar Despesa
                </h3>
                <button
                  type="button"
                  onClick={() => setRejectModalExpense(null)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-gray-50 p-3 rounded-xl space-y-1 text-xs">
                <p><strong>Descrição:</strong> {rejectModalExpense.description}</p>
                <p><strong>Técnico:</strong> {rejectModalExpense.technicianName}</p>
                <p><strong>Valor:</strong> {formatCurrency(rejectModalExpense.actualValue)}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Motivo da Reprovação (opcional / justificativa):
                </label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Ex: Comprovante ilegível, valor fora da política de reembolso, despesa duplicada..."
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModalExpense(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={handleConfirmRejection}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs"
                >
                  Confirmar Reprovação
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Zoom e Edição do Comprovante (Rotacionar & Recortar) */}
        {zoomExpense && (
          <div 
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setZoomExpense(null);
                setZoomReceiptUrl(null);
                setReceiptRotation(0);
                setReceiptZoom(1);
                setIsCropping(false);
                setImageLoadError(false);
                setSaveFeedback(null);
              }
            }}
          >
            <div className="bg-gray-900 text-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col border border-gray-800 animate-in fade-in duration-150">
              {/* Header do Modal */}
              <div className="p-3.5 sm:p-4 bg-gray-850 flex items-center justify-between border-b border-gray-800">
                <div className="flex items-center gap-2 max-w-[50%] sm:max-w-[60%]">
                  <div className="p-1.5 bg-blue-600/30 text-blue-400 rounded-lg">
                    {isCropping ? <Crop className="w-4 h-4" /> : <Receipt className="w-4 h-4" />}
                  </div>
                  <div className="truncate">
                    <span className="text-xs font-black uppercase tracking-wider block text-white truncate">
                      {isCropping 
                        ? 'Recortar Comprovante' 
                        : (zoomReceiptUrl ? (zoomReceiptTitle || 'Comprovante') : `Anexar Comprovante • ${zoomExpense.description || 'Despesa'}`)}
                    </span>
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
                        <span className="hidden sm:inline text-[11px]">
                          {zoomReceiptUrl ? 'Substituir Foto' : 'Anexar Foto'}
                        </span>
                      </button>

                      {isValidImageUrl(zoomReceiptUrl) && !imageLoadError && (
                        <>
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
                          setZoomExpense(null);
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

              {/* Controles do Modo de Recorte */}
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

              {/* Corpo da Imagem com Preview de Recorte ou Visualizador Normal */}
              <div className="p-4 sm:p-6 bg-gray-950 flex items-center justify-center overflow-auto min-h-[380px] max-h-[70vh] relative">
                {!isValidImageUrl(zoomReceiptUrl) || imageLoadError ? (
                  <div className="flex flex-col items-center justify-center p-6 sm:p-8 max-w-md text-center bg-gray-900/90 border border-gray-800 rounded-2xl shadow-xl my-4 sm:my-6">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3 shadow-inner">
                      {imageLoadError && isValidImageUrl(zoomReceiptUrl) ? (
                        <ImageOff className="w-8 h-8 text-amber-400" />
                      ) : (
                        <Upload className="w-8 h-8 text-emerald-400" />
                      )}
                    </div>
                    <h4 className="text-white font-bold text-sm mb-1">
                      {imageLoadError && isValidImageUrl(zoomReceiptUrl)
                        ? 'Comprovante com Imagem Indisponível'
                        : 'Anexar Comprovante Fiscal'}
                    </h4>
                    <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                      {imageLoadError && isValidImageUrl(zoomReceiptUrl)
                        ? 'O envio anterior desta despesa gerou um arquivo corrompido ou inacessível. Você pode reanexar o comprovante agora.'
                        : `Vincule uma imagem ou foto do cupom fiscal à despesa de ${zoomExpense?.description ? `"${zoomExpense.description}"` : 'da rota'} no valor de ${formatCurrency(zoomExpense?.actualValue)}.`}
                    </p>
                    
                    <button
                      type="button"
                      disabled={isUploadingReplacement}
                      onClick={() => replaceFileInputRef.current?.click()}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/30 cursor-pointer disabled:opacity-50"
                    >
                      {isUploadingReplacement ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Gravando no Banco de Dados...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          <span>Selecionar Foto do Comprovante</span>
                        </>
                      )}
                    </button>

                    {zoomExpense && (
                      <div className="bg-gray-850/80 rounded-xl p-3 w-full text-left text-[11px] text-gray-300 border border-gray-800 space-y-1 mt-4">
                        <div className="flex justify-between">
                          <span className="text-gray-400 font-medium">Rota:</span>
                          <span className="font-bold text-white truncate max-w-[200px]">{zoomExpense.routeName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 font-medium">Técnico:</span>
                          <span className="font-semibold text-gray-200">{zoomExpense.technicianName || 'Administrador'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 font-medium">Categoria:</span>
                          <span className="font-semibold text-emerald-400">{zoomExpense.category}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : isCropping ? (
                  <div className="relative inline-block max-w-full max-h-[58vh]">
                    {/* Imagem Base */}
                    <img 
                      src={zoomReceiptUrl} 
                      alt="Recorte de Comprovante"
                      className="max-w-full max-h-[58vh] object-contain rounded select-none opacity-90"
                      referrerPolicy="no-referrer"
                      onError={() => setImageLoadError(true)}
                    />

                    {/* Máscara de Recorte com Área Selecionada */}
                    <div 
                      className="absolute border-2 border-dashed border-amber-400 bg-amber-400/10 shadow-2xl transition-all pointer-events-none rounded"
                      style={{
                        top: `${cropMargins.top}%`,
                        bottom: `${cropMargins.bottom}%`,
                        left: `${cropMargins.left}%`,
                        right: `${cropMargins.right}%`,
                      }}
                    >
                      {/* Alças de Canto Decorativas */}
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

                    {/* Sombras das Áreas Descartadas */}
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
                    className="max-w-full max-h-[62vh] object-contain rounded-lg shadow-lg"
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
                    : 'Dica: Ao clicar em "Girar & Salvar" ou "Recortar", a nova imagem é gravada permanentemente no banco.'}
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
      </div>

      {/* MODAL DE PRÉ-VISUALIZAÇÃO E IMPRESSÃO EXECUTIVA (A4) */}
      {reportModalRoute && (
        <div className="route-report-modal-backdrop fixed inset-0 z-[100] bg-black/75 backdrop-blur-xs flex flex-col items-center justify-start overflow-y-auto p-3 sm:p-6 print:p-0 print:bg-white print:static print:inset-auto">
          {/* Action Bar (Hidden on physical print) */}
          <div className="w-full max-w-4xl bg-gray-900 text-white rounded-2xl p-4 mb-4 flex items-center justify-between shadow-2xl shrink-0 print:hidden no-print">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-xl">
                <Printer className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  Relatório Executivo de Despesas (Formato A4)
                </h3>
                <p className="text-xs text-gray-300 font-medium">
                  {reportModalRoute.routeName} &bull; Referência: {month}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleDownloadRouteReportPDF}
                disabled={isGeneratingPDF}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                title="Baixar arquivo PDF diretamente para o seu dispositivo"
              >
                {isGeneratingPDF ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Gerando PDF...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-white" />
                    <span>Baixar PDF</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePrintRouteReport}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir / Salvar PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setReportModalRoute(null)}
                className="p-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl transition-colors cursor-pointer"
                title="Fechar Relatório"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* O DOCUMENTO A4 OFICIAL (Visível na tela e EXCLUSIVAMENTE enviado à impressora) */}
          <div id="printable-route-report-a4" className="w-full max-w-[210mm] bg-white text-gray-900 rounded-none shadow-2xl p-6 sm:p-10 mb-8 border border-gray-200 print:border-none print:shadow-none print:m-0 print:p-0 print:max-w-none print:w-full print:block">
            <PrintableRouteDossier route={reportModalRoute} month={month} />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * COMPONENTE OFICIAL DO RELATÓRIO A4 PARA DIRETORIA
 */
function PrintableRouteDossier({ route, month }: { route: any; month: string }) {
  if (!route) return null;

  const formatCurrency = (val?: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Calculate total travel days
  const calculateTripDays = () => {
    if (!route.plannedDate) return 'Não informado';
    if (!route.returnDate || route.plannedDate === route.returnDate) return '1 dia de viagem';
    try {
      const s = parseISO(route.plannedDate);
      const e = parseISO(route.returnDate);
      const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (diff > 0) {
        return `${diff} dias de viagem`;
      }
    } catch {}
    return '1 dia de viagem';
  };

  const tripDaysText = calculateTripDays();

  return (
    <div className="w-full bg-white text-gray-950 font-sans leading-relaxed text-sm">
      {/* CABEÇALHO EXECUTIVO */}
      <div className="border-b-2 border-gray-900 pb-5 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-widest uppercase bg-gray-900 text-white px-2.5 py-1 rounded">
                LE FRIO REFRIGERAÇÃO
              </span>
              <span className="text-xs font-bold text-gray-500 uppercase">
                Auditoria & Gestão Financeira
              </span>
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-gray-950 pt-1">
              RELATÓRIO DE PRESTAÇÃO DE CONTAS - DESPESAS DE ROTA
            </h1>
            <p className="text-xs text-gray-600 font-semibold">
              Documento Oficial para Análise, Conferência e Parecer da Diretoria
            </p>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[11px] font-bold text-gray-500 uppercase">Emissão do Relatório</div>
            <div className="text-xs font-black text-gray-900 font-mono">
              {format(new Date(), 'dd/MM/yyyy HH:mm')}
            </div>
            <div className="text-[10px] text-gray-500 mt-1 font-mono">
              Ref: {month}
            </div>
          </div>
        </div>

        {/* QUADRO DE DADOS GERAIS DA VIAGEM */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 border border-gray-300 rounded-xl p-3.5 text-xs">
          <div>
            <span className="font-bold text-gray-500 text-[10px] uppercase block">Nome da Rota</span>
            <span className="font-black text-gray-950 text-sm">{route.routeName}</span>
          </div>

          <div>
            <span className="font-bold text-gray-500 text-[10px] uppercase block">Técnicos em Campo</span>
            <span className="font-extrabold text-blue-900">
              {route.technicians && route.technicians.length > 0 ? route.technicians.join(', ') : 'Não atribuído'}
            </span>
          </div>

          <div>
            <span className="font-bold text-gray-500 text-[10px] uppercase block">Período Programado</span>
            <span className="font-bold text-gray-900">
              {route.plannedDate ? format(parseISO(route.plannedDate), 'dd/MM/yyyy') : '--'}
              {route.returnDate ? ` a ${format(parseISO(route.returnDate), 'dd/MM/yyyy')}` : ''}
            </span>
          </div>

          <div>
            <span className="font-bold text-gray-500 text-[10px] uppercase block">Duração da Viagem</span>
            <span className="font-black text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded inline-block">
              {tripDaysText}
            </span>
          </div>
        </div>

        {/* QUADRO DE RESUMO FINANCEIRO (PREVISTO x REAL x SALDO) */}
        <div className="mt-3 grid grid-cols-4 gap-3 text-xs">
          <div className="border border-gray-300 rounded-xl p-3 bg-white">
            <span className="font-bold text-[10px] uppercase text-gray-500 block">Total Previsto</span>
            <span className="text-base font-black text-gray-900 font-mono">
              {formatCurrency(route.routeEstimatedCost)}
            </span>
          </div>

          <div className="border border-indigo-200 bg-indigo-50/50 rounded-xl p-3">
            <span className="font-bold text-[10px] uppercase text-indigo-700 block">Total Lançado (Real)</span>
            <span className="text-base font-black text-indigo-900 font-mono">
              {formatCurrency(route.totalRouteSpent)}
            </span>
          </div>

          <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-3">
            <span className="font-bold text-[10px] uppercase text-emerald-700 block">Total Aprovado</span>
            <span className="text-base font-black text-emerald-900 font-mono">
              {formatCurrency(route.totalRouteApproved)}
            </span>
          </div>

          <div className="border border-gray-300 rounded-xl p-3 bg-white">
            <span className="font-bold text-[10px] uppercase text-gray-500 block">Saldo / Economia</span>
            <span className={cn(
              "text-base font-black font-mono",
              route.balance >= 0 ? "text-emerald-700" : "text-rose-600"
            )}>
              {formatCurrency(route.balance)}
            </span>
          </div>
        </div>
      </div>

      {/* 1. PREVISÃO PROGRAMADA PELO ADMINISTRATIVO (SE HOUVER) */}
      {route.routeCostItems && route.routeCostItems.length > 0 && (
        <div className="mb-6 print-avoid-break">
          <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-gray-200">
            <h2 className="text-xs font-black uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              1. Previsão Programada pelo Administrativo ({route.routeCostItems.length} Itens Orçados)
            </h2>
            <span className="text-[11px] font-bold text-gray-500">
              Total Previsto: {formatCurrency(route.routeEstimatedCost)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {route.routeCostItems.map((item: any, idx: number) => (
              <div key={item.id || idx} className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-gray-400 block">{item.category || 'Gasto'}</span>
                  <span className="font-bold text-gray-900 truncate">{item.description}</span>
                </div>
                <span className="font-mono font-black text-blue-900 ml-2">
                  {formatCurrency(item.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. TABELA DE DESPESAS LANÇADAS EM CAMPO */}
      <div className="mb-6">
        <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-gray-200">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5 text-blue-600" />
            2. Despesas Lançadas pelos Técnicos ({route.expenses.length} Registros)
          </h2>
          <span className="text-[11px] font-black text-gray-900 font-mono">
            Soma dos Gastos: {formatCurrency(route.totalRouteSpent)}
          </span>
        </div>

        {route.expenses.length === 0 ? (
          <div className="p-6 border border-dashed border-gray-300 rounded-xl text-center text-xs text-gray-400 italic">
            Nenhuma despesa lançada para esta rota.
          </div>
        ) : (
          <table className="w-full text-left text-xs border border-gray-300 rounded-lg overflow-hidden border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-300 text-[10px] font-black uppercase tracking-wider text-gray-700">
                <th className="p-2.5 text-center w-8">#</th>
                <th className="p-2.5 w-24">Data</th>
                <th className="p-2.5 w-32">Técnico</th>
                <th className="p-2.5 w-28">Categoria</th>
                <th className="p-2.5">Descrição do Gasto / Local</th>
                <th className="p-2.5 text-center w-24">Status</th>
                <th className="p-2.5 text-right w-28">Valor (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {route.expenses.map((e: any, index: number) => {
                const isApproved = e.status === 'approved';
                const isRejected = e.status === 'rejected';

                return (
                  <tr key={e.id || index} className="even:bg-gray-50/60">
                    <td className="p-2.5 text-center font-bold text-gray-400">{index + 1}</td>
                    <td className="p-2.5 font-medium whitespace-nowrap font-mono">
                      {e.expenseDate ? format(parseISO(e.expenseDate), 'dd/MM/yyyy') : '--'}
                    </td>
                    <td className="p-2.5 font-bold text-gray-900 whitespace-nowrap">
                      {e.technicianName || 'Técnico'}
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      <span className="font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-[11px]">
                        {e.category || 'Geral'}
                      </span>
                    </td>
                    <td className="p-2.5 font-semibold text-gray-900">
                      <div>
                        {e.description}
                        {e.reviewNotes && (
                          <span className="block text-[10px] text-rose-700 italic mt-0.5">
                            Obs: {e.reviewNotes}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2.5 text-center whitespace-nowrap">
                      <span className={cn(
                        "text-[10px] font-black uppercase px-2 py-0.5 rounded border inline-block",
                        isApproved ? "bg-emerald-50 text-emerald-800 border-emerald-300" :
                        isRejected ? "bg-rose-50 text-rose-800 border-rose-300" :
                        "bg-amber-50 text-amber-800 border-amber-300"
                      )}>
                        {isApproved ? 'Aprovado' : isRejected ? 'Reprovado' : 'Em Análise'}
                      </span>
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-gray-950 whitespace-nowrap">
                      {formatCurrency(e.actualValue || 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 border-t-2 border-gray-400 font-black text-xs">
                <td colSpan={5} className="p-3 text-right uppercase tracking-wider text-gray-700">
                  Total Geral Lançado:
                </td>
                <td className="p-3 text-center text-[11px] uppercase text-emerald-800">
                  Aprovado: {formatCurrency(route.totalRouteApproved)}
                </td>
                <td className="p-3 text-right font-mono text-sm text-gray-950">
                  {formatCurrency(route.totalRouteSpent)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* 3. ANEXOS: FOTOS DE COMPROVANTES & CUPONS FISCAIS */}
      {route.expenses && route.expenses.some((e: any) => e.receiptUrl) && (
        <div className="mt-8 print-page-break">
          <div className="flex items-center justify-between pb-2 mb-4 border-b-2 border-gray-900">
            <h2 className="text-sm font-black uppercase tracking-wider text-gray-950 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-700" />
              3. Anexo de Comprovantes & Notas Fiscais dos Gastos
            </h2>
            <span className="text-xs text-gray-500 font-bold">
              {route.expenses.filter((e: any) => e.receiptUrl).length} comprovantes anexados
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {route.expenses
              .filter((e: any) => e.receiptUrl)
              .map((e: any, idx: number) => (
                <div 
                  key={`receipt-${e.id || idx}`} 
                  className="border border-gray-300 rounded-xl p-4 bg-white shadow-xs print-avoid-break flex flex-col justify-between"
                >
                  {/* Receipt Header Info */}
                  <div className="border-b border-gray-200 pb-2 mb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-900 px-2 py-0.5 rounded">
                          Item #{idx + 1} &bull; {e.category || 'Despesa'}
                        </span>
                        <h4 className="font-black text-gray-950 text-xs mt-1.5">
                          {e.description}
                        </h4>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-bold uppercase text-gray-400 block">Valor Pago</span>
                        <span className="font-mono font-black text-sm text-gray-950">
                          {formatCurrency(e.actualValue)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-600 mt-2 font-medium">
                      <span>Técnico: <strong className="text-gray-900">{e.technicianName}</strong></span>
                      <span>Data: <strong className="text-gray-900">{e.expenseDate ? format(parseISO(e.expenseDate), 'dd/MM/yyyy') : '--'}</strong></span>
                      <span className={cn(
                        "font-bold uppercase text-[10px]",
                        e.status === 'approved' ? "text-emerald-700" : "text-amber-700"
                      )}>
                        {e.status === 'approved' ? '✓ Aprovado' : 'Aguardando'}
                      </span>
                    </div>
                  </div>

                  {/* Receipt Image */}
                  <div className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 flex items-center justify-center min-h-[180px] print:min-h-0 print:border-gray-300">
                    <img 
                      src={e.receiptUrl} 
                      alt={`Comprovante - ${e.description}`} 
                      className="max-h-[360px] print:max-h-[260px] w-auto max-w-full object-contain rounded"
                      referrerPolicy="no-referrer"
                      loading="eager"
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 4. QUADRO DE PARECER E ASSINATURAS DA DIRETORIA */}
      <div className="mt-10 pt-6 border-t-2 border-gray-900 print-avoid-break space-y-6">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-gray-900 mb-2">
            4. Parecer e Despacho da Diretoria
          </h3>
          <div className="border border-gray-300 rounded-xl p-3 bg-gray-50/50 space-y-2 text-xs">
            <div className="flex items-center gap-6 font-bold text-gray-800">
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 border-2 border-gray-400 rounded inline-block"></span> [ &nbsp; ] Aprovado Integralmente
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 border-2 border-gray-400 rounded inline-block"></span> [ &nbsp; ] Aprovado com Ressalvas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 border-2 border-gray-400 rounded inline-block"></span> [ &nbsp; ] Reprovado
              </span>
            </div>
            <div className="pt-2 text-[11px] text-gray-500">
              Observações / Instruções da Diretoria: __________________________________________________________________________________
            </div>
          </div>
        </div>

        {/* 3 SIGNATURE LINES */}
        <div className="grid grid-cols-3 gap-6 pt-4 text-center">
          <div className="space-y-1.5">
            <div className="border-b border-gray-900 w-full mb-1"></div>
            <p className="font-extrabold text-[11px] uppercase text-gray-900">Técnico(s) Responsável(is)</p>
            <p className="text-[10px] text-gray-500 font-medium">Prestador de Contas</p>
          </div>

          <div className="space-y-1.5">
            <div className="border-b border-gray-900 w-full mb-1"></div>
            <p className="font-extrabold text-[11px] uppercase text-gray-900">Conferência / Auditoria</p>
            <p className="text-[10px] text-gray-500 font-medium">Administrativo</p>
          </div>

          <div className="space-y-1.5">
            <div className="border-b border-gray-900 w-full mb-1"></div>
            <p className="font-extrabold text-[11px] uppercase text-gray-900">Aprovação da Diretoria</p>
            <p className="text-[10px] text-gray-500 font-medium">Direção Executiva</p>
          </div>
        </div>
      </div>
    </div>
  );
}
