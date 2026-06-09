import React, { useState, useEffect } from 'react';
import api, { formatSum } from '../utils/api';
import { t } from '../utils/i18n';

export default function Analytics() {
  const [data, setData]     = useState(null);
  const [orders, setOrders] = useState([]);
  const [masters, setMasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    Promise.all([
      api.get('/analytics/dashboard'),
      api.get('/analytics/orders'),
      api.get('/analytics/masters'),
    ]).then(([d,o,m]) => { setData(d.data); setOrders(o.data); setMasters(m.data); })
    .catch(console.error)
    .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card" style={{padding:40,textAlign:'center'}}>⏳ {t('loading')}</div>;

  const totalTools = Object.values(data?.tools || {}).reduce((a,b) => a+Number(b), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 {t('analytics')}</h1>
          <p className="page-subtitle">Полная аналитика и статистика</p>
        </div>
      </div>

      {/* Overview stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{background:'#e1effe'}}><span>🔧</span></div>
          <div><div className="stat-value">{totalTools}</div><div className="stat-label">{t('totalTools')}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'#def7ec'}}><span>🟢</span></div>
          <div><div className="stat-value" style={{color:'#057a55'}}>{data?.tools?.in_stock||0}</div><div className="stat-label">{t('toolsInStock')}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'#fde8e8'}}><span>🔴</span></div>
          <div><div className="stat-value" style={{color:'#c81e1e'}}>{data?.tools?.issued||0}</div><div className="stat-label">{t('toolsIssued')}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'#f3f4f6'}}><span>⚙️</span></div>
          <div><div className="stat-value" style={{color:'#374151'}}>{data?.tools?.in_repair||0}</div><div className="stat-label">{t('toolsInRepair')}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'#fdf6b2'}}><span>⏰</span></div>
          <div><div className="stat-value" style={{color:'#9f580a'}}>{data?.overdue?.length||0}</div><div className="stat-label">{t('overdueTools')}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'#fde8e8'}}><span>💰</span></div>
          <div><div className="stat-value" style={{color:'#c81e1e',fontSize:16}}>{formatSum(data?.fines?.total)}</div><div className="stat-label">Сумма штрафов</div></div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16}}>
        {[['overview','🏠 Обзор'],['orders','📦 По заказам'],['masters','👥 По мастерам']].map(([k,l])=>(
          <button key={k} className={`btn ${tab===k?'btn-primary':'btn-ghost'}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>

      {/* Overdue */}
      {tab==='overview' && data?.overdue?.length > 0 && (
        <div className="card" style={{marginBottom:20,borderLeft:'4px solid #c81e1e'}}>
          <div className="card-header">
            <h2 className="card-title text-overdue">⚠️ Просроченные инструменты</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Инструмент</th><th>Мастер</th><th>Срок</th><th>Просрочка</th></tr></thead>
              <tbody>
                {data.overdue.map(r => (
                  <tr key={r.id} className="row-overdue">
                    <td>{r.tool_name}</td>
                    <td>{r.master_name}</td>
                    <td>{new Date(r.planned_return).toLocaleDateString('ru-RU')}</td>
                    <td className="text-overdue">+{r.overdue_days} дн. {r.overdue_days>7 && `💰 ${formatSum((r.overdue_days-7)*100000)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Orders */}
      {tab==='orders' && (
        <div className="card">
          <div className="card-header"><h2 className="card-title">{t('orderStats')}</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Заказ</th><th>Заявок</th><th>Инструментов</th><th>Мастеров</th><th>Начало</th><th>Окончание</th></tr></thead>
              <tbody>
                {orders.length === 0
                  ? <tr><td colSpan={6} style={{textAlign:'center',color:'#6b7280',padding:24}}>Нет данных</td></tr>
                  : orders.map((o,i) => (
                  <tr key={i}>
                    <td><strong>{o.order_number}</strong></td>
                    <td>{o.request_count}</td>
                    <td>{o.tool_count}</td>
                    <td>{o.master_count}</td>
                    <td style={{fontSize:12,color:'#6b7280'}}>{o.start_date ? new Date(o.start_date).toLocaleDateString('ru-RU') : '—'}</td>
                    <td style={{fontSize:12,color:'#6b7280'}}>{o.end_date ? new Date(o.end_date).toLocaleDateString('ru-RU') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Masters */}
      {tab==='masters' && (
        <div className="card">
          <div className="card-header"><h2 className="card-title">{t('masterActivity')}</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Мастер</th><th>Заявок</th><th>Активных</th><th>Просрочек</th><th>Штрафы</th><th>Долг</th></tr></thead>
              <tbody>
                {masters.map(m => (
                  <tr key={m.id} className={Number(m.unpaid_fines) > 0 ? 'row-overdue' : ''}>
                    <td><strong>{m.full_name}</strong><br/><span className="text-muted" style={{fontSize:11}}>{m.department||'—'}</span></td>
                    <td>{m.total_requests}</td>
                    <td>{m.active_tools}</td>
                    <td className={Number(m.overdue_count)>0?'text-overdue':''}>{m.overdue_count}</td>
                    <td>{formatSum(m.total_fines)}</td>
                    <td className={Number(m.unpaid_fines)>0?'text-overdue':'text-success'}>{formatSum(m.unpaid_fines)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
