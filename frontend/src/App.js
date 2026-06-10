import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import Sidebar from './components/Sidebar';
import InstallPrompt from './components/InstallPrompt';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tools from './pages/Tools';
import Requests from './pages/Requests';
import Fines from './pages/Fines';
import Inventory from './pages/Inventory';
import Analytics from './pages/Analytics';
import Notifications from './pages/Notifications';

function ProtectedLayout({ children, roles }) {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:16}}>
      <div style={{fontSize:48}}>🏭</div>
      <div style={{color:'#6b7280'}}>Загрузка...</div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return (
    <div className="app-layout">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        {/* Mobile top bar */}
        <div className="mobile-topbar" style={{display:'none'}}>
          <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
          <h1>Инструменты цеха</h1>
        </div>
        <style>{`
          @media(max-width:768px){
            .mobile-topbar{display:flex !important}
            .main-content{padding-top:8px}
          }
        `}</style>
        {children}
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
      <Route path="/tools" element={<ProtectedLayout><Tools /></ProtectedLayout>} />
      <Route path="/requests" element={<ProtectedLayout><Requests /></ProtectedLayout>} />
      <Route path="/fines" element={<ProtectedLayout><Fines /></ProtectedLayout>} />
      <Route path="/notifications" element={<ProtectedLayout><Notifications /></ProtectedLayout>} />

      <Route path="/inventory" element={
        <ProtectedLayout roles={['warehouse','production_chief','director']}>
          <Inventory />
        </ProtectedLayout>
      } />
      <Route path="/analytics" element={
        <ProtectedLayout roles={['production_chief','director']}>
          <Analytics />
        </ProtectedLayout>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
          <InstallPrompt />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
