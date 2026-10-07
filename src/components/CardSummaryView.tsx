import React, { useState, useEffect, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  CreditCard, 
  Printer, 
  Calendar, 
  RefreshCw, 
  FileText, 
  CheckCircle2, 
  DollarSign, 
  Receipt,
  User,
  ShieldCheck,
  ExternalLink,
  Layers,
  Download,
  Loader2
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { 
  TravelCard, 
  RouteMonthlyPlanning, 
  RouteCostItem, 
  UserRole, 
  MaintenanceRecord, 
  RouteConfiguration, 
  Address,
  RouteExpense 
} from '../types';

interface CardSummaryViewProps {
  userRole?: string | UserRole;
}

export interface CardExpenseDisplayItem {
  id: string;
  sourceType: 'planned' | 'actual';
  description: string;
  category: string;
  value: number;
  date: string;
  routeName: string;
  cardId: string;
  cardLabel: string;
  technicians: string;
  receiptUrl?: string;
  receiptStatus?: string;
}

export default function CardSummaryView({ userRole }: CardSummaryViewProps) {
  const [month, setMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  const [travelCards, setTravelCards] = useState<TravelCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string>('ALL');
  const [expenseTypeFilter, setExpenseTypeFilter] = useState<'ALL' | 'actual' | 'planned'>('ALL');

  const [routePlannings, setRoutePlannings] = useState<RouteMonthlyPlanning[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [routeExpenses, setRouteExpenses] = useState<RouteExpense[]>([]);
  const [routeConfigs, setRouteConfigs] = useState<RouteConfiguration[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  
  // Campo de Observações gerais para o relatório impresso
  const [generalNotes, setGeneralNotes] = useState<string>(() => {
    try {
      return localStorage.getItem('card_summary_general_notes') || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('card_summary_general_notes', generalNotes);
    } catch {}
  }, [generalNotes]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [month]);

  const loadData = async () => {
    setLoading(true);
    try {
      const cards = await dataService.getTravelCards();
      setTravelCards(cards || []);
      
      const [plannings, records, expenses, configs, addrs] = await Promise.all([
        dataService.getRoutePlannings(month),
        dataService.getRecords(month),
        dataService.getRouteExpenses(month),
        dataService.getRouteConfigs(),
        dataService.getAddresses()
      ]);
      
      setRoutePlannings(plannings || []);
      setMaintenanceRecords(records || []);
      setRouteExpenses(expenses || []);
      setRouteConfigs(configs || []);
      setAddresses(addrs || []);
    } catch (err) {
      console.error("Erro ao carregar dados do resumo de cartões:", err);
    } finally {
      setLoading(false);
    }
  };

  const getRouteTechnicians = (routeName: string): string => {
    if (!routeName) return '-';
    const cleanName = routeName.trim().toLowerCase();

    // 1. Procurar em routeConfigs
    const config = routeConfigs.find(c => {
      if (c.routeName && c.routeName.trim().toLowerCase() === cleanName) return true;
      if (c.id && c.id.trim().toLowerCase() === cleanName) return true;
      if (c.routeNumber && c.routeName && `${c.routeNumber.trim()} - ${c.routeName.trim()}`.toLowerCase() === cleanName) return true;
      return false;
    });

    if (config && (config.technician1 || config.technician2)) {
      const techs = [config.technician1, config.technician2].filter(Boolean);
      if (techs.length > 0) return techs.join(' / ');
    }

    // 2. Procurar em maintenanceRecords
    const recordWithTech = maintenanceRecords.find(r => {
      const rName = (r.assignedRoute || r.temporaryRouteName || '').trim().toLowerCase();
      return rName === cleanName && (r.technician1 || r.technician2);
    });

    if (recordWithTech && (recordWithTech.technician1 || recordWithTech.technician2)) {
      const techs = [recordWithTech.technician1, recordWithTech.technician2].filter(Boolean);
      if (techs.length > 0) return techs.join(' / ');
    }

    // 3. Procurar em addresses
    const addressMatch = addresses.find(a => (a.route || '').trim().toLowerCase() === cleanName);
    if (addressMatch) {
      const rec = maintenanceRecords.find(r => r.addressId === addressMatch.id && (r.technician1 || r.technician2));
      if (rec && (rec.technician1 || rec.technician2)) {
        const techs = [rec.technician1, rec.technician2].filter(Boolean);
        if (techs.length > 0) return techs.join(' / ');
      }
    }

    return '-';
  };

  const selectedCard = selectedCardId === 'ALL' 
    ? null 
    : travelCards.find(c => c.id === selectedCardId);

  // Mapa de cartões vinculados a cada rota
  const routeToCardMap = useMemo(() => {
    const map = new Map<string, string>();
    (routePlannings || []).forEach(p => {
      if (p.routeName && p.routeCardId) {
        map.set(p.routeName.trim().toLowerCase(), p.routeCardId);
      }
    });
    (maintenanceRecords || []).forEach(r => {
      const rName = (r.assignedRoute || r.temporaryRouteName || '').trim().toLowerCase();
      if (rName && r.routeCardId) {
        map.set(rName, r.routeCardId);
      }
    });
    return map;
  }, [routePlannings, maintenanceRecords]);

  const cardExpenses = useMemo(() => {
    const items: CardExpenseDisplayItem[] = [];
    const processedPlanningIds = new Set<string>();

    const getCardLabel = (cId?: string) => {
      if (!cId) return 'Cartão Não Definido';
      const c = travelCards.find(card => card.id === cId);
      return c ? `${c.bank} (Final ${c.lastFourDigits})` : 'Cartão';
    };

    // 1. Processar despesas reais lançadas em campo (RouteExpenses)
    (routeExpenses || []).forEach(exp => {
      const rName = (exp.routeName || '').trim();
      const rCardId = routeToCardMap.get(rName.toLowerCase()) || '';
      
      const isCardMatch = selectedCardId === 'ALL' || rCardId === selectedCardId;
      if (!isCardMatch) return;

      const techName = exp.technicianName || getRouteTechnicians(rName);

      items.push({
        id: `actual_${exp.id}`,
        sourceType: 'actual',
        description: exp.description || 'Despesa de Viagem',
        category: exp.category || 'Geral',
        value: Number(exp.actualValue) || 0,
        date: exp.expenseDate || '',
        routeName: rName,
        cardId: rCardId,
        cardLabel: getCardLabel(rCardId),
        technicians: techName,
        receiptUrl: exp.receiptUrl || exp.receiptAttachment?.url,
        receiptStatus: exp.status
      });

      if (exp.plannedCostItemId) {
        processedPlanningIds.add(exp.plannedCostItemId);
      }
    });

    // 2. Processar itens de custos planejados nas rotas do mês
    (routePlannings || []).forEach(planning => {
      const pName = (planning.routeName || '').trim();
      if (!pName) return;

      const planningCardId = planning.routeCardId || '';
      const isCardMatch = selectedCardId === 'ALL' || planningCardId === selectedCardId;
      if (!isCardMatch) return;

      const techs = getRouteTechnicians(pName);
      const hasCostItems = Array.isArray(planning.routeCostItems) && planning.routeCostItems.length > 0;
      const estimatedVal = Number(planning.routeEstimatedCost) || 0;

      if (hasCostItems) {
        planning.routeCostItems!.forEach(item => {
          // Se já existe uma despesa real vinculada a esse item planejado e o filtro é ALL, mantemos o item com tag planejada
          items.push({
            id: `planned_${item.id}`,
            sourceType: 'planned',
            description: item.description || `Previsão - ${pName}`,
            category: item.category || 'Custo Planejado',
            value: Number(item.value) || 0,
            date: item.date || planning.plannedDate || '',
            routeName: planning.routeName || pName,
            cardId: planningCardId,
            cardLabel: getCardLabel(planningCardId),
            technicians: techs
          });
        });
      } else if (estimatedVal > 0) {
        items.push({
          id: `planned_est_${planning.id || pName}`,
          sourceType: 'planned',
          description: `Previsão de Gastos de Viagem - ${planning.routeName || pName}`,
          category: 'Custo Total Estimado',
          value: estimatedVal,
          date: planning.plannedDate || '',
          routeName: planning.routeName || pName,
          cardId: planningCardId,
          cardLabel: getCardLabel(planningCardId),
          technicians: techs
        });
      }
    });

    // 3. Processar registros de manutenção onde o custo foi salvo diretamente no record
    (maintenanceRecords || []).forEach(record => {
      const rRoute = (record.assignedRoute || record.temporaryRouteName || '').trim();
      if (!rRoute) return;

      const recordCardId = record.routeCardId || '';
      const isCardMatch = selectedCardId === 'ALL' || recordCardId === selectedCardId;
      if (!isCardMatch) return;

      // Evita duplicar se a rota já veio do planejamento
      const alreadyProcessedInPlanning = routePlannings.some(p => (p.routeName || '').trim().toLowerCase() === rRoute.toLowerCase());
      if (alreadyProcessedInPlanning) return;

      const techs = getRouteTechnicians(rRoute);
      const hasCostItems = Array.isArray(record.routeCostItems) && record.routeCostItems.length > 0;
      const estimatedVal = Number(record.routeEstimatedCost) || 0;

      if (hasCostItems) {
        record.routeCostItems!.forEach((item: RouteCostItem) => {
          items.push({
            id: `rec_item_${item.id}`,
            sourceType: 'planned',
            description: item.description || `Previsão - ${rRoute}`,
            category: item.category || 'Custo Planejado',
            value: Number(item.value) || 0,
            date: item.date || record.plannedDate || '',
            routeName: rRoute,
            cardId: recordCardId,
            cardLabel: getCardLabel(recordCardId),
            technicians: techs
          });
        });
      } else if (estimatedVal > 0) {
        items.push({
          id: `rec_est_${record.id || rRoute}`,
          sourceType: 'planned',
          description: `Previsão de Viagem - ${rRoute}`,
          category: 'Custo Total Estimado',
          value: estimatedVal,
          date: record.plannedDate || '',
          routeName: rRoute,
          cardId: recordCardId,
          cardLabel: getCardLabel(recordCardId),
          technicians: techs
        });
      }
    });

    // Filtrar por tipo (Planejado x Real) se solicitado
    let filtered = items;
    if (expenseTypeFilter === 'actual') {
      filtered = filtered.filter(it => it.sourceType === 'actual');
    } else if (expenseTypeFilter === 'planned') {
      filtered = filtered.filter(it => it.sourceType === 'planned');
    }

    // Ordenar por data
    filtered.sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      return dateA.localeCompare(dateB);
    });

    // Filtro por intervalo de datas (se preenchido)
    if (startDate || endDate) {
      filtered = filtered.filter(exp => {
        const d = exp.date;
        if (!d) return true;
        const isAfterStart = startDate ? d >= startDate : true;
        const isBeforeEnd = endDate ? d <= endDate : true;
        return isAfterStart && isBeforeEnd;
      });
    }

    return filtered;
  }, [routePlannings, maintenanceRecords, routeExpenses, travelCards, selectedCardId, expenseTypeFilter, startDate, endDate, routeToCardMap]);

  const totalAmount = useMemo(() => {
    return cardExpenses.reduce((acc, curr) => acc + (curr.value || 0), 0);
  }, [cardExpenses]);

  const totalActual = useMemo(() => {
    return cardExpenses
      .filter(it => it.sourceType === 'actual')
      .reduce((acc, curr) => acc + (curr.value || 0), 0);
  }, [cardExpenses]);

  const totalPlanned = useMemo(() => {
    return cardExpenses
      .filter(it => it.sourceType === 'planned')
      .reduce((acc, curr) => acc + (curr.value || 0), 0);
  }, [cardExpenses]);

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const handleDownloadPDF = async () => {
    if (isGeneratingPDF || cardExpenses.length === 0) return;
    setIsGeneratingPDF(true);
    try {
      const element = document.querySelector('.card-summary-printable-sheet') as HTMLElement;
      if (!element) throw new Error('Folha de prestação de contas não encontrada');

      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 1200
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const cardName = selectedCard ? `${selectedCard.bank}_${selectedCard.lastFourDigits}` : 'Consolidado';
      pdf.save(`Prestacao_Contas_Cartao_${cardName}_${month}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar PDF diretamente:', err);
      handlePrint();
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handlePrint = () => {
    window.scrollTo(0, 0);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleOpenPrintWindow = () => {
    const cardTitle = selectedCard 
      ? `${selectedCard.bank} - Final ${selectedCard.lastFourDigits} (${selectedCard.holderName})`
      : 'Todos os Cartões (Consolidado)';
    
    const formattedMonth = format(parseISO(`${month}-01`), 'MMMM yyyy', { locale: ptBR }).toUpperCase();
    const periodText = (startDate || endDate)
      ? `Período: ${startDate ? format(parseISO(startDate), 'dd/MM/yyyy') : '-'} até ${endDate ? format(parseISO(endDate), 'dd/MM/yyyy') : '-'}`
      : `Mês de Referência: ${formattedMonth}`;

    const rowsHtml = cardExpenses.map((exp, idx) => {
      const displayDate = exp.date ? format(parseISO(exp.date), 'dd/MM/yyyy') : '-';
      const formattedVal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(exp.value || 0);
      const isActual = exp.sourceType === 'actual';

      return `
        <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid;">
          <td style="padding: 8px 6px; font-size: 11px; font-weight: bold; text-align: center;">${displayDate}</td>
          <td style="padding: 8px 6px; font-size: 11px; font-weight: bold; color: #1e293b;">${exp.routeName}</td>
          <td style="padding: 8px 6px; font-size: 11px; color: #334155;">${exp.technicians}</td>
          ${selectedCardId === 'ALL' ? `<td style="padding: 8px 6px; font-size: 10px; color: #475569;">${exp.cardLabel}</td>` : ''}
          <td style="padding: 8px 6px; font-size: 11px; color: #1e293b;">
            <strong>${exp.category}:</strong> ${exp.description}
          </td>
          <td style="padding: 8px 6px; font-size: 10px; text-align: center;">
            <span style="font-weight: bold; padding: 2px 6px; border-radius: 4px; border: 1px solid ${isActual ? '#16a34a' : '#2563eb'}; color: ${isActual ? '#16a34a' : '#2563eb'};">
              ${isActual ? 'REALIZADO' : 'PREVISTO'}
            </span>
          </td>
          <td style="padding: 8px 6px; font-size: 11px; font-weight: bold; text-align: right; white-space: nowrap;">${formattedVal}</td>
        </tr>
      `;
    }).join('');

    const printHtml = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Prestação de Contas - Despesas do Cartão</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm 12mm 12mm 12mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            margin: 0;
            padding: 10px;
          }
          .header {
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .header h1 {
            font-size: 18px;
            font-weight: 900;
            margin: 0 0 4px 0;
            text-transform: uppercase;
            letter-spacing: -0.5px;
          }
          .header p {
            margin: 0;
            font-size: 11px;
            color: #475569;
            font-weight: 500;
          }
          .kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 16px;
            background: #f8fafc;
            padding: 10px;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
          }
          .kpi-box {
            font-size: 10px;
          }
          .kpi-title {
            text-transform: uppercase;
            font-weight: 800;
            color: #64748b;
            margin-bottom: 2px;
          }
          .kpi-val {
            font-size: 13px;
            font-weight: 900;
            color: #0f172a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th {
            background: #0f172a;
            color: #ffffff;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            padding: 8px 6px;
            text-align: left;
          }
          tfoot tr td {
            padding: 10px 6px;
            font-weight: 900;
            border-top: 2px solid #0f172a;
            background: #f8fafc;
          }
          .notes-box {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 20px;
            font-size: 11px;
            page-break-inside: avoid;
          }
          .notes-title {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            color: #475569;
            margin-bottom: 4px;
          }
          .signatures {
            margin-top: 30px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            page-break-inside: avoid;
          }
          .sign-line {
            border-top: 1px solid #0f172a;
            padding-top: 6px;
            text-align: center;
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
          }
          .footer-text {
            margin-top: 20px;
            text-align: center;
            font-size: 9px;
            color: #94a3b8;
            font-weight: bold;
            text-transform: uppercase;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>Relatório de Prestação de Contas - Despesas do Cartão</h1>
            <p>Le Frio Refrigeração & Climatização • Controle Financeiro de Viagens</p>
            <p style="margin-top: 4px; font-weight: bold; color: #0284c7;">${periodText}</p>
          </div>
          <div style="text-align: right;">
            <p style="font-weight: 800; font-size: 10px; text-transform: uppercase; color: #64748b;">Cartão de Pagamento</p>
            <p style="font-size: 14px; font-weight: 900; color: #0369a1;">${cardTitle}</p>
            <p style="font-size: 9px; color: #64748b;">Emissão: ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-title">Qtd. de Lançamentos</div>
            <div class="kpi-val">${cardExpenses.length} itens</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Despesas Realizadas</div>
            <div class="kpi-val" style="color: #16a34a;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalActual)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Custos Previstos</div>
            <div class="kpi-val" style="color: #2563eb;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPlanned)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Total da Prestação</div>
            <div class="kpi-val" style="color: #0f172a; font-size: 15px;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 75px; text-align: center;">Data</th>
              <th style="width: 140px;">Rota / Cidade</th>
              <th style="width: 130px;">Técnicos</th>
              ${selectedCardId === 'ALL' ? '<th style="width: 130px;">Cartão</th>' : ''}
              <th>Descrição da Despesa</th>
              <th style="width: 85px; text-align: center;">Tipo</th>
              <th style="width: 100px; text-align: right;">Valor (R$)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="${selectedCardId === 'ALL' ? 6 : 5}" style="text-align: right; text-transform: uppercase; font-size: 11px;">
                Total Geral Consolidado das Despesas do Cartão:
              </td>
              <td style="text-align: right; font-size: 14px; font-weight: 900; color: #0f172a; white-space: nowrap;">
                ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}
              </td>
            </tr>
          </tfoot>
        </table>

        ${generalNotes ? `
          <div class="notes-box">
            <div class="notes-title">Observações Gerais / Justificativas:</div>
            <div style="line-height: 1.5; color: #1e293b; white-space: pre-line;">${generalNotes}</div>
          </div>
        ` : ''}

        <div class="signatures">
          <div>
            <div style="height: 40px;"></div>
            <div class="sign-line">
              Responsável pelo Cartão / Técnico de Campo
            </div>
          </div>
          <div>
            <div style="height: 40px;"></div>
            <div class="sign-line">
              Gestão Financeira / Aprovador
            </div>
          </div>
        </div>

        <div class="footer-text">
          Documento oficial de prestação de contas emitido em ${format(new Date(), 'dd/MM/yyyy HH:mm')} - Le Frio Refrigeração
        </div>
      </body>
      </html>
    `;

    // Abrir em popup dedicado e acionar print
    const printWindow = window.open('', '_blank', 'width=900,height=750');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(printHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 350);
    } else {
      // Se popup for bloqueado pelo navegador, executa a impressão normal na página
      handlePrint();
    }
  };

  const setNextWeek = () => {
    const today = new Date();
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));
    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);
    
    setStartDate(format(nextMonday, 'yyyy-MM-dd'));
    setEndDate(format(nextSunday, 'yyyy-MM-dd'));
  };

  const clearDates = () => {
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="space-y-6 card-summary-view-wrapper">
      {/* Estilos dedicados e à prova de falhas para impressão sem folhas em branco */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 10mm 10mm 10mm !important;
          }

          /* Reset total para corpo e contêineres ancestrais */
          html, body, #root, #root > div, main, main > div, main > div > div, .card-summary-view-wrapper {
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
            box-shadow: none !important;
            border: none !important;
          }

          /* Ocultar elementos de controle de tela */
          .print\\:hidden,
          .card-summary-controls,
          aside,
          nav,
          header,
          button,
          input,
          select {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            overflow: hidden !important;
          }

          /* A folha de impressão A4 formal */
          .card-summary-printable-sheet {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            border: none !important;
            box-shadow: none !important;
            overflow: visible !important;
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

          .print-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Painel de Controles e Filtros (Oculto na Impressão) */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-5 justify-between items-start print:hidden card-summary-controls">
        <div className="flex flex-col gap-4 w-full md:w-auto">
          
          <div className="flex flex-col md:flex-row gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-blue-600" />
                Mês Base
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:border-blue-500 bg-gray-50"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-blue-600" />
                Cartão de Pagamento
              </label>
              <select
                value={selectedCardId}
                onChange={(e) => setSelectedCardId(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:border-blue-500 bg-gray-50 w-full md:w-72"
              >
                <option value="ALL">💳 Todos os Cartões (Visão Geral Consolidada)</option>
                {travelCards.map(card => (
                  <option key={card.id} value={card.id}>
                    {card.bank} (Final {card.lastFourDigits}) - {card.holderName}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-600" />
                Tipo de Despesa
              </label>
              <select
                value={expenseTypeFilter}
                onChange={(e: any) => setExpenseTypeFilter(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:border-blue-500 bg-gray-50"
              >
                <option value="ALL">Todas as Despesas (Realizadas & Previstas)</option>
                <option value="actual">Apenas Despesas Realizadas (Comprovantes)</option>
                <option value="planned">Apenas Custos Planejados da Rota</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                Data Inicial (Opcional)
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:border-blue-500 bg-gray-50"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                Data Final (Opcional)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:border-blue-500 bg-gray-50"
              />
            </div>

            <div className="flex gap-2">
              <button 
                type="button"
                onClick={setNextWeek}
                className="px-3.5 py-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors border border-blue-100 cursor-pointer"
              >
                Próxima Semana
              </button>
              <button 
                type="button"
                onClick={clearDates}
                className="px-3.5 py-2 text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors border border-gray-200 cursor-pointer"
              >
                Limpar Datas
              </button>
            </div>
          </div>

          {/* Campo de Observações Gerais para a Folha Impressa */}
          <div className="space-y-1.5 w-full border-t border-gray-100 pt-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" />
                Observações & Justificativas (sairão impressas no rodapé da folha)
              </label>
              {generalNotes && (
                <button 
                  type="button" 
                  onClick={() => setGeneralNotes('')}
                  className="text-[11px] font-semibold text-rose-500 hover:text-rose-700 hover:underline cursor-pointer"
                >
                  Limpar Observações
                </button>
              )}
            </div>
            <textarea
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder="Digite aqui observações adicionais, justificativas de viagem ou instruções de fechamento para constarem na prestação de contas impressa..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 outline-none focus:border-blue-500 focus:bg-white bg-gray-50 resize-y transition-all"
            />
          </div>

        </div>
        
        {/* Botões de Ação */}
        <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 self-start mt-2 w-full md:w-auto">
          <button
            type="button"
            onClick={() => loadData()}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors border border-gray-200 cursor-pointer disabled:opacity-50 text-xs uppercase tracking-wider"
            title="Atualizar dados do cartão"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={cardExpenses.length === 0 || isGeneratingPDF}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-xs uppercase tracking-wider"
            title="Baixar relatório oficial em arquivo PDF"
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
            onClick={handlePrint}
            disabled={cardExpenses.length === 0}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-md shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-xs uppercase tracking-wider"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Relatório</span>
          </button>

          <button
            type="button"
            onClick={handleOpenPrintWindow}
            disabled={cardExpenses.length === 0}
            className="flex items-center justify-center gap-2 px-5 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-[11px] uppercase tracking-wider"
            title="Abre o documento oficial em janela isolada de impressão (à prova de falhas em qualquer navegador)"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir p/ Impressão Direta</span>
          </button>
        </div>
      </div>

      {/* A Folha de Prestação de Contas (Visível na Tela e Impressa com Perfeição) */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-200 shadow-xs gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Carregando dados da prestação de contas...</p>
        </div>
      ) : (
        <div className="card-summary-printable-sheet bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden print:shadow-none print:border-none print:m-0 print:p-0 print:rounded-none">
          
          {/* Cabeçalho do Relatório */}
          <div className="p-6 md:p-8 border-b-2 border-gray-900 bg-slate-50/50 print:bg-white print:border-black">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 block mb-1 print:text-black">
                  Controle de Viagens &bull; Cartões Corporativos
                </span>
                <h1 className="text-xl md:text-2xl font-black text-gray-950 uppercase tracking-tight">
                  Relatório de Prestação de Contas das Despesas do Cartão
                </h1>
                <p className="text-gray-500 font-medium text-xs mt-1 print:text-gray-700">
                  Le Frio Refrigeração &bull; Mês de Referência: <strong className="text-gray-800 uppercase print:text-black">{format(parseISO(`${month}-01`), 'MMMM yyyy', { locale: ptBR })}</strong>
                </p>
                {(startDate || endDate) && (
                  <p className="text-blue-800 font-bold mt-1 text-xs bg-blue-50 inline-block px-3 py-1 rounded-full border border-blue-200 print:bg-transparent print:px-0 print:text-black print:border-none">
                    Período Filtrado: {startDate ? format(parseISO(startDate), 'dd/MM/yyyy') : '-'} até {endDate ? format(parseISO(endDate), 'dd/MM/yyyy') : '-'}
                  </p>
                )}
              </div>
              
              <div className="text-left md:text-right border-l-4 md:border-l-0 md:border-r-4 border-blue-600 pl-4 md:pl-0 md:pr-4 print:border-black">
                {selectedCard ? (
                  <>
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-0.5 print:text-black">Cartão Vinculado</p>
                    <p className="text-base md:text-lg font-black text-blue-700 uppercase print:text-black">{selectedCard.bank}</p>
                    <p className="text-xs font-bold text-gray-700 uppercase print:text-black">Final {selectedCard.lastFourDigits}</p>
                    <p className="text-xs font-semibold text-gray-500 print:text-black">{selectedCard.holderName}</p>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-0.5 print:text-black">Escopo Financeiro</p>
                    <p className="text-base md:text-lg font-black text-blue-700 uppercase print:text-black">Todos os Cartões</p>
                    <p className="text-xs font-bold text-gray-600 uppercase print:text-black">Visão Geral Consolidada</p>
                  </>
                )}
                <p className="text-[10px] text-gray-400 font-medium mt-1 print:text-gray-600">
                  Emitido em: {format(new Date(), 'dd/MM/yyyy HH:mm')}
                </p>
              </div>
            </div>

            {/* Painel Resumo KPI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-4 border-t border-gray-200 print:border-black">
              <div className="bg-white p-3 rounded-xl border border-gray-200 print:border-gray-400">
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Lançamentos</span>
                <span className="text-lg font-black text-gray-900">{cardExpenses.length}</span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-gray-200 print:border-gray-400">
                <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider block">Realizado (Comprovado)</span>
                <span className="text-lg font-black text-emerald-700">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalActual)}
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-gray-200 print:border-gray-400">
                <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider block">Previsto no Cartão</span>
                <span className="text-lg font-black text-blue-700">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPlanned)}
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border-2 border-gray-900 print:border-black">
                <span className="text-[10px] font-black uppercase text-gray-600 tracking-wider block">Total Prestação</span>
                <span className="text-lg font-black text-gray-950">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Tabela de Despesas */}
          <div className="p-4 md:p-8">
            {cardExpenses.length === 0 ? (
              <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
                <CreditCard className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                <p className="font-bold text-sm">Nenhuma despesa ou previsão registrada para este cartão neste período.</p>
                <p className="text-xs text-gray-400 mt-1">Verifique os filtros selecionados ou selecione outro mês.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-gray-900 bg-gray-100/70 print:bg-white print:border-black">
                      <th className="py-3 px-3 text-[11px] font-black text-gray-800 uppercase tracking-wider print:text-black text-center whitespace-nowrap">Data</th>
                      <th className="py-3 px-3 text-[11px] font-black text-gray-800 uppercase tracking-wider print:text-black">Rota / Cidade</th>
                      <th className="py-3 px-3 text-[11px] font-black text-gray-800 uppercase tracking-wider print:text-black">Técnicos</th>
                      {selectedCardId === 'ALL' && (
                        <th className="py-3 px-3 text-[11px] font-black text-gray-800 uppercase tracking-wider print:text-black">Cartão</th>
                      )}
                      <th className="py-3 px-3 text-[11px] font-black text-gray-800 uppercase tracking-wider print:text-black">Descrição da Despesa</th>
                      <th className="py-3 px-3 text-[11px] font-black text-gray-800 uppercase tracking-wider print:text-black text-center">Tipo</th>
                      <th className="py-3 px-3 text-[11px] font-black text-gray-800 uppercase tracking-wider text-right print:text-black whitespace-nowrap">Valor (R$)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 print:divide-black">
                    {cardExpenses.map((expense, idx) => {
                      const displayDate = expense.date;
                      const isActual = expense.sourceType === 'actual';

                      return (
                        <tr key={expense.id || idx} className="hover:bg-gray-50 print:hover:bg-white">
                          <td className="py-2.5 px-3 text-xs font-bold text-gray-900 print:text-black text-center whitespace-nowrap">
                            {displayDate ? format(parseISO(displayDate), 'dd/MM/yyyy') : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-xs font-bold text-gray-700 print:text-black">
                            {expense.routeName}
                          </td>
                          <td className="py-2.5 px-3 text-xs font-medium text-gray-800 print:text-black">
                            {expense.technicians && expense.technicians !== '-' ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200 print:bg-transparent print:border-none print:p-0 print:text-black">
                                {expense.technicians}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic print:text-black">-</span>
                            )}
                          </td>
                          {selectedCardId === 'ALL' && (
                            <td className="py-2.5 px-3 text-[11px] font-semibold text-gray-600 print:text-black whitespace-nowrap">
                              {expense.cardLabel}
                            </td>
                          )}
                          <td className="py-2.5 px-3 text-xs font-medium text-gray-700 print:text-black">
                            <span className="font-bold text-gray-900 print:text-black">{expense.category}: </span>
                            {expense.description || '-'}
                            {expense.receiptUrl && (
                              <span className="ml-1.5 inline-flex items-center text-[10px] font-black text-emerald-600 print:hidden" title="Comprovante Anexado">
                                &bull; [Comprovante]
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] font-bold text-center whitespace-nowrap print:text-black">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isActual 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 print:bg-transparent print:border-gray-500' 
                                : 'bg-blue-50 text-blue-700 border border-blue-200 print:bg-transparent print:border-gray-500'
                            }`}>
                              {isActual ? 'Realizado' : 'Previsto'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-xs font-black text-gray-900 text-right print:text-black whitespace-nowrap">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(expense.value || 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-900 print:border-black bg-slate-50 print:bg-white">
                      <td colSpan={selectedCardId === 'ALL' ? 6 : 5} className="py-3 px-3 text-right text-xs font-black text-gray-700 uppercase tracking-wider print:text-black">
                        Total Geral das Despesas do Cartão:
                      </td>
                      <td className="py-3 px-3 text-base font-black text-gray-950 text-right print:text-black whitespace-nowrap">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Observações Gerais impressas no final */}
            {generalNotes && (
              <div className="mt-8 p-4 bg-slate-50 border border-slate-200 rounded-xl print:border-black print:bg-white print-avoid-break">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 print:text-black mb-1">
                  Observações Gerais & Justificativas da Prestação de Contas:
                </p>
                <p className="text-xs text-slate-800 print:text-black whitespace-pre-line leading-relaxed font-medium">
                  {generalNotes}
                </p>
              </div>
            )}

            {/* Campos Formais de Assinatura para Prestação de Contas */}
            <div className="mt-12 pt-6 border-t-2 border-gray-900 print:border-black print-avoid-break">
              <div className="grid grid-cols-2 gap-8">
                <div className="text-center pt-8 border-t border-gray-400 print:border-black">
                  <p className="text-xs font-black uppercase text-gray-900 print:text-black">
                    {selectedCard ? selectedCard.holderName : 'Técnico de Campo / Portador do Cartão'}
                  </p>
                  <p className="text-[10px] text-gray-500 uppercase font-semibold print:text-gray-700">Responsável pela Utilização</p>
                </div>

                <div className="text-center pt-8 border-t border-gray-400 print:border-black">
                  <p className="text-xs font-black uppercase text-gray-900 print:text-black">
                    Gestão Financeira &bull; Diretoria
                  </p>
                  <p className="text-[10px] text-gray-500 uppercase font-semibold print:text-gray-700">Visto de Conferência & Homologação</p>
                </div>
              </div>
            </div>

            <div className="mt-8 text-center text-[9px] font-bold text-gray-400 uppercase tracking-widest print:block hidden">
              Relatório Oficial de Prestação de Contas &bull; Le Frio Refrigeração &bull; Gerado em {format(new Date(), 'dd/MM/yyyy HH:mm')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
