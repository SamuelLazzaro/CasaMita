-- 0002_pricing.sql — hotel prices, managed from the dashboard (no deploy needed).
--
-- Price of a stay = sum of the nightly prices (the rate period covering the
-- night, else the base price of the room type) minus the length-of-stay
-- discount with the highest threshold reached. Prices are per room per
-- night, in euro, taxes included (owner's decision). room_type references
-- the "name" column of rooms.csv by value: the CSV stays the source of truth
-- of the room types, the database only prices them.

-- Base price per room type: mandatory before the public form shows prices.
CREATE TABLE room_prices (
  room_type       TEXT PRIMARY KEY,
  price_per_night REAL NOT NULL CHECK (price_per_night >= 0),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seasonal prices: a date range (both ends included) overriding the base
-- price of one room type. Ranges of the same room type must not overlap
-- (validated by the server). A one-day range prices a single date.
CREATE TABLE rate_periods (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  room_type       TEXT NOT NULL,
  date_from       TEXT NOT NULL,
  date_to         TEXT NOT NULL,
  price_per_night REAL NOT NULL CHECK (price_per_night >= 0),
  label           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (date_from <= date_to)
);

CREATE INDEX idx_rate_periods_room ON rate_periods(room_type, date_from, date_to);

-- Length-of-stay discounts, global for every room type: "from N nights on,
-- X% off the subtotal". The rule with the highest min_nights reached applies.
CREATE TABLE discount_rules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  min_nights INTEGER NOT NULL UNIQUE CHECK (min_nights >= 2),
  percent    INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 100),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Quote frozen on the request at submission (or set by the venue on a
-- direct booking): what the guest was shown, whatever the prices become.
ALTER TABLE requests ADD COLUMN quoted_subtotal REAL;
ALTER TABLE requests ADD COLUMN quoted_discount_percent INTEGER;
ALTER TABLE requests ADD COLUMN quoted_total REAL;
