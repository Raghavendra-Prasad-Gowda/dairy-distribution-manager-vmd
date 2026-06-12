-- Add is_archived flag to brands (permanent hide; no unarchive from UI)
ALTER TABLE "brands" ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;
