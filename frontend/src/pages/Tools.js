import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import api from '../utils/api';
import { t } from '../utils/i18n';

const API_BASE = process.env.REACT_APP_API_URL?.replace('/api','') || 'http://localhost:5000';

const STATUS_MAP = {
  in_stock:  { label: 'На складе',  cls: 'badge-green',  dot: '🟢' },
  issued:    { label: 'Выдан',      cls: 'badge-red',    dot: '🔴' },
  in_repair: { label: 'В ремонте',  cls: 'badge-gray',   dot: '⚫' },
};
const COND_MAP = {
  new:          { label: 'Новый',            cls: 'badge-blue' },
  working:      { label: 'Рабочий',          cls: 'badge-green' },
  needs_repair: { label: 'Требует ремонта',  cls: 'badge-yellow' },
};

function ToolModal({ tool, onClose, onSave }) {
  const toast = useToast();
  const [form, setForm] = useState(tool || { name:'', inventory_number:'', description:'', condition:'working', status:'in_stock', location:'' });
  const [photo, setPhoto] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k,v]) => fd.append(k, v ?? ''));
      if (photo) fd.append('photo', photo);
      if (tool?.id) {
        const { data } = await api.put(`/tools/${tool.id}`, fd, { headers:{'Content-Type':'multipart/form-data'} });
        onSave(data, 'edit');
      } else {
        const { data } = await api.post('/tools', fd, { headers:{'Content-Type':'multipart/form-data'} });
        onSave(data, 'add');
      }
      toast(tool?.id ? 'Инструмент обновлён' : 'Инструмент добавлен', 'success');
      onClose();
    } catch (e) {
      toast(e.response?.data?.error || t('error'), 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{tool?.id ? 'Редактировать' : 'Добавить'} инструмент</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">{t('toolName')} *</label>
              <input className="form-input" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} required />
            </div>
            <div className="form-group">
              <label className="form-label">{t('inventoryNumber')} *</label>
              <input className="form-input" value={form.inventory_number} onChange={e=>setForm(p=>({...p,inventory_number:e.target.value}))} placeholder="INV-001" required />
            </div>
            <div className="form-group">
              <label className="form-label">Описание</label>
              <textarea className="form-input" rows={2} value={form.description||''} onChange={e=>setForm(p=>({...p,description:e.target.value}))} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="form-group">
                <label className="form-label">{t('condition')}</label>
                <select className="form-input form-select" value={form.condition} onChange={e=>setForm(p=>({...p,condition:e.target.value}))}>
                  <option value="new">Новый</option>
                  <option value="working">Рабочий</option>
                  <option value="needs_repair">Требует ремонта</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('status')}</label>
                <select className="form-input form-select" value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}>
                  <option value="in_stock">На складе</option>
                  <option value="in_repair">В ремонте</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('location')}</label>
              <input className="form-input" value={form.location||''} onChange={e=>setForm(p=>({...p,location:e.target.value}))} placeholder="Стеллаж А-3" />
            </div>
            <div className="form-group">
              <label className="form-label">{t('toolPhoto')}</label>
              <input type="file" accept="image/*" onChange={e=>setPhoto(e.target.files[0])} />
              {tool?.photo_url && !photo && (
                <img src={`${API_BASE}${tool.photo_url}`} alt="" style={{width:80,height:60,objectFit:'cover',borderRadius:6,marginTop:8}} />
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? '⏳' : t('save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Tools() {
  const { user }        = useAuth();
  const toast           = useToast();
  const [params]        = useSearchParams();
  const [tools, setTools]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filterStatus, setFilterStatus] = useState(params.get('status') || '');
  const [filterCond, setFilterCond]     = useState('');
  const [view, setView]   = useState('grid');
  const [modal, setModal] = useState(null); // null | 'add' | tool_obj

  const canManage = ['warehouse','production_chief','director'].includes(user?.role);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/tools', { params: { status: filterStatus||undefined, condition: filterCond||undefined, search: search||undefined } })
      .then(r => setTools(r.data))
      .catch(() => toast(t('error'), 'error'))
      .finally(() => setLoading(false));
  }, [filterStatus, filterCond, search, toast]);

  useEffect(() => { load(); }, [load]);

  const handleSave = (tool, mode) => {
    if (mode === 'add') setTools(p => [tool, ...p]);
    else setTools(p => p.map(t => t.id === tool.id ? tool : t));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🔧 {t('tools')}</h1>
          <p className="page-subtitle">{tools.length} инструментов</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className={`btn ${view==='grid'?'btn-primary':'btn-ghost'} btn-sm`} onClick={()=>setView('grid')}>⊞</button>
          <button className={`btn ${view==='list'?'btn-primary':'btn-ghost'} btn-sm`} onClick={()=>setView('list')}>☰</button>
          {canManage && <button className="btn btn-primary" onClick={()=>setModal('add')}>➕ {t('add')}</button>}
        </div>
      </div>

      <div className="filter-bar">
        <input className="form-input" placeholder={t('search')} value={search}
          onChange={e=>setSearch(e.target.value)} style={{flex:1,maxWidth:280}} />
        <select className="form-input form-select" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="">{t('all')} статусы</option>
          <option value="in_stock">🟢 На складе</option>
          <option value="issued">🔴 Выдан</option>
          <option value="in_repair">⚫ В ремонте</option>
        </select>
        <select className="form-input form-select" value={filterCond} onChange={e=>setFilterCond(e.target.value)}>
          <option value="">{t('all')} состояния</option>
          <option value="new">Новый</option>
          <option value="working">Рабочий</option>
          <option value="needs_repair">Требует ремонта</option>
        </select>
      </div>

      {loading ? (
        <div className="card" style={{padding:40,textAlign:'center'}}>⏳ {t('loading')}</div>
      ) : tools.length === 0 ? (
        <div className="card" style={{padding:40,textAlign:'center',color:'#6b7280'}}>
          🔍 {t('noData')}
        </div>
      ) : view === 'grid' ? (
        <div className="tools-grid">
          {tools.map(tool => {
            const st = STATUS_MAP[tool.status] || {};
            const cd = COND_MAP[tool.condition] || {};
            return (
              <div key={tool.id} className={`tool-card status-${tool.status}`}>
                {tool.photo_url ? (
                  <img src={`${API_BASE}${tool.photo_url}`} alt={tool.name} className="tool-photo" />
                ) : (
                  <div className="tool-photo" style={{background:'#f3f4f6'}}>🔧</div>
                )}
                <div className="tool-body">
                  <div className="tool-name">{tool.name}</div>
                  <div className="tool-inv">{tool.inventory_number}</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    <span className={`badge-status ${st.cls}`}>{st.dot} {st.label}</span>
                    <span className={`badge-status ${cd.cls}`}>{cd.label}</span>
                  </div>
                  {tool.assigned_to_name && (
                    <div style={{fontSize:12,color:'#6b7280',marginTop:8}}>
                      👤 {tool.assigned_to_name}
                    </div>
                  )}
                </div>
                {canManage && (
                  <div className="tool-footer">
                    <span style={{fontSize:11,color:'#6b7280'}}>{tool.location||'—'}</span>
                    <button className="btn btn-ghost btn-sm" onClick={()=>setModal(tool)}>✏️</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>#</th><th>Инструмент</th><th>{t('inventoryNumber')}</th><th>{t('status')}</th><th>{t('condition')}</th><th>Выдан кому</th><th>Место</th>{canManage&&<th></th>}</tr>
              </thead>
              <tbody>
                {tools.map((tool, i) => {
                  const st = STATUS_MAP[tool.status] || {};
                  const cd = COND_MAP[tool.condition] || {};
                  return (
                    <tr key={tool.id}>
                      <td>{i+1}</td>
                      <td><strong>{tool.name}</strong></td>
                      <td><code>{tool.inventory_number}</code></td>
                      <td><span className={`badge-status ${st.cls}`}>{st.dot} {st.label}</span></td>
                      <td><span className={`badge-status ${cd.cls}`}>{cd.label}</span></td>
                      <td>{tool.assigned_to_name || '—'}</td>
                      <td>{tool.location || '—'}</td>
                      {canManage && <td><button className="btn btn-ghost btn-sm" onClick={()=>setModal(tool)}>✏️</button></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <ToolModal
          tool={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
