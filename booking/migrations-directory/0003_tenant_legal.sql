-- 0003_tenant_legal.sql — identity and booking conditions of a venue.
--
-- What a consumer must be told before a distance contract binds them
-- (Codice del consumo, art. 49: identity, address, phone, email, prices,
-- payment, no right of withdrawal for dated stays and meals, art. 59.1.n)
-- and what any online service must show (d.lgs. 70/2003, art. 7: name,
-- address, contacts, VAT number). The name and the address are the columns
-- the privacy notice already has (privacy_controller, privacy_address) and
-- the contact email is email_admin; only the rest is new.
ALTER TABLE tenants ADD COLUMN phone TEXT;            -- phone of the venue, shown to guests
ALTER TABLE tenants ADD COLUMN vat_number TEXT;       -- partita IVA
ALTER TABLE tenants ADD COLUMN conditions_url TEXT;   -- booking conditions on the venue's own website; NULL = the hosted page /<slug>/conditions
ALTER TABLE tenants ADD COLUMN conditions_text TEXT;  -- plain text of the hosted page, paragraphs separated by blank lines
