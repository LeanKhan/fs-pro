/**
 * Pure knockout logic (docs/OPEN-PLAY-COMPETITIONS-SPEC.md, "Knockout
 * stage"): pairing a round, deciding a tie, a penalty shootout. No database
 * access here; see knockout.service.ts.
 */

export interface Seeded {
  clubId: string;
  /** 1 = strongest. */
  seed: number;
}

export interface Pairing {
  /** Higher seed (plays at home in a single leg, and in the second leg). */
  high: string;
  low: string;
}

/**
 * Pairs a round: 1 v n, 2 v n-1, ... by seed. With an odd number of clubs the
 * top seed gets a bye. `rng` shuffles instead when seeding is random (the
 * higher seed is still the one with the better seed number).
 */
export function pairRound(
  clubs: Seeded[],
  opts: { random?: boolean; rng?: () => number } = {}
): { pairs: Pairing[]; bye: string | null } {
  let pool = [...clubs].sort(
    (a, b) => a.seed - b.seed || (a.clubId < b.clubId ? -1 : 1)
  );
  let bye: string | null = null;
  if (pool.length % 2 === 1) {
    bye = pool[0]!.clubId;
    pool = pool.slice(1);
  }
  if (opts.random) {
    const rng = opts.rng ?? Math.random;
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const pairs: Pairing[] = [];
    for (let i = 0; i < pool.length; i += 2) {
      const [a, b] = [pool[i]!, pool[i + 1]!];
      pairs.push(
        a.seed <= b.seed
          ? { high: a.clubId, low: b.clubId }
          : { high: b.clubId, low: a.clubId }
      );
    }
    return { pairs, bye };
  }
  const pairs: Pairing[] = [];
  for (let i = 0; i < pool.length / 2; i++) {
    pairs.push({
      high: pool[i]!.clubId,
      low: pool[pool.length - 1 - i]!.clubId,
    });
  }
  return { pairs, bye };
}

/** A shootout: five each, then sudden death. Same odds as the match engine's. */
export function shootout(rng: () => number = Math.random): {
  home: number;
  away: number;
} {
  let home = 0;
  let away = 0;
  let homeKicks = 0;
  let awayKicks = 0;
  while (homeKicks < 5 || awayKicks < 5) {
    if (homeKicks <= awayKicks) {
      homeKicks++;
      if (rng() < 0.75) home++;
    } else {
      awayKicks++;
      if (rng() < 0.75) away++;
    }
    if (home > away + (5 - awayKicks) || away > home + (5 - homeKicks)) break;
  }
  while (home === away) {
    if (rng() < 0.75) home++;
    if (rng() < 0.75) away++;
  }
  return { home, away };
}

export interface LegResult {
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  /** The match engine's own winner (single legs with a shootout). */
  engineWinnerId?: string | null;
  penalties?: { home: number; away: number } | null;
}

export type DrawRule = 'penalties' | 'higher-seed' | 'away-goals';
export type DecidedBy =
  | 'score'
  | 'aggregate'
  | 'away-goals'
  | 'penalties'
  | 'higher-seed';

export interface TieOutcome {
  winnerId: string;
  loserId: string;
  decidedBy: DecidedBy;
  /** Set when this function ran the shootout itself. */
  penalties?: { high: number; low: number };
}

/** Who goes through a finished tie. */
export function decideTie(
  pairing: Pairing,
  legs: LegResult[],
  rule: DrawRule,
  rng: () => number = Math.random
): TieOutcome {
  const { high, low } = pairing;
  const win = (
    w: string,
    decidedBy: DecidedBy,
    penalties?: TieOutcome['penalties']
  ): TieOutcome => ({
    winnerId: w,
    loserId: w === high ? low : high,
    decidedBy,
    ...(penalties ? { penalties } : {}),
  });

  let goalsHigh = 0;
  let goalsLow = 0;
  let awayHigh = 0;
  let awayLow = 0;
  for (const leg of legs) {
    const highAtHome = leg.homeId === high;
    goalsHigh += highAtHome ? leg.homeGoals : leg.awayGoals;
    goalsLow += highAtHome ? leg.awayGoals : leg.homeGoals;
    if (highAtHome) awayLow += leg.awayGoals;
    else awayHigh += leg.awayGoals;
  }
  const single = legs.length === 1;
  if (goalsHigh !== goalsLow)
    return win(
      goalsHigh > goalsLow ? high : low,
      single ? 'score' : 'aggregate'
    );

  if (rule === 'higher-seed') return win(high, 'higher-seed');
  if (rule === 'away-goals' && !single && awayHigh !== awayLow) {
    return win(awayHigh > awayLow ? high : low, 'away-goals');
  }

  // Penalties: a single leg the engine already decided keeps its shootout.
  const last = legs[legs.length - 1]!;
  if (
    single &&
    last.engineWinnerId &&
    (last.engineWinnerId === high || last.engineWinnerId === low)
  ) {
    return win(last.engineWinnerId, 'penalties');
  }
  const kicks = shootout(rng);
  return win(kicks.home >= kicks.away ? high : low, 'penalties', {
    high: kicks.home,
    low: kicks.away,
  });
}
