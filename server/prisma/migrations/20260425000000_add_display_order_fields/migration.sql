-- AlterTable: add display_order to products and categories
ALTER TABLE "products" ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "categories" ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;
