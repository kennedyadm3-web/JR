import { useState, useEffect, useMemo } from 'react';
import { Clock, User, ClipboardList, Loader2, Info, Search, Filter, RefreshCw, CheckCircle2, Wrench, ShieldCheck, MapPin, Box } from 'lucide-react';
import { historyService, HistoryLogEntry } from '../services/historyService';
import { cn } from '../lib/utils';

const ENTITY_LABELS: Record<string, string> = {
  'Client': 'Cliente',
  'Address': 'Endereço',
  'MaintenanceRecord': 'Preventiva (PMOC)',
  'ServiceOrder': 'Ordem de Serviço',
  'Technician': 'Técnico',
  'Equipment': 'Equipamento',
  'RouteConfiguration': 'Configuração de Rota',
  'RouteMonthlyPlanning': 'Planejamento de Rota',
  'TravelCard': 'Cartão de Viagem',
  'ContractPerformance': 'Contrato',
  'JettingControl': 'Central de Jateamento'
};

const ENTITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  'ServiceOrder': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  'MaintenanceRecord': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'Equipment': { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
  'Address': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  'Client': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  'Technician': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' }
};

const ACTION_LABELS: Record<string, string> = {
  'Create': 'Criação',
  'Update': 'Edição',
  'Delete': 'Exclusão',
  'Save': 'Salvamento',
  'Finalize': 'Finalização',
  'Approve': 'Homologação',
  'Reject': 'Devolução',
  'Cancel': 'Cancelamento',
  'Upsert': 'Gravação',
  'SyncMachinesCount': 'Sincronização de Máquinas'
};

const FIELD_LABELS: Record<string, string> = {
  'osNumber': 'Nº O.S.',
  'client': 'Cliente',
  'address': 'Endereço',
  'isWorkshop': 'Oficina',
  'totalValue': 'Valor',
  'technician': 'Técnico',
  'status': 'Status',
  'type': 'Tipo',
  'month': 'Mês Ref.',
  'executionDate': 'Data Execução',
  'executedQuantity': 'Máquinas',
  'approvedBy': 'Homologado Por',
  'actionDetails': 'Ação',
  'name': 'Nome',
  'label': 'Nº Máquina',
  'sector': 'Setor',
  'brand': 'Marca',
  'btus': 'BTUs',
  'patrimony': 'Patrimônio',
  'billingCycleInfo': 'Faturamento',
  'street': 'Rua',
  'route': 'Rota',
  'totalMachines': 'Máquinas',
  'notes': 'Notas',
  'technician1': 'Técnico 1',
  'technician2': 'Técnico 2',
  'plannedDate': 'Data Agendada'
};

const IGNORED_FIELDS = new Set([
  'photos',
  'checklist',
  'clientSignature',
  'techSignature',
  'services',
  'products',
  'serviceCompany',
  'checkedEquipments',
  'id',
  'createdAt',
  'updatedAt'
]);

export default function HistoryView() {
  const [logs, setLogs] = useState<HistoryLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    const data = await historyService.getLogs(150);
    setLogs(data);
    setLoading(false);
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Filtro de categoria
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'os' && log.entityType !== 'ServiceOrder') return false;
        if (selectedCategory === 'preventive' && log.entityType !== 'MaintenanceRecord') return false;
        if (selectedCategory === 'equipment' && log.entityType !== 'Equipment') return false;
        if (selectedCategory === 'client_address' && log.entityType !== 'Client' && log.entityType !== 'Address') return false;
      }

      // Filtro de pesquisa livre
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const userMatch = (log.userId || '').toLowerCase().includes(term);
        const entityMatch = (ENTITY_LABELS[log.entityType] || log.entityType || '').toLowerCase().includes(term);
        const actionMatch = (ACTION_LABELS[log.action] || log.action || '').toLowerCase().includes(term);
        const changesStr = typeof log.changes === 'object' ? JSON.stringify(log.changes).toLowerCase() : String(log.changes || '').toLowerCase();
        const changesMatch = changesStr.includes(term);

        return userMatch || entityMatch || actionMatch || changesMatch;
      }

      return true;
    });
  }, [logs, selectedCategory, searchTerm]);

  const formatChanges = (changes: any) => {
    if (!changes) return 'Sem detalhes informados';
    if (typeof changes === 'string') return changes;
    if (changes.message) return changes.message;

    // Se for objeto estruturado de auditoria
    const entries = Object.entries(changes)
      .filter(([key, val]) => !IGNORED_FIELDS.has(key) && val !== undefined && val !== null && val !== '')
      .map(([key, value]) => {
        const label = FIELD_LABELS[key] || key;
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return { label, displayValue };
      });

    if (entries.length === 0) return 'Atualização registrada';

    return entries.map(e => `${e.label}: ${e.displayValue}`).join(' | ');
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'Approve':
      case 'Finalize':
      case 'Create':
        return 'bg-emerald-500';
      case 'Update':
      case 'Save':
      case 'Upsert':
      case 'SyncMachinesCount':
        return 'bg-amber-500';
      case 'Reject':
        return 'bg-rose-500';
      case 'Delete':
      case 'Cancel':
        return 'bg-red-500';
      default:
        return 'bg-blue-500';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
      {/* Top Header */}
      <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/70">
        <div>
          <h2 className="text-xl font-black text-gray-950 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            Histórico de Atividades
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Auditoria em tempo real de edições, finalizações de O.S., homologações de preventivas e cadastros.
          </p>
        </div>

        <button 
          onClick={loadLogs}
          disabled={loading}
          className="flex items-center gap-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100/80 px-3.5 py-2 rounded-xl transition-all self-start md:self-auto shadow-2xs border border-blue-200/60 disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Atualizar log
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 border-b border-gray-100 bg-white flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto scrollbar-none pb-1 md:pb-0">
          <button
            onClick={() => setSelectedCategory('all')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
              selectedCategory === 'all'
                ? "bg-gray-900 text-white shadow-xs"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            Todas ({logs.length})
          </button>
          <button
            onClick={() => setSelectedCategory('os')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
              selectedCategory === 'os'
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-purple-50 text-purple-700 hover:bg-purple-100"
            )}
          >
            <Wrench className="w-3.5 h-3.5" />
            Ordens de Serviço
          </button>
          <button
            onClick={() => setSelectedCategory('preventive')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
              selectedCategory === 'preventive'
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            )}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Preventivas (Homologações)
          </button>
          <button
            onClick={() => setSelectedCategory('equipment')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
              selectedCategory === 'equipment'
                ? "bg-slate-700 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            <Box className="w-3.5 h-3.5" />
            Equipamentos
          </button>
          <button
            onClick={() => setSelectedCategory('client_address')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
              selectedCategory === 'client_address'
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-blue-50 text-blue-700 hover:bg-blue-100"
            )}
          >
            <MapPin className="w-3.5 h-3.5" />
            Endereços & Clientes
          </button>
        </div>

        {/* Search input */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por usuário, O.S., cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Main Table Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
            <p className="text-sm font-semibold text-gray-500">Buscando histórico do banco de dados...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <ClipboardList className="w-12 h-12 text-gray-300 mb-3" />
            <h4 className="text-sm font-bold text-gray-700">Nenhum registro encontrado</h4>
            <p className="text-xs text-gray-400 max-w-sm mt-1">
              {searchTerm ? 'Nenhuma atividade coincide com sua busca. Tente outros termos.' : 'Nenhum histórico foi registrado para esta categoria ainda.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/60 text-[10px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-3.5">Data / Hora</th>
                  <th className="px-5 py-3.5">Usuário</th>
                  <th className="px-5 py-3.5">O que mudou</th>
                  <th className="px-5 py-3.5">Operação</th>
                  <th className="px-5 py-3.5">Detalhes da Alteração</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLogs.map(log => {
                  const entityStyle = ENTITY_STYLES[log.entityType] || { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' };
                  const actionDot = getActionColor(log.action);

                  return (
                    <tr key={log.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-5 py-3.5 text-xs text-gray-600 font-medium whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shrink-0">
                            <User className="w-3 h-3" />
                          </div>
                          <span className="text-xs font-bold text-gray-800 truncate max-w-[160px]" title={log.userId}>
                            {log.userId}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-tight px-2.5 py-1 rounded-md border",
                          entityStyle.bg, entityStyle.text, entityStyle.border
                        )}>
                          {ENTITY_LABELS[log.entityType] || log.entityType}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className={cn("w-2 h-2 rounded-full shrink-0", actionDot)} />
                          <span className="text-xs font-bold text-gray-700">
                            {ACTION_LABELS[log.action] || log.action}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 group relative">
                          <Info className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" />
                          <p className="text-xs text-gray-600 font-medium leading-relaxed">
                            {formatChanges(log.changes)}
                          </p>
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

      {/* Footer Info */}
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between text-[11px] text-gray-500 font-medium">
        <span>Mostrando <strong>{filteredLogs.length}</strong> atividades recentes</span>
        <span>Ordenado do mais recente para o mais antigo</span>
      </div>
    </div>
  );
}
