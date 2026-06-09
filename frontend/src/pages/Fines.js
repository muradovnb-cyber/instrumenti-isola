import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import api, { formatSum, formatDate } from '../utils/api';
import { t } from '../utils/i18n';

export default function Fines() {
  const { user } = useAuth();
  const toast    = useToast();
  const [fines, setFines]     = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('list');

  const isAdmin = ['production_chief','director'].includes(user?.role);

  const load = () => {
    setLoading(true);
    const calls = [api.get('/fines')];
    if (isAdmin) calls.push(api.get('/fines/summary'));
    Promise.all(calls).then(([f, s]) => {
      setFines(f.data);
      if (s) setSummary(s.data);
    }).catch(console.error)
    .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const markPaid = async (id) => {
    try {
      await api.put(`/fines/${id}/pay`);
      toast('Штраф отмечен как оплаченный', 'success');
      load();
    } catch { toast(t('error'), 'error'); }
  };

  const totalUnpaid = fines.filter(f => !f.is_paid).reduce((a,f) => a + Number(f.amount), 0);
  const totalAll    = fines.reduce((a,f) => a + Number(f.amount), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">💰 {t('fines')}</h1>
          <p className="page-subtitle">Штрафная система</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))'}}>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'#fde8e8'}}><span>💰</span></div>
          <div><div className="stat-value" style={{color:'#c81e1e',fontSize:18}}>{formatSum(totalAll)}</div><div className="stat-label">Всего штрафов</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'#fdf6b2'}}><span>⏳</span></div>
          <div><div className="stat-value" style={{color:'#9f580a',fontSize:18}}>{formatSum(totalUnpaid)}</div><div className="stat-label">Неоплачено</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'#def7ec'}}><span>✅</span></div>
          <div><div className="stat-value" style={{color:'#057a55',fontSize:18}}>{formatSum(totalAll-totalUnpaid)}</div><div className="stat-label">Оплачено</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'#e1effe'}}><span>📋</span></div>
          <div><div className="stat-value" style={{color:'#1a56db'}}>{fines.length}</div><div className="stat-label">Записей</div></div>
        </div>
      </div>

      {/* Tabs */}
      {isAdmin && (
        <div style={{display:'flex',gap:4,marginBottom:16}}>
          {[['list','📋 Все штрафы'],['summary','👥 По мастерам']].map(([k,l])=>(
            <button key={k} className={`btn ${tab===k?'btn-primary':'btn-ghost'}`} onClick={()=>setTab(k)}>{l}</button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="card" style={{padding:40,textAlign:'center'}}>⏳</div>
      ) : tab === 'list' ? (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {isAdmin && <th>Мастер</th>}
                  <th>Инструмент</th>
                  <th>Заказ</th>
                  <th>Просрочка</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  {isAdmin && <th>Действие</th>}
                </tr>
              </thead>
              <tbody>
                {fines.length === 0 ? (
                  <tr><td colSpan={7} style={{textAlign:'center',color:'#6b7280',padding:30}}>🎉 Штрафов нет!</td></tr>
                ) : fines.map(f => (
                  <tr key={f.id} className={!f.is_paid ? 'row-overdue' : ''}>
                    {isAdmin && <td><strong>{f.master_name}</strong></td>}
                    <td>{f.tool_name}</td>
                    <td>{f.order_number}</td>
                    <td className="text-overdue">{f.days_overdue} дн.</td>
                    <td><strong className="text-overdue">{formatSum(f.amount)}</strong></td>
                    <td>
                      {f.is_paid
                        ? <span className="badge-status badge-green">✅ Оплачен {f.paid_at && formatDate(f.paid_at)}</span>
                        : <span className="badge-status badge-red">❌ Не оплачен</span>
                      }
                    </td>
                    {isAdmin && <td>
                      {!f.is_paid && (
                        <button className="btn btn-success btn-sm" onClick={()=>markPaid(f.id)}>✅ Оплачен</button>
                      )}
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Мастер</th><th>Всего</th><th>Оплачено</th><th>Долг</th><th>Кол-во</th></tr>
              </thead>
              <tbody>
                {summary.map(s => (
                  <tr key={s.id} className={Number(s.debt_amount) > 0 ? 'row-overdue' : ''}>
                    <td><strong>{s.full_name}</strong><br/><span className="text-muted" style={{fontSize:11}}>{s.department||'—'}</span></td>
                    <td>{formatSum(s.total_amount)}</td>
                    <td className="text-success">{formatSum(s.paid_amount)}</td>
                    <td className={Number(s.debt_amount) > 0 ? 'text-overdue' : 'text-success'}>{formatSum(s.debt_amount)}</td>
                    <td>{s.fine_count}</td>
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
