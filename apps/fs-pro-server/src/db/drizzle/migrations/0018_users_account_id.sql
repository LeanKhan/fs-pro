ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "accountId" text;
CREATE UNIQUE INDEX IF NOT EXISTS "Users_accountId_unique" ON "Users" ("accountId");
