import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { t } from '../utils/i18n';

const TYPE_ICONS = {
  new_request:      '📝',
  request_approved: '✅',
  overdue_warning:  '⚠️',
  overdue_fine:     '💰',
  return_today:     '🔴',
  return_tomorrow:  '⏰',
  inventory_reminder:'📦',
};

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get('/notifications').then(r => setNotifications(r.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const markAllRead = async () => {
    await api.put('/notifications/mark-all-read');
    load();
  };

  const markRead = async (id) => {
    await api.put(`/notifications/${id}/read`);
    setNotifications(p => p.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const unread = notifications.filter(n => !n.is_read).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🔔 {t('notifications')}</h1>
          <p className="page-subtitle">{unread > 0 ? `${unread} непрочитанных` : 'Все прочитаны'}</p>
        </div>
        {unread > 0 && (
          <button className="btn btn-ghost" onClick={markAllRead}>✅ Прочитать все</button>
        )}
      </div>

      {loading ? (
        <div className="card" style={{padding:40,textAlign:'center'}}>⏳</div>
      ) : notifications.length === 0 ? (
        <div className="card" style={{padding:60,textAlign:'center',color:'#6b7280'}}>
          🔔 Уведомлений нет
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {notifications.map(n => (
            <div key={n.id}
              className="card"
              style={{
                padding:'14px 16px',
                display:'flex',gap:14,alignItems:'flex-start',
                borderLeft:`4px solid ${n.is_read?'#e5e7eb':'#1a56db'}`,
                background: n.is_read ? '#fff' : '#eff6ff',
                cursor: 'pointer',
              }}
              onClick={() => !n.is_read && markRead(n.id)}
            >
              <div style={{fontSize:24,flex:'none'}}>{TYPE_ICONS[n.type] || '🔔'}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight: n.is_read ? 400 : 700, fontSize:14, marginBottom:3}}>{n.title}</div>
                <div style={{fontSize:13,color:'#374151'}}>{n.message}</div>
                <div style={{fontSize:11,color:'#9ca3af',marginTop:6}}>
                  {new Date(n.created_at).toLocaleString('ru-RU')}
                </div>
              </div>
              {!n.is_read && (
                <div style={{width:8,height:8,borderRadius:'50%',background:'#1a56db',flex:'none',marginTop:6}} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
