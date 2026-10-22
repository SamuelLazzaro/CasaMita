-- 0004_room_types.sql — room types managed from the dashboard (no deploy needed).
--
-- Until now the room types lived in rooms.csv, bundled into the Worker, and
-- their base price in room_prices. Both move into this one table: the venue
-- creates, edits and deletes its room types in the "Rooms" section, base
-- price included. requests.room_type and rate_periods.room_type keep
-- referencing the type BY NAME: renaming a type rewrites both (same batch),
-- deleting one is refused while a future booking still names it.
--
-- No room type is seeded: every venue database starts empty and the venue
-- creates its own types from the dashboard.
--
-- price_per_night is mandatory in the API. The column still allows NULL, as
-- in the databases already migrated, where the seeded types without a base
-- price keep the quote impossible (null) until the venue types a price.
CREATE TABLE room_types (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  max_guests      INTEGER NOT NULL CHECK (max_guests BETWEEN 1 AND 20),
  quantity        INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 999),
  price_per_night REAL CHECK (price_per_night IS NULL OR price_per_night >= 0),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

DROP TABLE room_prices;
