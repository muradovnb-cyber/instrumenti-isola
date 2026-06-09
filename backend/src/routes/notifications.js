const router = require('express').Router();
const db     = require('../config/database');
const { authenticate } = require('../middleware/auth');

// GET /api/notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id=$1 AND is_read=FALSE`,
      [req.user.id]
    );
    res.json({ count: parseInt(rows[0].count) });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/notifications/mark-all-read
router.put('/mark-all-read', authenticate, async (req, res) => {
  try {
    await db.query(`UPDATE notifications SET is_read=TRUE WHERE user_id=$1`, [req.user.id]);
    res.json({ message: 'Все уведомления прочитаны' });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    await db.query(`UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    res.json({ message: 'OK' });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
