import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, 
  FileText, 
  Server, 
  PlayCircle, 
  Activity, 
  Database,
  ShieldCheck,
  X,
  Timer,
  Users,
  Eye
} from 'lucide-react';
import { useSidebar } from '../context/SidebarContext';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

interface NavItem {
  to: string;
  translationKey: string;
  icon: any;
  allowedRoles: UserRole[];
}

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close } = useSidebar();
  const { user, role } = useAuth();

  const allNavItems: NavItem[] = [
    { to: '/', translationKey: 'nav.dashboard', icon: LayoutDashboard, allowedRoles: ['ADMIN', 'OPERATOR', 'VIEWER'] },
    { to: '/logs', translationKey: 'nav.logs', icon: FileText, allowedRoles: ['ADMIN', 'OPERATOR', 'VIEWER'] },
    { to: '/services', translationKey: 'nav.services', icon: Server, allowedRoles: ['ADMIN', 'OPERATOR'] },
    { to: '/demo', translationKey: 'nav.demo', icon: PlayCircle, allowedRoles: ['ADMIN', 'OPERATOR'] },
    { to: '/ttl-demo', translationKey: 'nav.ttlDemo', icon: Timer, allowedRoles: ['ADMIN'] },
    { to: '/system', translationKey: 'nav.systemStatus', icon: Activity, allowedRoles: ['ADMIN'] },
    { to: '/users', translationKey: 'nav.userManagement', icon: Users, allowedRoles: ['ADMIN'] },
  ];

  // Filter items visible to current user's role
  const visibleNavItems = allNavItems.filter((item) => item.allowedRoles.includes(role));

  const getRoleBadgeStyle = (r: UserRole) => {
    switch (r) {
      case 'ADMIN':
        return 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30';
      case 'OPERATOR':
        return 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30';
      case 'VIEWER':
      default:
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    }
  };

  const getRoleIcon = (r: UserRole) => {
    switch (r) {
      case 'ADMIN':
        return <ShieldCheck className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />;
      case 'OPERATOR':
        return <Activity className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />;
      case 'VIEWER':
      default:
        return <Eye className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />;
    }
  };

  return (
    <>
      {/* Mobile / Tablet Backdrop */}
      {isOpen && (
        <div
          onClick={close}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden transition-opacity animate-in fade-in"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 min-h-screen transition-all duration-200 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 dark:text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                AuditLog
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-mono">NoSQL</span>
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Apache Cassandra 4.1</p>
            </div>
          </div>

          <button
            onClick={close}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition"
            title="Close menu"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Role Indicator */}
        <div className="px-4 pt-3 pb-1">
          <div className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between shadow-sm ${getRoleBadgeStyle(role)}`}>
            <div className="flex items-center gap-2 font-medium">
              {getRoleIcon(role)}
              <span>{t('header.currentRole')}: <strong className="font-mono">{role}</strong></span>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">RBAC</span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
            {t('nav.coreMonitoring')}
          </div>
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={close}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/80 border border-transparent'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{t(item.translationKey)}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Footer Info Box */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800/80">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs shadow-sm">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span>User Session</span>
            </div>
            <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-300 truncate">
              {user?.full_name || user?.username || 'admin'}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              @{user?.username || 'admin'}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
};
