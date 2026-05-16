-- Add salesperson_display_order to brands, categories, products
-- Seeded from existing display_order so nothing breaks on deploy

ALTER TABLE "brands"
  ADD COLUMN "salesperson_display_order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "categories"
  ADD COLUMN "salesperson_display_order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "products"
  ADD COLUMN "salesperson_display_order" INTEGER NOT NULL DEFAULT 0;

-- Copy current display_order into the new columns as the initial value
UPDATE "brands"     SET "salesperson_display_order" = "display_order";
UPDATE "categories" SET "salesperson_display_order" = "display_order";
UPDATE "products"   SET "salesperson_display_order" = "display_order";
