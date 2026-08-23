-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "failed_password_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failed_mfa_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_at" TIMESTAMP(3),
ADD COLUMN     "locked_reason" TEXT;
