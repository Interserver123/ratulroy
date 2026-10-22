-- Leads backend schema (Cloudflare D1 / SQLite). See docs/BACKEND.md.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS leads (
  id              TEXT PRIMARY KEY,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  form            TEXT NOT NULL CHECK (form IN ('audit', 'contact', 'strategy-call')),
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'spam')),
  priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  name            TEXT,
  email           TEXT,
  phone           TEXT,
  business        TEXT,
  website         TEXT,
  service_area    TEXT,
  goal            TEXT,
  preferred_time  TEXT,
  message         TEXT,
  page_path       TEXT,
  referrer        TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_term        TEXT,
  utm_content     TEXT,
  country         TEXT,
  city            TEXT,
  ip_hash         TEXT,
  user_agent      TEXT,
  value_estimate  INTEGER,            -- USD cents, entered by admin
  next_follow_up  TEXT,               -- YYYY-MM-DD
  lost_reason     TEXT,
  tags            TEXT NOT NULL DEFAULT '[]',  -- JSON array
  spam_score      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_leads_status_created ON leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads (next_follow_up);
CREATE INDEX IF NOT EXISTS idx_leads_ip_created ON leads (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS lead_notes (
  id          TEXT PRIMARY KEY,
  lead_id     TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  author      TEXT NOT NULL,
  body        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_lead ON lead_notes (lead_id, created_at);

CREATE TABLE IF NOT EXISTS lead_events (
  id          TEXT PRIMARY KEY,
  lead_id     TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  actor       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('created', 'status', 'update', 'note')),
  data        TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_events_lead ON lead_events (lead_id, created_at);

CREATE TABLE IF NOT EXISTS admin_users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'editor')),
  created_at     TEXT NOT NULL,
  last_login_at  TEXT
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  ip_hash     TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON admin_sessions (expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash     TEXT NOT NULL,
  email       TEXT,
  created_at  TEXT NOT NULL,
  success     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_login_ip_created ON login_attempts (ip_hash, created_at);
