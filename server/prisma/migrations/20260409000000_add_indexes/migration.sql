-- Add indexes for frequently-queried columns

-- stock_receipts: queries filter by brandId + receiptDate in balance calculations and reports
CREATE INDEX "stock_receipts_brand_id_receipt_date_idx" ON "stock_receipts"("brand_id", "receipt_date");

-- dairy_payments: queries filter by brandId + paymentDate
CREATE INDEX "dairy_payments_brand_id_payment_date_idx" ON "dairy_payments"("brand_id", "payment_date");

-- stock_dispatch_items: joined/aggregated by dispatchId and productId
CREATE INDEX "stock_dispatch_items_dispatch_id_idx" ON "stock_dispatch_items"("dispatch_id");
CREATE INDEX "stock_dispatch_items_product_id_idx" ON "stock_dispatch_items"("product_id");

-- salesperson_payments: queries filter by salespersonId + paymentDate
CREATE INDEX "salesperson_payments_salesperson_id_payment_date_idx" ON "salesperson_payments"("salesperson_id", "payment_date");
