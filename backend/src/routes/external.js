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

// Активные заказы — те, по которым ещё ведётся работа
// и под которые мастер может брать инструменты
const ACTIVE_STATUSES = new Set(['active', 'in_progress']);

// GET /api/external/orders — список заказов из Business Suite
// По умолчанию — только активные. ?include=all чтобы получить все (debug).
router.get('/orders', authenticate, async (req, res) => {
  try {
    const data = await getCachedData(req.query.fresh === '1');
    const clientsById = Object.fromEntries((data.cps || []).map(c => [c.id, c]));
    const usersById   = Object.fromEntries((data.users || []).map(u => [u.id, u]));
    const includeAll  = req.query.include === 'all';

    const allOrders = (data.orders || []).map(o => ({
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

    const orders = includeAll ? allOrders : allOrders.filter(o => ACTIVE_STATUSES.has(o.status));

    // Свежие сверху по created
    orders.sort((a, b) => (b.created || '').localeCompare(a.created || ''));

    res.json({
      orders,
      total_in_suite: allOrders.length,
      shown: orders.length,
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
