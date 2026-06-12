// Прокси к ISOLA Business Suite. Минимально — список заказов
// для селектора в форме заявки. Кэш в памяти, чтобы не дёргать suite на каждый клик.

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');

const SUITE_URL = (process.env.BUSINESS_SUITE_URL || 'https://isola-business-suite-production.up.railway.app').replace(/\/$/, '');
const TTL_MS = 5 * 60 * 1000;

let cache = { data: null, fetchedAt: 0 };

async function fetchSuite() {
  const res = await fetch(`${SUITE_URL}/api/data`, {
    headers: { 'User-Agent': 'isola-tool-management/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Suite responded ${res.status}`);
  const body = await res.json();
  if (!body?.ok) throw new Error('Suite returned ok=false');
  return body.data;
}

async function getCachedData(force = false) {
  const fresh = Date.now() - cache.fetchedAt < TTL_MS;
  if (!force && fresh && cache.data) return cache.data;
  const data = await fetchSuite();
  cache = { data, fetchedAt: Date.now() };
  return data;
}

// GET /api/external/orders — список заказов из Business Suite
router.get('/orders', authenticate, async (req, res) => {
  try {
    const data = await getCachedData(req.query.fresh === '1');
    const clientsById = Object.fromEntries((data.cps || []).map(c => [c.id, c]));
    const usersById   = Object.fromEntries((data.users || []).map(u => [u.id, u]));

    const orders = (data.orders || []).map(o => ({
      id:       o.id,
      title:    o.title,
      status:   o.status,
      created:  o.created,
      closed:   o.closed,
      client:   clientsById[o.cid] ? {
        id:    clientsById[o.cid].id,
        name:  clientsById[o.cid].n,
        phone: clientsById[o.cid].ph,
      } : null,
      manager: usersById[o.mid] ? { id: usersById[o.mid].id, name: usersById[o.mid].n } : null,
      total_uzs: o.uzs || 0,
      total_usd: o.usd || 0,
      // Контракт-номер как он отображается в Business Suite — "ISOLA-{id}-{year}"
      contract_no: `ISOLA-${o.id}-${new Date(o.created || Date.now()).getFullYear()}`,
    }));

    // Свежие сверху, отменённые/закрытые в конце
    const order = { active: 0, in_progress: 1, closed: 2, cancelled: 3 };
    orders.sort((a, b) => {
      const so = (order[a.status] ?? 99) - (order[b.status] ?? 99);
      if (so !== 0) return so;
      return (b.created || '').localeCompare(a.created || '');
    });

    res.json({
      orders,
      suite_url: SUITE_URL,
      cached_at: new Date(cache.fetchedAt).toISOString(),
    });
  } catch (e) {
    console.error('Suite proxy error:', e.message);
    res.status(502).json({ error: 'Не удалось получить список заказов', detail: e.message });
  }
});

// GET /api/external/orders/:id — один заказ
router.get('/orders/:id', authenticate, async (req, res) => {
  try {
    const data = await getCachedData(false);
    const oid = parseInt(req.params.id, 10);
    const o = (data.orders || []).find(x => x.id === oid);
    if (!o) return res.status(404).json({ error: 'Заказ не найден в Business Suite' });
    const client = (data.cps || []).find(c => c.id === o.cid) || null;
    const manager = (data.users || []).find(u => u.id === o.mid) || null;
    res.json({
      id: o.id, title: o.title, status: o.status, created: o.created, closed: o.closed,
      client:  client ? { id: client.id, name: client.n, phone: client.ph } : null,
      manager: manager ? { id: manager.id, name: manager.n } : null,
      total_uzs: o.uzs || 0,
      total_usd: o.usd || 0,
      contract_no: `ISOLA-${o.id}-${new Date(o.created || Date.now()).getFullYear()}`,
      suite_url: `${SUITE_URL}/?order=${o.id}`,
    });
  } catch (e) {
    res.status(502).json({ error: 'Suite недоступна', detail: e.message });
  }
});

module.exports = router;
