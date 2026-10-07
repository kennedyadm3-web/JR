import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Bell, CheckCircle2, Play, Smartphone, Info, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { soundService } from '../services/soundService';
import { dataService } from '../services/dataService';
import { UserProfile, DeviceSettings } from '../types';

interface NotificationSettingsViewProps {
  userProfile?: UserProfile;
  onProfileUpdate?: (profile: UserProfile) => void;
}

export default function NotificationSettingsView({ userProfile, onProfileUpdate }: NotificationSettingsViewProps) {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => soundService.isSoundEnabled());
  const [volume, setVolume] = useState<number>(() => soundService.getVolume());
  const [isPlayingTest, setIsPlayingTest] = useState<boolean>(false);
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Inicializa os estados a partir do soundService ou do perfil do usuário
  useEffect(() => {
    if (userProfile?.notificationPreferences) {
      if (userProfile.notificationPreferences.notifySoundEnabled !== undefined) {
        setSoundEnabled(userProfile.notificationPreferences.notifySoundEnabled);
      }
      if (userProfile.notificationPreferences.notificationSoundVolume !== undefined) {
        setVolume(userProfile.notificationPreferences.notificationSoundVolume);
      }
    }
  }, [userProfile]);

  // Carrega configurações de dispositivo para sincronia do gatilho de início de atendimento
  useEffect(() => {
    dataService.getDeviceSettings()
      .then(settings => {
        setDeviceSettings(settings);
      })
      .catch(err => console.error('Erro ao carregar configurações de dispositivo:', err));
  }, []);

  const handleToggleSound = async (enabled: boolean) => {
    setSoundEnabled(enabled);
    soundService.setSoundEnabled(enabled);

    // Se estiver ativando, toca um toque suave de confirmação
    if (enabled) {
      soundService.testNotificationSound(volume);
    }

    // Persiste no perfil do usuário no Firestore se autenticado
    if (userProfile) {
      try {
        const updatedPrefs = {
          ...(userProfile.notificationPreferences || {
            notifyNewCall: true,
            notifyNewComment: true,
            notifyCallResolved: true
          }),
          notifySoundEnabled: enabled,
          notificationSoundVolume: volume
        };

        await dataService.updateUserProfile(userProfile.uid, {
          notificationPreferences: updatedPrefs
        });

        if (onProfileUpdate) {
          onProfileUpdate({
            ...userProfile,
            notificationPreferences: updatedPrefs
          });
        }
      } catch (err) {
        console.error('Erro ao salvar preferência de som no perfil:', err);
      }
    }

    triggerSaveToast();
  };

  const handleChangeVolume = async (newVol: number) => {
    setVolume(newVol);
    soundService.setVolume(newVol);
    soundService.testNotificationSound(newVol);

    if (userProfile) {
      try {
        const updatedPrefs = {
          ...(userProfile.notificationPreferences || {
            notifyNewCall: true,
            notifyNewComment: true,
            notifyCallResolved: true
          }),
          notifySoundEnabled: soundEnabled,
          notificationSoundVolume: newVol
        };

        await dataService.updateUserProfile(userProfile.uid, {
          notificationPreferences: updatedPrefs
        });

        if (onProfileUpdate) {
          onProfileUpdate({
            ...userProfile,
            notificationPreferences: updatedPrefs
          });
        }
      } catch (err) {
        console.error('Erro ao atualizar volume:', err);
      }
    }
  };

  const handleTestSound = () => {
    setIsPlayingTest(true);
    soundService.testNotificationSound(volume);
    setTimeout(() => {
      setIsPlayingTest(false);
    }, 600);
  };

  const triggerSaveToast = () => {
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 3500);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Alerta de salvamento */}
      {saveSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Configuração de som atualizada com sucesso! O sistema reproduzirá o alerta quando novos eventos chegarem.</span>
        </div>
      )}

      {/* Card Principal: Alerta Sonoro */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="flex items-start gap-3.5">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors shadow-xs",
              soundEnabled ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
            )}>
              {soundEnabled ? <Volume2 className="w-6 h-6 animate-pulse" /> : <VolumeX className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">Alerta Sonoro de Notificações</h3>
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                  soundEnabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"
                )}>
                  {soundEnabled ? 'Ativado' : 'Silenciado'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Emite um som agradável e sutil em tempo real no sistema administrativo sempre que houver novas notificações operacionais, como quando o técnico iniciar atendimento em campo.
              </p>
            </div>
          </div>

          {/* Toggle Principal */}
          <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
            <button
              type="button"
              id="toggle-notification-sound"
              onClick={() => handleToggleSound(!soundEnabled)}
              className={cn(
                "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                soundEnabled ? "bg-blue-600" : "bg-slate-300"
              )}
              title={soundEnabled ? "Desativar alerta sonoro" : "Ativar alerta sonoro"}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
                  soundEnabled ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>
        </div>

        {/* Controles de Volume e Teste de Áudio */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
          {/* Testar Som */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4.5 flex flex-col justify-between space-y-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Demonstração</span>
              <h4 className="text-xs font-black text-slate-800 mt-0.5">Testar Toque do Alerta Sonoro</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Clique no botão abaixo para ouvir exatamente como o alerta soará no seu computador ou dispositivo.
              </p>
            </div>

            <button
              type="button"
              id="btn-test-notification-sound"
              onClick={handleTestSound}
              disabled={isPlayingTest}
              className={cn(
                "w-full py-2.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs",
                isPlayingTest 
                  ? "bg-blue-700 text-white scale-[0.98]" 
                  : "bg-blue-600 hover:bg-blue-700 text-white hover:shadow-md"
              )}
            >
              <Play className={cn("w-3.5 h-3.5", isPlayingTest && "animate-spin")} />
              <span>{isPlayingTest ? 'Reproduzindo Som...' : 'Ouvir Som de Notificação'}</span>
            </button>
          </div>

          {/* Nível de Volume */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4.5 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Volume</span>
                <span className="text-xs font-black text-blue-600">{Math.round(volume * 100)}%</span>
              </div>
              <h4 className="text-xs font-black text-slate-800 mt-0.5">Intensidade do Alerta</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Ajuste a intensidade do som para não incomodar no escritório.
              </p>
            </div>

            <div className="space-y-2">
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={volume}
                onChange={(e) => handleChangeVolume(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[10px] font-bold text-slate-400 px-0.5">
                <button type="button" onClick={() => handleChangeVolume(0.3)} className="hover:text-slate-600 cursor-pointer">30% (Suave)</button>
                <button type="button" onClick={() => handleChangeVolume(0.7)} className="hover:text-slate-600 cursor-pointer">70% (Padrão)</button>
                <button type="button" onClick={() => handleChangeVolume(1.0)} className="hover:text-slate-600 cursor-pointer">100% (Máximo)</button>
              </div>
            </div>
          </div>
        </div>

        {/* Quadro Informativo de Gatilhos */}
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-blue-900 font-black text-xs">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span>Eventos Operacionais que Acionam o Alerta Sonoro</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
            <div className="flex items-start gap-2 bg-white/70 p-2.5 rounded-lg border border-blue-100/60">
              <Smartphone className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-extrabold text-slate-900 block">Técnico Inicia Atendimento</strong>
                <span className="text-[11px] text-slate-500">Disparado no momento exato em que o técnico clica em iniciar no tablet em campo.</span>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-white/70 p-2.5 rounded-lg border border-blue-100/60">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-extrabold text-slate-900 block">Conclusão de Manutenção</strong>
                <span className="text-[11px] text-slate-500">Disparado após coleta da assinatura do cliente e finalização da ordem de serviço.</span>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-white/70 p-2.5 rounded-lg border border-blue-100/60">
              <Bell className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-extrabold text-slate-900 block">Novos Chamados de Reparo</strong>
                <span className="text-[11px] text-slate-500">Abertura de novos chamados urgentes solicitados por gestores de clientes ou equipe.</span>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-white/70 p-2.5 rounded-lg border border-blue-100/60">
              <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-extrabold text-slate-900 block">Tarefas e Comunicações</strong>
                <span className="text-[11px] text-slate-500">Atribuições de tarefas prioritárias e novos comentários da equipe interna.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
