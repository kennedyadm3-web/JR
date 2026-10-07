import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { dataService } from '../services/dataService';
import { ServiceCompanyConfig } from '../types';

let memoryCachedSettings: any = null;

export function getCachedServiceOrderSettings(): any {
  if (memoryCachedSettings) return memoryCachedSettings;
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('cached_service_order_settings');
      if (stored) {
        memoryCachedSettings = JSON.parse(stored);
        return memoryCachedSettings;
      }
    } catch (e) {}
  }
  return null;
}

export function getCompanyConfigFromCache(companyId?: string): ServiceCompanyConfig | undefined {
  if (!companyId) return undefined;
  const settings = getCachedServiceOrderSettings();
  if (!settings?.companies || !Array.isArray(settings.companies) || settings.companies.length === 0) {
    return undefined;
  }

  const raw = String(companyId).trim().toLowerCase();
  const cleanKey = raw.replace(/[^a-z0-9]/g, '');

  // 1. Exact ID match
  let found = settings.companies.find((c: ServiceCompanyConfig) => (c.id || '').toLowerCase() === raw);
  if (found) return found;

  // 2. Normalized ID match
  found = settings.companies.find((c: ServiceCompanyConfig) => (c.id || '').toLowerCase().replace(/[^a-z0-9]/g, '') === cleanKey);
  if (found) return found;

  // 3. Short name or Full name match
  found = settings.companies.find((c: ServiceCompanyConfig) => {
    const s = (c.shortName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const f = (c.fullName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return s.includes(cleanKey) || cleanKey.includes(s) || f.includes(cleanKey) || cleanKey.includes(f);
  });
  if (found) return found;

  // 4. Special keywords (alclima / lefrio)
  if (cleanKey.includes('clima')) {
    found = settings.companies.find((c: ServiceCompanyConfig) => 
      (c.id || '').toLowerCase().includes('clima') || 
      (c.shortName || '').toLowerCase().includes('clima')
    );
    if (found) return found;
  }
  if (cleanKey.includes('frio')) {
    found = settings.companies.find((c: ServiceCompanyConfig) => 
      (c.id || '').toLowerCase().includes('frio') || 
      (c.shortName || '').toLowerCase().includes('frio')
    );
    if (found) return found;
  }

  // 5. Se houver apenas 1 empresa cadastrada nas configurações, utiliza ela
  if (settings.companies.length === 1) {
    return settings.companies[0];
  }

  // 6. Se existir empresa com logotipo cadastrado pelo usuário nas configurações, prioriza
  const companyWithLogo = settings.companies.find((c: ServiceCompanyConfig) => Boolean(c.logoUrl));
  if (companyWithLogo) return companyWithLogo;

  return settings.companies[0];
}

interface CompanyLogoProps {
  companyId?: string;
  logoUrl?: string;
  className?: string;
  alt?: string;
  style?: React.CSSProperties;
}

export function CompanyLogo({
  companyId = 'lefrio',
  logoUrl,
  className = "w-16 h-16",
  alt,
  style
}: CompanyLogoProps) {
  // Inicialização síncrona imediata para que a impressão (window.print()) nunca caia no fallback por atraso assíncrono
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState<string | undefined>(() => {
    if (logoUrl) return logoUrl;
    const comp = getCompanyConfigFromCache(companyId);
    return comp?.logoUrl || undefined;
  });

  useEffect(() => {
    if (logoUrl) {
      setResolvedLogoUrl(logoUrl);
      return;
    }

    let isMounted = true;

    const syncLogo = (settings: any) => {
      if (!isMounted || !settings?.companies) return;
      memoryCachedSettings = settings;
      const comp = getCompanyConfigFromCache(companyId);
      if (comp?.logoUrl) {
        setResolvedLogoUrl(comp.logoUrl);
      } else {
        setResolvedLogoUrl(undefined);
      }
    };

    // Sincroniza inicialmente do cache
    const currentCached = getCachedServiceOrderSettings();
    if (currentCached) {
      syncLogo(currentCached);
    }

    // Busca assíncrona do serviço para garantir dados frescos
    dataService.getServiceOrderSettings().then(settings => {
      if (settings) {
        syncLogo(settings);
      }
    }).catch(() => {});

    const handleSettingsUpdated = () => {
      memoryCachedSettings = null; // Invalida memória para forçar releitura do localStorage
      const updated = getCachedServiceOrderSettings();
      if (updated) {
        syncLogo(updated);
      } else {
        dataService.getServiceOrderSettings().then(syncLogo).catch(() => {});
      }
    };

    window.addEventListener('company-settings-updated', handleSettingsUpdated);
    window.addEventListener('storage', handleSettingsUpdated);
    return () => {
      isMounted = false;
      window.removeEventListener('company-settings-updated', handleSettingsUpdated);
      window.removeEventListener('storage', handleSettingsUpdated);
    };
  }, [companyId, logoUrl]);

  // Se tiver logotipo personalizado enviado pelo usuário nas configurações
  if (resolvedLogoUrl) {
    return (
      <div 
        className={cn("flex items-center justify-center shrink-0 overflow-hidden", className)}
        style={style}
      >
        <img 
          src={resolvedLogoUrl} 
          alt={alt || companyId || 'Logotipo da Empresa'} 
          className="max-w-full max-h-full w-auto h-auto object-contain block"
        />
      </div>
    );
  }

  const isAlClima = (companyId || '').toLowerCase().includes('clima');

  // Fallback vetorial oficial padrão Al Clima
  if (isAlClima) {
    return (
      <div className={cn("flex items-center justify-center shrink-0", className)} style={style}>
        <svg viewBox="0 0 140 115" className="w-full h-full object-contain">
          <rect width="140" height="115" rx="6" fill="#143e1d" />
          <path d="M 10,35 L 10,105 L 130,105 L 130,35" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.6" />
          <path d="M 10,35 L 35,35 M 105,35 L 130,35" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.6" />
          <g transform="translate(64, 28) scale(1.2)" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none">
            <circle cx="0" cy="0" r="1.5" fill="#ffffff" stroke="none" />
            <line x1="0" y1="-18" x2="0" y2="18" />
            <line x1="-18" y1="0" x2="18" y2="0" />
            <line x1="-12.7" y1="-12.7" x2="12.7" y2="12.7" />
            <line x1="-12.7" y1="12.7" x2="12.7" y2="-12.7" />
            <path d="M -4,-12 L 0,-16 L 4,-12" />
            <path d="M -3,-7 L 0,-10 L 3,-7" />
            <path d="M -4,12 L 0,16 L 4,12" />
            <path d="M -3,7 L 0,10 L 3,7" />
            <path d="M -12,-4 L -16,0 L -12,4" />
            <path d="M -7,-3 L -10,0 L -7,3" />
            <path d="M 12,-4 L 16,0 L 12,4" />
            <path d="M 7,-3 L 10,0 L 7,3" />
          </g>
          <g transform="translate(86, 10) scale(0.75)">
            <rect x="0" y="0" width="8" height="24" rx="4" fill="none" stroke="#ffffff" strokeWidth="1.8" />
            <circle cx="4" cy="24" r="6" fill="#39e75f" stroke="#ffffff" strokeWidth="1.8" />
            <line x1="4" y1="10" x2="4" y2="21" stroke="#39e75f" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g transform="translate(15, 80)">
            <text x="0" y="0" fontFamily="sans-serif" fontWeight="900" fontSize="21" fill="#ffffff" letterSpacing="0.5">AL</text>
            <text x="32" y="0" fontFamily="sans-serif" fontWeight="900" fontSize="21" fill="#2fe058" letterSpacing="0.5">CLIMA</text>
          </g>
          <text x="70" y="98" textAnchor="middle" fontFamily="sans-serif" fontWeight="700" fontSize="6" fill="#ffffff" letterSpacing="3.2" opacity="0.9">REFRIGERAÇÃO</text>
        </svg>
      </div>
    );
  }

  // Fallback vetorial oficial padrão Le Frio
  return (
    <div className={cn("flex items-center justify-center shrink-0", className)} style={style}>
      <svg viewBox="0 0 140 100" className="w-full h-full object-contain">
        <g fill="none" stroke="#68B7F2" strokeWidth="6.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 29,8 Q 50,0.8 71,8 T 113,8" />
          <path d="M 29,20 Q 50,12 71,20 T 113,20" />
          <path d="M 29,32 Q 50,23.2 71,32 T 113,32" />
          <path d="M 29,44 Q 50,34.4 71,44 T 113,44" />
        </g>
        <g fill="none" stroke="#3556A8" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 16,60 L 16,90 L 29,90" />
          <path d="M 49,60 L 37,60 L 37,90 L 49,90" />
          <path d="M 37,75 L 46,75" />
          <path d="M 57,90 L 57,60 L 69,60" />
          <path d="M 57,75 L 66,75" />
          <path d="M 77,90 L 77,60 L 86,60 A 7.5,7.5 0 0,1 86,75 L 77,75" />
          <path d="M 83,75 L 89,90" />
          <path d="M 99,60 L 99,90" />
          <path d="M 114,60 L 120,60 A 6,6 0 0,1 126,66 L 126,84 A 6,6 0 0,1 120,90 L 114,90 A 6,6 0 0,1 108,84 L 108,66 A 6,6 0 0,1 114,60 Z" />
        </g>
      </svg>
    </div>
  );
}
