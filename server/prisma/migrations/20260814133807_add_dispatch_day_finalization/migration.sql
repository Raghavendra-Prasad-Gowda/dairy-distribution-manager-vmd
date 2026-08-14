-- CreateTable
CREATE TABLE "dispatch_day_finalizations" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "finalized_by_admin_user_id" INTEGER,
    "finalized_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_auto" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "dispatch_day_finalizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_day_finalizations_date_key" ON "dispatch_day_finalizations"("date");

-- AddForeignKey
ALTER TABLE "dispatch_day_finalizations" ADD CONSTRAINT "dispatch_day_finalizations_finalized_by_admin_user_id_fkey" FOREIGN KEY ("finalized_by_admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
