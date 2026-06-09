import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import api from '../utils/api';
import { t } from '../utils/i18n';

const MONTHS_RU = ['','Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

const STATUS_MAP = {
  pending:     { cls:'badge-yellow', label:'⏳ Ожидает' },
  in_progress: { cls:'badge-blue',   label:'🔄 В процессе' },
  completed:   { cls:'badge-green',  label:'✅ Завершена' },
  missed:      { cls:'badge-red',    label:'❌ Пропущена' },
};

export default function Inventory() {
  const { user } = useAuth();
  const toast    = useToast();
  const [inventories, setInventories] = useState([]);
  const [active, setActive]   = useState(null);
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [itemLoading, setItemLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  const loadList = () => {
    setLoading(true);
    api.get('/inventory').then(r => setInventories(r.data)).finally(() => setLoading(false));
  };

  useEffect(loadList, []);

  const openInventory = async (inv) => {
    setActive(inv);
    setItemLoading(true);
    const { data } = await api.get(`/inventory/${inv.id}/items`);
    setItems(data);
    setItemLoading(false);
  };

  const startInventory = async () => {
    setStarting(true);
    try {
      await api.post('/inventory');
      toast('Инвентаризация начата!', 'success');
      loadList();
    } catch (e) {
      if (e.response?.data?.id) {
        toast('Инвентаризация уже существует', 'info');
        const inv = inventories.find(i => i.id === e.response.data.id);
        if (inv) openInventory(inv);
      } else {
        toast(e.response?.data?.error || t('error'), 'error');
      }
    } finally { setStarting(false); }
  };

  const markItem = async (toolId, data) => {
    try {
      await api.put(`/inventory/${active.id}/items/${toolId}`, data);
      setItems(prev => prev.map(i => i.tool_id === toolId ? { ...i, ...data, checked_at: new Date().toISOString() } : i));
    } catch { toast(t('error'), 'error'); }
  };

  const complete = async () => {
    if (!window.confirm('Завершить инвентаризацию?')) return;
    try {
      await api.put(`/inventory/${active.id}/complete`);
      toast('Инвентаризация завершена!', 'success');
      setActive(null);
      loadList();
    } catch (e) { toast(e.response?.data?.error || t('error'), 'error'); }
  };

  const now = new Date();
  const canManage = ['warehouse','production_chief','director'].includes(user?.role);
  const checkedCount = items.filter(i => i.is_present !== null && i.is_present !== undefined).length;

  if (active) {
    return (
      <div>
        <div className="page-header">
          <div>
            <button className="btn btn-ghost btn-sm" onClick={()=>setActive(null)} style={{marginBottom:8}}>← Назад</button>
            <h1 className="page-title">📦 Инвентаризация {MONTHS_RU[active.month]} {active.year}</h1>
            <p className="page-subtitle">Проверено: {checkedCount} / {items.length}</p>
          </div>
          {active.status === 'in_progress' && canManage && (
            <button className="btn btn-success" onClick={complete} disabled={checkedCount < items.length}>
              ✅ Завершить ({checkedCount}/{items.length})
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div style={{marginBottom:20}}>
          <div style={{background:'#e5e7eb',borderRadius:8,height:10}}>
            <div style={{
              background: checkedCount === items.length ? '#057a55' : '#1a56db',
              width: `${items.length > 0 ? (checkedCount/items.length*100) : 0}%`,
              height:'100%', borderRadius:8, transition:'width .3s'
            }} />
          </div>
          <div style={{fontSize:12,color:'#6b7280',marginTop:4}}>{Math.round(items.length>0?checkedCount/items.length*100:0)}% завершено</div>
        </div>

        {itemLoading ? (
          <div className="card" style={{padding:40,textAlign:'center'}}>⏳</div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Инструмент</th>
                    <th>Инв. номер</th>
                    <th>Ожид. статус</th>
                    <th>Наличие</th>
                    <th>Состояние</th>
                    <th>Примечание</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.tool_id} style={{background: item.checked_at ? '#f0fdf4' : 'white'}}>
                      <td><strong>{item.tool_name}</strong></td>
                      <td><code>{item.inventory_number}</code></td>
                      <td>
                        <span className={`badge-status ${
                          item.expected_status === 'in_stock' ? 'badge-green' :
                          item.expected_status === 'issued'   ? 'badge-red' : 'badge-gray'
                        }`}>
                          {item.expected_status === 'in_stock' ? 'На складе' :
                           item.expected_status === 'issued'   ? 'Выдан' : 'В ремонте'}
                        </span>
                      </td>
                      <td>
                        {active.status === 'in_progress' && canManage ? (
                          <div style={{display:'flex',gap:6}}>
                            <button className={`btn btn-sm ${item.is_present===true?'btn-success':'btn-ghost'}`}
                              onClick={()=>markItem(item.tool_id, {is_present:true,actual_status:item.expected_status,condition:item.condition||'working'})}>
                              ✅ Есть
                            </button>
                            <button className={`btn btn-sm ${item.is_present===false?'btn-danger':'btn-ghost'}`}
                              onClick={()=>markItem(item.tool_id, {is_present:false,actual_status:'missing',condition:null})}>
                              ❌ Нет
                            </button>
                          </div>
                        ) : (
                          item.is_present === null || item.is_present === undefined ? '—' :
                          item.is_present ? <span className="badge-status badge-green">✅ Есть</span>
                                          : <span className="badge-status badge-red">❌ Нет</span>
                        )}
                      </td>
                      <td>
                        {active.status === 'in_progress' && canManage && item.is_present ? (
                          <select className="form-input form-select" style={{width:'auto',padding:'4px 8px',fontSize:12}}
                            value={item.condition||'working'}
                            onChange={e=>markItem(item.tool_id, {is_present:true,actual_status:item.expected_status,condition:e.target.value})}>
                            <option value="new">Новый</option>
                            <option value="working">Рабочий</option>
                            <option value="needs_repair">Требует ремонта</option>
                          </select>
                        ) : (
                          <span style={{fontSize:12}}>{
                            item.condition==='new'?'Новый':item.condition==='working'?'Рабочий':
                            item.condition==='needs_repair'?'Требует ремонта':'—'
                          }</span>
                        )}
                      </td>
                      <td>{item.checked_at ? <span style={{fontSize:11,color:'#6b7280'}}>
                        {new Date(item.checked_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}
                      </span> : '—'}</td>
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📦 {t('inventory')}</h1>
          <p className="page-subtitle">Ежемесячная инвентаризация склада</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={startInventory} disabled={starting}>
            {starting ? '⏳' : '➕'} {t('startInventory')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="card" style={{padding:40,textAlign:'center'}}>⏳</div>
      ) : inventories.length === 0 ? (
        <div className="card" style={{padding:40,textAlign:'center',color:'#6b7280'}}>
          📦 Инвентаризаций ещё не проводилось.<br />
          <button className="btn btn-primary" style={{marginTop:16}} onClick={startInventory}>
            ➕ {t('startInventory')}
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Период</th><th>Складовщик</th><th>Прогресс</th><th>Статус</th><th>Дата</th><th></th></tr>
              </thead>
              <tbody>
                {inventories.map(inv => {
                  const st = STATUS_MAP[inv.status] || {};
                  const pct = inv.total_items > 0 ? Math.round(inv.checked_items / inv.total_items * 100) : 0;
                  return (
                    <tr key={inv.id}>
                      <td><strong>{MONTHS_RU[inv.month]} {inv.year}</strong></td>
                      <td>{inv.warehouse_name || '—'}</td>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{background:'#e5e7eb',borderRadius:4,height:6,width:100,flex:'none'}}>
                            <div style={{background:'#1a56db',width:`${pct}%`,height:'100%',borderRadius:4}} />
                          </div>
                          <span style={{fontSize:12,color:'#6b7280'}}>{inv.checked_items}/{inv.total_items}</span>
                        </div>
                      </td>
                      <td><span className={`badge-status ${st.cls}`}>{st.label}</span></td>
                      <td style={{fontSize:12,color:'#6b7280'}}>
                        {inv.completed_at ? new Date(inv.completed_at).toLocaleDateString('ru-RU') :
                         inv.started_at  ? new Date(inv.started_at).toLocaleDateString('ru-RU') : '—'}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={()=>openInventory(inv)}>
                          {inv.status==='in_progress'?'✏️ Продолжить':'👁️ Просмотр'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
