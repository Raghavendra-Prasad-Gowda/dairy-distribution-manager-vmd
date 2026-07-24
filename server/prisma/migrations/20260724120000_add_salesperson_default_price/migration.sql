-- Add global default price for salesperson pricing (fallback when no custom price)
ALTER TABLE "products" ADD COLUMN "salesperson_default_price" NUMERIC(10,4);
