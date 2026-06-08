-- CreateTable
CREATE TABLE "dairies" (
    "id"         SERIAL NOT NULL,
    "name"       TEXT NOT NULL,
    "phone"      TEXT,
    "address"    TEXT,
    "is_active"  BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dairies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dairies_name_key" ON "dairies"("name");

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN "dairy_id" INTEGER;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_dairy_id_fkey"
    FOREIGN KEY ("dairy_id") REFERENCES "dairies"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
