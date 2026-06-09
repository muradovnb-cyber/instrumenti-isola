#!/bin/bash
# ============================================================
# 🏭 ЗАПУСК: Система управления инструментами цеха
# Просто запустите этот файл и откройте браузер!
# ============================================================

BASE="$(cd "$(dirname "$0")" && pwd)"
PSQL="/opt/homebrew/opt/postgresql@16/bin/psql"

echo ""
echo "🏭 Запуск системы управления инструментами..."
echo ""

# 1. Убиваем старые процессы
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:3002 | xargs kill -9 2>/dev/null || true
pkill -f "node src/server.js" 2>/dev/null || true
sleep 1

# 2. PostgreSQL
brew services start postgresql@16 2>/dev/null || true
sleep 2

# 3. База данных (создаём если не существует)
/opt/homebrew/opt/postgresql@16/bin/createdb -O tooluser toolmanagement 2>/dev/null || true

# 4. Backend (запускаем в фоне — он сам загрузит схему)
echo "▶️  Запуск backend..."
cd "$BASE/backend"
PORT=8080 node src/server.js &
BACKEND_PID=$!
sleep 3

if kill -0 $BACKEND_PID 2>/dev/null; then
  echo "✅ Backend запущен на порту 8080"
else
  echo "❌ Backend не запустился. Проверьте логи выше."
  exit 1
fi

# 5. Frontend
echo "▶️  Запуск frontend..."
cd "$BASE/frontend"
npm install --silent 2>/dev/null

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ СИСТЕМА ЗАПУСКАЕТСЯ...               ║"
echo "║                                          ║"
echo "║  Откройте браузер: http://localhost:3000 ║"
echo "║                                          ║"
echo "║  Логин: director  | Пароль: admin123     ║"
echo "║  Логин: chief     | Пароль: admin123     ║"
echo "║  Логин: warehouse | Пароль: admin123     ║"
echo "║  Логин: master1   | Пароль: admin123     ║"
echo "╚══════════════════════════════════════════╝"
echo ""

REACT_APP_API_URL=http://localhost:8080/api npm start
