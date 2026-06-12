import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import api, { formatDate, formatSum } from '../utils/api';
import { t } from '../utils/i18n';

const STATUS_BADGE = {
  pending:          { cls: 'badge-blue',   label: 'Ожидает выдачи' },
  approved:         { cls: 'badge-green',  label: 'Одобрено' },
  issued:           { cls: 'badge-yellow', label: 'Выдан мастеру' },
  return_requested: { cls: 'badge-blue',   label: 'Готов к приёмке' },
  returned:         { cls: 'badge-green',  label: 'Принят' },
  rejected:         { cls: 'badge-gray',   label: 'Отклонён' },
  overdue:          { cls: 'badge-red',    label: 'Просрочен' },
};

// ---- Форма новой заявки (мульти-выбор инструментов) ----
function RequestForm({ tools, onSuccess, onClose }) {
  const toast = useToast();
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    order_number: '', usage_type: 'installation',
    need_date: '', planned_return: '', notes: '', terms_accepted: false,
  });
  const [loading, setLoading] = useState(false);

  const availableTools = tools
    .filter(t => t.status === 'in_stock')
    .filter(t => !search.trim() || (
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.inventory_number || '').toLowerCase().includes(search.toLowerCase())
    ));

  const toggleTool = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (selectedIds.length === 0) return toast('Выберите хотя бы один инструмент', 'error');
    if (!form.terms_accepted) return toast('Примите условия использования', 'error');

    setLoading(true);
    try {
      const res = await api.post('/requests/batch', {
        tool_ids: selectedIds,
        ...form,
      });
      toast(`Заявка подана: ${res.data.created} инстр.`, 'success');
      onSuccess();
    } catch (e) {
      toast(e.response?.data?.error || 'Ошибка', 'error');
    } finally { setLoading(false); }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:600}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h2>Новая заявка{selectedIds.length > 0 && ` · выбрано ${selectedIds.length}`}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">

            {/* Tool multi-select */}
            <div className="form-group">
              <label className="form-label">
                Инструменты * <span style={{color:'var(--text-muted)',fontWeight:400}}>
                  (можно выбрать несколько)
                </span>
              </label>
              <input className="form-input" placeholder="Поиск по названию или инв. номеру…"
                value={search} onChange={e=>setSearch(e.target.value)}
                style={{marginBottom: 8}}
                autoCapitalize="none" autoCorrect="off" />

              {availableTools.length === 0 ? (
                <div style={{padding:'14px',background:'var(--bg-warm)',borderRadius:8,
                  border:'1px dashed var(--border)',fontSize:13,color:'var(--text-muted)',textAlign:'center'}}>
                  {search ? 'Ничего не нашлось' : 'Нет доступных инструментов на складе'}
                </div>
              ) : (
                <div style={{maxHeight:260,overflowY:'auto',border:'1px solid var(--border)',
                  borderRadius:8,background:'#fff'}}>
                  {availableTools.map(tool => {
                    const checked = selectedIds.includes(tool.id);
                    return (
                      <label key={tool.id} style={{
                        display:'flex',alignItems:'center',gap:12,
                        padding:'10px 14px',cursor:'pointer',
                        borderBottom:'1px solid var(--border)',
                        background: checked ? 'var(--primary-l)' : '#fff',
                      }}>
                        <input type="checkbox" checked={checked} onChange={()=>toggleTool(tool.id)}
                          style={{width:18,height:18,accentColor:'var(--isola-green-700)',flexShrink:0}} />
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:13.5}}>{tool.name}</div>
                          <div style={{fontSize:11.5,color:'var(--text-muted)',fontFamily:'SF Mono, Menlo, monospace'}}>
                            {tool.inventory_number}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {selectedIds.length > 0 && (
                <div style={{marginTop:8,fontSize:12,color:'var(--isola-green-800)',fontWeight:600}}>
                  Выбрано: {selectedIds.length} {' '}
                  <button type="button"
                    onClick={()=>setSelectedIds([])}
                    style={{background:'none',border:'none',color:'var(--text-muted)',
                      fontSize:12,textDecoration:'underline',cursor:'pointer'}}>
                    очистить
                  </button>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Номер заказа / Объект *</label>
              <input className="form-input" value={form.order_number}
                onChange={e=>setForm(p=>({...p,order_number:e.target.value}))}
                placeholder="ЗАК-2026-001 / Объект: ТЦ Сити" required />
              <p className="form-hint">Один номер заказа объединит все выбранные инструменты в одной партии</p>
            </div>

            <div className="form-group">
              <label className="form-label">Где будут использоваться *</label>
              <div style={{display:'flex',gap:10}}>
                {[['installation','Монтаж на объекте'],['workshop','Работа в цеху']].map(([val,lbl])=>(
                  <label key={val} style={{
                    flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6,cursor:'pointer',
                    padding:'10px 12px',
                    border:`2px solid ${form.usage_type===val?'var(--isola-green-700)':'var(--border)'}`,
                    background: form.usage_type===val ? 'var(--primary-l)' : '#fff',
                    borderRadius:8,
                    fontWeight: form.usage_type===val ? 600 : 500,
                    fontSize: 13,
                  }}>
                    <input type="radio" value={val} checked={form.usage_type===val}
                      onChange={()=>setForm(p=>({...p,usage_type:val}))} style={{display:'none'}} />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="form-group">
                <label className="form-label">Когда нужен *</label>
                <input type="date" className="form-input" value={form.need_date}
                  onChange={e=>setForm(p=>({...p,need_date:e.target.value}))}
                  min={today} required />
              </div>
              <div className="form-group">
                <label className="form-label">Вернуть до *</label>
                <input type="date" className="form-input" value={form.planned_return}
                  onChange={e=>setForm(p=>({...p,planned_return:e.target.value}))}
                  min={form.need_date || today} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Заметка (опционально)</label>
              <textarea className="form-input" rows={2} value={form.notes}
                onChange={e=>setForm(p=>({...p,notes:e.target.value}))}
                placeholder="Любая деталь, которую полезно знать складу" />
            </div>

            <label className="form-checkbox" style={{
              padding:'12px 14px',background:'var(--success-bg)',
              border:'1.5px solid var(--success)',borderRadius:8,
              fontSize:13,color:'var(--success)',display:'flex',gap:10,
            }}>
              <input type="checkbox" checked={form.terms_accepted}
                onChange={e=>setForm(p=>({...p,terms_accepted:e.target.checked}))} />
              <span>Принимаю ответственность за выбранные инструменты до момента приёмки складом</span>
            </label>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn-primary" disabled={loading || selectedIds.length === 0}>
              {loading ? 'Отправка…'
                : selectedIds.length === 0 ? 'Выберите инструменты'
                : selectedIds.length === 1 ? 'Подать заявку'
                : `Подать заявку (${selectedIds.length} инстр.)`}
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
  const [accepting, setAccepting] = useState(false);  // склад открыл форму приёма
  const [acceptCondition, setAcceptCondition] = useState('working');
  const [acceptNotes, setAcceptNotes] = useState('');
  const [loading, setLoading] = useState('');

  const isMaster = user?.role === 'master';
  const isWarehouseSide = ['warehouse','production_chief','director'].includes(user?.role);
  const days = Math.floor((new Date() - new Date(req.planned_return)) / 86400000);
  const isOverdue = days > 0 && (req.status === 'issued' || req.status === 'return_requested');
  const projectedFine = days > 7 ? (days - 7) * 100000 : 0;

  const action = async (type) => {
    setLoading(type);
    try {
      if (type === 'approve')        await api.put(`/requests/${req.id}/approve`);
      else if (type === 'reject')    await api.put(`/requests/${req.id}/reject`, { rejection_reason: reason });
      else if (type === 'request-return') await api.put(`/requests/${req.id}/request-return`);
      else if (type === 'cancel-return')  await api.put(`/requests/${req.id}/cancel-return`);
      else if (type === 'accept-return')  await api.put(`/requests/${req.id}/return`, {
        condition: acceptCondition,
        return_notes: acceptNotes,
      });

      const msgs = {
        'approve':        'Инструмент выдан мастеру',
        'reject':         'Заявка отклонена',
        'request-return': 'Запрос на приём отправлен складу',
        'cancel-return':  'Запрос на приём отменён',
        'accept-return':  acceptCondition === 'needs_repair'
                            ? 'Принят, инструмент отправлен в ремонт'
                            : 'Инструмент принят на склад',
      };
      toast(msgs[type] || 'Готово', 'success');
      onAction();
      onClose();
    } catch (e) {
      toast(e.response?.data?.error || 'Ошибка', 'error');
    } finally { setLoading(''); }
  };

  const st = STATUS_BADGE[req.status] || {};

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h2>Заявка №{req.id.slice(-6).toUpperCase()}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,gap:12,flexWrap:'wrap'}}>
            <span className={`badge-status ${st.cls}`} style={{fontSize:13,padding:'5px 12px'}}>{st.label}</span>
            <span className="text-muted" style={{fontSize:12}}>{new Date(req.created_at).toLocaleString('ru-RU')}</span>
          </div>

          {/* Подсказка по статусу */}
          {req.status === 'return_requested' && (
            <div style={{marginBottom:16,padding:'12px 14px',background:'var(--info-bg)',borderRadius:8,
              borderLeft:'3px solid var(--info)',fontSize:13,color:'var(--info)'}}>
              <strong>Готов к приёмке.</strong> Мастер {req.master_name.split(' ')[0]} сообщил, что готов сдать инструмент
              {req.return_requested_at && ` (${new Date(req.return_requested_at).toLocaleString('ru-RU')})`}.
              {isWarehouseSide && ' Проверьте состояние и подтвердите приём.'}
              {isMaster && ' Ожидайте, склад проверит и подтвердит.'}
            </div>
          )}

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {[
              ['Инструмент', req.tool_name],
              ['Инв. номер', req.inventory_number],
              ['Мастер', req.master_name + (req.master_department ? ` · ${req.master_department}` : '')],
              ['Заказ', req.order_number],
              ['Цель', req.usage_type === 'installation' ? 'Монтаж на объекте' : 'Работа в цеху'],
              ['Нужен с', formatDate(req.need_date)],
              ['Вернуть до', formatDate(req.planned_return)],
              req.issued_at && ['Выдан', new Date(req.issued_at).toLocaleString('ru-RU')],
              req.approved_by_name && ['Выдал', req.approved_by_name],
              req.actual_return && ['Принят', formatDate(req.actual_return)],
              req.accepted_by_name && ['Принял', req.accepted_by_name],
              req.return_condition && ['Состояние при возврате',
                req.return_condition === 'needs_repair' ? '⚠️ Требует ремонта' : '✅ Рабочее'],
              req.fine_amount > 0 && ['Штраф', formatSum(req.fine_amount)],
            ].filter(Boolean).map(([k,v]) => (
              <div key={k} style={{padding:'10px 12px',background:'var(--bg-warm)',borderRadius:8,border:'1px solid var(--border)'}}>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:3}}>{k}</div>
                <div style={{fontWeight:600,fontSize:13,wordBreak:'break-word'}}>{v}</div>
              </div>
            ))}
          </div>

          {req.notes && (
            <div style={{marginTop:12,padding:'12px 14px',background:'var(--info-bg)',borderRadius:8,fontSize:13,color:'var(--info)'}}>
              <strong>Заметка мастера:</strong> {req.notes}
            </div>
          )}
          {req.return_notes && (
            <div style={{marginTop:12,padding:'12px 14px',background:'var(--warning-bg)',borderRadius:8,fontSize:13,color:'var(--warning)'}}>
              <strong>Заметка склада при приёме:</strong> {req.return_notes}
            </div>
          )}
          {req.rejection_reason && (
            <div style={{marginTop:12,padding:'12px 14px',background:'var(--danger-bg)',borderRadius:8,fontSize:13,color:'var(--danger)'}}>
              <strong>Причина отказа:</strong> {req.rejection_reason}
            </div>
          )}

          {isOverdue && (
            <div style={{marginTop:12,padding:'12px 14px',background:'var(--danger-bg)',borderRadius:8,
              borderLeft:'3px solid var(--danger)',fontSize:13,color:'var(--danger)',fontWeight:600}}>
              Просрочка: {days} {days===1?'день':days<5?'дня':'дней'}.
              {days > 7
                ? ` Штраф: ${formatSum(projectedFine)}`
                : ` До штрафа осталось ${7-days} дн.`}
            </div>
          )}

          {/* Форма приёма (склад) */}
          {accepting && (
            <div style={{marginTop:16,padding:'16px',background:'var(--primary-l)',borderRadius:10,
              border:'1px solid var(--isola-green-600)'}}>
              <h3 style={{fontSize:14,marginBottom:12,color:'var(--isola-green-900)'}}>
                Приём инструмента — проверьте состояние
              </h3>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
                {[
                  ['working',      '✅ Рабочее',         'Вернуть на склад'],
                  ['needs_repair', '⚠️ Нужен ремонт',  'Отправить в ремонт'],
                ].map(([v,lbl,sub])=>(
                  <label key={v} style={{
                    cursor:'pointer',padding:'12px',
                    background:'#fff',
                    border:`2px solid ${acceptCondition===v ? 'var(--isola-green-700)' : 'var(--border)'}`,
                    borderRadius:8,
                    display:'flex',flexDirection:'column',gap:4,
                  }}>
                    <input type="radio" name="cond" value={v} style={{display:'none'}}
                      checked={acceptCondition===v} onChange={()=>setAcceptCondition(v)} />
                    <span style={{fontWeight:600,fontSize:13}}>{lbl}</span>
                    <span style={{fontSize:11,color:'var(--text-muted)'}}>{sub}</span>
                  </label>
                ))}
              </div>
              <label className="form-label">Заметка о состоянии (опционально)</label>
              <textarea className="form-input" rows={2}
                placeholder={acceptCondition==='needs_repair'
                  ? 'Опишите дефект: что не работает, какие признаки износа…'
                  : 'Можно указать дату следующей проверки или любую заметку'}
                value={acceptNotes} onChange={e=>setAcceptNotes(e.target.value)} />
              {isOverdue && (
                <p style={{marginTop:8,fontSize:12,color:'var(--text-muted)'}}>
                  При подтверждении система автоматически {projectedFine > 0
                    ? `начислит штраф ${formatSum(projectedFine)}`
                    : 'отметит просрочку (без штрафа — менее 7 дней)'}.
                </p>
              )}
            </div>
          )}

          {reject && (
            <div style={{marginTop:16}}>
              <label className="form-label">Причина отказа</label>
              <textarea className="form-input" rows={2} value={reason} onChange={e=>setReason(e.target.value)}
                placeholder="Почему заявка отклонена…" />
            </div>
          )}
        </div>

        {/* Footer с действиями */}
        <div className="modal-footer">
          {/* Мастер: запрос на возврат / отмена запроса */}
          {isMaster && req.status === 'issued' && (
            <button className="btn btn-primary" onClick={()=>action('request-return')} disabled={loading==='request-return'}>
              {loading==='request-return' ? 'Отправка…' : 'Готов вернуть — позвать склад'}
            </button>
          )}
          {isMaster && req.status === 'return_requested' && (
            <button className="btn btn-ghost" onClick={()=>action('cancel-return')} disabled={loading==='cancel-return'}>
              {loading==='cancel-return' ? '…' : 'Отменить запрос'}
            </button>
          )}

          {/* Склад / Нодир / Я: выдача и отклонение */}
          {isWarehouseSide && req.status === 'pending' && !reject && (
            <>
              <button className="btn btn-danger" onClick={()=>setReject(true)}>Отклонить</button>
              <button className="btn btn-success" onClick={()=>action('approve')} disabled={loading==='approve'}>
                {loading==='approve' ? '…' : 'Выдать инструмент'}
              </button>
            </>
          )}
          {isWarehouseSide && reject && (
            <>
              <button className="btn btn-ghost" onClick={()=>setReject(false)}>Отмена</button>
              <button className="btn btn-danger" onClick={()=>action('reject')} disabled={!reason||loading==='reject'}>
                {loading==='reject' ? '…' : 'Подтвердить отказ'}
              </button>
            </>
          )}

          {/* Склад: приём возврата */}
          {isWarehouseSide && (req.status === 'issued' || req.status === 'return_requested') && !accepting && (
            <button className="btn btn-primary" onClick={()=>setAccepting(true)}>
              Принять инструмент
            </button>
          )}
          {isWarehouseSide && accepting && (
            <>
              <button className="btn btn-ghost" onClick={()=>setAccepting(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={()=>action('accept-return')} disabled={loading==='accept-return'}>
                {loading==='accept-return' ? 'Принимаем…'
                  : acceptCondition==='needs_repair' ? 'Принять с дефектом' : 'Принять в рабочем виде'}
              </button>
            </>
          )}
        </div>
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
