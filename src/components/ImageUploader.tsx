import React, { useState, useRef } from 'react';
import { Upload, X, Loader2, Link as LinkIcon, Image as ImageIcon, ExternalLink, RefreshCw, Camera } from 'lucide-react';
import { cn } from '../lib/utils';
import { compressImageToBase64 } from '../lib/image-utils';

export function ImageUploader({ 
  value, 
  onChange,
  compact = false,
  allowUrl = true
}: { 
  value: string; 
  onChange: (val: string) => void | Promise<void>;
  compact?: boolean;
  allowUrl?: boolean;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [mode, setMode] = useState<'link' | 'upload'>(allowUrl ? 'link' : 'upload');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione apenas arquivos de imagem (PNG, JPG, JPEG, GIF).');
      return;
    }

    try {
      setIsUploading(true);
      // Usando limites otimizados de compressão para garantir persistência ultrarrápida no Firestore
      const base64 = await compressImageToBase64(file, 800, 800, 0.55);
      await onChange(base64);
    } catch (error: any) {
      console.error('Failed to process/upload image:', error);
      const errorMsg = error?.message || String(error);
      alert(`Erro ao processar ou enviar a imagem: ${errorMsg}\n\nTente usar outra imagem ou verifique sua conexão.`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const openImageInNewTab = () => {
    if (!value) return;
    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.write(`
        <html>
          <head>
            <title>Visualizar Mapa / Imagem</title>
            <style>
              body { margin: 0; background-color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: system-ui, sans-serif; }
              img { max-width: 95%; max-height: 95vh; object-fit: contain; border-radius: 12px; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5); border: 1px solid rgba(255,255,255,0.1); }
            </style>
          </head>
          <body>
            <img src="${value}" alt="Anexo" />
          </body>
        </html>
      `);
      newWindow.document.close();
    }
  };

  // Se já temos uma imagem definida (value), no modo compacto mostramos um chip compacto
  if (value && compact) {
    const isBase64 = value.startsWith('data:image');
    return (
      <div className="flex items-center gap-1.5 bg-indigo-50/70 border border-indigo-150 rounded-lg px-2 py-1 h-7 max-w-full">
        {isBase64 ? (
          <img 
            src={value} 
            alt="Preview" 
            className="w-5 h-5 rounded object-cover border border-indigo-200 shrink-0 cursor-pointer"
            onClick={openImageInNewTab}
          />
        ) : (
          <LinkIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
        )}
        <span className="text-[10px] font-bold text-indigo-900 truncate max-w-[110px]" title={value}>
          {isBase64 ? 'Mapa Anexado' : value}
        </span>
        <button
          type="button"
          onClick={openImageInNewTab}
          className="p-0.5 text-indigo-600 hover:text-indigo-900 rounded transition-colors"
          title="Abrir mapa em tela cheia"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => onChange('')}
          className="p-0.5 text-rose-500 hover:text-rose-700 rounded transition-colors ml-auto"
          title="Remover anexo"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Se já temos uma imagem definida (value) e allowUrl é falso (modo foto técnica compacto)
  if (value && !allowUrl) {
    return (
      <div className="relative group border border-slate-200 bg-slate-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center shadow-xs">
        <img 
          src={value} 
          alt="Foto Anexa" 
          className="w-full h-full object-cover cursor-pointer"
          onClick={openImageInNewTab}
        />
        {/* Overlay com botões no desktop */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={openImageInNewTab}
            className="p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-lg shadow-sm transition-all cursor-pointer"
            title="Visualizar em tamanho real"
          >
            <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
          </button>
          <button
            type="button"
            onClick={() => onChange('')}
            className="p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-sm transition-all cursor-pointer"
            title="Remover foto"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Botão de remover no mobile (sempre acessível) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange('');
          }}
          className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-rose-600 text-white rounded-full transition-all shadow-md sm:hidden cursor-pointer"
          title="Remover foto"
        >
          <X className="w-3 h-3" />
        </button>
        <span className="absolute bottom-1.5 left-1.5 text-[8px] font-black text-white bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-xs uppercase tracking-wider">
          Anexada
        </span>
      </div>
    );
  }

  // Se já temos uma imagem definida (value), no modo padrão mostramos a prévia
  if (value) {
    const isBase64 = value.startsWith('data:image');
    return (
      <div className="space-y-3">
        <div className="relative group border border-slate-200 bg-slate-900/5 rounded-xl overflow-hidden p-1.5 flex flex-col items-center justify-center transition-all hover:border-slate-300">
          {/* Imagem de Preview */}
          <div className="w-full h-36 bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center relative">
            <img 
              src={value} 
              alt="Preview do Mapa" 
              className="w-full h-full object-contain filter drop-shadow-md"
              referrerPolicy="no-referrer"
            />
            {/* Overlay sutil com informações */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 flex items-center justify-between">
              <span className="text-[9px] font-black tracking-widest text-white uppercase truncate max-w-[70%]">
                {isBase64 ? 'Imagem Carregada (Base64)' : 'Link de Imagem Externo'}
              </span>
              <span className="text-[8px] font-bold text-slate-300 uppercase bg-slate-800/80 px-1.5 py-0.5 rounded-md backdrop-blur-xs">
                {isBase64 ? 'Compacta' : 'URL'}
              </span>
            </div>
          </div>

          {/* Barra de Ações Rápidas */}
          <div className="w-full flex gap-2 mt-2 px-0.5">
            <button
              type="button"
              onClick={openImageInNewTab}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[9px] font-black rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all uppercase tracking-wider"
              title="Visualizar em tamanho real em uma nova aba"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-600" /> Abrir Mapa
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="flex items-center justify-center p-1.5 text-[9px] font-black rounded-lg border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all uppercase tracking-wider w-10"
              title="Remover e carregar outro mapa"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Se não temos imagem no modo compacto
  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <input 
          ref={fileInputRef}
          type="file" 
          accept="image/*" 
          className="hidden" 
          onChange={handleFileChange}
        />
        {mode === 'link' ? (
          <div className="relative flex items-center flex-1 min-w-[140px]">
            <input 
              type="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-full pl-6 pr-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:border-blue-500 outline-none h-7"
              placeholder="Cole URL do mapa..."
            />
            <div className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400">
              <LinkIcon className="w-3 h-3" />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all h-7"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-[10px]">Enviando...</span>
              </>
            ) : (
              <>
                <Upload className="w-3 h-3 text-indigo-600" />
                <span className="text-[10px]">Upload Imagem</span>
              </>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => setMode(mode === 'link' ? 'upload' : 'link')}
          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black transition-all h-7 shrink-0 uppercase"
          title={mode === 'link' ? "Alternar para Upload de Arquivo" : "Alternar para Link de URL"}
        >
          {mode === 'link' ? 'Upload' : 'URL'}
        </button>
      </div>
    );
  }

  // Se allowUrl for falso (modo de anexar fotos de O.S. do técnico): direto, compacto e sem opção de link
  if (!allowUrl) {
    return (
      <div 
        className={cn(
          "border-2 border-dashed rounded-xl p-2.5 flex flex-col items-center justify-center transition-all cursor-pointer relative min-h-[76px] group",
          dragActive 
            ? "border-blue-500 bg-blue-50/40" 
            : "border-slate-200 bg-white hover:bg-blue-50/30 hover:border-blue-400",
          isUploading && "pointer-events-none opacity-80"
        )}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        <input 
          ref={fileInputRef}
          type="file" 
          accept="image/*" 
          className="hidden" 
          onChange={handleFileChange}
        />
        {isUploading ? (
          <div className="flex flex-col items-center gap-1.5 text-blue-600 py-1">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span className="text-[9px] font-black uppercase tracking-wider text-blue-700 animate-pulse">Processando Foto...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="w-7 h-7 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shadow-2xs mb-1 border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-all">
              <Camera className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-black text-slate-700 group-hover:text-blue-700 leading-tight">Anexar Foto</span>
            <span className="text-[8.5px] text-slate-400 mt-0.5 font-bold uppercase tracking-wider">Câmera / Arquivo</span>
          </div>
        )}
      </div>
    );
  }

  // Se não temos imagem, mostramos a interface de escolha de modo (para rotas/mapas com suporte a link)
  return (
    <div className="space-y-2.5">
      {/* Seletor de Abas Premium */}
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl border border-slate-200/40">
        <button
          type="button"
          onClick={() => setMode('link')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[9px] font-black rounded-lg transition-all uppercase tracking-widest leading-none",
            mode === 'link' 
              ? "bg-white text-slate-800 shadow-xs border border-slate-200/20" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
          )}
        >
          <LinkIcon className="w-3 h-3 text-blue-500" /> Link (URL)
        </button>
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[9px] font-black rounded-lg transition-all uppercase tracking-widest leading-none",
            mode === 'upload' 
              ? "bg-white text-slate-800 shadow-xs border border-slate-200/20" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
          )}
        >
          <ImageIcon className="w-3 h-3 text-indigo-500" /> Enviar
        </button>
      </div>

      {mode === 'link' ? (
        <div className="relative flex items-center">
          <input 
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full pl-8 pr-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-550/10 focus:border-blue-550 outline-none transition-all shadow-2xs"
            placeholder="Cole o endereço web (https://...) do mapa"
          />
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
            <LinkIcon className="w-3.5 h-3.5" />
          </div>
        </div>
      ) : (
        <div 
          className={cn(
            "border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center transition-all cursor-pointer relative min-h-[96px]",
            dragActive 
              ? "border-indigo-500 bg-indigo-50/40" 
              : "border-slate-250 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-350",
            isUploading && "pointer-events-none opacity-80"
          )}
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={handleFileChange}
          />
          {isUploading ? (
            <div className="flex flex-col items-center gap-2 text-indigo-600 py-1">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-[9px] font-black uppercase tracking-widest text-indigo-700 animate-pulse">Processando Imagem...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center">
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-xs mb-1.5 border border-slate-100">
                <Upload className="w-4 h-4 text-indigo-500" />
              </div>
              <span className="text-xs font-extrabold text-slate-700 leading-none">Arraste ou clique para enviar</span>
              <span className="text-[8px] text-slate-400 mt-1 font-bold uppercase tracking-widest">Formatos aceitos: JPG, PNG, GIF</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
