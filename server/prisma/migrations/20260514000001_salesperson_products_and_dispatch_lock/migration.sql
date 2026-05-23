ALTER TABLE "stock_dispatches" ADD COLUMN "is_submitted"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "stock_dispatches" ADD COLUMN "is_admin_unlocked" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "salesperson_products" (
  "id"             SERIAL PRIMARY KEY,
  "salesperson_id" INTEGER      NOT NULL,
  "product_id"     INTEGER      NOT NULL,
  "is_enabled"     BOOLEAN      NOT NULL DEFAULT false,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "salesperson_products_salesperson_id_fkey"
    FOREIGN KEY ("salesperson_id") REFERENCES "salespeople"("id") ON DELETE CASCADE,
  CONSTRAINT "salesperson_products_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
  CONSTRAINT "salesperson_products_salesperson_id_product_id_key"
    UNIQUE ("salesperson_id", "product_id")
);
