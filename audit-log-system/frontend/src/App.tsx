import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SidebarProvider } from './context/SidebarContext';
import { ThemeProvider } from './context/ThemeContext';
import { MainLayout } from './layouts/MainLayout';
import { DashboardPage } from './pages/DashboardPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { ServicesPage } from './pages/ServicesPage';
import { DemoOperationsPage } from './pages/DemoOperationsPage';
import { TtlDemoPage } from './pages/TtlDemoPage';
import { SystemStatusPage } from './pages/SystemStatusPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { ProfilePage } from './pages/ProfilePage';
import { AccessDeniedPage } from './pages/AccessDeniedPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { UserRole } from './types';

// Route guard with Role-Based Access Control (RBAC)
const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}> = ({ children, allowedRoles }) => {
  const { isAuthenticated, role } = useAuth();
  const token = localStorage.getItem('audit_auth_token');

  if (!token && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <AccessDeniedPage requiredRoles={allowedRoles} />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SidebarProvider>
          <BrowserRouter>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected Core Layout Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              {/* Accessible by All Roles: ADMIN, OPERATOR, VIEWER */}
              <Route index element={<DashboardPage />} />
              <Route path="logs" element={<AuditLogsPage />} />
              <Route path="profile" element={<ProfilePage />} />

              {/* Accessible by ADMIN & OPERATOR */}
              <Route
                path="services"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'OPERATOR']}>
                    <ServicesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="demo"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'OPERATOR']}>
                    <DemoOperationsPage />
                  </ProtectedRoute>
                }
              />

              {/* Accessible by ADMIN ONLY */}
              <Route
                path="ttl-demo"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <TtlDemoPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="system"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <SystemStatusPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="users"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <UserManagementPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Fallback 404 Route */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </SidebarProvider>
    </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
