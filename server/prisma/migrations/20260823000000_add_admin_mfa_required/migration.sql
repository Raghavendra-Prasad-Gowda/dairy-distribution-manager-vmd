-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "mfa_required" BOOLEAN NOT NULL DEFAULT false;
