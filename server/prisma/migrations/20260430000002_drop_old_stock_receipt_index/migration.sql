-- Drop the old (product_id, receipt_date) unique index that was created in the
-- init migration as a standalone CREATE UNIQUE INDEX (not a CONSTRAINT).
-- Previous repair migrations missed this because they checked pg_constraint,
-- which does not track standalone indexes.
-- IF EXISTS makes this idempotent — safe to run even if already dropped.

DROP INDEX IF EXISTS "stock_receipts_product_id_receipt_date_key";
