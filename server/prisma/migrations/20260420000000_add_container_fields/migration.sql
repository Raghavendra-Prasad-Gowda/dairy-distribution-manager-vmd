-- AlterTable: add container_type and units_per_container to products
ALTER TABLE "products" ADD COLUMN "container_type" TEXT;
ALTER TABLE "products" ADD COLUMN "units_per_container" INTEGER;
