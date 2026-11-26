import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, CheckCircle2, Clock, ShieldCheck,
  Building, MapPin, Wrench, Check, RotateCcw,
  Sparkles, Loader2, XCircle, Camera, X, ZoomIn,
  ChevronLeft, ChevronRight, AlertCircle
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { ServiceOrder } from '../types';

interface PublicOSSignatureViewProps {
  token: string;
}

const isSafeImageSrc = (src: unknown): src is string => {
  if (typeof src !== 'string') return false;
  const trimmed = src.trim();
  return (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://')
  );
};

export default function PublicOSSignatureView({ token }: PublicOSSignatureViewProps) {
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  // Form State
  const [signeeName, setSigneeName] = useState('');
  const [signeeRegistration, setSigneeRegistration] = useState('');
  const [signeeRole, setSigneeRole] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState(false);

  // Lightbox para visualizar fotos anexadas ampliadas
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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

        // Pré-preenche dados do fiscal se já parcialmente salvos
        if (foundOrder.clientRepresentative || foundOrder.clientSigneeName) {
          setSigneeName(foundOrder.clientRepresentative || foundOrder.clientSigneeName || '');
        }
        if (foundOrder.clientRepresentativeMatricula || foundOrder.clientSigneeRegistration) {
          setSigneeRegistration(foundOrder.clientRepresentativeMatricula || foundOrder.clientSigneeRegistration || '');
        }
        if (foundOrder.clientRepresentativeRole || foundOrder.clientSigneeRole) {
          setSigneeRole(foundOrder.clientRepresentativeRole || foundOrder.clientSigneeRole || '');
        }

        // Verifica expiração do link (48 horas)
        if (foundOrder.shareSignatureExpiresAt) {
          const expTime = new Date(foundOrder.shareSignatureExpiresAt).getTime();
          if (!isNaN(expTime) && Date.now() > expTime) {
            setIsExpired(true);
          }
        } else if (foundOrder.shareSignatureCreatedAt) {
          const createdTime = new Date(foundOrder.shareSignatureCreatedAt).getTime();
          const fortyEightHoursMs = 48 * 60 * 60 * 1000;
          if (!isNaN(createdTime) && Date.now() > createdTime + fortyEightHoursMs) {
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

    ctx.strokeStyle = '#1e3a8a';
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
    if (formError) setFormError(null);
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
    setFormError(null);

    const cleanName = signeeName.trim().toUpperCase();
    const cleanReg = signeeRegistration.trim().toUpperCase();
    const cleanRole = signeeRole.trim().toUpperCase();

    if (!cleanName) {
      setFormError('Por favor, informe o Nome Completo do responsável/fiscal.');
      return;
    }

    if (!cleanReg) {
      setFormError('Por favor, informe a Matrícula ou Documento do responsável/fiscal.');
      return;
    }

    if (!cleanRole) {
      setFormError('Por favor, informe o Cargo / Função do responsável/fiscal.');
      return;
    }

    if (!hasSignature || !canvasRef.current) {
      setFormError('Por favor, desenhe sua assinatura no quadro antes de confirmar.');
      return;
    }

    try {
      setIsSubmitting(true);

      const signatureBase64 = canvasRef.current.toDataURL('image/png');
      const nowIso = new Date().toISOString();

      const updatedFields: Partial<ServiceOrder> = {
        clientSignature: signatureBase64,
        hasClientSignature: true,
        clientSignatureDate: nowIso,
        clientSigneeName: cleanName,
        clientSigneeRegistration: cleanReg,
        clientSigneeRole: cleanRole,
        clientRepresentative: cleanName,
        clientRepresentativeMatricula: cleanReg,
        clientRepresentativeRole: cleanRole,
        status: order.status === 'aberta' || order.status === 'em_andamento' ? 'pre_finalizada' : order.status
      };

      // 1. Submete pelo endpoint público de backend (Admin SDK)
      let savedViaApi = false;
      let apiErrorMessage = '';
      try {
        const signRes = await fetch('/api/public/os-sign-by-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            signature: signatureBase64,
            signeeName: cleanName,
            signeeRegistration: cleanReg,
            signeeRole: cleanRole
          })
        });
        if (signRes.ok) {
          savedViaApi = true;
        } else {
          const errJson = await signRes.json().catch(() => null);
          apiErrorMessage = errJson?.error || '';
          if (signRes.status === 410) {
            setIsExpired(true);
            return;
          }
        }
      } catch (apiSignErr) {
        console.warn('Falha no salvamento via API pública de assinatura, tentando via client SDK:', apiSignErr);
      }

      // 2. Fallback via client SDK caso o backend não responda OK
      if (!savedViaApi) {
        try {
          await dataService.updateServiceOrder(order.id, updatedFields);
        } catch (sdkErr: any) {
          throw new Error(apiErrorMessage || sdkErr?.message || 'Não foi possível salvar a assinatura.');
        }
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

      setOrder({
        ...order,
        ...updatedFields
      });

      setIsSubmittedSuccess(true);
    } catch (err: any) {
      console.error('Erro ao salvar assinatura pública:', err);
      setFormError('Erro ao salvar a assinatura. Tente novamente: ' + (err?.message || ''));
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
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-200/80 max-w-xs w-full text-center space-y-3">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto border border-blue-100 text-blue-600">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900 uppercase tracking-wide">Le Frio Refrigeração</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Carregando Ordem de Serviço...</p>
          </div>
        </div>
      </div>
    );
  }

  // State: Error / Not Found
  if (error || !order) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-800">
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-200/80 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center mx-auto border border-rose-100 text-rose-600">
            <XCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-base font-black text-slate-900">Link Inválido ou O.S. Não Encontrada</h1>
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
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-amber-200/90 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center mx-auto border border-amber-200 text-amber-600">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div className="space-y-1.5">
            <span className="inline-block bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-amber-200">
              Link Expirado (Validade 48h)
            </span>
            <h1 className="text-base font-black text-slate-900">Este Link de Assinatura Expirou</h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Por segurança, os links de assinatura externa possuem validade de <strong>48 horas</strong> e este prazo já foi encerrado.
            </p>
          </div>

          <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200/60 text-left space-y-1">
            <p className="text-[10px] font-black text-amber-900 uppercase tracking-wider">Como proceder?</p>
            <p className="text-xs text-amber-800 leading-relaxed">
              Solicite à equipe administrativa da <strong>Le Frio Refrigeração</strong> a emissão de um novo link para a O.S. #{order.osNumber || order.id}.
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
    const savedRole = order.clientRepresentativeRole || order.clientSigneeRole;
    return (
      <div className="min-h-screen w-full bg-slate-100/70 p-3 sm:p-5 font-sans text-slate-800 flex flex-col items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 max-w-lg w-full p-5 sm:p-6 space-y-4">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto border border-emerald-200 text-emerald-600">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <span className="inline-block bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-emerald-200 mb-1">
                Assinatura Registrada
              </span>
              <h1 className="text-lg font-black text-slate-900">
                Ordem de Serviço Assinada com Sucesso!
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                A confirmação do atendimento foi salva diretamente no sistema.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/70">
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Ordem de Serviço</span>
                <span className="text-xs font-black text-slate-900">Nº {order.osNumber || order.id}</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Cliente</span>
                <span className="text-xs font-black text-slate-800">{order.clientName}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Responsável / Fiscal:</span>
                <span className="font-bold text-slate-800 block">{order.clientRepresentative || order.clientSigneeName || 'Não informado'}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Matrícula / Documento:</span>
                <span className="font-bold text-slate-800 block">{order.clientRepresentativeMatricula || order.clientSigneeRegistration || 'Não informado'}</span>
              </div>
              {savedRole && (
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Cargo / Função:</span>
                  <span className="font-bold text-slate-800 block">{savedRole}</span>
                </div>
              )}
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Data e Hora da Assinatura:</span>
                <span className="font-bold text-slate-800 block">{formatDate(order.clientSignatureDate)}</span>
              </div>
            </div>

            {order.clientSignature && isSafeImageSrc(order.clientSignature) && (
              <div className="pt-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Assinatura Digital Coletada:</span>
                <div className="bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-center min-h-[76px]">
                  <img src={order.clientSignature} alt="Assinatura Digital" className="max-h-20 object-contain" />
                </div>
              </div>
            )}
          </div>

          <p className="text-center text-[11px] text-slate-400 font-semibold">
            Obrigado! A documentação do atendimento está concluída.
          </p>
        </div>
      </div>
    );
  }

  const allExecutedItems = [...(order.services || []), ...(order.products || [])];
  const validPhotos = (order.photos || []).filter(isSafeImageSrc);
  const trimmedDiagnosis = (order.diagnosis || '').trim();
  const trimmedSolution = (order.solution || '').trim();
  const showDiagnosisSeparately = Boolean(
    trimmedDiagnosis &&
    trimmedDiagnosis.toUpperCase() !== trimmedSolution.toUpperCase()
  );

  // State: Normal Interactive View (Compact Layout)
  return (
    <div className="min-h-screen bg-slate-100/70 p-2 sm:p-4 font-sans text-slate-800 flex justify-center">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-lg border border-slate-200/90 overflow-hidden flex flex-col my-1 sm:my-3">

        {/* Top Branding Banner */}
        <div className="bg-slate-900 text-white px-4 py-3 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-xs font-black text-sm">
              LF
            </div>
            <div>
              <h1 className="text-xs font-black tracking-wide uppercase leading-tight">Le Frio Refrigeração</h1>
              <p className="text-[10px] text-blue-300 font-semibold leading-tight">Portal de Assinatura Externa de O.S.</p>
            </div>
          </div>

          <div className="bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1 text-right">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block leading-none">Nº da O.S.</span>
            <span className="text-xs font-black text-white leading-tight">#{order.osNumber || order.id}</span>
          </div>
        </div>

        {/* Informação sobre Bloqueio de Edição */}
        <div className="bg-blue-50/80 border-b border-blue-100 px-4 py-2 flex items-center gap-2 text-blue-900 text-[11px]">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <p className="font-semibold leading-snug">
            <strong>Modo de Conferência:</strong> Dados auditados pela equipe Le Frio e bloqueados para edição. Confira o atendimento e assine abaixo.
          </p>
        </div>

        {/* Conteúdo Principal Read-Only (Compacto) */}
        <div className="p-3.5 sm:p-4 space-y-3 flex-1">

          {/* Card 1: Cliente e Local */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-1.5 border-b border-slate-200/60 pb-1.5">
              <Building className="w-3.5 h-3.5 text-blue-600" />
              <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-800">Identificação do Cliente e Local</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-x-3 gap-y-1.5 text-xs">
              <div className="sm:col-span-8">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Cliente / Empresa</span>
                <span className="font-black text-slate-900 text-xs block leading-snug">{order.clientName}</span>
              </div>

              <div className="sm:col-span-4">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Data de Atendimento</span>
                <span className="font-bold text-slate-800 text-xs block leading-snug">{formatDate(order.openedAt)}</span>
              </div>

              <div className="sm:col-span-12 flex items-start gap-1 text-slate-700 font-semibold text-[11px] pt-0.5">
                <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                <span>{order.addressStreet || order.clientAddress || 'Endereço não cadastrado'}</span>
              </div>

              {order.authenticatedTeam && (
                <div className="sm:col-span-12 pt-0.5 border-t border-slate-200/50">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mr-1.5">Equipe Técnica:</span>
                  <span className="font-bold text-slate-800 text-[11px]">{order.authenticatedTeam}</span>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Equipamento Atendido */}
          {(order.equipmentName || order.equipmentSector || order.equipmentBrand) && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-1.5 border-b border-slate-200/60 pb-1.5">
                <Wrench className="w-3.5 h-3.5 text-indigo-600" />
                <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-800">Equipamento Atendido</h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Setor</span>
                  <span className="font-extrabold text-slate-800 text-[11px] block leading-tight">{order.equipmentSector || 'Setor Padrão'}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Equipamento</span>
                  <span className="font-extrabold text-slate-800 text-[11px] block leading-tight">{order.equipmentName || 'Split / AC'}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Marca</span>
                  <span className="font-extrabold text-slate-800 text-[11px] block leading-tight">{order.equipmentBrand || '-'}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Patrimônio / BTUs</span>
                  <span className="font-extrabold text-slate-800 text-[11px] block leading-tight">{order.equipmentPatrimony || order.equipmentBtus || '-'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Card 3: Descrição do Problema e Solução */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-1.5 border-b border-slate-200/60 pb-1.5">
              <FileText className="w-3.5 h-3.5 text-teal-600" />
              <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-800">Descrição e Solução do Atendimento</h3>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Descrição do Problema</span>
                <div className="bg-white border border-slate-200/90 rounded-lg px-2.5 py-2 text-slate-800 text-[11px] font-semibold leading-snug whitespace-pre-wrap">
                  {order.description || 'Manutenção corretiva e preventiva de equipamento de refrigeração.'}
                </div>
              </div>

              {showDiagnosisSeparately && (
                <div>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Diagnóstico Técnico</span>
                  <div className="bg-white border border-slate-200/90 rounded-lg px-2.5 py-2 text-slate-800 text-[11px] font-semibold leading-snug whitespace-pre-wrap">
                    {trimmedDiagnosis}
                  </div>
                </div>
              )}

              <div>
                <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider block mb-0.5">Solução</span>
                <div className="bg-emerald-50/40 border border-emerald-200/80 rounded-lg px-2.5 py-2 text-slate-800 text-[11px] font-semibold leading-snug whitespace-pre-wrap">
                  {trimmedSolution || (
                    <span className="text-slate-400 font-medium italic">Nenhuma solução detalhada informada.</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Serviços e Peças Executados (SEM PREÇOS) */}
          {allExecutedItems.length > 0 && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-800">Serviços e Peças Executados</h3>
                <span className="text-[10px] font-bold text-slate-600 bg-slate-200/70 px-2 py-0.5 rounded-md">
                  {allExecutedItems.length} {allExecutedItems.length === 1 ? 'item' : 'itens'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-[9px] font-black uppercase text-slate-400 border-b border-slate-200/60">
                      <th className="pb-1 pr-2">Descrição</th>
                      <th className="pb-1 text-right whitespace-nowrap w-20">Qtd</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/50 font-semibold">
                    {allExecutedItems.map((item, idx) => (
                      <tr key={`${item.code || 'item'}-${idx}`}>
                        <td className="py-1.5 pr-2 text-slate-800 leading-snug">{item.description}</td>
                        <td className="py-1.5 text-right text-slate-700 font-bold whitespace-nowrap">
                          {item.quantity} {item.unit || 'UN'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Card 5: Imagens Anexadas na O.S. (quando houver) */}
          {validPhotos.length > 0 && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-sky-600" />
                  <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-800">Imagens Anexadas</h3>
                </div>
                <span className="text-[10px] font-bold text-slate-500">
                  Toque para ampliar ({validPhotos.length})
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {validPhotos.map((photoSrc, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setLightboxIndex(idx)}
                    className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <img
                      src={photoSrc}
                      alt={`Imagem da O.S. ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/25 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 text-slate-800 rounded-full p-1.5 shadow-sm">
                        <ZoomIn className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Form de Assinatura do Fiscal / Cliente */}
          <form onSubmit={handleConfirmSignature} className="bg-gradient-to-b from-blue-50/60 to-white border-2 border-blue-500/40 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-xs">
            <div className="border-b border-blue-200/70 pb-2 flex items-center gap-2">
              <div className="p-1 bg-blue-600 text-white rounded-md shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <h2 className="text-xs font-black uppercase tracking-wide text-slate-900 leading-tight">
                  Assinatura e Validação do Responsável / Fiscal
                </h2>
                <p className="text-[11px] text-slate-500 font-medium leading-tight">
                  Informe seus dados e assine abaixo para concluir o atendimento.
                </p>
              </div>
            </div>

            {formError && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex items-center gap-2 text-rose-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Input Nome */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-700 block mb-1">
                Nome Completo do Responsável / Fiscal <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={signeeName}
                onChange={(e) => {
                  setSigneeName(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="EX: ALUÍSIO MELO SIMÕES FILHO"
                maxLength={160}
                className="w-full bg-white border border-slate-300 rounded-lg py-2 px-3 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                required
              />
            </div>

            {/* Grid 2 Colunas: Matrícula/Documento + Cargo/Função */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-700 block mb-1">
                  Matrícula / Documento <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={signeeRegistration}
                  onChange={(e) => {
                    setSigneeRegistration(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="EX: MATRÍCULA 0813 OU CPF"
                  maxLength={100}
                  className="w-full bg-white border border-slate-300 rounded-lg py-2 px-3 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-700 block mb-1">
                  Cargo / Função <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={signeeRole}
                  onChange={(e) => {
                    setSigneeRole(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="EX: FISCAL DE CONTRATO / COORDENADOR"
                  maxLength={120}
                  className="w-full bg-white border border-slate-300 rounded-lg py-2 px-3 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                  required
                />
              </div>
            </div>

            {/* Canvas Quadro de Assinatura */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-700 block">
                  Assinatura Digital <span className="text-rose-500">*</span>
                </label>
                {hasSignature && (
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="text-[10px] font-black uppercase tracking-wider text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-md transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> Limpar
                  </button>
                )}
              </div>

              <div className="bg-white border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-xl p-1.5 transition-all relative">
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={130}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-32 bg-slate-50/50 rounded-lg touch-none cursor-crosshair"
                />
                {!hasSignature && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-slate-400 p-3 text-center">
                    <p className="text-[11px] font-bold uppercase tracking-wider">Desenhe sua assinatura aqui</p>
                    <p className="text-[10px] text-slate-400 font-medium">Use o dedo no celular/tablet ou o mouse</p>
                  </div>
                )}
              </div>
            </div>

            {/* Botão de Envio */}
            <button
              type="submit"
              disabled={
                isSubmitting ||
                !signeeName.trim() ||
                !signeeRegistration.trim() ||
                !signeeRole.trim() ||
                !hasSignature
              }
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-widest py-3 px-5 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Registrando Assinatura...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirmar e Assinar O.S.</span>
                </>
              )}
            </button>
          </form>

        </div>

        {/* Footer Institucional */}
        <div className="bg-slate-50 border-t border-slate-200 py-2.5 px-4 text-center text-slate-400 text-[10px] font-medium">
          Le Frio Refrigeração • Gestão e Auditoria Digital de Ordens de Serviço
        </div>
      </div>

      {/* Lightbox Modal para Ampliar Fotos Anexadas */}
      {lightboxIndex !== null && validPhotos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="relative max-w-3xl w-full flex flex-col items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-white text-xs font-bold px-1">
              <span>Imagem {lightboxIndex + 1} de {validPhotos.length}</span>
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="bg-white/15 hover:bg-white/25 text-white rounded-lg p-1.5 transition-colors cursor-pointer"
                aria-label="Fechar visualização"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative w-full flex items-center justify-center">
              {validPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex((lightboxIndex - 1 + validPhotos.length) % validPhotos.length)}
                  className="absolute left-2 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full p-2 transition-colors cursor-pointer"
                  aria-label="Imagem anterior"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              <img
                src={validPhotos[lightboxIndex]}
                alt={`Imagem ampliada ${lightboxIndex + 1}`}
                className="max-h-[80vh] max-w-full rounded-xl object-contain bg-slate-900 shadow-2xl"
              />

              {validPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex((lightboxIndex + 1) % validPhotos.length)}
                  className="absolute right-2 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full p-2 transition-colors cursor-pointer"
                  aria-label="Próxima imagem"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
