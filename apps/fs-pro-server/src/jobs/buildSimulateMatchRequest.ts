import { randomUUID } from 'crypto';
import { getClubs } from '../controllers/clubs/club.service';
import { resolveManagerTactic } from '../controllers/managers/manager.service';
import { ITactic } from '../match/tactics';
import { SimulateMatchRequest } from './simulationContract';
import { moodRatingBonus } from '../services/world/club-standing.service';
import { and, eq, inArray } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';
import { clubAssets } from '../db/drizzle/schema';
import { applyPlanToClub, nudgeSkills, planEffect, type PlanEffect, type PlanTactic } from '../services/play/plan-effects';

/**
 * Milestone 9 - the clubs-fetch + tactics-resolve-if-not-prefetched logic
 * that used to live in two places (inline in App.setupGame() for the old
 * synchronous kickoffNew path, duplicated in matchQueue.ts's runMatchJob
 * for the debug enqueue path). Both real callers of simulateMatch() now
 * build their request through this one function instead.
 *
 * Deliberately does NOT fetch the Fixture itself - both callers already
 * have it (for reasons of their own: play() needs it for SeasonCode/
 * isFriendly/SaveStats, the debug queue just needs Home/AwayTeamId) - this
 * only turns club ids into the plain, worker-safe SimulateMatchRequest.
 */
export async function buildSimulateMatchRequest(
  fixtureId: string,
  home: string,
  away: string,
  /** Per side: a fixture's stored tactic or match plan (services/play/
   * plan-effects.ts). A side left out plays its club's saved tactic. */
  prefetchedTactics?: { home?: ITactic | PlanTactic; away?: ITactic | PlanTactic },
  options?: {
    fixtureType?: string;
    stage?: string;
    isKnockout?: boolean;
  },
  /** Small home-side Rating nudge for this match only (see PlayOptions in
   * game.controller.ts) - applied to the plain club JSON below, never
   * persisted to the database. */
  homeRatingBonus?: number
): Promise<SimulateMatchRequest> {
  // `withPlayersAndManager` populates Players (needed for the match
  // roster) - ManagerId stays a bare id regardless (see IClubReadOptions).
  const clubs = await getClubs(
    { ids: [home, away] },
    { withPlayersAndManager: true }
  );

  const homeClub = clubs.find((c: any) => c._id?.toString() === home);
  const awayClub = clubs.find((c: any) => c._id?.toString() === away);

  const tactics = {
    home: prefetchedTactics?.home ?? homeClub?.Tactic ?? (await resolveManagerTactic(homeClub?.ManagerId)),
    away: prefetchedTactics?.away ?? awayClub?.Tactic ?? (await resolveManagerTactic(awayClub?.ManagerId)),
  } as { home: ITactic; away: ITactic };

  // Strip Mongoose/BSON ObjectId instances etc. down to plain data before
  // this crosses the worker_thread boundary (postMessage is structured
  // clone, not every Mongoose-lean() field survives that cleanly).
  const plainClubs = JSON.parse(JSON.stringify(clubs));

  // Squad morale + form: a bounded per-side nudge (+/-1.75, see
  // world/club-standing.service.ts), on top of the home facility bonus.
  const mood = await moodRatingBonus([home, away]);
  const clubOf = (clubId: string) => plainClubs.find((c: any) => c._id?.toString() === clubId);

  // Match plans (lineup, training session, team talk) for the sides that set one.
  const plans = { home: (tactics.home as PlanTactic)?.plan, away: (tactics.away as PlanTactic)?.plan };
  const effects: Record<'home' | 'away', PlanEffect | null> = { home: null, away: null };
  if (plans.home || plans.away) {
    const tiers = await trainingTiers([home, away]);
    const power = (c: any) => Math.round((c?.Rating ?? 0) * 2.5);
    const morale = (c: any) => {
      const ps = (c?.Players ?? []) as { MoraleValue?: number }[];
      return ps.length ? ps.reduce((s, p) => s + (p.MoraleValue ?? 60), 0) / ps.length : 60;
    };
    for (const side of ['home', 'away'] as const) {
      const plan = plans[side];
      if (!plan) continue;
      const mine = clubOf(side === 'home' ? home : away);
      const theirs = clubOf(side === 'home' ? away : home);
      effects[side] = planEffect(plan, {
        myPower: power(mine),
        oppPower: power(theirs),
        morale: morale(mine),
        trainingTier: tiers.get(side === 'home' ? home : away) ?? 0,
      });
      applyPlanToClub(mine, plan, effects[side]);
    }
  }

  // Facility, mood and plan nudges reach the attributes the engine reads.
  const homeClubPlain = clubOf(home);
  const awayClubPlain = clubOf(away);
  if (homeClubPlain) nudgeSkills(homeClubPlain, (homeRatingBonus ?? 0) + (mood.get(home) ?? 0) + (effects.home?.skill ?? 0));
  if (awayClubPlain) nudgeSkills(awayClubPlain, (mood.get(away) ?? 0) + (effects.away?.skill ?? 0));

  return {
    fixtureId,
    // A new match every time this fixture is played - see
    // SimulateMatchRequest.seed.
    seed: randomUUID(),
    clubs: plainClubs,
    sides: { home, away },
    tactics,
    fixtureType: options?.fixtureType,
    stage: options?.stage,
    isKnockout: options?.isKnockout,
  };
}

/** Training Ground tier per club (0 when never built). */
async function trainingTiers(clubIds: string[]): Promise<Map<string, number>> {
  const rows = await DrizzleDatabase.getInstance()
    .database.select({ club: clubAssets.ClubId, level: clubAssets.Level })
    .from(clubAssets)
    .where(and(inArray(clubAssets.ClubId, clubIds), eq(clubAssets.AssetType, 'training_ground')));
  return new Map(rows.map((r) => [r.club, r.level]));
}
