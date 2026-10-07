import React from 'react';
import { X, Calendar } from 'lucide-react';
import { DailyScheduleReport } from '../DailyScheduleReport';

export interface DailyReportModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  managerClientId?: string;
  isModal?: boolean;
}

export function DailyReportModal({
  isOpen = true,
  onClose,
  managerClientId,
  isModal = false
}: DailyReportModalProps) {
  if (!isOpen) return null;

  if (!isModal) {
    return (
      <div className="w-full">
        <DailyScheduleReport managerClientId={managerClientId} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-7xl max-h-[92vh] rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-400/30">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg uppercase tracking-wide">
                Relatório de Agenda Diária
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Visão consolidada de rotas, técnicos e clientes programados
              </p>
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <DailyScheduleReport managerClientId={managerClientId} />
        </div>
      </div>
    </div>
  );
}

export default DailyReportModal;
