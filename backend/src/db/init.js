require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function init() {
  try {
    console.log('🔧 Initializing database...');
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await db.query(sql);
    console.log('✅ Database initialized successfully!');
    console.log('\nDefault credentials:');
    console.log('  director  / admin123  → Директор');
    console.log('  chief     / admin123  → Начальник производства');
    console.log('  warehouse / admin123  → Складовщик');
    console.log('  master1   / admin123  → Мастер Жавлон');
    console.log('  master2   / admin123  → Мастер Отабек');
    process.exit(0);
  } catch (e) {
    console.error('❌ DB init error:', e.message);
    process.exit(1);
  }
}

init();
