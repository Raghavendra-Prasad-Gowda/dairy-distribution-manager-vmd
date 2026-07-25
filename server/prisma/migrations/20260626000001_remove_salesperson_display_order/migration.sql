-- AlterTable: drop salesperson_display_order from brands, products, categories
-- These columns were never used in production — both the dairy and salesman views
-- order by the shared display_order field.

ALTER TABLE "brands" DROP COLUMN "salesperson_display_order";
ALTER TABLE "products" DROP COLUMN "salesperson_display_order";
ALTER TABLE "categories" DROP COLUMN "salesperson_display_order";
