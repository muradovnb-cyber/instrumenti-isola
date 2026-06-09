const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../config/database');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Укажите логин и пароль' });

    const { rows } = await db.query(
      'SELECT * FROM users WHERE username = $1 AND is_active = TRUE',
      [username]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const { password: _, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, full_name, username, role, phone, telegram_id, department FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/auth/profile — обновить telegram_id
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { telegram_id, phone } = req.body;
    const { rows } = await db.query(
      `UPDATE users SET telegram_id=$1, phone=$2, updated_at=NOW()
       WHERE id=$3 RETURNING id, full_name, username, role, phone, telegram_id`,
      [telegram_id, phone, req.user.id]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/auth/users — все пользователи (только chief/director)
router.get('/users', authenticate, async (req, res) => {
  if (!['production_chief','director'].includes(req.user.role))
    return res.status(403).json({ error: 'Нет доступа' });
  try {
    const { rows } = await db.query(
      `SELECT id, full_name, username, role, phone, department, is_active, created_at
       FROM users ORDER BY role, full_name`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/users — создать пользователя (только director)
router.post('/users', authenticate, async (req, res) => {
  if (req.user.role !== 'director')
    return res.status(403).json({ error: 'Нет доступа' });
  try {
    const { full_name, username, password, role, phone, department } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (full_name, username, password, role, phone, department)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, full_name, username, role`,
      [full_name, username, hash, role, phone, department]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Логин уже занят' });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
