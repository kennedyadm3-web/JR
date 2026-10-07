import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Package, 
  Wrench, 
  Plus, 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  Copy, 
  Building2, 
  DollarSign, 
  Percent, 
  Layers, 
  Tag, 
  Folder,
  CheckCircle2, 
  X, 
  Save, 
  RotateCcw, 
  Sliders, 
  HelpCircle,
  FileSpreadsheet,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ArrowUpDown,
  ListOrdered,
  Info,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Client, ServiceCatalogItem, ClientPriceOverride } from '../types';
import { cn } from '../lib/utils';

interface Props {
  clients: Client[];
  canEdit: boolean;
  managerClientId?: string;
  onCatalogUpdated?: () => void;
}

export default function ContractItemsCatalog({ clients, canEdit, managerClientId, onCatalogUpdated }: Props) {
  const [items, setItems] = useState<ServiceCatalogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'service' | 'product'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedPreviewClientId, setSelectedPreviewClientId] = useState<string>(managerClientId || '');
  const [viewMode, setViewMode] = useState<'catalog' | 'matrix'>('catalog');

  // Modal / Form States
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<ServiceCatalogItem | null>(null);
  const [modalTab, setModalTab] = useState<'general' | 'client_prices'>('general');

  // Item Form Fields
  const [formCode, setFormCode] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formType, setFormType] = useState<'service' | 'product'>('service');
  const [formCategory, setFormCategory] = useState<string>('');
  const [isCustomCategoryInput, setIsCustomCategoryInput] = useState<boolean>(false);
  const [formUnit, setFormUnit] = useState<string>('UN');
  const [formDefaultPrice, setFormDefaultPrice] = useState<number | ''>('');
  const [formDefaultDiscount, setFormDefaultDiscount] = useState<number | ''>(0);
  const [formActive, setFormActive] = useState<boolean>(true);
  const [formNotes, setFormNotes] = useState<string>('');
  const [formClientPrices, setFormClientPrices] = useState<Record<string, ClientPriceOverride>>({});

  // Categorias padrão sugeridas para Produtos
  const DEFAULT_PRODUCT_CATEGORIES = [
    'GASES REFRIGERANTES',
    'CAPACITORES & ELÉTRICA',
    'SENSORES & ELETRÔNICOS',
    'COMPRESSORES & MOTORES',
    'TUBULAÇÃO, CONEXÕES & ISOLAMENTO',
    'FILTROS & HIGIENIZAÇÃO',
    'PEÇAS & ACESSÓRIOS',
    'FERRAMENTAS & CONSUMÍVEIS',
    'DIVERSOS (PRODUTOS)'
  ];

  // Categorias padrão sugeridas para Serviços
  const DEFAULT_SERVICE_CATEGORIES = [
    'MANUTENÇÃO PREVENTIVA',
    'MANUTENÇÃO CORRETIVA',
    'INSTALAÇÃO & INFRAESTRUTURA',
    'HIGIENIZAÇÃO & LIMPEZA QUÍMICA',
    'RECARGA DE GÁS & ESTANQUEIDADE',
    'DIAGNÓSTICO & LAUDO TÉCNICO',
    'AUTOMAÇÃO & COMANDOS',
    'CONSULTORIA & PMOC',
    'DIVERSOS (SERVIÇOS)'
  ];

  // Estados para Gerenciamento de Categorias (distintas para Produtos e Serviços)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [activeCategoryModalTab, setActiveCategoryModalTab] = useState<'service' | 'product'>('service');

  const [customProductCategories, setCustomProductCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('catalog_custom_product_categories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [hiddenProductCategories, setHiddenProductCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('catalog_hidden_product_categories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [customServiceCategories, setCustomServiceCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('catalog_custom_service_categories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [hiddenServiceCategories, setHiddenServiceCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('catalog_hidden_service_categories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState<string>('');
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [reassignCategoryTarget, setReassignCategoryTarget] = useState<string>('');
  const [categoryActionLoading, setCategoryActionLoading] = useState<boolean>(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>('');

  // Persistência local de categorias de produtos
  useEffect(() => {
    try {
      localStorage.setItem('catalog_custom_product_categories', JSON.stringify(customProductCategories));
    } catch (e) {
      console.error('Erro ao salvar categorias de produtos:', e);
    }
  }, [customProductCategories]);

  useEffect(() => {
    try {
      localStorage.setItem('catalog_hidden_product_categories', JSON.stringify(hiddenProductCategories));
    } catch (e) {
      console.error('Erro ao salvar categorias ocultas de produtos:', e);
    }
  }, [hiddenProductCategories]);

  // Persistência local de categorias de serviços
  useEffect(() => {
    try {
      localStorage.setItem('catalog_custom_service_categories', JSON.stringify(customServiceCategories));
    } catch (e) {
      console.error('Erro ao salvar categorias de serviços:', e);
    }
  }, [customServiceCategories]);

  useEffect(() => {
    try {
      localStorage.setItem('catalog_hidden_service_categories', JSON.stringify(hiddenServiceCategories));
    } catch (e) {
      console.error('Erro ao salvar categorias ocultas de serviços:', e);
    }
  }, [hiddenServiceCategories]);

  // Lista de Categorias de Produtos
  const availableProductCategories = useMemo(() => {
    const itemCats = items
      .filter(i => i.type === 'product' && i.category && i.category.trim())
      .map(i => i.category!.trim().toUpperCase());
    const all = Array.from(new Set([...DEFAULT_PRODUCT_CATEGORIES, ...customProductCategories, ...itemCats]))
      .filter(Boolean)
      .map(c => c.trim().toUpperCase())
      .filter(c => !hiddenProductCategories.includes(c));
    return all.sort();
  }, [items, customProductCategories, hiddenProductCategories]);

  // Lista de Categorias de Serviços
  const availableServiceCategories = useMemo(() => {
    const itemCats = items
      .filter(i => i.type === 'service' && i.category && i.category.trim())
      .map(i => i.category!.trim().toUpperCase());
    const all = Array.from(new Set([...DEFAULT_SERVICE_CATEGORIES, ...customServiceCategories, ...itemCats]))
      .filter(Boolean)
      .map(c => c.trim().toUpperCase())
      .filter(c => !hiddenServiceCategories.includes(c));
    return all.sort();
  }, [items, customServiceCategories, hiddenServiceCategories]);

  // Estatísticas por categoria de produto
  const productCategoryStats = useMemo(() => {
    const map: Record<string, number> = {};
    availableProductCategories.forEach(cat => {
      map[cat] = 0;
    });
    items.filter(i => i.type === 'product').forEach(item => {
      const cat = (item.category || '').trim().toUpperCase();
      if (cat) {
        map[cat] = (map[cat] || 0) + 1;
      }
    });
    return map;
  }, [availableProductCategories, items]);

  // Estatísticas por categoria de serviço
  const serviceCategoryStats = useMemo(() => {
    const map: Record<string, number> = {};
    availableServiceCategories.forEach(cat => {
      map[cat] = 0;
    });
    items.filter(i => i.type === 'service').forEach(item => {
      const cat = (item.category || '').trim().toUpperCase();
      if (cat) {
        map[cat] = (map[cat] || 0) + 1;
      }
    });
    return map;
  }, [availableServiceCategories, items]);
  
  // Matrix Editing Client State
  const [matrixClientId, setMatrixClientId] = useState<string>(managerClientId || (clients[0]?.id || ''));
  const [matrixDraftPrices, setMatrixDraftPrices] = useState<Record<string, { enabled: boolean; price: number; discountPercent: number }>>({});
  const [isSavingMatrix, setIsSavingMatrix] = useState<boolean>(false);

  // Status feedback
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Quick Client Price Drawer / Modal
  const [priceOverrideModalItem, setPriceOverrideModalItem] = useState<ServiceCatalogItem | null>(null);

  // Drag and drop & Reorder States
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState<boolean>(false);
  const [reorderSuccessToast, setReorderSuccessToast] = useState<boolean>(false);

  // Load Catalog Items
  const loadCatalog = async () => {
    try {
      setLoading(true);
      const data = await dataService.getServiceCatalogItems();
      setItems(data);
    } catch (err) {
      console.error('Erro ao carregar catálogo de produtos e serviços:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  // Sync draft prices for matrix view when matrixClientId or items change
  useEffect(() => {
    if (!matrixClientId) return;
    const drafts: Record<string, { enabled: boolean; price: number; discountPercent: number }> = {};
    items.forEach(item => {
      const clientOverride = item.clientPrices?.[matrixClientId];
      if (clientOverride) {
        drafts[item.id] = {
          enabled: true,
          price: clientOverride.price,
          discountPercent: clientOverride.discountPercent || 0
        };
      } else {
        drafts[item.id] = {
          enabled: false,
          price: item.defaultPrice,
          discountPercent: item.defaultDiscountPercent || 0
        };
      }
    });
    setMatrixDraftPrices(drafts);
  }, [matrixClientId, items]);

  const clientMap = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach(c => {
      map[c.id] = c.name;
    });
    return map;
  }, [clients]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Type filter
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      // Status filter
      if (statusFilter === 'active' && item.active === false) return false;
      if (statusFilter === 'inactive' && item.active !== false) return false;
      // Category filter
      if (categoryFilter !== 'all') {
        const itemCat = (item.category || '').trim().toUpperCase();
        if (categoryFilter === '__NO_CATEGORY__') {
          if (itemCat !== '') return false;
        } else if (itemCat !== categoryFilter) {
          return false;
        }
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = item.code.toLowerCase().includes(q);
        const matchDesc = item.description.toLowerCase().includes(q);
        const matchUnit = item.unit.toLowerCase().includes(q);
        const matchCat = (item.category || '').toLowerCase().includes(q);
        if (!matchCode && !matchDesc && !matchUnit && !matchCat) return false;
      }
      return true;
    });
  }, [items, typeFilter, statusFilter, categoryFilter, searchQuery]);

  // Summary counts
  const stats = useMemo(() => {
    const total = items.length;
    const services = items.filter(i => i.type === 'service').length;
    const products = items.filter(i => i.type === 'product').length;
    const customCount = items.filter(i => Object.keys(i.clientPrices || {}).length > 0).length;
    return { total, services, products, customCount };
  }, [items]);

  // Open modal for new item
  const handleOpenCreateModal = (type: 'service' | 'product' = 'service') => {
    setEditingItem(null);
    setFormCode('');
    setFormDescription('');
    setFormType(type);
    setFormCategory(type === 'product' ? 'GASES REFRIGERANTES' : '');
    setIsCustomCategoryInput(false);
    setFormUnit(type === 'service' ? 'UN' : 'KG');
    setFormDefaultPrice('');
    setFormDefaultDiscount(0);
    setFormActive(true);
    setFormNotes('');
    setFormClientPrices({});
    setModalTab('general');
    setSuccessMessage('');
    setErrorMessage('');
    setIsModalOpen(true);
  };

  // Open modal for editing item
  const handleOpenEditModal = (item: ServiceCatalogItem) => {
    setEditingItem(item);
    setFormCode(item.code || '');
    setFormDescription(item.description || '');
    setFormType(item.type || 'service');
    setFormCategory(item.category || '');
    setIsCustomCategoryInput(false);
    setFormUnit(item.unit || 'UN');
    setFormDefaultPrice(item.defaultPrice ?? '');
    setFormDefaultDiscount(item.defaultDiscountPercent ?? 0);
    setFormActive(item.active !== false);
    setFormNotes(item.notes || '');
    setFormClientPrices(item.clientPrices ? { ...item.clientPrices } : {});
    setModalTab('general');
    setSuccessMessage('');
    setErrorMessage('');
    setIsModalOpen(true);
  };

  // Duplicate item
  const handleDuplicateItem = (item: ServiceCatalogItem) => {
    setEditingItem(null);
    setFormCode(`${item.code}-COPIA`);
    setFormDescription(`${item.description} (CÓPIA)`);
    setFormType(item.type);
    setFormCategory(item.category || '');
    setIsCustomCategoryInput(false);
    setFormUnit(item.unit);
    setFormDefaultPrice(item.defaultPrice);
    setFormDefaultDiscount(item.defaultDiscountPercent || 0);
    setFormActive(true);
    setFormNotes(item.notes || '');
    setFormClientPrices(item.clientPrices ? { ...item.clientPrices } : {});
    setModalTab('general');
    setSuccessMessage('');
    setErrorMessage('');
    setIsModalOpen(true);
  };

  // Toggle client custom price in form
  const handleToggleClientOverride = (clientId: string) => {
    setFormClientPrices(prev => {
      const next = { ...prev };
      if (next[clientId]) {
        delete next[clientId];
      } else {
        const basePrice = Number(formDefaultPrice) || 0;
        const baseDesc = Number(formDefaultDiscount) || 0;
        next[clientId] = {
          price: basePrice,
          discountPercent: baseDesc
        };
      }
      return next;
    });
  };

  // Update client override price/discount in form
  const handleUpdateClientOverride = (clientId: string, field: 'price' | 'discountPercent', value: number) => {
    setFormClientPrices(prev => {
      const current = prev[clientId] || { price: Number(formDefaultPrice) || 0, discountPercent: Number(formDefaultDiscount) || 0 };
      return {
        ...prev,
        [clientId]: {
          ...current,
          [field]: value
        }
      };
    });
  };

  // Save Item from Modal
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode.trim()) {
      setErrorMessage('O código do item é obrigatório.');
      return;
    }
    if (!formDescription.trim()) {
      setErrorMessage('A descrição do produto/serviço é obrigatória.');
      return;
    }
    if (formDefaultPrice === '' || Number(formDefaultPrice) < 0) {
      setErrorMessage('Informe um preço base padrão válido.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage('');
      setSuccessMessage('');

      const itemPayload: Omit<ServiceCatalogItem, 'id'> & { id?: string } = {
        code: formCode.trim().toUpperCase(),
        description: formDescription.trim().toUpperCase(),
        type: formType,
        category: formType === 'product' && formCategory ? formCategory.trim().toUpperCase() : (formCategory ? formCategory.trim().toUpperCase() : undefined),
        unit: formUnit.trim().toUpperCase(),
        defaultPrice: Number(formDefaultPrice) || 0,
        defaultDiscountPercent: Number(formDefaultDiscount) || 0,
        active: formActive,
        notes: formNotes ? formNotes.trim() : undefined,
        clientPrices: formClientPrices
      };

      if (editingItem) {
        await dataService.updateServiceCatalogItem(editingItem.id, itemPayload);
      } else {
        await dataService.addServiceCatalogItem(itemPayload);
      }

      setSuccessMessage(editingItem ? 'Item atualizado com sucesso!' : 'Item cadastrado com sucesso!');
      await loadCatalog();
      if (onCatalogUpdated) onCatalogUpdated();
      setTimeout(() => {
        setIsModalOpen(false);
      }, 700);
    } catch (err: any) {
      console.error('Erro ao salvar item:', err);
      setErrorMessage('Erro ao salvar item no banco de dados.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Item
  const handleDeleteItem = async (item: ServiceCatalogItem) => {
    if (!window.confirm(`Deseja realmente remover o item "${item.code} - ${item.description}" do catálogo?`)) {
      return;
    }
    try {
      await dataService.deleteServiceCatalogItem(item.id);
      await loadCatalog();
      if (onCatalogUpdated) onCatalogUpdated();
    } catch (err) {
      console.error('Erro ao excluir item:', err);
      alert('Erro ao excluir item do catálogo.');
    }
  };

  // Save Single Client Price Override from Drawer
  const handleSavePriceOverrideDrawer = async (item: ServiceCatalogItem, clientPrices: Record<string, ClientPriceOverride>) => {
    try {
      await dataService.updateServiceCatalogItem(item.id, { clientPrices });
      await loadCatalog();
      if (onCatalogUpdated) onCatalogUpdated();
      setPriceOverrideModalItem(null);
    } catch (err) {
      console.error('Erro ao salvar preços do cliente:', err);
      alert('Erro ao salvar preços por contrato.');
    }
  };

  // Save Matrix Draft for a specific client
  const handleSaveMatrixChanges = async () => {
    if (!matrixClientId) return;
    try {
      setIsSavingMatrix(true);
      for (const item of items) {
        const draft = matrixDraftPrices[item.id];
        if (!draft) continue;

        if (draft.enabled) {
          await dataService.updateServiceCatalogClientPrices(item.id, matrixClientId, {
            price: Number(draft.price) || 0,
            discountPercent: Number(draft.discountPercent) || 0
          });
        } else {
          // Remove override if disabled
          if (item.clientPrices?.[matrixClientId]) {
            await dataService.updateServiceCatalogClientPrices(item.id, matrixClientId, null);
          }
        }
      }
      await loadCatalog();
      if (onCatalogUpdated) onCatalogUpdated();
      alert(`Tabela de preços do cliente "${clientMap[matrixClientId] || 'Contrato'}" atualizada com sucesso!`);
    } catch (err) {
      console.error('Erro ao salvar tabela do cliente:', err);
      alert('Erro ao salvar alterações da matriz de preços.');
    } finally {
      setIsSavingMatrix(false);
    }
  };

  // Handlers para Gerenciamento de Categorias (Criar, Renomear, Excluir)
  const handleAddCategory = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = newCategoryName.trim().toUpperCase();
    if (!cleanName) return;

    const isProductTab = activeCategoryModalTab === 'product';
    const targetCategories = isProductTab ? availableProductCategories : availableServiceCategories;
    const targetHidden = isProductTab ? hiddenProductCategories : hiddenServiceCategories;

    if (targetCategories.includes(cleanName)) {
      setErrorMessage(`A categoria "${cleanName}" já existe em ${isProductTab ? 'Produtos' : 'Serviços'}.`);
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    if (isProductTab) {
      if (targetHidden.includes(cleanName)) {
        setHiddenProductCategories(prev => prev.filter(c => c !== cleanName));
      } else {
        setCustomProductCategories(prev => Array.from(new Set([...prev, cleanName])));
      }
    } else {
      if (targetHidden.includes(cleanName)) {
        setHiddenServiceCategories(prev => prev.filter(c => c !== cleanName));
      } else {
        setCustomServiceCategories(prev => Array.from(new Set([...prev, cleanName])));
      }
    }

    setNewCategoryName('');
    setSuccessMessage(`Categoria "${cleanName}" adicionada com sucesso em ${isProductTab ? 'Produtos' : 'Serviços'}!`);
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  const handleSaveRenameCategory = async (oldCat: string) => {
    const newCat = editingCategoryValue.trim().toUpperCase();
    if (!newCat) return;
    if (newCat === oldCat) {
      setEditingCategoryKey(null);
      return;
    }

    const isProductTab = activeCategoryModalTab === 'product';

    try {
      setCategoryActionLoading(true);
      const affectedCount = await dataService.renameServiceCatalogCategory(oldCat, newCat, activeCategoryModalTab);

      // Atualiza lista local de itens apenas do tipo correspondente
      setItems(prev => prev.map(i => {
        if (i.type === activeCategoryModalTab && (i.category || '').trim().toUpperCase() === oldCat) {
          return { ...i, category: newCat };
        }
        return i;
      }));

      // Atualiza categorias customizadas e ocultas
      if (isProductTab) {
        setCustomProductCategories(prev => {
          const filtered = prev.filter(c => c !== oldCat);
          return Array.from(new Set([...filtered, newCat]));
        });
        if (DEFAULT_PRODUCT_CATEGORIES.includes(oldCat)) {
          setHiddenProductCategories(prev => Array.from(new Set([...prev, oldCat])));
        }
      } else {
        setCustomServiceCategories(prev => {
          const filtered = prev.filter(c => c !== oldCat);
          return Array.from(new Set([...filtered, newCat]));
        });
        if (DEFAULT_SERVICE_CATEGORIES.includes(oldCat)) {
          setHiddenServiceCategories(prev => Array.from(new Set([...prev, oldCat])));
        }
      }

      if (categoryFilter === oldCat) {
        setCategoryFilter(newCat);
      }

      setEditingCategoryKey(null);
      setEditingCategoryValue('');
      setSuccessMessage(`Categoria renomeada para "${newCat}". ${affectedCount} ${isProductTab ? 'produto(s)' : 'serviço(s)'} atualizados.`);
      setTimeout(() => setSuccessMessage(''), 4000);
      if (onCatalogUpdated) onCatalogUpdated();
    } catch (err: any) {
      setErrorMessage(`Erro ao renomear categoria: ${err?.message || 'Erro desconhecido'}`);
      setTimeout(() => setErrorMessage(''), 4000);
    } finally {
      setCategoryActionLoading(false);
    }
  };

  const handleConfirmDeleteCategory = async () => {
    if (!deletingCategory) return;
    const catToDelete = deletingCategory;
    const targetReassign = reassignCategoryTarget.trim().toUpperCase();
    const isProductTab = activeCategoryModalTab === 'product';

    try {
      setCategoryActionLoading(true);
      const affectedCount = await dataService.deleteServiceCatalogCategory(catToDelete, targetReassign, activeCategoryModalTab);

      // Atualiza itens locais apenas do tipo correspondente
      setItems(prev => prev.map(i => {
        if (i.type === activeCategoryModalTab && (i.category || '').trim().toUpperCase() === catToDelete) {
          return { ...i, category: targetReassign || undefined };
        }
        return i;
      }));

      if (isProductTab) {
        setCustomProductCategories(prev => prev.filter(c => c !== catToDelete));
        if (DEFAULT_PRODUCT_CATEGORIES.includes(catToDelete)) {
          setHiddenProductCategories(prev => Array.from(new Set([...prev, catToDelete])));
        }
      } else {
        setCustomServiceCategories(prev => prev.filter(c => c !== catToDelete));
        if (DEFAULT_SERVICE_CATEGORIES.includes(catToDelete)) {
          setHiddenServiceCategories(prev => Array.from(new Set([...prev, catToDelete])));
        }
      }

      if (categoryFilter === catToDelete) {
        setCategoryFilter('all');
      }

      setDeletingCategory(null);
      setReassignCategoryTarget('');
      setSuccessMessage(`Categoria "${catToDelete}" excluída com sucesso.`);
      setTimeout(() => setSuccessMessage(''), 4000);
      if (onCatalogUpdated) onCatalogUpdated();
    } catch (err: any) {
      setErrorMessage(`Erro ao excluir categoria: ${err?.message || 'Erro desconhecido'}`);
      setTimeout(() => setErrorMessage(''), 4000);
    } finally {
      setCategoryActionLoading(false);
    }
  };

  // ==========================================
  // ARRASTAR E SOLTAR (DRAG & DROP) E REORDENAÇÃO
  // ==========================================
  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (!canEdit) return;
    setDraggedItemId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    if (!canEdit || !draggedItemId || draggedItemId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverItemId !== id) {
      setDragOverItemId(id);
    }
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!canEdit || !draggedItemId || draggedItemId === targetId) {
      setDraggedItemId(null);
      setDragOverItemId(null);
      return;
    }

    const sourceId = draggedItemId;
    setDraggedItemId(null);
    setDragOverItemId(null);

    const currentFiltered = [...filteredItems];
    const sourceIndex = currentFiltered.findIndex(i => i.id === sourceId);
    const targetIndex = currentFiltered.findIndex(i => i.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    // Move na lista filtrada
    const [movedItem] = currentFiltered.splice(sourceIndex, 1);
    currentFiltered.splice(targetIndex, 0, movedItem);

    // Reconstrói a lista completa preservando a nova ordem
    const newItems = [...items];
    const filteredIdsSet = new Set(filteredItems.map(i => i.id));
    
    let filteredPointer = 0;
    const reorderedItems = newItems.map(item => {
      if (filteredIdsSet.has(item.id)) {
        return currentFiltered[filteredPointer++];
      }
      return item;
    });

    const updatedItemsWithOrder = reorderedItems.map((item, idx) => ({
      ...item,
      order: idx
    }));

    setItems(updatedItemsWithOrder);
    setIsSavingOrder(true);

    try {
      const orderedIds = updatedItemsWithOrder.map(i => i.id);
      await dataService.reorderServiceCatalogItems(orderedIds);
      setReorderSuccessToast(true);
      if (onCatalogUpdated) onCatalogUpdated();
      setTimeout(() => setReorderSuccessToast(false), 3000);
    } catch (err) {
      console.error('Erro ao reordenar itens do catálogo:', err);
      loadCatalog();
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleMoveItem = async (itemId: string, direction: 'up' | 'down') => {
    if (!canEdit || isSavingOrder) return;
    const currentFiltered = [...filteredItems];
    const currentIndex = currentFiltered.findIndex(i => i.id === itemId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentFiltered.length) return;

    const [movedItem] = currentFiltered.splice(currentIndex, 1);
    currentFiltered.splice(targetIndex, 0, movedItem);

    const newItems = [...items];
    const filteredIdsSet = new Set(filteredItems.map(i => i.id));
    
    let filteredPointer = 0;
    const reorderedItems = newItems.map(item => {
      if (filteredIdsSet.has(item.id)) {
        return currentFiltered[filteredPointer++];
      }
      return item;
    });

    const updatedItemsWithOrder = reorderedItems.map((item, idx) => ({
      ...item,
      order: idx
    }));

    setItems(updatedItemsWithOrder);
    setIsSavingOrder(true);

    try {
      const orderedIds = updatedItemsWithOrder.map(i => i.id);
      await dataService.reorderServiceCatalogItems(orderedIds);
      setReorderSuccessToast(true);
      if (onCatalogUpdated) onCatalogUpdated();
      setTimeout(() => setReorderSuccessToast(false), 3000);
    } catch (err) {
      console.error('Erro ao reordenar item:', err);
      loadCatalog();
    } finally {
      setIsSavingOrder(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner Superior e Estatísticas */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-blue-500/10 blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2.5 text-blue-300 text-xs font-black uppercase tracking-widest mb-1.5">
              <Package className="w-4 h-4 text-blue-400" />
              Gestão de Contratos & Faturamento
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
              Catálogo de Produtos & Serviços de O.S.
            </h2>
            <p className="text-xs text-blue-200/80 max-w-2xl mt-1 leading-relaxed">
              Itens padronizados que o setor administrativo inclui nas Ordens de Serviço durante o tratamento e faturamento. Configure valores específicos por contrato/cliente com total flexibilidade.
            </p>
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveCategoryModalTab(typeFilter === 'product' ? 'product' : 'service');
                  setIsCategoryModalOpen(true);
                }}
                className="bg-indigo-600/90 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 border border-indigo-400/30 cursor-pointer"
              >
                <Folder className="w-4 h-4 text-indigo-200" />
                <span>Gerenciar Categorias</span>
                <span className="bg-indigo-950/60 text-indigo-200 text-[10px] px-1.5 py-0.5 rounded-full font-black border border-indigo-400/30">
                  {availableServiceCategories.length + availableProductCategories.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'catalog' ? 'matrix' : 'catalog')}
                className={cn(
                  "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border",
                  viewMode === 'matrix'
                    ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/30"
                    : "bg-white/10 hover:bg-white/15 border-white/10 text-white"
                )}
              >
                <Sliders className="w-4 h-4" />
                {viewMode === 'matrix' ? 'Ver Modo Catálogo' : 'Tabela por Contrato'}
              </button>

              <button
                type="button"
                onClick={() => handleOpenCreateModal('service')}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Novo Serviço / Produto
              </button>
            </div>
          )}
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200/70">Total Cadastrado</p>
            <p className="text-xl font-black text-white mt-0.5">{stats.total}</p>
          </div>
          <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200/70">Serviços Padrão</p>
            <p className="text-xl font-black text-blue-400 mt-0.5">{stats.services}</p>
          </div>
          <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200/70">Produtos / Peças</p>
            <p className="text-xl font-black text-indigo-300 mt-0.5">{stats.products}</p>
          </div>
          <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200/70">Com Preço Personalizado</p>
            <p className="text-xl font-black text-emerald-400 mt-0.5">{stats.customCount}</p>
          </div>
        </div>
      </div>

      {/* FILTROS E BARRA DE CONTROLE */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          
          {/* Busca Textual */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por código (#61, #336), descrição ou unidade..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtro por Tipo */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setTypeFilter('all');
                setCategoryFilter('all');
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                typeFilter === 'all'
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              Todos ({items.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setTypeFilter('service');
                setCategoryFilter('all');
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                typeFilter === 'service'
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Wrench className="w-3 h-3" />
              Serviços ({stats.services})
            </button>
            <button
              type="button"
              onClick={() => {
                setTypeFilter('product');
                setCategoryFilter('all');
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                typeFilter === 'product'
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Package className="w-3 h-3" />
              Produtos ({stats.products})
            </button>
          </div>

          {/* Filtro por Categoria (separado e contextualizado) */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap hidden sm:inline flex items-center gap-1">
              <Folder className={cn("w-3.5 h-3.5", typeFilter === 'service' ? "text-blue-500" : "text-indigo-500")} />
              Categoria:
            </span>
            <div className="flex items-center gap-1.5">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={cn(
                  "border rounded-xl px-3 py-2 text-xs font-bold outline-none transition-all cursor-pointer max-w-[210px] truncate",
                  categoryFilter !== 'all' 
                    ? typeFilter === 'service'
                      ? "bg-blue-50 border-blue-300 text-blue-800 font-black"
                      : "bg-indigo-50 border-indigo-300 text-indigo-800 font-black" 
                    : "bg-slate-50 border-slate-200 text-slate-700"
                )}
              >
                <option value="all">Todas as Categorias</option>
                
                {typeFilter === 'service' && (
                  availableServiceCategories.map(cat => (
                    <option key={cat} value={cat}>
                      🔧 {cat} ({serviceCategoryStats[cat] || 0})
                    </option>
                  ))
                )}

                {typeFilter === 'product' && (
                  availableProductCategories.map(cat => (
                    <option key={cat} value={cat}>
                      📦 {cat} ({productCategoryStats[cat] || 0})
                    </option>
                  ))
                )}

                {typeFilter === 'all' && (
                  <>
                    <optgroup label="── CATEGORIAS DE SERVIÇOS ──">
                      {availableServiceCategories.map(cat => (
                        <option key={`srv-${cat}`} value={cat}>
                          🔧 {cat} ({serviceCategoryStats[cat] || 0})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="── CATEGORIAS DE PRODUTOS ──">
                      {availableProductCategories.map(cat => (
                        <option key={`prd-${cat}`} value={cat}>
                          📦 {cat} ({productCategoryStats[cat] || 0})
                        </option>
                      ))}
                    </optgroup>
                  </>
                )}

                <option value="__NO_CATEGORY__">⚠️ Sem Categoria</option>
              </select>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveCategoryModalTab(typeFilter === 'product' ? 'product' : 'service');
                    setIsCategoryModalOpen(true);
                  }}
                  title="Gerenciar, editar e excluir categorias"
                  className="px-2.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-all flex items-center gap-1 text-xs font-bold cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline text-[11px]">Gerenciar</span>
                </button>
              )}
            </div>
          </div>

          {/* Seletor de Comparação de Preço de Cliente */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap hidden sm:inline">Preços de:</span>
            <select
              value={selectedPreviewClientId}
              onChange={(e) => setSelectedPreviewClientId(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">Preço Base Padrão</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  Contrato: {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL: MODO CATÁLOGO OU MODO MATRIZ */}
      {viewMode === 'catalog' ? (
        /* =========================================================
           VISÃO 1: LISTAGEM DO CATÁLOGO DE PRODUTOS & SERVIÇOS
           ========================================================= */
        <div className="space-y-4">
          {/* Barra de Instrução e Status de Organização por Arrastar e Soltar */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-slate-700 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-100/80 text-blue-700 flex items-center justify-center shrink-0">
                <GripVertical className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>Organizar Ordem de Exibição na O.S.</span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 font-black px-1.5 py-0.5 rounded">Arrastar & Soltar</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Arraste os cards para cima ou para baixo para definir a ordem exata em que aparecerão no preenchimento de Ordens de Serviço.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              {isSavingOrder ? (
                <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 animate-pulse">
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                  Salvando ordem...
                </span>
              ) : reorderSuccessToast ? (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Ordem salva e sincronizada!
                </span>
              ) : (
                <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-xs">
                  <ListOrdered className="w-3.5 h-3.5 text-blue-600" />
                  {filteredItems.length} itens ordenados
                </span>
              )}
            </div>
          </div>

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-xs font-bold text-slate-500">Carregando catálogo de produtos e serviços...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
              <Package className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-700">Nenhum item encontrado</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Nenhum produto ou serviço corresponde aos filtros selecionados.
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleOpenCreateModal('service')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Cadastrar Primeiro Item
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredItems.map((item, index) => {
                const isService = item.type === 'service';
                const clientOverride = selectedPreviewClientId ? item.clientPrices?.[selectedPreviewClientId] : null;
                const effectivePrice = clientOverride ? clientOverride.price : item.defaultPrice;
                const effectiveDiscount = clientOverride ? (clientOverride.discountPercent || 0) : (item.defaultDiscountPercent || 0);
                const effectiveFinal = effectivePrice * (1 - effectiveDiscount / 100);
                const totalOverrides = Object.keys(item.clientPrices || {}).length;
                const isBeingDragged = draggedItemId === item.id;
                const isDragOver = dragOverItemId === item.id;

                return (
                  <div
                    key={item.id}
                    draggable={canEdit}
                    onDragStart={(e) => handleDragStart(e, item.id)}
                    onDragOver={(e) => handleDragOver(e, item.id)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, item.id)}
                    className={cn(
                      "bg-white border rounded-2xl p-4 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 select-none",
                      isBeingDragged
                        ? "opacity-30 border-dashed border-2 border-blue-400 bg-blue-50/20 scale-[0.99]"
                        : isDragOver
                          ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50/40 shadow-lg scale-[1.01]"
                          : "border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md"
                    )}
                  >
                    {/* Informações Principais com Alça de Arrastar */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Alça de Arrastar e Posição */}
                      {canEdit && (
                        <div
                          title="Clique e arraste para mudar a ordem na lista de seleção da O.S."
                          className="flex flex-col items-center justify-center p-1.5 rounded-xl bg-slate-100/80 hover:bg-blue-100 text-slate-400 hover:text-blue-700 cursor-grab active:cursor-grabbing transition-all shrink-0 border border-slate-200/80 group"
                        >
                          <GripVertical className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          <span className="text-[9px] font-black text-slate-500 font-mono mt-0.5">
                            {index + 1}º
                          </span>
                        </div>
                      )}

                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold",
                        isService 
                          ? "bg-blue-50 text-blue-600 border border-blue-100" 
                          : "bg-indigo-50 text-indigo-600 border border-indigo-100"
                      )}>
                        {isService ? <Wrench className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn(
                            "text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider",
                            isService ? "bg-blue-100 text-blue-700" : "bg-indigo-100 text-indigo-700"
                          )}>
                            {isService ? 'Serviço' : 'Produto'}
                          </span>

                          <span className="text-xs font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md font-mono">
                            #{item.code}
                          </span>

                          <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                            UN: {item.unit}
                          </span>

                          {item.active === false && (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              Inativo
                            </span>
                          )}

                          {item.category && (
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 flex items-center gap-1">
                              <Folder className="w-3 h-3 text-indigo-500" />
                              {item.category}
                            </span>
                          )}

                          {totalOverrides > 0 && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-emerald-600" />
                              {totalOverrides} contrato{totalOverrides > 1 ? 's' : ''} c/ preço customizado
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-tight line-clamp-2">
                          {item.description}
                        </h4>

                        {item.notes && (
                          <p className="text-[11px] text-slate-400 italic">
                            Nota: {item.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Preços e Valores */}
                    <div className="flex flex-wrap items-center gap-4 lg:gap-6 bg-slate-50/80 p-3 rounded-xl border border-slate-150 shrink-0">
                      
                      {/* Preço Base Padrão */}
                      <div className="text-right">
                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Preço Base Padrão</p>
                        <p className="text-xs font-bold text-slate-700">
                          R$ {item.defaultPrice.toFixed(2)}
                          {item.defaultDiscountPercent ? (
                            <span className="text-[10px] text-rose-500 font-semibold ml-1">
                              (-{item.defaultDiscountPercent}%)
                            </span>
                          ) : null}
                        </p>
                        <p className="text-[10px] font-black text-slate-500">
                          Líquido: R$ {(item.defaultPrice * (1 - (item.defaultDiscountPercent || 0) / 100)).toFixed(2)}
                        </p>
                      </div>

                      {/* Preço no Contrato Selecionado (se houver) */}
                      {selectedPreviewClientId && (
                        <div className="border-l border-slate-200 pl-4 text-right">
                          <p className="text-[9px] font-black uppercase tracking-wider text-blue-600 flex items-center justify-end gap-1">
                            <Building2 className="w-3 h-3" />
                            {clientMap[selectedPreviewClientId] || 'Contrato'}
                          </p>
                          <div className="flex items-center gap-1.5 justify-end">
                            {clientOverride ? (
                              <span className="text-[9px] font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                                Customizado
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                                Base Herdado
                              </span>
                            )}
                            <p className="text-xs font-black text-slate-900">
                              R$ {effectivePrice.toFixed(2)}
                            </p>
                          </div>
                          <p className="text-[11px] font-black text-emerald-700">
                            Valor Final: R$ {effectiveFinal.toFixed(2)}
                            {effectiveDiscount > 0 && (
                              <span className="text-[9px] text-slate-500 font-normal ml-1">
                                (desc {effectiveDiscount}%)
                              </span>
                            )}
                          </p>
                        </div>
                      )}

                      {/* Ações e Botões de Subir / Descer */}
                      {canEdit && (
                        <div className="flex items-center gap-1 border-l border-slate-200 pl-3">
                          {/* Botões rápidos de subir/descer na ordem */}
                          <div className="flex flex-col gap-0.5 mr-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                            <button
                              type="button"
                              title="Mover para cima"
                              disabled={index === 0 || isSavingOrder}
                              onClick={() => handleMoveItem(item.id, 'up')}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-white disabled:opacity-20 disabled:hover:bg-transparent rounded transition-all cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              title="Mover para baixo"
                              disabled={index === filteredItems.length - 1 || isSavingOrder}
                              onClick={() => handleMoveItem(item.id, 'down')}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-white disabled:opacity-20 disabled:hover:bg-transparent rounded transition-all cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>

                          <button
                            type="button"
                            title="Configurar Preços por Contrato"
                            onClick={() => setPriceOverrideModalItem(item)}
                            className="p-1.5 text-blue-600 hover:bg-blue-100/60 rounded-lg transition-all"
                          >
                            <Building2 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            title="Editar Item"
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 text-slate-600 hover:bg-slate-200 rounded-lg transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            title="Duplicar Item"
                            onClick={() => handleDuplicateItem(item)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all"
                          >
                            <Copy className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            title="Excluir Item"
                            onClick={() => handleDeleteItem(item)}
                            className="p-1.5 text-rose-500 hover:bg-rose-100/60 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* =========================================================
           VISÃO 2: TABELA / MATRIZ DE PREÇOS POR CONTRATO (LOTE)
           ========================================================= */
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                Tabela de Preços por Contrato / Cliente
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Selecione o cliente para visualizar e ajustar em lote os preços e descontos aplicados nas Ordens de Serviço desse contrato.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={matrixClientId}
                onChange={(e) => setMatrixClientId(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.contractNumber ? `(Contrato: ${c.contractNumber})` : ''}
                  </option>
                ))}
              </select>

              {canEdit && (
                <button
                  type="button"
                  onClick={handleSaveMatrixChanges}
                  disabled={isSavingMatrix}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSavingMatrix ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              )}
            </div>
          </div>

          {/* Tabela de Preços do Cliente Selecionado */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] font-black tracking-wider">
                  <th className="py-2.5 px-3">Cód</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3">Descrição do Produto / Serviço</th>
                  <th className="py-2.5 px-3 text-center">Un</th>
                  <th className="py-2.5 px-3 text-right">Preço Base (R$)</th>
                  <th className="py-2.5 px-3 text-center">Personalizar?</th>
                  <th className="py-2.5 px-3 text-right">Preço Contrato (R$)</th>
                  <th className="py-2.5 px-3 text-right">Desc Contrato (%)</th>
                  <th className="py-2.5 px-3 text-right">Valor Final O.S. (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map(item => {
                  const draft = matrixDraftPrices[item.id] || {
                    enabled: false,
                    price: item.defaultPrice,
                    discountPercent: item.defaultDiscountPercent || 0
                  };
                  const isCustom = draft.enabled;
                  const finalVal = (draft.price || 0) * (1 - (draft.discountPercent || 0) / 100);

                  return (
                    <tr key={item.id} className={cn("hover:bg-slate-50/80 transition-all", isCustom && "bg-blue-50/30")}>
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">
                        #{item.code}
                      </td>
                      <td className="py-3 px-3">
                        <span className={cn(
                          "text-[9px] font-black px-2 py-0.5 rounded uppercase",
                          item.type === 'service' ? "bg-blue-100 text-blue-700" : "bg-indigo-100 text-indigo-700"
                        )}>
                          {item.type === 'service' ? 'Serv' : 'Prod'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800 uppercase max-w-xs truncate" title={item.description}>
                        {item.description}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-slate-500">
                        {item.unit}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-500 font-semibold">
                        R$ {item.defaultPrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isCustom}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setMatrixDraftPrices(prev => ({
                              ...prev,
                              [item.id]: {
                                enabled: checked,
                                price: checked ? prev[item.id]?.price || item.defaultPrice : item.defaultPrice,
                                discountPercent: checked ? prev[item.id]?.discountPercent || 0 : 0
                              }
                            }));
                          }}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-3 text-right">
                        {isCustom ? (
                          <input
                            type="number"
                            step="0.01"
                            value={draft.price}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setMatrixDraftPrices(prev => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  price: val
                                }
                              }));
                            }}
                            className="w-24 bg-white border border-slate-300 rounded-lg p-1 text-xs text-right font-bold text-slate-800 outline-none focus:border-blue-500"
                          />
                        ) : (
                          <span className="text-slate-400 italic">R$ {item.defaultPrice.toFixed(2)} (base)</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {isCustom ? (
                          <input
                            type="number"
                            step="0.01"
                            value={draft.discountPercent}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setMatrixDraftPrices(prev => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  discountPercent: val
                                }
                              }));
                            }}
                            className="w-16 bg-white border border-slate-300 rounded-lg p-1 text-xs text-right font-bold text-slate-800 outline-none focus:border-blue-500"
                          />
                        ) : (
                          <span className="text-slate-400 italic">{(item.defaultDiscountPercent || 0)}%</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-slate-900">
                        R$ {finalVal.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL DE CADASTRO E EDIÇÃO DO ITEM (PRODUTO/SERVIÇO)
          ========================================================= */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden my-8"
            >
              {/* Header do Modal */}
              <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-blue-400 text-xs font-black uppercase tracking-wider mb-1">
                    {formType === 'service' ? <Wrench className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                    {editingItem ? 'Editar Item do Catálogo' : 'Novo Produto ou Serviço'}
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    {editingItem ? `#${formCode} - ${formDescription}` : 'Cadastrar Item de Ordem de Serviço'}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs do Modal: Geral | Preços por Cliente */}
              <div className="flex border-b border-slate-200 px-6 bg-slate-50 gap-6">
                <button
                  type="button"
                  onClick={() => setModalTab('general')}
                  className={cn(
                    "py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2",
                    modalTab === 'general'
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  )}
                >
                  <Package className="w-4 h-4" />
                  Dados Gerais
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('client_prices')}
                  className={cn(
                    "py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2",
                    modalTab === 'client_prices'
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  )}
                >
                  <Building2 className="w-4 h-4" />
                  Tabela de Preços por Contrato / Cliente ({Object.keys(formClientPrices).length} definidos)
                </button>
              </div>

              {/* Feedback messages */}
              {errorMessage && (
                <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-bold">
                  {errorMessage}
                </div>
              )}
              {successMessage && (
                <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl font-bold">
                  {successMessage}
                </div>
              )}

              {/* Form Content */}
              <form onSubmit={handleSaveItem} className="p-6 space-y-5">
                {modalTab === 'general' ? (
                  <div className="space-y-4">
                    {/* Tipo do Item */}
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1.5">
                        Tipo do Item *
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setFormType('service');
                            if (formUnit === 'KG') setFormUnit('UN');
                          }}
                          className={cn(
                            "p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                            formType === 'service'
                              ? "bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500/20"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                          )}
                        >
                          <Wrench className="w-4 h-4" />
                          Serviço Técnico (Mão de obra / Procedimento)
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setFormType('product');
                            if (formUnit === 'SERV') setFormUnit('UN');
                            if (!formCategory) setFormCategory('GASES REFRIGERANTES');
                          }}
                          className={cn(
                            "p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                            formType === 'product'
                              ? "bg-indigo-50 border-indigo-500 text-indigo-700 ring-2 ring-indigo-500/20"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                          )}
                        >
                          <Package className="w-4 h-4" />
                          Produto / Peça / Material
                        </button>
                      </div>
                    </div>

                    {/* Categoria do Produto / Serviço */}
                    <div className={cn(
                      "border rounded-2xl p-3.5 space-y-2.5 transition-all",
                      formType === 'service' ? "bg-blue-50/50 border-blue-150" : "bg-indigo-50/50 border-indigo-150"
                    )}>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className={cn(
                          "text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5",
                          formType === 'service' ? "text-blue-950" : "text-indigo-950"
                        )}>
                          <Folder className={cn("w-3.5 h-3.5", formType === 'service' ? "text-blue-600" : "text-indigo-600")} />
                          {formType === 'service' ? 'Categoria do Serviço' : 'Categoria do Produto / Peça'} {formType === 'product' && <span className="text-rose-500">*</span>}
                        </label>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setIsCustomCategoryInput(!isCustomCategoryInput)}
                            className={cn(
                              "text-[10px] font-bold transition underline cursor-pointer",
                              formType === 'service' ? "text-blue-600 hover:text-blue-800" : "text-indigo-600 hover:text-indigo-800"
                            )}
                          >
                            {isCustomCategoryInput ? '← Escolher existente' : '+ Digitar Nova'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveCategoryModalTab(formType);
                              setIsCategoryModalOpen(true);
                            }}
                            className={cn(
                              "text-[10px] font-bold transition flex items-center gap-1 cursor-pointer bg-white px-2 py-0.5 rounded-lg border",
                              formType === 'service' 
                                ? "text-slate-600 hover:text-blue-700 border-blue-200" 
                                : "text-slate-600 hover:text-indigo-700 border-indigo-200"
                            )}
                          >
                            <Edit2 className={cn("w-3 h-3", formType === 'service' ? "text-blue-500" : "text-indigo-500")} />
                            Gerenciar
                          </button>
                        </div>
                      </div>

                      {!isCustomCategoryInput ? (
                        <div className="flex gap-2">
                          <select
                            value={formCategory}
                            onChange={(e) => {
                              if (e.target.value === '__NEW__') {
                                setIsCustomCategoryInput(true);
                                setFormCategory('');
                              } else {
                                setFormCategory(e.target.value);
                              }
                            }}
                            className={cn(
                              "w-full bg-white border rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none cursor-pointer transition",
                              formType === 'service'
                                ? "border-blue-200 hover:border-blue-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                : "border-indigo-200 hover:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            )}
                          >
                            <option value="">-- Selecione uma Categoria --</option>
                            {formType === 'service'
                              ? availableServiceCategories.map(cat => (
                                  <option key={cat} value={cat}>
                                    🔧 {cat}
                                  </option>
                                ))
                              : availableProductCategories.map(cat => (
                                  <option key={cat} value={cat}>
                                    📦 {cat}
                                  </option>
                                ))}
                            <option value="__NEW__">+ Criar / Digitar Nova Categoria...</option>
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <input
                            type="text"
                            placeholder={formType === 'service' 
                              ? "DIGITE O NOME DA CATEGORIA DE SERVIÇO (EX: MANUTENÇÃO PREVENTIVA, LAUDOS...)" 
                              : "DIGITE O NOME DA CATEGORIA DE PRODUTO (EX: MOTORES, SENSORES, FERRAMENTAS...)"}
                            value={formCategory}
                            onChange={(e) => setFormCategory(e.target.value)}
                            className={cn(
                              "w-full bg-white border rounded-xl p-2.5 text-xs font-bold uppercase outline-none placeholder:text-slate-400 font-mono",
                              formType === 'service'
                                ? "border-blue-300 text-blue-950 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                : "border-indigo-300 text-indigo-950 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            )}
                            autoFocus
                          />
                          <p className={cn("text-[10px] font-semibold", formType === 'service' ? "text-blue-600" : "text-indigo-600")}>
                            Essa nova categoria será salva com o {formType === 'service' ? 'serviço' : 'produto'} e ficará disponível para futuras seleções.
                          </p>
                        </div>
                      )}

                      {/* Sugestões rápidas de Categorias */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[9px] font-bold text-slate-400">Sugestões rápidas:</span>
                        {(formType === 'service' ? DEFAULT_SERVICE_CATEGORIES : DEFAULT_PRODUCT_CATEGORIES).slice(0, 5).map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setFormCategory(cat);
                              setIsCustomCategoryInput(false);
                            }}
                            className={cn(
                              "text-[9px] font-bold px-2 py-0.5 rounded-md transition-all border cursor-pointer",
                              formCategory === cat
                                ? formType === 'service'
                                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                  : "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                : formType === 'service'
                                  ? "bg-white text-blue-700 hover:bg-blue-100 border-blue-200"
                                  : "bg-white text-indigo-700 hover:bg-indigo-100 border-indigo-200"
                            )}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Código */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                          Código do Item *
                        </label>
                        <input
                          type="text"
                          placeholder="EX: 61, 336, CARGA-GAS"
                          value={formCode}
                          onChange={(e) => setFormCode(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 uppercase outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                          required
                        />
                      </div>

                      {/* Unidade */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                          Unidade de Medida *
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={['UN', 'KG', 'L', 'M', 'SERV', 'PAR', 'CJ'].includes(formUnit) ? formUnit : 'OUTRO'}
                            onChange={(e) => {
                              if (e.target.value !== 'OUTRO') {
                                setFormUnit(e.target.value);
                              }
                            }}
                            className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          >
                            <option value="UN">UN (Unidade)</option>
                            <option value="KG">KG (Quilo)</option>
                            <option value="L">L (Litro)</option>
                            <option value="M">M (Metro)</option>
                            <option value="SERV">SERV (Serviço)</option>
                            <option value="PAR">PAR (Par)</option>
                            <option value="CJ">CJ (Conjunto)</option>
                            <option value="OUTRO">Outro / Manual</option>
                          </select>
                          <input
                            type="text"
                            placeholder="UN"
                            value={formUnit}
                            onChange={(e) => setFormUnit(e.target.value)}
                            className="w-16 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-center font-bold text-slate-800 uppercase outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          />
                        </div>
                      </div>

                      {/* Status */}
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                          Disponibilidade
                        </label>
                        <div className="flex items-center gap-2 mt-2">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formActive}
                              onChange={(e) => setFormActive(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                          </label>
                          <span className="text-xs font-bold text-slate-700">
                            {formActive ? 'Item Ativo' : 'Item Inativo'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Descrição */}
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                        Descrição Completa do Produto / Serviço *
                      </label>
                      <textarea
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="EX: MANUTENCAO NIVEL 2- MANUTENCAO DE CARENAGEM, FILTRO DE AR, BANDEJA DE DRENO COM JATEAMENTO..."
                        rows={3}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 uppercase outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        required
                      />
                    </div>

                    {/* Preços Padrão Base */}
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700">
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                        Preço Base Padrão (Utilizado caso o cliente não tenha preço customizado)
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                            Valor Unitário Base (R$) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={formDefaultPrice}
                            onChange={(e) => setFormDefaultPrice(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            required
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                            Desconto Padrão (%)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0"
                            value={formDefaultDiscount}
                            onChange={(e) => setFormDefaultDiscount(e.target.value === '' ? 0 : Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                            Valor Líquido Calculado
                          </label>
                          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2 text-xs font-black text-emerald-800 text-center">
                            R$ {((Number(formDefaultPrice) || 0) * (1 - (Number(formDefaultDiscount) || 0) / 100)).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Observações */}
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block mb-1">
                        Observações Internas / Especificação Técnica (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="EX: Aplicável para splits até 30k BTUs / Contratos com mão de obra inclusa"
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                  </div>
                ) : (
                  /* Aba de Preços por Contrato / Cliente */
                  <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                    <div className="bg-blue-50 border border-blue-150 p-3.5 rounded-xl flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-800 leading-relaxed">
                        Defina preços e descontos personalizados para cada cliente/contrato. Se desativado para um cliente, o sistema utilizará o <strong>Preço Base Padrão (R$ {(Number(formDefaultPrice) || 0).toFixed(2)})</strong>.
                      </p>
                    </div>

                    <div className="space-y-2">
                      {clients.map(client => {
                        const override = formClientPrices[client.id];
                        const isCustom = !!override;
                        const price = override ? override.price : (Number(formDefaultPrice) || 0);
                        const discount = override ? (override.discountPercent || 0) : (Number(formDefaultDiscount) || 0);
                        const finalVal = price * (1 - discount / 100);

                        return (
                          <div
                            key={client.id}
                            className={cn(
                              "border rounded-xl p-3.5 transition-all",
                              isCustom
                                ? "bg-blue-50/40 border-blue-300"
                                : "bg-slate-50/60 border-slate-200"
                            )}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  id={`chk_${client.id}`}
                                  checked={isCustom}
                                  onChange={() => handleToggleClientOverride(client.id)}
                                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                                />
                                <div>
                                  <label htmlFor={`chk_${client.id}`} className="text-xs font-bold text-slate-800 cursor-pointer">
                                    {client.name}
                                  </label>
                                  {client.contractNumber && (
                                    <span className="text-[10px] text-slate-500 ml-2 font-mono">
                                      (Contrato #{client.contractNumber})
                                    </span>
                                  )}
                                  <p className="text-[10px] text-slate-500">
                                    {isCustom ? 'Preço customizado ativo' : 'Utilizando preço base padrão'}
                                  </p>
                                </div>
                              </div>

                              {isCustom ? (
                                <div className="flex items-center gap-2">
                                  <div>
                                    <label className="text-[9px] font-black uppercase text-slate-400 block">Preço (R$)</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={price}
                                      onChange={(e) => handleUpdateClientOverride(client.id, 'price', Number(e.target.value))}
                                      className="w-24 bg-white border border-slate-300 rounded-lg p-1 text-xs text-right font-bold text-slate-800 outline-none focus:border-blue-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-black uppercase text-slate-400 block">Desc %</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={discount}
                                      onChange={(e) => handleUpdateClientOverride(client.id, 'discountPercent', Number(e.target.value))}
                                      className="w-16 bg-white border border-slate-300 rounded-lg p-1 text-xs text-right font-bold text-slate-800 outline-none focus:border-blue-500"
                                    />
                                  </div>
                                  <div className="text-right pl-2">
                                    <label className="text-[9px] font-black uppercase text-emerald-600 block">Final O.S.</label>
                                    <span className="text-xs font-black text-slate-900">
                                      R$ {finalVal.toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs font-semibold text-slate-400">
                                  R$ {finalVal.toFixed(2)} (Base)
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Footer do Modal */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Salvando...' : editingItem ? 'Salvar Alterações' : 'Cadastrar Item'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================
          GAVETA / MODAL DE PREÇOS POR CONTRATO RÁPIDA (POR ITEM)
          ========================================================= */}
      <AnimatePresence>
        {priceOverrideModalItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden"
            >
              <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-blue-400 uppercase tracking-widest block">
                    Tabela de Preços por Cliente
                  </span>
                  <h3 className="text-base font-bold text-white mt-0.5">
                    #{priceOverrideModalItem.code} - {priceOverrideModalItem.description}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Preço Base Padrão: <strong>R$ {priceOverrideModalItem.defaultPrice.toFixed(2)}</strong> (Desc: {priceOverrideModalItem.defaultDiscountPercent || 0}%)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setPriceOverrideModalItem(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 max-h-[400px] overflow-y-auto space-y-2">
                {clients.map(client => {
                  const currentOverride = priceOverrideModalItem.clientPrices?.[client.id];
                  const hasCustom = !!currentOverride;
                  const price = currentOverride ? currentOverride.price : priceOverrideModalItem.defaultPrice;
                  const discount = currentOverride ? (currentOverride.discountPercent || 0) : (priceOverrideModalItem.defaultDiscountPercent || 0);
                  const finalVal = price * (1 - discount / 100);

                  return (
                    <div
                      key={client.id}
                      className={cn(
                        "p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3",
                        hasCustom ? "bg-blue-50/50 border-blue-300" : "bg-slate-50 border-slate-200"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={`quick_chk_${client.id}`}
                          checked={hasCustom}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const nextPrices = { ...(priceOverrideModalItem.clientPrices || {}) };
                            if (checked) {
                              nextPrices[client.id] = {
                                price: priceOverrideModalItem.defaultPrice,
                                discountPercent: priceOverrideModalItem.defaultDiscountPercent || 0
                              };
                            } else {
                              delete nextPrices[client.id];
                            }
                            setPriceOverrideModalItem({
                              ...priceOverrideModalItem,
                              clientPrices: nextPrices
                            });
                          }}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 cursor-pointer"
                        />
                        <div>
                          <label htmlFor={`quick_chk_${client.id}`} className="text-xs font-bold text-slate-800 cursor-pointer">
                            {client.name}
                          </label>
                          <p className="text-[10px] text-slate-400">
                            {hasCustom ? 'Preço específico configurado' : 'Usando preço base padrão'}
                          </p>
                        </div>
                      </div>

                      {hasCustom ? (
                        <div className="flex items-center gap-2">
                          <div>
                            <label className="text-[9px] font-black uppercase text-slate-400 block">Preço (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={price}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                const nextPrices = { ...(priceOverrideModalItem.clientPrices || {}) };
                                nextPrices[client.id] = {
                                  price: val,
                                  discountPercent: currentOverride?.discountPercent || 0
                                };
                                setPriceOverrideModalItem({
                                  ...priceOverrideModalItem,
                                  clientPrices: nextPrices
                                });
                              }}
                              className="w-20 bg-white border border-slate-300 rounded-lg p-1 text-xs text-right font-bold text-slate-800 outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-black uppercase text-slate-400 block">Desc %</label>
                            <input
                              type="number"
                              step="0.01"
                              value={discount}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                const nextPrices = { ...(priceOverrideModalItem.clientPrices || {}) };
                                nextPrices[client.id] = {
                                  price: currentOverride?.price || priceOverrideModalItem.defaultPrice,
                                  discountPercent: val
                                };
                                setPriceOverrideModalItem({
                                  ...priceOverrideModalItem,
                                  clientPrices: nextPrices
                                });
                              }}
                              className="w-16 bg-white border border-slate-300 rounded-lg p-1 text-xs text-right font-bold text-slate-800 outline-none"
                            />
                          </div>
                          <div className="text-right pl-2">
                            <label className="text-[9px] font-black uppercase text-emerald-600 block">Final</label>
                            <span className="text-xs font-black text-slate-900">R$ {finalVal.toFixed(2)}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">
                          R$ {finalVal.toFixed(2)} (Base)
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPriceOverrideModalItem(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleSavePriceOverrideDrawer(priceOverrideModalItem, priceOverrideModalItem.clientPrices || {})}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md"
                >
                  Salvar Tabela de Preços
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================
          MODAL DE GERENCIAMENTO DE CATEGORIAS (CRIAR, EDITAR, EXCLUIR)
          ========================================================= */}
      <AnimatePresence>
        {isCategoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header do Modal */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 px-6 flex items-center justify-between border-b border-indigo-900/40">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                    <Folder className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      Gerenciador de Categorias
                      <span className="text-[11px] font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-400/20">
                        {availableServiceCategories.length + availableProductCategories.length} categorias no total
                      </span>
                    </h3>
                    <p className="text-xs text-slate-300">
                      Crie novas categorias, renomeie (com atualização automática nos itens) ou exclua.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsCategoryModalOpen(false);
                    setEditingCategoryKey(null);
                    setDeletingCategory(null);
                  }}
                  className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Seletor de Abas: Categorias de Serviços vs Categorias de Produtos */}
              <div className="bg-slate-100/80 p-2 px-6 border-b border-slate-200 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCategoryModalTab('service');
                      setEditingCategoryKey(null);
                      setDeletingCategory(null);
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer",
                      activeCategoryModalTab === 'service'
                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                        : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
                    )}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    Categorias de Serviços ({availableServiceCategories.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveCategoryModalTab('product');
                      setEditingCategoryKey(null);
                      setDeletingCategory(null);
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer",
                      activeCategoryModalTab === 'product'
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                        : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
                    )}
                  >
                    <Package className="w-3.5 h-3.5" />
                    Categorias de Produtos ({availableProductCategories.length})
                  </button>
                </div>

                <span className="text-[11px] font-bold text-slate-400 hidden sm:inline">
                  {activeCategoryModalTab === 'service' ? '🔧 Escopo: Serviços' : '📦 Escopo: Produtos'}
                </span>
              </div>

              {/* Mensagens de Feedback no Modal */}
              {successMessage && (
                <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  {successMessage}
                </div>
              )}
              {errorMessage && (
                <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  {errorMessage}
                </div>
              )}

              {/* Conteúdo do Modal */}
              <div className="p-6 space-y-5 overflow-y-auto flex-1">
                
                {/* 1. Criar Nova Categoria */}
                <div className={cn(
                  "border rounded-2xl p-4 transition-all",
                  activeCategoryModalTab === 'service' 
                    ? "bg-blue-50/70 border-blue-150" 
                    : "bg-indigo-50/70 border-indigo-150"
                )}>
                  <label className={cn(
                    "text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 mb-2",
                    activeCategoryModalTab === 'service' ? "text-blue-950" : "text-indigo-950"
                  )}>
                    <Plus className={cn("w-3.5 h-3.5", activeCategoryModalTab === 'service' ? "text-blue-600" : "text-indigo-600")} />
                    Adicionar Nova Categoria de {activeCategoryModalTab === 'service' ? 'Serviço' : 'Produto'}
                  </label>
                  <form onSubmit={handleAddCategory} className="flex gap-2">
                    <input
                      type="text"
                      placeholder={activeCategoryModalTab === 'service' 
                        ? "NOME DA CATEGORIA (EX: MANUTENÇÃO PREVENTIVA, HIGIENIZAÇÃO, LAUDOS...)" 
                        : "NOME DA CATEGORIA (EX: COMPRESSORES SCROLL, FLUIDOS ESPECIAIS, FILTROS...)"}
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className={cn(
                        "flex-1 bg-white border rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 uppercase outline-none placeholder:text-slate-400 font-mono",
                        activeCategoryModalTab === 'service'
                          ? "border-blue-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          : "border-indigo-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      )}
                    />
                    <button
                      type="submit"
                      disabled={!newCategoryName.trim() || categoryActionLoading}
                      className={cn(
                        "disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer",
                        activeCategoryModalTab === 'service'
                          ? "bg-blue-600 hover:bg-blue-700"
                          : "bg-indigo-600 hover:bg-indigo-700"
                      )}
                    >
                      <Plus className="w-4 h-4" />
                      Cadastrar
                    </button>
                  </form>
                </div>

                {/* 2. Busca e Lista de Categorias da Aba Ativa */}
                {(() => {
                  const currentCategories = activeCategoryModalTab === 'service' ? availableServiceCategories : availableProductCategories;
                  const currentStats = activeCategoryModalTab === 'service' ? serviceCategoryStats : productCategoryStats;

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-slate-500" />
                          Categorias de {activeCategoryModalTab === 'service' ? 'Serviço' : 'Produto'} Cadastradas ({currentCategories.length})
                        </h4>

                        {/* Busca nas categorias */}
                        {currentCategories.length > 5 && (
                          <div className="relative w-48">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              placeholder="Filtrar categorias..."
                              value={categorySearchQuery}
                              onChange={(e) => setCategorySearchQuery(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500"
                            />
                          </div>
                        )}
                      </div>

                      {/* Lista de Cards de Categoria */}
                      <div className="grid grid-cols-1 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
                        {currentCategories
                          .filter(cat => !categorySearchQuery.trim() || cat.toLowerCase().includes(categorySearchQuery.toLowerCase()))
                          .map(cat => {
                            const count = currentStats[cat] || 0;
                            const isEditingThis = editingCategoryKey === cat;
                            const isDeletingThis = deletingCategory === cat;

                            if (isDeletingThis) {
                              return (
                                <div key={cat} className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl space-y-3 animate-fadeIn">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <h5 className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                                        <Trash2 className="w-4 h-4 text-rose-600" />
                                        Confirmar exclusão da categoria "{cat}" em {activeCategoryModalTab === 'service' ? 'Serviços' : 'Produtos'}?
                                      </h5>
                                      <p className="text-xs text-rose-700 mt-1">
                                        {count > 0
                                          ? `Existem ${count} ${activeCategoryModalTab === 'service' ? 'serviço(s)' : 'produto(s)'} vinculados a esta categoria.`
                                          : `Nenhum ${activeCategoryModalTab === 'service' ? 'serviço' : 'produto'} está vinculado a esta categoria atualmente.`}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setDeletingCategory(null)}
                                      className="text-rose-400 hover:text-rose-700 p-1 rounded-lg cursor-pointer"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>

                                  {count > 0 && (
                                    <div className="bg-white/80 border border-rose-200 rounded-xl p-3 space-y-2">
                                      <label className="text-[10px] font-black uppercase text-slate-700 block">
                                        O que fazer com os {count} {activeCategoryModalTab === 'service' ? 'serviço(s)' : 'produto(s)'} vinculados?
                                      </label>
                                      <select
                                        value={reassignCategoryTarget}
                                        onChange={(e) => setReassignCategoryTarget(e.target.value)}
                                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                                      >
                                        <option value="">⚠️ Deixar itens "Sem Categoria"</option>
                                        {currentCategories
                                          .filter(c => c !== cat)
                                          .map(c => (
                                            <option key={c} value={c}>
                                              📁 Transferir para categoria: {c}
                                            </option>
                                          ))}
                                      </select>
                                    </div>
                                  )}

                                  <div className="flex items-center justify-end gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => setDeletingCategory(null)}
                                      disabled={categoryActionLoading}
                                      className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-rose-100 rounded-xl transition cursor-pointer"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleConfirmDeleteCategory}
                                      disabled={categoryActionLoading}
                                      className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-1.5 rounded-xl text-xs font-black shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      {categoryActionLoading ? 'Excluindo...' : 'Sim, Excluir Categoria'}
                                    </button>
                                  </div>
                                </div>
                              );
                            }

                            if (isEditingThis) {
                              return (
                                <div key={cat} className={cn(
                                  "p-3 border-2 rounded-2xl space-y-2 animate-fadeIn",
                                  activeCategoryModalTab === 'service'
                                    ? "bg-blue-50 border-blue-400"
                                    : "bg-indigo-50 border-indigo-400"
                                )}>
                                  <div className="flex items-center justify-between">
                                    <label className={cn(
                                      "text-[10px] font-black uppercase flex items-center gap-1",
                                      activeCategoryModalTab === 'service' ? "text-blue-900" : "text-indigo-900"
                                    )}>
                                      <Edit2 className={cn("w-3 h-3", activeCategoryModalTab === 'service' ? "text-blue-600" : "text-indigo-600")} />
                                      Renomear Categoria de {activeCategoryModalTab === 'service' ? 'Serviço' : 'Produto'}
                                    </label>
                                    <span className={cn(
                                      "text-[10px] font-semibold",
                                      activeCategoryModalTab === 'service' ? "text-blue-600" : "text-indigo-600"
                                    )}>
                                      {count} {activeCategoryModalTab === 'service' ? 'serviço(s)' : 'produto(s)'} serão atualizados automaticamente
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={editingCategoryValue}
                                      onChange={(e) => setEditingCategoryValue(e.target.value)}
                                      className={cn(
                                        "flex-1 bg-white border rounded-xl px-3 py-2 text-xs font-bold uppercase outline-none font-mono",
                                        activeCategoryModalTab === 'service'
                                          ? "border-blue-300 text-blue-950 focus:ring-2 focus:ring-blue-500/20"
                                          : "border-indigo-300 text-indigo-950 focus:ring-2 focus:ring-indigo-500/20"
                                      )}
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveRenameCategory(cat);
                                        if (e.key === 'Escape') setEditingCategoryKey(null);
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveRenameCategory(cat)}
                                      disabled={!editingCategoryValue.trim() || categoryActionLoading}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                      title="Salvar novo nome"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      Salvar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCategoryKey(null);
                                        setEditingCategoryValue('');
                                      }}
                                      disabled={categoryActionLoading}
                                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                      title="Cancelar edição"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={cat}
                                className="p-3 px-4 bg-slate-50/80 hover:bg-slate-100/90 border border-slate-200 rounded-2xl transition flex items-center justify-between gap-3 group"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={cn(
                                    "w-8 h-8 rounded-xl border flex items-center justify-center shrink-0",
                                    activeCategoryModalTab === 'service'
                                      ? "bg-blue-100 border-blue-200 text-blue-600"
                                      : "bg-indigo-100 border-indigo-200 text-indigo-600"
                                  )}>
                                    <Folder className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <h5 className="text-xs font-black text-slate-800 tracking-wide truncate">
                                      {cat}
                                    </h5>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className={cn(
                                        "text-[10px] font-bold px-1.5 py-0.2 rounded border",
                                        count > 0 
                                          ? activeCategoryModalTab === 'service'
                                            ? "bg-blue-50 text-blue-700 border-blue-200"
                                            : "bg-indigo-50 text-indigo-700 border-indigo-200" 
                                          : "bg-slate-100 text-slate-400 border-slate-200"
                                      )}>
                                        {count} {activeCategoryModalTab === 'service' ? 'serviço(s)' : 'produto(s)'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {/* Botão Filtrar no Catálogo */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTypeFilter(activeCategoryModalTab);
                                      setCategoryFilter(cat);
                                      setIsCategoryModalOpen(false);
                                    }}
                                    title="Filtrar catálogo por esta categoria"
                                    className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-xl transition cursor-pointer"
                                  >
                                    Ver Itens
                                  </button>

                                  {/* Botão Renomear */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCategoryKey(cat);
                                      setEditingCategoryValue(cat);
                                    }}
                                    title="Editar / Renomear Categoria"
                                    className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition cursor-pointer"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Botão Excluir */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeletingCategory(cat);
                                      setReassignCategoryTarget('');
                                    }}
                                    title="Excluir Categoria"
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Footer do Modal */}
              <div className="p-4 px-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <p className="text-[11px] text-slate-400 font-medium">
                  As categorias de serviços e produtos são gerenciadas de forma independente no catálogo.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsCategoryModalOpen(false);
                    setEditingCategoryKey(null);
                    setDeletingCategory(null);
                  }}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Concluído
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
