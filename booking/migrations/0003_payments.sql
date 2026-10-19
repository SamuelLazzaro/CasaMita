-- 0003_payments.sql — payment tracking of the confirmed hotel bookings.
--
-- A confirmed stay (status 'approved') can be marked by the venue as paid in
-- full, or as paid in part when only the deposit was received; a deposit can
-- later be completed into a full payment. The booking status itself stays
-- 'approved': availability, calendar and cancellation rules keep working
-- unchanged, and the dashboard shows the payment state instead of the plain
-- "confirmed" label. Nothing here applies to restaurant and facility rows,
-- which keep the default 'none'.
--
-- paid_amount: what the guest has paid so far (the deposit, or the total
-- once fully paid). The amount left is quoted_total - paid_amount.
ALTER TABLE requests ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'none' CHECK (payment_status IN ('none', 'deposit', 'paid'));
ALTER TABLE requests ADD COLUMN paid_amount REAL;
ALTER TABLE requests ADD COLUMN paid_at TEXT;
