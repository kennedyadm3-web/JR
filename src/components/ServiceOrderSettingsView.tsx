import React, { useState, useEffect } from 'react';
import { Save, Check, Loader2, Plus, Trash2, Building, Settings2, AlertCircle, Upload, Image as ImageIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { dataService } from '../services/dataService';
import { ServiceOrderSettings, ServiceCompanyConfig } from '../types';
import { compressLogoImage } from '../lib/image-utils';
import { CompanyLogo } from './CompanyLogo';

export default function ServiceOrderSettingsView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Form states
  const [maintenanceTypes, setMaintenanceTypes] = useState<string[]>([]);
  const [companies, setCompanies] = useState<ServiceCompanyConfig[]>([]);

  // Add state for temporary new inputs
  const [newType, setNewType] = useState('');
  
  // Selected company for editing
  const [editingCompanyId, setEditingCompanyId] = useState<string>('lefrio');

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      try {
        const settings = await dataService.getServiceOrderSettings();
        if (settings) {
          setMaintenanceTypes(settings.maintenanceTypes || []);
          setCompanies(settings.companies || []);
          if (settings.companies && settings.companies.length > 0) {
            setEditingCompanyId(settings.companies[0].id);
          }
        }
      } catch (err: any) {
        console.error('Erro ao carregar configurações de OS:', err);
        setError('Ocorreu um erro ao carregar as configurações de ordens de serviço.');
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  const handleAddType = () => {
    const trimmed = newType.trim().toUpperCase();
    if (!trimmed) return;
    if (maintenanceTypes.includes(trimmed)) {
      setError('Este tipo de manutenção já existe!');
      return;
    }
    setMaintenanceTypes(prev => [...prev, trimmed]);
    setNewType('');
    setError(null);
  };

  const handleRemoveType = (typeToRemove: string) => {
    setMaintenanceTypes(prev => prev.filter(t => t !== typeToRemove));
  };

  const handleCompanyChange = (id: string, field: keyof ServiceCompanyConfig, value: string) => {
    setCompanies(prev => prev.map(company => {
      if (company.id === id) {
        return { ...company, [field]: value };
      }
      return company;
    }));
  };

  const handleAddCompany = () => {
    const newId = `company_${Date.now()}`;
    const newCompany: ServiceCompanyConfig = {
      id: newId,
      shortName: 'Nova Empresa',
      fullName: 'Nova Empresa Prestadora Ltda',
      cnpj: '00.000.000/0001-00',
      ie: '',
      im: '',
      address: '',
      email: '',
      phone: ''
    };
    setCompanies(prev => [...prev, newCompany]);
    setEditingCompanyId(newId);
  };

  const handleRemoveCompany = (idToRemove: string) => {
    if (companies.length <= 1) {
      setError('É necessário manter pelo menos uma empresa prestadora configurada!');
      return;
    }
    setCompanies(prev => prev.filter(c => c.id !== idToRemove));
    if (editingCompanyId === idToRemove) {
      const remaining = companies.filter(c => c.id !== idToRemove);
      setEditingCompanyId(remaining[0]?.id || '');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingCompanyId) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const compressedBase64 = await compressLogoImage(file);
      const updatedCompanies = companies.map(company => {
        if (company.id === editingCompanyId) {
          return { ...company, logoUrl: compressedBase64 };
        }
        return company;
      });
      setCompanies(updatedCompanies);

      // Persistência imediata no localStorage para acesso síncrono instantâneo
      const updatedSettings = {
        id: 'service_orders',
        maintenanceTypes,
        companies: updatedCompanies
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('cached_service_order_settings', JSON.stringify(updatedSettings));
      }
      window.dispatchEvent(new Event('company-settings-updated'));

      // Salva no Firestore
      try {
        await dataService.updateServiceOrderSettings({
          maintenanceTypes,
          companies: updatedCompanies
        });
      } catch (saveErr) {
        console.warn('Salvo localmente com sucesso, aguardando sincronização com Firestore:', saveErr);
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      console.error('Erro ao processar logotipo:', err);
      setError(err?.message || 'Falha ao processar a imagem do logotipo. Certifique-se de enviar PNG, JPG ou SVG.');
    } finally {
      setUploadingLogo(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    if (!editingCompanyId) return;
    const updatedCompanies = companies.map(company => {
      if (company.id === editingCompanyId) {
        return { ...company, logoUrl: '' };
      }
      return company;
    });
    setCompanies(updatedCompanies);

    const updatedSettings = {
      id: 'service_orders',
      maintenanceTypes,
      companies: updatedCompanies
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('cached_service_order_settings', JSON.stringify(updatedSettings));
    }
    window.dispatchEvent(new Event('company-settings-updated'));

    try {
      await dataService.updateServiceOrderSettings({
        maintenanceTypes,
        companies: updatedCompanies
      });
    } catch (err) {
      console.warn('Erro ao sincronizar remoção no Firestore:', err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError(null);

    try {
      const updatedSettings: Omit<ServiceOrderSettings, 'id'> = {
        maintenanceTypes,
        companies
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem('cached_service_order_settings', JSON.stringify({
          id: 'service_orders',
          ...updatedSettings
        }));
      }

      await dataService.updateServiceOrderSettings(updatedSettings);
      window.dispatchEvent(new Event('company-settings-updated'));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Erro ao salvar configurações de OS:', err);
      setError('Não foi possível salvar as configurações no servidor. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="text-sm text-gray-500 font-bold">Carregando configurações de O.S...</p>
      </div>
    );
  }

  const activeCompany = companies.find(c => c.id === editingCompanyId);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
            <Settings2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-gray-900 uppercase tracking-tight">Parâmetros das Ordens de Serviço</h2>
            <p className="text-xs text-gray-400">Configure os tipos de manutenção e os dados das empresas prestadoras que são emitidos nas ordens de serviço.</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 text-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Coluna Tipos de OS - 5 colunas */}
          <div className="lg:col-span-5 space-y-4">
            <div className="border border-gray-100 rounded-2xl p-4 bg-slate-50/50 space-y-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">Tipos de Manutenção (O.S.)</h3>
              
              {/* Adicionar Tipo */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="EX: MANUTENÇÃO AVULSA"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddType();
                    }
                  }}
                  className="flex-1 bg-white border border-gray-200 rounded-xl py-2 px-3 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddType}
                  className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-xl transition-all flex items-center justify-center shrink-0 cursor-pointer"
                  title="Adicionar Tipo"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Lista de Tipos */}
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                {maintenanceTypes.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-4">Nenhum tipo cadastrado.</p>
                ) : (
                  maintenanceTypes.map((type) => (
                    <div key={type} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl py-2 px-3 hover:border-gray-200 transition-all">
                      <span className="text-xs font-bold text-gray-700">{type}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveType(type)}
                        className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-all cursor-pointer"
                        title="Remover Tipo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Coluna Empresas Prestadoras - 7 colunas */}
          <div className="lg:col-span-7 space-y-4">
            <div className="border border-gray-100 rounded-2xl p-4 bg-slate-50/50 space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-gray-150 pb-2">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Building className="w-4 h-4 text-slate-400" /> Empresas Prestadoras
                </h3>
                <button
                  type="button"
                  onClick={handleAddCompany}
                  className="text-[10px] font-black text-blue-600 hover:bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Nova Empresa
                </button>
              </div>

              {/* Seletor de Empresas */}
              <div className="flex flex-wrap gap-1.5">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => setEditingCompanyId(company.id)}
                    className={cn(
                      "text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all uppercase flex items-center gap-2 cursor-pointer",
                      editingCompanyId === company.id
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <span>{company.shortName || 'Sem nome'}</span>
                    {companies.length > 1 && (
                      <span 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveCompany(company.id);
                        }}
                        className="hover:text-rose-200 p-0.5"
                        title="Remover Empresa"
                      >
                        ✕
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Detalhes da Empresa Selecionada */}
              {activeCompany && (
                <div className="bg-white border border-gray-100 rounded-xl p-3.5 space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider block mb-1">Nome Curto (Exibição)</label>
                      <input
                        type="text"
                        value={activeCompany.shortName}
                        onChange={(e) => handleCompanyChange(activeCompany.id, 'shortName', e.target.value)}
                        className="w-full bg-slate-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider block mb-1">Razão Social Completa</label>
                      <input
                        type="text"
                        value={activeCompany.fullName}
                        onChange={(e) => handleCompanyChange(activeCompany.id, 'fullName', e.target.value)}
                        className="w-full bg-slate-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider block mb-1">CNPJ</label>
                      <input
                        type="text"
                        value={activeCompany.cnpj}
                        onChange={(e) => handleCompanyChange(activeCompany.id, 'cnpj', e.target.value)}
                        className="w-full bg-slate-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider block mb-1">Insc. Estadual</label>
                      <input
                        type="text"
                        value={activeCompany.ie}
                        onChange={(e) => handleCompanyChange(activeCompany.id, 'ie', e.target.value)}
                        className="w-full bg-slate-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider block mb-1">Insc. Municipal</label>
                      <input
                        type="text"
                        value={activeCompany.im}
                        onChange={(e) => handleCompanyChange(activeCompany.id, 'im', e.target.value)}
                        className="w-full bg-slate-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider block mb-1">Endereço da Empresa</label>
                    <input
                      type="text"
                      value={activeCompany.address}
                      onChange={(e) => handleCompanyChange(activeCompany.id, 'address', e.target.value)}
                      className="w-full bg-slate-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider block mb-1">E-mail de Contato</label>
                      <input
                        type="email"
                        value={activeCompany.email}
                        onChange={(e) => handleCompanyChange(activeCompany.id, 'email', e.target.value)}
                        className="w-full bg-slate-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-gray-400 tracking-wider block mb-1">Telefone de Contato</label>
                      <input
                        type="text"
                        value={activeCompany.phone}
                        onChange={(e) => handleCompanyChange(activeCompany.id, 'phone', e.target.value)}
                        className="w-full bg-slate-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Seção de Logotipo da Empresa para Impressão */}
                  <div className="border border-slate-200/90 rounded-xl p-3.5 bg-slate-50/70 space-y-3 mt-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-blue-600" />
                        <span className="text-[10px] font-black uppercase text-slate-800 tracking-wider">
                          Logotipo da Empresa (Folhas de Impressão, Relatórios e O.S.)
                        </span>
                      </div>
                      {activeCompany.logoUrl ? (
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
                          <Check className="w-3 h-3" /> Logotipo Personalizado Ativo
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded-full border border-slate-300">
                          Logotipo Vetorial Padrão
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
                      {/* Box do Preview do Logotipo */}
                      <div className="w-32 h-20 bg-slate-100/70 rounded-lg border border-slate-200 flex items-center justify-center p-2 shrink-0 shadow-inner overflow-hidden">
                        <CompanyLogo 
                          companyId={activeCompany.id} 
                          logoUrl={activeCompany.logoUrl} 
                          className="w-full h-full max-h-16" 
                          alt={activeCompany.shortName} 
                        />
                      </div>

                      <div className="flex-1 space-y-2 text-center sm:text-left w-full">
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                          Faça upload do arquivo oficial do logotipo da empresa (PNG, JPG ou SVG). Esta imagem será exibida com fidelidade no cabeçalho das <strong>folhas de manutenção preventiva (PMOC)</strong>, <strong>ordens de serviço</strong> e <strong>faturas</strong>.
                        </p>

                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                          <label className={cn(
                            "bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase tracking-wider py-1.5 px-3.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-98",
                            uploadingLogo && "opacity-60 cursor-not-allowed"
                          )}>
                            {uploadingLogo ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Upload className="w-3.5 h-3.5" />
                            )}
                            {activeCompany.logoUrl ? 'Trocar Logotipo' : 'Fazer Upload de Imagem'}
                            <input 
                              type="file" 
                              accept="image/png, image/jpeg, image/webp, image/svg+xml" 
                              className="hidden" 
                              onChange={handleLogoUpload}
                              disabled={uploadingLogo}
                            />
                          </label>

                          {activeCompany.logoUrl && (
                            <button
                              type="button"
                              onClick={handleRemoveLogo}
                              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 font-bold text-[10px] uppercase tracking-wider py-1.5 px-3 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" /> Restaurar Padrão
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Botão de Salvar Geral */}
        <div className="flex items-center justify-end border-t border-gray-100 pt-4 gap-3">
          {success && (
            <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold bg-emerald-50 py-1.5 px-3.5 rounded-xl border border-emerald-100 animate-fade-in">
              <Check className="w-4 h-4" /> Alterações salvas com sucesso!
            </span>
          )}
          
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider py-3 px-6 rounded-xl transition-all shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 active:scale-98 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Salvar Configurações
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
