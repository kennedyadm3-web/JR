/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  MapPin, 
  Calendar, 
  BarChart3, 
  ClipboardList, 
  CloudSnow,
  Wind,
  Settings,
  Menu,
  X,
  LogOut,
  User,
  Clock,
  Route,
  Shield,
  AlertCircle,
  Globe,
  Map as MapIcon
} from 'lucide-react';
import { cn } from './lib/utils';
import { auth, signIn, signInWithGoogle } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db as firestoreDb } from './lib/firebase';
import { UserProfile, UserRole } from './types';

// Views
import ScheduleView from './components/ScheduleView';
import RegistrationView from './components/RegistrationView';
import ReportsView from './components/ReportsView';
import TechDemandView from './components/TechDemandView';
import HistoryView from './components/HistoryView';
import RoutePlanningView from './components/RoutePlanningView';
import UserManagementView from './components/UserManagementView';
import ServiceCallsView from './components/ServiceCallsView';

const menuItems = [
  { id: 'schedule', label: 'Cronograma', icon: Calendar, roles: [UserRole.ADMIN, UserRole.ASSISTANT] },
  { id: 'calls', label: 'Chamados / Reparos', icon: AlertCircle, roles: [UserRole.ADMIN, UserRole.ASSISTANT, UserRole.MANAGER, UserRole.SUPPORT] },
  { id: 'routes', label: 'Rotas do Mês', icon: Route, roles: [UserRole.ADMIN, UserRole.ASSISTANT] },
  { id: 'demand', label: 'Demanda Técnica', icon: Users, roles: [UserRole.ADMIN, UserRole.ASSISTANT] },
  { id: 'reports', label: 'Relatórios', icon: BarChart3, roles: [UserRole.ADMIN, UserRole.SUPPORT] },
  { id: 'registration', label: 'Cadastros', icon: MapPin, roles: [UserRole.ADMIN] },
  { id: 'history', label: 'Histórico', icon: Clock, roles: [UserRole.ADMIN, UserRole.SUPPORT] },
  { id: 'users', label: 'Usuários', icon: Shield, roles: [UserRole.ADMIN] },
];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<string>('calls');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<any>(null);

  useEffect(() => {
    fetch('/api/admin-status').then(r => r.json()).then(setServerStatus).catch(console.error);
    
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        try {
          await fetch('/api/sync-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: u.uid,
              email: u.email,
              displayName: u.displayName
            })
          });

          const profileDoc = await getDoc(doc(firestoreDb, 'users', u.uid));
          if (profileDoc.exists()) {
            const data = profileDoc.data() as UserProfile;
            setProfile(data);
            
            // Initial view adjustment based on role
            const allowedIds = menuItems.filter(m => m.roles.includes(data.role)).map(m => m.id);
            if (!allowedIds.includes(activeView)) {
              setActiveView(allowedIds[0] || 'calls');
            }
          }
        } catch (err) {
          console.error('Error syncing/fetching profile:', err);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync active view if role changes or if somehow we get into an invalid state
  useEffect(() => {
    if (profile) {
      const allowedIds = menuItems.filter(m => m.roles.includes(profile.role)).map(m => m.id);
      if (!allowedIds.includes(activeView)) {
        setActiveView(allowedIds[0] || 'calls');
      }
    }
  }, [profile, activeView]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full"
        >
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Wind className="w-10 h-10 text-blue-600 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Le Frio - Gestão</h1>
          <p className="text-gray-600 mb-8 text-center text-sm font-medium">Soluções em Refrigeração e Climatização</p>
          
          {loginError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-sm animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="font-medium">{loginError}</p>
            </div>
          )}

          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              setLoginError(null);
              const formData = new FormData(e.currentTarget);
              const username = formData.get('username') as string;
              const pass = formData.get('password') as string;
              
              if (!username || !pass) return;

              setLoading(true);
              try {
                await signIn(username, pass);
              } catch (err: any) {
                setLoginError(err.message);
              } finally {
                setLoading(false);
              }
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Usuário</label>
              <input 
                name="username"
                type="text"
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                placeholder="Ex: jsilva"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Senha</label>
              <input 
                name="password"
                type="password"
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg hover:shadow-blue-200/50 flex items-center justify-center gap-2 mb-4"
            >
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <User className="w-5 h-5" />}
              Acessar Sistema
            </button>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100"></div>
              </div>
              <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-widest text-gray-400 bg-white px-4">
                Ou continue com
              </div>
            </div>

            <button 
              type="button"
              onClick={async () => {
                setLoading(true);
                setLoginError(null);
                try {
                  await signInWithGoogle();
                } catch (err: any) {
                  setLoginError('Falha ao entrar com Google: ' + err.message);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <Globe className="w-5 h-5 text-red-500" />
              Google Login
            </button>
          </form>

          {serverStatus && (
            <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", serverStatus.exists ? "bg-emerald-500" : "bg-red-500")} />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Status do Servidor: {serverStatus.exists ? "Conectado" : "Erro"}
                </span>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  const filteredMenuItems = menuItems.filter(item => 
    !profile || item.roles.includes(profile.role)
  );

  return (
    <div className="flex h-screen bg-[#F8F9FA] overflow-hidden print:overflow-visible font-sans">
      {/* Sidebar */}
      <div 
        className={cn(
          "bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden transition-all duration-300 print:hidden",
          sidebarOpen ? "w-[260px]" : "w-0"
        )}
      >
        <div className="p-6 flex items-center gap-3 border-b border-gray-100">
          <div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-200">
            <Wind className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-xl text-gray-900 leading-none">Le Frio</span>
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">Refrigeração</span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {filteredMenuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeView === item.id 
                ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm' 
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={() => auth.signOut()}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Sair</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 print:overflow-visible overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 print:hidden">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <h2 className="text-lg font-semibold text-gray-900 capitalize">
              {menuItems.find(m => m.id === activeView)?.label || 'Sistema'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-gray-900">{profile?.name || user?.displayName}</p>
              <div className="flex items-center justify-end gap-1">
                <span className={cn(
                  "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full",
                  profile?.role === UserRole.ADMIN ? "bg-purple-100 text-purple-600" :
                  profile?.role === UserRole.MANAGER ? "bg-amber-100 text-amber-600" :
                  profile?.role === UserRole.SUPPORT ? "bg-emerald-100 text-emerald-600" :
                  "bg-blue-100 text-blue-600"
                )}>
                  {profile?.role === UserRole.ADMIN ? 'Administrador' : 
                   profile?.role === UserRole.ASSISTANT ? 'Assistente' : 
                   profile?.role === UserRole.SUPPORT ? 'Atendimento' : 
                   profile?.role === UserRole.MANAGER ? 'Gestor' : '...'}
                </span>
                <p className="text-[10px] text-gray-500">
                  {user?.email?.endsWith('@lefrio.com') ? user.email.split('@')[0] : user?.email}
                </p>
              </div>
            </div>
            {user?.photoURL ? (
              <img src={user.photoURL} alt="User" className="w-9 h-9 rounded-full border border-gray-200" />
            ) : (
              <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-gray-400" />
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 print:overflow-visible print:p-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full print:h-auto print:overflow-visible"
            >
              {activeView === 'schedule' && <ScheduleView managerClientId={profile?.clientId} />}
              {activeView === 'registration' && <RegistrationView />}
              {activeView === 'reports' && <ReportsView managerClientId={profile?.clientId} />}
              {activeView === 'demand' && <TechDemandView />}
              {activeView === 'history' && <HistoryView />}
              {activeView === 'routes' && <RoutePlanningView />}
              {activeView === 'users' && <UserManagementView />}
              {activeView === 'calls' && <ServiceCallsView managerClientId={profile?.clientId} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
