-- Repair migration: drop the old (product_id, receipt_date) unique INDEX and ensure
-- the new (product_id, receipt_date, route_id) unique CONSTRAINT exists.
--
-- The original init migration created the old unique as a standalone INDEX
-- (CREATE UNIQUE INDEX ...), not a CONSTRAINT, so pg_constraint checks missed it.
-- We must use pg_indexes + DROP INDEX to remove it.

-- Drop old unique index (created via CREATE UNIQUE INDEX in init migration)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'stock_receipts_product_id_receipt_date_key'
  ) THEN
    DROP INDEX "stock_receipts_product_id_receipt_date_key";
  END IF;
END $$;

-- Drop old unique constraint if it exists as a constraint (belt-and-suspenders)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_receipts_product_id_receipt_date_key'
  ) THEN
    ALTER TABLE "stock_receipts" DROP CONSTRAINT "stock_receipts_product_id_receipt_date_key";
  END IF;
END $$;

-- Ensure new unique constraint is in place
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_receipts_product_id_receipt_date_route_id_key'
  ) THEN
    ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_product_id_receipt_date_route_id_key"
        UNIQUE ("product_id", "receipt_date", "route_id");
  END IF;
END $$;
