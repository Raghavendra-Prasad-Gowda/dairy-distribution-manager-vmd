-- Repair migration: ensure the old (product_id, receipt_date) unique constraint is gone
-- and the new (product_id, receipt_date, route_id) constraint is in place.
-- Fully idempotent — safe to run even if the previous migration already applied correctly.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_receipts_product_id_receipt_date_key'
  ) THEN
    ALTER TABLE "stock_receipts" DROP CONSTRAINT "stock_receipts_product_id_receipt_date_key";
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_receipts_product_id_receipt_date_route_id_key'
  ) THEN
    ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_product_id_receipt_date_route_id_key"
        UNIQUE ("product_id", "receipt_date", "route_id");
  END IF;
END $$;
