import React, { useState } from 'react';
import { Clock, Shield, Smartphone, Wrench, Volume2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { UserRole, UserProfile } from '../types';
import HistoryView from './HistoryView';
import UserManagementView from './UserManagementView';
import DeviceSettingsView from './DeviceSettingsView';
import ServiceOrderSettingsView from './ServiceOrderSettingsView';
import NotificationSettingsView from './NotificationSettingsView';

interface SettingsViewProps {
  userRole?: UserRole;
  userProfile?: UserProfile;
  onProfileUpdate?: (profile: UserProfile) => void;
}

type SettingsTab = 'users' | 'orders' | 'notifications' | 'history' | 'devices';

export default function SettingsView({ userRole, userProfile, onProfileUpdate }: SettingsViewProps) {
  // Determine available tabs based on user role
  const isDocAdmin = userRole === UserRole.ADMIN;
  const isDocSupport = userRole === UserRole.SUPPORT;

  const tabs: { id: SettingsTab; label: string; icon: any; allowed: boolean }[] = [
    {
      id: 'users',
      label: 'Usuários',
      icon: Shield,
      allowed: isDocAdmin,
    },
    {
      id: 'orders',
      label: 'Ordens de Serviço',
      icon: Wrench,
      allowed: isDocAdmin || isDocSupport,
    },
    {
      id: 'notifications',
      label: 'Notificações & Sons',
      icon: Volume2,
      allowed: isDocAdmin || isDocSupport,
    },
    {
      id: 'history',
      label: 'Histórico de Atividades',
      icon: Clock,
      allowed: isDocAdmin || isDocSupport,
    },
    {
      id: 'devices',
      label: 'Dispositivos',
      icon: Smartphone,
      allowed: isDocAdmin || isDocSupport,
    },
  ];

  const allowedTabs = tabs.filter((t) => t.allowed);

  // Default to the first allowed tab, or 'history' if none match
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    return allowedTabs[0]?.id || 'history';
  });

  if (allowedTabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-gray-100 shadow-xs h-64">
        <Shield className="w-10 h-10 text-gray-400 mb-3 animate-pulse" />
        <h3 className="text-lg font-bold text-gray-900 mb-1">Acesso não autorizado</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          Você não tem permissão para visualizar as configurações do sistema.
        </p>
      </div>
    );
  }

  return (
    <div id="settings-view-container" className="flex flex-col h-full space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black text-gray-950 tracking-tight">Configurações</h1>
        <p className="text-sm text-gray-500">Gerencie os usuários do sistema, audite o histórico de alterações e configure dispositivos móveis.</p>
      </div>

      {/* Tabs Selector */}
      <div className="flex gap-2 border-b border-gray-200 pb-px overflow-x-auto scrollbar-none">
        {allowedTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-btn-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-sm transition-all whitespace-nowrap outline-none",
                isActive
                  ? "border-blue-600 text-blue-600 bg-blue-50/40 rounded-t-xl"
                  : "border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-t-xl"
              )}
            >
              <Icon className={cn("w-4 h-4", isActive ? "text-blue-600" : "text-gray-400")} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'users' && isDocAdmin && <UserManagementView />}
        {activeTab === 'orders' && (isDocAdmin || isDocSupport) && <ServiceOrderSettingsView />}
        {activeTab === 'notifications' && (isDocAdmin || isDocSupport) && (
          <NotificationSettingsView 
            userProfile={userProfile} 
            onProfileUpdate={onProfileUpdate} 
          />
        )}
        {activeTab === 'history' && (isDocAdmin || isDocSupport) && <HistoryView />}
        {activeTab === 'devices' && (isDocAdmin || isDocSupport) && <DeviceSettingsView />}
      </div>
    </div>
  );
}
