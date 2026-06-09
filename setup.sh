#!/bin/bash
set -e

echo "🏭 Установка системы управления инструментами..."
echo ""

PSQL="/opt/homebrew/opt/postgresql@16/bin/psql"
CREATEDB="/opt/homebrew/opt/postgresql@16/bin/createdb"
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. Проверка PostgreSQL
if ! brew services list | grep -q "postgresql@16.*started"; then
  echo "▶️  Запускаю PostgreSQL..."
  brew services start postgresql@16
  sleep 3
fi
echo "✅ PostgreSQL запущен"

# 2. Создать пользователя и БД
echo "▶️  Создаю базу данных..."
$PSQL postgres -c "DROP ROLE IF EXISTS tooluser;" 2>/dev/null || true
$PSQL postgres -c "CREATE USER tooluser WITH PASSWORD 'toolpassword';" 2>/dev/null || true
$CREATEDB -O tooluser toolmanagement 2>/dev/null || echo "   (База уже существует — продолжаем)"
echo "✅ База данных готова"

# 3. Загрузить схему
echo "▶️  Загружаю схему и данные..."
$PSQL -U tooluser -d toolmanagement -f "$BASE_DIR/backend/src/db/schema.sql"
echo "✅ Схема загружена"

# 4. Убить старые процессы
echo "▶️  Очищаю занятые порты..."
lsof -ti:5000 | xargs kill -9 2>/dev/null || true
lsof -ti:5001 | xargs kill -9 2>/dev/null || true
pkill -f "node src/server.js" 2>/dev/null || true
pkill -f "nodemon" 2>/dev/null || true
sleep 2
echo "✅ Порты освобождены"

# 5. Backend
echo ""
echo "▶️  Запускаю backend на порту 5001..."
cd "$BASE_DIR/backend"
npm install --silent
PORT=5001 node src/server.js &
BACKEND_PID=$!
sleep 3

if kill -0 $BACKEND_PID 2>/dev/null; then
  echo "✅ Backend запущен (PID: $BACKEND_PID)"
else
  echo "❌ Ошибка запуска backend"
  exit 1
fi

# 5. Frontend
echo "▶️  Запускаю frontend..."
cd "$BASE_DIR/frontend"
npm install --silent
echo ""
echo "============================================"
echo "✅ Всё готово! Открываю браузер..."
echo "   URL: http://localhost:3000"
echo "   Логин: director / Пароль: admin123"
echo "============================================"
echo ""
REACT_APP_API_URL=http://localhost:5001/api npm start
