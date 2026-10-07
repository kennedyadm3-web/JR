import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  MapPin, 
  Plus, 
  Trash2, 
  Edit3, 
  X, 
  TrendingUp, 
  Box, 
  Users, 
  User, 
  AlertCircle, 
  CheckCircle2, 
  Search, 
  Clock, 
  RotateCcw, 
  ExternalLink, 
  CreditCard, 
  Upload, 
  FileSpreadsheet, 
  AlertTriangle, 
  Check, 
  FileText,
  Power,
  PowerOff,
  Sparkles
} from 'lucide-react';
import { dataService, normalizeAddressText } from '../services/dataService';
import { Client, Address, Technician, RouteConfiguration, TravelCard, Equipment, RouteType } from '../types';
import { db } from '../lib/firebase';
import { writeBatch, collection, getDocs, doc, serverTimestamp } from 'firebase/firestore';
import { SEB_EQUIPMENTS } from '../lib/seb-equipments';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';

const getMapsUrl = (coordinates: string) => {
  if (!coordinates) return '';
  const trimmed = coordinates.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
};

export default function RegistrationView() {
  const [activeTab, setActiveTab] = useState<'overview' | 'clients' | 'addresses' | 'techs' | 'cards' | 'equipments'>('overview');
  const [clients, setClients] = useState<Client[]>([]);
  const [inactiveClients, setInactiveClients] = useState<Client[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressStatusFilter, setAddressStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [techs, setTechs] = useState<Technician[]>([]);
  const [cards, setCards] = useState<TravelCard[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [routeConfigs, setRouteConfigs] = useState<RouteConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [confirmModal, setConfirmModal] = useState<{
    id: string;
    type: 'client' | 'address' | 'tech' | 'card' | 'equipment' | 'deactivate_address' | 'reactivate_address';
    name: string;
  } | null>(null);

  // Forms states
  const [newClientName, setNewClientName] = useState('');
  const [newClientBilling, setNewClientBilling] = useState('');
  const [newClientBillingDay, setNewClientBillingDay] = useState<string>('');
  const [newClientContractCycle, setNewClientContractCycle] = useState<string>('1');
  
  const [newAddrStreet, setNewAddrStreet] = useState('');
  const [newAddrRoute, setNewAddrRoute] = useState('');
  const [newAddrClientId, setNewAddrClientId] = useState('');
  const [newAddrMachines, setNewAddrMachines] = useState(0);
  const [newAddrCoordinates, setNewAddrCoordinates] = useState('');
  const [newAddrCep, setNewAddrCep] = useState('');
  const [newAddrStatus, setNewAddrStatus] = useState<'active' | 'inactive'>('active');

  const [newTechName, setNewTechName] = useState('');
  const [newTechPin, setNewTechPin] = useState('');

  const [newCardLastFourDigits, setNewCardLastFourDigits] = useState('');
  const [newCardBank, setNewCardBank] = useState('');
  const [newCardHolderName, setNewCardHolderName] = useState('');

  // Equipment states
  const [selectedClientForEquip, setSelectedClientForEquip] = useState('');
  const [selectedAddressForEquip, setSelectedAddressForEquip] = useState('');
  const [newEquipName, setNewEquipName] = useState('');
  const [newEquipSector, setNewEquipSector] = useState('');
  const [newEquipPatrimony, setNewEquipPatrimony] = useState('');
  const [newEquipLabel, setNewEquipLabel] = useState('');
  const [newEquipBrand, setNewEquipBrand] = useState('');
  const [newEquipBTUs, setNewEquipBTUs] = useState('');

  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Spreadsheet upload states
  const [pendingEquipments, setPendingEquipments] = useState<any[] | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);

  // Função inteligente para extração automática de marca e BTUs a partir do texto
  const detectBrandAndBTUs = (name: string, sector: string, currentBrand?: string, currentBTU?: string) => {
    let detectedBrand = currentBrand ? currentBrand.trim() : '';
    let detectedBTU = currentBTU ? currentBTU.trim() : '';

    const textToAnalyze = `${name} ${sector} ${detectedBrand} ${detectedBTU}`.toLowerCase();

    // 1. Detecção de Marca
    if (!detectedBrand || detectedBrand === '-' || detectedBrand === '') {
      const brandsList = [
        'midea', 'agratto', 'elgin', 'carrier', 'springer', 'lg', 'samsung', 
        'gree', 'daikin', 'fujitsu', 'philco', 'consul', 'brastemp', 
        'electrolux', 'komeco', 'tcl', 'hitachi', 'toshiba', 'panasonic', 
        'york', 'trane', 'fontaine', 'admiral'
      ];
      for (const b of brandsList) {
        const regex = new RegExp('\\b' + b + '\\b', 'i');
        if (regex.test(textToAnalyze)) {
          detectedBrand = b.toUpperCase();
          break;
        }
      }
    }

    // 2. Detecção de BTUs
    if (detectedBTU) {
      const cleanBtu = detectedBTU.toLowerCase();
      const kMatch = cleanBtu.match(/(\d+)\s*k/);
      if (kMatch) {
        detectedBTU = (parseInt(kMatch[1], 10) * 1000).toString();
      } else {
        const numbersOnly = cleanBtu.replace(/\D/g, '');
        if (numbersOnly) {
          detectedBTU = numbersOnly;
        }
      }
    }

    if (!detectedBTU || isNaN(Number(detectedBTU)) || detectedBTU === '-') {
      const cleanText = textToAnalyze.toLowerCase();
      
      // Tenta padrão com K (ex: 12k, 18k, 9k)
      const kRegex = /\b(\d+)\s*k\b/;
      const kMatch = cleanText.match(kRegex);
      if (kMatch) {
        detectedBTU = (parseInt(kMatch[1], 10) * 1000).toString();
      } else {
        // Tenta procurar números de BTUs comuns na climatização
        const commonBtus = [
          '7500', '9000', '10000', '12000', '18000', '22000', '24000', '30000', 
          '36000', '48000', '58000', '60000', '80000'
        ];
        
        for (const btu of commonBtus) {
          const formattedBtu = btu.substring(0, btu.length - 3) + '[.,]?' + btu.substring(btu.length - 3);
          const btuRegex = new RegExp('\\b' + formattedBtu + '\\b');
          if (btuRegex.test(cleanText)) {
            detectedBTU = btu;
            break;
          }
        }

        if (!detectedBTU || isNaN(Number(detectedBTU))) {
          const btuGenericRegex = /\b(\d{1,2})[.,]?(\d{3})\b/;
          const genericMatch = cleanText.match(btuGenericRegex);
          if (genericMatch) {
            const num = parseInt(genericMatch[1] + genericMatch[2], 10);
            if (num >= 7000 && num <= 90000) {
              detectedBTU = num.toString();
            }
          }
        }
      }
    }

    return {
      brand: detectedBrand || '-',
      btus: detectedBTU || '-'
    };
  };

  const handleSpreadsheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setPendingFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
        
        if (data.length === 0) {
          throw new Error('A planilha está vazia.');
        }

        // Algoritmo robusto de pontuação para localizar a linha de cabeçalho correta
        let bestHeaderRowIndex = 0;
        let maxScore = -1;

        const allKeywords = [
          'item', 'ordem', 'setor', 'local', 'sala', 'equipamento', 'aparelho', 'tipo', 'marca', 'fabricante', 'btu', 'capacidade', 'potencia', 'potência', 'patrimonio', 'patrimônio', 'tag', 'identificação', 'identificacao'
        ];

        for (let i = 0; i < Math.min(25, data.length); i++) {
          const row = data[i];
          if (!row || !Array.isArray(row)) continue;
          
          let score = 0;
          row.forEach((cell: any) => {
            const val = cell?.toString().trim().toLowerCase() || '';
            if (!val) return;
            const matches = allKeywords.some(keyword => val.includes(keyword) || keyword.includes(val));
            if (matches) {
              score += 1.5; // Peso maior para correspondência exata ou aproximada de termos chave
            }
          });

          if (score > maxScore) {
            maxScore = score;
            bestHeaderRowIndex = i;
          }
        }

        // Se a pontuação máxima for muito baixa, usa a primeira linha com mais de 1 elemento preenchido como fallback
        let headerRowIndex = bestHeaderRowIndex;
        if (maxScore < 2) {
          headerRowIndex = 0;
          for (let i = 0; i < Math.min(15, data.length); i++) {
            if (data[i] && data[i].length > 1) {
              headerRowIndex = i;
              break;
            }
          }
        }

        const headers = Array.from(data[headerRowIndex] || []).map((h: any) => h?.toString().trim().toLowerCase() || '');
        const rows = data.slice(headerRowIndex + 1);

        // Mapear cabeçalhos de forma inteligente usando termos precisos
        const getColIndex = (options: string[]) => {
          return headers.findIndex((h: string | undefined) => {
            if (!h) return false;
            return options.some(opt => opt && (h.includes(opt) || opt.includes(h)));
          });
        };

        const nameIndex = getColIndex(['equipamento', 'nome', 'name', 'tipo', 'aparelho', 'equip']);
        const sectorIndex = getColIndex(['setor', 'local', 'localizacao', 'sala', 'sector']);
        const patrimonyIndex = getColIndex(['patrimonio', 'patrimônio', 'pat', 'tag', 'patrimony', 'identificacao', 'nº de patrimonio', 'nº patrimônio']);
        const labelIndex = getColIndex(['ordem', 'etiqueta', 'label', 'numero', 'item', '#', 'ord']);
        const brandIndex = getColIndex(['marca', 'fabricante', 'brand', 'marca/modelo']);
        const btuIndex = getColIndex(['btus', 'capacidade', 'btu', 'potência', 'potencia']);

        let nameIdx = nameIndex;
        let sectorIdx = sectorIndex;
        let patrimonyIdx = patrimonyIndex;
        let labelIdx = labelIndex;
        let brandIdx = brandIndex;
        let btuIdx = btuIndex;

        // Se falhar em encontrar por nome, assume ordem padrão baseada na estrutura típica
        if (nameIdx === -1 && sectorIdx === -1) {
          labelIdx = 0;
          sectorIdx = 1;
          nameIdx = 2;
          brandIdx = 3;
          btuIdx = 4;
          patrimonyIdx = 5;
        }

        const parsed: any[] = [];
        rows.forEach((row: any, rIdx: number) => {
          if (!row || row.length === 0) return;
          
          const nameVal = nameIdx !== -1 && row[nameIdx] !== undefined ? row[nameIdx]?.toString().trim() : '';
          const sectorVal = sectorIdx !== -1 && row[sectorIdx] !== undefined ? row[sectorIdx]?.toString().trim() : '';
          const patVal = patrimonyIdx !== -1 && row[patrimonyIdx] !== undefined ? row[patrimonyIdx]?.toString().trim() : '';
          const rawBrandVal = brandIdx !== -1 && row[brandIdx] !== undefined ? row[brandIdx]?.toString().trim() : '';
          const rawBtuVal = btuIdx !== -1 && row[btuIdx] !== undefined ? row[btuIdx]?.toString().trim() : '';
          
          if (!nameVal && !sectorVal && !patVal) return; // pular linhas vazias

          // Detecção inteligente e normalização automática de Marca e BTUs
          const detected = detectBrandAndBTUs(nameVal || 'SPLIT', sectorVal || '', rawBrandVal, rawBtuVal);

          parsed.push({
            name: nameVal || 'SPLIT',
            sector: sectorVal || 'Geral',
            patrimony: patVal || '',
            label: labelIdx !== -1 && row[labelIdx] !== undefined ? row[labelIdx]?.toString().trim() : (parsed.length + 1).toString(),
            brand: detected.brand,
            btus: detected.btus
          });
        });

        if (parsed.length === 0) {
          throw new Error('Nenhum equipamento válido pôde ser extraído da planilha. Verifique as colunas (ex: Equipamento, Setor, Patrimônio).');
        }

        setPendingEquipments(parsed);
      } catch (err: any) {
        console.error(err);
        setImportError(err.message || 'Erro ao ler a planilha.');
        setPendingEquipments(null);
      }
    };
    reader.onerror = () => {
      setImportError('Erro na leitura do arquivo.');
    };
    reader.readAsBinaryString(file);
  };

  const handleApproveImport = async () => {
    if (!pendingEquipments || !selectedAddressForEquip) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      // 1. Obter número máximo de ID existente para continuar a contagem e filtrar os equipamentos já existentes daquele endereço
      const allSnapshot = await getDocs(collection(db, 'equipments'));
      let maxNum = 0;
      const docsToDelete: any[] = [];

      allSnapshot.docs.forEach(doc => {
        const num = parseInt(doc.id, 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
        if (doc.data().addressId === selectedAddressForEquip) {
          docsToDelete.push(doc);
        }
      });

      // 2. Excluir todos os equipamentos já existentes daquele endereço (limite de 400 por batch)
      if (docsToDelete.length > 0) {
        for (let i = 0; i < docsToDelete.length; i += 400) {
          const deleteBatch = writeBatch(db);
          const chunk = docsToDelete.slice(i, i + 400);
          chunk.forEach(d => deleteBatch.delete(d.ref));
          await deleteBatch.commit();
        }
        console.log(`${docsToDelete.length} equipamentos antigos do endereço foram excluídos.`);
      }

      // 3. Cadastrar os novos equipamentos da planilha atual (limite de 400 por batch)
      let currentIdNum = maxNum + 1;
      for (let i = 0; i < pendingEquipments.length; i += 400) {
        const createBatch = writeBatch(db);
        const chunk = pendingEquipments.slice(i, i + 400);
        for (const eq of chunk) {
          const nextId = currentIdNum.toString().padStart(4, '0');
          const eqDocRef = doc(db, 'equipments', nextId);
          createBatch.set(eqDocRef, {
            addressId: selectedAddressForEquip,
            name: eq.name,
            sector: eq.sector,
            patrimony: eq.patrimony,
            label: eq.label,
            brand: eq.brand,
            btus: eq.btus,
            id: nextId,
            createdAt: serverTimestamp()
          });
          currentIdNum++;
        }
        await createBatch.commit();
      }

      // 2. Sincronizar o contador de máquinas do endereço
      await dataService.syncAddressMachinesCount(selectedAddressForEquip);

      // 3. Recarregar todos os dados na UI
      await loadData();

      setMessage({ 
        text: `Sucesso! ${pendingEquipments.length} máquinas cadastradas e vinculadas com sucesso no banco de dados!`, 
        type: 'success' 
      });

      // Limpar estados temporários
      setPendingEquipments(null);
      setPendingFileName('');
      setImportError(null);
    } catch (err: any) {
      console.error('Erro ao aprovar importação:', err);
      setMessage({ text: `Erro ao aprovar importação: ${err.message || err}`, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelImport = () => {
    setPendingEquipments(null);
    setPendingFileName('');
    setImportError(null);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleImportSEB = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      // 1. Encontrar ou criar o Cliente SEB
      let clientObj = clients.find(c => 
        c.name.toUpperCase().includes('SEB ESCOLAS') || 
        c.name.toUpperCase().includes('SEB DE ALTA PERFORMANCE') || 
        c.name.toUpperCase().includes('SEB COC')
      );
      let clientId = '';
      if (clientObj) {
        clientId = clientObj.id;
      } else {
        const newClientRef = await dataService.addClient({
          name: 'SEB ESCOLAS DE ALTA PERFORMANCE LTDA',
          contractCycle: 3,
          billingCycleInfo: 'Contrato: 62'
        });
        clientId = newClientRef?.id || '';
      }

      if (!clientId) {
        throw new Error('Falha ao obter ou criar o Cliente.');
      }

      // 2. Encontrar ou criar o Endereço SEB
      let addressObj = addresses.find(a => 
        a.clientId === clientId && 
        (a.street.toUpperCase().includes('SENADOR RUI PALMEIRA') || a.street.toUpperCase().includes('RUI PALMEIRA'))
      );
      let addressId = '';
      if (addressObj) {
        addressId = addressObj.id;
      } else {
        // Garantir que a Rota SEB COC existe nas configurações
        const routeConfigsSnapshot = await dataService.getRouteConfigs();
        const routeExists = routeConfigsSnapshot.some(rc => rc.id === 'SEB COC');
        if (!routeExists) {
          await dataService.upsertRouteConfig({
            id: 'SEB COC',
            routeName: 'SEB COC',
            type: RouteType.FIXED,
            technician1: 'Equipe Le Frio',
            technician2: '',
            updatedAt: serverTimestamp()
          });
        }

        const newAddressRef = await dataService.addAddress({
          clientId,
          street: 'SENADOR RUI PALMEIRA, 1200 - PONTA VERDE - MACEIO - AL - CEP: 57035-250',
          route: 'SEB COC',
          totalMachines: 113,
          coordinates: '-9.6612, -35.7024'
        });
        addressId = newAddressRef?.id || '';
      }

      if (!addressId) {
        throw new Error('Falha ao obter ou criar o Endereço.');
      }

      // 3. Verificar se já existem equipamentos cadastrados para esse endereço para evitar duplicados
      const existingEquips = equipments.filter(eq => eq.addressId === addressId);
      if (existingEquips.length > 0) {
        setSelectedClientForEquip(clientId);
        setSelectedAddressForEquip(addressId);
        setActiveTab('equipments');
        setMessage({ text: `As máquinas do SEB COC já estão cadastradas (${existingEquips.length} equipamentos encontrados)!`, type: 'success' });
        setIsSubmitting(false);
        return;
      }

      // 4. Batch set dos 113 equipamentos para evitar race conditions de ID
      const allSnapshot = await getDocs(collection(db, 'equipments'));
      let maxNum = 0;
      allSnapshot.docs.forEach(doc => {
        const num = parseInt(doc.id, 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      });

      const batch = writeBatch(db);
      let currentIdNum = maxNum + 1;

      for (const eq of SEB_EQUIPMENTS) {
        const nextId = currentIdNum.toString().padStart(4, '0');
        const eqDocRef = doc(db, 'equipments', nextId);
        batch.set(eqDocRef, {
          addressId,
          name: eq.name,
          sector: eq.sector,
          patrimony: eq.patrimony,
          label: eq.label,
          brand: eq.brand,
          btus: eq.btus,
          id: nextId,
          createdAt: serverTimestamp()
        });
        currentIdNum++;
      }

      await batch.commit();

      // 5. Sincronizar o contador de máquinas do endereço
      await dataService.syncAddressMachinesCount(addressId);

      // 6. Recarregar todos os dados na UI
      await loadData();

      // 7. Configurar os filtros para exibir imediatamente a nova listagem
      setSelectedClientForEquip(clientId);
      setSelectedAddressForEquip(addressId);
      setActiveTab('equipments');

      setMessage({ text: 'Sucesso! 113 máquinas do SEB COC cadastradas e vinculadas com sucesso no banco de dados!', type: 'success' });
    } catch (err: any) {
      console.error('Erro ao realizar a importação:', err);
      setMessage({ text: `Erro ao realizar a importação: ${err.message || err}`, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [c, a, t, rc, ic, cd, eq] = await Promise.all([
        dataService.getClients().catch(err => { console.error('Error loading clients:', err); return []; }),
        dataService.getAllAddresses().catch(err => { console.error('Error loading addresses:', err); return []; }),
        dataService.getTechnicians().catch(err => { console.error('Error loading technicians:', err); return []; }),
        dataService.getRouteConfigs().catch(err => { console.error('Error loading route configs:', err); return []; }),
        dataService.getInactiveClients().catch(err => { console.error('Error loading inactive clients:', err); return []; }),
        dataService.getTravelCards().catch(err => { console.error('Error loading travel cards:', err); return []; }),
        dataService.getEquipments().catch(err => { console.error('Error loading equipments:', err); return []; })
      ]);
      setClients(c);
      setAddresses(a);
      setTechs(t);
      setRouteConfigs(rc);
      setInactiveClients(ic);
      setCards(cd || []);
      setEquipments(eq || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewClientName('');
    setNewClientBilling('');
    setNewClientBillingDay('');
    setNewClientContractCycle('1');
    setNewAddrStreet('');
    setNewAddrRoute('');
    setNewAddrClientId('');
    setNewAddrMachines(0);
    setNewAddrCoordinates('');
    setNewAddrCep('');
    setNewAddrStatus('active');
    setNewTechName('');
    setNewTechPin('');
    setNewCardLastFourDigits('');
    setNewCardBank('');
    setNewCardHolderName('');
    setNewEquipName('');
    setNewEquipSector('');
    setNewEquipPatrimony('');
    setNewEquipLabel('');
    setNewEquipBrand('');
    setNewEquipBTUs('');
  };

  const handleAddEquipment = async () => {
    if (isSubmitting) return;
    if (!selectedClientForEquip) {
      setMessage({ text: 'Por favor, selecione o Cliente.', type: 'error' });
      return;
    }
    if (!selectedAddressForEquip) {
      setMessage({ text: 'Por favor, selecione o Endereço.', type: 'error' });
      return;
    }
    if (!newEquipName.trim()) {
      setMessage({ text: 'Por favor, informe o Nome do Equipamento (ex: SPLIT, CASSETE).', type: 'error' });
      return;
    }
    if (!newEquipSector.trim()) {
      setMessage({ text: 'Por favor, informe o Setor/Localização da máquina. O campo patrimônio é o único que pode ficar em branco.', type: 'error' });
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      // REGRA: O campo patrimônio é o ÚNICO que pode ficar em branco no cadastro de uma máquina,
      // pois nem toda máquina possui numeração de patrimônio.
      const equipData = {
        addressId: selectedAddressForEquip,
        name: newEquipName.trim(),
        sector: newEquipSector.trim(),
        patrimony: newEquipPatrimony.trim(), // Aceita vazio se não possuir numeração
        label: newEquipLabel.trim() || '1',
        brand: newEquipBrand.trim() || undefined,
        btus: newEquipBTUs.trim() || undefined,
      };

      if (editingId) {
        await dataService.updateEquipment(editingId, equipData);
        setMessage({ text: 'Equipamento atualizado com sucesso!', type: 'success' });
      } else {
        await dataService.addEquipment(equipData);
        setMessage({ text: 'Equipamento cadastrado com sucesso!', type: 'success' });
      }
      handleCancelEdit();
      await loadData();
    } catch (error: any) {
      console.error('Error adding equipment:', error);
      setMessage({ text: 'Erro ao processar equipamento: ' + (error.message || 'Erro desconhecido'), type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEquipment = async (id: string) => {
    try {
      await dataService.deleteEquipment(id);
      await loadData();
      setMessage({ text: 'Equipamento removido!', type: 'success' });
      setConfirmModal(null);
    } catch (error: any) {
      setMessage({ text: 'Erro ao remover: ' + error.message, type: 'error' });
    }
  };

  const startDeleteEquipment = (equip: Equipment) => {
    setConfirmModal({ id: equip.id, type: 'equipment', name: `${equip.name} (${equip.id})` });
  };

  const startEditEquipment = (equip: Equipment) => {
    setEditingId(equip.id);
    setActiveTab('equipments');
    const addr = addresses.find(a => a.id === equip.addressId);
    if (addr) {
      setSelectedClientForEquip(addr.clientId);
      setSelectedAddressForEquip(equip.addressId);
    }
    setNewEquipName(equip.name);
    setNewEquipSector(equip.sector);
    setNewEquipPatrimony(equip.patrimony);
    setNewEquipLabel(equip.label);
    setNewEquipBrand(equip.brand || '');
    setNewEquipBTUs(equip.btus || '');
  };

  const handleAddClient = async () => {
    if (!newClientName || isSubmitting) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const clientData: any = {
        name: newClientName.trim()
      };
      
      if (newClientBilling.trim()) {
        clientData.billingCycleInfo = newClientBilling.trim();
      }
      
      if (newClientBillingDay) {
        clientData.billingDay = parseInt(newClientBillingDay);
      }

      clientData.contractCycle = parseInt(newClientContractCycle) || 1;

      if (editingId) {
        await dataService.updateClient(editingId, clientData);
        setMessage({ text: 'Cliente atualizado com sucesso!', type: 'success' });
      } else {
        await dataService.addClient(clientData);
        setMessage({ text: 'Cliente cadastrado com sucesso!', type: 'success' });
      }
      handleCancelEdit();
      await loadData();
    } catch (error: any) {
      console.error('Error adding client:', error);
      setMessage({ text: 'Erro ao processar cliente: ' + (error.message || 'Erro desconhecido'), type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClient = async (id: string) => {
    try {
      await dataService.deleteClient(id);
      await loadData();
      setMessage({ text: 'Cliente enviado para a lixeira! Ele ficará inativo por 48 horas (reversível).', type: 'success' });
      setConfirmModal(null);
    } catch (error: any) {
      setMessage({ text: 'Erro ao remover: ' + error.message, type: 'error' });
    }
  };

  const handleRestoreClient = async (id: string) => {
    try {
      await dataService.restoreClient(id);
      await loadData();
      setMessage({ text: 'Cliente restaurado e ativado com sucesso!', type: 'success' });
    } catch (error: any) {
      setMessage({ text: 'Erro ao restaurar: ' + error.message, type: 'error' });
    }
  };

  const startDeleteClient = (client: Client) => {
    setConfirmModal({ id: client.id, type: 'client', name: client.name });
  };

  const handleAddAddress = async () => {
    if (!newAddrStreet.trim()) {
      setMessage({ text: 'Por favor, informe a rua ou identificação do endereço.', type: 'error' });
      return;
    }
    if (!newAddrClientId) {
      setMessage({ text: 'Por favor, selecione o cliente.', type: 'error' });
      return;
    }
    if (!newAddrRoute) {
      setMessage({ text: 'Por favor, selecione a rota.', type: 'error' });
      return;
    }
    if (isSubmitting) return;

    // VALIDAÇÃO PRÉVIA DE UNICIDADE NO CLIENTE SELECIONADO:
    const normInput = normalizeAddressText(newAddrStreet);
    const existingDuplicate = addresses.find(a => {
      if (editingId && a.id === editingId) return false;
      if (a.clientId !== newAddrClientId) return false;
      if (a.status === 'inactive' || a.active === false || a.isInactive === true) return false;
      return normalizeAddressText(a.street || '') === normInput;
    });

    if (existingDuplicate) {
      setMessage({ 
        text: `Atenção: Já existe um endereço cadastrado para este cliente com esta descrição/rua ("${existingDuplicate.street}"). Para manter o cronograma organizado e sem repetições, não é permitido cadastrar o mesmo endereço duas vezes.`, 
        type: 'error' 
      });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      if (editingId) {
        await dataService.updateAddress(editingId, {
          street: newAddrStreet.trim(),
          clientId: newAddrClientId,
          route: newAddrRoute.trim(),
          totalMachines: newAddrMachines,
          coordinates: newAddrCoordinates.trim(),
          cep: newAddrCep.trim(),
          status: newAddrStatus,
          active: newAddrStatus === 'active',
          isInactive: newAddrStatus === 'inactive'
        });
        setMessage({ text: 'Endereço atualizado com sucesso!', type: 'success' });
      } else {
        await dataService.addAddress({ 
          street: newAddrStreet.trim(), 
          clientId: newAddrClientId, 
          route: newAddrRoute.trim(), 
          totalMachines: newAddrMachines,
          coordinates: newAddrCoordinates.trim(),
          cep: newAddrCep.trim(),
          status: newAddrStatus,
          active: newAddrStatus === 'active',
          isInactive: newAddrStatus === 'inactive'
        });
        setMessage({ text: 'Endereço cadastrado com sucesso!', type: 'success' });
      }
      handleCancelEdit();
      await loadData();
    } catch (error: any) {
      console.error('Error adding address:', error);
      setMessage({ text: 'Erro ao processar endereço: ' + (error.message || 'Erro desconhecido'), type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCleanDuplicateAddresses = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const res = await dataService.deduplicateAndMergeAddresses();
      await loadData();
      if (res.totalAddressesRemoved > 0) {
        setMessage({
          text: `Higienização concluída com sucesso! ${res.totalAddressesRemoved} endereços duplicados foram unificados e seus equipamentos/manutenções consolidados.`,
          type: 'success'
        });
      } else {
        setMessage({
          text: 'Nenhum endereço duplicado encontrado no cadastro. Base de endereços 100% íntegra!',
          type: 'success'
        });
      }
    } catch (e: any) {
      setMessage({ text: 'Erro ao higienizar endereços: ' + (e.message || 'Erro desconhecido'), type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivateAddress = async (id: string) => {
    try {
      await dataService.deactivateAddress(id, 'Desabilitado pelo painel de Cadastros');
      await loadData();
      setMessage({ text: 'Endereço desabilitado com sucesso! Ele não aparecerá mais no cronograma, mas permanece salvo para auditorias.', type: 'success' });
      setConfirmModal(null);
    } catch (error: any) {
      setMessage({ text: 'Erro ao desabilitar endereço: ' + error.message, type: 'error' });
    }
  };

  const handleReactivateAddress = async (id: string) => {
    try {
      await dataService.reactivateAddress(id);
      await loadData();
      setMessage({ text: 'Endereço reabilitado com sucesso! Ele voltará a aparecer nos cronogramas.', type: 'success' });
      setConfirmModal(null);
    } catch (error: any) {
      setMessage({ text: 'Erro ao reabilitar endereço: ' + error.message, type: 'error' });
    }
  };

  const startToggleAddressStatus = (addr: Address) => {
    const isCurrentlyInactive = addr.status === 'inactive' || addr.active === false || addr.isInactive === true;
    if (isCurrentlyInactive) {
      setConfirmModal({ id: addr.id, type: 'reactivate_address', name: addr.street });
    } else {
      setConfirmModal({ id: addr.id, type: 'deactivate_address', name: addr.street });
    }
  };

  const handleDeleteAddress = async (id: string) => {
    try {
      await dataService.deleteAddress(id);
      await loadData();
      setMessage({ text: 'Endereço removido permanentemente!', type: 'success' });
      setConfirmModal(null);
    } catch (error: any) {
      setMessage({ text: 'Erro ao remover: ' + error.message, type: 'error' });
    }
  };

  const startDeleteAddress = (addr: Address) => {
    setConfirmModal({ id: addr.id, type: 'address', name: addr.street });
  };

  const handleAddTech = async () => {
    if (!newTechName || isSubmitting) return;
    if (newTechPin && !/^\d{4}$/.test(newTechPin)) {
      setMessage({ text: 'O PIN de acesso deve conter exatamente 4 dígitos numéricos.', type: 'error' });
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingId) {
        await dataService.updateTechnician(editingId, newTechName, newTechPin);
        setMessage({ text: 'Técnico atualizado!', type: 'success' });
      } else {
        await dataService.addTechnician(newTechName, newTechPin);
        setMessage({ text: 'Técnico adicionado com sucesso!', type: 'success' });
      }
      handleCancelEdit();
      await loadData();
    } catch (e: any) {
      setMessage({ text: 'Erro ao processar técnico: ' + (e.message || 'Erro desconhecido'), type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTech = async (id: string) => {
    try {
      await dataService.deleteTechnician(id);
      await loadData();
      setMessage({ text: 'Técnico removido!', type: 'success' });
      setConfirmModal(null);
    } catch (error: any) {
      setMessage({ text: 'Erro ao remover: ' + error.message, type: 'error' });
    }
  };

  const startDeleteTech = (tech: Technician) => {
    setConfirmModal({ id: tech.id, type: 'tech', name: tech.name });
  };

  const handleAddCard = async () => {
    if (!newCardLastFourDigits || !newCardBank || !newCardHolderName || isSubmitting) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const cardData = {
        lastFourDigits: newCardLastFourDigits.trim(),
        bank: newCardBank.trim(),
        holderName: newCardHolderName.trim()
      };

      if (editingId) {
        await dataService.updateTravelCard(editingId, cardData);
        setMessage({ text: 'Cartão atualizado com sucesso!', type: 'success' });
      } else {
        await dataService.addTravelCard(cardData);
        setMessage({ text: 'Cartão cadastrado com sucesso!', type: 'success' });
      }
      handleCancelEdit();
      await loadData();
    } catch (error: any) {
      console.error('Error processing card:', error);
      setMessage({ text: 'Erro ao processar cartão: ' + (error.message || 'Erro desconhecido'), type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCard = async (id: string) => {
    try {
      await dataService.deleteTravelCard(id);
      await loadData();
      setMessage({ text: 'Cartão removido!', type: 'success' });
      setConfirmModal(null);
    } catch (error: any) {
      setMessage({ text: 'Erro ao remover: ' + error.message, type: 'error' });
    }
  };

  const startDeleteCard = (card: TravelCard) => {
    setConfirmModal({ id: card.id, type: 'card', name: `${card.bank} final ${card.lastFourDigits}` });
  };

  const startEditCard = (card: TravelCard) => {
    setEditingId(card.id);
    setActiveTab('cards');
    setNewCardLastFourDigits(card.lastFourDigits);
    setNewCardBank(card.bank);
    setNewCardHolderName(card.holderName);
  };

  const startEditClient = (client: Client) => {
    setEditingId(client.id);
    setActiveTab('clients');
    setNewClientName(client.name);
    setNewClientBilling(client.billingCycleInfo || '');
    setNewClientBillingDay(client.billingDay?.toString() || '');
    setNewClientContractCycle(client.contractCycle?.toString() || '1');
  };

  const startEditAddress = (addr: Address) => {
    setEditingId(addr.id);
    setActiveTab('addresses');
    setNewAddrStreet(addr.street);
    setNewAddrRoute(addr.route);
    setNewAddrClientId(addr.clientId);
    setNewAddrMachines(addr.totalMachines);
    setNewAddrCoordinates(addr.coordinates || '');
    setNewAddrCep(addr.cep || '');
    const isInactive = addr.status === 'inactive' || addr.active === false || addr.isInactive === true;
    setNewAddrStatus(isInactive ? 'inactive' : 'active');
  };

  const startEditTech = (tech: Technician) => {
    setEditingId(tech.id);
    setActiveTab('techs');
    setNewTechName(tech.name);
    setNewTechPin(tech.pin || '');
  };

  const getHoursLeft = (deletedAt: any) => {
    if (!deletedAt) return '';
    let deletedAtMillis = 0;
    if (deletedAt.toMillis) {
      deletedAtMillis = deletedAt.toMillis();
    } else if (deletedAt.seconds) {
      deletedAtMillis = deletedAt.seconds * 1000;
    } else {
      deletedAtMillis = new Date(deletedAt).getTime();
    }
    const elapsed = Date.now() - deletedAtMillis;
    const fortyEightHours = 48 * 60 * 60 * 1000;
    const left = fortyEightHours - elapsed;
    if (left <= 0) return 'Excluindo...';
    
    const hours = Math.floor(left / (60 * 60 * 1000));
    const mins = Math.floor((left % (60 * 60 * 1000)) / (60 * 1000));
    
    return `Exclusão em ${hours}h ${mins}m`;
  };

  const filteredClients = clients.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredInactiveClients = inactiveClients.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  
  const activeAddressesCount = addresses.filter(a => a.status !== 'inactive' && a.active !== false && a.isInactive !== true).length;
  const inactiveAddressesCount = addresses.length - activeAddressesCount;

  const filteredAddresses = addresses
    .filter(a => {
      const term = searchTerm.toLowerCase();
      const client = clients.find(c => c.id === a.clientId);
      const matchesSearch = 
        a.street.toLowerCase().includes(term) || 
        a.route.toLowerCase().includes(term) ||
        (client && client.name.toLowerCase().includes(term)) ||
        (a.cep && a.cep.includes(term));
      if (!matchesSearch) return false;

      const isInactive = a.status === 'inactive' || a.active === false || a.isInactive === true;
      if (addressStatusFilter === 'active') return !isInactive;
      if (addressStatusFilter === 'inactive') return isInactive;
      return true;
    })
    .slice()
    .sort((a, b) => (a.street || '').localeCompare(b.street || ''));
  const filteredTechs = techs.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredCards = cards.filter(card => 
    card.bank.toLowerCase().includes(searchTerm.toLowerCase()) || 
    card.holderName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    card.lastFourDigits.includes(searchTerm)
  );

  const totalMachinesCount = addresses.reduce((acc, curr) => acc + (curr.totalMachines || 0), 0);

  const availableRoutes = Array.from(new Set([
    ...routeConfigs.map(rc => rc.routeName),
    ...addresses.map(a => a.route)
  ])).filter(Boolean).sort();

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Messages */}
      {message && (
        <div className={cn(
          "p-4 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
          message.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-red-50 border-red-100 text-red-800"
        )}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="text-sm font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto p-1 hover:bg-black/5 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Building2 className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Clientes</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{clients.length}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <MapPin className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Endereços</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{addresses.length}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Box className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Máquinas</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{totalMachinesCount}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Users className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Técnicos</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{techs.length}</div>
        </div>
      </div>

      {/* Tabs and Search Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-gray-200 w-fit">
          <button 
            onClick={() => { setActiveTab('overview'); handleCancelEdit(); }}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
              activeTab === 'overview' ? "bg-gray-900 text-white shadow-lg shadow-gray-200" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <TrendingUp className="w-4 h-4" />
            Visão Geral
          </button>
          <button 
            onClick={() => { setActiveTab('clients'); handleCancelEdit(); }}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
              activeTab === 'clients' ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <Building2 className="w-4 h-4" />
            Clientes
          </button>
          <button 
            onClick={() => { setActiveTab('addresses'); handleCancelEdit(); }}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
              activeTab === 'addresses' ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <MapPin className="w-4 h-4" />
            Endereços
          </button>
          <button 
            onClick={() => { setActiveTab('techs'); handleCancelEdit(); }}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
              activeTab === 'techs' ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <Users className="w-4 h-4" />
            Técnicos
          </button>
          <button 
            onClick={() => { setActiveTab('cards'); handleCancelEdit(); }}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
              activeTab === 'cards' ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <CreditCard className="w-4 h-4" />
            Cartões
          </button>
          <button 
            onClick={() => { setActiveTab('equipments'); handleCancelEdit(); }}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
              activeTab === 'equipments' ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <Box className="w-4 h-4" />
            Equipamentos
          </button>
        </div>

        <div className="relative group max-w-xs w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
          <input 
            type="text"
            placeholder={`Buscar ${activeTab === 'clients' || activeTab === 'overview' ? 'clientes' : activeTab === 'addresses' ? 'endereços' : activeTab === 'techs' ? 'técnicos' : activeTab === 'equipments' ? 'equipamentos' : 'cartões'}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all shadow-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Registration Form */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 h-fit sticky top-0 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              {editingId ? <Edit3 className="w-5 h-5 text-amber-600" /> : <Plus className="w-5 h-5 text-blue-600" />}
              {editingId ? 'Editar Registro' : 'Novo Registro'}
            </h3>
            {editingId && (
              <button 
                onClick={handleCancelEdit}
                className="text-[10px] font-bold text-gray-400 hover:text-gray-600 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded"
              >
                Cancelar
              </button>
            )}
          </div>
          
          {(activeTab === 'clients' || activeTab === 'overview') && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 text-blue-700 text-xs rounded-lg mb-4 font-medium border border-blue-100 italic">
                Crie um novo cliente primeiro, depois adicione seus endereços na aba correspondente.
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nome do Cliente</label>
                <input 
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Ex: Órgão Municipal A"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Observações do cliente</label>
                <textarea 
                  value={newClientBilling}
                  onChange={(e) => setNewClientBilling(e.target.value)}
                  placeholder="Instruções de faturamento..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none h-24"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Dia do Faturamento (1-31)</label>
                <input 
                  type="number"
                  min="1"
                  max="31"
                  value={newClientBillingDay}
                  onChange={(e) => setNewClientBillingDay(e.target.value)}
                  placeholder="Ex: 10"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ciclo do Contrato</label>
                <input 
                  type="number"
                  min="1"
                  value={newClientContractCycle}
                  onChange={(e) => setNewClientContractCycle(e.target.value)}
                  placeholder="Ex: 1"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-bold text-gray-900"
                />
              </div>
              <button 
                onClick={handleAddClient}
                disabled={isSubmitting}
                className={cn(
                  "w-full disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg mt-2 flex items-center justify-center gap-2",
                  editingId ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200" : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                )}
              >
                {isSubmitting ? (editingId ? 'Atualizando...' : 'Cadastrando...') : (editingId ? 'Salvar Alterações' : 'Cadastrar Cliente')}
              </button>
            </div>
          )}

          {activeTab === 'addresses' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Cliente</label>
                <select 
                  value={newAddrClientId}
                  onChange={(e) => setNewAddrClientId(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500"
                >
                  <option value="">Selecione um cliente</option>
                  {clients.slice().sort((a,b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Rua / Identificação</label>
                <input 
                  type="text"
                  value={newAddrStreet}
                  onChange={(e) => setNewAddrStreet(e.target.value)}
                  placeholder="Ex: Av. Central, 123 - Bloco B"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500"
                />
                {(() => {
                  if (!newAddrStreet.trim() || !newAddrClientId) return null;
                  const normInput = normalizeAddressText(newAddrStreet);
                  const matched = addresses.find(a => {
                    if (editingId && a.id === editingId) return false;
                    if (a.clientId !== newAddrClientId) return false;
                    if (a.status === 'inactive' || a.active === false || a.isInactive === true) return false;
                    return normalizeAddressText(a.street || '') === normInput;
                  });
                  if (matched) {
                    return (
                      <p className="text-xs text-amber-600 font-semibold mt-1.5 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Aviso: Já existe um endereço com esta descrição cadastrado neste cliente ("{matched.street}").
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Rota / Região</label>
                <select 
                  value={newAddrRoute}
                  onChange={(e) => setNewAddrRoute(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500"
                >
                  <option value="">Selecione uma rota</option>
                  {availableRoutes.map(route => (
                    <option key={route} value={route}>{route}</option>
                  ))}
                  {/* Se o usuário estiver editando e a rota não estiver na lista (improvável mas possível), mostrar ela */}
                  {newAddrRoute && !availableRoutes.includes(newAddrRoute) && (
                    <option value={newAddrRoute}>{newAddrRoute}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Total de Máquinas</label>
                <input 
                  type="number"
                  value={newAddrMachines}
                  onChange={(e) => setNewAddrMachines(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">CEP (Opcional)</label>
                <input 
                  type="text"
                  value={newAddrCep}
                  onChange={(e) => setNewAddrCep(e.target.value)}
                  placeholder="Ex: 57035-250"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Localização (Coordenadas / URL)</label>
                <input 
                  type="text"
                  value={newAddrCoordinates}
                  onChange={(e) => setNewAddrCoordinates(e.target.value)}
                  placeholder="Ex: -3.7319, -38.5267 ou link do Google Maps"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Status do Endereço</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewAddrStatus('active')}
                    className={cn(
                      "py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                      newAddrStatus === 'active' 
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm" 
                        : "bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100"
                    )}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Ativo no Cronograma
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewAddrStatus('inactive')}
                    className={cn(
                      "py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                      newAddrStatus === 'inactive' 
                        ? "bg-amber-50 border-amber-300 text-amber-700 shadow-sm" 
                        : "bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100"
                    )}
                  >
                    <PowerOff className="w-3.5 h-3.5" />
                    Desabilitado (Inativo)
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Endereços desabilitados deixam de aparecer no cronograma, mas permanecem no banco para auditorias.</p>
              </div>
              <button 
                onClick={handleAddAddress}
                disabled={isSubmitting}
                className={cn(
                    "w-full disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg mt-2 flex items-center justify-center gap-2",
                    editingId ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200" : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                  )}
              >
                {isSubmitting ? (editingId ? 'Atualizando...' : 'Cadastrando...') : (editingId ? 'Salvar Alterações' : 'Cadastrar Endereço')}
              </button>
            </div>
          )}

          {activeTab === 'techs' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nome do Técnico</label>
                <input 
                  type="text"
                  value={newTechName}
                  onChange={(e) => setNewTechName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">PIN de Acesso (4 dígitos)</label>
                <input 
                  type="text"
                  maxLength={4}
                  placeholder="Ex: 1234"
                  value={newTechPin}
                  onChange={(e) => setNewTechPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-mono tracking-widest text-center text-lg"
                />
                <p className="text-[10px] text-gray-400 mt-1">Este PIN servirá como senha para o técnico acessar seu roteiro diário no tablet de rua.</p>
              </div>
              <button 
                onClick={handleAddTech}
                disabled={isSubmitting}
                className={cn(
                    "w-full disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg mt-2 flex items-center justify-center gap-2",
                    editingId ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200" : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                  )}
              >
                {isSubmitting ? (editingId ? 'Atualizando...' : 'Adicionando...') : (editingId ? 'Salvar Alterações' : 'Adicionar Técnico')}
              </button>
            </div>
          )}

          {activeTab === 'cards' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Banco / Bandeira</label>
                <input 
                  type="text"
                  placeholder="Ex: Elo, Visa, Banco do Brasil"
                  value={newCardBank}
                  onChange={(e) => setNewCardBank(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Últimos 4 Dígitos</label>
                <input 
                  type="text"
                  placeholder="Ex: 0428"
                  maxLength={4}
                  value={newCardLastFourDigits}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    setNewCardLastFourDigits(value);
                  }}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nome do Titular</label>
                <input 
                  type="text"
                  placeholder="Ex: lucas roberto"
                  value={newCardHolderName}
                  onChange={(e) => setNewCardHolderName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500"
                />
              </div>
              <button 
                onClick={handleAddCard}
                disabled={isSubmitting || !newCardBank || !newCardLastFourDigits || !newCardHolderName}
                className={cn(
                    "w-full disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg mt-2 flex items-center justify-center gap-2",
                    editingId ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200" : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                  )}
              >
                {isSubmitting ? (editingId ? 'Atualizando...' : 'Cadastrando...') : (editingId ? 'Salvar Alterações' : 'Cadastrar Cartão')}
              </button>
            </div>
          )}

          {activeTab === 'equipments' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Cliente</label>
                <select 
                  value={selectedClientForEquip}
                  onChange={(e) => {
                    setSelectedClientForEquip(e.target.value);
                    setSelectedAddressForEquip('');
                  }}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-medium text-gray-800 text-sm"
                >
                  <option value="">Selecione um cliente</option>
                  {clients.slice().sort((a,b) => a.name.localeCompare(b.name)).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Endereço</label>
                <select 
                  value={selectedAddressForEquip}
                  disabled={!selectedClientForEquip}
                  onChange={(e) => setSelectedAddressForEquip(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 disabled:opacity-50 font-medium text-gray-800 text-sm"
                >
                  <option value="">Selecione um endereço</option>
                  {addresses
                    .filter(a => a.clientId === selectedClientForEquip)
                    .slice()
                    .sort((a, b) => (a.street || '').localeCompare(b.street || ''))
                    .map(a => (
                      <option key={a.id} value={a.id}>{a.street} ({a.route})</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nome do Equipamento *</label>
                <input 
                  type="text"
                  placeholder="Ex: SPLIT, PISO TETO, K7"
                  value={newEquipName}
                  onChange={(e) => setNewEquipName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-medium text-gray-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Setor (Ex: 1º andar, Coleta) *</label>
                <input 
                  type="text"
                  placeholder="Ex: 1° andar, Recepção"
                  value={newEquipSector}
                  onChange={(e) => setNewEquipSector(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-medium text-gray-800 text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Número de Patrimônio</label>
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">Único que pode ficar em branco</span>
                </div>
                <input 
                  type="text"
                  placeholder="Em branco se a máquina não possuir patrimônio"
                  value={newEquipPatrimony}
                  onChange={(e) => setNewEquipPatrimony(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-medium text-gray-800 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Marca (Opcional)</label>
                  <input 
                    type="text"
                    placeholder="Ex: Carrier"
                    value={newEquipBrand}
                    onChange={(e) => setNewEquipBrand(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-medium text-gray-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">BTUs (Opcional)</label>
                  <input 
                    type="text"
                    placeholder="Ex: 12000"
                    value={newEquipBTUs}
                    onChange={(e) => setNewEquipBTUs(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-medium text-gray-800 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ordem / Etiqueta</label>
                <input 
                  type="number"
                  placeholder="Ex: 1"
                  value={newEquipLabel}
                  onChange={(e) => setNewEquipLabel(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-medium text-gray-800 text-sm"
                />
                <p className="text-[10px] text-gray-400 mt-1">Ordem que aparecerá na planilha do tablet (ex: 1, 2, 3)</p>
              </div>

              <button 
                onClick={handleAddEquipment}
                disabled={isSubmitting}
                className={cn(
                    "w-full disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg mt-2 flex items-center justify-center gap-2 cursor-pointer",
                    editingId ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200" : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                  )}
              >
                {isSubmitting ? (editingId ? 'Atualizando...' : 'Adicionando...') : (editingId ? 'Salvar Alterações' : 'Cadastrar Equipamento')}
              </button>
            </div>
          )}
        </div>

        {/* Data List */}
        <div className="xl:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[400px]">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-gray-900">
                {activeTab === 'overview' ? 'Visão Geral do Sistema' : 'Registros Existentes'}
              </h3>
              {activeTab === 'addresses' && (
                <div className="flex items-center bg-gray-200/70 p-0.5 rounded-lg text-xs">
                  <button
                    onClick={() => setAddressStatusFilter('all')}
                    className={cn(
                      "px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer",
                      addressStatusFilter === 'all' 
                        ? "bg-white text-gray-900 shadow-xs" 
                        : "text-gray-500 hover:text-gray-900"
                    )}
                  >
                    Todos ({addresses.length})
                  </button>
                  <button
                    onClick={() => setAddressStatusFilter('active')}
                    className={cn(
                      "px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1 cursor-pointer",
                      addressStatusFilter === 'active' 
                        ? "bg-emerald-600 text-white shadow-xs" 
                        : "text-emerald-700 hover:text-emerald-900"
                    )}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Ativos ({activeAddressesCount})
                  </button>
                  <button
                    onClick={() => setAddressStatusFilter('inactive')}
                    className={cn(
                      "px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1 cursor-pointer",
                      addressStatusFilter === 'inactive' 
                        ? "bg-amber-600 text-white shadow-xs" 
                        : "text-amber-700 hover:text-amber-900"
                    )}
                  >
                    <PowerOff className="w-3 h-3" />
                    Desabilitados ({inactiveAddressesCount})
                  </button>
                  <button
                    onClick={handleCleanDuplicateAddresses}
                    disabled={isSubmitting}
                    className="px-2.5 py-1 rounded-md font-bold text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-all flex items-center gap-1 cursor-pointer ml-1 shadow-xs disabled:opacity-50"
                    title="Verificar e unificar endereços duplicados automaticamente"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    Higienizar Duplicatas
                  </button>
                </div>
              )}
            </div>
            <span className="text-xs font-medium text-gray-500 bg-white px-2 py-1 rounded border border-gray-200">
              {activeTab === 'overview' ? filteredClients.length : activeTab === 'clients' ? filteredClients.length : activeTab === 'addresses' ? filteredAddresses.length : activeTab === 'techs' ? filteredTechs.length : activeTab === 'equipments' ? equipments.length : filteredCards.length} itens
            </span>
          </div>

          <div className="flex-1 overflow-auto divide-y divide-gray-100 bg-gray-50/30">
            {activeTab === 'overview' && filteredClients.map(client => {
              const clientAddrs = addresses.filter(a => a.clientId === client.id);
              const totalClientMachines = clientAddrs.reduce((sum, a) => sum + (a.totalMachines || 0), 0);
              
              return (
                <div key={client.id} className="p-6 bg-white border-b border-gray-100 mb-2 last:mb-0 shadow-sm first:rounded-t-2xl">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-lg uppercase tracking-tight">{client.name}</h4>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{clientAddrs.length} Endereços</span>
                          <span className="w-1 h-1 bg-gray-200 rounded-full" />
                          <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">{totalClientMachines} Máquinas Totais</span>
                          {client.billingDay && (
                            <>
                              <span className="w-1 h-1 bg-gray-200 rounded-full" />
                              <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">Fat: Dia {client.billingDay}</span>
                            </>
                          )}
                          <span className="w-1 h-1 bg-gray-200 rounded-full" />
                          <span className="text-xs font-bold text-indigo-650 uppercase tracking-widest">Ciclo do Contrato: {client.contractCycle || 1}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <button 
                        onClick={() => startEditClient(client)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Editar Cliente
                      </button>
                    </div>
                  </div>

                  {clientAddrs.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-4 border-l-2 border-gray-100 ml-6">
                      {clientAddrs.map(addr => (
                        <div key={addr.id} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-100 transition-colors group">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-sm font-bold text-gray-800">{addr.street}</span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => {
                                  setSelectedClientForEquip(addr.clientId);
                                  setSelectedAddressForEquip(addr.id);
                                  setActiveTab('equipments');
                                }}
                                className="p-1 hover:text-blue-600 text-gray-400"
                                title="Configurar Equipamentos"
                              >
                                <Box className="w-3.5 h-3.5" />
                              </button>
                              {addr.coordinates && (
                                <a 
                                  href={getMapsUrl(addr.coordinates)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 hover:text-emerald-600 text-gray-400 hover:bg-emerald-50 rounded"
                                  title="Abrir no Google Maps"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button onClick={() => startEditAddress(addr)} className="p-1 hover:text-blue-600 text-gray-400">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => startDeleteAddress(addr)} className="p-1 hover:text-red-600 text-gray-400">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 bg-white px-2 py-1 rounded border border-gray-100">
                              <TrendingUp className="w-3 h-3" />
                              {addr.route}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                              <Box className="w-3 h-3" />
                              {addr.totalMachines} MÁQUINAS
                            </div>
                            {addr.cep && (
                              <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                📮 CEP: {addr.cep}
                              </div>
                            )}
                            {addr.coordinates && (
                              <a 
                                href={getMapsUrl(addr.coordinates)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-gray-500 bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 px-2 py-1 rounded border border-gray-100 max-w-[150px] truncate transition-all cursor-pointer shadow-sm hover:shadow" 
                                title="Clique para abrir no Google Maps"
                              >
                                🌐 {addr.coordinates}
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="ml-6 pl-4 border-l-2 border-gray-100 py-3 italic text-gray-400 text-sm">
                      Nenhum endereço cadastrado para este cliente.
                    </div>
                  )}

                  {client.billingCycleInfo && (
                    <div className="mt-4 ml-6 p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-800">
                      <div className="font-bold uppercase tracking-widest mb-1 text-[10px] flex items-center gap-2">
                        <AlertCircle className="w-3 h-3" />
                        Observações do Cliente
                      </div>
                      <p>{client.billingCycleInfo}</p>
                    </div>
                  )}
                </div>
              );
            })}

            {activeTab === 'clients' && filteredClients.map(client => (
              <div key={client.id} className="p-4 flex items-center justify-between hover:bg-gray-50 bg-white transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 uppercase flex items-center gap-2">
                      {client.name}
                      <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2.5 py-0.5 rounded-full border border-indigo-100 normal-case">
                        Ciclo: {client.contractCycle || 1}
                      </span>
                    </h4>
                    <p className="text-xs text-gray-500 truncate max-w-md">{client.billingCycleInfo || 'Sem info de faturamento'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => startEditClient(client)}
                    className="p-2 hover:bg-white hover:shadow text-gray-400 hover:text-blue-600 rounded-lg transition-all"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => startDeleteClient(client)}
                    className="p-2 hover:bg-white hover:shadow text-gray-400 hover:text-red-600 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {activeTab === 'clients' && filteredInactiveClients.length > 0 && (
              <div className="mt-8 border-t border-dashed border-amber-200 pt-6 px-4">
                <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Lixeira de Clientes (Inativos por até 48 horas)
                </h4>
                <div className="divide-y divide-gray-100 rounded-2xl border border-amber-100 bg-amber-50/25 overflow-hidden">
                  {filteredInactiveClients.map(client => (
                    <div key={client.id} className="p-4 flex items-center justify-between hover:bg-amber-50/50 transition-all group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-amber-100/80 text-amber-700 rounded-lg flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-800 uppercase line-through decoration-amber-300">{client.name}</h4>
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-900 mt-1">
                            <Clock className="w-3 h-3" />
                            {getHoursLeft(client.deletedAt)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <button 
                          onClick={() => handleRestoreClient(client.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors border border-emerald-100 shadow-sm"
                          title="Restaurar cliente antes de ser totalmente excluído"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Restaurar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'addresses' && filteredAddresses.map(addr => {
              const isInactive = addr.status === 'inactive' || addr.active === false || addr.isInactive === true;
              return (
                <div 
                  key={addr.id} 
                  className={cn(
                    "p-4 flex items-center justify-between bg-white transition-all group border-b border-gray-100 last:border-b-0",
                    isInactive ? "bg-amber-50/20 hover:bg-amber-50/40 border-l-4 border-l-amber-400" : "hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                      isInactive ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-600"
                    )}>
                      {isInactive ? <PowerOff className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className={cn("font-bold text-gray-900", isInactive && "text-gray-600")}>
                          {addr.street}
                        </h4>
                        {isInactive ? (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300/70 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <PowerOff className="w-2.5 h-2.5 text-amber-700" />
                            Desabilitado (Inativo no Cronograma)
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Ativo
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          {addr.route}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 text-emerald-600">
                          <Box className="w-3 h-3" />
                          {addr.totalMachines} Máq.
                        </span>
                        {addr.cep && (
                          <span className="text-[10px] font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            CEP: {addr.cep}
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 rounded uppercase tracking-widest">
                          {clients.find(c => c.id === addr.clientId)?.name}
                        </span>
                        {addr.coordinates && (
                          <a 
                            href={getMapsUrl(addr.coordinates)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-mono font-semibold text-gray-500 bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1 max-w-[200px] truncate transition-all cursor-pointer shadow-sm hover:shadow"
                            title="Clique para abrir no Google Maps"
                          >
                            🌐 {addr.coordinates}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        setSelectedClientForEquip(addr.clientId);
                        setSelectedAddressForEquip(addr.id);
                        setActiveTab('equipments');
                      }}
                      className="p-2 bg-blue-50/55 hover:bg-blue-100 hover:shadow text-blue-600 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Configurar Equipamentos deste Endereço"
                    >
                      <Box className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-black uppercase tracking-wider hidden sm:inline">Equipamentos</span>
                    </button>

                    {/* Botão de Habilitar / Desabilitar Endereço */}
                    {isInactive ? (
                      <button 
                        onClick={() => startToggleAddressStatus(addr)}
                        className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                        title="Reabilitar endereço (voltará a aparecer no cronograma)"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="hidden md:inline">Habilitar</span>
                      </button>
                    ) : (
                      <button 
                        onClick={() => startToggleAddressStatus(addr)}
                        className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                        title="Desabilitar endereço (não aparecerá no cronograma, mas fica guardado no banco)"
                      >
                        <PowerOff className="w-3.5 h-3.5 text-amber-600" />
                        <span className="hidden md:inline">Desabilitar</span>
                      </button>
                    )}

                    {addr.coordinates && (
                      <a 
                        href={getMapsUrl(addr.coordinates)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 hover:bg-gray-100 text-gray-400 hover:text-emerald-600 rounded-lg transition-all flex items-center justify-center"
                        title="Abrir no Google Maps"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <button 
                      onClick={() => startEditAddress(addr)}
                      className="p-2 hover:bg-gray-100 text-gray-400 hover:text-blue-600 rounded-lg transition-all"
                      title="Editar dados do endereço"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => startDeleteAddress(addr)}
                      className="p-2 hover:bg-gray-100 text-gray-400 hover:text-red-600 rounded-lg transition-all"
                      title="Excluir permanentemente"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {activeTab === 'techs' && filteredTechs.map(tech => (
              <div key={tech.id} className="p-4 flex items-center justify-between hover:bg-gray-50 bg-white transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">{tech.name}</h4>
                    {tech.pin ? (
                      <p className="text-xs text-gray-500 font-mono">PIN: <span className="font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{tech.pin}</span></p>
                    ) : (
                      <p className="text-xs text-amber-600 italic">Sem PIN (Sem acesso ao tablet)</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => startEditTech(tech)}
                    className="p-2 hover:bg-white hover:shadow text-gray-400 hover:text-blue-600 rounded-lg transition-all"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => startDeleteTech(tech)}
                    className="p-2 hover:bg-white hover:shadow text-gray-400 hover:text-red-600 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {activeTab === 'cards' && filteredCards.map(card => (
              <div key={card.id} className="p-4 flex items-center justify-between hover:bg-gray-50 bg-white transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">{card.bank} final {card.lastFourDigits}</h4>
                    <p className="text-xs text-gray-500">Titular: {card.holderName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => startEditCard(card)}
                    className="p-2 hover:bg-white hover:shadow text-gray-400 hover:text-blue-600 rounded-lg transition-all"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => startDeleteCard(card)}
                    className="p-2 hover:bg-white hover:shadow text-gray-400 hover:text-red-600 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {activeTab === 'equipments' && (
              <div className="flex flex-col">
                {/* Advanced header filters inside list view */}
                <div className="p-4 bg-gray-50 border-b border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Filtrar por Cliente</label>
                    <select
                      value={selectedClientForEquip}
                      onChange={(e) => {
                        setSelectedClientForEquip(e.target.value);
                        setSelectedAddressForEquip('');
                      }}
                      className="w-full text-xs px-3 py-2 bg-white border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-medium text-gray-700"
                    >
                      <option value="">Todos os Clientes</option>
                      {clients.slice().sort((a,b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Filtrar por Endereço</label>
                    <select
                      value={selectedAddressForEquip}
                      disabled={!selectedClientForEquip}
                      onChange={(e) => setSelectedAddressForEquip(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-medium text-gray-700 disabled:opacity-50"
                    >
                      <option value="">Todos os Endereços</option>
                      {addresses
                        .filter(a => a.clientId === selectedClientForEquip)
                        .slice()
                        .sort((a, b) => (a.street || '').localeCompare(b.street || ''))
                        .map(a => (
                          <option key={a.id} value={a.id}>{a.street} ({a.route})</option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Área de Importação de Planilha PMOC */}
                {pendingEquipments ? (
                  // Estado: Pendente de Verificação e Aprovação (Previsão)
                  <div className="p-5 bg-amber-50/70 border-b border-amber-100 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex gap-3 items-start justify-between">
                      <div className="flex gap-3 items-start">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm border border-amber-400">
                          <FileSpreadsheet className="w-5 h-5 animate-bounce" />
                        </div>
                        <div>
                          <h4 className="font-bold text-amber-900 text-sm flex flex-wrap items-center gap-2">
                            📋 Planilha Carregada - Pendente de Verificação e Aprovação
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">Aguardando Confirmação</span>
                          </h4>
                          <p className="text-xs text-amber-700 mt-1">
                            Arquivo: <strong className="font-semibold">{pendingFileName}</strong> • Foram extraídos <strong className="font-extrabold">{pendingEquipments.length} equipamentos</strong> prontos para serem cadastrados no endereço selecionado.
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={handleCancelImport}
                        className="p-1.5 hover:bg-amber-100 rounded-lg text-amber-500 transition-all cursor-pointer"
                        title="Cancelar Importação"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Tabela de Visualização de Amostra/Verificação */}
                    <div className="bg-white rounded-xl border border-amber-200/60 overflow-hidden max-h-60 overflow-y-auto shadow-xs">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-amber-100/40 text-amber-800 font-extrabold border-b border-amber-200/60 uppercase text-[9px] tracking-wider">
                            <th className="p-2 w-16 text-center">Ordem</th>
                            <th className="p-2">Equipamento</th>
                            <th className="p-2">Setor</th>
                            <th className="p-2 w-28">Marca</th>
                            <th className="p-2 w-20">Capacidade</th>
                            <th className="p-2 w-28">Patrimônio</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100/30 font-medium text-gray-700">
                          {pendingEquipments.map((eq, idx) => (
                            <tr key={idx} className="hover:bg-amber-50/30">
                              <td className="p-2 text-center font-mono font-bold text-amber-700">{eq.label}</td>
                              <td className="p-2 uppercase font-semibold">{eq.name}</td>
                              <td className="p-2 text-gray-500">{eq.sector}</td>
                              <td className="p-2 uppercase text-[10px]">{eq.brand || '-'}</td>
                              <td className="p-2 text-[10px]">{eq.btus ? `${eq.btus}` : '-'}</td>
                              <td className="p-2 font-mono text-gray-500 text-[10px]">{eq.patrimony || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1 border-t border-dashed border-amber-200/50">
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-800">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                        <span>Verifique as informações acima. Ao confirmar, todos os registros serão adicionados ao banco de dados.</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleCancelImport}
                          disabled={isSubmitting}
                          className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-600 hover:text-gray-800 font-bold text-xs uppercase tracking-wider rounded-xl border border-gray-200 transition-all cursor-pointer shadow-xs"
                        >
                          Descartar
                        </button>
                        <button
                          onClick={handleApproveImport}
                          disabled={isSubmitting}
                          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm hover:shadow flex items-center justify-center gap-2"
                        >
                          {isSubmitting ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Salvando...
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              Aprovar e Cadastrar
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Estado: Upload ou aviso de seleção
                  selectedClientForEquip && selectedAddressForEquip ? (
                    <div className="p-4 bg-blue-50/55 border-b border-blue-100 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-200">
                      <div className="flex gap-3 items-start">
                        <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-sm border border-blue-400">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                            Importar Planilha de Máquinas (PMOC)
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">Excel / CSV</span>
                          </h4>
                          <p className="text-xs text-gray-500 mt-0.5 max-w-xl">
                            Selecione o arquivo Excel ou CSV contendo as colunas de Ordem, Equipamento, Setor, Marca, BTUs e Patrimônio para importar em lote.
                          </p>
                          {importError && (
                            <p className="text-xs text-red-600 font-bold mt-1.5 flex items-center gap-1 bg-red-50 border border-red-100 p-1.5 rounded-lg">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              {importError}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        {(() => {
                          const addrObj = addresses.find(a => a.id === selectedAddressForEquip);
                          const clientObj = clients.find(c => c.id === selectedClientForEquip);
                          const isSEB = clientObj?.name?.toUpperCase()?.includes('SEB') && 
                                        (addrObj?.street?.toUpperCase()?.includes('SENADOR RUI PALMEIRA') || addrObj?.street?.toUpperCase()?.includes('RUI PALMEIRA'));
                          return isSEB && (
                            <button
                              onClick={handleImportSEB}
                              disabled={isSubmitting}
                              className="px-4 py-2 bg-blue-100 hover:bg-blue-200 border border-blue-200 disabled:bg-blue-50 text-blue-800 font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                              title="Importar 113 máquinas pré-configuradas do SEB COC"
                            >
                              ⚡ Cadastrar 113 Máquinas SEB COC
                            </button>
                          );
                        })()}
                        <label className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm hover:shadow flex items-center justify-center gap-2 shrink-0">
                          <FileText className="w-4 h-4" />
                          Fazer Upload de Planilha
                          <input 
                            type="file" 
                            accept=".xlsx,.xls,.csv" 
                            onChange={handleSpreadsheetUpload} 
                            className="hidden" 
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50/80 border-b border-gray-150 flex items-center gap-3 animate-in fade-in duration-200">
                      <AlertCircle className="w-5 h-5 text-gray-400 shrink-0" />
                      <p className="text-xs text-gray-500">
                        💡 <strong>Dica de Produtividade</strong>: Selecione um <strong>Cliente</strong> e um <strong>Endereço</strong> nos filtros acima para liberar a importação de planilhas de equipamentos em lote de forma automática.
                      </p>
                    </div>
                  )
                )}

                <div className="divide-y divide-gray-100">
                  {equipments
                    .filter(eq => {
                      if (selectedAddressForEquip && eq.addressId !== selectedAddressForEquip) return false;
                      if (selectedClientForEquip && !selectedAddressForEquip) {
                        const addr = addresses.find(a => a.id === eq.addressId);
                        if (!addr || addr.clientId !== selectedClientForEquip) return false;
                      }
                      if (searchTerm) {
                        const s = searchTerm.toLowerCase();
                        const addr = addresses.find(a => a.id === eq.addressId);
                        const client = clients.find(c => c.id === addr?.clientId);
                        return (
                          eq.name.toLowerCase().includes(s) ||
                          eq.sector.toLowerCase().includes(s) ||
                          eq.patrimony.toLowerCase().includes(s) ||
                          eq.id.includes(s) ||
                          addr?.street.toLowerCase().includes(s) ||
                          client?.name.toLowerCase().includes(s)
                        );
                      }
                      return true;
                    })
                    .map(eq => {
                      const addr = addresses.find(a => a.id === eq.addressId);
                      const client = clients.find(c => c.id === addr?.clientId);
                      return (
                        <div key={eq.id} className="p-4 flex items-center justify-between hover:bg-gray-50 bg-white transition-all group border-b border-gray-100 last:border-none">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 font-mono font-bold text-xs shrink-0 border border-blue-100">
                              {eq.id}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-gray-900 uppercase flex flex-wrap items-center gap-x-2 text-sm leading-tight">
                                <span>{eq.name}</span>
                                {eq.brand && <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded uppercase font-semibold">{eq.brand}</span>}
                                {eq.btus && <span className="text-[9px] bg-blue-50/80 text-blue-700 px-1.5 py-0.5 rounded font-semibold">{eq.btus} BTUs</span>}
                              </h4>
                              <div className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500 mt-1">
                                <span className="font-semibold text-gray-750 bg-gray-100/50 px-1.5 py-0.5 rounded">Setor: {eq.sector}</span>
                                <span className="text-gray-300">•</span>
                                <span>Pat: {eq.patrimony || 'S/N'}</span>
                                <span className="text-gray-300">•</span>
                                <span className="bg-amber-50 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-100/50">Ordem {eq.label}</span>
                              </div>
                              <p className="text-[10px] text-gray-400 mt-1.5 truncate max-w-xs md:max-w-md">
                                {client?.name} | {addr?.street}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                            <button
                              onClick={() => startEditEquipment(eq)}
                              className="p-2 hover:bg-gray-100 text-gray-450 hover:text-blue-600 rounded-lg transition-all"
                              title="Editar Equipamento"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => startDeleteEquipment(eq)}
                              className="p-2 hover:bg-gray-100 text-gray-450 hover:text-red-600 rounded-lg transition-all"
                              title="Excluir Equipamento"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {((activeTab === 'overview' && filteredClients.length === 0) ||
               (activeTab === 'clients' && filteredClients.length === 0) || 
               (activeTab === 'addresses' && filteredAddresses.length === 0) || 
               (activeTab === 'techs' && filteredTechs.length === 0) ||
               (activeTab === 'equipments' && equipments.length === 0) ||
               (activeTab === 'cards' && filteredCards.length === 0)) && (
              <div className="py-20 text-center text-gray-400 italic text-sm">
                Nenhum registro encontrado.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden">
            <div className={cn(
              "p-4 border-b flex items-center justify-between",
              confirmModal.type === 'client' || confirmModal.type === 'deactivate_address' 
                ? "bg-amber-50 border-amber-100" 
                : confirmModal.type === 'reactivate_address' 
                  ? "bg-emerald-50 border-emerald-100" 
                  : "bg-red-50 border-red-100"
            )}>
              <h3 className={cn(
                "font-bold flex items-center gap-2",
                confirmModal.type === 'client' || confirmModal.type === 'deactivate_address' 
                  ? "text-amber-800" 
                  : confirmModal.type === 'reactivate_address' 
                    ? "text-emerald-800" 
                    : "text-red-800"
              )}>
                {confirmModal.type === 'deactivate_address' ? (
                  <>
                    <PowerOff className="w-4 h-4 text-amber-600" />
                    Desabilitar Endereço
                  </>
                ) : confirmModal.type === 'reactivate_address' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Reabilitar Endereço
                  </>
                ) : confirmModal.type === 'client' ? (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Enviar Cliente para Lixeira
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Confirmar Exclusão
                  </>
                )}
              </h3>
              <button 
                onClick={() => setConfirmModal(null)}
                className="p-1 hover:bg-black/5 rounded-full text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {confirmModal.type === 'deactivate_address' ? (
                <>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Deseja desabilitar o endereço <strong className="text-gray-900">"{confirmModal.name}"</strong>?
                  </p>
                  <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-900 space-y-1.5 leading-relaxed">
                    <p className="font-semibold flex items-center gap-1.5 text-amber-800">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Como funciona a desabilitação:
                    </p>
                    <p>• O endereço <strong>não aparecerá mais no cronograma</strong> de rotas ou novas duplicações.</p>
                    <p>• Todos os dados, equipamentos e atendimentos passados <strong>permanecem intactos</strong> no banco de dados para futuras auditorias.</p>
                    <p>• Você poderá reativá-lo a qualquer momento nesta tela de Cadastros.</p>
                  </div>
                </>
              ) : confirmModal.type === 'reactivate_address' ? (
                <>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Deseja reabilitar o endereço <strong className="text-gray-900">"{confirmModal.name}"</strong>?
                  </p>
                  <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-xs text-emerald-900 space-y-1 leading-relaxed">
                    <p className="font-semibold flex items-center gap-1.5 text-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      Status Ativo:
                    </p>
                    <p>• O endereço voltará a ficar disponível e visível para inclusão nos cronogramas e rotas técnicas.</p>
                  </div>
                </>
              ) : confirmModal.type === 'client' ? (
                <>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Tem certeza de que deseja mover o cliente <strong className="text-gray-900">"{confirmModal.name}"</strong> para a lixeira?
                  </p>
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-xl p-3 border border-amber-100/70 mt-3 leading-relaxed">
                    Ele ficará <strong>inativo por 48 horas</strong>, período em que você ainda pode recuperá-lo na aba de Clientes de maneira simples. Após 48 horas, ele e todos os seus endereços serão removidos permanentemente.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Tem certeza que deseja excluir permanentemente: <br/>
                    <strong className="text-gray-900">"{confirmModal.name}"</strong>?
                  </p>
                  <p className="text-[10px] text-gray-400 mt-4 uppercase font-bold tracking-widest">
                    Esta ação não pode ser desfeita.
                  </p>
                </>
              )}
            </div>
            <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
              <button 
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 rounded-lg transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  if (confirmModal.type === 'deactivate_address') handleDeactivateAddress(confirmModal.id);
                  else if (confirmModal.type === 'reactivate_address') handleReactivateAddress(confirmModal.id);
                  else if (confirmModal.type === 'client') handleDeleteClient(confirmModal.id);
                  else if (confirmModal.type === 'address') handleDeleteAddress(confirmModal.id);
                  else if (confirmModal.type === 'tech') handleDeleteTech(confirmModal.id);
                  else if (confirmModal.type === 'card') handleDeleteCard(confirmModal.id);
                  else if (confirmModal.type === 'equipment') handleDeleteEquipment(confirmModal.id);
                }}
                className={cn(
                  "px-6 py-2 text-sm font-bold text-white rounded-lg transition-all shadow-md",
                  confirmModal.type === 'reactivate_address'
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                    : confirmModal.type === 'client' || confirmModal.type === 'deactivate_address'
                      ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200" 
                      : "bg-red-600 hover:bg-red-700 shadow-red-200"
                )}
              >
                {confirmModal.type === 'deactivate_address' 
                  ? 'Sim, Desabilitar' 
                  : confirmModal.type === 'reactivate_address'
                    ? 'Sim, Reabilitar'
                    : confirmModal.type === 'client' 
                      ? 'Mover para Lixeira' 
                      : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
