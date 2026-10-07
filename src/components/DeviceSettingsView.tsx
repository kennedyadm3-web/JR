import React, { useState, useEffect } from 'react';
import { Smartphone, Clock, Save, Check, Loader2, Sparkles, CheckSquare, Square, AlertCircle, Volume2, VolumeX, Play } from 'lucide-react';
import { cn } from '../lib/utils';
import { dataService } from '../services/dataService';
import { soundService } from '../services/soundService';
import { DeviceSettings, Technician } from '../types';

export default function DeviceSettingsView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [shortcutText, setShortcutText] = useState('Atendimento');
  const [expirationDays, setExpirationDays] = useState(30);
  const [startTriggerEnabled, setStartTriggerEnabled] = useState(false);
  const [finishTriggerEnabled, setFinishTriggerEnabled] = useState(false);
  const [soundAlertEnabled, setSoundAlertEnabled] = useState<boolean>(() => soundService.isSoundEnabled());
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [selectedTechs, setSelectedTechs] = useState<string[]>([]);
  
  // Available technicians
  const [technicians, setTechnicians] = useState<Technician[]>([]);

  useEffect(() => {
    async function loadSettingsAndTechs() {
      setLoading(true);
      try {
        const [settings, techs] = await Promise.all([
          dataService.getDeviceSettings(),
          dataService.getTechnicians(),
        ]);
        
        if (settings) {
          setShortcutText(settings.shortcutText || 'Atendimento');
          setExpirationDays(settings.expirationDays ?? 30);
          setStartTriggerEnabled(settings.startTriggerEnabled ?? false);
          setFinishTriggerEnabled(settings.finishTriggerEnabled ?? false);
          if (settings.soundAlertEnabled !== undefined) {
            setSoundAlertEnabled(settings.soundAlertEnabled);
            soundService.setSoundEnabled(settings.soundAlertEnabled);
          }
          setSelectedTechs(settings.notifiedTechnicians || []);
        }
        
        setTechnicians(techs || []);
      } catch (err: any) {
        console.error('Erro ao carregar configurações de dispositivo:', err);
        setError('Ocorreu um erro ao carregar as configurações do sistema.');
      } finally {
        setLoading(false);
      }
    }

    loadSettingsAndTechs();
  }, []);

  const handleToggleTech = (techName: string) => {
    setSelectedTechs(prev => 
      prev.includes(techName)
        ? prev.filter(t => t !== techName)
        : [...prev, techName]
    );
  };

  const handleSelectAllTechs = () => {
    setSelectedTechs(technicians.map(t => t.name));
  };

  const handleClearAllTechs = () => {
    setSelectedTechs([]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError(null);

    try {
      const updatedSettings: DeviceSettings = {
        shortcutText: shortcutText.trim() || 'Atendimento',
        expirationDays: Number(expirationDays) || 30,
        startTriggerEnabled,
        finishTriggerEnabled,
        soundAlertEnabled,
        notifiedTechnicians: selectedTechs,
      };

      await dataService.updateDeviceSettings(updatedSettings);
      soundService.setSoundEnabled(soundAlertEnabled);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Erro ao salvar configurações de dispositivo:', err);
      setError('Não foi possível salvar as configurações no servidor. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="text-sm text-gray-500 font-bold">Carregando parâmetros do sistema...</p>
      </div>
    );
  }

  return (
    <form id="device-settings-form" onSubmit={handleSave} className="space-y-6">
      {/* Informative Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5 flex gap-4 items-start shadow-xs">
        <Smartphone className="w-8 h-8 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-extrabold text-blue-950 text-base flex items-center gap-1.5">
            Configurações de Dispositivos Móveis
            <span className="bg-blue-100 text-blue-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider">Tablet / Mobile</span>
          </h2>
          <p className="text-sm text-blue-800/80 mt-1 leading-relaxed">
            Configure o comportamento dos dispositivos utilizados pelos técnicos em campo. Ajuste atalhos de texto, limites de sincronização para melhoria de desempenho e alertas de atividades em tempo real.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Core parameters */}
        <div className="space-y-6">
          {/* 1 - Shortcut Text Configuration */}
          <div className="bg-white border border-gray-150 rounded-2xl p-6 shadow-xs flex flex-col space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h3 className="font-extrabold text-gray-900 text-sm">1. Atalho de Texto Rápido</h3>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="shortcutText" className="block text-xs font-black text-gray-800 uppercase tracking-wider">
                Texto do Botão de Atalho
              </label>
              <input
                id="shortcutText"
                type="text"
                value={shortcutText}
                onChange={(e) => setShortcutText(e.target.value)}
                placeholder="Ex: Atendimento"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-sm transition-all"
                required
              />
              <p className="text-xs text-gray-500 leading-relaxed">
                Este texto será inserido no relato do equipamento correspondente quando o técnico clicar no botão de atalho do tablet, evitando digitação repetitiva em campo.
              </p>
            </div>
          </div>

          {/* 2 - Maintenance Sheet Expiration */}
          <div className="bg-white border border-gray-150 rounded-2xl p-6 shadow-xs flex flex-col space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Clock className="w-5 h-5 text-indigo-500" />
              <h3 className="font-extrabold text-gray-900 text-sm">2. Limite de Exibição no Dispositivo</h3>
            </div>

            <div className="space-y-2">
              <label htmlFor="expirationDays" className="block text-xs font-black text-gray-800 uppercase tracking-wider">
                Tempo de Disponibilidade (em dias)
              </label>
              <div className="relative">
                <input
                  id="expirationDays"
                  type="number"
                  min="1"
                  max="365"
                  value={expirationDays}
                  onChange={(e) => setExpirationDays(Number(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-sm transition-all pr-12"
                  required
                />
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                  <span className="text-xs font-bold text-gray-400 uppercase">Dias</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Controla por quantos dias as planilhas e rotinas de manutenção concluídas ou pendentes permanecerão visíveis nos dispositivos dos técnicos. Expirado este prazo, elas são ocultadas localmente no tablet, mantendo a performance do aplicativo leve e rápida.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column - Triggers & Technicians selection */}
        <div className="space-y-6">
          {/* 3 - Start / Finish Service Triggers */}
          <div className="bg-white border border-gray-150 rounded-2xl p-6 shadow-xs flex flex-col space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Smartphone className="w-5 h-5 text-emerald-500" />
              <h3 className="font-extrabold text-gray-900 text-sm">3. Gatilhos de Notificação Operacional</h3>
            </div>

            <div className="space-y-4">
              {/* Trigger Start Toggle */}
              <div className="flex items-start justify-between gap-4 p-3.5 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100/50 transition-all">
                <div className="space-y-1">
                  <span className="text-xs font-black text-gray-800 uppercase tracking-wide">Notificar no Início do Serviço</span>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Dispara uma notificação em tempo real no painel administrativo do escritório assim que o técnico clicar em iniciar atendimento no tablet.
                  </p>
                </div>
                <button
                  type="button"
                  id="toggle-start-trigger"
                  onClick={() => setStartTriggerEnabled(!startTriggerEnabled)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    startTriggerEnabled ? "bg-emerald-600" : "bg-gray-200"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
                      startTriggerEnabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              {/* Trigger Finish Toggle */}
              <div className="flex items-start justify-between gap-4 p-3.5 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100/50 transition-all">
                <div className="space-y-1">
                  <span className="text-xs font-black text-gray-800 uppercase tracking-wide">Notificar na Conclusão (Assinatura)</span>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Gera um alerta administrativo imediato após o técnico coletar a assinatura do cliente e finalizar o atendimento em campo.
                  </p>
                </div>
                <button
                  type="button"
                  id="toggle-finish-trigger"
                  onClick={() => setFinishTriggerEnabled(!finishTriggerEnabled)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    finishTriggerEnabled ? "bg-emerald-600" : "bg-gray-200"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
                      finishTriggerEnabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              {/* Som de Notificação / Alerta Sonoro do Sistema */}
              <div className="flex items-start justify-between gap-4 p-3.5 bg-blue-50/50 rounded-xl border border-blue-100/80 transition-all">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-1.5">
                    {soundAlertEnabled ? (
                      <Volume2 className="w-4 h-4 text-blue-600" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="text-xs font-black text-gray-900 uppercase tracking-wide">Alerta Sonoro de Notificação</span>
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded border",
                      soundAlertEnabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"
                    )}>
                      {soundAlertEnabled ? 'Ativo' : 'Mudo'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Toca um alerta audível suave no computador do escritório quando o técnico iniciar ou concluir o atendimento no tablet.
                  </p>
                  <div className="pt-1.5">
                    <button
                      type="button"
                      id="btn-test-device-sound"
                      onClick={() => {
                        setIsPlayingTest(true);
                        soundService.testNotificationSound();
                        setTimeout(() => setIsPlayingTest(false), 500);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-[11px] font-bold transition shadow-3xs cursor-pointer"
                    >
                      <Play className={cn("w-3 h-3", isPlayingTest && "animate-spin text-blue-600")} />
                      <span>{isPlayingTest ? 'Ouvindo...' : 'Testar Som'}</span>
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  id="toggle-sound-alert-trigger"
                  onClick={() => {
                    const next = !soundAlertEnabled;
                    setSoundAlertEnabled(next);
                    soundService.setSoundEnabled(next);
                    if (next) soundService.testNotificationSound();
                  }}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    soundAlertEnabled ? "bg-blue-600" : "bg-gray-200"
                  )}
                  title={soundAlertEnabled ? "Desativar som do alerta" : "Ativar som do alerta"}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
                      soundAlertEnabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Technicians Selection (rendered only if at least one trigger is enabled) */}
            {(startTriggerEnabled || finishTriggerEnabled) && (
              <div className="space-y-3 pt-3 border-t border-gray-100 animate-fadeIn">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black text-gray-800 uppercase tracking-wider">
                    Técnicos Integrados ao Gatilho ({selectedTechs.length})
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      id="btn-select-all-techs"
                      onClick={handleSelectAllTechs}
                      className="text-[10px] font-bold text-blue-600 hover:underline uppercase"
                    >
                      Todos
                    </button>
                    <span className="text-[10px] text-gray-300">•</span>
                    <button
                      type="button"
                      id="btn-clear-all-techs"
                      onClick={handleClearAllTechs}
                      className="text-[10px] font-bold text-gray-500 hover:underline uppercase"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                {technicians.length === 0 ? (
                  <div className="text-center p-4 border border-dashed border-gray-200 rounded-xl bg-gray-50">
                    <AlertCircle className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                    <p className="text-xs text-gray-500 font-bold">Nenhum técnico cadastrado</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-gray-150 rounded-xl p-3 scrollbar-thin bg-gray-50/50">
                    {technicians.map((tech) => {
                      const isSelected = selectedTechs.includes(tech.name);
                      return (
                        <button
                          key={tech.id}
                          type="button"
                          id={`tech-select-${tech.id}`}
                          onClick={() => handleToggleTech(tech.name)}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-xs font-bold transition-all",
                            isSelected
                              ? "bg-blue-50 border-blue-200 text-blue-800"
                              : "bg-white border-gray-200 text-gray-600 hover:bg-gray-100"
                          )}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400 shrink-0" />
                          )}
                          <span className="truncate">{tech.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] text-gray-400 leading-relaxed mt-1">
                  Apenas os técnicos selecionados acima dispararão alertas em tempo real no escritório administrativo.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action / Save bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-200">
        <div className="flex items-center gap-2.5">
          {error && (
            <div className="text-red-600 flex items-center gap-1.5 text-xs font-bold bg-red-50 border border-red-100 px-3.5 py-2 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="text-emerald-700 flex items-center gap-1.5 text-xs font-bold bg-emerald-50 border border-emerald-100 px-3.5 py-2 rounded-xl animate-fadeIn">
              <Check className="w-4 h-4 shrink-0" />
              Configurações salvas com sucesso!
            </div>
          )}
        </div>

        <button
          type="submit"
          id="btn-save-device-settings"
          disabled={saving}
          className={cn(
            "w-full sm:w-auto px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-blue-100 flex items-center justify-center gap-2 cursor-pointer",
            saving && "opacity-80 cursor-not-allowed"
          )}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Salvar Configurações
            </>
          )}
        </button>
      </div>
    </form>
  );
}
