-- CreateTable
CREATE TABLE "bills" (
    "id" SERIAL NOT NULL,
    "bill_number" INTEGER NOT NULL,
    "po_number" TEXT,
    "party_name" TEXT NOT NULL,
    "salesperson_id" INTEGER NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lines" JSONB NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bills_bill_number_key" ON "bills"("bill_number");

-- CreateIndex
CREATE INDEX "bills_salesperson_id_from_date_idx" ON "bills"("salesperson_id", "from_date");

-- CreateIndex
CREATE INDEX "bills_created_at_idx" ON "bills"("created_at");

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "salespeople"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
