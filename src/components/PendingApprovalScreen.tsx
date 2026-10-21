import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Shield, Clock, AlertCircle, LogOut, RefreshCw, CheckCircle2, User, Wind, Lock } from 'lucide-react';
import { UserProfile, UserRole } from '../types';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db as firestoreDb } from '../lib/firebase';
import { auth } from '../lib/firebase';

interface PendingApprovalScreenProps {
  profile: UserProfile;
  onApproved: (updatedProfile: UserProfile) => void;
  onLogout: () => void;
}

export default function PendingApprovalScreen({
  profile,
  onApproved,
  onLogout
}: PendingApprovalScreenProps) {
  const [checking, setChecking] = useState(false);
  const [justApproved, setJustApproved] = useState(false);

  // Escuta em tempo real no documento do usuário em 'users/{uid}'
  useEffect(() => {
    if (!profile?.uid) return;

    const userDocRef = doc(firestoreDb, 'users', profile.uid);
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        // Se foi aprovado ou se o status mudou para ativo/admin
        if (data.isApproved === true || data.status === 'active' || data.role === UserRole.ADMIN) {
          setJustApproved(true);
          setTimeout(() => {
            onApproved({
              ...profile,
              ...data,
              isApproved: true
            } as UserProfile);
          }, 1200);
        }
      }
    }, (error) => {
      console.warn('Erro na escuta em tempo real da aprovação:', error);
    });

    return () => unsubscribe();
  }, [profile?.uid, onApproved]);

  const handleManualCheck = async () => {
    if (!profile?.uid) return;
    setChecking(true);
    try {
      const userDocRef = doc(firestoreDb, 'users', profile.uid);
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.isApproved === true || data.status === 'active' || data.role === UserRole.ADMIN) {
          setJustApproved(true);
          setTimeout(() => {
            onApproved({
              ...profile,
              ...data,
              isApproved: true
            } as UserProfile);
          }, 1000);
        } else {
          // Ainda pendente
          setChecking(false);
        }
      } else {
        setChecking(false);
      }
    } catch (e) {
      console.error(e);
      setChecking(false);
    }
  };

  const getRoleLabel = (role?: UserRole) => {
    switch (role) {
      case UserRole.ADMIN: return 'Administrador';
      case UserRole.ASSISTANT: return 'Assistente';
      case UserRole.MANAGER: return 'Gestor de Contrato';
      case UserRole.SUPPORT: return 'Atendimento / Suporte';
      case UserRole.TECHNICIAN: return 'Técnico Operacional';
      default: return 'Usuário';
    }
  };

  return (
    <div className="min-h-screen w-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl backdrop-blur-xl relative z-10 text-white"
      >
        {/* Header Branding */}
        <div className="flex items-center justify-between border-b border-slate-700/60 pb-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 border border-blue-500/40 rounded-xl flex items-center justify-center text-blue-400">
              <Wind className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-wide">Le Frio - Gestão</h1>
              <p className="text-[11px] text-slate-400 font-medium">Controle de Acesso & Segurança</p>
            </div>
          </div>
          <span className="text-[10px] uppercase font-mono tracking-widest px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            Barreira de Entrada
          </span>
        </div>

        {justApproved ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-8 space-y-4"
          >
            <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-950">
              <CheckCircle2 className="w-10 h-10 animate-bounce" />
            </div>
            <h2 className="text-2xl font-bold text-emerald-400">Acesso Aprovado!</h2>
            <p className="text-slate-300 text-sm max-w-xs mx-auto">
              Seu cadastro foi liberado pelo Administrador. Redirecionando para o sistema...
            </p>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {/* Status Alert Banner */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3 text-amber-200">
              <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400 shrink-0 mt-0.5">
                <Lock className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-amber-300">Primeiro Acesso - Aguardando Liberação</h3>
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  Seu cadastro foi localizado com sucesso no banco de dados, mas este é o seu primeiro acesso ao sistema. Por medidas de segurança, o acesso aguarda aprovação formal de um <b>Administrador</b>.
                </p>
              </div>
            </div>

            {/* Profile Detail Card */}
            <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl p-4 space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
                Dados da Conta Localizada
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-slate-300 font-bold shrink-0">
                  <User className="w-6 h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{profile.name || 'Usuário Sem Nome'}</p>
                  <p className="text-xs text-slate-400 truncate">{profile.email}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {getRoleLabel(profile.role)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ID: {profile.uid ? `${profile.uid.slice(0, 8)}...` : 'Pendente'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Monitor Animation */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-3 h-3 bg-amber-500 rounded-full animate-ping" />
                  <div className="w-3 h-3 bg-amber-500 rounded-full absolute inset-0" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">Verificação Automática Ativa</p>
                  <p className="text-[11px] text-slate-400">Escutando liberação do administrador em tempo real...</p>
                </div>
              </div>
              <Clock className="w-5 h-5 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={handleManualCheck}
                disabled={checking}
                className="flex-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-950 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Verificando...' : 'Verificar Aprovação'}
              </button>

              <button
                onClick={onLogout}
                className="bg-slate-700/80 hover:bg-red-600/80 text-slate-200 hover:text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all border border-slate-600/60"
              >
                <LogOut className="w-4 h-4" />
                Sair do Sistema
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
