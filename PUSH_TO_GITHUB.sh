#!/bin/bash
# ============================================================
# 📤 Загрузка на GitHub репозиторий instrumenti-isola
# ============================================================

BASE="$(cd "$(dirname "$0")" && pwd)"
GITHUB_USER="muradovnb-cyber"
REPO_NAME="instrumenti-isola"

echo "📤 Загрузка кода на GitHub..."
echo ""

# Инициализируем git
cd "$BASE"
git init
git checkout -b main 2>/dev/null || git checkout main

# Добавляем все файлы
git add .
git status

# Первый коммит
git commit -m "🏭 Инструменты цеха: полная система управления инструментами

- React PWA фронтенд (RU/UZ, мобильная версия)
- Node.js + Express backend API
- PostgreSQL база данных
- Роли: мастер, складовщик, начальник, директор
- Заявки, выдача, возврат, штрафы
- Инвентаризация, аналитика
- Уведомления + Telegram Bot
- Docker Compose для деплоя"

# Создаём репо на GitHub и пушим (нужен токен)
echo ""
echo "Введите ваш GitHub Personal Access Token:"
read -s GITHUB_TOKEN

# Создаём репо через API
curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/user/repos \
  -d "{\"name\":\"$REPO_NAME\",\"description\":\"Система управления инструментами производственного цеха\",\"private\":false}" \
  > /dev/null

# Пушим
git remote remove origin 2>/dev/null || true
git remote add origin "https://$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git"
git push -u origin main

echo ""
echo "✅ Код загружен на GitHub!"
echo "🔗 https://github.com/$GITHUB_USER/$REPO_NAME"
echo ""
echo "Для деплоя на Railway:"
echo "1. Зайдите на railway.app"
echo "2. New Project → Deploy from GitHub repo"
echo "3. Выберите: $GITHUB_USER/$REPO_NAME"
echo "4. Добавьте PostgreSQL плагин"
echo "5. Готово!"
