import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';

const STATUS_LABEL = {
  active:      'Активный',
  in_progress: 'В работе',
  closed:      'Закрыт',
  cancelled:   'Отменён',
};
const STATUS_CLASS = {
  active:      'badge-blue',
  in_progress: 'badge-yellow',
  closed:      'badge-green',
  cancelled:   'badge-gray',
};

function fmtUZS(n) {
  return (Number(n) || 0).toLocaleString('ru-RU');
}

/**
 * value         — текущий external_order_id (number | null)
 * orderNumber   — текстовое поле order_number (для autofill)
 * onChange({ external_order_id, order_number, suite_url })
 */
export default function OrderPicker({ value, orderNumber, onChange }) {
  const [orders, setOrders] = useState([]);
  const [suiteUrl, setSuiteUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [query, setQuery]   = useState('');
  const [open, setOpen]     = useState(false);

  const fetchOrders = (force = false) => {
    setLoading(true);
    setError('');
    api.get('/external/orders', { params: force ? { fresh: 1 } : {} })
      .then(r => {
        setOrders(r.data.orders || []);
        setSuiteUrl(r.data.suite_url || '');
      })
      .catch(e => setError(e.response?.data?.error || 'Не удалось получить список заказов'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchOrders(false); }, []);

  const selected = useMemo(
    () => orders.find(o => o.id === value) || null,
    [orders, value]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return orders;
    const q = query.toLowerCase();
    return orders.filter(o =>
      String(o.id).includes(q) ||
      (o.title || '').toLowerCase().includes(q) ||
      (o.contract_no || '').toLowerCase().includes(q) ||
      (o.client?.name || '').toLowerCase().includes(q)
    );
  }, [orders, query]);

  const pick = (o) => {
    onChange({
      external_order_id: o.id,
      order_number: o.contract_no + (o.client?.name ? ` · ${o.client.name}` : ''),
      suite_url: `${suiteUrl}/?order=${o.id}`,
    });
    setOpen(false);
    setQuery('');
  };

  const clearPick = () => {
    onChange({ external_order_id: null, order_number: '', suite_url: '' });
  };

  return (
    <div>
      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Заказ из ISOLA Business Suite</span>
        <button
          type="button"
          onClick={() => fetchOrders(true)}
          style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}
          disabled={loading}
        >
          {loading ? 'Загружаем…' : '↻ Обновить'}
        </button>
      </label>

      {error && (
        <div style={{ padding: '10px 12px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 8, fontSize: 12, marginBottom: 8 }}>
          {error} — введите номер заказа вручную ниже.
        </div>
      )}

      {selected ? (
        <div style={{
          padding: '12px 14px',
          background: 'var(--primary-l)',
          border: '1.5px solid var(--isola-green-700)',
          borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>
              {selected.contract_no} · {selected.title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              {selected.client?.name || '—'}
              {' · '}
              {fmtUZS(selected.total_uzs)} сум
              {' · '}
              <span className={`badge-status ${STATUS_CLASS[selected.status] || 'badge-gray'}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                {STATUS_LABEL[selected.status] || selected.status}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn btn-ghost btn-sm"
          >
            Сменить
          </button>
          <button
            type="button"
            onClick={clearPick}
            className="btn btn-ghost btn-sm"
            title="Очистить"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="form-input"
          style={{
            textAlign: 'left',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            background: '#fff',
          }}
          disabled={loading || !!error}
        >
          {loading ? 'Загружаем список заказов…' : 'Выбрать заказ из Business Suite →'}
        </button>
      )}

      {orderNumber && !selected && (
        <p className="form-hint" style={{ marginTop: 6 }}>
          Сейчас введён вручную: <strong>{orderNumber}</strong>
        </p>
      )}

      {/* Модалка выбора заказа */}
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Выберите заказ</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ paddingBottom: 8 }}>
              <input
                className="form-input"
                placeholder="Поиск по номеру, названию или клиенту…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus={false}
                style={{ marginBottom: 8 }}
              />
              <p className="form-hint" style={{ marginBottom: 12 }}>
                Показаны только активные заказы из Business Suite
              </p>
              {filtered.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Ничего не нашлось
                </div>
              ) : (
                <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  {filtered.map(o => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => pick(o)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 4,
                        padding: '12px 14px',
                        background: '#fff',
                        border: 'none',
                        borderBottom: '1px solid var(--border)',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                          {o.contract_no} · {o.title || '(без названия)'}
                        </span>
                        <span className={`badge-status ${STATUS_CLASS[o.status] || 'badge-gray'}`} style={{ flexShrink: 0 }}>
                          {STATUS_LABEL[o.status] || o.status}
                        </span>
                      </div>
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        {o.client?.name || '— без клиента —'} · {fmtUZS(o.total_uzs)} сум{o.created ? ` · ${o.created}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
