const cron = require('node-cron');
const db   = require('../config/database');
const { sendNotification } = require('./notificationService');

// Ежедневно в 9:00 — проверка сроков возврата
cron.schedule('0 9 * * *', async () => {
  console.log('⏰ Checking return deadlines...');
  try {
    const { rows } = await db.query(`
      SELECT r.*, t.name AS tool_name,
        m.id AS master_id, m.full_name AS master_name, m.telegram_id AS master_tg,
        CURRENT_DATE - r.planned_return::date AS days_diff
      FROM tool_requests r
      JOIN tools t ON r.tool_id = t.id
      JOIN users m ON r.master_id = m.id
      WHERE r.status = 'issued'
    `);

    const warehouses = (await db.query(
      `SELECT id, telegram_id FROM users WHERE role='warehouse' AND is_active=TRUE`
    )).rows;
    const chiefs = (await db.query(
      `SELECT id, telegram_id FROM users WHERE role='production_chief' AND is_active=TRUE`
    )).rows;

    for (const req of rows) {
      const daysDiff = parseInt(req.days_diff) || 0;

      // Просрочка > 7 дней — начислить штраф
      if (daysDiff > 7) {
        const dailyFine = 100000;
        await db.query(
          `UPDATE tool_requests SET status='overdue', fine_days=$1, fine_amount=$2, updated_at=NOW() WHERE id=$3`,
          [daysDiff, daysDiff > 7 ? (daysDiff - 7) * dailyFine : 0, req.id]
        );
        const msg = `⚠️ Просрочка ${daysDiff} дней! Штраф: ${((daysDiff-7)*dailyFine).toLocaleString()} сум\nИнструмент: ${req.tool_name}\nЗаказ: ${req.order_number}`;
        await sendNotification(req.master_id, 'overdue_fine', {
          title: 'Начислен штраф за просрочку', message: msg, telegram_id: req.master_tg,
          metadata: { request_id: req.id, fine: (daysDiff-7)*dailyFine },
        });
        for (const u of [...warehouses, ...chiefs]) {
          await sendNotification(u.id, 'overdue_fine', {
            title: 'Штраф мастеру', message: `${req.master_name}: ${msg}`, telegram_id: u.telegram_id,
            metadata: { request_id: req.id },
          });
        }
      }
      // Просрочка 1-7 дней — предупреждение
      else if (daysDiff > 0) {
        const msg = `Инструмент "${req.tool_name}" просрочен на ${daysDiff} дн. Верните немедленно!`;
        await sendNotification(req.master_id, 'overdue_warning', {
          title: 'Просрочка возврата инструмента', message: msg, telegram_id: req.master_tg,
          metadata: { request_id: req.id },
        });
        for (const u of warehouses) {
          await sendNotification(u.id, 'overdue_warning', {
            title: 'Просрочка у мастера', message: `${req.master_name}: ${msg}`, telegram_id: u.telegram_id,
            metadata: { request_id: req.id },
          });
        }
      }
      // Завтра срок возврата
      else if (daysDiff === -1) {
        await sendNotification(req.master_id, 'return_tomorrow', {
          title: '⏰ Завтра нужно вернуть инструмент',
          message: `Завтра срок возврата инструмента "${req.tool_name}" (заказ: ${req.order_number})`,
          telegram_id: req.master_tg,
          metadata: { request_id: req.id },
        });
      }
      // Сегодня срок возврата
      else if (daysDiff === 0) {
        const msg = `Сегодня последний день для возврата инструмента "${req.tool_name}"!`;
        await sendNotification(req.master_id, 'return_today', {
          title: '🔴 Сегодня нужно вернуть инструмент', message: msg, telegram_id: req.master_tg,
          metadata: { request_id: req.id },
        });
        for (const u of warehouses) {
          await sendNotification(u.id, 'return_today', {
            title: 'Ожидается возврат сегодня', message: `${req.master_name}: ${msg}`, telegram_id: u.telegram_id,
            metadata: { request_id: req.id },
          });
        }
      }
    }
  } catch (e) {
    console.error('Scheduler error:', e);
  }
});

// 28 числа каждого месяца — напоминание об инвентаризации
cron.schedule('0 10 28 * *', async () => {
  console.log('📦 Inventory reminder...');
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();
    const inv = (await db.query(
      'SELECT id FROM inventories WHERE month=$1 AND year=$2 AND status=\'completed\'',
      [month, year]
    )).rows[0];

    if (!inv) {
      const warehouses = (await db.query(
        `SELECT id, telegram_id FROM users WHERE role='warehouse' AND is_active=TRUE`
      )).rows;
      for (const u of warehouses) {
        await sendNotification(u.id, 'inventory_reminder', {
          title: '📋 Проведите инвентаризацию!',
          message: `До конца месяца осталось 3 дня. Инвентаризация за ${month}/${year} не проведена!`,
          telegram_id: u.telegram_id,
          metadata: { month, year },
        });
      }
    }
  } catch (e) {
    console.error('Inventory scheduler error:', e);
  }
});

console.log('✅ Scheduler started');
