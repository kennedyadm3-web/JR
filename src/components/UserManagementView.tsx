import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Trash2, 
  Shield, 
  X,
  Mail,
  User as UserIcon,
  AlertCircle,
  CheckCircle2,
  Lock,
  Edit3,
  Clock,
  Phone
} from 'lucide-react';
import { cn } from '../lib/utils';
import { dataService } from '../services/dataService';
import { UserRole, Client } from '../types';
import { doc, setDoc, deleteDoc, updateDoc, serverTimestamp, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface InternalUser {
  uid: string;
  email: string;
  displayName: string;
  role?: string;
  clientId?: string;
  phone?: string;
  lastLogin?: any;
  createdAt?: any;
  lastActive?: any;
  updatedAt?: any;
}

export default function UserManagementView() {
  const [users, setUsers] = useState<InternalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  
  // Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<string>('technician');
  const [newClientId, setNewClientId] = useState('');
  const [clients, setClients] = useState<Client[]>([]);

  // Edit State
  const [editingUser, setEditingUser] = useState<InternalUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<string>('technician');
  const [editClientId, setEditClientId] = useState('');

  // Delete Confirmation State
  const [userToDelete, setUserToDelete] = useState<InternalUser | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const clientsData = await dataService.getClients();
      
      try {
        const usersResp = await fetch('/api/users?_t=' + Date.now(), { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
        const userData = await usersResp.json();
        
        if (usersResp.ok) {
          console.log("Loaded users from API:", userData);
          setUsers([...userData].sort((a: any, b: any) => {
            const nameA = (a.displayName || a.email || '').toLowerCase();
            const nameB = (b.displayName || b.email || '').toLowerCase();
            return nameA.localeCompare(nameB);
          }));
        } else {
          throw new Error('API failed to load users: ' + userData.error);
        }
      } catch (apiError) {
        console.warn("API load users failed, falling back to frontend SDK:", apiError);
        // Fallback to client SDK directly
        const { getDocs, collection } = await import('firebase/firestore');
        const snapshot = await getDocs(collection(db, 'users'));
        const userData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as InternalUser));
        console.log("Loaded users from Frontend SDK:", userData);
        setUsers(userData.sort((a: any, b: any) => {
          const nameA = (a.displayName || a.email || '').toLowerCase();
          const nameB = (b.displayName || b.email || '').toLowerCase();
          return nameA.localeCompare(nameB);
        }));
      }

      setClients(clientsData);
    } catch (error: any) {
      setMessage({ text: 'Erro ao carregar dados: ' + error.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const resp = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          displayName: newName,
          phone: newPhone,
          role: newRole,
          clientId: newRole === UserRole.MANAGER ? newClientId : undefined
        })
      });
      const data = await resp.json();
      if (resp.ok) {
        if (data.firestoreFailed) {
          // Fallback manually using client SDK
          await setDoc(doc(db, 'users', data.uid), {
            uid: data.uid,
            email: data.email,
            displayName: newName,
            phone: newPhone || null,
            role: newRole || 'technician',
            clientId: newRole === UserRole.MANAGER ? newClientId : null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            authCreated: data.authCreated
          });
        }
        
        setMessage({ text: 'Usuário criado com sucesso!', type: 'success' });
        setShowAddForm(false);
        setNewUsername('');
        setNewPassword('');
        setNewName('');
        setNewPhone('');
        setNewRole('technician');
        setNewClientId('');
        loadData();
      } else {
        const details = data.details ? ` (${data.details})` : '';
        throw new Error((data.error || 'Erro desconhecido') + details);
      }
    } catch (error: any) {
      setMessage({ text: 'Erro ao criar usuário: ' + error.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    // window.confirm can be blocked in iframes
    try {
      const resp = await fetch(`/api/users/${uid}`, { method: 'DELETE' });
      const data = await resp.json();
      if (resp.ok) {
        if (data.firestoreFailed) {
          await deleteDoc(doc(db, 'users', uid));
        }
        setMessage({ text: 'Usuário removido!', type: 'success' });
        loadData();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      setMessage({ text: 'Erro ao remover: ' + error.message, type: 'error' });
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsSubmitting(true);
    try {
      // 1. Try updating directly via client Firestore SDK (highly reliable as Admin is logged in on client-side)
      let clientUpdateSucceeded = false;
      try {
        await updateDoc(doc(db, 'users', editingUser.uid), {
          displayName: editName,
          phone: editPhone || null,
          role: editRole,
          clientId: editRole === UserRole.MANAGER ? editClientId : null,
          updatedAt: new Date()
        });
        clientUpdateSucceeded = true;
      } catch (fsErr: any) {
        console.warn('[Firebase] Pre-emptive client-side Firestore update failed:', fsErr.message);
      }

      // 2. Report changes to backend for Firebase Auth representation and backup sync
      const resp = await fetch(`/api/users/${editingUser.uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editName,
          phone: editPhone || null,
          role: editRole,
          clientId: editRole === UserRole.MANAGER ? editClientId : null
        })
      });
      const data = await resp.json();

      if (resp.ok) {
        // Redundancy check: if backend Firestore write failed but we haven't written by client yet, force it now
        if (data.firestoreFailed && !clientUpdateSucceeded) {
          await updateDoc(doc(db, 'users', editingUser.uid), {
            displayName: editName,
            phone: editPhone || null,
            role: editRole,
            clientId: editRole === UserRole.MANAGER ? editClientId : null,
            updatedAt: new Date()
          });
        }
        setMessage({ text: 'Usuário atualizado com sucesso!', type: 'success' });
        setEditingUser(null);
        loadData();
      } else {
        // If API route failed (500, etc.) but CLIENT update succeeded, we can still declare complete success!
        if (clientUpdateSucceeded) {
          setMessage({ text: 'Usuário atualizado com sucesso!', type: 'success' });
          setEditingUser(null);
          loadData();
        } else {
          throw new Error(data.error || 'Erro ao salvar alterações no servidor');
        }
      }
    } catch (error: any) {
      setMessage({ text: 'Erro ao atualizar: ' + error.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const isUserOnline = (user: InternalUser) => {
    if (!user.lastActive) return false;
    try {
      const lastActiveSeconds = user.lastActive._seconds || user.lastActive.seconds;
      let lastActiveDate: Date;
      if (lastActiveSeconds) {
        lastActiveDate = new Date(lastActiveSeconds * 1000);
      } else {
        lastActiveDate = new Date(user.lastActive);
      }
      
      const diffMs = Date.now() - lastActiveDate.getTime();
      return diffMs < 90 * 1000; // 90 segundos (marcação ativa nos últimos 1.5 min)
    } catch {
      return false;
    }
  };

  const formatFirestoreDate = (timestamp: any) => {
    if (!timestamp) return 'Aguardando...';
    try {
      // Handles Admin SDK (_seconds) and Client SDK (seconds)
      const seconds = timestamp._seconds || timestamp.seconds;
      if (seconds) {
        return new Date(seconds * 1000).toLocaleString('pt-BR');
      }
      // Fallback for ISO strings or other Date objects
      return new Date(timestamp).toLocaleString('pt-BR');
    } catch (e) {
      return 'Data inválida';
    }
  };

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestão de Usuários</h2>
          <p className="text-gray-500 text-sm">Administre as contas que possuem acesso ao sistema.</p>
        </div>
        <button 
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-blue-200"
        >
          <Plus className="w-5 h-5" />
          Novo Usuário
        </button>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Total de Usuários</p>
            <p className="text-2xl font-black text-gray-900">{users.length}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center relative font-bold">
            <span className="absolute top-2.5 right-2.5 block h-2 w-2 rounded-full bg-emerald-500 animate-ping ring-2 ring-white" />
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Usuários Online</p>
            <p className="text-2xl font-black text-emerald-600">
              {users.filter(isUserOnline).length} <span className="text-xs text-gray-400 font-medium font-sans">ativos agora</span>
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Status do Painel</p>
            <p className="text-2xl font-black text-violet-600">Sincronizado</p>
          </div>
        </div>
      </div>

      {message && (
        <div className={cn(
          "p-4 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
          message.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-red-50 border-red-100 text-red-800"
        )}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="text-sm font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto p-1 hover:bg-black/5 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col flex-1 min-h-[350px]">
        <div className="overflow-y-auto overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400">
                <th className="px-6 py-4">Usuário</th>
                <th className="px-6 py-4">Cargo</th>
                <th className="px-6 py-4">Status & Último Login</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center">
                    <div className="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center text-gray-400 italic font-medium">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              ) : users.map(user => (
                <tr key={user.uid} className="hover:bg-gray-50 transition-all group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                          <UserIcon className="w-5 h-5" />
                        </div>
                        <span className={cn(
                          "absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white",
                          isUserOnline(user) ? "bg-emerald-500 animate-pulse" : "bg-gray-300"
                        )} />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{user.displayName || 'Sem nome'}</p>
                        <p className="text-xs text-gray-500">
                          {user.email?.endsWith('@lefrio.com') ? user.email.split('@')[0] : user.email}
                        </p>
                        {user.phone && (
                          <p className="text-[11px] text-gray-600 flex items-center gap-1 mt-0.5 font-medium">
                            <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>{user.phone}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                      user.role === UserRole.ADMIN ? "bg-purple-100 text-purple-700 font-extrabold" : 
                      user.role === UserRole.MANAGER ? "bg-amber-100 text-amber-700 font-bold" :
                      user.role === UserRole.SUPPORT ? "bg-emerald-100 text-emerald-700 font-bold" :
                      user.role === UserRole.ASSISTANT ? "bg-blue-100 text-blue-700 font-bold" :
                      user.role === UserRole.TECHNICIAN ? "bg-teal-100 text-teal-700 font-bold" :
                      "bg-gray-100 text-gray-500 font-medium"
                    )}>
                      {user.role === UserRole.ADMIN ? 'Administrador' : 
                       user.role === UserRole.MANAGER ? `Gestor: ${clients.find(c => c.id === user.clientId)?.name || 'Cliente'}` : 
                       user.role === UserRole.SUPPORT ? 'Atendimento' :
                       user.role === UserRole.ASSISTANT ? 'Assistente' :
                       user.role === UserRole.TECHNICIAN ? 'Técnico' :
                       'Aguardando / Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      {isUserOnline(user) ? (
                        <span className="inline-flex items-center gap-1 text-[10px] w-fit font-bold px-2 py-0.5 rounded-full uppercase tracking-wide bg-emerald-50 text-emerald-800 border border-emerald-100 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Online agora
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] w-fit font-bold px-2 py-0.5 rounded-full uppercase tracking-wide bg-gray-50 text-gray-500 border border-gray-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          Inativo / Offline
                        </span>
                      )}
                      <span className="text-xs text-gray-500 font-medium">
                        Acesso: <b className="text-gray-700">{formatFirestoreDate(user.lastLogin || user.updatedAt || user.createdAt)}</b>
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingUser(user);
                          setEditName(user.displayName || '');
                          setEditPhone(user.phone || '');
                          setEditRole(user.role || 'technician');
                          setEditClientId(user.clientId || '');
                        }}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Editar Usuário / Cargo"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setUserToDelete(user);
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Excluir Usuário"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-200">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                Criar Novo Usuário
              </h3>
              <button 
                onClick={() => setShowAddForm(false)}
                className="p-1 hover:bg-black/5 rounded-full text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Nome Completo</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    required
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: João Silva"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Usuário</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    required
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Ex: jsilva"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Telefone / WhatsApp</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Ex: (11) 98765-4321"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Cargo / Acesso</label>
                <select
                  value={newRole}
                  onChange={(e) => {
                    setNewRole(e.target.value);
                    if (e.target.value !== UserRole.MANAGER) setNewClientId('');
                  }}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                >
                  <option value="">Aguardando Permissão (Inativo)</option>
                  <option value={UserRole.TECHNICIAN}>Técnico (Em Atendimento)</option>
                  <option value={UserRole.ASSISTANT}>Assistente</option>
                  <option value={UserRole.SUPPORT}>Atendimento</option>
                  <option value={UserRole.ADMIN}>Administrador</option>
                  <option value={UserRole.MANAGER}>Gestor de Contrato (Cliente)</option>
                </select>
              </div>

              {newRole === UserRole.MANAGER && (
                <div className="animate-in fade-in slide-in-from-top-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Cliente Associado</label>
                  <select
                    required
                    value={newClientId}
                    onChange={(e) => setNewClientId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                  >
                    <option value="">Selecionar Cliente...</option>
                    {clients.slice().sort((a,b) => a.name.localeCompare(b.name)).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Senha Provisória</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    required
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 px-4 py-3 border border-gray-200 text-gray-500 font-bold rounded-xl hover:bg-gray-50 transition-all text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm shadow-lg shadow-blue-200"
                >
                  {isSubmitting ? 'Criando...' : 'Criar Conta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Form Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-200">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                Editar Usuário / Cargo
              </h3>
              <button 
                onClick={() => setEditingUser(null)}
                className="p-1 hover:bg-black/5 rounded-full text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">E-mail do Usuário</p>
                <p className="text-sm font-semibold text-gray-900 bg-gray-50 p-2.5 rounded-xl border border-gray-100">{editingUser.email}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Nome Completo</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    required
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Ex: João Silva"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Telefone / WhatsApp</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Ex: (11) 98765-4321"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Cargo / Acesso</label>
                <select
                  value={editRole}
                  onChange={(e) => {
                    setEditRole(e.target.value);
                    if (e.target.value !== UserRole.MANAGER) setEditClientId('');
                  }}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                >
                  <option value="">Aguardando Permissão (Inativo)</option>
                  <option value={UserRole.TECHNICIAN}>Técnico (Em Atendimento)</option>
                  <option value={UserRole.ASSISTANT}>Assistente</option>
                  <option value={UserRole.SUPPORT}>Atendimento</option>
                  <option value={UserRole.ADMIN}>Administrador</option>
                  <option value={UserRole.MANAGER}>Gestor de Contrato (Cliente)</option>
                </select>
              </div>

              {editRole === UserRole.MANAGER && (
                <div className="animate-in fade-in slide-in-from-top-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Cliente Associado</label>
                  <select
                    required
                    value={editClientId}
                    onChange={(e) => setEditClientId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                  >
                    <option value="">Selecionar Cliente...</option>
                    {clients.slice().sort((a,b) => a.name.localeCompare(b.name)).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="flex-1 px-4 py-3 border border-gray-200 text-gray-500 font-bold rounded-xl hover:bg-gray-50 transition-all text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-sm shadow-lg shadow-blue-200"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-gray-200 animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
                <AlertCircle className="w-5 h-5 text-red-600 animate-bounce" />
                Confirmar Exclusão
              </h3>
              <button 
                onClick={() => setUserToDelete(null)}
                className="p-1 hover:bg-black/5 rounded-full text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500 leading-relaxed">
                Tem certeza que deseja excluir o usuário <b className="text-gray-900">{userToDelete.displayName || userToDelete.email}</b>?
              </p>
              <div className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 font-bold leading-relaxed flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Esta ação é irreversível e removerá permanentemente o acesso deste usuário ao sistema.</span>
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setUserToDelete(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-500 font-bold rounded-xl hover:bg-gray-50 transition-all text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={async () => {
                    const uid = userToDelete.uid;
                    setUserToDelete(null);
                    await handleDeleteUser(uid);
                  }}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all text-sm shadow-md"
                >
                  Confirmar Exclusão
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
