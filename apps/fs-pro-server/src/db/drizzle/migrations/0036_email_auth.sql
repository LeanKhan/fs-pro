-- Email on accounts (verification, password reset) and the one-time tokens
-- behind them. Tokens are stored hashed: a database leak must not hand out
-- working reset links.
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "Email" text;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "EmailVerifiedAt" timestamp(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Users_Email_lower_uq" ON "Users" (lower("Email")) WHERE "Email" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "AuthTokens" (
  "_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "UserId" uuid NOT NULL REFERENCES "Users"("_id") ON DELETE CASCADE,
  "Kind" text NOT NULL,
  "TokenHash" text NOT NULL UNIQUE,
  "ExpiresAt" timestamp(3) NOT NULL,
  "UsedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "AuthTokens_UserId_Kind_idx" ON "AuthTokens" ("UserId", "Kind");
