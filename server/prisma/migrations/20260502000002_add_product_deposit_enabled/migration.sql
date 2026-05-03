-- Add deposit_enabled to products (default false — opt-in per product)
ALTER TABLE "products" ADD COLUMN "deposit_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Reset existing categories to false and change column default (deposit is now opt-in)
UPDATE "categories" SET "deposit_enabled" = false;
ALTER TABLE "categories" ALTER COLUMN "deposit_enabled" SET DEFAULT false;
