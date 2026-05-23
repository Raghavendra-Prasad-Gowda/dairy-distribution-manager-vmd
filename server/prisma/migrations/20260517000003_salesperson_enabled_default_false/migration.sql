ALTER TABLE "products" ALTER COLUMN "salesperson_enabled" SET DEFAULT false;
UPDATE "products" SET "salesperson_enabled" = false;
