import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import api, { formatSum, formatDate } from '../utils/api';
import { t } from '../utils/i18n';

const StatCard = ({ icon, value, label, color, to }) => (
  <Link to={to || '#'} style={{ textDecoration: 'none', color: 'inherit' }}>
    <div className="stat-card">
      <div className="stat-icon" style={{ background: color + '1a', color }}>
        <span>{icon}</span>
      </div>
      <div style={{minWidth: 0}}>
        <div className="stat-value" style={{ color: 'var(--text)' }}>{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  </Link>
);

const ROLE_GREETING = {
  master: 'Мастер',
  warehouse: 'Складовщик',
  production_chief: 'Начальник производства',
  director: 'Директор',
};

function getFirstName(fullName) {
  if (!fullName) return '';
  // Имя обычно во втором слове (если 3 части: должность Имя Фамилия)
  // или в первом (если просто Имя Фамилия)
  const parts = fullName.trim().split(/\s+/);
  return parts.length >= 2 ? parts[1] : parts[0];
}

export default function Dashboard() {
  const { user }  = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState('');  // request id, на котором сейчас выполняется действие

  const reload = () => {
    const isMaster = user?.role === 'master';
    return api.get('/requests', { params: isMaster ? {} : { status: 'issued' } })
      .then(r => {
        const activeStatuses = ['issued', 'return_requested', 'overdue'];
        const filtered = isMaster
          ? (r.data || []).filter(x => activeStatuses.includes(x.status))
          : (r.data || []);
        setMyRequests(filtered.slice(0, 5));
      });
  };

  const handleRequestReturn = async (reqId) => {
    setActing(reqId);
    try {
      await api.put(`/requests/${reqId}/request-return`);
      toast('Склад уведомлён — ожидайте приёма', 'success');
      await reload();
    } catch (e) {
      toast(e.response?.data?.error || 'Ошибка', 'error');
    } finally { setActing(''); }
  };

  const handleCancelReturn = async (reqId) => {
    setActing(reqId);
    try {
      await api.put(`/requests/${reqId}/cancel-return`);
      toast('Запрос на приём отменён', 'info');
      await reload();
    } catch (e) {
      toast(e.response?.data?.error || 'Ошибка', 'error');
    } finally { setActing(''); }
  };

  useEffect(() => {
    const isMaster = user?.role === 'master';
    Promise.all([
      isMaster ? Promise.resolve(null) : api.get('/analytics/dashboard').then(r => r.data).catch(() => null),
      api.get('/requests', { params: isMaster ? {} : { status: 'issued' } }).then(r => r.data).catch(() => []),
    ]).then(([analytics, requests]) => {
      setData(analytics);
      // Для мастера — только активные (выдан / ждёт приёмки / просрочен)
      const activeStatuses = ['issued', 'return_requested', 'overdue'];
      const filtered = isMaster
        ? (requests || []).filter(r => activeStatuses.includes(r.status))
        : (requests || []);
      setMyRequests(filtered.slice(0, 5));
    }).finally(() => setLoading(false));
  }, [user]);

  if (loading) return (
    <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
      Загрузка…
    </div>
  );

  const isMaster = user?.role === 'master';
  const firstName = getFirstName(user?.full_name);
  const dateStr = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <div>
      {/* Welcome hero */}
      <div className="welcome-hero">
        <h1>Здравствуйте, {firstName || user?.full_name}</h1>
        <div className="welcome-date">{ROLE_GREETING[user?.role]} · {dateStr}</div>
        {isMaster && (
          <div className="welcome-actions">
            <Link to="/requests" className="btn btn-on-dark">
              + Подать заявку на инструмент
            </Link>
          </div>
        )}
      </div>

      {/* Stats — только для не-мастеров */}
      {!isMaster && data && (
        <div className="stats-grid">
          <StatCard icon="🔧" value={data.tools?.in_stock || 0}    label={t('toolsInStock')}  color="#1f7a4d" to="/tools?status=in_stock" />
          <StatCard icon="📤" value={data.tools?.issued || 0}      label={t('toolsIssued')}   color="#b45309" to="/tools?status=issued" />
          <StatCard icon="🛠"  value={data.tools?.in_repair || 0}  label={t('toolsInRepair')} color="#5b6b62" to="/tools?status=in_repair" />
          <StatCard icon="⏰" value={data.overdue?.length || 0}    label={t('overdueTools')}  color="#b91c1c" to="/requests?status=overdue" />
          <StatCard icon="📋" value={data.requests?.pending || 0}  label="Ожидают выдачи"    color="#1d4f7a" to="/requests?status=pending" />
          <StatCard icon="💳" value={formatSum(data.fines?.total)} label={t('totalFines')}   color="#b91c1c" to="/fines" />
        </div>
      )}

      {/* Просроченные — только начальник/директор */}
      {!isMaster && data?.overdue?.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--danger)' }}>
          <div className="card-header">
            <h2 className="card-title text-overdue">
              <span className="icon-pill" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>!</span>
              Просроченные инструменты · {data.overdue.length}
            </h2>
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

      {/* Мои активные / последние выдачи */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <span className="icon-pill">📋</span>
            {isMaster ? 'Мои активные инструменты' : 'Последние выдачи'}
          </h2>
          <Link to="/requests" className="btn btn-secondary btn-sm">Все заявки →</Link>
        </div>

        {myRequests.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🗂</div>
            <div className="empty-title">
              {isMaster ? 'Активных инструментов нет' : 'Нет выданных инструментов'}
            </div>
            <div className="empty-hint">
              {isMaster
                ? 'Подайте заявку — складовщик выдаст инструмент со склада'
                : 'Заявки появятся когда мастера запросят инструменты'}
            </div>
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
                  {isMaster && <th></th>}
                </tr>
              </thead>
              <tbody>
                {myRequests.map(r => {
                  const days = Math.floor((new Date() - new Date(r.planned_return)) / 86400000);
                  const overdue = days > 0 && r.status !== 'returned';
                  const isAwaiting = r.status === 'return_requested';
                  const badge = isAwaiting
                    ? { cls: 'badge-blue', label: 'Готов к приёмке' }
                    : overdue
                    ? { cls: 'badge-red',  label: 'Просрочен' }
                    : { cls: 'badge-yellow', label: 'Выдан' };
                  return (
                    <tr key={r.id} className={overdue ? 'row-overdue' : ''}>
                      <td>
                        <strong>{r.tool_name}</strong>
                        <br />
                        <span className="text-muted" style={{ fontSize: 11.5 }}>{r.inventory_number}</span>
                      </td>
                      {!isMaster && <td>{r.master_name}</td>}
                      <td>{r.order_number}</td>
                      <td className={overdue ? 'text-overdue' : days === 0 ? 'text-warning' : ''}>
                        {formatDate(r.planned_return)}
                        {overdue && <span> · +{days} дн.</span>}
                      </td>
                      <td>
                        <span className={`badge-status ${badge.cls}`}>{badge.label}</span>
                      </td>
                      {isMaster && (
                        <td style={{ textAlign: 'right' }}>
                          {r.status === 'issued' && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleRequestReturn(r.id)}
                              disabled={acting === r.id}
                            >
                              {acting === r.id ? '…' : 'Готов вернуть'}
                            </button>
                          )}
                          {r.status === 'return_requested' && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleCancelReturn(r.id)}
                              disabled={acting === r.id}
                            >
                              {acting === r.id ? '…' : 'Отменить запрос'}
                            </button>
                          )}
                        </td>
                      )}
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
