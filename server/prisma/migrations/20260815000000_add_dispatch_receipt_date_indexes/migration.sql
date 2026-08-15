-- Standalone date indexes for cross-entity report scans.
-- The existing composite indexes lead with brand_id / salesperson_id, so
-- queries that filter only by date (across all brands / all salespeople) can't
-- use them. These support the daily dispatch summary, stock summary,
-- profit/loss and finalization queries at scale.

-- CreateIndex
CREATE INDEX "stock_dispatches_dispatch_date_idx" ON "stock_dispatches"("dispatch_date");

-- CreateIndex
CREATE INDEX "stock_receipts_receipt_date_idx" ON "stock_receipts"("receipt_date");
