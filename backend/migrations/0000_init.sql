-- StudioOS initial schema.
-- Mirrors src/db/schema.ts. Apply with:
--   bun run db:migrate:local     (local .wrangler state)
--   bun run db:migrate:remote    (the real D1 database)

CREATE TABLE IF NOT EXISTS expenses (
  id               TEXT PRIMARY KEY,
  project          TEXT NOT NULL,
  date             TEXT NOT NULL,
  category         TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  amount           REAL NOT NULL DEFAULT 0,
  estimated_amount REAL NOT NULL DEFAULT 0,
  paid_by          TEXT NOT NULL DEFAULT '',
  mode             TEXT NOT NULL DEFAULT 'Cash',
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_project ON expenses(project);

CREATE TABLE IF NOT EXISTS crew_entries (
  id          TEXT PRIMARY KEY,
  project     TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'Crew',
  name        TEXT NOT NULL,
  designation TEXT NOT NULL DEFAULT '',
  rate        REAL NOT NULL DEFAULT 0,
  days        REAL NOT NULL DEFAULT 0,
  total       REAL NOT NULL DEFAULT 0,
  contact     TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crew_project ON crew_entries(project);

CREATE TABLE IF NOT EXISTS subscriptions (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT '',
  vendor       TEXT NOT NULL DEFAULT '',
  amount       REAL NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'INR',
  cycle        TEXT NOT NULL DEFAULT 'Monthly',
  next_due     TEXT NOT NULL DEFAULT '',
  payment_mode TEXT NOT NULL DEFAULT '',
  billed_to    TEXT NOT NULL DEFAULT '',
  active       INTEGER NOT NULL DEFAULT 1,
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project     TEXT,
  date        TEXT NOT NULL,
  amount      REAL NOT NULL DEFAULT 0,
  direction   TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  mode        TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS idx_transactions_project ON transactions(project);
CREATE INDEX IF NOT EXISTS idx_transactions_date    ON transactions(date);

CREATE TABLE IF NOT EXISTS rental_bookings (
  id            TEXT PRIMARY KEY,
  client        TEXT NOT NULL,
  poc           TEXT NOT NULL DEFAULT '',
  tag           TEXT NOT NULL DEFAULT '',
  rate_type     TEXT NOT NULL DEFAULT 'hourly',
  rate          REAL NOT NULL DEFAULT 0,
  billing_cycle TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS rental_sessions (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT NOT NULL REFERENCES rental_bookings(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  time_in       TEXT NOT NULL DEFAULT '',
  time_out      TEXT NOT NULL DEFAULT '',
  hours         REAL NOT NULL DEFAULT 0,
  rounded_hours REAL NOT NULL DEFAULT 0,
  amount        REAL NOT NULL DEFAULT 0,
  paid          INTEGER NOT NULL DEFAULT 0,
  payment_date  TEXT,
  invoice_ref   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_booking ON rental_sessions(booking_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date    ON rental_sessions(date);

CREATE TABLE IF NOT EXISTS brand (
  id                 INTEGER PRIMARY KEY,
  company_name       TEXT NOT NULL DEFAULT '',
  tagline            TEXT NOT NULL DEFAULT '',
  logo_path          TEXT NOT NULL DEFAULT '',
  accent_color       TEXT NOT NULL DEFAULT '#3d7fa6',
  address_line1      TEXT NOT NULL DEFAULT '',
  address_line2      TEXT NOT NULL DEFAULT '',
  address_line3      TEXT NOT NULL DEFAULT '',
  address_country    TEXT NOT NULL DEFAULT '',
  phone              TEXT NOT NULL DEFAULT '',
  email              TEXT NOT NULL DEFAULT '',
  bank_account_name  TEXT NOT NULL DEFAULT '',
  bank_name          TEXT NOT NULL DEFAULT '',
  bank_account_no    TEXT NOT NULL DEFAULT '',
  bank_branch        TEXT NOT NULL DEFAULT '',
  bank_ifsc          TEXT NOT NULL DEFAULT '',
  bank_pan           TEXT NOT NULL DEFAULT '',
  upi_id             TEXT NOT NULL DEFAULT '',
  show_qr            INTEGER NOT NULL DEFAULT 1,
  show_bank_details  INTEGER NOT NULL DEFAULT 1,
  notes_title        TEXT NOT NULL DEFAULT 'Notes',
  notes              TEXT NOT NULL DEFAULT '',
  footer_text        TEXT NOT NULL DEFAULT ''
);
