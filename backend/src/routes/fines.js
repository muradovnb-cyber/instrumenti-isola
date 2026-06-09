const router = require('express').Router();
const db     = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/fines
router.get('/', authenticate, async (req, res) => {
  try {
    let sql = `
      SELECT f.*, u.full_name AS master_name,
        t.name AS tool_name, r.order_number, r.planned_return, r.actual_return
      FROM fines f
      JOIN users u ON f.master_id = u.id
      JOIN tool_requests r ON f.request_id = r.id
      JOIN tools t ON r.tool_id = t.id
      WHERE 1=1
    `;
    const params = [];
    if (req.user.role === 'master') {
      sql += ' AND f.master_id = $1';
      params.push(req.user.id);
    }
    sql += ' ORDER BY f.created_at DESC';
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/fines/summary — итоги по мастерам
router.get('/summary', authenticate, authorize('production_chief','director'), async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.full_name, u.department,
        COUNT(f.id) AS fine_count,
        SUM(f.amount) AS total_amount,
        SUM(CASE WHEN f.is_paid THEN f.amount ELSE 0 END) AS paid_amount,
        SUM(CASE WHEN NOT f.is_paid THEN f.amount ELSE 0 END) AS debt_amount
      FROM users u
      LEFT JOIN fines f ON u.id = f.master_id
      WHERE u.role = 'master'
      GROUP BY u.id, u.full_name, u.department
      ORDER BY debt_amount DESC NULLS LAST
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/fines/:id/pay — отметить штраф оплаченным
router.put('/:id/pay', authenticate, authorize('production_chief','director'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE fines SET is_paid=TRUE, paid_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Штраф не найден' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
