-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "mfa_secret" TEXT,
ADD COLUMN     "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfa_backup_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
