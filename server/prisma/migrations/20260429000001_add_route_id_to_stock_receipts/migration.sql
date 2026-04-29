-- Add route_id to stock_receipts (0 = no specific route, for Jersey/Gowardhan)
ALTER TABLE "stock_receipts" ADD COLUMN "route_id" INTEGER NOT NULL DEFAULT 0;

-- Drop old unique constraint (productId, receiptDate)
ALTER TABLE "stock_receipts" DROP CONSTRAINT "stock_receipts_product_id_receipt_date_key";

-- Add new unique constraint (productId, receiptDate, routeId)
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_product_id_receipt_date_route_id_key"
    UNIQUE ("product_id", "receipt_date", "route_id");
