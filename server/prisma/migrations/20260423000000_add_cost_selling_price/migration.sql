-- AlterTable: replace dairy_price with cost_price + selling_price
ALTER TABLE "products" ADD COLUMN "cost_price"    DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN "selling_price" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Existing dairy_price values are MRP (selling prices) — migrate them
UPDATE "products" SET "selling_price" = "dairy_price";

-- Drop old column
ALTER TABLE "products" DROP COLUMN "dairy_price";
