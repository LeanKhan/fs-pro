import { sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { PlayerMatchDetailsInterface } from '../../controllers/player-match/player-match.model';
import log from '../../helpers/logger';

const COMMON_INJURIES = [
  'Hamstring Strain',
  'Ankle Sprain',
  'Knee Knock',
  'Groin Strain',
  'Calf Pull',
  'Thigh Bruise',
];

/**
 * Service managing persistent player fitness, match fatigue, in-match injury rolls,
 * and calendar day recovery.
 */
export class PlayerFitnessService {
  /**
   * Applies post-match fatigue (-10 to -20 fitness) and performs injury rolls
   * (~2.5% baseline, ~5% if already fatigued) for players who participated.
   */
  public static async applyMatchFatigueAndInjuries(
    playerStats: PlayerMatchDetailsInterface[]
  ): Promise<void> {
    if (!playerStats?.length) return;

    const dz = DrizzleDatabase.getInstance();
    const db = dz.database;

    for (const stat of playerStats) {
      const playerId = stat.PlayerId ?? (stat as any).playerID;
      if (!playerId) continue;

      const mins = Number(stat.MinutesPlayed) || 90;
      const fatigueLoss = Math.round((mins / 90) * 16);

      // Injury roll
      const roll = Math.random();
      const isInjured = roll < 0.025; // 2.5% chance

      if (isInjured) {
        const type = COMMON_INJURIES[Math.floor(Math.random() * COMMON_INJURIES.length)];
        const daysOut = Math.floor(Math.random() * 8) + 3; // 3 to 10 days
        const injuryJson = JSON.stringify({ type, daysRemaining: daysOut });

        await db.execute(
          sql`UPDATE "Players"
              SET "Fitness" = GREATEST(30, COALESCE("Fitness", 100) - ${fatigueLoss}),
                  "Injury" = ${injuryJson}::jsonb
              WHERE _id = ${playerId}::uuid`
        );
        log(`Player ${playerId} injured in match: ${type} (${daysOut} days)`);
      } else {
        await db.execute(
          sql`UPDATE "Players"
              SET "Fitness" = GREATEST(30, COALESCE("Fitness", 100) - ${fatigueLoss})
              WHERE _id = ${playerId}::uuid`
        );
      }
    }
  }

  /**
   * Recovers player fitness (+8 per day elapsed) and decrements injury days.
   * Clears injury to null when daysRemaining reaches 0.
   */
  public static async recoverFitnessAndInjuries(daysElapsed: number): Promise<void> {
    if (daysElapsed <= 0) return;

    const dz = DrizzleDatabase.getInstance();
    const db = dz.database;

    const recoveryAmount = Math.min(100, daysElapsed * 8);

    // 1. Recover fitness for all non-retired players
    await db.execute(
      sql`UPDATE "Players"
          SET "Fitness" = LEAST(100, COALESCE("Fitness", 100) + ${recoveryAmount})
          WHERE "isRetired" = false`
    );

    // 2. Decrement injury days and clear recovered injuries
    await db.execute(
      sql`UPDATE "Players"
          SET "Injury" = CASE
            WHEN ("Injury"->>'daysRemaining')::int <= ${daysElapsed} THEN NULL
            ELSE jsonb_set("Injury", '{daysRemaining}', to_jsonb(("Injury"->>'daysRemaining')::int - ${daysElapsed}))
          END
          WHERE "Injury" IS NOT NULL`
    );

    log(`[PlayerFitness] Recovered fitness (+${recoveryAmount}) and updated injuries for ${daysElapsed} day(s)`);
  }
}
