-- Country rows become snapshots of `country` places in the Imaginations world.
ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "entity_id" text;
ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "WorldRevision" integer;
ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "WorldSyncedAt" timestamp with time zone;
ALTER TABLE "Places" ADD COLUMN IF NOT EXISTS "WorldStale" boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "Places_entity_id_unique" ON "Places" ("entity_id");

-- Club anchors move into the spec's fields (Address.entity_id / Stadium.entity_id).
-- The old homePlaceId/stadiumPlaceId columns are left in place, unused, until
-- every environment has been backfilled.
UPDATE "Clubs"
SET "Address" = COALESCE("Address", '{}'::jsonb) || jsonb_build_object('entity_id', "homePlaceId")
WHERE "homePlaceId" IS NOT NULL AND COALESCE("Address"->>'entity_id', '') = '';

UPDATE "Clubs"
SET "Stadium" = COALESCE("Stadium", '{}'::jsonb) || jsonb_build_object('entity_id', "stadiumPlaceId")
WHERE "stadiumPlaceId" IS NOT NULL AND COALESCE("Stadium"->>'entity_id', '') = '';
