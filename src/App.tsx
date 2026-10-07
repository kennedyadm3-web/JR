/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
  Map as MapIcon,
  Bell,
  CheckCircle2,
  MessageSquare,
  Trash2,
  Check,
  Briefcase,
  Paperclip,
  ClipboardCheck,
  DollarSign,
  ExternalLink,
  TrendingUp,
  Receipt,
  FileSpreadsheet
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { cn } from './lib/utils';
import { auth, signIn, signInWithGoogle } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { db as firestoreDb } from './lib/firebase';
import { UserProfile, UserRole, NotificationItem } from './types';
import { dataService } from './services/dataService';
import { soundService } from './services/soundService';

// Views
import ScheduleView from './components/ScheduleView';
import RegistrationView from './components/RegistrationView';
import ReportsView from './components/ReportsView';
import FinancialView from './components/FinancialView';
import TechDemandView from './components/TechDemandView';
import RoutePlanningView from './components/RoutePlanningView';
import ServiceCallsView from './components/ServiceCallsView';
import ServiceOrdersView from './components/ServiceOrdersView';
import ProfileView from './components/ProfileView';
import ContractsView from './components/ContractsView';
import SettingsView from './components/SettingsView';
import TechProductionView from './components/TechProductionView';
import TechMobileExpenseView from './components/TechMobileExpenseView';

const menuItems = [
  { id: 'demand', label: 'Demanda Técnica', icon: Users, roles: [UserRole.ADMIN, UserRole.ASSISTANT, UserRole.TECHNICIAN] },
  { id: 'orders', label: 'Ordens de Serviço', icon: ClipboardList, roles: [UserRole.ADMIN, UserRole.ASSISTANT, UserRole.MANAGER, UserRole.SUPPORT, UserRole.TECHNICIAN] },
  { id: 'production', label: 'Minha Produção', icon: TrendingUp, roles: [UserRole.TECHNICIAN] },
  { id: 'expenses', label: 'Lançar Despesa', icon: Receipt, roles: [UserRole.TECHNICIAN] },
  { id: 'schedule', label: 'Cronograma', icon: Calendar, roles: [UserRole.ADMIN, UserRole.ASSISTANT] },
  { id: 'calls', label: 'Chamados / Reparos', icon: AlertCircle, roles: [UserRole.ADMIN, UserRole.ASSISTANT, UserRole.MANAGER, UserRole.SUPPORT] },
  { id: 'routes', label: 'Rotas de Viagem', icon: Route, roles: [UserRole.ADMIN, UserRole.ASSISTANT] },
  { id: 'reports', label: 'Relatórios', icon: BarChart3, roles: [UserRole.ADMIN, UserRole.SUPPORT, UserRole.ASSISTANT] },
  { id: 'finance', label: 'Financeiro', icon: DollarSign, roles: [UserRole.ADMIN, UserRole.ASSISTANT, UserRole.MANAGER, UserRole.SUPPORT] },
  { id: 'contracts', label: 'Contratos', icon: Briefcase, roles: [UserRole.ADMIN, UserRole.ASSISTANT, UserRole.MANAGER, UserRole.SUPPORT] },
  { id: 'registration', label: 'Cadastros', icon: MapPin, roles: [UserRole.ADMIN] },
  { id: 'settings', label: 'Configurações', icon: Settings, roles: [UserRole.ADMIN, UserRole.SUPPORT] },
  { id: 'profile', label: 'Meu Perfil', icon: User, roles: [UserRole.ADMIN, UserRole.ASSISTANT, UserRole.MANAGER, UserRole.SUPPORT, UserRole.TECHNICIAN] },
];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lefrio_active_view');
      if (saved) return saved;
    }
    return 'demand';
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth > 1280;
    }
    return false;
  });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<any>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedCallId, setSelectedCallId] = useState<string | undefined>(undefined);
  const [activePopup, setActivePopup] = useState<NotificationItem | null>(null);

  // Auto-dismiss do activePopup após 8 segundos para não travar a navegação e sumir sozinho
  useEffect(() => {
    if (activePopup) {
      const timer = setTimeout(() => {
        setActivePopup(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [activePopup]);

  // Carrega e atualiza notificações do usuário em tempo real por assinatura (otimizado!)
  useEffect(() => {
    if (!profile) return;
    
    const unsubscribe = dataService.subscribeNotifications(profile.uid, (list) => {
      setNotifications(prev => {
        // Se já havia notificações antes, verifica se chegaram novas não lidas
        if (prev.length > 0) {
          const prevIds = new Set(prev.map(n => n.id));
          const newUnreads = list.filter(n => !n.read && !prevIds.has(n.id));
          
          if (newUnreads.length > 0) {
            // Toca o som de alerta da notificação se habilitado
            const soundPref = profile.notificationPreferences?.notifySoundEnabled;
            const isSoundActive = soundPref !== undefined ? soundPref : soundService.isSoundEnabled();
            
            if (isSoundActive) {
              const volumePref = profile.notificationPreferences?.notificationSoundVolume;
              soundService.testNotificationSound(volumePref);
            }

            const wantsPopups = profile.notificationPreferences?.notifyShowPopups ?? true;
            if (wantsPopups) {
              setActivePopup(newUnreads[0]);
            }
          }
        }
        return list;
      });
    });

    return () => unsubscribe();
  }, [profile]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await dataService.markNotificationAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await dataService.deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const promises = notifications.filter(n => !n.read).map(n => dataService.markNotificationAsRead(n.id));
      await Promise.all(promises);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const handleExportNotificationsExcel = async () => {
    try {
      setIsExportingExcel(true);

      const now = new Date();
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      tenDaysAgo.setHours(0, 0, 0, 0);

      // 1. Obter lista abrangente de notificações (mescla estado com Firestore)
      let allNotifs: NotificationItem[] = [...notifications];
      if (profile?.uid) {
        try {
          const q = query(
            collection(firestoreDb, 'notifications'),
            where('userId', '==', profile.uid)
          );
          const snap = await getDocs(q);
          const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as NotificationItem));
          const map = new Map<string, NotificationItem>();
          allNotifs.forEach(n => map.set(n.id, n));
          fetched.forEach(n => map.set(n.id, n));
          allNotifs = Array.from(map.values());
        } catch (e) {
          console.warn('Erro ao consultar Firestore para exportação, usando notificações em memória:', e);
        }
      }

      // 2. Filtrar apenas notificações dos últimos 10 dias
      const filtered = allNotifs.filter(n => {
        let d: Date | null = null;
        if (n.createdAt?.toDate) {
          d = n.createdAt.toDate();
        } else if (n.createdAt?.seconds) {
          d = new Date(n.createdAt.seconds * 1000);
        } else if (n.createdAt instanceof Date) {
          d = n.createdAt;
        } else if (typeof n.createdAt === 'string' || typeof n.createdAt === 'number') {
          d = new Date(n.createdAt);
        }
        return d !== null && !isNaN(d.getTime()) && d >= tenDaysAgo;
      });

      // 3. Ordenar da mais recente para a mais antiga
      filtered.sort((a, b) => {
        const getMs = (item: NotificationItem) => {
          if (item.createdAt?.toDate) return item.createdAt.toDate().getTime();
          if (item.createdAt?.seconds) return item.createdAt.seconds * 1000;
          if (item.createdAt instanceof Date) return item.createdAt.getTime();
          if (item.createdAt) return new Date(item.createdAt).getTime();
          return 0;
        };
        return getMs(b) - getMs(a);
      });

      if (filtered.length === 0) {
        alert('Nenhuma notificação encontrada nos últimos 10 dias.');
        return;
      }

      // 4. Criar workbook do Excel
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Sistema Lefrio';
      workbook.created = now;

      const worksheet = workbook.addWorksheet('Notificações (10 dias)');
      worksheet.views = [{ showGridLines: true }];

      // Colunas: DATA, TECNICO, TIPO, HORA, CONTEUDO
      worksheet.columns = [
        { key: 'data', width: 14 },
        { key: 'tecnico', width: 22 },
        { key: 'tipo', width: 26 },
        { key: 'hora', width: 12 },
        { key: 'conteudo', width: 85 }
      ];

      // Linha 1: Título Institucional
      worksheet.mergeCells('A1:E1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'RELATÓRIO DE NOTIFICAÇÕES (ÚLTIMOS 10 DIAS)';
      titleCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' }
      };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 28;

      // Linha 2: Resumo do período
      worksheet.mergeCells('A2:E2');
      const subCell = worksheet.getCell('A2');
      const startStr = tenDaysAgo.toLocaleDateString('pt-BR');
      const endStr = now.toLocaleDateString('pt-BR');
      subCell.value = `Período: ${startStr} a ${endStr} | Total de Notificações: ${filtered.length} | Exportado em: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      subCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF334155' } };
      subCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' }
      };
      subCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(2).height = 20;

      // Linha 3: Cabeçalhos oficiais solicitados: "DATA", "TECNICO", "TIPO", "HORA", "CONTEUDO"
      const headerRow = worksheet.getRow(3);
      headerRow.values = ['DATA', 'TECNICO', 'TIPO', 'HORA', 'CONTEUDO'];
      headerRow.height = 24;

      ['A3', 'B3', 'C3', 'D3', 'E3'].forEach(ref => {
        const cell = worksheet.getCell(ref);
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0D9488' }
        };
        cell.alignment = {
          horizontal: ref === 'E3' ? 'left' : 'center',
          vertical: 'middle'
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF0F766E' } },
          bottom: { style: 'medium', color: { argb: 'FF042F2E' } },
          left: { style: 'thin', color: { argb: 'FF0F766E' } },
          right: { style: 'thin', color: { argb: 'FF0F766E' } }
        };
      });

      // Funções auxiliares de extração
      const extractTechnician = (notif: NotificationItem): string => {
        if (notif.title && notif.title.includes(':')) {
          const parts = notif.title.split(':');
          if (parts[1]?.trim()) {
            return parts[1].trim().toUpperCase();
          }
        }
        if (notif.content) {
          const m = notif.content.match(/O técnico\s+([A-Za-zÀ-ÖØ-öø-ÿ\s]+?)\s+(iniciou|finalizou|concluiu)/i);
          if (m && m[1]) return m[1].trim().toUpperCase();
        }
        if ((notif as any).technicianName) return String((notif as any).technicianName).toUpperCase();
        if ((notif as any).technician) return String((notif as any).technician).toUpperCase();
        return '-';
      };

      const getTipoLabel = (notif: NotificationItem): string => {
        const title = (notif.title || '').toLowerCase();
        const content = (notif.content || '').toLowerCase();
        if (notif.type === 'tech_start' || title.includes('início de atendimento') || content.includes('iniciou o atendimento')) {
          return 'Início de Atendimento';
        }
        if (notif.type === 'tech_finish' || title.includes('atendimento concluído') || title.includes('fim de atendimento') || content.includes('finalizou o atendimento') || content.includes('concluiu o atendimento')) {
          return 'Final de Atendimento';
        }
        if (notif.type === 'new_call') return 'Novo Chamado';
        if (notif.type === 'new_comment') return 'Novo Comentário';
        if (notif.type === 'call_resolved') return 'Chamado Resolvido';
        if (notif.type === 'task_assigned') return 'Tarefa Atribuída';
        if (notif.type === 'task_comment') return 'Comentário em Tarefa';
        if (notif.type === 'task_attachment') return 'Anexo em Tarefa';
        return notif.title || 'Geral';
      };

      // 5. Linhas de dados
      let rowIdx = 4;
      filtered.forEach((notif, index) => {
        let dateObj: Date | null = null;
        if (notif.createdAt?.toDate) {
          dateObj = notif.createdAt.toDate();
        } else if (notif.createdAt?.seconds) {
          dateObj = new Date(notif.createdAt.seconds * 1000);
        } else if (notif.createdAt instanceof Date) {
          dateObj = notif.createdAt;
        } else if (notif.createdAt) {
          dateObj = new Date(notif.createdAt);
        }

        const dateStr = dateObj ? dateObj.toLocaleDateString('pt-BR') : '-';
        const timeStr = dateObj ? dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
        const techStr = extractTechnician(notif);
        const tipoStr = getTipoLabel(notif);
        const contentStr = notif.content || notif.title || '-';

        const dataRow = worksheet.getRow(rowIdx);
        dataRow.values = [dateStr, techStr, tipoStr, timeStr, contentStr];
        dataRow.height = 22;

        const isEven = index % 2 === 0;
        const bgArgb = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

        ['A', 'B', 'C', 'D', 'E'].forEach((col) => {
          const cell = worksheet.getCell(`${col}${rowIdx}`);
          cell.font = {
            name: 'Arial',
            size: 9.5,
            bold: col === 'B' || col === 'C',
            color: { argb: 'FF1F2937' }
          };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: bgArgb }
          };
          cell.alignment = {
            horizontal: col === 'E' ? 'left' : 'center',
            vertical: 'middle',
            wrapText: col === 'E'
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };

          if (col === 'C') {
            if (tipoStr === 'Início de Atendimento') {
              cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF1E40AF' } };
            } else if (tipoStr === 'Final de Atendimento') {
              cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF065F46' } };
            }
          }
        });

        rowIdx++;
      });

      // 6. Gerar buffer e download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.id = 'lnk-download-notifications-excel';
      link.href = downloadUrl;
      const formattedDate = now.toISOString().slice(0, 10);
      link.download = `Relatorio_Notificacoes_10_Dias_${formattedDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      console.error('Erro ao exportar notificações para Excel:', err);
      alert('Erro ao gerar relatório de notificações em Excel: ' + (err?.message || 'Tente novamente.'));
    } finally {
      setIsExportingExcel(false);
    }
  };

  useEffect(() => {
    fetch('/api/admin-status').then(r => r.json()).then(setServerStatus).catch(console.error);
    
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        try {
          let syncedProfile: UserProfile | null = null;
          let notRegistered = false;
          let errorMessage = "";

          // 1. Double check / sync with server first (best-effort, handles server logging or stats)
          try {
            const syncResp = await fetch('/api/sync-user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                uid: u.uid,
                email: u.email,
                displayName: u.displayName
              })
            });

            if (syncResp.ok) {
              const syncData = await syncResp.json();
              if (syncData.success && syncData.profile) {
                syncedProfile = syncData.profile as UserProfile;
              }
            } else if (syncResp.status === 403) {
              const syncData = await syncResp.json();
              if (syncData.notRegistered) {
                notRegistered = true;
                errorMessage = syncData.error || "Acesso recusado. Seu e-mail não está cadastrado.";
              }
            }
          } catch (err) {
            console.warn('[Firebase] Server-side sync call failed/skipped:', err);
          }

          // 2. Client-side Firestore verification & Migration (fully authoritative, immune to server IAM limit)
          const clientProfileDocRef = doc(firestoreDb, 'users', u.uid);
          let clientProfileSnap = await getDoc(clientProfileDocRef);

          if (clientProfileSnap.exists()) {
            syncedProfile = clientProfileSnap.data() as UserProfile;
            notRegistered = false; // Override any server 403 blocks because they physically exist in db!
          } else {
            // Find if there is a match by email (pre-registered user)
            const email = u.email || "";
            const normalizedEmail = email.trim().toLowerCase();
            const isAdmin = ['kennedy.adm3@gmail.com', 'kennedy2026@lefrio.com', 'admin@preventivas.com', 'admin@lefrio.com'].includes(normalizedEmail);

            if (isAdmin) {
              // Automatic profile creation for hardcoded admins
              const newProfile = {
                uid: u.uid,
                email: email,
                name: u.displayName || email.split('@')[0] || "Administrador",
                role: UserRole.ADMIN,
                clientId: null,
                createdAt: new Date(),
                updatedAt: new Date()
              };

              await setDoc(clientProfileDocRef, newProfile);
              syncedProfile = newProfile as any;
              notRegistered = false;
              console.log('[Firebase] Client-side admin profile auto-created:', email);
            } else if (email) {
              // Search users for a pre-registered entry matching this email
              try {
                const usersCollection = collection(firestoreDb, "users");
                const q = query(usersCollection, where("email", "==", email));
                const qSnap = await getDocs(q);

                let preRegisteredDoc: any = null;
                if (!qSnap.empty) {
                  preRegisteredDoc = qSnap.docs[0];
                } else {
                  // Fallback case-insensitive search by pulling all user documents (safest fallback)
                  const allDocs = await getDocs(usersCollection);
                  for (const d of allDocs.docs) {
                    const data = d.data();
                    if (data && data.email && data.email.trim().toLowerCase() === normalizedEmail) {
                      preRegisteredDoc = d;
                      break;
                    }
                  }
                }

                if (preRegisteredDoc) {
                  const oldData = preRegisteredDoc.data();
                  const newProfile = {
                    ...oldData,
                    uid: u.uid,
                    name: u.displayName || oldData.name || oldData.displayName || email.split('@')[0] || "Usuário",
                    updatedAt: new Date()
                  };

                  // Write the migrated document under their actual UID
                  await setDoc(clientProfileDocRef, newProfile);

                  // Delete the temporary pre-registered doc if the IDs differ
                  if (preRegisteredDoc.id !== u.uid) {
                    await deleteDoc(preRegisteredDoc.ref);
                  }

                  syncedProfile = newProfile as any;
                  notRegistered = false;
                  console.log('[Firebase] Pre-registered profile migrated to UID:', u.uid);
                } else {
                  // Not pre-registered and not hardcoded admin -> refuse entry!
                  notRegistered = true;
                  errorMessage = "Acesso recusado. Seu e-mail não está cadastrado no sistema. Peça a um administrador para realizar seu cadastro.";
                }
              } catch (searchErr) {
                console.error('[Firebase] Client-side search for existing email failed:', searchErr);
              }
            }
          }

          // 3. Handle rejection if they are definitely not registered
          if (notRegistered || !syncedProfile) {
            const finalMessage = errorMessage || "Acesso recusado. Seu e-mail não está cadastrado no sistema.";
            console.warn('Rejecting user access:', finalMessage);
            try {
              await auth.signOut();
            } catch (signOutErr) {
              console.error('Error signing out rejected user:', signOutErr);
            }
            setUser(null);
            setProfile(null);
            setLoginError(finalMessage);
            setLoading(false);
            return;
          }

          // 4. Update local state with the synced profile and update login audit timestamps
          try {
            await updateDoc(doc(firestoreDb, 'users', syncedProfile.uid), {
              lastLogin: new Date(),
              lastActive: new Date()
            });
            syncedProfile = {
              ...syncedProfile,
              lastLogin: new Date(),
              lastActive: new Date()
            };
          } catch (updateErr) {
            console.warn('[Firebase] Updating lastLogin on login failed:', updateErr);
          }
          setProfile(syncedProfile);
          const allowedIds = menuItems.filter(m => m.roles.includes(syncedProfile.role)).map(m => m.id);
          const saved = typeof window !== 'undefined' ? localStorage.getItem('lefrio_active_view') : null;
          
          if (syncedProfile.role === UserRole.TECHNICIAN) {
            if (saved && allowedIds.includes(saved)) {
              setActiveView(saved);
            } else {
              setActiveView('demand');
            }
          } else if (!allowedIds.includes(activeView)) {
            if (saved && allowedIds.includes(saved)) {
              setActiveView(saved);
            } else {
              setActiveView(allowedIds.includes('demand') ? 'demand' : (allowedIds[0] || 'demand'));
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

  // Salvar a visualização ativa no localStorage para manter a tela se o usuário desejar navegar
  useEffect(() => {
    if (typeof window !== 'undefined' && activeView) {
      try {
        localStorage.setItem('lefrio_active_view', activeView);
      } catch (e) {
        // ignore
      }
    }
  }, [activeView]);

  // Sync active view if role changes or if somehow we get into an invalid state
  useEffect(() => {
    if (profile) {
      const allowedIds = menuItems.filter(m => m.roles.includes(profile.role)).map(m => m.id);
      if (!allowedIds.includes(activeView)) {
        if (profile.role === UserRole.TECHNICIAN && allowedIds.includes('demand')) {
          setActiveView('demand');
        } else {
          setActiveView(allowedIds.includes('demand') ? 'demand' : (allowedIds[0] || 'demand'));
        }
      }
    }
  }, [profile, activeView]);

  // Online / lastActive Heartbeat tracker (otimizado para evitar gravações quando aba inativa)
  useEffect(() => {
    if (!profile?.uid) return;
 
    const updateActivity = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        await updateDoc(doc(firestoreDb, 'users', profile.uid), {
          lastActive: new Date()
        });
      } catch (err) {
        console.warn('Failed to update activity heartbeat:', err);
      }
    };
 
    updateActivity();
 
    const interval = setInterval(updateActivity, 30000);
 
    return () => clearInterval(interval);
  }, [profile?.uid]);

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
          <h1 className="text-2xl font-bold text-gray-900 mb-1 text-center">Le Frio - Gestão</h1>
          <p className="text-gray-500 mb-8 text-center text-xs font-medium">Soluções em Refrigeração e Climatização</p>
          
          {loginError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-sm animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{loginError}</p>
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
    profile && item.roles.includes(profile.role)
  );

  if (user && (!profile || filteredMenuItems.length === 0)) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#F8F9FA] p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-gray-100 text-center"
        >
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-100">
            <Shield className="w-8 h-8 text-amber-500 animate-pulse" />
          </div>
          <h1 className="text-xl font-bold text-gray-950 mb-2">Acesso Pendente / Restrito</h1>
          
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Usuário Atual</p>
            <p className="text-sm font-semibold text-gray-900">{profile?.name || user?.displayName || 'Usuário Sem Nome'}</p>
            <p className="text-xs text-gray-500 break-all">{user.email}</p>
            <div className="mt-3 pt-3 border-t border-gray-200/60 flex justify-between items-center text-xs">
              <span className="text-gray-400 uppercase tracking-wider font-bold">Nível de Acesso</span>
              <span className="bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full uppercase text-[10px]">
                {profile?.role || 'Aguardando'}
              </span>
            </div>
          </div>

          <p className="text-sm text-gray-600 mb-8 leading-relaxed">
            Seu cadastro foi realizado no sistema, mas você ainda não tem permissão para acessar o painel de gerenciamento.
            <br />
            <span className="mt-2 block text-xs text-gray-500 text-center">
              Solicite ao Administrador que altere seu cargo para <strong>Assistente</strong>, <strong>Atendimento</strong> ou outro cargo ativo na tela de "Gestão de Usuários".
            </span>
          </p>

          <div className="flex flex-col gap-3">
            <button 
              onClick={async () => {
                setLoading(true);
                try {
                  const syncResp = await fetch('/api/sync-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      uid: user.uid,
                      email: user.email,
                      displayName: user.displayName
                    })
                  });
                  if (syncResp.ok) {
                    const syncData = await syncResp.json();
                    if (syncData.success && syncData.profile) {
                      setProfile(syncData.profile);
                    }
                  } else {
                    const profileDoc = await getDoc(doc(firestoreDb, 'users', user.uid));
                    if (profileDoc.exists()) {
                      setProfile(profileDoc.data() as UserProfile);
                    }
                  }
                } catch (e) {
                  console.error('Error re-fetching profile:', e);
                } finally {
                  setLoading(false);
                }
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-md hover:shadow-blue-100 flex items-center justify-center gap-2 text-sm"
            >
              Verificar Novamente
            </button>
            
            <button 
              onClick={() => auth.signOut()}
              className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-red-500 font-semibold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm text-sm"
            >
              <LogOut className="w-5 h-5" />
              Sair da Conta
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const hasAccess = (viewId: string) => {
    const item = menuItems.find(m => m.id === viewId);
    return !!(profile && item && item.roles.includes(profile.role));
  };

  return (
    <div className="flex h-screen bg-[#F8F9FA] print:bg-white overflow-hidden print:overflow-visible font-sans">
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
            {/* Central de Notificações */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all outline-none"
                title="Notificações"
              >
                <Bell className="w-5 h-5" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-3 w-[360px] sm:w-[480px] max-w-[calc(100vw-2rem)] bg-white border border-gray-100 rounded-2xl shadow-xl z-50 overflow-hidden"
                  >
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-900">Notificações</span>
                        <button
                          id="btn-export-notifications-excel"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExportNotificationsExcel();
                          }}
                          disabled={isExportingExcel}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:shadow-xs disabled:opacity-50"
                          title="Baixar relatório em Excel com todas as notificações dos últimos 10 dias"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="hidden sm:inline">{isExportingExcel ? 'Gerando...' : 'Baixar Excel (10 dias)'}</span>
                          <span className="sm:hidden">{isExportingExcel ? '...' : 'Excel'}</span>
                        </button>
                      </div>
                      {notifications.filter(n => !n.read).length > 0 && (
                        <button
                          onClick={handleMarkAllAsRead}
                          className="text-[9px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 transition shrink-0"
                        >
                          Marcar Todas Lidas
                        </button>
                      )}
                    </div>

                    <div className="max-h-[450px] overflow-y-auto divide-y divide-gray-50">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-gray-400 font-medium italic">
                           Nenhuma notificação recebida.
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <div
                            key={notif.id}
                            onClick={async () => {
                              await handleMarkAsRead(notif.id);
                              setShowNotifications(false);
                              if (notif.callId) {
                                setSelectedCallId(notif.callId);
                                setActiveView('calls');
                              }
                            }}
                            className={cn(
                              "p-3.5 text-left transition-colors cursor-pointer hover:bg-gray-50 flex items-start gap-3",
                              !notif.read ? "bg-blue-50/20 font-semibold" : ""
                            )}
                          >
                            <div className="mt-0.5 shrink-0">
                              {notif.type === 'new_call' ? (
                                <AlertCircle className="w-4 h-4 text-blue-600" />
                              ) : notif.type === 'new_comment' ? (
                                <MessageSquare className="w-4 h-4 text-emerald-600" />
                              ) : notif.type === 'task_assigned' ? (
                                <Briefcase className="w-4 h-4 text-indigo-650" />
                              ) : notif.type === 'task_comment' ? (
                                <MessageSquare className="w-4 h-4 text-blue-500" />
                              ) : notif.type === 'task_attachment' ? (
                                <Paperclip className="w-4 h-4 text-amber-500" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-purple-600" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-gray-900 break-words whitespace-normal">{notif.title}</p>
                              <p className="text-[11px] text-gray-500 leading-normal mt-1 font-medium break-words whitespace-normal">{notif.content}</p>
                              <span className="text-[9px] text-gray-400 uppercase font-black block tracking-wider mt-1">
                                {notif.createdAt?.seconds 
                                  ? `${new Date(notif.createdAt.seconds * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${new Date(notif.createdAt.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                                  : 'Agora'}
                              </span>
                            </div>
                            <button
                              onClick={(e) => handleDeleteNotification(notif.id, e)}
                              className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-lg shrink-0 transition-all self-center"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-gray-900">{profile?.name || user?.displayName}</p>
              <div className="flex items-center justify-end gap-1">
                <span className={cn(
                  "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full",
                  profile?.role === UserRole.ADMIN ? "bg-purple-100 text-purple-600" :
                  profile?.role === UserRole.MANAGER ? "bg-amber-100 text-amber-600" :
                  profile?.role === UserRole.SUPPORT ? "bg-emerald-100 text-emerald-600" :
                  profile?.role === UserRole.TECHNICIAN ? "bg-teal-100 text-teal-600" :
                  "bg-blue-100 text-blue-600"
                )}>
                  {profile?.role === UserRole.ADMIN ? 'Administrador' : 
                   profile?.role === UserRole.ASSISTANT ? 'Assistente' : 
                   profile?.role === UserRole.SUPPORT ? 'Atendimento' : 
                   profile?.role === UserRole.MANAGER ? 'Gestor' : 
                   profile?.role === UserRole.TECHNICIAN ? 'Técnico' : '...'}
                </span>
                <p className="text-[10px] text-gray-500">
                  {user?.email?.endsWith('@lefrio.com') ? user.email.split('@')[0] : user?.email}
                </p>
              </div>
            </div>
            
            <button
              onClick={() => setActiveView('profile')}
              title="Visualizar Meu Perfil"
              className="relative focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full"
            >
              {user?.photoURL ? (
                <img src={user.photoURL} alt="User" className="w-9 h-9 rounded-full border border-gray-200" />
              ) : (
                <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors">
                  <User className="w-5 h-5 text-gray-400" />
                </div>
              )}
            </button>
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
              {activeView === 'schedule' && hasAccess('schedule') && <ScheduleView managerClientId={profile?.clientId} userRole={profile?.role} />}
              {activeView === 'registration' && hasAccess('registration') && <RegistrationView />}
              {activeView === 'reports' && hasAccess('reports') && <ReportsView managerClientId={profile?.clientId} />}
              {activeView === 'finance' && hasAccess('finance') && <FinancialView managerClientId={profile?.clientId} />}
              {activeView === 'contracts' && hasAccess('contracts') && <ContractsView managerClientId={profile?.clientId} userRole={profile?.role} />}
              {activeView === 'demand' && hasAccess('demand') && (
                <TechDemandView 
                  userRole={profile?.role} 
                  userProfile={profile || undefined} 
                  managerClientId={profile?.clientId} 
                />
              )}
              {activeView === 'production' && hasAccess('production') && (
                <TechProductionView 
                  userRole={profile?.role} 
                  managerClientId={profile?.clientId} 
                  userProfile={profile || undefined} 
                />
              )}
              {activeView === 'settings' && hasAccess('settings') && (
                <SettingsView 
                  userRole={profile?.role} 
                  userProfile={profile || undefined} 
                  onProfileUpdate={(updated) => setProfile(updated)} 
                />
              )}
              {activeView === 'routes' && hasAccess('routes') && <RoutePlanningView userRole={profile?.role} userProfile={profile || undefined} />}
              {activeView === 'expenses' && hasAccess('expenses') && (
                <TechMobileExpenseView 
                  userRole={profile?.role} 
                  userProfile={profile || undefined} 
                />
              )}
              {activeView === 'profile' && profile && <ProfileView userProfile={profile} onProfileUpdate={(updated) => setProfile(updated)} />}
              {activeView === 'orders' && hasAccess('orders') && (
                <ServiceOrdersView
                  managerClientId={profile?.clientId}
                  userRole={profile?.role}
                  userProfile={profile || undefined}
                />
              )}
              {activeView === 'calls' && hasAccess('calls') && (
                <ServiceCallsView 
                  managerClientId={profile?.clientId} 
                  userRole={profile?.role} 
                  userProfile={profile || undefined} 
                  initialSelectedCallId={selectedCallId}
                  onClearInitialCallId={() => setSelectedCallId(undefined)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Toast Popup de Notificação em Tempo Real no Canto da Tela */}
      <div className="fixed bottom-6 right-6 z-[9999] pointer-events-none w-full max-w-sm px-4 md:px-0">
        <AnimatePresence>
          {activePopup && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9, x: 50 }}
              animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
              exit={{ opacity: 0, y: 20, scale: 0.95, transition: { duration: 0.15 } }}
              className="pointer-events-auto bg-white rounded-2xl border border-slate-200 p-4 shadow-2xl relative overflow-hidden flex flex-col gap-3 w-full"
            >
              {/* Barra de Progresso de Auto-Dismiss */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-slate-100">
                <motion.div 
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: 8, ease: "linear" }}
                  className="h-full bg-blue-500"
                />
              </div>

              {/* Header com Ícone e Fechar */}
              <div className="flex items-start justify-between gap-2 mt-1">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                    <Bell className="w-4 h-4 animate-bounce" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 block">Alerta de Sistema</span>
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">
                      {activePopup.createdAt?.seconds 
                        ? `${new Date(activePopup.createdAt.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                        : 'Agora'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setActivePopup(null)}
                  className="p-1 text-gray-400 hover:text-gray-950 hover:bg-gray-100 rounded-lg transition-all"
                  style={{ minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Conteúdo Compacto */}
              <div className="space-y-1">
                <h3 className="text-xs font-black text-gray-950 leading-tight">
                  {activePopup.title}
                </h3>
                <p className="text-[11px] text-gray-600 leading-relaxed font-semibold">
                  {activePopup.content}
                </p>
              </div>

              {/* Ações Compactas */}
              <div className="flex gap-2 justify-end mt-1 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setActivePopup(null)}
                  className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-500 hover:text-gray-950 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/60 transition-all text-center"
                  style={{ minHeight: 32 }}
                >
                  Descartar
                </button>
                {activePopup.callId && (
                  <button
                    onClick={async () => {
                      const id = activePopup.id;
                      const callId = activePopup.callId;
                      setActivePopup(null);
                      await handleMarkAsRead(id);
                      setSelectedCallId(callId);
                      setActiveView('calls');
                    }}
                    className="px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-100 transition-all text-center flex items-center justify-center gap-1.5"
                    style={{ minHeight: 32 }}
                  >
                    <span>Ver Chamado</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
                {(activePopup.type === 'tech_start' || activePopup.type === 'tech_finish') && (
                  <button
                    onClick={async () => {
                      const id = activePopup.id;
                      setActivePopup(null);
                      await handleMarkAsRead(id);
                      setActiveView('demand');
                    }}
                    className="px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-100 transition-all text-center flex items-center justify-center gap-1.5"
                    style={{ minHeight: 32 }}
                  >
                    <span>Ver Demanda</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
