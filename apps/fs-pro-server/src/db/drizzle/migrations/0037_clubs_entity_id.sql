-- Clubs.entity_id is in the Drizzle schema (the club's id in the Imaginations world) but no
-- earlier migration created it, so a database built from the migrations alone
-- failed every club query.
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "entity_id" text;
