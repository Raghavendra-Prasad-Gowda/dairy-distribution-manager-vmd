ALTER TABLE "brands"         ADD COLUMN "deposit_enabled"   BOOLEAN       NOT NULL DEFAULT false;
ALTER TABLE "brands"         ADD COLUMN "deposit_per_litre" DECIMAL(10,4) NOT NULL DEFAULT 0;
ALTER TABLE "categories"     ADD COLUMN "deposit_enabled"   BOOLEAN       NOT NULL DEFAULT true;
ALTER TABLE "dairy_balances" ADD COLUMN "deposit_value"     DECIMAL(10,2) NOT NULL DEFAULT 0;
