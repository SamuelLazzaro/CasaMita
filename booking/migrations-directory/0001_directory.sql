-- 0001_directory.sql — the directory: tenants (venues), their configuration
-- and the dashboard users. One directory database per deployment; every
-- tenant has its own booking database (migrations/), reached through the D1
-- binding named in `binding`.

CREATE TABLE tenants (
  slug               TEXT PRIMARY KEY,          -- path prefix of the venue: /<slug>/..., [a-z0-9-]
  binding            TEXT NOT NULL UNIQUE,      -- name of the venue's D1 binding in wrangler.jsonc
  type               TEXT NOT NULL CHECK (type IN ('hotel','facility','restaurant')),
  name               TEXT NOT NULL,             -- shown in pages and emails
  default_lang       TEXT NOT NULL DEFAULT 'it' CHECK (default_lang IN ('it','en')),
  -- notifications: sender (address on a domain authenticated in Brevo) and the owner's address
  email_sender       TEXT,
  email_admin        TEXT,
  -- facility: opening hours (30-minute slots); restaurant: lunch and dinner windows (15-minute steps). 'HH:MM', NULL = default
  facility_open      TEXT,
  facility_close     TEXT,
  lunch_open         TEXT,
  lunch_close        TEXT,
  dinner_open        TEXT,
  dinner_close       TEXT,
  -- days after the end of a booking before the guest data are anonymised (0 = never)
  retention_days     INTEGER NOT NULL DEFAULT 90 CHECK (retention_days >= 0),
  -- origin of the venue's own website allowed to embed the public form; NULL = embedding disabled
  embed_origin       TEXT,
  -- data controller shown in the privacy notice of the venue
  privacy_controller TEXT,
  privacy_address    TEXT,
  privacy_email      TEXT,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Dashboard accounts. The username is unique across the whole deployment:
-- the login page has no venue in its URL, the user leads to the venue.
CREATE TABLE users (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_slug         TEXT NOT NULL REFERENCES tenants(slug),
  username            TEXT NOT NULL UNIQUE,     -- lowercase, [a-z0-9._-], 3 to 40 characters
  password_hash       TEXT NOT NULL,            -- 'pbkdf2-sha256$<iterations>$<salt>$<key>' (see src/password.ts)
  failed_attempts     INTEGER NOT NULL DEFAULT 0,
  locked_until        TEXT,                     -- UTC; set after too many failed attempts
  password_changed_at TEXT,
  last_login_at       TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_tenant ON users(tenant_slug);

-- Login events (the per-venue audit stays in the venue's database).
CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT NOT NULL,
  details    TEXT,
  actor      TEXT NOT NULL,  -- 'user:<id>' | 'system'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fixed-window counters of the login attempts per IP (see src/ratelimit.ts).
CREATE TABLE rate_limit (
  key          TEXT PRIMARY KEY,  -- 'login:<ip>'
  counter      INTEGER NOT NULL,
  window_start TEXT NOT NULL
);
