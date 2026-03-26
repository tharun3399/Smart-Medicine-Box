-- SQLite schema for storing login details

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT,
    device_token  TEXT,
    device_paired INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Medicines table for storing per-user medicine schedules
CREATE TABLE IF NOT EXISTS medicines (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email    TEXT NOT NULL,
    name          TEXT NOT NULL,
    dosage        TEXT,
    total_doses   INTEGER,
    frequency     TEXT,
    days          TEXT,   -- comma-separated list, e.g. "Mon,Wed,Fri"
    times         TEXT,   -- comma-separated list of HH:MM times
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_medicines_user_email ON medicines(user_email);

-- Intake log table: records when a user confirms taking a dose
CREATE TABLE IF NOT EXISTS intakes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email    TEXT,
    medicine_name TEXT NOT NULL,
    time_label    TEXT NOT NULL,
    taken_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intakes_user_email ON intakes(user_email);
