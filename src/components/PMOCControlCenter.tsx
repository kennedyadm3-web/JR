import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ImageRun,
  AlignmentType,
  VerticalAlign
} from 'docx';
import { MaintenanceRecord, Address, Client, Equipment, Technician, MaintenanceStatus, UserRole } from '../types';
import { FileText, Search, MapPin, CheckCircle, Printer, Filter, Settings, History, Info, ChevronRight, X, Briefcase, FileSignature, BookOpen, Trash2, ChevronDown, ChevronUp, CheckSquare, Square, Calendar, UserCheck, Save, Check, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { dataService } from '../services/dataService';
import { getCompanyConfigFromCache } from './CompanyLogo';

interface PMOCControlCenterProps {
  records: MaintenanceRecord[];
  addresses: Address[];
  clients: Client[];
  equipments: Equipment[];
  techs: Technician[];
  onPrintChecklist: (record: MaintenanceRecord, options?: { printPhotos?: boolean; printGeneralNotes?: boolean }) => void;
  onPrintBlankChecklist: (record: MaintenanceRecord, options?: { printPhotos?: boolean; printGeneralNotes?: boolean }) => void;
  onUpdateRecord: (record: MaintenanceRecord, updates: Partial<MaintenanceRecord>) => Promise<void>;
  userRole?: UserRole;
  month?: string;
  onMonthChange?: (month: string) => void;
}

export function PMOCControlCenter({ records, addresses, clients, equipments, techs, onPrintChecklist, onPrintBlankChecklist, onUpdateRecord, userRole, month, onMonthChange }: PMOCControlCenterProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [selectedCycleFilter, setSelectedCycleFilter] = useState<string>('all');
  const [selectedTechFilter, setSelectedTechFilter] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  // Group addresses by Client
  const activeClients = useMemo(() => {
    return clients.sort((a, b) => a.name.localeCompare(b.name));
  }, [clients]);

  // Reset cycle filter and selected address when client changes
  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    setSelectedCycleFilter('all');
    setSelectedAddressId(null);
    setSelectedTechFilter(null);
    setSelectedRecordId(null);
  };

  // Compute the last 10 scheduled preventive maintenances for the selected technician
  const last10TechRecords = useMemo(() => {
    if (!selectedTechFilter) return [];
    
    // Filter records where technician matches
    const filtered = records.filter(r => 
      r && (r.technician1 === selectedTechFilter || r.technician2 === selectedTechFilter)
    );
    
    // Sort by plannedDate descending (or month if plannedDate is empty)
    return filtered
      .sort((a, b) => {
        const valA = a?.plannedDate || `${a?.month || ''}-01`;
        const valB = b?.plannedDate || `${b?.month || ''}-01`;
        return valB.localeCompare(valA);
      })
      .slice(0, 10);
  }, [records, selectedTechFilter]);

  // Get available cycles for the selected client
  const availableCycles = useMemo(() => {
    if (!selectedClientId) return [];
    
    const clientObj = clients.find(c => c.id === selectedClientId);
    const cyclesSet = new Set<number>();
    
    // Add client's current contract cycle
    if (clientObj?.contractCycle) {
      cyclesSet.add(clientObj.contractCycle);
    }
    
    // Find all addresses for this client
    const clientAddressIds = new Set(addresses.filter(a => a && a.clientId === selectedClientId).map(a => a.id));
    
    // Add cycles from records associated with these addresses
    records.forEach(r => {
      if (r && clientAddressIds.has(r.addressId)) {
        const rCycle = r.cycle !== undefined && r.cycle !== null ? r.cycle : (clientObj?.contractCycle || 1);
        cyclesSet.add(rCycle);
      }
    });
    
    return Array.from(cyclesSet).sort((a, b) => b - a);
  }, [selectedClientId, clients, addresses, records]);

  // Filter addresses based on selected client and search
  const filteredAddresses = useMemo(() => {
    let result = addresses;
    if (selectedClientId) {
      result = result.filter(a => a.clientId === selectedClientId);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(a => {
        const client = clients.find(c => c.id === a.clientId);
        return a.street.toLowerCase().includes(term) || 
               (client && client.name.toLowerCase().includes(term));
      });
    }
    return result;
  }, [addresses, selectedClientId, searchTerm, clients]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-indigo-100 p-2.5 rounded-xl">
            <BookOpen className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">PMOC (Plano de Manutenção)</h2>
            <p className="text-sm text-slate-500 font-medium">Gestão central de manutenções preventivas por local</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
              placeholder="Buscar por endereço, bairro ou cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full md:w-64 relative">
             <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Filter className="h-4 w-4 text-slate-400" />
            </div>
            <select
              className="block w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none appearance-none cursor-pointer"
              value={selectedClientId}
              onChange={(e) => handleClientChange(e.target.value)}
            >
              <option value="">Todos os Clientes</option>
              {activeClients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>

          <div className="w-full md:w-56 relative">
             <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Calendar className="h-4 w-4 text-slate-400" />
            </div>
            <select
              disabled={!selectedClientId}
              className="block w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer"
              value={selectedCycleFilter}
              onChange={(e) => setSelectedCycleFilter(e.target.value)}
            >
              <option value="all">Todos os Ciclos</option>
              {availableCycles.map(cy => (
                <option key={cy} value={cy}>Ciclo {String(cy).padStart(3, '0')}</option>
              ))}
            </select>
          </div>

          <div className="w-full md:w-56 relative">
             <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <UserCheck className="h-4 w-4 text-slate-400" />
            </div>
            <select
              className="block w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none appearance-none cursor-pointer"
              value={selectedTechFilter || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setSelectedTechFilter(null);
                  setSelectedRecordId(null);
                } else {
                  setSelectedTechFilter(val);
                  setSelectedRecordId(null);
                  // Reset other filters/search to prevent visual conflicts
                  setSearchTerm('');
                  setSelectedClientId('');
                  setSelectedCycleFilter('all');
                }
              }}
            >
              <option value="">Todos os Técnicos</option>
              {techs.map(tech => (
                <option key={tech.id} value={tech.name}>{tech.name}</option>
              ))}
            </select>
          </div>

          {month && onMonthChange && (
            <div className="w-full md:w-48 relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Calendar className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="month"
                className="block w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none cursor-pointer"
                value={month}
                onChange={(e) => onMonthChange(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Endereços / Preventivas do Técnico */}
        <div className="lg:col-span-1 space-y-4 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
          {selectedTechFilter ? (
            // Modo Filtrado por Técnico: Mostrar as últimas 10 preventivas
            <>
              <div className="mb-2 px-1 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Últimas 10 Preventivas</span>
                <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded-md">{last10TechRecords.length} Encontradas</span>
              </div>
              
              {last10TechRecords.map(record => {
                const address = addresses.find(a => a.id === record.addressId);
                const client = address ? clients.find(c => c.id === address.clientId) : null;
                const addressEquips = equipments.filter(eq => eq.addressId === record.addressId);
                const isSelected = selectedRecordId === record.id;
                const isCompleted = record.status === MaintenanceStatus.COMPLETED;
                
                return (
                  <button
                    key={record.id}
                    onClick={() => {
                      setSelectedAddressId(record.addressId);
                      setSelectedRecordId(record.id);
                    }}
                    className={cn(
                      "w-full text-left p-4 rounded-2xl border transition-all duration-200 flex flex-col gap-2.5",
                      isSelected 
                        ? "bg-indigo-50 border-indigo-200 shadow-sm ring-1 ring-indigo-500" 
                        : "bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex justify-between items-start w-full">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider line-clamp-1 max-w-[70%]">
                        {client?.name || 'Cliente Temporário'}
                      </span>
                      <span className={cn(
                        "text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0",
                        isCompleted ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      )}>
                        {isCompleted ? 'Concluído' : 'Rascunho'}
                      </span>
                    </div>
                    
                    <div>
                      <h3 className="text-xs font-bold text-slate-850 line-clamp-2 leading-snug">
                        {address?.street || 'Local não encontrado'}
                      </h3>
                      <p className="text-[10px] text-slate-500 font-semibold mt-1 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {record.plannedDate 
                            ? format(parseISO(record.plannedDate), 'dd/MM/yyyy') 
                            : format(parseISO(`${record.month}-01`), 'MMMM yyyy', { locale: ptBR }).toUpperCase()}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-extrabold text-slate-600 bg-slate-50 px-2 py-1.5 rounded-xl border border-slate-100/70 w-full mt-1">
                      <span className="flex items-center gap-1">
                        <Settings className="w-3 h-3 text-slate-400" />
                        {addressEquips.length} Máq.
                      </span>
                      {record.executionDate && (
                        <span className="text-slate-400 text-[9px] font-medium">
                          Exec: {format(parseISO(record.executionDate), 'dd/MM')}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {last10TechRecords.length === 0 && (
                <div className="text-center p-8 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                  <UserCheck className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-xs font-bold text-slate-600">Nenhum agendamento recente para {selectedTechFilter}</p>
                </div>
              )}
            </>
          ) : (
            // Modo Tradicional: Mostrar Lista de Endereços
            <>
              {filteredAddresses.map(address => {
                const client = clients.find(c => c.id === address.clientId);
                const addressEquips = equipments.filter(eq => eq.addressId === address.id);
                const isSelected = selectedAddressId === address.id;
                
                return (
                  <button
                    key={address.id}
                    onClick={() => {
                      setSelectedAddressId(address.id);
                      setSelectedRecordId(null);
                    }}
                    className={cn(
                      "w-full text-left p-4 rounded-2xl border transition-all duration-200",
                      isSelected 
                        ? "bg-indigo-50 border-indigo-200 shadow-sm ring-1 ring-indigo-500" 
                        : "bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-black text-slate-500 uppercase tracking-wider">{client?.name}</span>
                      <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg">
                        <Settings className="w-3 h-3 text-slate-500" />
                        <span className="text-[10px] font-bold text-slate-700">{addressEquips.length} Máq.</span>
                      </div>
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 line-clamp-2 leading-snug">{address.street}</h3>
                  </button>
                );
              })}
              {filteredAddresses.length === 0 && (
                <div className="text-center p-8 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
                  <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-600">Nenhum endereço encontrado</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Detalhes do Endereço Selecionado */}
        <div className="lg:col-span-2">
          {selectedAddressId ? (
            <AddressDetails 
              addressId={selectedAddressId} 
              addresses={addresses}
              clients={clients}
              equipments={equipments}
              records={records}
              techs={techs}
              selectedCycleFilter={selectedCycleFilter}
              onPrintChecklist={onPrintChecklist}
              onPrintBlankChecklist={onPrintBlankChecklist}
              onUpdateRecord={onUpdateRecord}
              selectedRecordId={selectedRecordId}
              userRole={userRole}
            />
          ) : (
            <div className="bg-slate-50 border border-slate-200 border-dashed rounded-3xl h-full min-h-[400px] flex flex-col items-center justify-center p-12 text-center">
              <div className="bg-white p-4 rounded-full shadow-sm border border-slate-100 mb-4">
                <FileSignature className="w-8 h-8 text-indigo-400" />
              </div>
              <h3 className="text-lg font-black text-slate-700 mb-2">Selecione um Endereço</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                Escolha um local na lista ao lado para gerenciar o plano de manutenção e imprimir as planilhas PMOC já realizadas.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddressDetails({ addressId, addresses, clients, equipments, records, techs, selectedCycleFilter, onPrintChecklist, onPrintBlankChecklist, onUpdateRecord, selectedRecordId, userRole }: { 
  addressId: string, 
  addresses: Address[],
  clients: Client[],
  equipments: Equipment[],
  records: MaintenanceRecord[],
  techs: Technician[],
  selectedCycleFilter: string,
  onPrintChecklist: (record: MaintenanceRecord, options?: { printPhotos?: boolean; printGeneralNotes?: boolean }) => void,
  onPrintBlankChecklist: (record: MaintenanceRecord, options?: { printPhotos?: boolean; printGeneralNotes?: boolean }) => void,
  onUpdateRecord: (record: MaintenanceRecord, updates: Partial<MaintenanceRecord>) => Promise<void>,
  selectedRecordId: string | null,
  userRole?: UserRole
}) {
  const address = addresses.find(a => a.id === addressId);
  const client = address ? clients.find(c => c.id === address.clientId) : null;
  const addressEquips = equipments.filter(eq => eq.addressId === addressId);

  // Estado para o histórico completo do endereço carregado do Firestore
  const [historyRecords, setHistoryRecords] = useState<MaintenanceRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  useEffect(() => {
    if (!addressId) return;
    
    // Inicializar com o que já temos em props (evita tela em branco / atrasos)
    const initialRecords = records.filter(r => r && r.addressId === addressId);
    setHistoryRecords(initialRecords);

    let active = true;
    setLoadingHistory(true);
    
    dataService.getRecordsByAddress(addressId)
      .then(res => {
        if (active && res) {
          // Filtrar possíveis nulos/indefinidos
          const validRecords = res.filter(Boolean);
          setHistoryRecords(validRecords);
        }
      })
      .catch(err => {
        console.error("Erro ao carregar histórico de manutenções:", err);
      })
      .finally(() => {
        if (active) {
          setLoadingHistory(false);
        }
      });
      
    return () => {
      active = false;
    };
  }, [addressId, records]);
  
  // Estados para baixa manual
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [selectedEquipIds, setSelectedEquipIds] = useState<Set<string>>(new Set());
  const [selectedTech1, setSelectedTech1] = useState<string>('');
  const [selectedTech2, setSelectedTech2] = useState<string>('');
  const [executionDate, setExecutionDate] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [manualSuccessMsg, setManualSuccessMsg] = useState<string>('');

  // Estados para opções de impressão
  const [printPhotos, setPrintPhotos] = useState<boolean>(true);
  const [printGeneralNotes, setPrintGeneralNotes] = useState<boolean>(true);

  // Estado para controlar quais cards de histórico estão expandidos
  const [expandedHistoryRecords, setExpandedHistoryRecords] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (selectedRecordId) {
      setExpandedHistoryRecords(prev => ({ ...prev, [selectedRecordId]: true }));
    }
  }, [selectedRecordId]);

  const handleExportToExcel = (record: MaintenanceRecord) => {
    const printAddress = addresses.find(a => a.id === record.addressId);
    const printClient = printAddress ? clients.find(c => c.id === printAddress.clientId) : null;
    const clientName = printClient?.fullName || printClient?.name || 'Cliente';
    const addressStreet = printAddress ? `${printAddress.street}, ${printAddress.number || ''} ${printAddress.complement || ''} - ${printAddress.neighborhood || ''}, ${printAddress.city || ''} - ${printAddress.state || ''}` : 'Endereço não definido';
    const contractNum = printClient?.contractNumber || record.assignedRoute || '';
    const printCompanyKey = printClient?.serviceCompany || 'lefrio';

    const companyDetails = printCompanyKey === 'alclima' ? {
      name: 'AL CLIMA COMERCIO E SERVICOS LTDA',
      cnpj: '38.231.188/0001-51',
      address: 'RUA RITA DE CASSIA, 42 - GRUTA DE LOURDES - MACEIO - AL',
      email: 'atendimento@alclima.com.br',
      phone: '(82) 3435-1524',
      bgPrimary: 'FF065F46', // Emerald dark green for banner
      bgSecondary: 'FF90EE90', // Light green for headers & fields
    } : {
      name: 'JR COMÉRCIO E SERVIÇOS DE CLIMATIZAÇÃO LTDA',
      cnpj: '22.731.413/0002-60',
      address: 'RUA DR. ELISIO ALVES PEROBA, 103 - ANTARES - MACEIO - AL',
      email: 'atendimentomaceio@lefrio.com.br',
      phone: '(82) 3221-1031',
      bgPrimary: 'FF3556A8', // Le Frio dark blue for banner
      bgSecondary: 'FF9CBDDE', // Le Frio light blue for headers & fields
    };
    
    // Helpers para referência do ciclo e mês
    const getMonthAbbr = (monthStr: string) => {
      const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
      try {
        const parts = monthStr.split('-');
        const mIndex = parseInt(parts[1], 10) - 1;
        if (mIndex >= 0 && mIndex < 12) {
          return `${months[mIndex]}/${parts[0]}`;
        }
      } catch (e) {}
      return monthStr;
    };

    const formatDateBRL = (dateStr?: string) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    };

    const getFormattedCycleStr = () => {
      const rawCycle = printClient?.contractCycle || record.cycle || 1;
      const num = String(rawCycle).padStart(3, '0');
      const formatType = printClient?.cycleRefFormat || 'number_only';
      
      const start = formatDateBRL(printClient?.cycleStartDate);
      const end = formatDateBRL(printClient?.cycleEndDate);
      const abbr = getMonthAbbr(record.month);
      
      if (formatType === 'full_period' && start && end) {
        return `${num} - ${start} a ${end} (${abbr})`;
      }
      if (formatType === 'number_month') {
        return `${num} - ${abbr}`;
      }
      if (formatType === 'period_only' && start && end) {
        return `${start} a ${end} (${abbr})`;
      }
      return num;
    };

    const formattedCycle = getFormattedCycleStr();

    // Buscar e ordenar equipamentos
    const recordEquipments = equipments
      .filter(eq => eq.addressId === record.addressId)
      .sort((a, b) => (a.label || '').localeCompare(b.label || '', undefined, { numeric: true, sensitivity: 'base' }));

    // Calcular as datas de execução de forma única
    const uniqueDatesSet = new Set<string>();
    if (record.checklist) {
      record.checklist.forEach(item => {
        if (item && item.checkedAt) {
          try {
            const d = new Date(item.checkedAt);
            if (!isNaN(d.getTime())) {
              const day = String(d.getDate()).padStart(2, '0');
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const y = d.getFullYear();
              uniqueDatesSet.add(`${day}/${m}/${y}`);
            }
          } catch (e) {}
        }
      });
    }
    if (uniqueDatesSet.size === 0 && record.executionDate) {
      try {
        const d = parseISO(record.executionDate);
        if (!isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const y = d.getFullYear();
          uniqueDatesSet.add(`${day}/${m}/${y}`);
        }
      } catch (e) {}
    }
    const uniquePrintDates = Array.from(uniqueDatesSet).sort();
    const printDatesText = uniquePrintDates.length > 0 ? uniquePrintDates.join(', ') : 'Nenhuma data registrada';

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

        // Floco de Neve no topo centro (x=115, y=56)
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

    // Inicializar Planilha ExcelJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('PMOC');

    // Configurar linhas de grade visíveis
    worksheet.views = [{ showGridLines: true }];

    // Larguras das colunas A a N (proporcionais e harmônicas para impressão e visualização de acordo com o padrão corporativo)
    worksheet.columns = [
      { key: 'colA', width: 2.5 },   // A: margem muito estreita
      { key: 'colB', width: 6 },     // B: pequena (Item)
      { key: 'colC', width: 8 },     // C: pequena (Setor - parte 1)
      { key: 'colD', width: 2 },     // D: extremamente estreita (separação)
      { key: 'colE', width: 22 },    // E: larga (Setor - parte 3) -> mesclado C:E
      { key: 'colF', width: 18 },    // F: média (Equipamento)
      { key: 'colG', width: 14 },    // G: média (Marca)
      { key: 'colH', width: 14 },    // H: média (Capacidade / BTUs)
      { key: 'colI', width: 12 },    // I: média (ID/Etiqueta - parte 1)
      { key: 'colJ', width: 2 },     // J: extremamente estreita (separação)
      { key: 'colK', width: 8 },     // K: pequena (ID/Etiqueta - parte 3) -> mesclado I:K
      { key: 'colL', width: 18 },    // L: média/grande (Assinatura/Visto)
      { key: 'colM', width: 8 },     // M: pequena (Observações - parte 1)
      { key: 'colN', width: 20 }     // N: grande (Observações - parte 2) -> mesclado M:N
    ];

    // --- LINHA 1, 2, 3, 4, 5: Cabeçalho com Logo e Informações da Empresa (IDÊNTICO AO IMPRESSO) ---
    worksheet.mergeCells('B1:C5');
    
    try {
      const logoDataUrl = getCompanyLogoBase64(printCompanyKey);
      const logoImageId = workbook.addImage({
        base64: logoDataUrl.split(',')[1],
        extension: 'png',
      });
      worksheet.addImage(logoImageId, {
        tl: { col: 1.2, row: 0.3 },
        br: { col: 2.8, row: 4.7 },
        editAs: 'oneCell'
      } as any);
    } catch (err) {
      console.error("Erro ao inserir logo no Excel:", err);
    }

    // Informações da Empresa (E2:I3 mesclado)
    worksheet.mergeCells('E2:I3');
    const cellCompInfo = worksheet.getCell('E2');
    cellCompInfo.value = `${companyDetails.name}\nCNPJ: ${companyDetails.cnpj}\nEndereço: ${companyDetails.address}\nE-mail: ${companyDetails.email} - Telefone: ${companyDetails.phone}`;
    cellCompInfo.font = { name: 'Arial', size: 8, color: { argb: 'FF1F2937' } };
    cellCompInfo.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

    // Informações da página (K2:N2 mesclado)
    worksheet.mergeCells('K2:N2');
    const cellPageInfo = worksheet.getCell('K2');
    cellPageInfo.value = `Página: 1 de 1\nMês: ${getMonthAbbr(record.month).toUpperCase()}`;
    cellPageInfo.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF111827' } };
    cellPageInfo.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };

    // Linha divisória de baixo do cabeçalho
    for (let c = 2; c <= 14; c++) {
      const cell = worksheet.getCell(4, c);
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF000000' } }
      };
    }

    worksheet.getRow(1).height = 15;
    worksheet.getRow(2).height = 15;
    worksheet.getRow(3).height = 15;
    worksheet.getRow(4).height = 15;
    worksheet.getRow(5).height = 15;

    // Espaçador
    worksheet.getRow(7).height = 10;

    // --- LINHA 5: Título Principal PMOC (Mesclado E5:N6) ---
    worksheet.mergeCells('E5:N6');
    const cellMainTitle = worksheet.getCell('E5');
    cellMainTitle.value = 'RELATÓRIO DE MANUTENÇÃO PREVENTIVA MENSAL (CONFORME PMOC)';
    cellMainTitle.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
    cellMainTitle.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(6).height = 15;

    // Espaçador
    worksheet.getRow(8).height = 8;

    // --- LINHA 9 & 10: Caixa de Informações (Cliente, Contrato, Endereço, Ciclo) ---
    const brandColorHex = printCompanyKey === 'lefrio' ? 'FF9CBDDE' : 'FF90EE90';
    
    for (let r = 9; r <= 10; r++) {
      for (let c = 2; c <= 14; c++) {
        const cell = worksheet.getCell(r, c);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: brandColorHex }
        };
        const borderObj: any = {};
        if (r === 9) borderObj.top = { style: 'medium', color: { argb: 'FF000000' } };
        if (r === 10) borderObj.bottom = { style: 'medium', color: { argb: 'FF000000' } };
        if (c === 2) borderObj.left = { style: 'medium', color: { argb: 'FF000000' } };
        if (c === 14) borderObj.right = { style: 'medium', color: { argb: 'FF000000' } };
        
        cell.border = borderObj;
      }
    }

    // Bloco Cliente: B9:M9
    worksheet.mergeCells('B9:M9');
    const cellFieldName = worksheet.getCell('B9');
    cellFieldName.value = `CLIENTE: ${clientName.toUpperCase()}`;
    cellFieldName.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF000000' } };
    cellFieldName.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };

    // Bloco Contrato: N9 (pequeno bloco à direita)
    const cellFieldContract = worksheet.getCell('N9');
    cellFieldContract.value = `CONTRATO: ${String(contractNum).toUpperCase()}`;
    cellFieldContract.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF000000' } };
    cellFieldContract.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };

    // Bloco Endereço: B10:I10
    worksheet.mergeCells('B10:I10');
    const cellFieldAddr = worksheet.getCell('B10');
    cellFieldAddr.value = `ENDEREÇO: ${addressStreet.toUpperCase()}`;
    cellFieldAddr.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF000000' } };
    cellFieldAddr.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };

    // Bloco Ciclo: J10:N10
    worksheet.mergeCells('J10:N10');
    const cellFieldCycle = worksheet.getCell('J10');
    cellFieldCycle.value = `CICLO: ${formattedCycle.toUpperCase()}`;
    cellFieldCycle.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF000000' } };
    cellFieldCycle.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };

    worksheet.getRow(9).height = 20;
    worksheet.getRow(10).height = 20;

    // Espaçador
    worksheet.getRow(11).height = 10;

    // --- LINHA 12: Cabeçalho da Tabela ---
    // Cabeçalho "Setor": C12:E12
    // Cabeçalho "ID": I12:K12
    // Cabeçalho "Observações": M12:N12
    worksheet.mergeCells('C12:E12');
    worksheet.mergeCells('I12:K12');
    worksheet.mergeCells('M12:N12');

    const headersMap = {
      B: "Item",
      C: "Setor",
      F: "Equipamento",
      G: "Marca",
      H: "BTUs",
      I: "ID/Etiqueta",
      L: "Visto do Técnico",
      M: "Obs."
    };

    const headerCols = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];
    headerCols.forEach((col) => {
      const cell = worksheet.getCell(`${col}12`);
      cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF000000' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: brandColorHex }
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF000000' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle'
      };
    });

    worksheet.getCell('B12').value = headersMap.B;
    worksheet.getCell('C12').value = headersMap.C;
    worksheet.getCell('F12').value = headersMap.F;
    worksheet.getCell('G12').value = headersMap.G;
    worksheet.getCell('H12').value = headersMap.H;
    worksheet.getCell('I12').value = headersMap.I;
    worksheet.getCell('L12').value = headersMap.L;
    worksheet.getCell('M12').value = headersMap.M;

    worksheet.getRow(12).height = 24;

    // Linha com o Nome do Cliente (Sub-cabeçalho) idêntica à linha extra do PDF de impressão
    worksheet.mergeCells('B13:N13');
    const cellSubHeaderClient = worksheet.getCell('B13');
    cellSubHeaderClient.value = clientName.toUpperCase();
    cellSubHeaderClient.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF000000' } };
    cellSubHeaderClient.alignment = {
      horizontal: 'center',
      vertical: 'middle'
    };
    for (let c = 2; c <= 14; c++) {
      const cell = worksheet.getCell(13, c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFFFF' }
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    }
    worksheet.getRow(13).height = 20;

    const formatBtusValue = (btuVal: any): string => {
      if (!btuVal) return '-';
      const parsed = parseInt(String(btuVal).replace(/\D/g, ''), 10);
      if (isNaN(parsed)) return String(btuVal);
      return parsed.toLocaleString('pt-BR');
    };

    // --- LINHA 14 em diante: Equipamentos ---
    let currentRowNum = 14;
    recordEquipments.forEach((eq, index) => {
      const existingChecklist = record.checklist || [];
      const found = existingChecklist.find(item => item && item.equipmentId === eq.id);
      const isChecked = found ? found.checked : false;
      const isSkipped = found ? found.skipped : false;
      const obsValue = found ? found.notes : '';
      
      let statusText = '';
      let itemDate = '';
      
      if (found?.checkedAt) {
        try {
          const d = new Date(found.checkedAt);
          if (!isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, '0');
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const y = d.getFullYear();
            itemDate = `${day}/${m}/${y}`;
          }
        } catch (e) {}
      }
      
      if (!itemDate) {
        if (record.executionDate) {
          try {
            const d = parseISO(record.executionDate);
            if (!isNaN(d.getTime())) {
              const day = String(d.getDate()).padStart(2, '0');
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const y = d.getFullYear();
              itemDate = `${day}/${m}/${y}`;
            }
          } catch (e) {}
        } else {
          const d = new Date();
          const day = String(d.getDate()).padStart(2, '0');
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const y = d.getFullYear();
          itemDate = `${day}/${m}/${y}`;
        }
      }
      
      if (isChecked && !isSkipped) {
        let timeText = '';
        if (found?.checkedAt) {
          try {
            const d = new Date(found.checkedAt);
            if (!isNaN(d.getTime())) {
              const hrs = String(d.getHours()).padStart(2, '0');
              const mins = String(d.getMinutes()).padStart(2, '0');
              timeText = ` ${hrs}:${mins}`;
            }
          } catch (e) {
            if (found.checkedAt.includes('T')) {
              const parts = found.checkedAt.split('T')[1];
              if (parts) {
                timeText = ' ' + parts.substring(0, 5);
              }
            }
          }
        }
        statusText = `(APP: ${itemDate}${timeText} ${record.technician1 || 'Técnico'})`;
      } else if (isSkipped) {
        const hasJustification = found?.justification && found.justification.trim().length > 0;
        statusText = hasJustification ? `PULADO EM ${itemDate}` : '';
      } else {
        statusText = '';
      }

      // Mesclagens da linha da tabela
      worksheet.mergeCells(`C${currentRowNum}:E${currentRowNum}`);
      worksheet.mergeCells(`I${currentRowNum}:K${currentRowNum}`);
      worksheet.mergeCells(`M${currentRowNum}:N${currentRowNum}`);

      worksheet.getCell(`B${currentRowNum}`).value = index + 1;
      worksheet.getCell(`C${currentRowNum}`).value = (eq.sector || '-').toUpperCase();
      worksheet.getCell(`F${currentRowNum}`).value = (eq.name || '-').toUpperCase();
      worksheet.getCell(`G${currentRowNum}`).value = (eq.brand || '-').toUpperCase();
      worksheet.getCell(`H${currentRowNum}`).value = formatBtusValue(eq.btus);
      worksheet.getCell(`I${currentRowNum}`).value = (eq.patrimony || eq.id.slice(0, 6)).toUpperCase();
      worksheet.getCell(`L${currentRowNum}`).value = statusText;
      worksheet.getCell(`M${currentRowNum}`).value = (obsValue || '').toUpperCase();

      const colsToStyle = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];
      colsToStyle.forEach((col) => {
        const cell = worksheet.getCell(`${col}${currentRowNum}`);
        cell.font = { name: 'Arial', size: 9, color: { argb: 'FF1F2937' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
        
        // Alinhamento inteligente
        if (col === 'B' || col === 'H' || col === 'L') {
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        } else if (col === 'I' || col === 'J' || col === 'K') {
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }

        // Estilos para coluna do visto (L)
        if (col === 'L' && statusText !== '') {
          if (statusText.includes('PULADO')) {
            cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FFD97706' } }; // Âmbar
          } else {
            cell.font = { name: 'Arial', size: 8, color: { argb: 'FF111827' } };
          }
        }
      });

      worksheet.getRow(currentRowNum).height = 22;
      currentRowNum++;
    });

    // Duas linhas totalmente mescladas em toda a largura útil (B a N) após os registros
    // "Servem para observações, assinatura ou informações adicionais."
    worksheet.mergeCells(`B${currentRowNum}:N${currentRowNum}`);
    for (let c = 2; c <= 14; c++) {
      worksheet.getCell(currentRowNum, c).border = {
        bottom: { style: 'thin', color: { argb: 'FF000000' } }
      };
    }
    worksheet.getRow(currentRowNum).height = 18;
    currentRowNum++;

    worksheet.mergeCells(`B${currentRowNum}:N${currentRowNum}`);
    for (let c = 2; c <= 14; c++) {
      worksheet.getCell(currentRowNum, c).border = {
        bottom: { style: 'thin', color: { argb: 'FF000000' } }
      };
    }
    worksheet.getRow(currentRowNum).height = 18;
    currentRowNum++;

    // --- CAIXA DE OBSERVAÇÃO GERAL (Se ativado e houver observação) ---
    if (record.routeNotes && printGeneralNotes) {
      currentRowNum += 1;
      worksheet.mergeCells(`B${currentRowNum}:N${currentRowNum}`);
      const cellNotes = worksheet.getCell(`B${currentRowNum}`);
      cellNotes.value = `OBS GERAL: ${record.routeNotes.toUpperCase()}`;
      cellNotes.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF1F2937' } };
      cellNotes.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF9FAFB' }
      };
      cellNotes.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      cellNotes.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
      worksheet.getRow(currentRowNum).height = 28;
    }

    // --- RODAPÉ COM ASSINATURAS E AUTENTICAÇÃO ---
    currentRowNum += 2; // Espaço em branco

    // Inserir Assinatura do Representante do Cliente (Se houver) no espaço em branco acima do nome
    if (record.clientSignature && record.clientSignature.startsWith('data:image/')) {
      try {
        const signatureBase64 = record.clientSignature.split(',')[1];
        const imageExtension = record.clientSignature.split(';')[0].split('/')[1] || 'png';
        const imageId = workbook.addImage({
          base64: signatureBase64,
          extension: imageExtension as any,
        });
        worksheet.addImage(imageId, {
          tl: { col: 9.2, row: currentRowNum - 1.8 },
          br: { col: 12.8, row: currentRowNum - 0.2 },
          editAs: 'oneCell'
        } as any);
      } catch (err) {
        console.error("Erro ao incluir assinatura digital no Excel:", err);
      }
    }

    // Adiciona uma linha inferior para simular a linha física de assinatura do cliente
    worksheet.mergeCells(`I${currentRowNum - 1}:N${currentRowNum - 1}`);
    for (let c = 9; c <= 14; c++) {
      worksheet.getCell(currentRowNum - 1, c).border = {
        bottom: { style: 'thin', color: { argb: 'FF000000' } }
      };
    }

    // Linhas de assinatura/labels
    worksheet.mergeCells(`B${currentRowNum}:H${currentRowNum}`);
    for (let c = 2; c <= 8; c++) {
      const cell = worksheet.getCell(currentRowNum, c);
      cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF065F46' } }; // Verde escuro elegante
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    }
    worksheet.getCell(`B${currentRowNum}`).value = "EQUIPE TÉCNICA AUTENTICADA";

    worksheet.mergeCells(`I${currentRowNum}:N${currentRowNum}`);
    for (let c = 9; c <= 14; c++) {
      const cell = worksheet.getCell(currentRowNum, c);
      cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF1F2937' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
    worksheet.getCell(`I${currentRowNum}`).value = "ASSINATURA DO RESPONSÁVEL DO CLIENTE";
    worksheet.getRow(currentRowNum).height = 20;

    currentRowNum++;

    // Nomes e Detalhes
    worksheet.mergeCells(`B${currentRowNum}:H${currentRowNum}`);
    const cellTechVal = worksheet.getCell(`B${currentRowNum}`);
    const techName1 = record.technician1 || '-';
    const techName2 = record.technician2 ? ` / ${record.technician2}` : '';
    cellTechVal.value = `${techName1}${techName2}`.toUpperCase();
    cellTechVal.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF111827' } };
    cellTechVal.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    worksheet.mergeCells(`I${currentRowNum}:N${currentRowNum}`);
    for (let c = 9; c <= 14; c++) {
      const cell = worksheet.getCell(currentRowNum, c);
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF111827' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
    const repName = record.clientSigneeName || '-';
    const repMatricula = record.clientSigneeRegistration ? ` (MATRÍCULA: ${record.clientSigneeRegistration})` : '';
    worksheet.getCell(`I${currentRowNum}`).value = `${repName}${repMatricula}`.toUpperCase();
    worksheet.getRow(currentRowNum).height = 20;

    currentRowNum++;

    // Linha de Autenticação / Linhas divisórias inferiores
    worksheet.mergeCells(`B${currentRowNum}:H${currentRowNum}`);
    const cellTechAuth = worksheet.getCell(`B${currentRowNum}`);
    cellTechAuth.value = `Autenticado via App em ${printDatesText}`;
    cellTechAuth.font = { name: 'Arial', size: 8, color: { argb: 'FF6B7280' }, italic: true };
    cellTechAuth.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    worksheet.getRow(currentRowNum).height = 16;

    // Gerar Buffer e fazer Download do Arquivo Excel
    workbook.xlsx.writeBuffer().then((buffer) => {
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const cleanClientName = clientName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `PMOC_${cleanClientName}_${record.month}.xlsx`;

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.URL.revokeObjectURL(url);
    }).catch(err => {
      console.error("Erro ao gerar planilha Excel estilizada:", err);
    });
  };

  const handleExportToWord = (record: MaintenanceRecord) => {
    const printAddress = addresses.find(a => a.id === record.addressId);
    const printClient = printAddress ? clients.find(c => c.id === printAddress.clientId) : null;
    const clientName = printClient?.fullName || printClient?.name || 'Cliente';
    const addressStreet = printAddress ? `${printAddress.street}, ${printAddress.number || ''} ${printAddress.complement || ''} - ${printAddress.neighborhood || ''}, ${printAddress.city || ''} - ${printAddress.state || ''}` : 'Endereço não definido';
    const contractNum = printClient?.contractNumber || record.assignedRoute || '';
    const printCompanyKey = printClient?.serviceCompany || 'lefrio';

    const companyDetails = printCompanyKey === 'alclima' ? {
      name: 'AL CLIMA COMERCIO E SERVICOS LTDA',
      cnpj: '38.231.188/0001-51',
      address: 'RUA RITA DE CASSIA, 42 - GRUTA DE LOURDES - MACEIO - AL',
      email: 'atendimento@alclima.com.br',
      phone: '(82) 3435-1524',
      bgPrimary: 'FF065F46',
      bgSecondary: '90EE90',
    } : {
      name: 'JR COMÉRCIO E SERVIÇOS DE CLIMATIZAÇÃO LTDA',
      cnpj: '22.731.413/0002-60',
      address: 'RUA DR. ELISIO ALVES PEROBA, 103 - ANTARES - MACEIO - AL',
      email: 'atendimentomaceio@lefrio.com.br',
      phone: '(82) 3221-1031',
      bgPrimary: 'FF3556A8',
      bgSecondary: '9CBDDE',
    };

    const brandColorHex = companyDetails.bgSecondary;

    // Helpers para referência do ciclo e mês
    const getMonthAbbr = (monthStr: string) => {
      const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
      try {
        const parts = monthStr.split('-');
        const mIndex = parseInt(parts[1], 10) - 1;
        if (mIndex >= 0 && mIndex < 12) {
          return `${months[mIndex]}/${parts[0]}`;
        }
      } catch (e) {}
      return monthStr;
    };

    const formatDateBRL = (dateStr?: string) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    };

    const getFormattedCycleStr = () => {
      const rawCycle = printClient?.contractCycle || record.cycle || 1;
      const num = String(rawCycle).padStart(3, '0');
      const formatType = printClient?.cycleRefFormat || 'number_only';
      
      const start = formatDateBRL(printClient?.cycleStartDate);
      const end = formatDateBRL(printClient?.cycleEndDate);
      const abbr = getMonthAbbr(record.month);
      
      if (formatType === 'full_period' && start && end) {
        return `${num} - ${start} a ${end} (${abbr})`;
      }
      if (formatType === 'number_month') {
        return `${num} - ${abbr}`;
      }
      if (formatType === 'period_only' && start && end) {
        return `${start} a ${end} (${abbr})`;
      }
      return num;
    };

    const formattedCycle = getFormattedCycleStr();

    // Buscar e ordenar equipamentos
    const recordEquipments = equipments
      .filter(eq => eq.addressId === record.addressId)
      .sort((a, b) => (a.label || '').localeCompare(b.label || '', undefined, { numeric: true, sensitivity: 'base' }));

    // Calcular as datas de execução de forma única
    const uniqueDatesSet = new Set<string>();
    if (record.checklist) {
      record.checklist.forEach(item => {
        if (item && item.checkedAt) {
          try {
            const d = new Date(item.checkedAt);
            if (!isNaN(d.getTime())) {
              const day = String(d.getDate()).padStart(2, '0');
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const y = d.getFullYear();
              uniqueDatesSet.add(`${day}/${m}/${y}`);
            }
          } catch (e) {}
        }
      });
    }
    if (uniqueDatesSet.size === 0 && record.executionDate) {
      try {
        const d = parseISO(record.executionDate);
        if (!isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const y = d.getFullYear();
          uniqueDatesSet.add(`${day}/${m}/${y}`);
        }
      } catch (e) {}
    }
    const uniquePrintDates = Array.from(uniqueDatesSet).sort();
    const printDatesText = uniquePrintDates.length > 0 ? uniquePrintDates.join(', ') : 'Nenhuma data registrada';

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
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 280, 200);

        ctx.strokeStyle = '#68B7F2';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        const drawWave = (yOffset: number) => {
          ctx.beginPath();
          ctx.moveTo(40, yOffset);
          ctx.bezierCurveTo(90, yOffset - 20, 150, yOffset + 20, 240, yOffset);
          ctx.stroke();
        };
        drawWave(25);
        drawWave(48);
        drawWave(71);
        drawWave(94);

        ctx.strokeStyle = '#3556A8';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(35, 125);
        ctx.lineTo(35, 175);
        ctx.lineTo(55, 175);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(85, 125);
        ctx.lineTo(65, 125);
        ctx.lineTo(65, 175);
        ctx.lineTo(85, 175);
        ctx.moveTo(65, 150);
        ctx.lineTo(80, 150);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(105, 175);
        ctx.lineTo(105, 125);
        ctx.lineTo(125, 125);
        ctx.moveTo(105, 150);
        ctx.lineTo(120, 150);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(140, 175);
        ctx.lineTo(140, 125);
        ctx.lineTo(158, 125);
        ctx.bezierCurveTo(172, 125, 172, 150, 158, 150);
        ctx.lineTo(140, 150);
        ctx.moveTo(154, 150);
        ctx.lineTo(168, 175);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(185, 125);
        ctx.lineTo(185, 175);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(215, 130);
        ctx.lineTo(235, 130);
        ctx.bezierCurveTo(248, 130, 248, 170, 235, 170);
        ctx.lineTo(215, 170);
        ctx.bezierCurveTo(202, 170, 202, 130, 215, 130);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.fillStyle = '#143e1d';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(0, 0, 280, 200, 12);
        } else {
          ctx.rect(0, 0, 280, 200);
        }
        ctx.fill();

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

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        
        const cx = 140;
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

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Arial';
        ctx.fillText('AL', 35, 140);
        ctx.fillStyle = '#2fe058';
        ctx.fillText('CLIMA', 95, 140);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Arial';
        ctx.fillText('REFRIGERAÇÃO', 70, 168);
      }

      return canvas.toDataURL('image/png');
    };

    const base64ToUint8Array = (base64Str: string): Uint8Array => {
      const base64Clean = base64Str.includes(',') ? base64Str.split(',')[1] : base64Str;
      const binaryString = window.atob(base64Clean);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    };

    const formatDateSafe = (dateStr: string | null | undefined, formatStr: string = 'dd/MM/yyyy'): string => {
      if (!dateStr) return '';
      try {
        const parsed = parseISO(dateStr);
        if (isNaN(parsed.getTime())) {
          const fallbackDate = new Date(dateStr);
          if (isNaN(fallbackDate.getTime())) {
            return dateStr || '';
          }
          return format(fallbackDate, formatStr);
        }
        return format(parsed, formatStr);
      } catch (e) {
        return dateStr || '';
      }
    };

    const formatBtusValue = (btuVal: any): string => {
      if (!btuVal) return '-';
      const parsed = parseInt(String(btuVal).replace(/\D/g, ''), 10);
      if (isNaN(parsed)) return String(btuVal);
      return parsed.toLocaleString('pt-BR');
    };

    let logoImageRun: ImageRun | null = null;
    try {
      const logoDataUrl = getCompanyLogoBase64(printCompanyKey);
      const logoBytes = base64ToUint8Array(logoDataUrl);
      logoImageRun = new ImageRun({
        data: logoBytes,
        transformation: {
          width: 80,
          height: 60,
        },
      } as any);
    } catch (err) {
      console.error("Erro ao incluir logo no Word:", err);
    }

    const tableHeader = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.SINGLE, size: 12, color: "000000" },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: logoImageRun ? [new Paragraph({ children: [logoImageRun] })] : [],
            }),
            new TableCell({
              width: { size: 55, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: companyDetails.name, bold: true, size: 20, font: "Arial" }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: `CNPJ: ${companyDetails.cnpj}`, size: 16, font: "Arial", color: "374151" }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: `Endereço: ${companyDetails.address}`, size: 15, font: "Arial", color: "4B5563" }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: `E-mail: ${companyDetails.email} - Telefone: ${companyDetails.phone}`, size: 15, font: "Arial", color: "4B5563" }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 20, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({ text: "Página: 1 de 1", size: 16, font: "Arial", color: "6B7280" }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({ text: `Mês: ${getMonthAbbr(record.month)}`, bold: true, size: 17, font: "Arial" }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const spacingPara = new Paragraph({ text: "", spacing: { before: 150, after: 150 } });

    const titlePara = new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 150 },
      children: [
        new TextRun({
          text: "RELATÓRIO DE MANUTENÇÃO PREVENTIVA MENSAL (CONFORME PMOC)",
          bold: true,
          size: 20,
          font: "Arial",
        }),
      ],
    });

    const infoTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
        left: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
        right: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 80, type: WidthType.PERCENTAGE },
              shading: { fill: brandColorHex },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: `  CLIENTE: ${clientName.toUpperCase()}`, bold: true, size: 17, font: "Arial" }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 20, type: WidthType.PERCENTAGE },
              shading: { fill: brandColorHex },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({ text: `CONTRATO: ${contractNum.toUpperCase()}`, bold: true, size: 17, font: "Arial" }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 80, type: WidthType.PERCENTAGE },
              shading: { fill: brandColorHex },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: `  ENDEREÇO: ${addressStreet.toUpperCase()}`, bold: true, size: 17, font: "Arial" }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 20, type: WidthType.PERCENTAGE },
              shading: { fill: brandColorHex },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({ text: `CICLO: ${formattedCycle.toUpperCase()}`, bold: true, size: 17, font: "Arial" }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const equipTableRows = [];

    // Linha de cabeçalho da tabela de equipamentos
    equipTableRows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 6, type: WidthType.PERCENTAGE },
            shading: { fill: brandColorHex },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Item", bold: true, size: 16, font: "Arial" })] })],
          }),
          new TableCell({
            width: { size: 26, type: WidthType.PERCENTAGE },
            shading: { fill: brandColorHex },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ children: [new TextRun({ text: "Setor", bold: true, size: 16, font: "Arial" })] })],
          }),
          new TableCell({
            width: { size: 14, type: WidthType.PERCENTAGE },
            shading: { fill: brandColorHex },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ children: [new TextRun({ text: "Equipamento", bold: true, size: 16, font: "Arial" })] })],
          }),
          new TableCell({
            width: { size: 10, type: WidthType.PERCENTAGE },
            shading: { fill: brandColorHex },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ children: [new TextRun({ text: "Marca", bold: true, size: 16, font: "Arial" })] })],
          }),
          new TableCell({
            width: { size: 10, type: WidthType.PERCENTAGE },
            shading: { fill: brandColorHex },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "BTUs", bold: true, size: 16, font: "Arial" })] })],
          }),
          new TableCell({
            width: { size: 10, type: WidthType.PERCENTAGE },
            shading: { fill: brandColorHex },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ID/Etiqueta", bold: true, size: 16, font: "Arial" })] })],
          }),
          new TableCell({
            width: { size: 18, type: WidthType.PERCENTAGE },
            shading: { fill: brandColorHex },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Visto do Técnico", bold: true, size: 16, font: "Arial" })] })],
          }),
          new TableCell({
            width: { size: 6, type: WidthType.PERCENTAGE },
            shading: { fill: brandColorHex },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ children: [new TextRun({ text: "Obs.", bold: true, size: 16, font: "Arial" })] })],
          }),
        ],
      })
    );

    // Linha do Sub-Header com Nome do Cliente
    equipTableRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 8,
            shading: { fill: "F9FAFB" },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: clientName.toUpperCase(), bold: true, size: 17, font: "Arial" }),
                ],
              }),
            ],
          }),
        ],
      })
    );

    recordEquipments.forEach((eq, index) => {
      const existingChecklist = record.checklist || [];
      const found = existingChecklist.find(item => item && item.equipmentId === eq.id);
      const isChecked = found ? found.checked : false;
      const isSkipped = found ? found.skipped : false;
      const obsValue = found ? found.notes : '';

      let statusText = '';
      const itemDate = found?.checkedAt 
        ? formatDateSafe(found.checkedAt, 'dd/MM/yyyy') 
        : (record.executionDate ? formatDateSafe(record.executionDate, 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy'));

      if (isChecked && !isSkipped) {
        let timeText = '';
        if (found?.checkedAt) {
          try {
            const parts = found.checkedAt.split('T');
            if (parts.length === 2) {
              timeText = ' ' + parts[1].substring(0, 5);
            }
          } catch (e) {}
        }
        statusText = `(APP: ${itemDate}${timeText} ${record.technician1 || 'TÉCNICO'})`;
      } else if (isSkipped) {
        const hasJustification = found?.justification && found.justification.trim().length > 0;
        statusText = hasJustification ? `PULADO EM ${itemDate}` : 'PULADO';
      } else {
        statusText = 'PENDENTE';
      }

      // Cores do visto
      let statusBg = "EFF6FF"; // Azul claro
      let statusFg = "1E40AF"; // Azul escuro
      if (statusText === 'PENDENTE') {
        statusBg = "FEE2E2"; // Vermelho claro
        statusFg = "DC2626"; // Vermelho escuro
      } else if (statusText.startsWith('PULADO')) {
        statusBg = "FEF3C7"; // Âmbar claro
        statusFg = "D97706"; // Âmbar escuro
      }

      equipTableRows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: 6, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(index + 1), size: 15, font: "Arial" })] })],
            }),
            new TableCell({
              width: { size: 26, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ children: [new TextRun({ text: (eq.sector || '-').toUpperCase(), size: 15, font: "Arial" })] })],
            }),
            new TableCell({
              width: { size: 14, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ children: [new TextRun({ text: (eq.name || '-').toUpperCase(), size: 15, font: "Arial" })] })],
            }),
            new TableCell({
              width: { size: 10, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ children: [new TextRun({ text: (eq.brand || '-').toUpperCase(), size: 15, font: "Arial" })] })],
            }),
            new TableCell({
              width: { size: 10, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatBtusValue(eq.btus), size: 15, font: "Arial" })] })],
            }),
            new TableCell({
              width: { size: 10, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: (eq.label || '-').toUpperCase(), size: 15, font: "Arial" })] })],
            }),
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              shading: { fill: statusBg },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: statusText.toUpperCase(), bold: false, size: 13, font: "Arial", color: statusFg }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 6, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ children: [new TextRun({ text: (obsValue || '-').toUpperCase(), size: 15, font: "Arial" })] })],
            }),
          ],
        })
      );
    });

    const equipTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
        left: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
        right: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      },
      rows: equipTableRows,
    });

    const footerParagraphsLeft = [
      new Paragraph({
        children: [
          new TextRun({ text: "EQUIPE TÉCNICA AUTENTICADA", bold: true, size: 16, font: "Arial", color: "143E1D" }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `${record.technician1 || '-'}${record.technician2 ? ' / ' + record.technician2 : ''}`.toUpperCase(),
            bold: true,
            size: 17,
            font: "Arial"
          }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `Autenticado via App em ${printDatesText}`, italics: true, size: 14, font: "Arial", color: "6B7280" }),
        ],
      }),
    ];

    const footerParagraphsRight = [];
    if (record.clientSignature) {
      try {
        const clientSigBytes = base64ToUint8Array(record.clientSignature);
        footerParagraphsRight.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: clientSigBytes,
                transformation: {
                  width: 130,
                  height: 45,
                },
              } as any),
            ],
          })
        );
      } catch (err) {
        console.error("Erro ao incluir assinatura no Word:", err);
      }
    } else {
      footerParagraphsRight.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "____________________________________", size: 16, font: "Arial", color: "9CA3AF" }),
          ],
        })
      );
    }

    footerParagraphsRight.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "ASSINATURA DO RESPONSÁVEL DO CLIENTE", bold: true, size: 16, font: "Arial" }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `${record.clientSigneeName || '-'}${record.clientSigneeRegistration ? ' (MATRÍCULA: ' + record.clientSigneeRegistration + ')' : ''}`.toUpperCase(),
            bold: true,
            size: 17,
            font: "Arial",
            color: "111827"
          }),
        ],
      })
    );

    const footerTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.BOTTOM,
              children: footerParagraphsLeft,
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.BOTTOM,
              children: footerParagraphsRight,
            }),
          ],
        }),
      ],
    });

    const childrenList = [
      tableHeader,
      spacingPara,
      titlePara,
      infoTable,
      spacingPara,
      equipTable,
    ];

    if (record.routeNotes && record.routeNotes.trim() !== "") {
      const notesTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
          bottom: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
          left: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
          right: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: "F3F4F6" },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: "OBS GERAL: ", bold: true, size: 16, font: "Arial" }),
                      new TextRun({ text: record.routeNotes.toUpperCase(), size: 16, font: "Arial" }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      childrenList.push(spacingPara, notesTable);
    }

    childrenList.push(spacingPara, footerTable);

    const photosToPrint: { photoUrl: string; title: string }[] = [];
    if (printPhotos && record.checklist) {
      record.checklist.forEach(item => {
        if (item && item.photos) {
          item.photos.forEach(p => {
            if (p && p.trim() !== "") {
              const eq = equipments.find(e => e.id === item.equipmentId);
              photosToPrint.push({
                photoUrl: p,
                title: eq ? `${eq.name || 'MÁQUINA'} - ${eq.label || eq.id} (${eq.sector || 'SETOR INDEFINIDO'})` : 'MÁQUINA INDEFINIDA'
              });
            }
          });
        }
      });
    }

    if (photosToPrint.length > 0) {
      childrenList.push(
        new Paragraph({
          text: "",
          pageBreakBefore: true,
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({ text: "RELATÓRIO FOTOGRÁFICO", bold: true, size: 20, font: "Arial", color: "3556A8" }),
          ],
        })
      );

      photosToPrint.forEach((pInfo) => {
        try {
          const photoBytes = base64ToUint8Array(pInfo.photoUrl);
          childrenList.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 100, after: 100 },
              children: [
                new TextRun({ text: pInfo.title.toUpperCase(), bold: true, size: 16, font: "Arial" }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 300 },
              children: [
                new ImageRun({
                  data: photoBytes,
                  transformation: {
                    width: 250,
                    height: 180,
                  },
                } as any),
              ],
            })
          );
        } catch (err) {
          console.error("Erro ao renderizar foto no Word:", err);
        }
      });
    }

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 720,
                bottom: 720,
                left: 720,
                right: 720,
              }
            }
          },
          children: childrenList,
        },
      ],
    });

    Packer.toBlob(doc).then((blob) => {
      const url = window.URL.createObjectURL(blob);
      const cleanClientName = clientName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `PMOC_${cleanClientName}_${record.month}.docx`;

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.URL.revokeObjectURL(url);
    }).catch(err => {
      console.error("Erro ao gerar documento Word (.docx):", err);
      alert("Erro ao gerar o documento Word.");
    });
  };


  // Pegar todos os registros de manutenção para este endereço, ordenados por mês descrescente (pelo id ou month, de forma simplificada)
  const addressRecords = useMemo(() => {
    let result = historyRecords.filter(r => r && r.addressId === addressId);
    if (selectedCycleFilter && selectedCycleFilter !== 'all') {
      const cyNum = Number(selectedCycleFilter);
      result = result.filter(r => {
        const rCycle = r && r.cycle !== undefined && r.cycle !== null ? r.cycle : (client?.contractCycle || 1);
        return rCycle === cyNum;
      });
    }
    return result.sort((a, b) => (b?.month || '').localeCompare(a?.month || '')); // Ex: "2026-07" > "2026-06"
  }, [historyRecords, addressId, selectedCycleFilter, client]);

  const handleOpenManualCheckoff = (record: MaintenanceRecord) => {
    setExpandedRecordId(record.id);
    setManualSuccessMsg('');
    
    // Pre-selecionar máquinas que já estão concluídas ou em checklist do registro
    const checkedIds = new Set<string>();
    if (record.checklist) {
      record.checklist.forEach(item => {
        if (item && item.checked && !item.skipped) {
          checkedIds.add(item.equipmentId);
        }
      });
    } else {
      // Por padrão, se não iniciou, seleciona todas para facilitar
      addressEquips.forEach(eq => checkedIds.add(eq.id));
    }
    setSelectedEquipIds(checkedIds);
    setSelectedTech1(record.technician1 || '');
    setSelectedTech2(record.technician2 || '');
    setExecutionDate(record.executionDate || new Date().toISOString().split('T')[0]);
  };

  // Auto-expand/highlight the selected record when selectedRecordId changes
  useEffect(() => {
    if (selectedRecordId) {
      const targetRecord = addressRecords.find(r => r.id === selectedRecordId);
      if (targetRecord) {
        handleOpenManualCheckoff(targetRecord);
      }
    }
  }, [selectedRecordId, addressId]);

  const handleToggleEquip = (eqId: string) => {
    setSelectedEquipIds(prev => {
      const next = new Set(prev);
      if (next.has(eqId)) {
        next.delete(eqId);
      } else {
        next.add(eqId);
      }
      return next;
    });
  };

  const handleSelectAllEquips = () => {
    setSelectedEquipIds(new Set(addressEquips.map(eq => eq.id)));
  };

  const handleClearEquips = () => {
    setSelectedEquipIds(new Set());
  };

  const handleSaveManualCheckoff = async (record: MaintenanceRecord) => {
    if (!selectedTech1) {
      alert("Por favor, selecione pelo menos o Técnico Responsável.");
      return;
    }
    if (!executionDate) {
      alert("Por favor, selecione a Data de Execução.");
      return;
    }

    setIsSaving(true);
    try {
      const clientChecklist = client?.preventiveChecklist || [
        "Limpeza dos filtros de ar",
        "Verificação do dreno e dreno de bandeja",
        "Verificação de ruídos e vibrações",
        "Verificação da carga de fluido refrigerante",
        "Medição de corrente e tensão elétrica",
        "Reaperto das conexões elétricas",
        "Limpeza das serpentinas (evaporadora/condensadora)"
      ];

      const updatedChecklist = addressEquips.map(eq => {
        const isSelected = selectedEquipIds.has(eq.id);
        const existing = record.checklist?.find(item => item.equipmentId === eq.id);

        if (isSelected) {
          const checklistAnswers: Record<string, boolean> = {};
          clientChecklist.forEach(task => {
            checklistAnswers[task] = true;
          });

          return {
            equipmentId: eq.id,
            checked: true,
            skipped: false,
            notes: existing?.notes || "Baixa manual via planilha física",
            checklistAnswers,
            photos: existing?.photos || []
          };
        } else {
          const checklistAnswers: Record<string, boolean> = {};
          clientChecklist.forEach(task => {
            checklistAnswers[task] = false;
          });
          return {
            equipmentId: eq.id,
            checked: false,
            skipped: false,
            notes: "",
            checklistAnswers,
            photos: []
          };
        }
      });

      const checkedCount = updatedChecklist.filter(i => i.checked && !i.skipped).length;
      const isAllCompleted = checkedCount === addressEquips.length;
      
      const updates: Partial<MaintenanceRecord> = {
        checklist: updatedChecklist,
        technician1: selectedTech1,
        technician2: selectedTech2 || "",
        executionDate: executionDate,
        status: isAllCompleted ? MaintenanceStatus.COMPLETED : MaintenanceStatus.PARTIAL,
        executedQuantity: checkedCount,
        notes: record.notes || "Baixa manual realizada pelo administrador referente à planilha física."
      };

      await onUpdateRecord(record, updates);
      setManualSuccessMsg("Baixa manual salva com sucesso!");
      setTimeout(() => {
        setExpandedRecordId(null);
        setManualSuccessMsg('');
      }, 1500);
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar baixa manual.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetScheduling = async (record: MaintenanceRecord) => {
    if (window.confirm("Deseja realmente excluir este agendamento? Isso removerá a data planejada, os técnicos vinculados e reiniciará todo o progresso de execução deste mês, zerando as máquinas.")) {
      const updates: Partial<MaintenanceRecord> = {
        plannedDate: "",
        technician1: "",
        technician2: "",
        executionDate: "",
        status: MaintenanceStatus.PENDING,
        checklist: [],
        techSignature: "",
        clientSignature: "",
        clientSigneeName: "",
        executedQuantity: 0,
      };
      await onUpdateRecord(record, updates);
    }
  };

  const handleReopenRecord = async (record: MaintenanceRecord) => {
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.ASSISTANT) {
      alert("Apenas administradores ou assistentes têm autorização para reabrir planilhas concluídas.");
      return;
    }

    const confirmMsg = "Deseja realmente REABRIR esta planilha de atendimento?\n\n" +
      "Isso fará o seguinte:\n" +
      "- O status mudará de 'Concluído' de volta para 'Pendente'.\n" +
      "- Os campos de Nome do cliente, Assinatura e Matrícula serão limpos.\n" +
      "- Todos os checklists preenchidos, observações e fotos de cada máquina permanecerão 100% INTACTOS e preservados com segurança.\n\n" +
      "Confirma a reabertura?";

    if (window.confirm(confirmMsg)) {
      try {
        const updates: Partial<MaintenanceRecord> = {
          status: MaintenanceStatus.PENDING,
          clientSignature: "",
          clientSigneeName: "",
          clientSigneeRegistration: "",
        };
        await onUpdateRecord(record, updates);
        alert("Planilha de atendimento reaberta com sucesso!");
      } catch (err) {
        console.error("Erro ao reabrir planilha:", err);
        alert("Ocorreu um erro ao tentar reabrir a planilha de atendimento.");
      }
    }
  };

  if (!address || !client) return null;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2 mb-2">
          <span className="bg-indigo-100 text-indigo-800 text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-wider">
            {client.name}
          </span>
          <span className="bg-slate-200 text-slate-700 text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-wider">
            Ciclo: {client.contractCycle || 1}
          </span>
        </div>
        <h2 className="text-xl font-black text-slate-800 leading-tight mb-2">{address.street}</h2>
        <div className="flex flex-wrap gap-4 text-sm font-medium text-slate-500">
          <div className="flex items-center gap-1.5">
            <Settings className="w-4 h-4" />
            {addressEquips.length} Máquinas Cadastradas
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2 uppercase tracking-wider">
          <History className="w-4 h-4 text-slate-400" />
          Histórico de PMOC
        </h3>
        
        {addressRecords.length > 0 ? (
          <div className="space-y-4">
            {addressRecords.map(record => {
              const checklist = record.checklist || [];
              const checkedCount = checklist.filter(i => i.checked && !i.skipped).length;
              const skippedCount = checklist.filter(i => i.skipped).length;
              const totalProcessed = checkedCount + skippedCount;
              
              // Se tiver concluído, consideramos que fez tudo (ou o length das maquinas na epoca)
              // Mas aqui pegaremos os dados exatos do checklist.
              const isCompleted = record.status === MaintenanceStatus.COMPLETED;
              const machinesTarget = addressEquips.length; // Estimativa baseada nas maquinas atuais
              const percent = machinesTarget > 0 ? Math.min(100, Math.round((totalProcessed / machinesTarget) * 100)) : 0;
              const isScheduledOrWorked = record.plannedDate || record.technician1 || checklist.length > 0;
              const isWorkedByTech = !!(record.techSignature || record.clientSignature || checklist.some(item => 
                item.skipped || 
                (item.photos && item.photos.some(p => p && p.trim() !== "")) ||
                (item.notes && item.notes.trim() !== "" && item.notes !== "Baixa manual via planilha física")
              ));
              
                const isRecordSelected = selectedRecordId === record.id;
                const isCardExpanded = expandedHistoryRecords[record.id] ?? false;

                const toggleCardExpansion = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  setExpandedHistoryRecords(prev => ({
                    ...prev,
                    [record.id]: !isCardExpanded
                  }));
                };

                return (
                  <div 
                    key={record.id} 
                    className={cn(
                      "border rounded-2xl bg-white transition-all duration-200 overflow-hidden",
                      isRecordSelected 
                        ? "border-indigo-500 shadow-md ring-2 ring-indigo-500/20" 
                        : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    {/* Cabeçalho do Card (Clicável para recolher/expandir) */}
                    <div 
                      onClick={toggleCardExpansion}
                      className="p-5 flex items-center justify-between gap-4 cursor-pointer select-none hover:bg-slate-50/50 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-black text-slate-800">
                            {format(parseISO(`${record.month}-01`), 'MMMM yyyy', { locale: ptBR }).toUpperCase()}
                          </span>
                          <span className={cn(
                            "text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider",
                            isCompleted ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                          )}>
                            {isCompleted ? 'Concluído' : 'Pendente / Rascunho'}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-500">
                          {record.executionDate 
                            ? `Última execução: ${format(parseISO(record.executionDate), 'dd/MM/yyyy')}` 
                            : 'Sem data de execução definida'}
                        </p>
                      </div>
                      
                      <div className="text-slate-400 hover:text-slate-600 bg-slate-50 border border-slate-200/60 p-2 rounded-xl transition-all">
                        {isCardExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        )}
                      </div>
                    </div>

                    {/* Conteúdo Oculto/Expandível */}
                    {isCardExpanded && (
                      <div className="p-5 pt-0 border-t border-slate-100/80 space-y-5 animate-fade-in">
                        {/* Área de Ações e Opções de Impressão */}
                        <div className="pt-4 flex flex-col gap-3 items-end">
                          <div className="flex flex-wrap gap-2 items-center justify-end">
                            <button
                              onClick={() => onPrintChecklist(record, { printPhotos, printGeneralNotes })}
                              disabled={checklist.length === 0 && !isCompleted}
                              className={cn(
                                "px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all",
                                checklist.length === 0 && !isCompleted
                                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                  : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 shadow-sm"
                              )}
                            >
                              <Printer className="w-4 h-4" />
                              {isCompleted ? 'Imprimir PMOC' : 'Imprimir Parcial'}
                            </button>

                            <button
                              onClick={() => onPrintBlankChecklist(record, { printPhotos, printGeneralNotes })}
                              className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 transition-all shadow-sm"
                              title="Imprimir planilha sem assinaturas e vistorias digitais para preenchimento físico"
                            >
                              <Printer className="w-4 h-4 text-slate-500" />
                              Imprimir em Branco
                            </button>

                            <button
                              onClick={() => handleExportToExcel(record)}
                              className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-all shadow-sm cursor-pointer"
                              title="Exportar dados deste PMOC para planilha Excel (.xlsx)"
                            >
                              <FileText className="w-4 h-4 text-emerald-600" />
                              Exportar Excel
                            </button>

                            <button
                              onClick={() => handleExportToWord(record)}
                              className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all shadow-sm cursor-pointer"
                              title="Exportar dados deste PMOC para documento Word (.docx)"
                            >
                              <FileText className="w-4 h-4 text-blue-600" />
                              Exportar Word
                            </button>

                            <button
                              onClick={() => {
                                alert("Para baixar em formato PDF:\n1. A janela de visualização e impressão será aberta.\n2. No campo 'Destino' ou 'Impressora' do seu navegador, escolha 'Salvar como PDF' (Save as PDF).\n3. Confirme para salvar o arquivo no seu dispositivo.");
                                onPrintChecklist(record, { printPhotos, printGeneralNotes });
                              }}
                              className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-all shadow-sm cursor-pointer"
                              title="Exportar dados deste PMOC para arquivo PDF"
                            >
                              <Printer className="w-4 h-4 text-rose-600" />
                              Exportar PDF
                            </button>

                            <button
                              onClick={() => {
                                if (expandedRecordId === record.id) {
                                  setExpandedRecordId(null);
                                } else {
                                  handleOpenManualCheckoff(record);
                                }
                              }}
                              className={cn(
                                "px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm border cursor-pointer",
                                expandedRecordId === record.id
                                  ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                                  : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200"
                              )}
                              title="Dar baixa manual de planilha física assinada diretamente pelo administrador"
                            >
                              <Check className="w-4 h-4" />
                              {expandedRecordId === record.id ? 'Fechar Baixa' : 'Dar Baixa Manual'}
                            </button>

                            {isCompleted && (userRole === UserRole.ADMIN || userRole === UserRole.ASSISTANT) && (
                              <button
                                onClick={() => handleReopenRecord(record)}
                                className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-all shadow-sm cursor-pointer"
                                title="Reabrir planilha de atendimento concluída (limpa assinatura do cliente mas mantém vistorias e fotos das máquinas)"
                              >
                                <RotateCcw className="w-4 h-4 text-amber-600" />
                                Reabrir Planilha
                              </button>
                            )}

                            {isScheduledOrWorked && (
                              <button
                                onClick={() => handleResetScheduling(record)}
                                className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-all shadow-sm"
                              >
                                <Trash2 className="w-4 h-4" />
                                Excluir Agendamento
                              </button>
                            )}
                          </div>

                          {/* Print Options Checkboxes */}
                          <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 mt-1 w-full justify-start">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Opções de Impressão:</span>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input 
                                type="checkbox" 
                                checked={printPhotos} 
                                onChange={(e) => setPrintPhotos(e.target.checked)}
                                className="rounded text-blue-600 border-slate-300 focus:ring-blue-500 h-4 w-4"
                              />
                              <span>Imprimir fotos tiradas (Relatório Fotográfico)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input 
                                type="checkbox" 
                                checked={printGeneralNotes} 
                                onChange={(e) => setPrintGeneralNotes(e.target.checked)}
                                className="rounded text-blue-600 border-slate-300 focus:ring-blue-500 h-4 w-4"
                              />
                              <span>Imprimir campo de observação geral</span>
                            </label>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-slate-600">Progresso do Mês</span>
                            <span className="text-xs font-black text-slate-800">{percent}% ({totalProcessed} de {machinesTarget})</span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-3">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                isCompleted ? "bg-emerald-500" : (percent > 0 ? "bg-blue-500" : "bg-slate-300")
                              )}
                              style={{ width: `${isCompleted ? 100 : percent}%` }}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                             <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Realizadas</p>
                                <p className="text-sm font-black text-slate-700 flex items-center gap-1.5">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                  {checkedCount} Máquinas
                                </p>
                             </div>
                             <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Restantes</p>
                                <p className="text-sm font-black text-slate-700 flex items-center gap-1.5">
                                  <Info className="w-3.5 h-3.5 text-amber-500" />
                                  {Math.max(0, machinesTarget - totalProcessed)} Máquinas
                                </p>
                             </div>
                          </div>
                        </div>
                        
                        {/* Tech Info */}
                        {(record.technician1 || record.technician2) && (
                          <div className="flex items-start gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <Briefcase className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-bold text-slate-700">Técnicos vinculados</p>
                              <p className="text-xs font-medium text-slate-500 mt-0.5">
                                {record.technician1} {record.technician2 ? `& ${record.technician2}` : ''}
                              </p>
                            </div>
                          </div>
                        )}

                  {/* FORMULÁRIO DE BAIXA MANUAL EXCLUSIVO */}
                  {expandedRecordId === record.id && (
                    <div className="mt-5 border-t border-slate-100 pt-5 space-y-5">
                      {isWorkedByTech && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-xs font-bold flex items-start gap-2.5 shadow-sm">
                          <Info className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="leading-relaxed">
                            <strong>Planilha em Atendimento Móvel:</strong> Os técnicos já iniciaram ou finalizaram o atendimento desta planilha via dispositivo móvel. Por razões de consistência de dados, a baixa manual administrativa foi desabilitada. Você pode visualizar o estado de execução das máquinas no painel de progresso.
                          </div>
                        </div>
                      )}
                      <div className={cn(
                        "bg-indigo-50/40 border border-indigo-100/85 rounded-2xl p-4 md:p-5 space-y-4",
                        isWorkedByTech && "opacity-75 pointer-events-none select-none"
                      )}>
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div>
                            <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                              <FileSignature className="w-4 h-4 text-indigo-600" />
                              Baixa Administrativa de Planilha Física
                            </h4>
                            <p className="text-xs text-slate-500 mt-1">
                              Selecione as máquinas concluídas na planilha física trazida pelo técnico. O sistema preencherá as tarefas preventivas do PMOC correspondentes.
                            </p>
                          </div>
                          
                          {/* Mensagem de sucesso interna */}
                          {manualSuccessMsg && (
                            <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 animate-pulse self-start">
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              {manualSuccessMsg}
                            </div>
                          )}
                        </div>

                        {/* Listagem de máquinas do endereço para seleção */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Selecione as Máquinas Executadas</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleSelectAllEquips}
                                className="text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                              >
                                Selecionar Todas
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={handleClearEquips}
                                className="text-[10px] font-black uppercase text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
                              >
                                Limpar
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                            {addressEquips.map(eq => {
                              const isSelected = selectedEquipIds.has(eq.id);
                              const wasPreviouslyChecked = record.checklist?.some(item => item.equipmentId === eq.id && item.checked && !item.skipped);

                              return (
                                <button
                                  key={eq.id}
                                  type="button"
                                  onClick={() => handleToggleEquip(eq.id)}
                                  className={cn(
                                    "flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer",
                                    isSelected 
                                      ? "bg-white border-indigo-500 ring-1 ring-indigo-500 shadow-sm" 
                                      : "bg-slate-50 border-slate-200 hover:bg-slate-100/70"
                                  )}
                                >
                                  {isSelected ? (
                                    <CheckSquare className="w-5 h-5 text-indigo-600 shrink-0" />
                                  ) : (
                                    <Square className="w-5 h-5 text-slate-300 shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-black text-slate-800 truncate">{eq.sector || "Sem Setor"}</p>
                                    <p className="text-[10px] text-slate-500 font-semibold flex items-center gap-1.5 mt-0.5">
                                      <span>Equip: <strong className="font-bold text-slate-700">{eq.name}</strong></span>
                                      {eq.btus && (
                                        <>
                                          <span className="text-slate-300">•</span>
                                          <span>BTUs: <strong className="font-bold text-slate-700">{eq.btus}</strong></span>
                                        </>
                                      )}
                                      {eq.patrimony && (
                                        <>
                                          <span className="text-slate-300">•</span>
                                          <span>Patr: <strong className="font-bold text-slate-700">{eq.patrimony}</strong></span>
                                        </>
                                      )}
                                    </p>
                                  </div>

                                  {wasPreviouslyChecked && (
                                    <span className="text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 font-mono">
                                      Anterior
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Configurações de Técnico e Data */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Técnico Responsável *</label>
                            <select
                              value={selectedTech1}
                              onChange={(e) => setSelectedTech1(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
                            >
                              <option value="">Selecione...</option>
                              {techs.map(t => (
                                <option key={t.id} value={t.name}>{t.name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Técnico Auxiliar (Opcional)</label>
                            <select
                              value={selectedTech2}
                              onChange={(e) => setSelectedTech2(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
                            >
                              <option value="">Nenhum</option>
                              {techs.map(t => (
                                <option key={t.id} value={t.name}>{t.name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Data da Execução *</label>
                            <input
                              type="date"
                              value={executionDate}
                              onChange={(e) => setExecutionDate(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        {/* Botões de Ação de Salvamento */}
                        <div className="flex items-center justify-end gap-3 pt-3 border-t border-indigo-100/50">
                          <button
                            type="button"
                            onClick={() => setExpandedRecordId(null)}
                            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition cursor-pointer"
                          >
                            Cancelar
                          </button>
                          
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleSaveManualCheckoff(record)}
                            className={cn(
                              "px-5 py-2 text-white font-black text-xs rounded-xl transition flex items-center gap-2 cursor-pointer shadow-md shadow-indigo-100",
                              selectedEquipIds.size === 0 
                                ? "bg-slate-300 cursor-not-allowed shadow-none" 
                                : "bg-indigo-600 hover:bg-indigo-700"
                            )}
                          >
                            {isSaving ? (
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                            Gravar Baixa ({selectedEquipIds.size} máquina{selectedEquipIds.size !== 1 ? 's' : ''})
                          </button>
                        </div>

                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
            <History className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-600">Nenhum registro de PMOC encontrado</p>
            <p className="text-xs text-slate-400 mt-1">Gere o cronograma para que as visitas apareçam aqui.</p>
          </div>
        )}
      </div>
    </div>
  );
}
