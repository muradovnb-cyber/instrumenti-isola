const router   = require('express').Router();
const multer   = require('multer');
const path     = require('path');
const db       = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || 'uploads'),
  filename:    (req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/tools
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, condition, search } = req.query;
    let sql = `
      SELECT t.*, u.full_name AS assigned_to_name
      FROM tools t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (status)    { sql += ` AND t.status = $${idx++}`;                        params.push(status); }
    if (condition) { sql += ` AND t.condition = $${idx++}`;                     params.push(condition); }
    if (search)    { sql += ` AND (t.name ILIKE $${idx} OR t.inventory_number ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ' ORDER BY t.name';
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/tools/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT t.*, u.full_name AS assigned_to_name
      FROM tools t LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Инструмент не найден' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/tools — создать инструмент
router.post('/', authenticate, authorize('warehouse','production_chief','director'),
  upload.single('photo'), async (req, res) => {
    try {
      const { name, inventory_number, description, condition, location } = req.body;
      const photo_url = req.file ? `/uploads/${req.file.filename}` : null;
      const { rows } = await db.query(`
        INSERT INTO tools (name, inventory_number, description, condition, photo_url, location)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
      `, [name, inventory_number, description, condition || 'working', photo_url, location]);

      await db.query(`
        INSERT INTO tool_history (tool_id, action, actor_id, notes)
        VALUES ($1,'created',$2,'Инструмент добавлен в систему')
      `, [rows[0].id, req.user.id]);

      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Инвентарный номер уже существует' });
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
);

// PUT /api/tools/:id
router.put('/:id', authenticate, authorize('warehouse','production_chief','director'),
  upload.single('photo'), async (req, res) => {
    try {
      const { name, inventory_number, description, condition, status, location } = req.body;
      const existing = (await db.query('SELECT * FROM tools WHERE id=$1', [req.params.id])).rows[0];
      if (!existing) return res.status(404).json({ error: 'Инструмент не найден' });

      const photo_url = req.file ? `/uploads/${req.file.filename}` : existing.photo_url;
      const { rows } = await db.query(`
        UPDATE tools SET name=$1, inventory_number=$2, description=$3,
          condition=$4, status=$5, photo_url=$6, location=$7, updated_at=NOW()
        WHERE id=$8 RETURNING *
      `, [name || existing.name, inventory_number || existing.inventory_number,
          description, condition || existing.condition, status || existing.status,
          photo_url, location, req.params.id]);

      if (status && status !== existing.status) {
        await db.query(`
          INSERT INTO tool_history (tool_id, action, actor_id, notes)
          VALUES ($1,$2,$3,$4)
        `, [req.params.id, status === 'in_repair' ? 'repaired' : 'inspected',
            req.user.id, `Статус изменён: ${existing.status} → ${status}`]);
      }
      res.json(rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
);

// GET /api/tools/:id/history
router.get('/:id/history', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT h.*, u.full_name AS actor_name, r.order_number
      FROM tool_history h
      JOIN users u ON h.actor_id = u.id
      LEFT JOIN tool_requests r ON h.request_id = r.id
      WHERE h.tool_id = $1 ORDER BY h.created_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
