-- CreateTable: product cost price history (mirrors salesperson_prices pattern)
CREATE TABLE "product_cost_prices" (
  "id"             SERIAL        NOT NULL,
  "product_id"     INTEGER       NOT NULL,
  "cost_price"     DECIMAL(10,4) NOT NULL DEFAULT 0,
  "effective_from" DATE          NOT NULL,
  "created_at"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_cost_prices_pkey"                           PRIMARY KEY ("id"),
  CONSTRAINT "product_cost_prices_product_id_effective_from_key" UNIQUE ("product_id", "effective_from"),
  CONSTRAINT "product_cost_prices_product_id_fkey"               FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Seed existing costPrice values as the initial history row (effective from the beginning of time)
INSERT INTO "product_cost_prices" ("product_id", "cost_price", "effective_from")
SELECT "id", "cost_price", '2020-01-01'::DATE
FROM "products"
WHERE "cost_price" > 0;
