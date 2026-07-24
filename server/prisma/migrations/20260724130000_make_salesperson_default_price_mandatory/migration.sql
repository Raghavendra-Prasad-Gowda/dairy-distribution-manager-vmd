-- Make salesperson_default_price mandatory (NOT NULL with default 0)
-- Backfill existing NULL values with 0
UPDATE "products" SET "salesperson_default_price" = 0 WHERE "salesperson_default_price" IS NULL;

-- Alter column to NOT NULL
ALTER TABLE "products" ALTER COLUMN "salesperson_default_price" SET NOT NULL;
