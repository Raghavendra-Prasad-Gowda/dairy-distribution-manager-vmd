-- CreateTable
CREATE TABLE "routes" (
    "id" SERIAL NOT NULL,
    "brand_id" INTEGER NOT NULL,
    "route_number" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "routes_brand_id_route_number_key" ON "routes"("brand_id", "route_number");

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
