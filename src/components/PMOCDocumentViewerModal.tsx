import React, { useRef } from 'react';
import { X, Printer, User, Calendar, MapPin, Building2, CheckCircle2, Clock } from 'lucide-react';
import { MaintenanceRecord, Address, Client, Equipment } from '../types';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { COMPANIES_INFO, formatBtus, getRecordTimestamps } from './TechDemandView';
import { CompanyLogo, getCompanyConfigFromCache } from './CompanyLogo';
import { cn } from '../lib/utils';

interface PMOCDocumentViewerModalProps {
  record: MaintenanceRecord;
  address?: Address | null;
  client?: Client | null;
  equipments?: Equipment[];
  serviceOrderSettings?: any;
  onClose: () => void;
  onPrint?: () => void;
  onOpenChecklistEditor?: () => void;
  onHomologate?: (record: MaintenanceRecord) => void;
}

const formatDateSafe = (dateStr: string | null | undefined, formatStr: string = 'dd/MM/yyyy'): string => {
  if (!dateStr) return '';
  if ((formatStr.includes('HH') || formatStr.includes('mm')) && !dateStr.includes('T') && !dateStr.includes(' ') && !dateStr.includes(':')) {
    return '';
  }
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
  } catch (err) {
    return dateStr || '';
  }
};

export function PMOCDocumentViewerModal({
  record,
  address,
  client,
  equipments = [],
  serviceOrderSettings,
  onClose,
  onPrint,
  onOpenChecklistEditor,
  onHomologate
}: PMOCDocumentViewerModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  const printCompanyKey = (client?.serviceCompany || (record as any)?.serviceCompany as 'lefrio' | 'alclima') || 'lefrio';
  const cachedCompany = getCompanyConfigFromCache(printCompanyKey);
  const anyCompanyWithLogo = serviceOrderSettings?.companies?.find((c: any) => Boolean(c.logoUrl));
  const effectiveCompanyConfig = cachedCompany || anyCompanyWithLogo || serviceOrderSettings?.companies?.[0];
  const baseCompany = COMPANIES_INFO[printCompanyKey] || COMPANIES_INFO.lefrio;
  const resolvedLogoUrl = effectiveCompanyConfig?.logoUrl || cachedCompany?.logoUrl || anyCompanyWithLogo?.logoUrl;
  const printCompany = {
    ...baseCompany,
    name: effectiveCompanyConfig?.fullName || effectiveCompanyConfig?.shortName || baseCompany.name,
    shortName: effectiveCompanyConfig?.shortName || baseCompany.shortName,
    cnpj: effectiveCompanyConfig?.cnpj || baseCompany.cnpj,
    address: effectiveCompanyConfig?.address || baseCompany.address,
    email: effectiveCompanyConfig?.email || baseCompany.email,
    phone: effectiveCompanyConfig?.phone || baseCompany.phone,
    logoUrl: resolvedLogoUrl
  };

  const printClientName = client?.fullName || client?.name || record.temporaryClient || 'Cliente';
  const printAddressStreet = address ? `${address.street}, ${address.number || 'S/N'}${address.neighborhood ? ` - ${address.neighborhood}` : ''}` : (record.temporaryStreet || 'Endereço não definido');
  const printAddressCep = address?.cep?.trim() ? (address.cep.trim().toUpperCase().startsWith('CEP') ? address.cep.trim() : `CEP: ${address.cep.trim()}`) : '';

  // Helpers for cycle reference
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
    const rawCycle = client?.contractCycle || record.cycle || 1;
    const num = String(rawCycle).padStart(3, '0');
    const formatType = client?.cycleRefFormat || 'number_only';
    
    const start = formatDateBRL(client?.cycleStartDate);
    const end = formatDateBRL(client?.cycleEndDate);
    const abbr = getMonthAbbr(record.month || '');
    
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

  // Obter datas únicas de checklist
  const uniqueDatesSet = new Set<string>();
  if (record.checklist) {
    record.checklist.forEach(item => {
      if (item && item.checkedAt) {
        try {
          const dateStr = formatDateSafe(item.checkedAt, 'dd/MM/yyyy');
          if (dateStr) uniqueDatesSet.add(dateStr);
        } catch (e) {}
      }
    });
  }
  if (uniqueDatesSet.size === 0 && record.executionDate) {
    uniqueDatesSet.add(formatDateSafe(record.executionDate, 'dd/MM/yyyy'));
  }
  const printDatesText = uniqueDatesSet.size > 0 
    ? Array.from(uniqueDatesSet).sort().join(', ')
    : (record.executionDate ? formatDateSafe(record.executionDate, 'dd/MM/yyyy') : (record.month ? formatDateSafe(record.month + '-01', 'MM/yyyy') : '-'));

  const handlePrintAction = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  const existingChecklist = record.checklist || [];

  // Mapear fotos
  const equipsWithPhotos = equipments
    .map(eq => {
      const found = existingChecklist.find(item => item && item.equipmentId === eq.id);
      const photos = found ? (found.photos || []).filter(p => p && p.trim() !== '') : [];
      return { eq, photos };
    })
    .filter(item => item.photos.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs overflow-y-auto p-2 sm:p-4 print:p-0 print:bg-white print:static print:inset-auto print:z-auto">
      {/* Estilos para impressão focados somente na folha */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #pmoc-modal-print-container,
          #pmoc-modal-print-container * {
            visibility: visible !important;
          }
          #pmoc-modal-print-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
          }
          .pmoc-no-print {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm 10mm 10mm 10mm !important;
          }
          .pmoc-print-table thead {
            display: table-header-group !important;
          }
          .pmoc-print-table tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Caixa do Modal */}
      <div className="relative w-full max-w-4xl bg-slate-100 rounded-2xl shadow-2xl flex flex-col max-h-[96vh] overflow-hidden print:max-h-none print:shadow-none print:rounded-none print:bg-white print:w-full">
        {/* Barra superior de ações (Não imprimível) */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-900 text-white shrink-0 pmoc-no-print">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-wide text-white uppercase flex items-center gap-2">
                Folha de Atendimento (Pré-visualização)
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {record.month || 'Mês'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 font-medium truncate max-w-md">
                {printClientName} • {printAddressStreet}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenChecklistEditor && (
              <button
                type="button"
                onClick={onOpenChecklistEditor}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
                title="Editar checklist operacional dos equipamentos"
              >
                <span>Editar Checklist</span>
              </button>
            )}

            {onHomologate && record.status !== 'completed' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onHomologate(record);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md hover:shadow-emerald-500/20 cursor-pointer"
                title="Aprovar e homologar este atendimento agora"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Homologar Atendimento</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrintAction}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md hover:shadow-blue-500/20 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Folha / PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Fechar visualização"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Informações Rápidas do Atendimento (Header Informativo) */}
        <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs font-semibold text-slate-700 pmoc-no-print shrink-0">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            <span className="text-slate-500">Técnico(s) Responsável(is):</span>
            <span className="font-extrabold text-slate-900">
              {[record.technician1, record.technician2].filter(Boolean).join(' / ') || 'Não especificado'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span className="text-slate-500">Data Atendimento:</span>
              <span className="font-extrabold text-slate-900">{printDatesText}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              <span className="text-slate-500">Máquinas no Local:</span>
              <span className="font-extrabold text-slate-900">{equipments.length}</span>
            </div>
          </div>
        </div>

        {/* Área de Visualização e Impressão do Documento PMOC */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-200/70 print:p-0 print:bg-white print:overflow-visible">
          <div
            id="pmoc-modal-print-container"
            ref={contentRef}
            className="bg-white text-black mx-auto p-8 shadow-md border border-slate-300 print:border-none print:shadow-none print:p-0"
            style={{ width: '100%', maxWidth: '210mm', minHeight: '297mm', fontFamily: 'Arial, sans-serif' }}
          >
            {/* CABEÇALHO DA EMPRESA */}
            <div className="flex justify-between items-start border-b border-black pb-2 mb-3">
              <div className="flex items-center gap-4">
                <CompanyLogo 
                  companyId={printCompanyKey} 
                  logoUrl={printCompany.logoUrl} 
                  className="w-24 h-16 max-w-[120px] max-h-[64px]" 
                  alt={printCompany.name} 
                />
                <div>
                  <h1 className="text-[11px] font-bold uppercase leading-tight">{printCompany.name}</h1>
                  <p className="text-[9px] leading-tight">CNPJ: {printCompany.cnpj}</p>
                  <p className="text-[9px] leading-tight">Endereço: {printCompany.address}</p>
                  <p className="text-[9px] leading-tight">E-mail: {printCompany.email} - Telefone: {printCompany.phone}</p>
                </div>
              </div>

              <div className="text-right flex flex-col items-end">
                <p className="text-[9px]">Página: 1 de 1</p>
                <p className="text-[9px]">Mês: {record.month}</p>
              </div>
            </div>

            {/* TÍTULO PRINCIPAL */}
            <h2 className="text-center font-bold text-sm mb-2 uppercase tracking-wide">
              RELATÓRIO DE MANUTENÇÃO PREVENTIVA MENSAL (CONFORME PMOC)
            </h2>

            {/* QUADRO DE INFORMAÇÕES DO CLIENTE */}
            <div 
              className={cn(
                "preventive-fields-box pmoc-fields-box border-2 border-black text-[8pt] font-bold mb-2.5 py-1 pl-2.5 pr-1 select-none",
                printCompanyKey === 'lefrio' ? 'bg-[#9cbdde] text-black' : 'bg-[#90EE90] text-black'
              )}
              style={{
                backgroundColor: printCompanyKey === 'lefrio' ? '#9cbdde' : '#90EE90',
                color: '#000000',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact'
              }}
            >
              <div className="flex justify-between items-start gap-4 mb-0.5" style={{ backgroundColor: 'transparent' }}>
                <div className="font-bold uppercase flex-1 min-w-0 truncate" style={{ backgroundColor: 'transparent', textShadow: 'none', border: 'none' }}>
                  Cliente: {printClientName}
                </div>
                <div className="font-bold uppercase text-right whitespace-nowrap shrink-0 text-[7.2pt]" style={{ backgroundColor: 'transparent', textShadow: 'none', border: 'none' }}>
                  Contrato: {client?.contractNumber || 'S/N'}
                </div>
              </div>
              <div className="flex justify-between items-end gap-4" style={{ backgroundColor: 'transparent' }}>
                <div className="uppercase font-bold leading-tight text-left flex-1 min-w-0 text-[7.5pt]" style={{ backgroundColor: 'transparent', textShadow: 'none', border: 'none' }}>
                  {printAddressStreet} {printAddressCep ? `- ${printAddressCep}` : ''}
                </div>
                <div className="font-bold uppercase text-right whitespace-nowrap shrink-0 text-[7.2pt]" style={{ backgroundColor: 'transparent', textShadow: 'none', border: 'none' }}>
                  Ciclo: {formattedCycle}
                </div>
              </div>
            </div>

            {/* TABELA DE EQUIPAMENTOS DO PMOC */}
            <table className="w-full text-left border-collapse border border-black text-[8.5px] pmoc-print-table leading-tight" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
              <thead style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                <tr 
                  className={cn("font-bold border-b border-black", printCompanyKey === 'lefrio' ? 'bg-[#9cbdde] text-black' : 'bg-[#90EE90] text-black')}
                  style={{
                    backgroundColor: printCompanyKey === 'lefrio' ? '#9cbdde' : '#90EE90',
                    color: '#000000',
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact'
                  }}
                >
                  <th className="p-1 border-r border-black text-center w-8" style={{ backgroundColor: printCompanyKey === 'lefrio' ? '#9cbdde' : '#90EE90', color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>Item</th>
                  <th className="p-1 border-r border-black w-40" style={{ backgroundColor: printCompanyKey === 'lefrio' ? '#9cbdde' : '#90EE90', color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>Setor</th>
                  <th className="p-1 border-r border-black w-24" style={{ backgroundColor: printCompanyKey === 'lefrio' ? '#9cbdde' : '#90EE90', color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>Equipamento</th>
                  <th className="p-1 border-r border-black w-16" style={{ backgroundColor: printCompanyKey === 'lefrio' ? '#9cbdde' : '#90EE90', color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>Marca</th>
                  <th className="p-1 border-r border-black w-14 text-center" style={{ backgroundColor: printCompanyKey === 'lefrio' ? '#9cbdde' : '#90EE90', color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>BTUs</th>
                  <th className="p-1 border-r border-black w-20 text-center" style={{ backgroundColor: printCompanyKey === 'lefrio' ? '#9cbdde' : '#90EE90', color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>ID/Etiqueta</th>
                  <th className="p-1 border-r border-black w-36" style={{ backgroundColor: printCompanyKey === 'lefrio' ? '#9cbdde' : '#90EE90', color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>Visto do Técnico</th>
                  <th className="p-1 w-28" style={{ backgroundColor: printCompanyKey === 'lefrio' ? '#9cbdde' : '#90EE90', color: '#000000', textShadow: 'none', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>Obs.</th>
                </tr>
                <tr className="bg-transparent font-bold border-b border-black">
                  <td colSpan={8} className="p-1 text-center font-bold uppercase" style={{ backgroundColor: 'transparent', textShadow: 'none' }}>{printClientName}</td>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/70">
                {equipments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-500 font-semibold italic">
                      Nenhum equipamento cadastrado ou localizado neste endereço.
                    </td>
                  </tr>
                ) : (
                  equipments
                    .sort((a, b) => (a.label || '').localeCompare(b.label || '', undefined, { numeric: true, sensitivity: 'base' }))
                    .map((eq, index) => {
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
                            timeText = ' ' + formatDateSafe(found.checkedAt, 'HH:mm');
                          } catch (e) {
                            if (found.checkedAt.includes('T')) {
                              const parts = found.checkedAt.split('T')[1];
                              if (parts) timeText = ' ' + parts.substring(0, 5);
                            }
                          }
                        }
                        statusText = `(APP: ${itemDate}${timeText} ${record.technician1 || 'Técnico'})`;
                      } else if (isSkipped) {
                        statusText = `PULADO EM ${itemDate}`;
                      }

                      return (
                        <tr key={eq.id} className="border-b border-black" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                          <td className="p-1 border-r border-black text-center font-bold">{eq.label || index + 1}</td>
                          <td className="p-1 border-r border-black uppercase font-semibold">{eq.sector || '-'}</td>
                          <td className="p-1 border-r border-black uppercase">{eq.name || '-'}</td>
                          <td className="p-1 border-r border-black uppercase">{eq.brand || '-'}</td>
                          <td className="p-1 border-r border-black text-center font-bold">{formatBtus(eq.btus)}</td>
                          <td className="p-1 border-r border-black text-center font-mono">{eq.patrimony || eq.id.slice(0, 6)}</td>
                          <td className="p-1 border-r border-black text-[8px] uppercase font-normal">{statusText || '-'}</td>
                          <td className="p-1 text-[8px] font-semibold text-slate-800 break-words">{obsValue || '-'}</td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>

            {/* OBSERVAÇÕES GERAIS */}
            {record.routeNotes && (
              <div className="border border-black p-2 mt-3 text-[8.5px]">
                <span className="font-bold uppercase">Obs Geral: </span>
                {record.routeNotes}
              </div>
            )}

            {/* ASSINATURAS E VISTOS */}
            <div className="mt-8 flex justify-between items-end pt-3 gap-8 mb-4" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
              <div className="text-[9.5px] w-1/2 flex flex-col justify-end items-start text-left">
                <p className="font-bold uppercase text-[9.5px] text-emerald-850">Equipe Técnica Autenticada</p>
                <p className="font-extrabold mt-1 text-slate-900">
                  {record.technician1 || '-'}
                  {record.technician2 ? ` / ${record.technician2}` : ''}
                </p>
                <p className="text-[8px] text-gray-500 mt-0.5">Autenticado via App em {printDatesText}</p>
              </div>

              <div className="flex flex-col items-center justify-end w-1/2 text-center">
                {record.clientSignature ? (
                  <img 
                    src={record.clientSignature} 
                    alt="Assinatura Representante" 
                    className="h-12 object-contain border-b border-black pb-1 w-full"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-10 w-full border-b border-black" />
                )}
                <span className="font-bold uppercase text-[9px] mt-1">Assinatura do Responsável do Cliente</span>
                <span className="text-[10px] font-bold text-gray-900 mt-0.5">
                  {record.clientSigneeName || '-'}
                  {record.clientSigneeRegistration ? ` (Matrícula: ${record.clientSigneeRegistration})` : ''}
                </span>
                {(() => {
                  const { clientSignatureDate: pSig } = getRecordTimestamps(record);
                  if (pSig && (pSig.includes('T') || pSig.includes(':'))) {
                    return (
                      <p className="text-[7.5px] text-gray-500 mt-0.5">
                        Assinado digitalmente em {formatDateSafe(pSig, 'dd/MM/yyyy')} às {formatDateSafe(pSig, 'HH:mm:ss')}
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            {/* ANEXO FOTOGRÁFICO DO ATENDIMENTO (SE HOUVER) */}
            {equipsWithPhotos.length > 0 && (
              <div className="pt-6 border-t border-black mt-6" style={{ pageBreakBefore: 'always' }}>
                <h3 className="text-center font-bold text-xs uppercase mb-3">ANEXO FOTOGRÁFICO DO ATENDIMENTO</h3>
                <div className="grid grid-cols-2 gap-3">
                  {equipsWithPhotos.map(({ eq, photos }) => (
                    <div key={eq.id} className="border border-black p-2 rounded-md flex flex-col gap-2 bg-white" style={{ pageBreakInside: 'avoid' }}>
                      <span className="font-bold text-[8.5px] uppercase block border-b border-black pb-1">
                        {eq.label || eq.name} - {eq.sector || 'Sem setor'} ({eq.brand || 'Sem marca'}{eq.btus ? ` - ${formatBtus(eq.btus)} BTUs` : ''})
                      </span>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {photos.map((photo, pIdx) => (
                          <div key={pIdx} className="w-full flex justify-center border border-gray-300 rounded overflow-hidden bg-gray-50 h-28">
                            <img 
                              src={photo} 
                              alt={`Foto ${pIdx + 1} - ${eq.name}`} 
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RODAPÉ INFORMATIVO DA PRÉ-VISUALIZAÇÃO */}
        <div className="bg-slate-900 border-t border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 pmoc-no-print shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <p className="text-[11px] text-slate-300">
              <strong className="text-white font-bold">Documento Oficial:</strong> Esta folha é o documento final que compõe o processo de faturamento e será arquivada na pasta física do cliente após a homologação.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintAction}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / PDF</span>
            </button>
            {onHomologate && record.status !== 'completed' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onHomologate(record);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs transition-colors cursor-pointer shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Prosseguir para Homologação</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
