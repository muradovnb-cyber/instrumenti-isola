# 🏭 Система управления инструментами производственного цеха

Полноценное веб-приложение для учёта, выдачи и контроля инструментов на складе производственного предприятия.

---

## 🚀 Быстрый старт (Docker)

```bash
# 1. Скопируйте .env
cp .env.example .env

# 2. (Опционально) Добавьте Telegram Bot Token в .env
# TELEGRAM_BOT_TOKEN=ваш_токен_от_@BotFather

# 3. Запуск
docker compose up --build

# Приложение будет доступно:
# Frontend: http://localhost:3000
# Backend API: http://localhost:5000/api
```

---

## 🔑 Тестовые аккаунты (пароль для всех: `admin123`)

| Логин     | Роль                  | Доступ                                      |
|-----------|-----------------------|---------------------------------------------|
| director  | Директор              | Полный доступ + аналитика                   |
| chief     | Начальник производства| Подтверждение, аналитика, штрафы            |
| warehouse | Складовщик            | Выдача, приём, инвентаризация               |
| master1   | Мастер Жавлон         | Подача заявок, просмотр своих заявок        |
| master2   | Мастер Отабек         | Подача заявок, просмотр своих заявок        |

---

## 📦 Стек технологий

| Компонент   | Технология          |
|-------------|---------------------|
| Frontend    | React 18 + PWA      |
| Backend     | Node.js + Express   |
| База данных | PostgreSQL 16       |
| Авторизация | JWT (ролевая)       |
| Уведомления | Telegram Bot + БД   |
| Контейнеры  | Docker + Compose    |
| Веб-сервер  | Nginx               |

---

## 🗂️ Структура проекта

```
tool-management/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── server.js              # Точка входа
│       ├── config/database.js     # PostgreSQL pool
│       ├── middleware/auth.js     # JWT middleware
│       ├── routes/
│       │   ├── auth.js            # Авторизация, пользователи
│       │   ├── tools.js           # CRUD инструментов
│       │   ├── requests.js        # Заявки, выдача, возврат
│       │   ├── fines.js           # Штрафы
│       │   ├── inventory.js       # Инвентаризация
│       │   ├── analytics.js       # Дашборд, статистика
│       │   └── notifications.js   # Уведомления
│       ├── services/
│       │   ├── notificationService.js  # Отправка уведомлений
│       │   └── scheduler.js            # Cron задачи
│       └── db/
│           ├── schema.sql         # Схема БД + начальные данные
│           └── init.js            # Инициализация БД
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    └── src/
        ├── App.js                 # Роутинг, защита страниц
        ├── index.js               # PWA entry point
        ├── index.css              # Глобальные стили
        ├── contexts/AuthContext.js
        ├── components/
        │   ├── Sidebar.js         # Навигация + языковой переключатель
        │   └── Toast.js           # Уведомления интерфейса
        ├── pages/
        │   ├── Login.js
        │   ├── Dashboard.js       # Главный экран по роли
        │   ├── Tools.js           # Список инструментов (сетка/таблица)
        │   ├── Requests.js        # Заявки + форма подачи
        │   ├── Fines.js           # Штрафы
        │   ├── Inventory.js       # Инвентаризация
        │   ├── Analytics.js       # Аналитика и отчёты
        │   └── Notifications.js   # Уведомления
        └── utils/
            ├── api.js             # Axios + хелперы
            └── i18n.js            # RU/UZ переводы
```

---

## 📋 API маршруты

### Авторизация
- `POST /api/auth/login` — вход
- `GET /api/auth/me` — текущий пользователь
- `GET /api/auth/users` — список пользователей (chief/director)
- `POST /api/auth/users` — создать пользователя (director)

### Инструменты
- `GET /api/tools` — список (фильтры: status, condition, search)
- `GET /api/tools/:id` — детали
- `POST /api/tools` — добавить (с фото)
- `PUT /api/tools/:id` — редактировать
- `GET /api/tools/:id/history` — история

### Заявки
- `GET /api/requests` — список
- `POST /api/requests` — подать заявку (мастер)
- `PUT /api/requests/:id/approve` — выдать инструмент
- `PUT /api/requests/:id/reject` — отклонить
- `PUT /api/requests/:id/return` — принять возврат (+ штраф если просрочка)

### Штрафы
- `GET /api/fines` — список
- `GET /api/fines/summary` — по мастерам
- `PUT /api/fines/:id/pay` — отметить оплаченным

### Инвентаризация
- `GET /api/inventory` — список
- `POST /api/inventory` — начать
- `GET /api/inventory/:id/items` — позиции
- `PUT /api/inventory/:id/items/:tool_id` — отметить позицию
- `PUT /api/inventory/:id/complete` — завершить

### Аналитика
- `GET /api/analytics/dashboard` — сводка
- `GET /api/analytics/orders` — по заказам
- `GET /api/analytics/masters` — по мастерам

---

## ⚙️ Настройка Telegram Bot

1. Создайте бота через @BotFather → получите токен
2. Добавьте токен в `.env`: `TELEGRAM_BOT_TOKEN=ваш_токен`
3. Пользователь должен написать боту `/start` и запомнить свой chat_id
4. В профиле пользователя укажите `telegram_id`

---

## 🔔 Система уведомлений (автоматически каждый день в 9:00)

| Срок | Действие |
|------|----------|
| -1 день | Напоминание мастеру о завтрашнем возврате |
| 0 дней | Напоминание мастеру + складовщику |
| +1-7 дней | Предупреждение о просрочке |
| +8 и более | Штраф 100 000 сум/день (сверх 7 дней) |
| 28 числа | Напоминание о инвентаризации если не проведена |

---

## 💰 Штрафная система

- Просрочка **до 7 дней** — предупреждение, штрафа нет
- Просрочка **после 7 дней** — **100 000 сум за каждый день** сверх 7
- Пример: 10 дней просрочки = 3 дня × 100 000 = **300 000 сум**
- Штрафы отображаются в профиле мастера
- Начальник/директор могут отметить штраф оплаченным

---

## 🎨 Цветовая индикация

| Цвет | Значение |
|------|----------|
| 🟢 Зелёный | Инструмент на складе |
| 🔴 Красный | Инструмент выдан |
| 🟡 Жёлтый | Скоро срок возврата |
| ⚫ Серый | Инструмент в ремонте |
| ⚠️ Красный фон строки | Просрочка |
