const router = require('express').Router();
const db     = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { sendNotification } = require('../services/notificationService');

const REQUEST_QUERY = `
  SELECT r.*,
    t.name AS tool_name, t.inventory_number, t.photo_url AS tool_photo,
    m.full_name AS master_name, m.department AS master_department,
    w.full_name AS warehouse_name,
    a.full_name AS approved_by_name,
    ac.full_name AS accepted_by_name
  FROM tool_requests r
  JOIN tools t ON r.tool_id = t.id
  JOIN users m ON r.master_id = m.id
  LEFT JOIN users w ON r.warehouse_id = w.id
  LEFT JOIN users a ON r.approved_by = a.id
  LEFT JOIN users ac ON r.accepted_by = ac.id
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

// Склонение «инструмент» по числу
function plurInstr(n) {
  const last = n % 10, lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'инструментов';
  if (last === 1) return 'инструмент';
  if (last >= 2 && last <= 4) return 'инструмента';
  return 'инструментов';
}

// POST /api/requests/batch — мастер берёт несколько инструментов одной заявкой
// body: { tool_ids: [uuid], order_number, usage_type, need_date, planned_return, notes?, terms_accepted }
router.post('/batch', authenticate, authorize('master'), async (req, res) => {
  const { tool_ids, order_number, usage_type, need_date, planned_return, notes, terms_accepted } = req.body || {};
  if (!Array.isArray(tool_ids) || tool_ids.length === 0)
    return res.status(400).json({ error: 'Выберите хотя бы один инструмент' });
  if (!terms_accepted)
    return res.status(400).json({ error: 'Необходимо принять условия использования' });

  const uniqueIds = [...new Set(tool_ids)];

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Лочим записи инструментов, проверяем что все доступны
    const { rows: tools } = await client.query(
      'SELECT id, name, status FROM tools WHERE id = ANY($1::uuid[]) FOR UPDATE',
      [uniqueIds]
    );
    if (tools.length !== uniqueIds.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Один или несколько инструментов не найдены' });
    }
    const unavailable = tools.filter(t => t.status !== 'in_stock');
    if (unavailable.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Недоступны: ${unavailable.map(t => t.name).join(', ')}`
      });
    }

    // Создаём N заявок в одной транзакции
    const created = [];
    for (const tid of uniqueIds) {
      const { rows } = await client.query(`
        INSERT INTO tool_requests
          (tool_id, master_id, order_number, usage_type, need_date, planned_return, notes, terms_accepted)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
      `, [tid, req.user.id, order_number, usage_type, need_date, planned_return, notes, true]);
      created.push(rows[0]);
    }

    await client.query('COMMIT');

    // Одно уведомление складу/начальнику/директору про всю партию
    const managers = await db.query(
      `SELECT id, telegram_id FROM users WHERE role IN ('warehouse','production_chief','director') AND is_active=TRUE`
    );
    const toolList = tools.map(t => t.name).join(', ');
    for (const mgr of managers.rows) {
      await sendNotification(mgr.id, 'new_request', {
        title: `Новая заявка на ${uniqueIds.length} ${plurInstr(uniqueIds.length)}`,
        message: `${req.user.full_name} запросил для заказа ${order_number}: ${toolList}`,
        telegram_id: mgr.telegram_id,
        metadata: { request_ids: created.map(r => r.id), order_number },
      });
    }

    res.status(201).json({ created: created.length, requests: created });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Batch create error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// PUT /api/requests/batch/request-return — мастер инициирует возврат нескольких сразу
// body: { request_ids: [uuid] }
router.put('/batch/request-return', authenticate, authorize('master'), async (req, res) => {
  const { request_ids } = req.body || {};
  if (!Array.isArray(request_ids) || request_ids.length === 0)
    return res.status(400).json({ error: 'Выберите хотя бы одну заявку' });

  const uniqueIds = [...new Set(request_ids)];

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows: rs } = await client.query(
      `SELECT r.*, t.name AS tool_name
         FROM tool_requests r
         JOIN tools t ON r.tool_id = t.id
        WHERE r.id = ANY($1::uuid[])
          AND r.master_id = $2
          AND r.status = 'issued'
        FOR UPDATE`,
      [uniqueIds, req.user.id]
    );
    if (rs.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Нет ваших заявок в статусе «Выдан»' });
    }

    await client.query(
      `UPDATE tool_requests
          SET status='return_requested', return_requested_at=NOW(), updated_at=NOW()
        WHERE id = ANY($1::uuid[])`,
      [rs.map(r => r.id)]
    );

    await client.query('COMMIT');

    // Одно уведомление складу про всю партию
    const managers = await db.query(
      `SELECT id, telegram_id FROM users WHERE role IN ('warehouse','production_chief','director') AND is_active=TRUE`
    );
    const toolList = rs.map(r => r.tool_name).join(', ');
    for (const m of managers.rows) {
      await sendNotification(m.id, 'return_requested', {
        title: `Запрос на приём — ${rs.length} ${plurInstr(rs.length)}`,
        message: `${req.user.full_name} готов сдать: ${toolList}`,
        telegram_id: m.telegram_id,
        metadata: { request_ids: rs.map(r => r.id) },
      });
    }

    res.json({ accepted: rs.length, ids: rs.map(r => r.id) });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Batch return request error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
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

// PUT /api/requests/:id/request-return — мастер просит склад принять инструмент
router.put('/:id/request-return', authenticate, authorize('master'), async (req, res) => {
  try {
    const r = (await db.query('SELECT * FROM tool_requests WHERE id=$1', [req.params.id])).rows[0];
    if (!r) return res.status(404).json({ error: 'Заявка не найдена' });
    if (r.master_id !== req.user.id) return res.status(403).json({ error: 'Это не ваша заявка' });
    if (r.status !== 'issued') return res.status(409).json({ error: 'Заявка должна быть в статусе «Выдан»' });

    await db.query(
      `UPDATE tool_requests SET status='return_requested', return_requested_at=NOW(), updated_at=NOW()
       WHERE id=$1`,
      [req.params.id]
    );

    const tool = (await db.query('SELECT name FROM tools WHERE id=$1', [r.tool_id])).rows[0];
    const managers = await db.query(
      `SELECT id, telegram_id FROM users WHERE role IN ('warehouse','production_chief','director') AND is_active=TRUE`
    );
    for (const m of managers.rows) {
      await sendNotification(m.id, 'return_requested', {
        title: 'Запрос на приём инструмента',
        message: `${req.user.full_name} готов вернуть «${tool.name}» (заказ ${r.order_number}). Проверьте и примите со склада.`,
        telegram_id: m.telegram_id,
        metadata: { request_id: r.id },
      });
    }

    res.json({ message: 'Запрос на приём отправлен складу' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/requests/:id/cancel-return — мастер отменяет запрос на приём (передумал)
router.put('/:id/cancel-return', authenticate, authorize('master'), async (req, res) => {
  try {
    const r = (await db.query('SELECT * FROM tool_requests WHERE id=$1', [req.params.id])).rows[0];
    if (!r) return res.status(404).json({ error: 'Заявка не найдена' });
    if (r.master_id !== req.user.id) return res.status(403).json({ error: 'Это не ваша заявка' });
    if (r.status !== 'return_requested') return res.status(409).json({ error: 'Заявка не в статусе ожидания приёма' });

    await db.query(
      `UPDATE tool_requests SET status='issued', return_requested_at=NULL, updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    res.json({ message: 'Запрос на приём отменён' });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/requests/:id/return — склад принимает инструмент с проверкой состояния
// body: { condition: 'working'|'needs_repair', return_notes?: string }
router.put('/:id/return', authenticate, authorize('warehouse','production_chief','director'), async (req, res) => {
  const condition = (req.body?.condition === 'needs_repair') ? 'needs_repair' : 'working';
  const returnNotes = (req.body?.return_notes || '').trim() || null;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const req_row = (await client.query('SELECT * FROM tool_requests WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!req_row) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Заявка не найдена' }); }
    if (!['issued','return_requested','overdue'].includes(req_row.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Инструмент не выдан или уже принят' });
    }

    const today = new Date();
    const planned = new Date(req_row.planned_return);
    const overdueDays = Math.max(0, Math.floor((today - planned) / 86400000));
    const fineAmount = overdueDays > 7 ? (overdueDays - 7) * 100000 : 0;

    await client.query(
      `UPDATE tool_requests
         SET status='returned',
             actual_return=$1,
             returned_at=NOW(),
             accepted_by=$2,
             return_condition=$3,
             return_notes=$4,
             fine_days=$5,
             fine_amount=$6,
             updated_at=NOW()
       WHERE id=$7`,
      [today.toISOString().split('T')[0], req.user.id, condition, returnNotes,
       overdueDays, fineAmount, req.params.id]
    );

    // Если требует ремонта — отправляем в ремонт, иначе в наличие
    if (condition === 'needs_repair') {
      await client.query(
        `UPDATE tools SET status='in_repair', condition='needs_repair',
                          assigned_to=NULL, updated_at=NOW() WHERE id=$1`,
        [req_row.tool_id]
      );
    } else {
      await client.query(
        `UPDATE tools SET status='in_stock', assigned_to=NULL, updated_at=NOW() WHERE id=$1`,
        [req_row.tool_id]
      );
    }

    const historyNote = [
      condition === 'needs_repair' ? 'Принят с дефектом → в ремонт' : 'Принят на склад',
      overdueDays > 0 ? `просрочка ${overdueDays} дн.` : null,
      returnNotes ? `Заметка: ${returnNotes}` : null,
    ].filter(Boolean).join(' · ');

    await client.query(
      `INSERT INTO tool_history (tool_id, request_id, action, actor_id, notes)
       VALUES ($1,$2,'returned',$3,$4)`,
      [req_row.tool_id, req.params.id, req.user.id, historyNote]
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

    // Уведомить мастера о приёме
    const master = (await db.query('SELECT telegram_id FROM users WHERE id=$1', [req_row.master_id])).rows[0];
    const tool = (await db.query('SELECT name FROM tools WHERE id=$1', [req_row.tool_id])).rows[0];
    const msgParts = [`Склад принял «${tool.name}» (${condition === 'needs_repair' ? 'отмечен как требующий ремонта' : 'в рабочем состоянии'}).`];
    if (overdueDays > 0) msgParts.push(`Просрочка: ${overdueDays} дн.`);
    if (fineAmount > 0) msgParts.push(`Начислен штраф: ${fineAmount.toLocaleString()} сум.`);
    await sendNotification(req_row.master_id, 'return_accepted', {
      title: 'Инструмент принят складом',
      message: msgParts.join(' '),
      telegram_id: master?.telegram_id,
      metadata: { request_id: req.params.id, condition, fine: fineAmount },
    });

    res.json({
      message: 'Инструмент принят',
      condition,
      overdue_days: overdueDays,
      fine_amount: fineAmount
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

module.exports = router;
