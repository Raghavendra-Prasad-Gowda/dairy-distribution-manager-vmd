-- Increase price precision from 2 to 4 decimal places
-- Affects: products.cost_price, products.selling_price,
--          salesperson_prices.selling_price,
--          stock_receipts.unit_price,
--          stock_dispatch_items.unit_price

ALTER TABLE "products"
  ALTER COLUMN "cost_price"    TYPE DECIMAL(10,4),
  ALTER COLUMN "selling_price" TYPE DECIMAL(10,4);

ALTER TABLE "salesperson_prices"
  ALTER COLUMN "selling_price" TYPE DECIMAL(10,4);

ALTER TABLE "stock_receipts"
  ALTER COLUMN "unit_price" TYPE DECIMAL(10,4);

ALTER TABLE "stock_dispatch_items"
  ALTER COLUMN "unit_price" TYPE DECIMAL(10,4);
