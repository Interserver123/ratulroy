-- Strategy-call bookings (see backend/lib/booking.ts). One row per requested call,
-- linked to the lead created at the same time. A slot is free again when the booking is
-- cancelled or its lead is marked lost/spam.
CREATE TABLE IF NOT EXISTS bookings (
  id            TEXT PRIMARY KEY,
  lead_id       TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  package       TEXT NOT NULL,
  start_at      TEXT NOT NULL,              -- UTC ISO
  end_at        TEXT NOT NULL,              -- UTC ISO
  timezone      TEXT,                       -- visitor's time zone
  platform      TEXT,                       -- google-meet | whatsapp | zoom
  status        TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'cancelled')),
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_start ON bookings (start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_lead ON bookings (lead_id);
