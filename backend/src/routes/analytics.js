const router = require('express').Router();
const db     = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/analytics/dashboard — сводка для начальника/директора
router.get('/dashboard', authenticate, authorize('production_chief','director','warehouse'), async (req, res) => {
  try {
    const [tools, requests, fines, overdue] = await Promise.all([
      db.query(`SELECT status, COUNT(*) AS count FROM tools GROUP BY status`),
      db.query(`SELECT status, COUNT(*) AS count FROM tool_requests GROUP BY status`),
      db.query(`SELECT SUM(amount) AS total, SUM(CASE WHEN is_paid THEN amount ELSE 0 END) AS paid FROM fines`),
      db.query(`
        SELECT r.id, t.name AS tool_name, m.full_name AS master_name,
          r.planned_return,
          CURRENT_DATE - r.planned_return::date AS overdue_days
        FROM tool_requests r
        JOIN tools t ON r.tool_id = t.id
        JOIN users m ON r.master_id = m.id
        WHERE r.status = 'issued' AND r.planned_return < CURRENT_DATE
        ORDER BY overdue_days DESC
      `),
    ]);

    res.json({
      tools:    Object.fromEntries(tools.rows.map(r => [r.status, parseInt(r.count)])),
      requests: Object.fromEntries(requests.rows.map(r => [r.status, parseInt(r.count)])),
      fines:    fines.rows[0],
      overdue:  overdue.rows,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/analytics/orders — статистика по заказам
router.get('/orders', authenticate, authorize('production_chief','director'), async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT r.order_number,
        COUNT(DISTINCT r.id) AS request_count,
        COUNT(DISTINCT r.tool_id) AS tool_count,
        COUNT(DISTINCT r.master_id) AS master_count,
        MIN(r.need_date) AS start_date,
        MAX(COALESCE(r.actual_return, r.planned_return)) AS end_date
      FROM tool_requests r
      WHERE r.status != 'rejected'
      GROUP BY r.order_number
      ORDER BY start_date DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/analytics/masters — активность мастеров
router.get('/masters', authenticate, authorize('production_chief','director'), async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.full_name, u.department,
        COUNT(r.id) AS total_requests,
        SUM(CASE WHEN r.status = 'issued' THEN 1 ELSE 0 END) AS active_tools,
        SUM(CASE WHEN r.status = 'overdue' THEN 1 ELSE 0 END) AS overdue_count,
        COALESCE(SUM(f.amount),0) AS total_fines,
        COALESCE(SUM(CASE WHEN NOT f.is_paid THEN f.amount ELSE 0 END),0) AS unpaid_fines
      FROM users u
      LEFT JOIN tool_requests r ON u.id = r.master_id
      LEFT JOIN fines f ON u.id = f.master_id
      WHERE u.role = 'master'
      GROUP BY u.id, u.full_name, u.department
      ORDER BY total_requests DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
