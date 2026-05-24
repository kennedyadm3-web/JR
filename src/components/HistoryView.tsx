import { useState, useEffect } from 'react';
import { Clock, User, ClipboardList, Loader2, Info } from 'lucide-react';
import { historyService } from '../services/historyService';
import { cn } from '../lib/utils';

const ENTITY_LABELS: Record<string, string> = {
  'Client': 'Cliente',
  'Address': 'Endereço',
  'MaintenanceRecord': 'Registro de Manutenção',
  'Technician': 'Técnico'
};

const ACTION_LABELS: Record<string, string> = {
  'Create': 'Criação',
  'Update': 'Edição',
  'Delete': 'Exclusão'
};

const FIELD_LABELS: Record<string, string> = {
  'name': 'Nome',
  'billingCycleInfo': 'Faturamento',
  'street': 'Endereço/Rua',
  'route': 'Rota',
  'clientId': 'ID Cliente',
  'totalMachines': 'Máquinas',
  'status': 'Status',
  'notes': 'Notas',
  'technician1': 'Técnico 1',
  'technician2': 'Técnico 2',
  'scheduledWeek': 'Semana',
  'plannedDate': 'Saída',
  'returnDate': 'Retorno',
  'routeNotes': 'Observações da Rota',
  'executionDate': 'Execução',
  'executedQuantity': 'Baixa (Qtd)'
};

export default function HistoryView() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    const data = await historyService.getLogs();
    setLogs(data);
    setLoading(false);
  };

  const formatChanges = (changes: any) => {
    if (!changes) return 'Sem detalhes';
    if (changes.message) return changes.message;

    return Object.entries(changes)
      .map(([key, value]) => {
        const label = FIELD_LABELS[key] || key;
        const displayValue = value === null || value === undefined ? 'vazio' : String(value);
        return `${label}: ${displayValue}`;
      })
      .join(' | ');
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-600" />
          Histórico de Atividades
        </h2>
        <button 
          onClick={loadLogs}
          className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-all"
        >
          Atualizar log
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-2" />
            <p className="text-gray-500">Buscando histórico...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ClipboardList className="w-12 h-12 text-gray-200 mb-4" />
            <p className="text-gray-500 italic">Nenhum histórico registrado ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">
                  <th className="px-6 py-4">Data / Hora</th>
                  <th className="px-6 py-4">Usuário</th>
                  <th className="px-6 py-4">O que mudou</th>
                  <th className="px-6 py-4">Operação</th>
                  <th className="px-6 py-4">Detalhes da Alteração</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/80 transition-all">
                    <td className="px-6 py-4 text-xs text-gray-500 font-medium">
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shrink-0">
                          <User className="w-3 h-3" />
                        </div>
                        <span className="text-xs font-bold text-gray-700 truncate max-w-[120px]">{log.userId}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-black text-gray-600 uppercase tracking-tighter bg-gray-100 px-2 py-0.5 rounded">
                        {ENTITY_LABELS[log.entityType] || log.entityType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          log.action === 'Create' ? "bg-emerald-500" :
                          log.action === 'Update' ? "bg-amber-500" : "bg-red-500"
                        )} />
                        <span className="text-xs font-semibold text-gray-600">
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 group relative">
                        <Info className="w-3 h-3 text-gray-300 group-hover:text-blue-400 transition-colors shrink-0" />
                        <p className="text-xs text-gray-500 font-medium line-clamp-1 group-hover:line-clamp-none">
                          {formatChanges(log.changes)}
                        </p>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
