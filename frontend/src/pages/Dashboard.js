import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api, { formatSum, formatDate } from '../utils/api';
import { t } from '../utils/i18n';

const StatCard = ({ icon, value, label, color, to }) => (
  <Link to={to || '#'} style={{ textDecoration: 'none' }}>
    <div className="stat-card">
      <div className="stat-icon" style={{ background: color + '22' }}>
        <span>{icon}</span>
      </div>
      <div>
        <div className="stat-value" style={{ color }}>{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  </Link>
);

export default function Dashboard() {
  const { user }  = useAuth();
  const [data, setData] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const isMaster = user?.role === 'master';
    Promise.all([
      isMaster ? Promise.resolve(null) : api.get('/analytics/dashboard').then(r => r.data),
      api.get('/requests', { params: { status: 'issued' } }).then(r => r.data),
    ]).then(([analytics, requests]) => {
      setData(analytics);
      setMyRequests(requests.slice(0, 5));
    }).catch(console.error)
    .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="card" style={{ padding: 40, textAlign: 'center' }}>⏳ {t('loading')}</div>;

  const isMaster = user?.role === 'master';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">👋 Добро пожаловать, {user?.full_name?.split(' ')[1] || user?.full_name}!</h1>
          <p className="page-subtitle">{new Date().toLocaleDateString('ru-RU', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
        </div>
        {user?.role === 'master' && (
          <Link to="/requests/new" className="btn btn-primary">➕ Подать заявку</Link>
        )}
      </div>

      {/* Stats — только для не-мастеров */}
      {!isMaster && data && (
        <div className="stats-grid">
          <StatCard icon="🔧" value={data.tools?.in_stock || 0}   label={t('toolsInStock')}  color="#057a55" to="/tools?status=in_stock" />
          <StatCard icon="🔴" value={data.tools?.issued || 0}     label={t('toolsIssued')}   color="#c81e1e" to="/tools?status=issued" />
          <StatCard icon="⚙️" value={data.tools?.in_repair || 0} label={t('toolsInRepair')} color="#6b7280" to="/tools?status=in_repair" />
          <StatCard icon="⏰" value={data.overdue?.length || 0}  label={t('overdueTools')}  color="#9f580a" to="/requests?status=overdue" />
          <StatCard icon="📝" value={data.requests?.pending || 0} label="Ожидают выдачи"    color="#1a56db" to="/requests?status=pending" />
          <StatCard icon="💰" value={formatSum(data.fines?.total)} label={t('totalFines')}   color="#c81e1e" to="/fines" />
        </div>
      )}

      {/* Просроченные — только начальник/директор */}
      {!isMaster && data?.overdue?.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid #c81e1e' }}>
          <div className="card-header">
            <h2 className="card-title text-overdue">⚠️ Просроченные инструменты ({data.overdue.length})</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Инструмент</th><th>Мастер</th><th>Срок возврата</th><th>Просрочка</th></tr></thead>
              <tbody>
                {data.overdue.map(r => (
                  <tr key={r.id} className="row-overdue">
                    <td><strong>{r.tool_name}</strong></td>
                    <td>{r.master_name}</td>
                    <td>{formatDate(r.planned_return)}</td>
                    <td className="text-overdue">+{r.overdue_days} дн.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Мои активные инструменты (мастер) */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">📋 {isMaster ? 'Мои активные заявки' : 'Последние выдачи'}</h2>
          <Link to="/requests" className="btn btn-ghost btn-sm">Все заявки →</Link>
        </div>
        {myRequests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#6b7280' }}>
            {isMaster ? 'У вас нет активных инструментов' : 'Нет активных выдач'}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Инструмент</th>
                  {!isMaster && <th>Мастер</th>}
                  <th>Заказ</th>
                  <th>Вернуть до</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {myRequests.map(r => {
                  const days = Math.floor((new Date() - new Date(r.planned_return)) / 86400000);
                  return (
                    <tr key={r.id} className={days > 0 ? 'row-overdue' : ''}>
                      <td><strong>{r.tool_name}</strong><br /><span className="text-muted" style={{fontSize:11}}>{r.inventory_number}</span></td>
                      {!isMaster && <td>{r.master_name}</td>}
                      <td>{r.order_number}</td>
                      <td className={days > 0 ? 'text-overdue' : days === 0 ? 'text-warning' : ''}>
                        {formatDate(r.planned_return)}
                        {days > 0 && <span> (+{days} дн.)</span>}
                      </td>
                      <td>
                        <span className={`badge-status badge-${days > 0 ? 'red' : 'green'}`}>
                          {days > 0 ? '⚠️ Просрочен' : '✅ Выдан'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
