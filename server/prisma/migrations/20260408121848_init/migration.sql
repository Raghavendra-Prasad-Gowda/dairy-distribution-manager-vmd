-- CreateTable
CREATE TABLE "brands" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "brand_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "dairy_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_receipts" (
    "id" SERIAL NOT NULL,
    "brand_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "receipt_date" DATE NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dairy_balances" (
    "id" SERIAL NOT NULL,
    "brand_id" INTEGER NOT NULL,
    "balance_date" DATE NOT NULL,
    "opening_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stock_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "closing_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dairy_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dairy_payments" (
    "id" SERIAL NOT NULL,
    "brand_id" INTEGER NOT NULL,
    "payment_date" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_mode" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dairy_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salespeople" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "route" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salespeople_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salesperson_prices" (
    "id" SERIAL NOT NULL,
    "salesperson_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "selling_price" DECIMAL(10,2) NOT NULL,
    "effective_from" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salesperson_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_dispatches" (
    "id" SERIAL NOT NULL,
    "salesperson_id" INTEGER NOT NULL,
    "dispatch_date" DATE NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_dispatch_items" (
    "id" SERIAL NOT NULL,
    "dispatch_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "stock_dispatch_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salesperson_balances" (
    "id" SERIAL NOT NULL,
    "salesperson_id" INTEGER NOT NULL,
    "balance_date" DATE NOT NULL,
    "opening_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stock_given" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "closing_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salesperson_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salesperson_payments" (
    "id" SERIAL NOT NULL,
    "salesperson_id" INTEGER NOT NULL,
    "payment_date" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_mode" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salesperson_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" SERIAL NOT NULL,
    "business_name" TEXT NOT NULL DEFAULT 'Vikas Milk Dairy',
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_brand_id_name_key" ON "products"("brand_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "stock_receipts_product_id_receipt_date_key" ON "stock_receipts"("product_id", "receipt_date");

-- CreateIndex
CREATE UNIQUE INDEX "dairy_balances_brand_id_balance_date_key" ON "dairy_balances"("brand_id", "balance_date");

-- CreateIndex
CREATE UNIQUE INDEX "salesperson_prices_salesperson_id_product_id_effective_from_key" ON "salesperson_prices"("salesperson_id", "product_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "stock_dispatches_salesperson_id_dispatch_date_key" ON "stock_dispatches"("salesperson_id", "dispatch_date");

-- CreateIndex
CREATE UNIQUE INDEX "salesperson_balances_salesperson_id_balance_date_key" ON "salesperson_balances"("salesperson_id", "balance_date");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dairy_balances" ADD CONSTRAINT "dairy_balances_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dairy_payments" ADD CONSTRAINT "dairy_payments_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salesperson_prices" ADD CONSTRAINT "salesperson_prices_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "salespeople"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salesperson_prices" ADD CONSTRAINT "salesperson_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_dispatches" ADD CONSTRAINT "stock_dispatches_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "salespeople"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_dispatch_items" ADD CONSTRAINT "stock_dispatch_items_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "stock_dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_dispatch_items" ADD CONSTRAINT "stock_dispatch_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salesperson_balances" ADD CONSTRAINT "salesperson_balances_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "salespeople"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salesperson_payments" ADD CONSTRAINT "salesperson_payments_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "salespeople"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
