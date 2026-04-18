-- AlterTable: add category and ml_per_crate to products
ALTER TABLE "products" ADD COLUMN "category" TEXT;
ALTER TABLE "products" ADD COLUMN "ml_per_crate" INTEGER;
