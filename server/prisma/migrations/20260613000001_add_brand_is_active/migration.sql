-- Add is_active flag to brands (disable a dairy without losing history)
ALTER TABLE "brands" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
