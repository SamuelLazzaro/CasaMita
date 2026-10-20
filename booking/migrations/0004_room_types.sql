-- 0004_room_types.sql — room types managed from the dashboard (no deploy needed).
--
-- Until now the room types lived in rooms.csv, bundled into the Worker, and
-- their base price in room_prices. Both move into this one table: the venue
-- creates, edits and deletes its room types in the "Rooms" section, base
-- price included. requests.room_type and rate_periods.room_type keep
-- referencing the type BY NAME: renaming a type rewrites both (same batch),
-- deleting one is refused while a future booking still names it.
--
-- price_per_night is mandatory in the API. The column allows NULL only for
-- the rows seeded below from a deployment that had no base price yet: the
-- quote stays impossible (null) for them, exactly as before, until the venue
-- edits the type and types a price.
CREATE TABLE room_types (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  max_guests      INTEGER NOT NULL CHECK (max_guests BETWEEN 1 AND 20),
  quantity        INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 999),
  price_per_night REAL CHECK (price_per_night IS NULL OR price_per_night >= 0),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed: the room types of the rooms.csv of this instance (Casa Mita, one
-- room per type until the venue confirms the real quantities), with the base
-- price the venue had already set in room_prices (NULL when it had none).
INSERT INTO room_types (name, max_guests, quantity, price_per_night)
SELECT 'Singola', 1, 1, (SELECT price_per_night FROM room_prices WHERE room_type = 'Singola');
INSERT INTO room_types (name, max_guests, quantity, price_per_night)
SELECT 'Matrimoniale', 2, 1, (SELECT price_per_night FROM room_prices WHERE room_type = 'Matrimoniale');
INSERT INTO room_types (name, max_guests, quantity, price_per_night)
SELECT 'Doppia', 2, 1, (SELECT price_per_night FROM room_prices WHERE room_type = 'Doppia');
INSERT INTO room_types (name, max_guests, quantity, price_per_night)
SELECT 'Tripla', 3, 1, (SELECT price_per_night FROM room_prices WHERE room_type = 'Tripla');
INSERT INTO room_types (name, max_guests, quantity, price_per_night)
SELECT 'Quadrupla', 4, 1, (SELECT price_per_night FROM room_prices WHERE room_type = 'Quadrupla');

DROP TABLE room_prices;
