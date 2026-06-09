import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import api, { formatDate, formatSum } from '../utils/api';
import { t } from '../utils/i18n';

const STATUS_BADGE = {
  pending:  { cls: 'badge-blue',   label: '⏳ Ожидает' },
  approved: { cls: 'badge-green',  label: '✅ Одобрено' },
  issued:   { cls: 'badge-red',    label: '🔴 Выдан' },
  returned: { cls: 'badge-green',  label: '✅ Возвращён' },
  rejected: { cls: 'badge-gray',   label: '❌ Отклонён' },
  overdue:  { cls: 'badge-red',    label: '⚠️ Просрочен' },
};

// ---- Форма новой заявки ----
function RequestForm({ tools, onSuccess, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({
    tool_id: '', order_number: '', usage_type: 'installation',
    need_date: '', planned_return: '', notes: '', terms_accepted: false,
  });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.terms_accepted) return toast('Примите условия использования', 'error');
    setLoading(true);
    try {
      await api.post('/requests', form);
      toast('Заявка подана успешно!', 'success');
      onSuccess();
    } catch (e) {
      toast(e.response?.data?.error || t('error'), 'error');
    } finally { setLoading(false); }
  };

  const availableTools = tools.filter(t => t.status === 'in_stock');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:560}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h2>📝 Новая заявка на инструмент</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">{t('selectTool')} *</label>
              <select className="form-input form-select" value={form.tool_id}
                onChange={e=>setForm(p=>({...p,tool_id:e.target.value}))} required>
                <option value="">— Выберите —</option>
                {availableTools.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.inventory_number})</option>
                ))}
              </select>
              {availableTools.length === 0 && <p className="form-hint">Нет доступных инструментов на складе</p>}
            </div>
            <div className="form-group">
              <label className="form-label">{t('orderNumber')} *</label>
              <input className="form-input" value={form.order_number}
                onChange={e=>setForm(p=>({...p,order_number:e.target.value}))}
                placeholder="ЗАК-2024-001 / Объект: ТЦ Сити" required />
            </div>
            <div className="form-group">
              <label className="form-label">{t('usageType')} *</label>
              <div style={{display:'flex',gap:12}}>
                {[['installation','🏗️ Монтаж'],['workshop','🏭 В цеху']].map(([val,lbl])=>(
                  <label key={val} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',flex:1,
                    padding:'9px 12px',border:`2px solid ${form.usage_type===val?'var(--primary)':'#e5e7eb'}`,
                    borderRadius:8,fontWeight:form.usage_type===val?600:400}}>
                    <input type="radio" value={val} checked={form.usage_type===val}
                      onChange={()=>setForm(p=>({...p,usage_type:val}))} style={{display:'none'}} />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="form-group">
                <label className="form-label">{t('needDate')} *</label>
                <input type="date" className="form-input" value={form.need_date}
                  onChange={e=>setForm(p=>({...p,need_date:e.target.value}))}
                  min={new Date().toISOString().split('T')[0]} required />
              </div>
              <div className="form-group">
                <label className="form-label">{t('returnDate')} *</label>
                <input type="date" className="form-input" value={form.planned_return}
                  onChange={e=>setForm(p=>({...p,planned_return:e.target.value}))}
                  min={form.need_date || new Date().toISOString().split('T')[0]} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('notes')}</label>
              <textarea className="form-input" rows={2} value={form.notes}
                onChange={e=>setForm(p=>({...p,notes:e.target.value}))} />
            </div>
            <label style={{display:'flex',gap:10,cursor:'pointer',padding:'12px',
              background:'#f0fdf4',borderRadius:8,border:'1.5px solid #bbf7d0'}}>
              <input type="checkbox" checked={form.terms_accepted}
                onChange={e=>setForm(p=>({...p,terms_accepted:e.target.checked}))} />
              <span style={{fontSize:13,color:'#166534'}}>{t('termsAccept')}</span>
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '⏳' : `📤 ${t('submit')}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Детали заявки ----
function RequestDetail({ req, onClose, onAction }) {
  const { user } = useAuth();
  const toast    = useToast();
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState('');

  const canAct = ['warehouse','production_chief','director'].includes(user?.role);
  const days = Math.floor((new Date() - new Date(req.planned_return)) / 86400000);

  const action = async (type) => {
    setLoading(type);
    try {
      if (type === 'approve') await api.put(`/requests/${req.id}/approve`);
      else if (type === 'reject') await api.put(`/requests/${req.id}/reject`, { rejection_reason: reason });
      else if (type === 'return') await api.put(`/requests/${req.id}/return`);
      toast(type === 'return' ? 'Инструмент принят' : type === 'approve' ? 'Выдан!' : 'Отклонено', 'success');
      onAction();
      onClose();
    } catch (e) {
      toast(e.response?.data?.error || t('error'), 'error');
    } finally { setLoading(''); }
  };

  const st = STATUS_BADGE[req.status] || {};

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h2>📋 Заявка №{req.id.slice(-6).toUpperCase()}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <span className={`badge-status ${st.cls}`} style={{fontSize:14,padding:'6px 14px'}}>{st.label}</span>
            <span className="text-muted" style={{fontSize:12}}>{new Date(req.created_at).toLocaleString('ru-RU')}</span>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {[
              ['🔧 Инструмент', req.tool_name],
              ['#️⃣ Инв. номер', req.inventory_number],
              ['👤 Мастер', req.master_name],
              ['📦 Заказ', req.order_number],
              ['🏗️ Цель', req.usage_type === 'installation' ? 'Монтаж' : 'Цех'],
              ['📅 Нужен с', formatDate(req.need_date)],
              ['📅 Вернуть до', formatDate(req.planned_return)],
              ['📅 Выдан', req.issued_at ? new Date(req.issued_at).toLocaleString('ru-RU') : '—'],
              req.actual_return && ['📅 Возвращён', formatDate(req.actual_return)],
              req.fine_amount > 0 && ['💰 Штраф', formatSum(req.fine_amount)],
            ].filter(Boolean).map(([k,v]) => (
              <div key={k} style={{padding:'10px',background:'#f9fafb',borderRadius:8}}>
                <div style={{fontSize:11,color:'#6b7280',marginBottom:3}}>{k}</div>
                <div style={{fontWeight:600}}>{v}</div>
              </div>
            ))}
          </div>

          {req.notes && (
            <div style={{marginTop:12,padding:12,background:'#f0f9ff',borderRadius:8,fontSize:13,color:'#1e40af'}}>
              📝 {req.notes}
            </div>
          )}

          {req.rejection_reason && (
            <div style={{marginTop:12,padding:12,background:'#fef2f2',borderRadius:8,fontSize:13,color:'#b91c1c'}}>
              ❌ Причина отказа: {req.rejection_reason}
            </div>
          )}

          {days > 0 && req.status === 'issued' && (
            <div style={{marginTop:12,padding:12,background:'#fef2f2',borderRadius:8,fontSize:13,color:'#b91c1c',fontWeight:600}}>
              ⚠️ Просрочка: {days} дней! {days > 7 ? `Штраф: ${formatSum((days-7)*100000)}` : 'До штрафа: '+(7-days)+' дн.'}
            </div>
          )}

          {reject && (
            <div style={{marginTop:12}}>
              <label className="form-label">{t('rejectionReason')}</label>
              <textarea className="form-input" rows={2} value={reason} onChange={e=>setReason(e.target.value)} />
            </div>
          )}
        </div>

        {canAct && (
          <div className="modal-footer">
            {req.status === 'pending' && !reject && (
              <>
                <button className="btn btn-danger" onClick={()=>setReject(true)}>❌ {t('reject')}</button>
                <button className="btn btn-success" onClick={()=>action('approve')} disabled={loading==='approve'}>
                  {loading==='approve'?'⏳':'✅'} {t('approve')}
                </button>
              </>
            )}
            {reject && (
              <>
                <button className="btn btn-ghost" onClick={()=>setReject(false)}>{t('cancel')}</button>
                <button className="btn btn-danger" onClick={()=>action('reject')} disabled={!reason||loading==='reject'}>
                  {loading==='reject'?'⏳':'❌'} {t('reject')}
                </button>
              </>
            )}
            {req.status === 'issued' && (
              <button className="btn btn-success" onClick={()=>action('return')} disabled={loading==='return'}>
                {loading==='return'?'⏳':'📦'} {t('return')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Requests() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const [params]    = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [tools, setTools]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filterSt, setFilterSt] = useState(params.get('status') || '');
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/requests', { params: { status: filterSt||undefined } }),
      user?.role === 'master' ? api.get('/tools') : Promise.resolve({ data: [] }),
    ]).then(([r, t]) => { setRequests(r.data); setTools(t.data); })
    .catch(console.error)
    .finally(() => setLoading(false));
  }, [filterSt, user]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📝 {t('requests')}</h1>
          <p className="page-subtitle">{requests.length} заявок</p>
        </div>
        {user?.role === 'master' && (
          <button className="btn btn-primary" onClick={()=>setShowForm(true)}>➕ {t('submit')}</button>
        )}
      </div>

      <div className="filter-bar">
        <select className="form-input form-select" value={filterSt} onChange={e=>setFilterSt(e.target.value)} style={{maxWidth:200}}>
          <option value="">{t('all')} статусы</option>
          {Object.entries(STATUS_BADGE).map(([v,{label}])=>(
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="card" style={{padding:40,textAlign:'center'}}>⏳ {t('loading')}</div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Инструмент</th>
                  {user?.role !== 'master' && <th>Мастер</th>}
                  <th>Заказ</th>
                  <th>Вернуть до</th>
                  <th>Статус</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr><td colSpan={6} style={{textAlign:'center',color:'#6b7280',padding:30}}>{t('noData')}</td></tr>
                ) : requests.map(r => {
                  const days = Math.floor((new Date() - new Date(r.planned_return)) / 86400000);
                  const st   = STATUS_BADGE[r.status] || {};
                  return (
                    <tr key={r.id} className={days > 0 && r.status==='issued' ? 'row-overdue' : ''}
                      style={{cursor:'pointer'}} onClick={()=>setSelected(r)}>
                      <td>
                        <strong>{r.tool_name}</strong>
                        <br /><span className="text-muted" style={{fontSize:11}}>{r.inventory_number}</span>
                      </td>
                      {user?.role !== 'master' && <td>{r.master_name}</td>}
                      <td>{r.order_number}</td>
                      <td className={days > 0 && r.status==='issued' ? 'text-overdue' : ''}>
                        {formatDate(r.planned_return)}
                        {days > 0 && r.status==='issued' && <span> ⚠️+{days}д</span>}
                      </td>
                      <td><span className={`badge-status ${st.cls}`}>{st.label}</span></td>
                      <td><button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();setSelected(r);}}>👁️</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <RequestForm tools={tools} onClose={()=>setShowForm(false)} onSuccess={()=>{setShowForm(false);load();}} />
      )}
      {selected && (
        <RequestDetail req={selected} onClose={()=>setSelected(null)} onAction={load} />
      )}
    </div>
  );
}
