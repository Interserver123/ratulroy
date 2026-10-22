-- Progress of free-audit requests (leads with form = 'audit'). A lead with no row here
-- is "to do". Shown in admin > Audits.
CREATE TABLE IF NOT EXISTS audit_requests (
  lead_id     TEXT PRIMARY KEY REFERENCES leads (id) ON DELETE CASCADE,
  stage       TEXT NOT NULL DEFAULT 'todo' CHECK (stage IN ('todo', 'in_progress', 'sent')),
  report_url  TEXT,
  sent_at     TEXT,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_stage ON audit_requests (stage);
