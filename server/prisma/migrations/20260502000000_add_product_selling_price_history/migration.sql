CREATE TABLE "product_selling_prices" (
  "id"             SERIAL        NOT NULL,
  "product_id"     INTEGER       NOT NULL,
  "selling_price"  DECIMAL(10,4) NOT NULL DEFAULT 0,
  "effective_from" DATE          NOT NULL,
  "created_at"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_selling_prices_pkey"                              PRIMARY KEY ("id"),
  CONSTRAINT "product_selling_prices_product_id_effective_from_key"    UNIQUE ("product_id", "effective_from"),
  CONSTRAINT "product_selling_prices_product_id_fkey"                  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Seed all existing products' current sellingPrice as the initial history row
INSERT INTO "product_selling_prices" ("product_id", "selling_price", "effective_from")
SELECT "id", "selling_price", '2026-05-02'::DATE
FROM "products"
WHERE "selling_price" > 0;
