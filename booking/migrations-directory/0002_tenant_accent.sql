-- 0002_tenant_accent.sql — the accent colour of a venue.
--
-- One hex colour per venue ('#rrggbb'); the frontend derives the darker and
-- lighter variants from it (public/css/base.css). NULL keeps the palette of
-- the booking type. Every look-and-feel request of a venue is a column of
-- the directory, never code of its own.
ALTER TABLE tenants ADD COLUMN accent TEXT;
