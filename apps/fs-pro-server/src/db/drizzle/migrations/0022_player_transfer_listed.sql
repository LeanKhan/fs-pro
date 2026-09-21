ALTER TABLE "Players" ADD COLUMN IF NOT EXISTS "isTransferListed" boolean NOT NULL DEFAULT false;
ALTER TABLE "Players" ADD COLUMN IF NOT EXISTS "AskingPrice" real;
ALTER TABLE "Players" ADD COLUMN IF NOT EXISTS "Morale" text;
ALTER TABLE "Players" ADD COLUMN IF NOT EXISTS "isYouth" boolean NOT NULL DEFAULT false;
