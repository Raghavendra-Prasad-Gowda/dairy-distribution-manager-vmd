-- Admin "top-up": load a salesman's pre-existing dues so they carry forward
-- as opening balance. Unlike a normal payment (which reduces what a salesman
-- owes), a top-up adds to it — the balance formula adds these rows instead of
-- subtracting them, so the stored amount stays positive.
ALTER TABLE "salesperson_payments" ADD COLUMN "is_top_up" BOOLEAN NOT NULL DEFAULT false;

-- Username of the admin who recorded the row, shown to the salesman so they
-- know where an unexpected opening balance came from.
ALTER TABLE "salesperson_payments" ADD COLUMN "created_by" TEXT;

-- Per-date total of top-ups, kept alongside stock_given/amount_paid so the
-- cascade can rebuild a balance without re-reading the payments table.
ALTER TABLE "salesperson_balances" ADD COLUMN "top_up_amount" NUMERIC(10,2) NOT NULL DEFAULT 0;
