import { sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { PlayerMatchDetailsInterface } from '../../controllers/player-match/player-match.model';
import { getAssetEffects } from '../facilities/facilities.service';
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
   * (~2.5% baseline) for players who participated.
   * Modulated by the club's Medical Centre level (fatigue reduction, injury protection).
   */
  public static async applyMatchFatigueAndInjuries(
    playerStats: PlayerMatchDetailsInterface[],
    clubId?: string
  ): Promise<void> {
    if (!playerStats?.length) return;

    const dz = DrizzleDatabase.getInstance();
    const db = dz.database;

    let effects: Record<string, number> = {};
    if (clubId) {
      try {
        effects = await getAssetEffects(clubId);
      } catch (err) {
        log(`[PlayerFitness] Could not fetch asset effects for club ${clubId}: ${err}`);
      }
    }

    const fatigueReduction = Math.min(effects.fatigueReduction ?? 0, 0.6);
    const injuryRiskReduction = Math.min(effects.injuryRiskReduction ?? 0, 0.6);
    const injuryDurationReduction = effects.injuryDurationReduction ?? 0;

    for (const stat of playerStats) {
      const playerId = stat.PlayerId ?? (stat as any).playerID;
      if (!playerId) continue;

      const mins = Number(stat.MinutesPlayed) || 90;
      const baseLoss = (mins / 90) * 16;
      const fatigueLoss = Math.max(4, Math.round(baseLoss * (1 - fatigueReduction)));

      // Injury roll (baseline 2.5%, reduced by Medical Centre)
      const roll = Math.random();
      const isInjured = roll < (0.025 * (1 - injuryRiskReduction));

      if (isInjured) {
        const type = COMMON_INJURIES[Math.floor(Math.random() * COMMON_INJURIES.length)];
        const daysOut = Math.max(1, Math.floor(Math.random() * 8) + 3 - injuryDurationReduction);
        const injuryJson = JSON.stringify({ type, daysRemaining: daysOut });

        await db.execute(
          sql`UPDATE "Players"
              SET "Fitness" = GREATEST(30, COALESCE("Fitness", 100) - ${fatigueLoss}),
                  "Injury" = ${injuryJson}::jsonb
              WHERE _id = ${playerId}::uuid`
        );
        log(`Player ${playerId} injured in match: ${type} (${daysOut} days, reduced by MC L${effects.medicalLevel ?? 0})`);
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
