import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, CheckCircle2, Clock, AlertTriangle, ShieldCheck, 
  User, Building, MapPin, Wrench, Check, RotateCcw, Lock, 
  Send, Sparkles, Loader2, ArrowRight, XCircle
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { ServiceOrder } from '../types';

interface PublicOSSignatureViewProps {
  token: string;
}

export default function PublicOSSignatureView({ token }: PublicOSSignatureViewProps) {
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  // Form State
  const [signeeName, setSigneeName] = useState('');
  const [signeeRegistration, setSigneeRegistration] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState(false);

  // Signature Canvas State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Load Order
  useEffect(() => {
    let isMounted = true;
    async function loadOS() {
      try {
        setLoading(true);
        setError(null);

        const foundOrder = await dataService.getServiceOrderByShareToken(token);
        if (!isMounted) return;

        if (!foundOrder) {
          setError('Ordem de Serviço não encontrada ou o link informado é inválido.');
          return;
        }

        setOrder(foundOrder);

        // Pre-fill signee name or registration if already partially saved
        if (foundOrder.clientRepresentative || foundOrder.clientSigneeName) {
          setSigneeName(foundOrder.clientRepresentative || foundOrder.clientSigneeName || '');
        }
        if (foundOrder.clientRepresentativeMatricula || foundOrder.clientSigneeRegistration) {
          setSigneeRegistration(foundOrder.clientRepresentativeMatricula || foundOrder.clientSigneeRegistration || '');
        }

        // Check if token has expired (48 hours validity)
        if (foundOrder.shareSignatureExpiresAt) {
          const expTime = new Date(foundOrder.shareSignatureExpiresAt).getTime();
          const nowTime = Date.now();
          if (nowTime > expTime) {
            setIsExpired(true);
          }
        } else if (foundOrder.shareSignatureCreatedAt) {
          const createdTime = new Date(foundOrder.shareSignatureCreatedAt).getTime();
          const fortyEightHoursMs = 48 * 60 * 60 * 1000;
          if (Date.now() > createdTime + fortyEightHoursMs) {
            setIsExpired(true);
          }
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Erro ao carregar O.S. pública:', err);
        setError('Falha ao carregar os dados da Ordem de Serviço. Tente atualizar a página.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadOS();
    return () => { isMounted = false; };
  }, [token]);

  // Setup signature canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#1e3a8a'; // Blue ink
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [loading, order, isExpired]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coords = getCoordinates(e, canvas);
    if (!coords) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coords = getCoordinates(e, canvas);
    if (!coords) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleConfirmSignature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    if (!signeeName.trim()) {
      alert('Por favor, informe o Nome Completo do responsável/fiscal.');
      return;
    }

    if (!signeeRegistration.trim()) {
      alert('Por favor, informe a Matrícula, CPF ou Cargo do responsável/fiscal.');
      return;
    }

    if (!hasSignature || !canvasRef.current) {
      alert('Por favor, desenhe sua assinatura no quadro antes de confirmar.');
      return;
    }

    try {
      setIsSubmitting(true);

      const signatureBase64 = canvasRef.current.toDataURL('image/png');
      const nowIso = new Date().toISOString();

      const updatedFields: Partial<ServiceOrder> = {
        clientSignature: signatureBase64,
        clientSignatureDate: nowIso,
        clientSigneeName: signeeName.trim().toUpperCase(),
        clientSigneeRegistration: signeeRegistration.trim().toUpperCase(),
        clientRepresentative: signeeName.trim().toUpperCase(),
        clientRepresentativeMatricula: signeeRegistration.trim().toUpperCase(),
        // Se a OS estava em aberto ou andamento, marca como pre_finalizada após assinatura do cliente
        status: order.status === 'aberta' || order.status === 'em_andamento' ? 'pre_finalizada' : order.status
      };

      // 1. Tenta submeter pelo endpoint de API de backend do servidor (incondicionalmente seguro via Admin SDK)
      let savedViaApi = false;
      try {
        const signRes = await fetch('/api/public/os-sign-by-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            signature: signatureBase64,
            signeeName: signeeName.trim().toUpperCase(),
            signeeRegistration: signeeRegistration.trim().toUpperCase()
          })
        });
        if (signRes.ok) {
          savedViaApi = true;
        }
      } catch (apiSignErr) {
        console.warn('Falha no salvamento via API pública de assinatura, tentando via client SDK:', apiSignErr);
      }

      // 2. Se a API não respondeu OK, utiliza o client SDK
      if (!savedViaApi) {
        await dataService.updateServiceOrder(order.id, updatedFields);
      }

      // Notifica o sistema administrativo sobre a assinatura realizada via link
      try {
        await dataService.sendOSAttendedNotification({
          ...order,
          ...updatedFields
        } as ServiceOrder);
      } catch (notifErr) {
        console.warn('Falha ao disparar notificação de O.S. assinada:', notifErr);
      }

      // Atualiza o estado local
      setOrder({
        ...order,
        ...updatedFields
      });

      setIsSubmittedSuccess(true);
    } catch (err: any) {
      console.error('Erro ao salvar assinatura pública:', err);
      alert('Erro ao salvar a assinatura. Por favor, tente novamente: ' + (err?.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr?: any) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return String(dateStr);
    }
  };

  // State: Loading
  if (loading) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-800">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200/80 max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto border border-blue-100 text-blue-600">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900 uppercase tracking-wide">Le Frio Refrigeração</h1>
            <p className="text-xs text-slate-500 font-medium mt-1">Carregando Ordem de Serviço para Assinatura...</p>
          </div>
        </div>
      </div>
    );
  }

  // State: Error / Not Found
  if (error || !order) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-800">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200/80 max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto border border-rose-100 text-rose-600">
            <XCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-lg font-black text-slate-900">Link Inválido ou O.S. Não Encontrada</h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              {error || 'A Ordem de Serviço solicitada não pôde ser localizada no sistema. Verifique o link enviado.'}
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100">
            <p className="text-[11px] text-slate-400 font-medium">Le Frio Refrigeração • Atendimento Administrativo</p>
          </div>
        </div>
      </div>
    );
  }

  // State: Expired (> 48h)
  if (isExpired) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-800">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-amber-200/90 max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto border border-amber-200 text-amber-600">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-2">
            <span className="inline-block bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-200">
              Link Expirado (Validade 48h)
            </span>
            <h1 className="text-lg font-black text-slate-900">Este Link de Assinatura Expirou</h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Por motivos de segurança e integridade de processos, os links para assinatura externa possuem validade limite de <strong>48 horas</strong> e este link já encerrou o seu prazo.
            </p>
          </div>

          <div className="bg-amber-50/60 p-3.5 rounded-2xl border border-amber-200/60 text-left space-y-1">
            <p className="text-[11px] font-black text-amber-900 uppercase tracking-wider">Como proceder?</p>
            <p className="text-xs text-amber-800 leading-relaxed">
              Entre em contato com a equipe administrativa da <strong>Le Frio Refrigeração</strong> para solicitar a emissão de um novo link atualizado para a O.S. #{order.osNumber || order.id}.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <p className="text-[11px] text-slate-400 font-medium">O.S. #{order.osNumber || order.id} • {order.clientName}</p>
          </div>
        </div>
      </div>
    );
  }

  // State: Already Signed or Just Submitted
  const isAlreadySigned = Boolean(order.clientSignature && order.clientSignature.trim().length > 10);

  if (isAlreadySigned || isSubmittedSuccess) {
    return (
      <div className="min-h-screen w-full bg-slate-100/70 p-4 sm:p-6 font-sans text-slate-800 flex flex-col items-center justify-center">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200/80 max-w-xl w-full p-6 sm:p-8 space-y-6">
          {/* Header Sucesso */}
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200 text-emerald-600 shadow-xs">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <span className="inline-block bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-emerald-200 mb-1.5">
                Assinatura Registrada
              </span>
              <h1 className="text-xl font-black text-slate-900">
                Ordem de Serviço Assinada com Sucesso!
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-1">
                A confirmação do atendimento foi salva diretamente no sistema.
              </p>
            </div>
          </div>

          {/* Comprovante em Card */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Ordem de Serviço</span>
                <span className="text-sm font-black text-slate-900">Nº {order.osNumber || order.id}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Cliente</span>
                <span className="text-xs font-black text-slate-800">{order.clientName}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Responsável / Fiscal:</span>
                <span className="font-bold text-slate-800 block">{order.clientRepresentative || order.clientSigneeName || 'Não informado'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Matrícula / Cargo / CPF:</span>
                <span className="font-bold text-slate-800 block">{order.clientRepresentativeMatricula || order.clientSigneeRegistration || 'Não informado'}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Data e Hora da Assinatura:</span>
                <span className="font-bold text-slate-800 block">{formatDate(order.clientSignatureDate)}</span>
              </div>
            </div>

            {/* Imagem da Assinatura Registrada */}
            {order.clientSignature && (
              <div className="pt-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Assinatura Digital Coletada:</span>
                <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-center min-h-[100px]">
                  <img src={order.clientSignature} alt="Assinatura Digital" className="max-h-24 object-contain" />
                </div>
              </div>
            )}
          </div>

          <div className="text-center pt-2">
            <p className="text-xs text-slate-400 font-semibold">
              Obrigado! A documentação do atendimento está concluída.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // State: Normal Interactive View (Reading details + Signing)
  return (
    <div className="min-h-screen bg-slate-100/70 p-3 sm:p-6 font-sans text-slate-800 flex justify-center">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl border border-slate-200/90 overflow-hidden flex flex-col my-2 sm:my-6">
        
        {/* Top Branding Banner */}
        <div className="bg-slate-900 text-white p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md font-black text-lg">
              LF
            </div>
            <div>
              <h1 className="text-sm font-black tracking-wide uppercase">Le Frio Refrigeração</h1>
              <p className="text-[11px] text-blue-300 font-semibold">Portal de Assinatura Externa de O.S.</p>
            </div>
          </div>

          <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-1.5 text-right">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Nº da O.S.</span>
            <span className="text-sm font-black text-white">#{order.osNumber || order.id}</span>
          </div>
        </div>

        {/* Informação sobre Bloqueio de Edição */}
        <div className="bg-blue-50/80 border-b border-blue-100 p-3 px-5 flex items-center gap-2.5 text-blue-900 text-xs">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <p className="font-semibold leading-tight">
            <strong>Modo de Conferência:</strong> Os dados deste serviço foram alimentados e auditados pela equipe Le Frio e estão bloqueados para alteração. Preencha seus dados ao final para assinar.
          </p>
        </div>

        {/* Conteúdo Principal Read-Only */}
        <div className="p-5 sm:p-6 space-y-5 flex-1">
          
          {/* Card 1: Cliente e Endereço */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2">
              <Building className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Identificação do Cliente e Local</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Cliente / Empresa:</span>
                <span className="font-black text-slate-900 text-sm block">{order.clientName}</span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Data de Atendimento:</span>
                <span className="font-extrabold text-slate-800 block">{formatDate(order.openedAt)}</span>
              </div>

              <div className="sm:col-span-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Endereço de Execução:</span>
                <div className="flex items-start gap-1.5 text-slate-700 font-semibold">
                  <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                  <span>{order.addressStreet || order.clientAddress || 'Endereço não cadastrado'}</span>
                </div>
              </div>

              {order.authenticatedTeam && (
                <div className="sm:col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Técnico / Equipe Responsável:</span>
                  <span className="font-extrabold text-slate-800 block">{order.authenticatedTeam}</span>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Equipamento / Máquina */}
          {(order.equipmentName || order.equipmentSector || order.equipmentBrand) && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2">
                <Wrench className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Equipamento Atendido</h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Setor:</span>
                  <span className="font-extrabold text-slate-800 block">{order.equipmentSector || 'Setor Padrão'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Equipamento:</span>
                  <span className="font-extrabold text-slate-800 block">{order.equipmentName || 'Split / AC'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Marca:</span>
                  <span className="font-extrabold text-slate-800 block">{order.equipmentBrand || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Patrimônio / BTUs:</span>
                  <span className="font-extrabold text-slate-800 block">{order.equipmentPatrimony || order.equipmentBtus || '-'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Card 3: Descrição e Solução */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2">
              <FileText className="w-4 h-4 text-teal-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Descrição dos Serviços Realizados</h3>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Descrição do Problema / Solicitado:</span>
                <div className="bg-white border border-slate-200/90 rounded-xl p-3 text-slate-800 font-semibold leading-relaxed whitespace-pre-wrap">
                  {order.description || 'Manutenção corretiva e preventiva de equipamento de refrigeração.'}
                </div>
              </div>

              {order.diagnosis && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Diagnóstico e Solução Técnica Aplicada:</span>
                  <div className="bg-white border border-slate-200/90 rounded-xl p-3 text-slate-800 font-semibold leading-relaxed whitespace-pre-wrap">
                    {order.diagnosis}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 4: Tabela de Itens / Serviços (se houver) */}
          {((order.services && order.services.length > 0) || (order.products && order.products.length > 0)) && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Serviços e Peças Executados</h3>
                <span className="text-xs font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-lg">
                  Total O.S.: R$ {Number(order.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-200/60">
                      <th className="pb-1.5">Descrição</th>
                      <th className="pb-1.5 text-center">Qtd</th>
                      <th className="pb-1.5 text-right">Valor Un.</th>
                      <th className="pb-1.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/50 font-semibold">
                    {[...(order.services || []), ...(order.products || [])].map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-2 text-slate-800">{item.description}</td>
                        <td className="py-2 text-center text-slate-600">{item.quantity} {item.unit}</td>
                        <td className="py-2 text-right text-slate-600">R$ {Number(item.unitValue || 0).toFixed(2)}</td>
                        <td className="py-2 text-right text-slate-900 font-black">R$ {Number(item.totalValue || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Form de Assinatura do Fiscal / Cliente */}
          <form onSubmit={handleConfirmSignature} className="bg-gradient-to-b from-blue-50/60 to-white border-2 border-blue-500/40 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
            <div className="border-b border-blue-200/70 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-600 text-white rounded-lg">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">
                    ✍️ Assinatura e Validação do Responsável / Fiscal
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Preencha os campos abaixo e desenhe sua assinatura na tela para concluir este atendimento.
                  </p>
                </div>
              </div>
            </div>

            {/* Input Nome */}
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">
                Nome Completo do Responsável / Fiscal <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={signeeName}
                onChange={(e) => setSigneeName(e.target.value)}
                placeholder="EX: ALUÍSIO MELO SIMÕES FILHO"
                className="w-full bg-white border border-slate-300 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all shadow-2xs"
                required
              />
            </div>

            {/* Input Matrícula / Cargo */}
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">
                Matrícula, CPF ou Cargo <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={signeeRegistration}
                onChange={(e) => setSigneeRegistration(e.target.value)}
                placeholder="EX: MATRÍCULA 0813 / FISCAL DE CONTRATO"
                className="w-full bg-white border border-slate-300 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all shadow-2xs"
                required
              />
            </div>

            {/* Canvas Quadro de Assinatura */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                  Desenhe sua Assinatura na Tela <span className="text-rose-500">*</span>
                </label>
                {hasSignature && (
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="text-[10px] font-black uppercase tracking-wider text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> Limpar Desenho
                  </button>
                )}
              </div>

              <div className="bg-white border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-2xl p-2 transition-all relative">
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={160}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-40 bg-slate-50/50 rounded-xl touch-none cursor-crosshair"
                />
                {!hasSignature && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                    <p className="text-xs font-bold uppercase tracking-wider">Desenhe sua assinatura aqui</p>
                    <p className="text-[10px] text-slate-400 font-medium">Use o dedo no celular/tablet ou o mouse no computador</p>
                  </div>
                )}
              </div>
            </div>

            {/* Botão de Envio */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !signeeName.trim() || !signeeRegistration.trim() || !hasSignature}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-widest py-3.5 px-6 rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Registrando Assinatura...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirmar e Assinar Ordem de Serviço</span>
                  </>
                )}
              </button>
            </div>
          </form>

        </div>

        {/* Footer Institucional */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 text-center text-slate-400 text-[11px] font-medium">
          Le Frio Refrigeração • Gestão e Auditoria Digital de Ordens de Serviço
        </div>
      </div>
    </div>
  );
}
