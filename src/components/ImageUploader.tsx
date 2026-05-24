import React, { useState, useRef } from 'react';
import { Upload, X, Loader2, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { compressImageToBase64 } from '../lib/image-utils';

export function ImageUploader({ 
  value, 
  onChange 
}: { 
  value: string; 
  onChange: (val: string) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [mode, setMode] = useState<'link' | 'upload'>('link');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const base64 = await compressImageToBase64(file, 1200, 1200, 0.7);
      onChange(base64);
      setMode('link');
    } catch (error) {
      console.error('Failed to process image:', error);
      alert('Erro ao processar imagem.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const isBase64 = value?.startsWith('data:image');

  return (
    <div className="space-y-2">
      <div className="flex gap-1 p-1 bg-gray-100 rounded-md">
        <button
          type="button"
          onClick={() => setMode('link')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1 text-[10px] font-bold rounded transition-colors uppercase tracking-widest",
            mode === 'link' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-gray-200"
          )}
        >
          <LinkIcon className="w-3 h-3" /> Link (URL)
        </button>
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1 text-[10px] font-bold rounded transition-colors uppercase tracking-widest",
            mode === 'upload' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-gray-200"
          )}
        >
          <ImageIcon className="w-3 h-3" /> Enviar
        </button>
      </div>

      {mode === 'link' ? (
        <div className="flex gap-2">
          {(!isBase64) ? (
            <input 
              type="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              placeholder="https://..."
            />
          ) : (
            <div className="flex-1 flex items-center gap-2 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
              <div className="w-6 h-6 rounded shrink-0 bg-gray-200 overflow-hidden">
                <img src={value} alt="Preview" className="w-full h-full object-cover" />
              </div>
              <span className="text-[10px] font-medium text-gray-600 truncate flex-1 leading-tight">Imagem<br/>(Base64)</span>
              <button
                type="button"
                onClick={() => onChange('')}
                className="p-1 hover:bg-red-100 text-red-600 rounded-full"
                title="Remover anexo"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer relative"
             onClick={() => fileInputRef.current?.click()}
        >
          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={handleFileChange}
          />
          {isUploading ? (
            <div className="flex flex-col items-center gap-1.5 text-blue-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Processando...</span>
            </div>
          ) : (
            <>
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm mb-2">
                <Upload className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-xs font-bold text-gray-700 text-center leading-tight">Clique para imagem</span>
              <span className="text-[9px] text-gray-500 mt-0.5 uppercase tracking-widest">JPG, PNG, GIF</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
