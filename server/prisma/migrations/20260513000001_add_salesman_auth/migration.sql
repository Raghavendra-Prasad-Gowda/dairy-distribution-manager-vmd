ALTER TABLE "salespeople" ADD COLUMN "username"      TEXT;
ALTER TABLE "salespeople" ADD COLUMN "password_hash" TEXT;
CREATE UNIQUE INDEX "salespeople_username_key" ON "salespeople"("username");
