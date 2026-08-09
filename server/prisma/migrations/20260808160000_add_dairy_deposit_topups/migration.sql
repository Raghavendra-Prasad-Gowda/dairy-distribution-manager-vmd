-- A separate, deposit-only ledger — deliberately NOT a dairy_payments row.
-- Records a deposit balance already held with a brand from before the app
-- (e.g. an existing crate/container deposit). Only ever adds to the running
-- total in the Deposit report; must never feed dairy_balances.top_up_amount,
-- which tracks money owed for stock — a separate concern from deposit held.
CREATE TABLE "dairy_deposit_topups" (
    "id" SERIAL NOT NULL,
    "brand_id" INTEGER NOT NULL,
    "top_up_date" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dairy_deposit_topups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dairy_deposit_topups_brand_id_top_up_date_idx" ON "dairy_deposit_topups"("brand_id", "top_up_date");

ALTER TABLE "dairy_deposit_topups" ADD CONSTRAINT "dairy_deposit_topups_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
