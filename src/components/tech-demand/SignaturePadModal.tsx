import React, { useState, useEffect, useRef } from 'react';
import { Maximize2, Smartphone, X, RotateCcw, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SignaturePadModalProps {
  label: string;
  onChange: (base64: string) => void;
  savedValue?: string;
  disabled?: boolean;
}

export function SignaturePadModal({ label, onChange, savedValue, disabled }: SignaturePadModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!savedValue);
  
  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFsDrawing, setIsFsDrawing] = useState(false);
  const [fsHasSignature, setFsHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#1e3a8a'; // Navy/dark blue ink
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (savedValue && savedValue.trim().length > 0) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = savedValue;
      setHasSignature(true);
    } else {
      setHasSignature(false);
    }
  }, [savedValue]);

  // Fullscreen orientation and canvas initialization
  useEffect(() => {
    if (!isFullscreen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    try {
      const orientation = (screen.orientation || (screen as any).mozOrientation || (screen as any).msOrientation);
      if (orientation && orientation.lock) {
        orientation.lock('landscape').catch(() => {});
      }
    } catch (e) {}

    const timer = setTimeout(() => {
      const canvas = fsCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.strokeStyle = '#1e3a8a';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (savedValue && savedValue.trim().length > 0) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = savedValue;
        setFsHasSignature(true);
      } else {
        setFsHasSignature(false);
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      try {
        const orientation = (screen.orientation || (screen as any).mozOrientation || (screen as any).msOrientation);
        if (orientation && orientation.unlock) {
          orientation.unlock();
        }
      } catch (e) {}
    };
  }, [isFullscreen, savedValue]);

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
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coords = getCoordinates(e, canvas);
    if (!coords) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled || !isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const coords = getCoordinates(e, canvas);
    if (!coords) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (disabled || !isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const clear = () => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange('');
  };

  // Fullscreen handlers
  const startFsDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = fsCanvasRef.current;
    if (!canvas) return;
    const coords = getCoordinates(e, canvas);
    if (!coords) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsFsDrawing(true);
  };

  const drawFs = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isFsDrawing) return;
    const canvas = fsCanvasRef.current;
    if (!canvas) return;
    const coords = getCoordinates(e, canvas);
    if (!coords) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    setFsHasSignature(true);
  };

  const stopFsDrawing = () => {
    if (!isFsDrawing) return;
    setIsFsDrawing(false);
  };

  const clearFs = () => {
    const canvas = fsCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setFsHasSignature(false);
  };

  const saveFromFullscreen = () => {
    const canvas = fsCanvasRef.current;
    if (!canvas) return;
    if (!fsHasSignature) {
      alert('Por favor, desenhe a assinatura antes de confirmar.');
      return;
    }
    const dataUrl = canvas.toDataURL('image/png');
    onChange(dataUrl);
    setHasSignature(true);
    setIsFullscreen(false);
  };

  return (
    <div className="space-y-2 bg-gray-50 p-3.5 rounded-2xl border border-gray-200">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <span className="text-[11px] font-black text-gray-600 uppercase tracking-wide">{label}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsFullscreen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition-all cursor-pointer"
            title="Abrir em tela cheia na horizontal"
          >
            <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
            <span className="flex items-center gap-1">
              <Smartphone className="w-3 h-3 rotate-90 text-blue-500" />
              Tela Cheia (Horizontal)
            </span>
          </button>

          {hasSignature && !disabled && (
            <button 
              type="button" 
              onClick={clear}
              className="text-[10px] text-red-600 hover:text-red-800 font-bold transition-all px-2.5 py-1 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      <div className="relative rounded-xl overflow-hidden">
        <canvas
          ref={canvasRef}
          width={800}
          height={320}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className={cn(
            "w-full h-48 sm:h-56 bg-white border-2 border-gray-300 rounded-xl cursor-crosshair touch-none block",
            disabled && "cursor-not-allowed opacity-80"
          )}
        />
        <div className="absolute bottom-4 left-6 right-6 flex items-center gap-2 pointer-events-none opacity-30 select-none">
          <span className="text-xs font-bold text-gray-400">X</span>
          <div className="flex-1 border-b-2 border-dashed border-gray-400"></div>
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Assine acima desta linha</span>
        </div>
      </div>

      {isFullscreen && (
        <div 
          className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-md flex flex-col p-3 sm:p-5 select-none"
          style={{ height: '100dvh' }}
        >
          <div className="flex justify-between items-center pb-2 border-b border-slate-800 text-white gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-500/20 border border-blue-400/30 rounded-lg text-blue-400">
                <Maximize2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
                  Assinatura Digital do Cliente
                </h4>
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
                  <Smartphone className="w-3.5 h-3.5 text-blue-400 rotate-90 shrink-0" />
                  <span>Dica: Deite o celular na <strong>horizontal</strong> para assinar com mais espaço.</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 w-full my-2 bg-white rounded-2xl relative shadow-2xl border-2 border-slate-300 overflow-hidden flex flex-col">
            <canvas
              ref={fsCanvasRef}
              width={1400}
              height={700}
              onMouseDown={startFsDrawing}
              onMouseMove={drawFs}
              onMouseUp={stopFsDrawing}
              onMouseLeave={stopFsDrawing}
              onTouchStart={startFsDrawing}
              onTouchMove={drawFs}
              onTouchEnd={stopFsDrawing}
              className="w-full h-full touch-none cursor-crosshair block bg-white"
            />
            <div className="absolute bottom-10 left-8 right-8 flex items-center gap-3 pointer-events-none opacity-40 select-none">
              <span className="text-lg font-black text-slate-600">X</span>
              <div className="flex-1 border-b-2 border-dashed border-slate-400"></div>
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                Assinatura do Representante do Cliente
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearFs}
                className="bg-slate-800 hover:bg-slate-700 text-rose-400 border border-slate-700 text-xs font-black uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-black uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all cursor-pointer active:scale-95"
              >
                Cancelar
              </button>
            </div>
            <button
              type="button"
              onClick={saveFromFullscreen}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-black uppercase tracking-wider py-2.5 px-6 rounded-xl transition-all shadow-lg flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirmar Assinatura
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SignaturePadModal;
