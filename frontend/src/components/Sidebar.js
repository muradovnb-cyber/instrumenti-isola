import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { t, setLang, getLang } from '../utils/i18n';
import api from '../utils/api';

const ROLE_LABELS = {
  master: 'Мастер', warehouse: 'Складовщик',
  production_chief: 'Начальник', director: 'Директор',
};

const NAV = [
  { to: '/',             icon: '🏠', key: 'dashboard',     roles: ['master','warehouse','production_chief','director'] },
  { to: '/tools',        icon: '🔧', key: 'tools',          roles: ['master','warehouse','production_chief','director'] },
  { to: '/requests',     icon: '📝', key: 'requests',       roles: ['master','warehouse','production_chief','director'] },
  { to: '/fines',        icon: '💰', key: 'fines',          roles: ['master','warehouse','production_chief','director'] },
  { to: '/inventory',    icon: '📦', key: 'inventory',      roles: ['warehouse','production_chief','director'] },
  { to: '/analytics',    icon: '📊', key: 'analytics',      roles: ['production_chief','director'] },
  { to: '/notifications',icon: '🔔', key: 'notifications',  roles: ['master','warehouse','production_chief','director'] },
];

export default function Sidebar({ open, onClose }) {
  const { user, logout }  = useAuth();
  const navigate          = useNavigate();
  const [lang, setLangSt] = useState(getLang());
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api.get('/notifications/unread-count')
      .then(r => setUnread(r.data.count))
      .catch(() => {});
    const timer = setInterval(() => {
      api.get('/notifications/unread-count')
        .then(r => setUnread(r.data.count)).catch(() => {});
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const switchLang = (l) => { setLang(l); setLangSt(l); };
  const handleLogout = () => { logout(); navigate('/login'); };
  const allowed = NAV.filter(n => n.roles.includes(user?.role));

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:99}} />}
      <nav className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <img
            src="/isola-tree.png"
            alt="ISOLA"
            style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }}
          />
          <div>
            <h1>ISOLA Инструменты</h1>
            <p>Asboblar boshqaruvi</p>
          </div>
        </div>

        <div className="sidebar-nav">
          {allowed.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={onClose}
            >
              <span>{item.icon}</span>
              <span>{t(item.key)}</span>
              {item.key === 'notifications' && unread > 0 && (
                <span className="badge">{unread}</span>
              )}
            </NavLink>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{user?.full_name?.[0] || '?'}</div>
            <div style={{flex:1,minWidth:0}}>
              <div className="user-name" style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {user?.full_name}
              </div>
              <div className="user-role">{ROLE_LABELS[user?.role]}</div>
            </div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10}}>
            <div className="lang-toggle">
              <button className={`lang-btn${lang==='ru'?' active':''}`} onClick={()=>switchLang('ru')}>RU</button>
              <button className={`lang-btn${lang==='uz'?' active':''}`} onClick={()=>switchLang('uz')}>UZ</button>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>🚪 {t('logout')}</button>
          </div>
        </div>
      </nav>
    </>
  );
}
