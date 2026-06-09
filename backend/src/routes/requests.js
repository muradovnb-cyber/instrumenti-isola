const router = require('express').Router();
const db     = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { sendNotification } = require('../services/notificationService');

const REQUEST_QUERY = `
  SELECT r.*,
    t.name AS tool_name, t.inventory_number, t.photo_url AS tool_photo,
    m.full_name AS master_name,
    w.full_name AS warehouse_name,
    a.full_name AS approved_by_name
  FROM tool_requests r
  JOIN tools t ON r.tool_id = t.id
  JOIN users m ON r.master_id = m.id
  LEFT JOIN users w ON r.warehouse_id = w.id
  LEFT JOIN users a ON r.approved_by = a.id
`;

// GET /api/requests
router.get('/', authenticate, async (req, res) => {
  try {
    const { status } = req.query;
    let sql = REQUEST_QUERY + ' WHERE 1=1';
    const params = [];
    let idx = 1;

    // Мастер видит только свои заявки
    if (req.user.role === 'master') {
      sql += ` AND r.master_id = $${idx++}`;
      params.push(req.user.id);
    }
    if (status) { sql += ` AND r.status = $${idx++}`; params.push(status); }
    sql += ' ORDER BY r.created_at DESC';

    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/requests/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(REQUEST_QUERY + ' WHERE r.id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Заявка не найдена' });
    if (req.user.role === 'master' && rows[0].master_id !== req.user.id)
      return res.status(403).json({ error: 'Нет доступа' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/requests — подать заявку (мастер)
router.post('/', authenticate, authorize('master'), async (req, res) => {
  try {
    const { tool_id, order_number, usage_type, need_date, planned_return, notes, terms_accepted } = req.body;
    if (!terms_accepted) return res.status(400).json({ error: 'Необходимо принять условия' });

    // Проверяем доступность инструмента
    const tool = (await db.query('SELECT * FROM tools WHERE id=$1', [tool_id])).rows[0];
    if (!tool) return res.status(404).json({ error: 'Инструмент не найден' });
    if (tool.status !== 'in_stock') return res.status(409).json({ error: 'Инструмент недоступен' });

    const { rows } = await db.query(`
      INSERT INTO tool_requests
        (tool_id, master_id, order_number, usage_type, need_date, planned_return, notes, terms_accepted)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [tool_id, req.user.id, order_number, usage_type, need_date, planned_return, notes, true]);

    // Уведомляем складовщика и начальника
    const managers = await db.query(
      `SELECT id, telegram_id FROM users WHERE role IN ('warehouse','production_chief') AND is_active=TRUE`
    );
    for (const mgr of managers.rows) {
      await sendNotification(mgr.id, 'new_request', {
        title: 'Новая заявка на инструмент',
        message: `${req.user.full_name} запросил инструмент "${tool.name}" для заказа ${order_number}`,
        telegram_id: mgr.telegram_id,
        metadata: { request_id: rows[0].id },
      });
    }

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/requests/:id/approve — подтвердить (warehouse/chief)
router.put('/:id/approve', authenticate, authorize('warehouse','production_chief','director'), async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const req_row = (await client.query('SELECT * FROM tool_requests WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!req_row) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Заявка не найдена' }); }
    if (req_row.status !== 'pending') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Заявка уже обработана' }); }

    // Выдаём инструмент
    await client.query(
      `UPDATE tool_requests SET status='issued', warehouse_id=$1, approved_by=$1, issued_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [req.user.id, req.params.id]
    );
    await client.query(
      `UPDATE tools SET status='issued', assigned_to=$1, updated_at=NOW() WHERE id=$2`,
      [req_row.master_id, req_row.tool_id]
    );
    await client.query(
      `INSERT INTO tool_history (tool_id, request_id, action, actor_id, notes)
       VALUES ($1,$2,'issued',$3,'Инструмент выдан мастеру')`,
      [req_row.tool_id, req.params.id, req.user.id]
    );

    await client.query('COMMIT');

    // Уведомить мастера
    const master = (await db.query('SELECT * FROM users WHERE id=$1', [req_row.master_id])).rows[0];
    const tool   = (await db.query('SELECT name FROM tools WHERE id=$1', [req_row.tool_id])).rows[0];
    await sendNotification(master.id, 'request_approved', {
      title: 'Заявка одобрена — инструмент выдан',
      message: `Инструмент "${tool.name}" выдан вам. Вернуть до: ${req_row.planned_return}`,
      telegram_id: master.telegram_id,
      metadata: { request_id: req.params.id },
    });

    res.json({ message: 'Инструмент выдан' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// PUT /api/requests/:id/reject — отклонить
router.put('/:id/reject', authenticate, authorize('warehouse','production_chief','director'), async (req, res) => {
  try {
    const { rejection_reason } = req.body;
    await db.query(
      `UPDATE tool_requests SET status='rejected', rejection_reason=$1, updated_at=NOW() WHERE id=$2`,
      [rejection_reason, req.params.id]
    );
    res.json({ message: 'Заявка отклонена' });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/requests/:id/return — возврат инструмента
router.put('/:id/return', authenticate, authorize('warehouse','production_chief','director'), async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const req_row = (await client.query('SELECT * FROM tool_requests WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!req_row || req_row.status !== 'issued')
      { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Инструмент не выдан' }); }

    const today = new Date();
    const planned = new Date(req_row.planned_return);
    const overdueDays = Math.max(0, Math.floor((today - planned) / 86400000));
    const fineAmount = overdueDays > 7 ? (overdueDays - 7) * 100000 : 0;

    await client.query(
      `UPDATE tool_requests SET status='returned', actual_return=$1, returned_at=NOW(),
       fine_days=$2, fine_amount=$3, updated_at=NOW() WHERE id=$4`,
      [today.toISOString().split('T')[0], overdueDays, fineAmount, req.params.id]
    );
    await client.query(
      `UPDATE tools SET status='in_stock', assigned_to=NULL, updated_at=NOW() WHERE id=$1`,
      [req_row.tool_id]
    );
    await client.query(
      `INSERT INTO tool_history (tool_id, request_id, action, actor_id, notes)
       VALUES ($1,$2,'returned',$3,$4)`,
      [req_row.tool_id, req.params.id, req.user.id,
       overdueDays > 0 ? `Возврат с просрочкой ${overdueDays} дн.` : 'Инструмент возвращён']
    );

    if (fineAmount > 0) {
      await client.query(
        `INSERT INTO fines (request_id, master_id, amount, days_overdue, reason)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, req_row.master_id, fineAmount, overdueDays - 7,
         `Просрочка возврата инструмента на ${overdueDays} дней`]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Инструмент принят', overdue_days: overdueDays, fine_amount: fineAmount });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

module.exports = router;
