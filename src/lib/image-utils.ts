export function isValidImageUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed === 'data:,' || trimmed === 'data:' || trimmed.length < 50) return false;
  return trimmed.startsWith('data:image/') || trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('blob:');
}

export async function compressImageToBase64(
  file: File, 
  maxWidth = 800, 
  maxHeight: number = 800, 
  quality = 0.55
): Promise<string> {
  // Proteção contra chamadas com 3 argumentos onde o 3º é a qualidade (ex: compressImageToBase64(file, 1280, 0.8))
  if (typeof maxHeight === 'number' && maxHeight > 0 && maxHeight <= 1 && quality === 0.55) {
    quality = maxHeight;
    maxHeight = maxWidth;
  }

  // Garantir limites mínimos seguros
  const safeMaxWidth = Math.max(100, maxWidth || 800);
  const safeMaxHeight = Math.max(100, maxHeight || 800);
  const safeQuality = Math.min(1, Math.max(0.1, quality || 0.55));

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > safeMaxWidth) {
            height = Math.round((height * safeMaxWidth) / width);
            width = safeMaxWidth;
          }
        } else {
          if (height > safeMaxHeight) {
            width = Math.round((width * safeMaxHeight) / height);
            height = safeMaxHeight;
          }
        }

        width = Math.max(10, width);
        height = Math.max(10, height);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // Compress as JPEG
        const base64String = canvas.toDataURL('image/jpeg', safeQuality);
        if (!isValidImageUrl(base64String)) {
          // Fallback: se a compressão canvas falhou por algum motivo, usar o resultado original do reader se for aceitável
          const rawResult = event.target?.result as string;
          if (isValidImageUrl(rawResult)) {
            resolve(rawResult);
            return;
          }
          reject(new Error('Falha ao gerar imagem do comprovante. Tente tirar a foto novamente.'));
          return;
        }
        resolve(base64String);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}

export async function compressLogoImage(file: File, maxWidth = 500, maxHeight = 250): Promise<string> {
  // Se for SVG, ler diretamente como Data URL para preservar 100% a fidelidade vetorial e tamanho reduzido
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const res = e.target?.result as string;
        if (isValidImageUrl(res)) resolve(res);
        else reject(new Error('Arquivo SVG inválido.'));
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo SVG.'));
      reader.readAsDataURL(file);
    });
  }

  // Para imagens rasterizadas (PNG, WebP, JPG), redimensionar preservando canal alfa de transparência
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(10, width);
        canvas.height = Math.max(10, height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Não foi possível processar a imagem do logo.'));
          return;
        }

        // Desenhar mantendo transparência
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const isJpg = file.type === 'image/jpeg' || file.type === 'image/jpg';
        const mimeType = isJpg ? 'image/jpeg' : 'image/png';
        const base64String = canvas.toDataURL(mimeType, isJpg ? 0.88 : undefined);

        if (!isValidImageUrl(base64String)) {
          const raw = event.target?.result as string;
          if (isValidImageUrl(raw)) {
            resolve(raw);
            return;
          }
          reject(new Error('Falha ao processar o logotipo. Tente outra imagem.'));
          return;
        }
        resolve(base64String);
      };
      img.onerror = () => reject(new Error('Erro ao carregar imagem do logotipo.'));
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo de imagem.'));
  });
}

