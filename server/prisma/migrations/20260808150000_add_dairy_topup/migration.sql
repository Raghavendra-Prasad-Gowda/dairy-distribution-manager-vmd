-- Admin "top-up" for the dairy side: load dues already owed to a brand before
-- the app existed, so they carry forward as that brand's opening balance.
-- Mirrors the salesperson top-up. Unlike a payment (which reduces what the
-- dairy owes) a top-up adds to it, so the balance formula adds these rows and
-- the stored amount stays positive.
ALTER TABLE "dairy_payments" ADD COLUMN "is_top_up" BOOLEAN NOT NULL DEFAULT false;

-- Username of the admin who recorded the row, for attribution in reports.
ALTER TABLE "dairy_payments" ADD COLUMN "created_by" TEXT;

-- Per-date total of top-ups, kept alongside stock_value/deposit_value/
-- amount_paid so the cascade can rebuild a balance from the balance row alone.
ALTER TABLE "dairy_balances" ADD COLUMN "top_up_amount" NUMERIC(10,2) NOT NULL DEFAULT 0;
