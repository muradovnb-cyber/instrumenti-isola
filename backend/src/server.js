require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');

const app = express();

// Создать папку uploads если нет
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', uploadDir)));

// Routes
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/tools',         require('./routes/tools'));
app.use('/api/requests',      require('./routes/requests'));
app.use('/api/fines',         require('./routes/fines'));
app.use('/api/inventory',     require('./routes/inventory'));
app.use('/api/analytics',     require('./routes/analytics'));
app.use('/api/notifications', require('./routes/notifications'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// 404
app.use((req, res) => res.status(404).json({ error: 'Маршрут не найден' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  // Авто-инициализация БД (запускается всегда — безопасно т.к. IF NOT EXISTS)
  try {
    const fs = require('fs');
    const pathMod = require('path');
    const db = require('./config/database');
    const sql = fs.readFileSync(pathMod.join(__dirname, 'db', 'schema.sql'), 'utf8');
    await db.query(sql);
    console.log('✅ Database schema ready');
  } catch (e) {
    console.log('ℹ️  DB init note:', e.message.slice(0, 120));
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    require('./services/scheduler');
  });
}

startServer();

module.exports = app;
