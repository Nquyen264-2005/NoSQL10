import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole, UserSession } from '../types';
import { authApi } from '../services/api';

interface AuthContextType {
  user: UserSession | null;
  token: string | null;
  role: UserRole;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isOperator: boolean;
  isViewer: boolean;
  login: (token: string, user: UserSession) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('audit_auth_token'));
  const [user, setUser] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem('audit_user_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    const savedUsername = localStorage.getItem('audit_username');
    if (savedUsername) {
      return { username: savedUsername, role: (localStorage.getItem('audit_user_role') as UserRole) || 'ADMIN' };
    }
    return null;
  });

  const role: UserRole = user?.role || 'VIEWER';
  const isAuthenticated = !!token && !!user;
  const isAdmin = role === 'ADMIN';
  const isOperator = role === 'OPERATOR';
  const isViewer = role === 'VIEWER';

  const login = (newToken: string, newUser: UserSession) => {
    localStorage.setItem('audit_auth_token', newToken);
    localStorage.setItem('audit_username', newUser.username);
    localStorage.setItem('audit_user_role', newUser.role);
    localStorage.setItem('audit_user_data', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = async () => {
    try {
      if (token) {
        await authApi.logout();
      }
    } catch {
      // Ignored
    } finally {
      localStorage.removeItem('audit_auth_token');
      localStorage.removeItem('audit_username');
      localStorage.removeItem('audit_user_role');
      localStorage.removeItem('audit_user_data');
      setToken(null);
      setUser(null);
      window.location.href = '/login';
    }
  };

  const refreshUser = async () => {
    try {
      if (!token) return;
      const res = await authApi.getMe();
      if (res.data?.user) {
        const updated = res.data.user;
        setUser(updated);
        localStorage.setItem('audit_user_data', JSON.stringify(updated));
        localStorage.setItem('audit_user_role', updated.role);
        localStorage.setItem('audit_username', updated.username);
      }
    } catch {
      // If token expired, logout
      logout();
    }
  };

  useEffect(() => {
    if (token && !user) {
      refreshUser();
    }
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        role,
        isAuthenticated,
        isAdmin,
        isOperator,
        isViewer,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
