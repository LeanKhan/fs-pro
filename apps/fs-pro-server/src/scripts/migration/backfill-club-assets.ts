import 'dotenv/config';
import { eq, lt } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubAssets, clubs, competitions } from '../../db/drizzle/schema';
import { ASSET_TYPES, legacyClubLevels } from '../../services/facilities/asset-config';

/**
 * One-off: gives every club that existed before club facilities a real
 * ClubAssets row per asset, at levels scaled by its league division
 * (asset-config.ts's legacyClubLevels). New clubs are NOT touched - they start
 * at Level 0 - so the cutoff below must stay fixed. Idempotent: existing rows
 * are left alone. Run with `--dry` to only print what it would do.
 */
const LEGACY_CUTOFF = new Date('2026-09-22T00:00:00.000Z');

async function main() {
  const dry = process.argv.includes('--dry');
  const db = DrizzleDatabase.getInstance().database;

  const legacyClubs = await db.select().from(clubs).where(lt(clubs.createdAt, LEGACY_CUTOFF));
  const divisions = new Map(
    (await db.select({ id: competitions.id, d: competitions.Division }).from(competitions)).map(
      (c) => [c.id, c.d]
    )
  );

  let inserted = 0;
  const byTier = new Map<string, number>();
  for (const club of legacyClubs) {
    const division = club.LeagueId ? (divisions.get(club.LeagueId) ?? null) : null;
    const levels = legacyClubLevels(division);
    byTier.set(String(division), (byTier.get(String(division)) ?? 0) + 1);
    if (dry) continue;
    const res = await db
      .insert(clubAssets)
      .values(
        ASSET_TYPES.map((t) => ({
          ClubId: club.id,
          AssetType: t,
          Level: levels[t],
          updatedAt: new Date(),
        }))
      )
      .onConflictDoNothing()
      .returning({ id: clubAssets.id });
    inserted += res.length;
  }

  console.log(
    `${dry ? '[dry] ' : ''}${legacyClubs.length} legacy club(s) by division:`,
    Object.fromEntries(byTier),
    dry ? '' : `- ${inserted} row(s) inserted`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
