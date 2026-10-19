-- 0001_init.sql — initial schema of the booking module.
--
-- Conventions:
--  * Domain dates and times (check_in, check_out, date, start_time, end_time,
--    slot_key) are CIVIL TIME of the venue (Europe/Rome), stored as sortable
--    text: 'YYYY-MM-DD', 'HH:MM', 'YYYY-MM-DD_HHMM'.
--  * Technical timestamps (*_at) are UTC (datetime('now') of SQLite); the
--    conversion to the local time zone happens at presentation time.
--  * One deployment serves ONE booking type (see wrangler.jsonc), so a single
--    `requests` table holds every type: the type-specific columns are NULL
--    for the other types. Calendar, notifications, personal links and the
--    anonymisation job all read one table.

-- Registered requesters of a facility (sports clubs, teams...): they do not
-- sign up by themselves, the admin creates them and they log in through a
-- personal link carrying access_token. Hotels and restaurants do not use it.
CREATE TABLE requesters (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  color        TEXT NOT NULL DEFAULT '#3b82f6',
  access_token TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL CHECK (type IN ('hotel','facility','restaurant')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  -- who asks: a registered requester (facility) or a guest's contact details
  -- (hotel, restaurant). Guest fields are emptied by the anonymisation job.
  requester_id  INTEGER REFERENCES requesters(id),
  first_name    TEXT,
  last_name     TEXT,
  email         TEXT,
  phone         TEXT,
  lang          TEXT NOT NULL DEFAULT 'it',
  notes         TEXT,
  -- hotel: nights from check_in (included) to check_out (excluded)
  check_in      TEXT,
  check_out     TEXT,
  adults        INTEGER,
  children      INTEGER,
  room_type     TEXT,   -- "name" column of rooms.csv
  -- facility and restaurant: one date; facility has a time range, restaurant a seating time
  date          TEXT,
  start_time    TEXT,
  end_time      TEXT,
  party_size    INTEGER, -- restaurant
  -- personal link of hotel and restaurant guests (NULL for facility requests)
  guest_token   TEXT UNIQUE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at    TEXT,   -- when the admin approved or rejected
  cancelled_at  TEXT,   -- when the request was cancelled (by guest, requester or admin)
  anonymised_at TEXT    -- when the retention job emptied the guest fields
);

-- Facility only: every approved booking occupies 30-minute slots. The UNIQUE
-- primary key IS the double-booking guard: inserting an occupied slot fails
-- at database level, and approvals run inside an atomic batch.
CREATE TABLE slots (
  slot_key   TEXT PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT NOT NULL,
  details    TEXT,
  actor      TEXT NOT NULL,  -- 'admin' | 'requester:<id>' | 'guest:<request id>' | 'system'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE rate_limit (
  key          TEXT PRIMARY KEY,  -- e.g. 'submit:<ip>'
  counter      INTEGER NOT NULL,
  window_start TEXT NOT NULL
);

CREATE INDEX idx_requests_status        ON requests(status);
CREATE INDEX idx_requests_requester     ON requests(requester_id, status);
-- hotel availability: approved stays overlapping a date range, per room type
CREATE INDEX idx_requests_hotel_range   ON requests(room_type, status, check_in, check_out) WHERE type = 'hotel';
-- calendars of facility and restaurant
CREATE INDEX idx_requests_date          ON requests(date, status) WHERE date IS NOT NULL;
CREATE INDEX idx_slots_request          ON slots(request_id);
