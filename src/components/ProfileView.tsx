import React, { useState, useEffect } from 'react';
import { UserProfile, NotificationPreferences, UserRole } from '../types';
import { dataService } from '../services/dataService';
import { soundService } from '../services/soundService';
import { User, Phone, Mail, Bell, Shield, Save, Loader2, CheckCircle2, AlertCircle, MessageSquare, CheckSquare, Paperclip, AppWindow, Volume2, VolumeX, Play } from 'lucide-react';
import { cn } from '../lib/utils';

interface ProfileViewProps {
  userProfile: UserProfile;
  onProfileUpdate: (updated: UserProfile) => void;
}

export default function ProfileView({ userProfile, onProfileUpdate }: ProfileViewProps) {
  const [name, setName] = useState(userProfile.name || '');
  const [phone, setPhone] = useState(userProfile.phone || '');
  const [notifyNewCall, setNotifyNewCall] = useState(userProfile.notificationPreferences?.notifyNewCall ?? true);
  const [notifyNewComment, setNotifyNewComment] = useState(userProfile.notificationPreferences?.notifyNewComment ?? true);
  const [notifyCallResolved, setNotifyCallResolved] = useState(userProfile.notificationPreferences?.notifyCallResolved ?? true);
  const [notifyTaskAssigned, setNotifyTaskAssigned] = useState(userProfile.notificationPreferences?.notifyTaskAssigned ?? true);
  const [notifyTaskComment, setNotifyTaskComment] = useState(userProfile.notificationPreferences?.notifyTaskComment ?? true);
  const [notifyTaskAttachment, setNotifyTaskAttachment] = useState(userProfile.notificationPreferences?.notifyTaskAttachment ?? true);
  const [notifyShowPopups, setNotifyShowPopups] = useState(userProfile.notificationPreferences?.notifyShowPopups ?? true);
  const [notifySoundEnabled, setNotifySoundEnabled] = useState<boolean>(() => {
    if (userProfile.notificationPreferences?.notifySoundEnabled !== undefined) {
      return userProfile.notificationPreferences.notifySoundEnabled;
    }
    return soundService.isSoundEnabled();
  });
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    setName(userProfile.name || '');
    setPhone(userProfile.phone || '');
    const prefs = userProfile.notificationPreferences || {
      notifyNewCall: true,
      notifyNewComment: true,
      notifyCallResolved: true,
      notifyTaskAssigned: true,
      notifyTaskComment: true,
      notifyTaskAttachment: true,
      notifyShowPopups: true,
      notifySoundEnabled: true
    };
    setNotifyNewCall(prefs.notifyNewCall ?? true);
    setNotifyNewComment(prefs.notifyNewComment ?? true);
    setNotifyCallResolved(prefs.notifyCallResolved ?? true);
    setNotifyTaskAssigned(prefs.notifyTaskAssigned ?? true);
    setNotifyTaskComment(prefs.notifyTaskComment ?? true);
    setNotifyTaskAttachment(prefs.notifyTaskAttachment ?? true);
    setNotifyShowPopups(prefs.notifyShowPopups ?? true);
    if (prefs.notifySoundEnabled !== undefined) {
      setNotifySoundEnabled(prefs.notifySoundEnabled);
    }
  }, [userProfile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setMessage({ text: 'O nome não pode ficar em branco.', type: 'error' });
      return;
    }

    setSaving(true);
    setMessage(null);

    const updatedPrefs: NotificationPreferences = {
      notifyNewCall,
      notifyNewComment,
      notifyCallResolved,
      notifyTaskAssigned,
      notifyTaskComment,
      notifyTaskAttachment,
      notifyShowPopups,
      notifySoundEnabled
    };

    // Sincroniza também no soundService local para efeito imediato
    soundService.setSoundEnabled(notifySoundEnabled);

    const updatedProfile: Partial<UserProfile> = {
      name: name.trim(),
      phone: phone.trim(),
      notificationPreferences: updatedPrefs
    };

    try {
      await dataService.updateUserProfile(userProfile.uid, updatedProfile);
      
      const fullUpdatedProfile: UserProfile = {
        ...userProfile,
        ...updatedProfile
      };

      onProfileUpdate(fullUpdatedProfile);
      setMessage({ text: 'Perfil e preferências de notificação salvos com sucesso!', type: 'success' });
      
      setTimeout(() => {
        setMessage(null);
      }, 5000);
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Erro ao salvar o perfil no servidor.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black text-gray-950 tracking-tight">Meu Perfil Personalizado</h1>
        <p className="text-gray-500 font-medium">Gerencie suas informações cadastrais e configure suas notificações sobre atividades do sistema.</p>
      </div>

      {message && (
        <div className={cn(
          "p-4 rounded-2xl border flex items-center gap-3 font-semibold text-sm shadow-sm animate-in fade-in slide-in-from-top-1",
          message.type === 'success' 
            ? "bg-emerald-50 border-emerald-100 text-emerald-800" 
            : "bg-red-50 border-red-100 text-red-800"
        )}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />}
          <p>{message.text}</p>
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Left Card: Avatar & Basic Meta */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col items-center text-center space-y-6">
          <div className="relative group">
            <div className="w-24 h-24 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-blue-100">
              {name ? name.substring(0, 2).toUpperCase() : userProfile.email.substring(0, 2).toUpperCase()}
            </div>
            <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all cursor-pointer">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-white">Foto da Conta</span>
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-black text-gray-900">{name || "Usuário"}</h2>
            <div className="flex items-center justify-center gap-1.5">
              <span className={cn(
                "text-[8px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border",
                userProfile.role === UserRole.ADMIN ? "bg-purple-50 text-purple-600 border-purple-100" :
                userProfile.role === UserRole.MANAGER ? "bg-amber-50 text-amber-600 border-amber-100" :
                userProfile.role === UserRole.SUPPORT ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                "bg-blue-50 text-blue-600 border-blue-100"
              )}>
                {userProfile.role === UserRole.ADMIN ? 'Administrador' : 
                 userProfile.role === UserRole.ASSISTANT ? 'Assistente' : 
                 userProfile.role === UserRole.SUPPORT ? 'Atendimento' : 
                 userProfile.role === UserRole.MANAGER ? 'Gestor' : 'Suporte'}
              </span>
            </div>
          </div>

          <div className="w-full pt-4 border-t border-gray-100 flex flex-col gap-2 text-left text-xs font-semibold text-gray-500">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="truncate">{userProfile.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-gray-400 shrink-0" />
              <span>ID: {userProfile.uid.substring(0, 8)}...</span>
            </div>
          </div>
        </div>

        {/* Right Cards: Inputs & Notification Prefs */}
        <div className="md:col-span-2 space-y-6">
          {/* Form inputs */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6">
            <h3 className="text-lg font-black text-gray-900 border-b border-gray-50 pb-3 flex items-center gap-2">
              <User className="text-blue-600 w-5 h-5" /> Informações Pessoais
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Seu Nome Completo</label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-4 top-3.5" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm font-semibold text-gray-800"
                    placeholder="Nome Completo"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Telefone de Contato</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-gray-400 absolute left-4 top-3.5" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm font-semibold text-gray-800"
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Notification settings */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6">
            <h3 className="text-lg font-black text-gray-900 border-b border-gray-50 pb-3 flex items-center gap-2">
              <Bell className="text-blue-600 w-5 h-5" /> Preferências de Notificação
            </h3>
            <p className="text-xs text-gray-500 font-medium leading-relaxed">
              Marque abaixo as atualizações sobre chamados e reparos sobre as quais você deseja ser notificado em tempo real diretamente na barra superior do sistema.
            </p>

            <div className="space-y-4">
              {/* Option 1 */}
              <label className="flex items-start gap-4 p-4 rounded-2xl hover:bg-gray-50/50 border border-gray-100 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={notifyNewCall}
                  onChange={(e) => setNotifyNewCall(e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-bold text-gray-950">Abertura de Chamados</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-normal font-medium">Ser notificado em tempo real a cada novo chamado técnico de reparo aberto por clientes ou equipe.</p>
                </div>
              </label>

              {/* Option 2 */}
              <label className="flex items-start gap-4 p-4 rounded-2xl hover:bg-gray-50/50 border border-gray-100 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={notifyNewComment}
                  onChange={(e) => setNotifyNewComment(e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-bold text-gray-950">Comentários e Interações</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-normal font-medium">Ser notificado quando um colega de equipe adicionar uma nova informação ou comentário em qualquer chamado.</p>
                </div>
              </label>

              {/* Option 3 */}
              <label className="flex items-start gap-4 p-4 rounded-2xl hover:bg-gray-50/50 border border-gray-100 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={notifyCallResolved}
                  onChange={(e) => setNotifyCallResolved(e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-bold text-gray-950">Finalização de Chamados</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-normal font-medium">Receber alerta quando a manutenção for devidamente finalizada ou o atendimento resolvido por outro técnico.</p>
                </div>
              </label>

              {/* Option 4: Task Assigned */}
              <label className="flex items-start gap-4 p-4 rounded-2xl hover:bg-gray-50/50 border border-gray-100 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={notifyTaskAssigned}
                  onChange={(e) => setNotifyTaskAssigned(e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-bold text-gray-950">Atribuição de Tarefas</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-normal font-medium">Ser notificado em tempo real quando uma tarefa de equipe for atribuída ou marcada para você.</p>
                </div>
              </label>

              {/* Option 5: Task Comment */}
              <label className="flex items-start gap-4 p-4 rounded-2xl hover:bg-gray-50/50 border border-gray-100 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={notifyTaskComment}
                  onChange={(e) => setNotifyTaskComment(e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-bold text-gray-950">Discussão em Tarefas</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-normal font-medium">Ser notificado quando outros membros enviarem feedbacks ou comentários em tarefas que você está envolvido.</p>
                </div>
              </label>

              {/* Option 6: Task Attachment */}
              <label className="flex items-start gap-4 p-4 rounded-2xl hover:bg-gray-50/50 border border-gray-100 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={notifyTaskAttachment}
                  onChange={(e) => setNotifyTaskAttachment(e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Paperclip className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-bold text-gray-950">Anexos em Tarefas</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-normal font-medium">Receber alerta quando novos arquivos, links ou documentos importantes forem anexados a tarefas em que participa.</p>
                </div>
              </label>

              {/* Option 7: Popup Notifications */}
              <label className="flex items-start gap-4 p-4 rounded-2xl hover:bg-gray-50/50 border border-gray-100 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={notifyShowPopups}
                  onChange={(e) => setNotifyShowPopups(e.target.checked)}
                  className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <AppWindow className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-bold text-gray-950">Exibir Notificações em Pop-ups</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-normal font-medium">Exibir uma janela Pop-up (modal de alerta) no canto da tela em tempo real sempre que novas notificações chegarem.</p>
                </div>
              </label>

              {/* Option 8: Sound Alert Notification */}
              <div className="p-4 rounded-2xl bg-blue-50/40 border border-blue-100/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
                <div className="flex items-start gap-3.5">
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                    notifySoundEnabled ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"
                  )}>
                    {notifySoundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-950">Alerta Sonoro de Notificação</span>
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded border",
                        notifySoundEnabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"
                      )}>
                        {notifySoundEnabled ? 'Ativado' : 'Silencioso'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 leading-normal font-medium">
                      Toca um tom de sino suave quando chegarem notificações de técnicos (ex: início de atendimento), novos chamados ou tarefas.
                    </p>
                    <div className="pt-1">
                      <button
                        type="button"
                        id="btn-test-profile-sound"
                        onClick={() => {
                          setIsPlayingTest(true);
                          soundService.testNotificationSound();
                          setTimeout(() => setIsPlayingTest(false), 500);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-[11px] font-bold transition cursor-pointer shadow-3xs"
                      >
                        <Play className={cn("w-3 h-3", isPlayingTest && "animate-spin text-blue-600")} />
                        <span>{isPlayingTest ? 'Ouvindo...' : 'Testar Som'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center self-end sm:self-center">
                  <button
                    type="button"
                    id="toggle-profile-sound"
                    onClick={() => {
                      const next = !notifySoundEnabled;
                      setNotifySoundEnabled(next);
                      soundService.setSoundEnabled(next);
                      if (next) soundService.testNotificationSound();
                    }}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      notifySoundEnabled ? "bg-blue-600" : "bg-gray-200"
                    )}
                    title={notifySoundEnabled ? "Silenciar notificações" : "Habilitar som"}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
                        notifySoundEnabled ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black uppercase tracking-widest text-xs px-8 py-3.5 rounded-2xl transition-all shadow-xl shadow-blue-100 flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Perfil e Preferências
            </button>
          </div>
        </div>

      </form>
    </div>
  );
}
