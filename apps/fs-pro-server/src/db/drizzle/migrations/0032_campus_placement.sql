-- Free placement of campus buildings (packages/api-contract campus-grid.ts).
-- NULL = the default layout. Idempotent.
ALTER TABLE "Clubs" ADD COLUMN IF NOT EXISTS "CampusPlacement" jsonb;
