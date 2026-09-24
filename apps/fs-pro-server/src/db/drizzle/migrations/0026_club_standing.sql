ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "Fans" integer NOT NULL DEFAULT 0;
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "Reputation" integer NOT NULL DEFAULT 0;
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "BoardConfidence" integer NOT NULL DEFAULT 60;
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "Form" jsonb;
ALTER TABLE "Players" ADD COLUMN IF NOT EXISTS "MoraleValue" integer NOT NULL DEFAULT 60;
CREATE TABLE IF NOT EXISTS "ClubMessages" (
  "_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId" uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Kind" text NOT NULL,
  "Tone" text NOT NULL DEFAULT 'neutral',
  "Title" text NOT NULL,
  "Body" text NOT NULL,
  "Read" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) DEFAULT now() NOT NULL,
  "updatedAt" timestamp(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "club_messages_club_created_idx" ON "ClubMessages" ("ClubId", "createdAt");
