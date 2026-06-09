ALTER TABLE "brands" ADD COLUMN "salesperson_primary_brand_id" INTEGER REFERENCES "brands"("id") ON DELETE SET NULL;
