-- Migration 20260526000002 (which runs before this) already copied all
-- app_settings credentials into admin_users. Safe to drop now.
DROP TABLE IF EXISTS "app_settings";
