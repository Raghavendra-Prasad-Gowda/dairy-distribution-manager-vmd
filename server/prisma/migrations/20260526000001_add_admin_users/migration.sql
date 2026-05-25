CREATE TABLE "admin_users" (
    "id"           SERIAL NOT NULL,
    "username"     TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role"         TEXT NOT NULL DEFAULT 'admin',
    "is_active"    BOOLEAN NOT NULL DEFAULT true,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");
