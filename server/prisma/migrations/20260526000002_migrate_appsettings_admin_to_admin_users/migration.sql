-- Migration: copy existing app_settings admin credentials into admin_users
-- Idempotent: skips if a user with the same username already exists in admin_users
INSERT INTO admin_users (username, password_hash, role, is_active, created_at, updated_at)
SELECT username, password_hash, 'admin', true, NOW(), NOW()
FROM app_settings
WHERE username IS NOT NULL
  AND password_hash IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM admin_users WHERE admin_users.username = app_settings.username
  );
