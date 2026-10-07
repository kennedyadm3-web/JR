import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileText, 
  Save, 
  Check, 
  Sliders, 
  ArrowUpDown,
  Filter,
  Printer,
  Plus,
  X,
  ListPlus,
  User
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { JettingControl, MaintenanceRecord, MaintenanceStatus, Equipment } from '../types';
import { PMOCDocumentViewerModal } from './PMOCDocumentViewerModal';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';

interface JettingControlCenterProps {
  records?: MaintenanceRecord[];
  onPrintChecklist?: (record: MaintenanceRecord, options?: { printPhotos?: boolean; printGeneralNotes?: boolean }) => void;
  onGenerateOS?: (item: JettingControl, machines: string[]) => void;
  onGenerateBatchOS?: (item: JettingControl, machines: {name: string, index: number, eqKey: string, equipmentId?: string}[]) => void;
}

export function JettingControlCenter({ records = [], onPrintChecklist, onGenerateOS, onGenerateBatchOS }: JettingControlCenterProps) {
  const [items, setItems] = useState<JettingControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pendente' | 'Em Andamento' | 'Concluído'>('all');
  
  // Tracking modifications for inline fields
  const [editingValues, setEditingValues] = useState<Record<string, { serviceOrders: string, notes: string }>>({});
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [syncingIds, setSyncingIds] = useState<Record<string, boolean>>({});
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<Record<string, boolean>>({});

  // Technicians resolution state
  const [techniciansMap, setTechniciansMap] = useState<Record<string, string>>({});
  const [loadingTechs, setLoadingTechs] = useState<Record<string, boolean>>({});

  // PMOC Modal Preview state
  const [loadingPMOCId, setLoadingPMOCId] = useState<string | null>(null);
  const [pmocModalData, setPmocModalData] = useState<{
    record: MaintenanceRecord;
    address?: any;
    client?: any;
    equipments?: Equipment[];
  } | null>(null);

  // States for manual creation
  const [isAddingNewLocation, setIsAddingNewLocation] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [manualMachines, setManualMachines] = useState('');
  const [creatingLocation, setCreatingLocation] = useState(false);

  // Equipamentos para mapeamento da potência das máquinas por endereço
  const [equipments, setEquipments] = useState<Equipment[]>([]);

  useEffect(() => {
    dataService.getEquipments(undefined, true).then(eqs => {
      setEquipments(eqs || []);
    }).catch(err => {
      console.error('Erro ao carregar equipamentos no JettingControlCenter:', err);
    });
  }, []);

  const equipmentsByAddress = useMemo(() => {
    const map: Record<string, Equipment[]> = {};
    equipments.forEach(eq => {
      if (eq.addressId) {
        if (!map[eq.addressId]) map[eq.addressId] = [];
        map[eq.addressId].push(eq);
      }
    });
    return map;
  }, [equipments]);

  const normalizeSector = (str: string) => {
    return (str || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[.\-_/\\,]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const formatBtusValue = (btuVal: any): string => {
    if (!btuVal) return '';
    const strVal = String(btuVal).replace(/\./g, '').trim();
    const num = Number(strVal);
    if (isNaN(num)) return String(btuVal).trim();
    const adjustedNum = num < 1000 ? num * 1000 : num;
    return adjustedNum.toLocaleString('pt-BR');
  };

  const formatMachineWithPower = (rawMachine: string, addressId?: string): string => {
    if (!rawMachine) return '';
    let clean = rawMachine.trim();
    
    // Remover o [ID:xxx] oculto da exibição
    clean = clean.replace(/\s*\[ID:[^\]]+\]\s*/g, ' ').trim();

    // Se já tiver indicação explícita de potência/BTU/TR antes do parênteses, mantém
    const prefixBeforeParen = clean.includes('(') ? clean.substring(0, clean.indexOf('(')).trim() : '';
    if (
      prefixBeforeParen.toUpperCase().includes('BTU') || 
      prefixBeforeParen.toUpperCase().includes('TR') || 
      /^\d+([\.,]\d+)?\s*(k|mil)?/i.test(prefixBeforeParen)
    ) {
      return clean;
    }

    // Extrair padrão: TIPO (SETOR) - Obs: ...
    const parenMatch = clean.match(/^(.*?)\(([^)]+)\)(.*)$/);
    if (!parenMatch) {
      return clean.replace(/^(SPLIT|ACJ|CASSETE|PISO\s*TETO|HI-WALL|CHILLER|MULTISPLIT|AR\s*CONDICIONADO)\s*/i, '').trim();
    }

    const rawType = parenMatch[1].trim();
    const sector = parenMatch[2].trim();
    const rest = parenMatch[3]; // ex: " - Obs: Precisa de jateamento"

    const addrEquips = (addressId && equipmentsByAddress[addressId]) ? equipmentsByAddress[addressId] : [];
    const normTarget = normalizeSector(sector);
    let matchedEq: Equipment | undefined;

    if (addrEquips.length > 0) {
      // 1. Match exato normalizado
      matchedEq = addrEquips.find(e => normalizeSector(e.sector) === normTarget);

      // 2. Se não achou exato, tenta por contenção
      if (!matchedEq && normTarget.length >= 3) {
        matchedEq = addrEquips.find(e => {
          const normEq = normalizeSector(e.sector);
          return normEq.includes(normTarget) || normTarget.includes(normEq);
        });
      }

      // 3. Se ainda não achou, tenta palavras-chave (ex: "SALA DE AULA 3 ANO D" com "SALA 3")
      if (!matchedEq && normTarget.includes('sala')) {
        const numbersInTarget = normTarget.match(/\d+/g) || [];
        if (numbersInTarget.length > 0) {
          matchedEq = addrEquips.find(e => {
            const normEq = normalizeSector(e.sector);
            return normEq.includes('sala') && numbersInTarget.every(n => normEq.includes(n));
          });
        }
      }
    }

    // Se encontramos o equipamento no endereço
    if (matchedEq) {
      let powerLabel = '';
      if (matchedEq.btus) {
        const btuFormatted = formatBtusValue(matchedEq.btus);
        powerLabel = btuFormatted.toUpperCase().includes('BTU') || btuFormatted.toUpperCase().includes('TR')
          ? btuFormatted
          : `${btuFormatted} BTUs`;
      } else if (matchedEq.brand) {
        powerLabel = matchedEq.brand.toUpperCase();
      }

      if (powerLabel) {
        return `${powerLabel} (${matchedEq.sector || sector})${rest}`;
      }
    }

    // Se não encontrou o equipamento ou não possui btus:
    // Remove o tipo antigo (ex: "SPLIT", "ACJ", "CASSETE", "PISO TETO")
    const cleanedType = rawType.replace(/^(SPLIT|ACJ|CASSETE|PISO\s*TETO|HI-WALL|CHILLER|MULTISPLIT|AR\s*CONDICIONADO)\s*/i, '').trim();
    if (cleanedType) {
      return `${cleanedType} (${sector})${rest}`;
    }

    return `(${sector})${rest}`;
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await dataService.getJettingControls();
      // Sort by updatedAt desc
      const sorted = data.sort((a, b) => {
        const timeA = a.updatedAt?.seconds ? a.updatedAt.seconds : new Date(a.updatedAt || 0).getTime();
        const timeB = b.updatedAt?.seconds ? b.updatedAt.seconds : new Date(b.updatedAt || 0).getTime();
        return timeB - timeA;
      });
      setItems(sorted);
      
      // Carregar nomes dos técnicos associados aos atendimentos que geraram estes jateamentos
      loadTechniciansForItems(sorted);

      // Validar status real das O.S. geradas para garantir que o checklist só fique marcado se a O.S. foi finalizada pelo técnico
      validateAndSyncItemChecklists(sorted);
      
      // Initialize edit values
      const initialVals: Record<string, { serviceOrders: string, notes: string }> = {};
      sorted.forEach(item => {
        if (item.id) {
          initialVals[item.id] = {
            serviceOrders: item.serviceOrders || '',
            notes: item.notes || ''
          };
        }
      });
      setEditingValues(initialVals);
    } catch (e) {
      console.error('Erro ao buscar itens de jateamento:', e);
    } finally {
      setLoading(false);
    }
  };

  // Validar se as ordens associadas às máquinas já foram atendidas e finalizadas pelos técnicos
  const validateAndSyncItemChecklists = async (itemsList: JettingControl[]) => {
    try {
      let anyChanged = false;
      const updatedList = await Promise.all(
        itemsList.map(async (item) => {
          if (!item.id || !item.addressId || !item.checkedEquipments || Object.keys(item.checkedEquipments).length === 0) {
            return item;
          }

          // Buscar O.S. deste endereço
          const orders = await dataService.getServiceOrdersByAddress(item.addressId);
          if (!orders || orders.length === 0) return item;

          const machinesArray = item.equipmentsText ? item.equipmentsText.split(';').map(x => x.trim()).filter(Boolean) : [];
          const currentChecked: Record<string, { checked: boolean; os: string }> = { ...item.checkedEquipments };
          let itemChanged = false;

          machinesArray.forEach((mach, idx) => {
            const eqKey = `${idx}_${mach}`;
            const cleanName = mach.includes('_') ? mach.substring(mach.indexOf('_') + 1) : mach;
            const config = currentChecked[eqKey] || currentChecked[cleanName];
            if (!config || !config.os || config.os.trim() === '') return;

            const osNum = config.os.trim().toUpperCase();
            const matchedOrder = orders.find(o => (o.osNumber || '').trim().toUpperCase() === osNum);

            if (matchedOrder) {
              // A máquina SÓ deve constar como atendida (checked: true) se a O.S. foi finalizada pelo técnico ou pelo administrativo!
              const isReallyFinished = matchedOrder.techFinalized === true || matchedOrder.status === 'finalizada' || matchedOrder.status === 'pre_finalizada';
              if (config.checked !== isReallyFinished) {
                currentChecked[eqKey] = { ...config, checked: isReallyFinished };
                itemChanged = true;
              }
            }
          });

          if (itemChanged) {
            anyChanged = true;
            const checkedCount = machinesArray.filter((m, i) => {
              const k = `${i}_${m}`;
              return (currentChecked[k] || currentChecked[m])?.checked;
            }).length;

            const allMachinesChecked = machinesArray.length > 0 && checkedCount === machinesArray.length;
            const hasAnyOs = Object.values(currentChecked).some(v => v.os && v.os.trim() !== '');
            const newStatus: 'Concluído' | 'Em Andamento' | 'Pendente' = allMachinesChecked ? 'Concluído' : (checkedCount > 0 || hasAnyOs) ? 'Em Andamento' : 'Pendente';

            dataService.updateJettingControl(item.id, {
              checkedEquipments: currentChecked,
              status: newStatus
            }).catch(console.warn);

            return {
              ...item,
              checkedEquipments: currentChecked,
              status: newStatus
            };
          }
          return item;
        })
      );

      if (anyChanged) {
        setItems(updatedList);
      }
    } catch (err) {
      console.warn('Erro ao validar status das O.S. nos jateamentos:', err);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleStatusChange = async (id: string, newStatus: 'Pendente' | 'Em Andamento' | 'Concluído') => {
    try {
      await dataService.updateJettingControl(id, { status: newStatus });
      setItems(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
      
      // Feedback
      setSavedFeedback(prev => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setSavedFeedback(prev => ({ ...prev, [id]: false }));
      }, 1500);
    } catch (e) {
      console.error('Erro ao atualizar status de jateamento:', e);
    }
  };

  const handleSaveInline = async (id: string) => {
    const vals = editingValues[id];
    if (!vals) return;
    
    setSavingIds(prev => ({ ...prev, [id]: true }));
    try {
      await dataService.updateJettingControl(id, {
        serviceOrders: vals.serviceOrders,
        notes: vals.notes
      });
      
      setItems(prev => prev.map(item => item.id === id ? { ...item, ...vals } : item));
      
      // Show feedback
      setSavedFeedback(prev => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setSavedFeedback(prev => ({ ...prev, [id]: false }));
      }, 2000);
    } catch (e) {
      console.error('Erro ao salvar jateamento:', e);
    } finally {
      setSavingIds(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleInputChange = (id: string, field: 'serviceOrders' | 'notes', value: string) => {
    setEditingValues(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const handleSyncRowOS = async (item: JettingControl, isBulkSync = false) => {
    if (!item.id || !item.addressId) return { syncedCount: 0 };
    setSyncingIds(prev => ({ ...prev, [item.id!]: true }));

    let syncedCount = 0;
    try {
      // Find orders for this address
      const orders = await dataService.getServiceOrdersByAddress(item.addressId);
      
      const fortyFiveDaysAgo = new Date();
      fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
      
      const recentFinishedOS = orders.filter(os => 
        (os.techFinalized === true || os.status === 'finalizada' || os.status === 'pre_finalizada') && 
        (os.finishedAt || os.openedAt) && 
        (new Date(os.finishedAt || os.openedAt).getTime() >= fortyFiveDaysAgo.getTime())
      );

      if (item.equipmentsText) {
        const machinesArray = item.equipmentsText.split(';').map(x => x.trim()).filter(Boolean);
        const currentChecked: Record<string, { checked: boolean; os: string }> = { ...(item.checkedEquipments || {}) };
        
        let changed = false;

        machinesArray.forEach((mach, idx) => {
          const eqKey = `${idx}_${mach}`;
          const cleanName = mach.includes('_') ? mach.substring(mach.indexOf('_') + 1) : mach;
          const config = currentChecked[eqKey] || currentChecked[cleanName] || { checked: false, os: '' };
          
          if (config.os && config.os.trim() !== '') {
            // Se a máquina já tem uma O.S. cadastrada, valida o status real dessa O.S.
            const matchedOS = orders.find(o => (o.osNumber || '').trim().toUpperCase() === config.os.trim().toUpperCase());
            if (matchedOS) {
              const isFinishedByTech = matchedOS.techFinalized === true || matchedOS.status === 'finalizada' || matchedOS.status === 'pre_finalizada';
              if (config.checked !== isFinishedByTech) {
                currentChecked[eqKey] = { ...config, checked: isFinishedByTech };
                changed = true;
                if (isFinishedByTech) syncedCount++;
              }
            }
          } else {
            // Se o campo de O.S. está em branco, busca se houve alguma O.S. finalizada recente para este equipamento
            const sectorMatch = mach.match(/\(([^)]+)\)/);
            const targetSector = sectorMatch ? sectorMatch[1].trim().toUpperCase() : '';

            const matchedOS = recentFinishedOS.find(os => {
              if (targetSector) {
                if (os.equipmentSector && os.equipmentSector.toUpperCase() === targetSector) return true;
                if (os.description && os.description.toUpperCase().includes(targetSector)) return true;
              }
              if (os.equipmentName && mach.toUpperCase().includes(os.equipmentName.toUpperCase())) return true;
              if (os.equipmentBtus && mach.toUpperCase().includes(os.equipmentBtus.toUpperCase())) return true;
              return false;
            });

            if (matchedOS) {
              currentChecked[eqKey] = { checked: true, os: matchedOS.osNumber || 'Sem Num' };
              changed = true;
              syncedCount++;
            }
          }
        });

        if (changed) {
          // Calculate new status
          const checkedCount = machinesArray.filter((mach, index) => {
            const k = `${index}_${mach}`;
            return (currentChecked[k] || currentChecked[mach])?.checked;
          }).length;
          
          const uniqueOsList = Array.from(
            new Set(
              Object.values(currentChecked)
                .filter(val => val.os && val.os.trim() !== '')
                .map(val => val.os.trim())
            )
          ).filter(Boolean);
          const updatedServiceOrders = uniqueOsList.join(', ');

          const allChecked = machinesArray.length > 0 && checkedCount === machinesArray.length;
          const newStatus = allChecked ? 'Concluído' : (checkedCount > 0 || uniqueOsList.length > 0) ? 'Em Andamento' : 'Pendente';

          await dataService.updateJettingControl(item.id, {
            checkedEquipments: currentChecked,
            serviceOrders: updatedServiceOrders,
            status: newStatus
          });

          setItems(prev => prev.map(i => {
            if (i.id !== item.id) return i;
            return {
              ...i,
              checkedEquipments: currentChecked,
              serviceOrders: updatedServiceOrders,
              status: newStatus
            };
          }));
        }
      }
      
      if (!isBulkSync && syncedCount > 0) {
        alert(`Sincronização concluída! ${syncedCount} máquina(s) atendida(s) identificada(s).`);
      } else if (!isBulkSync) {
        alert('Sincronização concluída! Os status das O.S. foram atualizados com sucesso.');
      }
    } catch (e) {
      console.error('Erro ao sincronizar OS do endereço:', e);
      if (!isBulkSync) alert('Erro ao sincronizar O.S. Tente novamente.');
    } finally {
      setSyncingIds(prev => ({ ...prev, [item.id!]: false }));
    }
    return { syncedCount };
  };

  const handleSyncAllRowsOS = async () => {
    if (!window.confirm('Deseja buscar O.S. finalizadas nos últimos 45 dias para TODOS os endereços listados e atualizar os checklists?')) {
      return;
    }
    setIsSyncingAll(true);
    try {
      let totalSynced = 0;
      // Filter out items that are already Concluído
      const itemsToSync = items.filter(i => i.status !== 'Concluído');
      
      for (const item of itemsToSync) {
        const result = await handleSyncRowOS(item, true);
        totalSynced += result.syncedCount;
      }
      
      alert(`Sincronização global concluída! Total de ${totalSynced} máquina(s) pendente(s) marcada(s) como feita(s).`);
    } catch (e) {
      console.error('Erro ao sincronizar todos os itens:', e);
      alert('Erro durante a sincronização em lote.');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro do Centro de Jateamento?')) {
      return;
    }
    
    try {
      await dataService.deleteJettingControl(id);
      setItems(prev => prev.filter(item => item.id !== id));
    } catch (e) {
      console.error('Erro ao excluir item:', e);
    }
  };

  // Toggle checked state of a machine
  const handleMachineCheckToggle = async (itemId: string, eqKey: string, isChecked: boolean) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;

      const currentChecked: Record<string, { checked: boolean; os: string }> = { ...(item.checkedEquipments || {}) };
      const cleanName = eqKey.includes('_') ? eqKey.substring(eqKey.indexOf('_') + 1) : eqKey;
      const machineState = { ...(currentChecked[eqKey] || currentChecked[cleanName] || { checked: false, os: '' }) };
      
      machineState.checked = isChecked;

      currentChecked[eqKey] = machineState;
      if (currentChecked[cleanName] && cleanName !== eqKey) {
        delete currentChecked[cleanName];
      }

      // Auto-calculate unique O.S. string
      const uniqueOsList = Array.from(
        new Set(
          Object.values(currentChecked)
            .filter(v => v.os && v.os.trim() !== '')
            .map(v => v.os.trim())
        )
      ).filter(Boolean);
      const updatedServiceOrders = uniqueOsList.join(', ');

      // Auto-calculate overall status
      const machinesArray = item.equipmentsText.split(';').map(x => x.trim()).filter(Boolean);
      const checkedCount = machinesArray.filter((mach, index) => {
        const k = `${index}_${mach}`;
        const config = currentChecked[k] || currentChecked[mach];
        return config?.checked;
      }).length;
      
      const allChecked = machinesArray.length > 0 && checkedCount === machinesArray.length;
      const hasAnyOs = uniqueOsList.length > 0;
      const newStatus = allChecked ? 'Concluído' : (checkedCount > 0 || hasAnyOs) ? 'Em Andamento' : 'Pendente';

      // Async write to database
      dataService.updateJettingControl(itemId, {
        checkedEquipments: currentChecked,
        serviceOrders: updatedServiceOrders,
        status: newStatus
      }).catch(err => console.error('Erro ao salvar check do equipamento:', err));

      // Also update editingValues
      setEditingValues(prev => {
        const existing = prev[itemId] || { serviceOrders: '', notes: '' };
        return {
          ...prev,
          [itemId]: {
            ...existing,
            serviceOrders: updatedServiceOrders
          }
        };
      });

      return {
        ...item,
        checkedEquipments: currentChecked,
        serviceOrders: updatedServiceOrders,
        status: newStatus
      };
    }));
  };

  // Change O.S. of a single machine
  const handleMachineOsChange = async (itemId: string, eqKey: string, osValue: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;

      const currentChecked: Record<string, { checked: boolean; os: string }> = { ...(item.checkedEquipments || {}) };
      const cleanName = eqKey.includes('_') ? eqKey.substring(eqKey.indexOf('_') + 1) : eqKey;
      const machineState = { ...(currentChecked[eqKey] || currentChecked[cleanName] || { checked: false, os: '' }) };
      
      // Apenas define o número da O.S. NÃO altera o checklist para true! O checklist só é preenchido quando o técnico finaliza a O.S.!
      machineState.os = osValue;

      currentChecked[eqKey] = machineState;
      if (currentChecked[cleanName] && cleanName !== eqKey) {
        delete currentChecked[cleanName];
      }

      // Auto-calculate unique O.S. string
      const uniqueOsList = Array.from(
        new Set(
          Object.values(currentChecked)
            .filter(v => v.os && v.os.trim() !== '')
            .map(v => v.os.trim())
        )
      ).filter(Boolean);
      const updatedServiceOrders = uniqueOsList.join(', ');

      // Auto-calculate overall status
      const machinesArray = item.equipmentsText.split(';').map(x => x.trim()).filter(Boolean);
      const checkedCount = machinesArray.filter((mach, index) => {
        const k = `${index}_${mach}`;
        const config = currentChecked[k] || currentChecked[mach];
        return config?.checked;
      }).length;
      
      const allChecked = machinesArray.length > 0 && checkedCount === machinesArray.length;
      const hasAnyOs = uniqueOsList.length > 0;
      const newStatus = allChecked ? 'Concluído' : (checkedCount > 0 || hasAnyOs) ? 'Em Andamento' : 'Pendente';

      // Async write to database
      dataService.updateJettingControl(itemId, {
        checkedEquipments: currentChecked,
        serviceOrders: updatedServiceOrders,
        status: newStatus
      }).catch(err => console.error('Erro ao salvar OS do equipamento:', err));

      // Also update editingValues
      setEditingValues(prev => {
        const existing = prev[itemId] || { serviceOrders: '', notes: '' };
        return {
          ...prev,
          [itemId]: {
            ...existing,
            serviceOrders: updatedServiceOrders
          }
        };
      });

      return {
        ...item,
        checkedEquipments: currentChecked,
        serviceOrders: updatedServiceOrders,
        status: newStatus
      };
    }));
  };

  // Add machine manually to a row
  const handleAddMachine = async (itemId: string, newMachineName: string) => {
    if (!newMachineName.trim()) return;

    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;

      const existingList = item.equipmentsText 
        ? item.equipmentsText.split(';').map(x => x.trim()).filter(Boolean) 
        : [];
      
      const formattedMachineName = formatMachineWithPower(newMachineName.trim(), item.addressId);
      const formattedNew = formattedMachineName.trim().toUpperCase();
      if (existingList.some(m => m.toUpperCase() === formattedNew)) {
        alert("Este equipamento já está listado para este endereço!");
        return item;
      }

      existingList.push(formattedMachineName);
      const updatedText = existingList.join('; ');

      // Async write to database
      dataService.updateJettingControl(itemId, {
        equipmentsText: updatedText
      }).catch(err => console.error('Erro ao adicionar equipamento:', err));

      return {
        ...item,
        equipmentsText: updatedText
      };
    }));
  };

  // Remove a machine from a row
  const handleRemoveMachine = async (itemId: string, eqName: string, targetIdx: number) => {
    if (!window.confirm(`Deseja realmente remover o equipamento "${eqName}" deste controle?`)) {
      return;
    }

    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;

      const existingList = item.equipmentsText 
        ? item.equipmentsText.split(';').map(x => x.trim()).filter(Boolean) 
        : [];
      
      const filteredList = existingList.filter((_, idx) => idx !== targetIdx);
      const updatedText = filteredList.join('; ');

      const currentChecked: Record<string, { checked: boolean; os: string }> = { ...(item.checkedEquipments || {}) };
      
      // Shift keys of other elements down to match their new indices
      const newChecked: Record<string, { checked: boolean; os: string }> = {};
      let newIdx = 0;
      existingList.forEach((mach, oldIdx) => {
        if (oldIdx === targetIdx) return; // skip removed item
        const oldKey = `${oldIdx}_${mach}`;
        const status = currentChecked[oldKey] || currentChecked[mach];
        if (status) {
          newChecked[`${newIdx}_${mach}`] = status;
        }
        newIdx++;
      });

      // Auto-calculate unique O.S. string
      const uniqueOsList = Array.from(
        new Set(
          Object.values(newChecked)
            .filter(v => v.checked && v.os)
            .map(v => v.os.trim())
        )
      ).filter(Boolean);
      const updatedServiceOrders = uniqueOsList.join(', ');

      // Auto-calculate overall status
      const checkedCount = Object.values(newChecked).filter(v => v.checked).length;
      let newStatus = item.status;
      if (checkedCount === 0) {
        newStatus = 'Pendente';
      } else if (checkedCount === filteredList.length) {
        newStatus = 'Concluído';
      } else {
        newStatus = 'Em Andamento';
      }

      // Async write to database
      dataService.updateJettingControl(itemId, {
        equipmentsText: updatedText,
        checkedEquipments: newChecked,
        serviceOrders: updatedServiceOrders,
        status: newStatus
      }).catch(err => console.error('Erro ao remover equipamento:', err));

      // Also update editingValues
      setEditingValues(prev => {
        const existing = prev[itemId] || { serviceOrders: '', notes: '' };
        return {
          ...prev,
          [itemId]: {
            ...existing,
            serviceOrders: updatedServiceOrders
          }
        };
      });

      return {
        ...item,
        equipmentsText: updatedText,
        checkedEquipments: newChecked,
        serviceOrders: updatedServiceOrders,
        status: newStatus
      };
    }));
  };

  const openNewLocationModal = async () => {
    setIsAddingNewLocation(true);
    try {
      const [clientsList, addressesList] = await Promise.all([
        dataService.getClients(),
        dataService.getAddresses()
      ]);
      setClients(clientsList.filter(c => c.status !== 'inactive'));
      setAddresses(addressesList);
    } catch (err) {
      console.error("Erro ao carregar dados para inclusão manual:", err);
    }
  };

  const handleCreateManualJetting = async () => {
    if (!selectedAddressId) {
      alert("Por favor, selecione um endereço.");
      return;
    }

    const addr = addresses.find(a => a.id === selectedAddressId);
    const client = clients.find(c => c.id === selectedClientId);
    if (!addr || !client) return;

    const rawList = manualMachines.split(';').map(x => x.trim()).filter(Boolean);
    if (rawList.length === 0) {
      alert("Por favor, adicione pelo menos um equipamento.");
      return;
    }

    const formattedMachines = rawList.map(m => formatMachineWithPower(m, selectedAddressId).toUpperCase()).join('; ');

    setCreatingLocation(true);
    try {
      const newJetting: Omit<JettingControl, 'id'> = {
        addressId: selectedAddressId,
        clientName: client.name,
        addressStreet: `${addr.street}, ${addr.number || ''}`,
        equipmentsText: formattedMachines,
        status: 'Pendente',
        serviceOrders: '',
        notes: '',
        updatedAt: new Date().toISOString()
      };

      const newId = await dataService.addJettingControl(newJetting);
      if (newId) {
        await fetchItems(); // reload table
        setIsAddingNewLocation(false);
        // Reset states
        setSelectedClientId('');
        setSelectedAddressId('');
        setManualMachines('');
      } else {
        alert("Não foi possível salvar o registro no banco.");
      }
    } catch (err) {
      console.error("Erro ao criar controle de jateamento manual:", err);
      alert("Erro ao criar controle de jateamento manual.");
    } finally {
      setCreatingLocation(false);
    }
  };

  const availableAddresses = useMemo(() => {
    if (!selectedClientId) return [];
    return addresses.filter(addr => addr.clientId === selectedClientId);
  }, [addresses, selectedClientId]);

  const [printingIds, setPrintingIds] = useState<Record<string, boolean>>({});

  // Carregar e mapear os técnicos responsáveis pelos atendimentos que geraram estes jateamentos
  const loadTechniciansForItems = async (itemsList: JettingControl[]) => {
    const techMapUpdates: Record<string, string> = {};
    const itemsNeedingResolution = itemsList.filter(item => item.id && (!item.technicianName || item.technicianName.trim() === ''));

    // Para os itens que já possuem technicianName gravado no documento
    itemsList.forEach(item => {
      if (item.id && item.technicianName && item.technicianName.trim().length > 0) {
        techMapUpdates[item.id] = item.technicianName.trim();
      }
    });

    if (Object.keys(techMapUpdates).length > 0) {
      setTechniciansMap(prev => ({ ...prev, ...techMapUpdates }));
    }

    if (itemsNeedingResolution.length === 0) return;

    // Marcar como carregando técnico
    const loadingState: Record<string, boolean> = {};
    itemsNeedingResolution.forEach(it => { if (it.id) loadingState[it.id] = true; });
    setLoadingTechs(prev => ({ ...prev, ...loadingState }));

    // Resolver técnicos para cada item pendente
    await Promise.allSettled(
      itemsNeedingResolution.map(async (item) => {
        if (!item.id) return;
        try {
          let rec: MaintenanceRecord | null = null;
          
          // 1. Tenta buscar pelo recordId
          if (item.recordId) {
            rec = await dataService.getRecordById(item.recordId);
          }

          // 2. Se não achou ou não tem técnico no record, busca pelo mês
          if (!rec || (!rec.technician1 && !rec.technician2)) {
            if (item.month) {
              const mRecs = await dataService.getRecords(item.month);
              const found = mRecs.find(r => r.addressId === item.addressId && (r.technician1 || r.technician2));
              if (found) rec = found;
            }
          }

          // 3. Se ainda assim não encontrou, busca no histórico do endereço
          if (!rec || (!rec.technician1 && !rec.technician2)) {
            const addrRecs = await dataService.getRecordsByAddress(item.addressId);
            if (addrRecs && addrRecs.length > 0) {
              const withTech = addrRecs.find(r => 
                (r.technician1 || r.technician2) && 
                (r.status === MaintenanceStatus.COMPLETED || r.status === MaintenanceStatus.PRE_COMPLETED || (r.checklist && r.checklist.some(c => c.checked || c.notes)))
              ) || addrRecs.find(r => r.technician1 || r.technician2);
              if (withTech) rec = withTech;
            }
          }

          // 4. Se não achou, tenta no array records prop
          if (!rec && records && records.length > 0) {
            rec = records.find(r => r.addressId === item.addressId && (r.technician1 || r.technician2)) || null;
          }

          if (rec && (rec.technician1 || rec.technician2)) {
            const techStr = [rec.technician1, rec.technician2].filter(Boolean).join(' / ');
            setTechniciansMap(prev => ({ ...prev, [item.id!]: techStr }));
            // Atualiza silenciosamente no banco para ficar salvo permanentemente
            dataService.updateJettingControl(item.id, { technicianName: techStr }).catch(() => {});
          }
        } catch (err) {
          console.warn('Erro ao resolver técnico do jateamento:', item.id, err);
        } finally {
          setLoadingTechs(prev => ({ ...prev, [item.id!]: false }));
        }
      })
    );
  };

  // Abrir visualização e impressão do documento PMOC
  const handleOpenPMOCDocument = async (item: JettingControl) => {
    const itemId = item.id || '';
    setLoadingPMOCId(itemId);
    
    try {
      let matchingRecord: MaintenanceRecord | null = null;
      
      // 1. Tenta buscar pelo ID exato do registro que originou o jateamento
      if (item.recordId) {
        const originRec = await dataService.getRecordById(item.recordId);
        if (originRec && originRec.addressId === item.addressId) {
          matchingRecord = originRec;
        }
      }

      // 2. Se não encontrou ou se o registro pelo ID não tiver checklist/técnico, busca pelo mês de origem do jateamento
      if (!matchingRecord || (!matchingRecord.checklist?.length && !matchingRecord.technician1)) {
        if (item.month) {
          const monthRecords = await dataService.getRecords(item.month);
          const foundInMonth = monthRecords.filter(r => r.addressId === item.addressId);
          if (foundInMonth.length > 0) {
            // Prioriza o registro que tem checklist preenchido ou técnico/assinatura
            const filled = foundInMonth.find(r => 
              (r.checklist && r.checklist.some(c => c.checked || c.notes)) || 
              r.status === MaintenanceStatus.COMPLETED || 
              r.status === MaintenanceStatus.PRE_COMPLETED ||
              r.technician1 || 
              r.clientSignature
            );
            if (filled) {
              matchingRecord = filled;
            } else if (!matchingRecord) {
              matchingRecord = foundInMonth[0];
            }
          }
        }
      }

      // 3. Se ainda assim não encontrou um registro com dados de atendimento, busca no histórico completo do endereço
      if (!matchingRecord || (!matchingRecord.checklist?.some(c => c.checked || c.notes) && !matchingRecord.technician1)) {
        const addressRecords = await dataService.getRecordsByAddress(item.addressId);
        if (addressRecords && addressRecords.length > 0) {
          const scoredRecords = [...addressRecords].map(r => {
            let score = 0;
            const hasCheckedOrNotes = r.checklist && r.checklist.some(c => c.checked || c.notes);
            if (hasCheckedOrNotes) score += 100;
            if (r.status === MaintenanceStatus.COMPLETED) score += 50;
            if (r.status === MaintenanceStatus.PRE_COMPLETED) score += 40;
            if (r.clientSignature || r.techSignature) score += 30;
            if (r.technician1 || r.technician2) score += 20;
            if (item.month && r.month === item.month) score += 15;
            if (r.executionDate) score += 10;
            return { record: r, score };
          });

          scoredRecords.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return (b.record.month || '').localeCompare(a.record.month || '');
          });

          if (scoredRecords[0] && scoredRecords[0].score > 0) {
            matchingRecord = scoredRecords[0].record;
          } else if (!matchingRecord) {
            matchingRecord = addressRecords[0];
          }
        }
      }

      // 4. Se não achou em nenhum lugar acima, tenta no array de records recebido por prop
      if (!matchingRecord && records && records.length > 0) {
        matchingRecord = records.find(r => r.addressId === item.addressId) || null;
      }
      
      // Se ainda não existir registro físico (ex: jateamento incluído manualmente), monta modelo virtual estruturado
      if (!matchingRecord) {
        matchingRecord = {
          id: item.recordId || `manual-${item.id}`,
          month: item.month || format(new Date(), 'yyyy-MM'),
          addressId: item.addressId,
          scheduledWeek: 1,
          status: MaintenanceStatus.COMPLETED,
          technician1: item.technicianName || techniciansMap[itemId] || 'Equipe Técnica',
          routeNotes: item.notes || '',
          executionDate: new Date().toISOString()
        };
      }

      // Buscar dados de endereço, cliente e equipamentos
      const [addrList, clientList, equipList] = await Promise.all([
        addresses.length > 0 ? Promise.resolve(addresses) : dataService.getAddresses(),
        clients.length > 0 ? Promise.resolve(clients) : dataService.getClients(),
        dataService.getEquipments(item.addressId, true)
      ]);

      const targetAddress = addrList.find(a => a.id === item.addressId) || null;
      const targetClient = targetAddress ? clientList.find(c => c.id === targetAddress.clientId) : (clientList.find(c => c.name === item.clientName) || null);

      setPmocModalData({
        record: matchingRecord,
        address: targetAddress,
        client: targetClient,
        equipments: equipList || []
      });

    } catch (e) {
      console.error("Erro ao obter folha de atendimento PMOC:", e);
      alert("Ocorreu um erro ao buscar os dados da folha de atendimento PMOC.");
    } finally {
      setLoadingPMOCId(null);
    }
  };

  const handlePrintChecklist = async (item: JettingControl) => {
    handleOpenPMOCDocument(item);
  };

  // Filtered and searched records
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      
      const searchLower = searchQuery.toLowerCase();
      const rawMachines = item.equipmentsText ? item.equipmentsText.split(';').map(x => x.trim()).filter(Boolean) : [];
      const formattedMachinesText = rawMachines.map(m => formatMachineWithPower(m, item.addressId)).join('; ');

      const matchSearch = 
        item.clientName.toLowerCase().includes(searchLower) ||
        item.addressStreet.toLowerCase().includes(searchLower) ||
        item.equipmentsText.toLowerCase().includes(searchLower) ||
        formattedMachinesText.toLowerCase().includes(searchLower) ||
        (item.serviceOrders && item.serviceOrders.toLowerCase().includes(searchLower)) ||
        (item.notes && item.notes.toLowerCase().includes(searchLower));
        
      return matchStatus && matchSearch;
    });
  }, [items, searchQuery, statusFilter, equipmentsByAddress]);

  const countByStatus = useMemo(() => {
    return {
      all: items.length,
      pending: items.filter(i => i.status === 'Pendente').length,
      progress: items.filter(i => i.status === 'Em Andamento').length,
      completed: items.filter(i => i.status === 'Concluído').length,
    };
  }, [items]);

  const totalMachinesStats = useMemo(() => {
    let total = 0;
    let pending = 0;
    let completed = 0;

    items.forEach(item => {
      const machinesArray = item.equipmentsText 
        ? item.equipmentsText.split(';').map(x => x.trim()).filter(Boolean) 
        : [];
      
      machinesArray.forEach((mach, idx) => {
        total++;
        const eqKey = `${idx}_${mach}`;
        const config = item.checkedEquipments?.[eqKey] || item.checkedEquipments?.[mach] || { checked: false, os: '' };
        if (config.checked) {
          completed++;
        } else {
          pending++;
        }
      });
    });

    return { total, pending, completed };
  }, [items]);

  const formatItemDate = (updatedAt: any) => {
    if (!updatedAt) return '';
    try {
      if (updatedAt.seconds) {
        return format(new Date(updatedAt.seconds * 1000), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      }
      return format(parseISO(updatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return '';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden font-sans">
      {/* Upper header summary panel */}
      <div className="p-6 bg-linear-to-r from-gray-50 to-white border-b border-gray-100">
        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-6">
          <div>
            <h2 className="text-xl font-extrabold text-gray-800 tracking-tight flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-amber-500 animate-spin-slow" />
              Centro de Controle de Jateamento
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Gerencie lavagens de alta pressão e atendimentos corretivos complexos identificados nas escolas.
            </p>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 max-w-3xl">
            <div className="p-3 rounded-xl border border-amber-100 bg-amber-50/40 text-amber-950 shadow-2xs">
              <span className="text-[10px] font-black uppercase tracking-wider block text-amber-700">Falta Jatear</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-black">{totalMachinesStats.pending}</span>
                <span className="text-[10px] font-bold text-amber-600">/ {totalMachinesStats.total} máq.</span>
              </div>
            </div>

            <button 
              onClick={() => setStatusFilter('all')}
              className={`p-3 rounded-xl border text-left transition-all ${
                statusFilter === 'all' 
                  ? 'bg-gray-900 border-gray-900 text-white shadow-xs' 
                  : 'bg-white border-gray-150 hover:bg-gray-50 text-gray-700'
              }`}
            >
              <span className="text-[10px] font-black uppercase tracking-wider block opacity-70">Total</span>
              <span className="text-xl font-black mt-1 block">{countByStatus.all}</span>
            </button>

            <button 
              onClick={() => setStatusFilter('Pendente')}
              className={`p-3 rounded-xl border text-left transition-all ${
                statusFilter === 'Pendente' 
                  ? 'bg-amber-600 border-amber-600 text-white shadow-xs' 
                  : 'bg-white border-gray-150 hover:bg-gray-50 text-gray-700'
              }`}
            >
              <span className="text-[10px] font-black uppercase tracking-wider block opacity-70">Pendente</span>
              <span className="text-xl font-black mt-1 block">{countByStatus.pending}</span>
            </button>

            <button 
              onClick={() => setStatusFilter('Em Andamento')}
              className={`p-3 rounded-xl border text-left transition-all ${
                statusFilter === 'Em Andamento' 
                  ? 'bg-blue-600 border-blue-600 text-white shadow-xs' 
                  : 'bg-white border-gray-150 hover:bg-gray-50 text-gray-700'
              }`}
            >
              <span className="text-[10px] font-black uppercase tracking-wider block opacity-70">Em Curso</span>
              <span className="text-xl font-black mt-1 block">{countByStatus.progress}</span>
            </button>

            <button 
              onClick={() => setStatusFilter('Concluído')}
              className={`p-3 rounded-xl border text-left transition-all ${
                statusFilter === 'Concluído' 
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs' 
                  : 'bg-white border-gray-150 hover:bg-gray-50 text-gray-700'
              }`}
            >
              <span className="text-[10px] font-black uppercase tracking-wider block opacity-70">Concluído</span>
              <span className="text-xl font-black mt-1 block">{countByStatus.completed}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Control Actions & Search */}
      <div className="p-4 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Pesquisar por cliente, endereço, máquinas, O.S. ou observação..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
          />
        </div>

        <button 
          onClick={openNewLocationModal}
          className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs shrink-0"
        >
          <Plus className="w-4 h-4" />
          Adicionar Novo Local
        </button>

        <button 
          onClick={handleSyncAllRowsOS}
          disabled={isSyncingAll}
          className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isSyncingAll && "animate-spin")} />
          {isSyncingAll ? 'Sincronizando...' : 'Sincronizar O.S. Automático'}
        </button>
        <button 
          onClick={fetchItems}
          className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar Tabela
        </button>
      </div>

      {/* Table Panel */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-gray-400">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-xs font-bold mt-4">Buscando central de jateamento do servidor...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center text-gray-400 max-w-md mx-auto">
            <AlertCircle className="w-12 h-12 text-gray-300" />
            <h3 className="text-sm font-black text-gray-700 mt-4 uppercase tracking-wider">Nenhum Atendimento Encontrado</h3>
            <p className="text-xs font-medium mt-1 leading-relaxed">
              Não há atendimentos de jateamento ou lavagem pendentes nesta categoria. Os registros entram aqui automaticamente ao homologar ou finalizar atendimentos que possuam observações preenchidas nas máquinas.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[950px]">
            <thead>
              <tr className="bg-gray-100/50 border-b border-gray-150 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                <th className="p-4 pl-6">Cliente / Local</th>
                <th className="p-4 w-[380px]">Equipamentos e Checklist de Atendimento</th>
                <th className="p-4 w-44">Status Geral</th>
                <th className="p-4">Observações</th>
                <th className="p-4 text-center w-32">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              <AnimatePresence initial={false}>
                {filteredItems.map((item) => {
                  const id = item.id!;
                  const isSaving = savingIds[id] || false;
                  const isSaved = savedFeedback[id] || false;
                  const editing = editingValues[id] || { serviceOrders: '', notes: '' };

                  // Detect if there are unsaved changes
                  const isDirty = 
                    editing.serviceOrders !== (item.serviceOrders || '') ||
                    editing.notes !== (item.notes || '');

                  const machinesArray = item.equipmentsText ? item.equipmentsText.split(';').map(x => x.trim()).filter(Boolean) : [];

                  const checkedCount = machinesArray.filter((eq, idx) => {
                    const eqKey = `${idx}_${eq.trim()}`;
                    const config = item.checkedEquipments?.[eqKey] || item.checkedEquipments?.[eq.trim()] || { checked: false, os: '' };
                    return config.checked;
                  }).length;
                  const pendingCount = machinesArray.length - checkedCount;

                  // Identificar máquinas que estão com o campo de número da O.S. em branco (precisam ser geradas)
                  const machinesWithoutOs = machinesArray.map((eq, idx) => {
                    const clean = eq.trim();
                    const match = clean.match(/\[ID:([^\]]+)\]/);
                    const equipmentId = match ? match[1] : undefined;
                    return {
                      name: formatMachineWithPower(clean, item.addressId),
                      index: idx,
                      eqKey: `${idx}_${clean}`,
                      equipmentId
                    };
                  }).filter(m => {
                    const clean = m.eqKey.substring(m.eqKey.indexOf('_') + 1);
                    const config = item.checkedEquipments?.[m.eqKey] || item.checkedEquipments?.[clean] || { checked: false, os: '' };
                    return !config.os || config.os.trim() === '';
                  });

                  return (
                    <motion.tr 
                      key={id}
                      layoutId={`jetting-${id}`}
                      className="hover:bg-gray-50/50 transition-colors group"
                    >
                      {/* Cliente e endereço */}
                      <td className="p-4 pl-6 align-top">
                        <div className="font-extrabold text-gray-800 text-sm">{item.clientName}</div>
                        <div className="text-gray-400 text-[10px] font-semibold mt-0.5 max-w-xs truncate" title={item.addressStreet}>
                          {item.addressStreet}
                        </div>

                        {/* Técnico que realizou o atendimento que gerou os jateamentos */}
                        {(() => {
                          const techName = item.technicianName || techniciansMap[id] || (loadingTechs[id] ? 'Identificando...' : null);
                          return techName ? (
                            <div 
                              className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-slate-700 bg-slate-100/90 border border-slate-200/80 rounded px-2 py-0.5 w-fit max-w-[280px] truncate"
                              title={`Técnico responsável pelo atendimento: ${techName}`}
                            >
                              <User className="w-3 h-3 text-blue-600 shrink-0" />
                              <span className="text-slate-500 font-semibold">Técnico:</span>
                              <span className="text-slate-900 font-extrabold truncate">
                                {techName}
                              </span>
                            </div>
                          ) : null;
                        })()}

                        <span className="inline-block text-[9px] font-bold text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 mt-2">
                          Atu.: {formatItemDate(item.updatedAt)}
                        </span>
                        {item.serviceOrders && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            <span className="text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1 py-0.5" title="Ordens de serviço ativas nesta escola">
                              O.S.: {item.serviceOrders}
                            </span>
                          </div>
                        )}
                        {onGenerateOS && (
                          <div className="mt-3 space-y-2">
                            <button
                              onClick={() => {
                                const targetMachines = machinesWithoutOs.length > 0 
                                  ? machinesWithoutOs.map(m => m.name) 
                                  : machinesArray.map(m => formatMachineWithPower(m.trim(), item.addressId));
                                onGenerateOS(item, targetMachines);
                              }}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors shadow-xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Gerar Nova O.S.
                            </button>
                            {onGenerateBatchOS && machinesWithoutOs.length > 0 && (
                              <button
                                onClick={() => {
                                  onGenerateBatchOS(item, machinesWithoutOs);
                                }}
                                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors shadow-xs"
                                title="Gerar O.S. em lote para as máquinas que estão com o campo de número de O.S. em branco"
                              >
                                <ListPlus className="w-3.5 h-3.5" />
                                Gerar O.S. em Lote ({machinesWithoutOs.length})
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Equipamentos marcados - Scrollable Container */}
                      <td className="p-4 align-top">
                        <div className="flex flex-col gap-1.5">
                          {/* Machine Count and Status Summary */}
                          <div className="flex items-center justify-between px-1 text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">
                            <span>{machinesArray.length} {machinesArray.length === 1 ? 'Máquina' : 'Máquinas'}</span>
                            {pendingCount > 0 ? (
                              <span className="text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.2">
                                {pendingCount} {pendingCount === 1 ? 'pendente' : 'pendentes'}
                              </span>
                            ) : (
                              <span className="text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.2 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Tudo OK
                              </span>
                            )}
                          </div>

                          <div className="max-h-48 overflow-y-auto pr-1 border border-gray-100 rounded-lg p-1 bg-slate-50/30 space-y-1 custom-scrollbar w-[360px]">
                            {machinesArray.length === 0 ? (
                              <p className="text-[11px] text-gray-400 italic p-2 text-center">Nenhuma máquina listada</p>
                            ) : (
                              machinesArray.map((eq, idx) => {
                                const cleanName = eq.trim();
                                const eqKey = `${idx}_${cleanName}`;
                                const config = item.checkedEquipments?.[eqKey] || item.checkedEquipments?.[cleanName] || { checked: false, os: '' };
                                const isChecked = config.checked;
                                const displayMachine = formatMachineWithPower(cleanName, item.addressId);

                                return (
                                  <div 
                                    key={idx} 
                                    className={cn(
                                      "flex items-center justify-between gap-1.5 p-1 rounded-md border transition-all",
                                      isChecked 
                                        ? "bg-emerald-50/50 border-emerald-100" 
                                        : config.os 
                                          ? "bg-blue-50/30 border-blue-100" 
                                          : "bg-white border-slate-100 hover:border-slate-200"
                                    )}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => handleMachineCheckToggle(id, eqKey, e.target.checked)}
                                        className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                                      />
                                      <span 
                                        className={cn(
                                          "text-[11px] font-bold truncate transition-all notranslate", 
                                          isChecked ? "text-emerald-800/75 line-through decoration-emerald-500/30" : "text-gray-700"
                                        )} 
                                        translate="no"
                                        title={displayMachine}
                                      >
                                        {displayMachine}
                                      </span>
                                    </div>
                                    
                                    <div className="flex items-center gap-1 shrink-0">
                                      <input
                                        type="text"
                                        placeholder="Nº O.S."
                                        value={config.os || ''}
                                        disabled={Boolean(config.os && config.os.trim() !== '')}
                                        readOnly={Boolean(config.os && config.os.trim() !== '')}
                                        onChange={(e) => handleMachineOsChange(id, eqKey, e.target.value)}
                                        className={cn(
                                          "w-14 px-1 py-0.5 text-[9px] font-extrabold placeholder:text-gray-300 border rounded outline-none transition-all text-center",
                                          config.os && config.os.trim() !== ''
                                            ? isChecked
                                              ? "bg-emerald-50 border-emerald-200 text-emerald-800 cursor-not-allowed select-text shadow-2xs"
                                              : "bg-blue-50/80 border-blue-200 text-blue-700 cursor-not-allowed select-text shadow-2xs font-black"
                                            : "bg-white border-slate-200 text-gray-700 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                                        )}
                                        title={
                                          config.os && config.os.trim() !== ''
                                            ? isChecked
                                              ? `O.S. ${config.os} (Finalizada pelo técnico - vínculo protegido)`
                                              : `O.S. ${config.os} gerada e vinculada à ordem originária (bloqueada para manter a integridade)`
                                            : 'Sem O.S. vinculada'
                                        }
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveMachine(id, cleanName, idx)}
                                        className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                        title="Remover máquina"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* Quick manual equipment adder inside row */}
                          <div className="flex items-center gap-1.5 max-w-[360px]">
                            <input
                              type="text"
                              placeholder="Ex: 12.000 BTUs (SALA 1)..."
                              id={`add-eq-${id}`}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const target = e.target as HTMLInputElement;
                                  if (target.value.trim()) {
                                    handleAddMachine(id, target.value.trim());
                                    target.value = '';
                                  }
                                }
                              }}
                              className="flex-1 px-2.5 py-1 text-xs font-semibold text-gray-750 bg-white border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-gray-350"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const input = document.getElementById(`add-eq-${id}`) as HTMLInputElement;
                                if (input && input.value.trim()) {
                                  handleAddMachine(id, input.value.trim());
                                  input.value = '';
                                }
                              }}
                              className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-extrabold text-xs flex items-center gap-1 shrink-0"
                            >
                              <Plus className="w-3 h-3" />
                              Add
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Status select dropdown */}
                      <td className="p-4 align-top">
                        <div className="relative">
                          <select
                            value={item.status}
                            onChange={(e) => handleStatusChange(id, e.target.value as any)}
                            className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-extrabold cursor-pointer outline-none transition-all ${
                              item.status === 'Pendente' 
                                ? 'bg-amber-50 border-amber-200 text-amber-800 focus:border-amber-400' 
                                : item.status === 'Em Andamento'
                                ? 'bg-blue-50 border-blue-200 text-blue-800 focus:border-blue-400'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-800 focus:border-emerald-400'
                            }`}
                          >
                            <option value="Pendente">🟡 Pendente</option>
                            <option value="Em Andamento">🔵 Em Curso</option>
                            <option value="Concluído">🟢 Concluído</option>
                          </select>
                        </div>
                      </td>

                      {/* Observação / Notas text area (Inline edit) */}
                      <td className="p-4 align-top">
                        <textarea
                          placeholder="Notas ou detalhes do atendimento administrativo..."
                          value={editing.notes}
                          rows={3}
                          onChange={(e) => handleInputChange(id, 'notes', e.target.value)}
                          onBlur={() => isDirty && handleSaveInline(id)}
                          className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-y placeholder:text-gray-300 placeholder:font-normal min-h-[48px]"
                        />
                      </td>

                      {/* Ações */}
                      <td className="p-4 align-top text-center">
                        <div className="flex items-center justify-center gap-1.5 font-sans">
                          {!isDirty && (
                            <button
                              type="button"
                              onClick={() => handleOpenPMOCDocument(item)}
                              disabled={loadingPMOCId === id}
                              className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50"
                              title="Visualizar e Imprimir Documento PMOC que gerou estes jateamentos"
                            >
                              {loadingPMOCId === id ? (
                                <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                              ) : (
                                <Printer className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          {isDirty ? (
                            <button
                              onClick={() => handleSaveInline(id)}
                              disabled={isSaving}
                              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-xs flex items-center justify-center gap-1"
                              title="Salvar alterações"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-black uppercase">Salvar</span>
                            </button>
                          ) : isSaved ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 rounded px-2 py-1">
                              <Check className="w-3.5 h-3.5 shrink-0" />
                              Salvo!
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => handleSyncRowOS(item)}
                                disabled={syncingIds[id] || isSyncingAll}
                                className="p-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-50"
                                title="Buscar O.S. finalizadas recentes para este endereço"
                              >
                                <RefreshCw className={cn("w-4 h-4", syncingIds[id] && "animate-spin")} />
                              </button>
                              <button
                                onClick={() => handleDelete(id)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                title="Excluir do controle"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>

      {/* Manual Location Modal */}
      {isAddingNewLocation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-150 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-500" />
                Novo Atendimento Manual
              </h3>
              <button 
                onClick={() => setIsAddingNewLocation(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              Adicione manualmente um novo local ao painel de controle de jateamento para agendar atendimentos de limpeza corretiva.
            </p>

            <div className="space-y-3.5">
              {/* Client select */}
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">Cliente</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => {
                    setSelectedClientId(e.target.value);
                    setSelectedAddressId('');
                  }}
                  className="w-full px-3.5 py-2 bg-white border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl outline-none font-bold text-xs text-gray-850"
                >
                  <option value="">Selecione um cliente...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Address select */}
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">Endereço / Prédio</label>
                <select
                  value={selectedAddressId}
                  disabled={!selectedClientId}
                  onChange={(e) => setSelectedAddressId(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl outline-none font-bold text-xs text-gray-850 disabled:opacity-50"
                >
                  <option value="">Selecione um endereço...</option>
                  {availableAddresses.map(a => (
                    <option key={a.id} value={a.id}>{a.street}, {a.number || 'S/N'}</option>
                  ))}
                </select>
              </div>

              {/* Equipments input */}
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">Equipamentos para Jateamento (separados por ";" )</label>
                <textarea
                  placeholder="Ex: 12.000 BTUs (SALA 1); 18.000 BTUs (SALA 2); 30.000 BTUs (RECEPÇÃO)"
                  value={manualMachines}
                  onChange={(e) => setManualMachines(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2 bg-white border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl outline-none font-semibold text-xs text-gray-800 placeholder:text-gray-300"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsAddingNewLocation(false)}
                className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 font-bold text-xs rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateManualJetting}
                disabled={creatingLocation || !selectedAddressId}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {creatingLocation ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Salvar Local
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Visualização e Impressão do Documento PMOC */}
      {pmocModalData && (
        <PMOCDocumentViewerModal
          record={pmocModalData.record}
          address={pmocModalData.address}
          client={pmocModalData.client}
          equipments={pmocModalData.equipments}
          onClose={() => setPmocModalData(null)}
          onPrint={() => {
            if (onPrintChecklist) {
              onPrintChecklist(pmocModalData.record);
            } else {
              window.print();
            }
          }}
        />
      )}
    </div>
  );
}
