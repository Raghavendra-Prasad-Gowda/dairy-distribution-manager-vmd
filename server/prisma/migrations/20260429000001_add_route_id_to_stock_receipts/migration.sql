-- Add route_id to stock_receipts (0 = no specific route, for Jersey/Gowardhan)
ALTER TABLE "stock_receipts" ADD COLUMN IF NOT EXISTS "route_id" INTEGER NOT NULL DEFAULT 0;

-- Drop old unique constraint if it still exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_receipts_product_id_receipt_date_key'
  ) THEN
    ALTER TABLE "stock_receipts" DROP CONSTRAINT "stock_receipts_product_id_receipt_date_key";
  END IF;
END $$;

-- Add new unique constraint if it doesn't exist yet
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_receipts_product_id_receipt_date_route_id_key'
  ) THEN
    ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_product_id_receipt_date_route_id_key"
        UNIQUE ("product_id", "receipt_date", "route_id");
  END IF;
END $$;
