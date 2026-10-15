import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { systemApi } from '../services/api';
import { 
  LogOut, 
  User as UserIcon, 
  RefreshCw, 
  Menu, 
  KeyRound, 
  ChevronDown,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { useSidebar } from '../context/SidebarContext';
import { useAuth } from '../context/AuthContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { UserRole } from '../types';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, onRefresh, isRefreshing }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toggle } = useSidebar();
  const { user, role, logout } = useAuth();
  const [isDbOnline, setIsDbOnline] = useState<boolean | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const res = await systemApi.getStatus();
        if (isMounted) {
          setIsDbOnline(res.cassandra?.connected ?? false);
        }
      } catch {
        if (isMounted) {
          setIsDbOnline(false);
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 20000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getRoleBadge = (r: UserRole) => {
    switch (r) {
      case 'ADMIN':
        return 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30';
      case 'OPERATOR':
        return 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30';
      case 'VIEWER':
      default:
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30';
    }
  };

  const userInitial = (user?.full_name || user?.username || 'U').charAt(0).toUpperCase();

  return (
    <header className="h-16 px-4 sm:px-6 lg:px-8 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between gap-4 transition-colors duration-200">
      {/* Left side: Hamburger (mobile/tablet) + Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={toggle}
          className="lg:hidden p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 transition shrink-0"
          title="Toggle Navigation"
          aria-label="Toggle Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          {title && (
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight truncate">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:block">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right side: Database Health + Theme + Language + User Menu */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Cassandra Node Live Indicator */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
          <span className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isDbOnline === true
                  ? 'bg-emerald-400'
                  : isDbOnline === false
                  ? 'bg-rose-400'
                  : 'bg-amber-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isDbOnline === true
                  ? 'bg-emerald-500'
                  : isDbOnline === false
                  ? 'bg-rose-500'
                  : 'bg-amber-500'
              }`}
            />
          </span>
          <span className="text-slate-600 dark:text-slate-300 font-mono text-[11px]">
            {isDbOnline === true
              ? t('header.cassandraOnline')
              : isDbOnline === false
              ? t('header.cassandraOffline')
              : t('header.cassandraChecking')}
          </span>
        </div>

        {/* Optional Refresh Button */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-medium transition disabled:opacity-50 shadow-sm"
            title={t('header.refresh')}
            aria-label={t('header.refresh')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? t('header.refreshing') : t('header.refresh')}</span>
          </button>
        )}

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* Theme Switcher */}
        <ThemeToggle />

        {/* User Profile & Menu Dropdown */}
        <div className="relative pl-1 sm:pl-2 border-l border-slate-200 dark:border-slate-800" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900/80 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs transition shadow-sm"
            aria-expanded={isUserMenuOpen}
            aria-label="User Account Menu"
          >
            <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shadow-sm">
              {userInitial}
            </div>
            <div className="text-left hidden sm:block">
              <span className="text-slate-900 dark:text-slate-200 font-semibold block leading-tight truncate max-w-[110px]">
                {user?.full_name || user?.username || 'User'}
              </span>
              <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border ${getRoleBadge(role)}`}>
                {role}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {/* Dropdown Menu */}
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50 text-xs animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800/80">
                <p className="font-semibold text-slate-900 dark:text-white truncate">
                  {user?.full_name || user?.username}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                  @{user?.username}
                </p>
              </div>

              <Link
                to="/profile"
                onClick={() => setIsUserMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <UserIcon className="w-4 h-4 text-emerald-500" />
                <span>{t('header.profile')}</span>
              </Link>

              <Link
                to="/profile#security"
                onClick={() => setIsUserMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <KeyRound className="w-4 h-4 text-amber-500" />
                <span>{t('header.changePassword')}</span>
              </Link>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition text-left"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('header.logout')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
