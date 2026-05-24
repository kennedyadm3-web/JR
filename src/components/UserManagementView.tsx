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
  Lock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { dataService } from '../services/dataService';
import { UserRole, Client } from '../types';

interface InternalUser {
  uid: string;
  email: string;
  displayName: string;
  role?: string;
  clientId?: string;
  lastLogin?: any;
  createdAt?: any;
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
  const [newRole, setNewRole] = useState<string>(UserRole.ASSISTANT);
  const [newClientId, setNewClientId] = useState('');
  const [clients, setClients] = useState<Client[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersResp, clientsData] = await Promise.all([
        fetch('/api/users?_t=' + Date.now(), { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } }),
        dataService.getClients()
      ]);
      
      const userData = await usersResp.json();
      if (usersResp.ok) {
        console.log("Loaded users:", userData);
        setUsers([...userData].sort((a: any, b: any) => {
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
          role: newRole,
          clientId: newRole === UserRole.MANAGER ? newClientId : undefined
        })
      });
      const data = await resp.json();
      if (resp.ok) {
        setMessage({ text: 'Usuário criado com sucesso!', type: 'success' });
        setShowAddForm(false);
        setNewUsername('');
        setNewPassword('');
        setNewName('');
        setNewRole(UserRole.ASSISTANT);
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
      if (resp.ok) {
        setMessage({ text: 'Usuário removido!', type: 'success' });
        loadData();
      } else {
        const data = await resp.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      setMessage({ text: 'Erro ao remover: ' + error.message, type: 'error' });
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

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex-1 overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400">
              <th className="px-6 py-4">Usuário</th>
              <th className="px-6 py-4">Cargo</th>
              <th className="px-6 py-4">Último Acesso</th>
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
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                      <UserIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{user.displayName || 'Sem nome'}</p>
                      <p className="text-xs text-gray-500">
                        {user.email?.endsWith('@lefrio.com') ? user.email.split('@')[0] : user.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                    user.role === UserRole.ADMIN ? "bg-purple-50 text-purple-600" : 
                    user.role === UserRole.MANAGER ? "bg-amber-50 text-amber-600" :
                    user.role === UserRole.SUPPORT ? "bg-emerald-50 text-emerald-600" :
                    "bg-blue-50 text-blue-600"
                  )}>
                    {user.role === UserRole.ADMIN ? 'Administrador' : 
                     user.role === UserRole.MANAGER ? `Gestor: ${clients.find(c => c.id === user.clientId)?.name || 'Cliente'}` : 
                     user.role === UserRole.SUPPORT ? 'Atendimento' :
                     'Assistente'}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-gray-500 font-medium">
                  {formatFirestoreDate(user.lastLogin || user.updatedAt || user.createdAt)}
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteUser(user.uid);
                    }}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="Excluir Usuário"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Cargo / Acesso</label>
                <select
                  value={newRole}
                  onChange={(e) => {
                    setNewRole(e.target.value);
                    if (e.target.value !== UserRole.MANAGER) setNewClientId('');
                  }}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition-all"
                >
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
    </div>
  );
}
