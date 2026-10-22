-- Facebook Messenger AI auto-reply + website knowledge base. See docs/MESSENGER.md.

-- Key/value settings. Secret values are stored AES-GCM encrypted (prefix "enc:v1:").
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Website knowledge base: one row per page section.
CREATE TABLE IF NOT EXISTS kb_chunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  url         TEXT NOT NULL,
  title       TEXT NOT NULL,
  heading     TEXT,
  content     TEXT NOT NULL,
  scan_id     TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kb_url ON kb_chunks (url);
CREATE INDEX IF NOT EXISTS idx_kb_scan ON kb_chunks (scan_id);

-- Full-text index over the chunks (BM25 ranking). Kept in sync by the triggers below.
CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5 (
  title, heading, content,
  content = 'kb_chunks', content_rowid = 'id',
  tokenize = 'porter unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS kb_ai AFTER INSERT ON kb_chunks BEGIN
  INSERT INTO kb_fts (rowid, title, heading, content) VALUES (new.id, new.title, new.heading, new.content);
END;
CREATE TRIGGER IF NOT EXISTS kb_ad AFTER DELETE ON kb_chunks BEGIN
  INSERT INTO kb_fts (kb_fts, rowid, title, heading, content) VALUES ('delete', old.id, old.title, old.heading, old.content);
END;

-- Crawl jobs (manual rescans and scheduled refreshes run in batches).
CREATE TABLE IF NOT EXISTS kb_scans (
  id           TEXT PRIMARY KEY,
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  trigger      TEXT NOT NULL,            -- 'manual' | 'schedule'
  status       TEXT NOT NULL,            -- 'running' | 'done' | 'failed'
  urls         TEXT NOT NULL,            -- JSON array of URLs to crawl
  cursor       INTEGER NOT NULL DEFAULT 0,
  pages_ok     INTEGER NOT NULL DEFAULT 0,
  pages_failed INTEGER NOT NULL DEFAULT 0,
  chunks       INTEGER NOT NULL DEFAULT 0,
  error        TEXT
);

-- One row per Messenger user (PSID) talking to the Page.
CREATE TABLE IF NOT EXISTS mc_conversations (
  psid               TEXT PRIMARY KEY,
  name               TEXT,
  mode               TEXT NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai', 'human')),
  handoff_reason     TEXT,
  handoff_at         TEXT,
  last_user_at       TEXT,
  last_message_at    TEXT NOT NULL,
  last_preview       TEXT,
  unread             INTEGER NOT NULL DEFAULT 0,
  lang               TEXT,
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mc_conv_last ON mc_conversations (last_message_at DESC);

-- Every inbound and outbound message.
CREATE TABLE IF NOT EXISTS mc_messages (
  id          TEXT PRIMARY KEY,
  psid        TEXT NOT NULL REFERENCES mc_conversations (psid) ON DELETE CASCADE,
  mid         TEXT,                       -- Meta message id (unique when present)
  direction   TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  source      TEXT NOT NULL,              -- 'user' | 'ai' | 'human' | 'page_inbox' | 'system'
  text        TEXT,
  meta        TEXT NOT NULL DEFAULT '{}', -- JSON: sources, model, attachments, error, tag
  status      TEXT NOT NULL DEFAULT 'ok', -- 'ok' | 'sent' | 'failed' | 'skipped'
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_msg_mid ON mc_messages (mid) WHERE mid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mc_msg_psid ON mc_messages (psid, created_at);

-- Webhook event de-duplication (Meta can deliver the same event more than once).
CREATE TABLE IF NOT EXISTS mc_events (
  event_key    TEXT PRIMARY KEY,
  received_at  TEXT NOT NULL
);

-- Error / audit log for the integration.
CREATE TABLE IF NOT EXISTS app_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  scope       TEXT NOT NULL,
  message     TEXT NOT NULL,
  data        TEXT
);
CREATE INDEX IF NOT EXISTS idx_logs_created ON app_logs (created_at DESC);
