import type { LeagueRules, RankingMetric } from '@repo/api-contract';

/**
 * Pure ranking logic for open-play stages (docs/OPEN-PLAY-COMPETITIONS-SPEC.md):
 * how one result changes a club's row, Elo, and how a stage table is ordered
 * into Ranks. No database access here; see ranking.service.ts.
 */

export interface RankingRow {
  ClubId: string;
  Group: string | null;
  Played: number;
  Wins: number;
  Draws: number;
  Losses: number;
  GF: number;
  GA: number;
  GD: number;
  Points: number;
  CleanSheets: number;
  Forfeits: number;
  UnbeatenRun: number;
  BestUnbeatenRun: number;
  EloStart: number;
}

export type RowCounters = Omit<RankingRow, 'ClubId' | 'Group' | 'EloStart'>;

/** Score of a forfeited match: the challenger (or non-forfeiting side) wins 3-0. */
export const FORFEIT_GOALS = 3;

export const DEFAULT_ELO_K = 24;

/** A club's row after one match with `goalsFor`/`goalsAgainst`. */
export function applyMatchToRow<T extends RowCounters>(
  row: T,
  goalsFor: number,
  goalsAgainst: number,
  rules: Pick<LeagueRules, 'pointsForWin' | 'pointsForDraw'>,
  opts: { forfeited?: boolean } = {}
): T {
  const won = goalsFor > goalsAgainst;
  const drew = goalsFor === goalsAgainst;
  const unbeaten = won || drew ? row.UnbeatenRun + 1 : 0;

  return {
    ...row,
    Played: row.Played + 1,
    Wins: row.Wins + (won ? 1 : 0),
    Draws: row.Draws + (drew ? 1 : 0),
    Losses: row.Losses + (!won && !drew ? 1 : 0),
    GF: row.GF + goalsFor,
    GA: row.GA + goalsAgainst,
    GD: row.GD + goalsFor - goalsAgainst,
    Points:
      row.Points + (won ? rules.pointsForWin : drew ? rules.pointsForDraw : 0),
    CleanSheets: row.CleanSheets + (goalsAgainst === 0 ? 1 : 0),
    Forfeits: row.Forfeits + (opts.forfeited ? 1 : 0),
    UnbeatenRun: unbeaten,
    BestUnbeatenRun: Math.max(row.BestUnbeatenRun, unbeaten),
  };
}

/** New Elo for both sides. `score` is the home side's result: 1, 0.5 or 0. */
export function eloAfter(
  homeElo: number,
  awayElo: number,
  score: 1 | 0.5 | 0,
  k = DEFAULT_ELO_K
): { home: number; away: number } {
  const expectedHome = 1 / (1 + 10 ** ((awayElo - homeElo) / 400));
  const delta = k * (score - expectedHome);
  return { home: homeElo + delta, away: awayElo - delta };
}

/** Value of `metric` for a row; higher is always better. `currentElo` is
 * needed only for 'elo-gain'. */
export function metricValue(
  row: RankingRow,
  metric: RankingMetric,
  currentElo?: number
): number {
  switch (metric) {
    case 'points':
      return row.Points;
    case 'ppg':
      return row.Played ? row.Points / row.Played : 0;
    case 'wins':
      return row.Wins;
    case 'win-rate':
      return row.Played ? row.Wins / row.Played : 0;
    case 'gd':
      return row.GD;
    case 'gf':
      return row.GF;
    case 'ga-low':
      return -row.GA;
    case 'clean-sheets':
      return row.CleanSheets;
    case 'unbeaten-run':
      return row.BestUnbeatenRun;
    case 'elo-gain':
      return (currentElo ?? row.EloStart) - row.EloStart;
    case 'played':
      return row.Played;
  }
}

export interface RankedRow<R extends RankingRow = RankingRow> {
  row: R;
  /** 1-based position among ranked clubs; null while under minGamesToRank. */
  rank: number | null;
  /** Games still needed to be ranked (0 once ranked). */
  gamesNeeded: number;
}

/**
 * Orders a stage table (one group at a time) into Ranks: by the metric, then
 * each tiebreaker, then more games played, then club id so the order is
 * stable. Clubs under `minGamesToRank` come after every ranked club, ordered
 * the same way, with no Rank.
 */
export function rankRows<R extends RankingRow>(
  rows: R[],
  rules: Pick<LeagueRules, 'metric' | 'tiebreakers' | 'minGamesToRank'>,
  currentElo: Record<string, number> = {}
): RankedRow<R>[] {
  const keys: RankingMetric[] = [rules.metric, ...rules.tiebreakers];
  const compare = (a: R, b: R) => {
    for (const key of keys) {
      const diff =
        metricValue(b, key, currentElo[b.ClubId]) -
        metricValue(a, key, currentElo[a.ClubId]);
      if (Math.abs(diff) > 1e-9) return diff;
    }
    if (b.Played !== a.Played) return b.Played - a.Played;
    return a.ClubId < b.ClubId ? -1 : a.ClubId > b.ClubId ? 1 : 0;
  };

  const ranked = rows
    .filter((r) => r.Played >= rules.minGamesToRank)
    .sort(compare);
  const unranked = rows
    .filter((r) => r.Played < rules.minGamesToRank)
    .sort(compare);

  return [
    ...ranked.map((row, i) => ({ row, rank: i + 1, gamesNeeded: 0 })),
    ...unranked.map((row) => ({
      row,
      rank: null,
      gamesNeeded: rules.minGamesToRank - row.Played,
    })),
  ];
}

/** True once a club has reached a first-to target. */
export function reachedTarget(
  row: RankingRow,
  metric: 'points' | 'wins' | 'gf',
  target: number
): boolean {
  const value =
    metric === 'points' ? row.Points : metric === 'wins' ? row.Wins : row.GF;
  return value >= target;
}
