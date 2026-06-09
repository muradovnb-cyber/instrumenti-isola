const router = require('express').Router();
const db     = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/inventory — список инвентаризаций
router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT i.*, u.full_name AS warehouse_name,
        COUNT(ii.id) AS total_items,
        SUM(CASE WHEN ii.is_present IS NOT NULL THEN 1 ELSE 0 END) AS checked_items
      FROM inventories i
      LEFT JOIN users u ON i.warehouse_id = u.id
      LEFT JOIN inventory_items ii ON i.id = ii.inventory_id
      GROUP BY i.id, u.full_name ORDER BY i.year DESC, i.month DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/inventory — начать инвентаризацию
router.post('/', authenticate, authorize('warehouse','production_chief','director'), async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const now = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    const existing = (await client.query(
      'SELECT id FROM inventories WHERE month=$1 AND year=$2', [month, year]
    )).rows[0];
    if (existing) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Инвентаризация за этот месяц уже существует', id: existing.id });
    }

    const inv = (await client.query(`
      INSERT INTO inventories (month, year, warehouse_id, status, started_at)
      VALUES ($1,$2,$3,'in_progress',NOW()) RETURNING *
    `, [month, year, req.user.id])).rows[0];

    // Добавить все инструменты
    const tools = (await client.query('SELECT id, status, condition FROM tools')).rows;
    for (const tool of tools) {
      await client.query(
        `INSERT INTO inventory_items (inventory_id, tool_id, expected_status)
         VALUES ($1,$2,$3)`,
        [inv.id, tool.id, tool.status]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ ...inv, total_items: tools.length });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// GET /api/inventory/:id/items
router.get('/:id/items', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT ii.*, t.name AS tool_name, t.inventory_number, t.photo_url
      FROM inventory_items ii
      JOIN tools t ON ii.tool_id = t.id
      WHERE ii.inventory_id = $1
      ORDER BY t.name
    `, [req.params.id]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/inventory/:id/items/:tool_id — отметить инструмент
router.put('/:id/items/:tool_id', authenticate, authorize('warehouse','production_chief','director'), async (req, res) => {
  try {
    const { is_present, actual_status, condition, notes } = req.body;
    const { rows } = await db.query(`
      UPDATE inventory_items SET is_present=$1, actual_status=$2, condition=$3, notes=$4, checked_at=NOW()
      WHERE inventory_id=$5 AND tool_id=$6 RETURNING *
    `, [is_present, actual_status, condition, notes, req.params.id, req.params.tool_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Позиция не найдена' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/inventory/:id/complete — завершить инвентаризацию
router.put('/:id/complete', authenticate, authorize('warehouse','production_chief','director'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE inventories SET status='completed', completed_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Инвентаризация не найдена' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
