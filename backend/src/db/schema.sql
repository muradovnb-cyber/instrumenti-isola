-- ================================================================
-- СХЕМА БАЗЫ ДАННЫХ: Управление инструментами производственного цеха
-- ================================================================

-- Расширения
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------
-- ПОЛЬЗОВАТЕЛИ
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name   VARCHAR(200) NOT NULL,
    username    VARCHAR(100) NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,
    role        VARCHAR(50) NOT NULL CHECK (role IN ('master','warehouse','production_chief','director')),
    phone       VARCHAR(20),
    telegram_id BIGINT,
    department  VARCHAR(100),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- ИНСТРУМЕНТЫ
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tools (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             VARCHAR(200) NOT NULL,
    inventory_number VARCHAR(100) NOT NULL UNIQUE,
    description      TEXT,
    condition        VARCHAR(50) NOT NULL DEFAULT 'working'
                     CHECK (condition IN ('new','working','needs_repair')),
    status           VARCHAR(50) NOT NULL DEFAULT 'in_stock'
                     CHECK (status IN ('in_stock','issued','in_repair')),
    photo_url        TEXT,
    location         VARCHAR(100),
    assigned_to      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- ЗАЯВКИ НА ИНСТРУМЕНТЫ
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tool_requests (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_id          UUID NOT NULL REFERENCES tools(id) ON DELETE RESTRICT,
    master_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    warehouse_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by      UUID REFERENCES users(id) ON DELETE SET NULL,

    order_number     VARCHAR(200) NOT NULL,
    usage_type       VARCHAR(50) NOT NULL CHECK (usage_type IN ('installation','workshop')),
    status           VARCHAR(50) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','issued','return_requested','returned','rejected','overdue')),

    need_date        DATE NOT NULL,
    planned_return   DATE NOT NULL,
    actual_return    DATE,
    issued_at        TIMESTAMPTZ,
    return_requested_at TIMESTAMPTZ,
    returned_at      TIMESTAMPTZ,
    accepted_by      UUID REFERENCES users(id) ON DELETE SET NULL,

    terms_accepted   BOOLEAN NOT NULL DEFAULT FALSE,
    notes            TEXT,
    rejection_reason TEXT,
    return_condition VARCHAR(50) CHECK (return_condition IS NULL OR return_condition IN ('working','needs_repair')),
    return_notes     TEXT,

    fine_amount      BIGINT DEFAULT 0,  -- в сумах
    fine_days        INT DEFAULT 0,

    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Миграция для уже существующих БД: добавить новый статус и поля
DO $$
BEGIN
    -- Новые колонки (idempotent)
    ALTER TABLE tool_requests ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMPTZ;
    ALTER TABLE tool_requests ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE tool_requests ADD COLUMN IF NOT EXISTS return_condition VARCHAR(50);
    ALTER TABLE tool_requests ADD COLUMN IF NOT EXISTS return_notes TEXT;

    -- Пересоздать CHECK status с новым значением return_requested
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'tool_requests'
          AND constraint_name LIKE '%tool_requests_status_check%'
    ) THEN
        ALTER TABLE tool_requests DROP CONSTRAINT IF EXISTS tool_requests_status_check;
    END IF;
    ALTER TABLE tool_requests ADD CONSTRAINT tool_requests_status_check
        CHECK (status IN ('pending','approved','issued','return_requested','returned','rejected','overdue'));

    -- CHECK для return_condition
    ALTER TABLE tool_requests DROP CONSTRAINT IF EXISTS tool_requests_return_condition_check;
    ALTER TABLE tool_requests ADD CONSTRAINT tool_requests_return_condition_check
        CHECK (return_condition IS NULL OR return_condition IN ('working','needs_repair'));

    -- Связь с заказом в ISOLA Business Suite
    ALTER TABLE tool_requests ADD COLUMN IF NOT EXISTS external_order_id INT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_requests_external_order ON tool_requests(external_order_id);

-- ----------------------------------------------------------------
-- ШТРАФЫ
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fines (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id  UUID NOT NULL REFERENCES tool_requests(id) ON DELETE CASCADE,
    master_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    amount      BIGINT NOT NULL,          -- сумы
    days_overdue INT NOT NULL,
    reason      TEXT,
    is_paid     BOOLEAN DEFAULT FALSE,
    paid_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- ИСТОРИЯ ВЫДАЧИ / ВОЗВРАТА
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tool_history (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_id     UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    request_id  UUID REFERENCES tool_requests(id) ON DELETE SET NULL,
    action      VARCHAR(50) NOT NULL CHECK (action IN ('issued','returned','repaired','inspected','created')),
    actor_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- ИНВЕНТАРИЗАЦИИ
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    month           INT NOT NULL,
    year            INT NOT NULL,
    warehouse_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    status          VARCHAR(50) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','completed','missed')),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(month, year)
);

-- ----------------------------------------------------------------
-- ПОЗИЦИИ ИНВЕНТАРИЗАЦИИ
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id    UUID NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
    tool_id         UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    expected_status VARCHAR(50),
    actual_status   VARCHAR(50),
    is_present      BOOLEAN,
    condition       VARCHAR(50),
    notes           TEXT,
    checked_at      TIMESTAMPTZ,
    UNIQUE(inventory_id, tool_id)
);

-- ----------------------------------------------------------------
-- УВЕДОМЛЕНИЯ
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        VARCHAR(100) NOT NULL,
    title       VARCHAR(200) NOT NULL,
    message     TEXT NOT NULL,
    is_read     BOOLEAN DEFAULT FALSE,
    sent_via    VARCHAR(50)[],
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- ИНДЕКСЫ (IF NOT EXISTS чтобы не падало при повторном запуске)
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tools_status         ON tools(status);
CREATE INDEX IF NOT EXISTS idx_tools_assigned_to    ON tools(assigned_to);
CREATE INDEX IF NOT EXISTS idx_requests_master      ON tool_requests(master_id);
CREATE INDEX IF NOT EXISTS idx_requests_tool        ON tool_requests(tool_id);
CREATE INDEX IF NOT EXISTS idx_requests_status      ON tool_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_return_date ON tool_requests(planned_return);
CREATE INDEX IF NOT EXISTS idx_fines_master         ON fines(master_id);
CREATE INDEX IF NOT EXISTS idx_history_tool         ON tool_history(tool_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications(user_id);

-- ----------------------------------------------------------------
-- НАЧАЛЬНЫЕ ДАННЫЕ (ON CONFLICT DO NOTHING — безопасно повторять)
-- ----------------------------------------------------------------
-- Пароль для всех seed-пользователей: admin123 (хеш верифицирован bcryptjs)
INSERT INTO users (full_name, username, password, role, phone) VALUES
('Директор Алишер Каримов',   'director',  '$2a$10$gitvZVDi9wCRCujguBSQY.DF/80N0JbX0us/jgmiSn0dlACf9nD3.', 'director',          '+998901234567'),
('Начальник Бобур Рахимов',   'chief',     '$2a$10$gitvZVDi9wCRCujguBSQY.DF/80N0JbX0us/jgmiSn0dlACf9nD3.', 'production_chief',  '+998901234568'),
('Складовщик Санжар Юсупов',  'warehouse', '$2a$10$gitvZVDi9wCRCujguBSQY.DF/80N0JbX0us/jgmiSn0dlACf9nD3.', 'warehouse',         '+998901234569'),
('Мастер Жавлон Мирзаев',     'master1',   '$2a$10$gitvZVDi9wCRCujguBSQY.DF/80N0JbX0us/jgmiSn0dlACf9nD3.', 'master',            '+998901234570'),
('Мастер Отабек Хасанов',     'master2',   '$2a$10$gitvZVDi9wCRCujguBSQY.DF/80N0JbX0us/jgmiSn0dlACf9nD3.', 'master',            '+998901234571')
ON CONFLICT (username) DO NOTHING;

-- Self-heal: чинит пароли seed-аккаунтов в БД, где остался битый example-хеш.
UPDATE users
SET password = '$2a$10$gitvZVDi9wCRCujguBSQY.DF/80N0JbX0us/jgmiSn0dlACf9nD3.'
WHERE username IN ('director','chief','warehouse','master1','master2')
  AND password = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LPVsHGHzcyW';

-- ----------------------------------------------------------------
-- РЕАЛЬНЫЕ ПОЛЬЗОВАТЕЛИ ISOLA
-- Пароль для всех: isola2026 (можно поменять позже через профиль)
-- ----------------------------------------------------------------
INSERT INTO users (full_name, username, password, role, department, phone) VALUES
-- Директор
('Нуриддин',  'nuriddin',  '$2a$10$WXUBskpm8PbPtuTC7kRiEuLjEOs7h1bXJ9ok2syhs3exwFtwCXF0S', 'director',         'Руководство', NULL),
-- Начальник производства (тоже выдаёт инструменты)
('Нодир',     'nodir',     '$2a$10$WXUBskpm8PbPtuTC7kRiEuLjEOs7h1bXJ9ok2syhs3exwFtwCXF0S', 'production_chief', 'Производство', NULL),
-- Заведующий складом (выдаёт инструменты)
('Илхом',     'ilhom',     '$2a$10$WXUBskpm8PbPtuTC7kRiEuLjEOs7h1bXJ9ok2syhs3exwFtwCXF0S', 'warehouse',        'Склад', NULL),
-- Мастера / бригадиры
('Улугбек',   'ulugbek',   '$2a$10$WXUBskpm8PbPtuTC7kRiEuLjEOs7h1bXJ9ok2syhs3exwFtwCXF0S', 'master',           'Бригада №1', NULL),
('Киличбек',  'kilichbek', '$2a$10$WXUBskpm8PbPtuTC7kRiEuLjEOs7h1bXJ9ok2syhs3exwFtwCXF0S', 'master',           'Бригада №2', NULL),
('Окилжон',   'okiljon',   '$2a$10$WXUBskpm8PbPtuTC7kRiEuLjEOs7h1bXJ9ok2syhs3exwFtwCXF0S', 'master',           'Бригада №3', NULL),
('Акмал',     'akmal',     '$2a$10$WXUBskpm8PbPtuTC7kRiEuLjEOs7h1bXJ9ok2syhs3exwFtwCXF0S', 'master',           'Бригада №4', NULL)
ON CONFLICT (username) DO NOTHING;

-- Скрываем демо-аккаунты с логин-страницы (не удаляем — FK с заявками)
UPDATE users SET is_active = FALSE
WHERE username IN ('director','chief','warehouse','master1','master2');

INSERT INTO tools (name, inventory_number, description, condition, status) VALUES
('Перфоратор Bosch GBH 2-26', 'INV-001', 'Профессиональный перфоратор, 800Вт', 'working',      'in_stock'),
('Болгарка DeWalt DWE402',    'INV-002', 'Угловая шлифмашина 125мм',            'working',      'in_stock'),
('Дрель Makita HP457DWE',     'INV-003', 'Аккумуляторная дрель-шуруповёрт',    'new',          'in_stock'),
('Сварочный аппарат ESAB',    'INV-004', 'Инверторный сварочный аппарат 200А',  'working',      'in_stock'),
('Лазерный уровень Bosch',    'INV-005', 'Нивелир 3D, 12 линий',               'working',      'in_stock'),
('Электролобзик Makita',      'INV-006', 'Лобзик 650Вт, маятниковый',           'needs_repair', 'in_repair'),
('Шуруповёрт DeWalt DCF887',  'INV-007', 'Бесщёточный 18V',                    'working',      'in_stock'),
('Рулетка 10м Stanley',       'INV-008', '10 метров, автостоп',                 'working',      'in_stock'),
('Угольник 300мм',            'INV-009', 'Металлический, точный',               'new',          'in_stock'),
('Набор гаечных ключей',      'INV-010', 'Комплект 6-32мм, 25 штук',           'working',      'in_stock')
ON CONFLICT (inventory_number) DO NOTHING;
