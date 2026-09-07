/**
 * Simulates a batch of matches back-to-back (real clubs from a checked-in
 * roster pool - see fixtures/simulation-roster-pool.json, produced by
 * dumpSimulationRosterPool.ts - run directly in-process, no DB/HTTP/queue/
 * worker involved) and reports aggregate per-match statistics against
 * well-known real-world football benchmarks.
 *
 * This is a cheap, fast sanity check that the simulation engine's overall
 * output is in a plausible range (shots/passes/tackles per match, pass
 * completion %, etc.) - it does NOT tell you whether any single match
 * looked tactically sensible. Use PitchPreview.html for that; use this to
 * catch "shots per game is 3x too high" class of regressions quickly,
 * across many matches, without watching any of them.
 *
 * Deliberately DB-free (SIMULATION-IMPLEMENTATION-TRACKER.md Milestone 1):
 * the roster pool is dumped once (or whenever you want fresher data) via
 * `dumpSimulationRosterPool.ts`, checked in, and loaded here with a bare
 * `fs.readFileSync` - this script itself never imports DB/club/manager
 * services, so running it can never be affected by whatever happens to be
 * in the dev DB that day.
 *
 * Usage:
 *   npx ts-node src/scripts/simRealismCheck.ts [count]
 *     count defaults to 1000. Writes tmp/simulation-baseline.json.
 *   npx ts-node src/scripts/simRealismCheck.ts --compare <fileA> <fileB>
 *     Diffs two previously saved baseline JSON files metric-by-metric,
 *     runs no simulations.
 *
 * `dotenv.config()` below is NOT this script touching the DB - it makes
 * exactly zero queries. It's here because `App.ts`'s import graph
 * transitively reaches `db/drizzle/index.ts` (for its `getClubs`/
 * `resolveManagerTactic` fallback-path imports, unused here since we
 * always pass prefetched data) -> `DrizzleUserRepository` ->
 * `utils/auth.ts` -> `sessionStore.ts`, which eagerly constructs a real
 * Postgres client and throws at *module load time* if `DATABASE_URL`
 * isn't set - found live while removing this script's own DB usage.
 * Loading `.env` just satisfies that unrelated eager check; no connection
 * is ever opened by anything this script actually calls. This coupling is
 * exactly the kind of thing Milestone 2's `packages/simulation` extraction
 * (zero framework/DB imports, by construction) will remove for good.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import App from '../controllers/app/App';
import { IClub } from '../interfaces/Club';
import { ITactic } from '../simulation/state/PersistentState/Formations';

/** Exported (Milestone 19) so tacticSensitivityCheck.ts can reuse the same
 * roster pool location rather than hardcoding a second copy of this path. */
export const POOL_PATH = path.join(
  __dirname,
  'fixtures',
  'simulation-roster-pool.json'
);
const BASELINE_OUTPUT_PATH = path.join(
  __dirname,
  '..',
  '..',
  'tmp',
  'simulation-baseline.json'
);

export interface IRosterPool {
  dumpedAt: string;
  clubs: IClub[];
  tactics: Record<string, ITactic>;
}

export interface IMatchSummary {
  homeClub: string;
  awayClub: string;
  goalsTotal: number;
  shotsPerTeam: number;
  shotsOnTargetPerTeam: number;
  passesPerTeam: number;
  passCompletionPct: number;
  possessionPctHome: number;
  tacklesPerTeam: number;
  dribblesPerTeam: number;
  interceptionsPerTeam: number;
  foulsPerTeam: number;
  yellowCardsPerTeam: number;
  redCardsPerTeam: number;
  eventsPerMatch: number;
  /** Milestone 11 (Possession And Match Phases) - diagnostic only, no
   * "real-world" range invented (like `eventsPerMatch` above) - these are
   * internal engine counts from `Match.Possession.getCompletedSequences()`.
   * Undercounts by exactly 1 per match (the sequence still running at
   * full-time never gets pushed to `completed` - nothing ends it). */
  possessionSequencesPerMatch: number;
  avgPossessionSequenceMinutes: number;
  directPassSharePct: number;
}

/**
 * Rough real-world ranges for a single professional-level team's per-match
 * output (not this engine's - reference points to sanity-check against).
 * Deliberately generous bands, not precise targets - the point is catching
 * "off by a lot", not fine-tuning against them.
 *
 * This is the tracker's "acceptable baseline ranges" open decision -
 * already answered here in practice; SIMULATION-IMPLEMENTATION-TRACKER.md
 * has been updated to point back at this constant rather than re-list it.
 */
const REFERENCE_RANGES: Record<string, [number, number]> = {
  'Goals per match (both teams)': [1.5, 4.5],
  'Shots per team': [7, 18],
  'Shots on target per team': [3, 8],
  'Passes per team': [250, 650],
  'Pass completion % (match-wide)': [70, 92],
  // Deliberately wide (not the tight ~45-55 spread real fixtures between
  // similarly-matched pro sides show) - clubs here are picked uniformly at
  // random from the whole pool, so a big quality mismatch is common and a
  // lopsided share is expected, not a bug.
  'Possession % (home team)': [20, 80],
  'Tackles per team (approx.)': [10, 25],
  'Dribbles (successful) per team (approx.)': [5, 20],
  'Interceptions per team (approx.)': [8, 20],
  'Fouls per team': [6, 16],
  'Yellow cards per team': [1, 3],
  'Red cards per team': [0, 0.3],
  // No real-world equivalent - this is an internal engine event count
  // (goals+shots+tackles+fouls+...), tracked as a diagnostic distribution
  // only (see printReport's handling of a missing REFERENCE_RANGES entry).
};

/**
 * Game.gameLoop resolves exactly one decision per tick, and a full match is
 * a fixed 180 ticks (90 minutes x 2). That puts a hard ceiling on any
 * per-team COUNT metric well below real-world per-90 stats, regardless of
 * how the AI is tuned - see the note printed alongside the report. Ratios
 * (like pass completion %) aren't affected by this, only raw counts.
 */
const MAX_TICKS_PER_MATCH = 180;
const TICK_CAPPED_METRICS = new Set(['Passes per team']);

export function pickTwoDistinctClubs(clubs: IClub[]): [IClub, IClub] {
  const a = clubs[Math.floor(Math.random() * clubs.length)];
  let b = clubs[Math.floor(Math.random() * clubs.length)];
  while (b._id === a._id) {
    b = clubs[Math.floor(Math.random() * clubs.length)];
  }
  return [a, b];
}

export async function simulateOneMatch(
  home: IClub,
  away: IClub,
  tactics: Record<string, ITactic>
): Promise<IMatchSummary | null> {
  const homeId = String(home._id);
  const awayId = String(away._id);
  const app = new App();

  await app.setupGame(
    [homeId, awayId],
    { home: homeId, away: awayId },
    [home, away],
    { home: tactics[homeId], away: tactics[awayId] }
  );
  const match = await app.startGame();

  if (!match) {
    return null;
  }

  const countEvents = (type: string) =>
    match.Events.filter((e) => e.type === type).length;

  const homeDetails = match.Details.HomeTeamDetails;
  const awayDetails = match.Details.AwayTeamDetails;

  const completedPasses = match.Details.TotalPasses;
  const interceptions = countEvents('interception');
  const passAttempts = completedPasses + interceptions;

  // Milestone 13 (Passing Options And Decision Evaluation) - diagnostic
  // only, no invented "real-world" range (same treatment as
  // eventsPerMatch/possessionSequencesPerMatch above). 'long'/'through'/
  // 'wide' count as "direct" (the higher-risk, forward-progress-chasing
  // shapes); 'short'/'backward'/'pass to post' as "safe". Useful for
  // spotting a gross scoring-weight regression across the real tactic mix
  // used here - the actual controlled A/B (same fixture, only directness
  // varied) lives in a throwaway verification script, not this aggregate.
  const passAndInterceptEvents = match.Events.filter(
    (e) => e.type === 'pass' || e.type === 'interception'
  );
  const directTypes = new Set(['long', 'through', 'wide']);
  const directAttempts = passAndInterceptEvents.filter((e) =>
    directTypes.has(e.data?.passType)
  ).length;
  const directPassSharePct =
    passAndInterceptEvents.length > 0
      ? (directAttempts / passAndInterceptEvents.length) * 100
      : 0;

  const completedSequences = match.Possession.getCompletedSequences();
  const avgPossessionSequenceMinutes = completedSequences.length
    ? average(completedSequences.map((s) => s.durationMinutes))
    : 0;

  return {
    homeClub: match.Home.ClubCode,
    awayClub: match.Away.ClubCode,
    goalsTotal: match.Details.Goals,
    shotsPerTeam: (homeDetails.TotalShots + awayDetails.TotalShots) / 2,
    shotsOnTargetPerTeam:
      (homeDetails.ShotsOnTarget + awayDetails.ShotsOnTarget) / 2,
    passesPerTeam: completedPasses / 2,
    passCompletionPct:
      passAttempts > 0 ? (completedPasses / passAttempts) * 100 : 0,
    possessionPctHome: homeDetails.Possession,
    tacklesPerTeam: countEvents('tackle') / 2,
    dribblesPerTeam: countEvents('dribble') / 2,
    interceptionsPerTeam: interceptions / 2,
    foulsPerTeam: (homeDetails.Fouls + awayDetails.Fouls) / 2,
    yellowCardsPerTeam: (homeDetails.YellowCards + awayDetails.YellowCards) / 2,
    redCardsPerTeam: (homeDetails.RedCards + awayDetails.RedCards) / 2,
    eventsPerMatch: match.Events.length,
    possessionSequencesPerMatch: completedSequences.length,
    avgPossessionSequenceMinutes,
    directPassSharePct,
  };
}

export function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Nearest-rank percentile - fine for sanity-check purposes, no need for
 * interpolation precision here. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length)
  );
  return sorted[index];
}

export interface IMetricStats {
  mean: number;
  min: number;
  max: number;
  p10: number;
  p50: number;
  p90: number;
}

export function computeMetricStats(values: number[]): IMetricStats {
  return {
    mean: average(values),
    min: Math.min(...values),
    max: Math.max(...values),
    p10: percentile(values, 10),
    p50: percentile(values, 50),
    p90: percentile(values, 90),
  };
}

export function buildMetricsMap(summaries: IMatchSummary[]): Record<string, number[]> {
  return {
    'Goals per match (both teams)': summaries.map((s) => s.goalsTotal),
    'Shots per team': summaries.map((s) => s.shotsPerTeam),
    'Shots on target per team': summaries.map((s) => s.shotsOnTargetPerTeam),
    'Passes per team': summaries.map((s) => s.passesPerTeam),
    'Pass completion % (match-wide)': summaries.map((s) => s.passCompletionPct),
    'Possession % (home team)': summaries.map((s) => s.possessionPctHome),
    'Tackles per team (approx.)': summaries.map((s) => s.tacklesPerTeam),
    'Dribbles (successful) per team (approx.)': summaries.map(
      (s) => s.dribblesPerTeam
    ),
    'Interceptions per team (approx.)': summaries.map(
      (s) => s.interceptionsPerTeam
    ),
    'Fouls per team': summaries.map((s) => s.foulsPerTeam),
    'Yellow cards per team': summaries.map((s) => s.yellowCardsPerTeam),
    'Red cards per team': summaries.map((s) => s.redCardsPerTeam),
    'Events per match (all types, diagnostic)': summaries.map(
      (s) => s.eventsPerMatch
    ),
    'Possession sequences per match (diagnostic)': summaries.map(
      (s) => s.possessionSequencesPerMatch
    ),
    'Avg possession sequence length, mins (diagnostic)': summaries.map(
      (s) => s.avgPossessionSequenceMinutes
    ),
    'Direct pass share % (diagnostic)': summaries.map(
      (s) => s.directPassSharePct
    ),
  };
}

function currentGitCommit(): string | null {
  try {
    return execSync('git rev-parse HEAD', { cwd: __dirname })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

interface IBaselineFile {
  generatedAt: string;
  matchCount: number;
  gitCommit: string | null;
  metrics: Record<string, IMetricStats>;
}

function printReport(summaries: IMatchSummary[]): Record<string, IMetricStats> {
  const metrics = buildMetricsMap(summaries);
  const stats: Record<string, IMetricStats> = {};

  console.log(
    `\n=== Realism check over ${summaries.length} simulated matches ===\n`
  );

  const rows = Object.entries(metrics).map(([label, values]) => {
    const s = computeMetricStats(values);
    stats[label] = s;

    const range = REFERENCE_RANGES[label];
    const tickCapped = TICK_CAPPED_METRICS.has(label);
    const inRange = range ? s.mean >= range[0] && s.mean <= range[1] : true;

    return {
      Metric: label,
      'Sim avg': s.mean.toFixed(1),
      'Sim min-max': `${s.min.toFixed(1)} - ${s.max.toFixed(1)}`,
      'p10/p50/p90': `${s.p10.toFixed(1)} / ${s.p50.toFixed(1)} / ${s.p90.toFixed(1)}`,
      'Real-world range': range ? `${range[0]} - ${range[1]}` : 'n/a (diagnostic)',
      Verdict: tickCapped
        ? 'CAPPED BY DESIGN'
        : !range
          ? 'DIAGNOSTIC'
          : inRange
            ? 'OK'
            : 'OUT OF RANGE',
    };
  });

  console.table(rows);

  if (TICK_CAPPED_METRICS.size > 0) {
    console.log(
      `\nNote: ${[...TICK_CAPPED_METRICS].join(', ')} can never reach the real-world ` +
        `range as currently modeled - the engine resolves exactly one decision per tick ` +
        `(Game.gameLoop), and a full match is only ${MAX_TICKS_PER_MATCH} ticks total, so ` +
        `per-team counts that share that budget with shots/tackles/dribbles top out around ` +
        `${MAX_TICKS_PER_MATCH / 2}. This isn't a bug to chase - it's a ceiling from the tick ` +
        `granularity itself. What IS meaningful to watch here is the ratio between these ` +
        `metrics (does passing still dominate over aimless movement the way it should).`
    );
  }

  const flagged = rows.filter((r) => r.Verdict === 'OUT OF RANGE');
  if (flagged.length > 0) {
    console.log(
      `\n${flagged.length} metric(s) fell outside the reference range - worth a closer look:\n` +
        flagged.map((r) => `  - ${r.Metric}`).join('\n')
    );
  } else {
    console.log('\nAll non-capped metrics landed within the reference ranges.');
  }

  return stats;
}

function saveBaseline(matchCount: number, metrics: Record<string, IMetricStats>) {
  const baseline: IBaselineFile = {
    generatedAt: new Date().toISOString(),
    matchCount,
    gitCommit: currentGitCommit(),
    metrics,
  };

  fs.mkdirSync(path.dirname(BASELINE_OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_OUTPUT_PATH, JSON.stringify(baseline, null, 2));
  console.log(`\nBaseline written to ${BASELINE_OUTPUT_PATH}`);
}

/** `--compare <fileA> <fileB>`: diffs two saved baseline JSON files
 * metric-by-metric (mean/p50), no simulation involved - this is what every
 * later milestone actually uses to prove "no regression". */
function runCompare(fileA: string, fileB: string) {
  const a: IBaselineFile = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
  const b: IBaselineFile = JSON.parse(fs.readFileSync(fileB, 'utf-8'));

  console.log(`\n=== Comparing baselines ===`);
  console.log(`A: ${fileA} (${a.matchCount} matches, ${a.generatedAt})`);
  console.log(`B: ${fileB} (${b.matchCount} matches, ${b.generatedAt})\n`);

  const labels = Object.keys(a.metrics);
  const rows = labels.map((label) => {
    const statA = a.metrics[label];
    const statB = b.metrics[label];
    if (!statB) {
      return { Metric: label, 'A mean': statA.mean.toFixed(1), 'B mean': 'missing', 'Mean Δ': '-', 'p50 Δ': '-' };
    }
    const meanDelta = statB.mean - statA.mean;
    const p50Delta = statB.p50 - statA.p50;
    return {
      Metric: label,
      'A mean': statA.mean.toFixed(1),
      'B mean': statB.mean.toFixed(1),
      'Mean Δ': (meanDelta >= 0 ? '+' : '') + meanDelta.toFixed(1),
      'p50 Δ': (p50Delta >= 0 ? '+' : '') + p50Delta.toFixed(1),
    };
  });

  console.table(rows);
}

async function main() {
  if (process.argv[2] === '--compare') {
    const [, , , fileA, fileB] = process.argv;
    if (!fileA || !fileB) {
      throw new Error('Usage: simRealismCheck.ts --compare <fileA> <fileB>');
    }
    runCompare(fileA, fileB);
    return;
  }

  const count = parseInt(process.argv[2], 10) || 1000;

  const pool: IRosterPool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8'));

  if (pool.clubs.length < 2) {
    throw new Error(
      `Roster pool has fewer than 2 clubs (${pool.clubs.length}) - rerun dumpSimulationRosterPool.ts.`
    );
  }

  console.log(
    `Simulating ${count} matches from a pool of ${pool.clubs.length} clubs ` +
      `(dumped ${pool.dumpedAt})...\n`
  );

  const startedAt = Date.now();
  const summaries: IMatchSummary[] = [];

  for (let i = 0; i < count; i++) {
    const [home, away] = pickTwoDistinctClubs(pool.clubs);

    try {
      const summary = await simulateOneMatch(home, away, pool.tactics);
      if (summary) {
        summaries.push(summary);
        if ((i + 1) % Math.max(1, Math.round(count / 20)) === 0 || i === count - 1) {
          console.log(`[${i + 1}/${count}] ...`);
        }
      } else {
        console.log(
          `[${i + 1}/${count}] ${home.ClubCode} vs ${away.ClubCode} - simulation returned no result, skipped`
        );
      }
    } catch (err) {
      console.error(
        `[${i + 1}/${count}] ${home.ClubCode} vs ${away.ClubCode} - failed:`,
        err
      );
    }
  }

  const elapsedSec = (Date.now() - startedAt) / 1000;
  console.log(`\nSimulated ${summaries.length}/${count} matches in ${elapsedSec.toFixed(1)}s.`);

  if (summaries.length === 0) {
    throw new Error('No matches simulated successfully - nothing to report.');
  }

  const metrics = printReport(summaries);
  saveBaseline(summaries.length, metrics);
}

// Milestone 19 - guarded so tacticSensitivityCheck.ts (and anything else)
// can import this module's reusable pieces (simulateOneMatch/
// buildMetricsMap/computeMetricStats/...) without triggering a full
// 1000-match batch run as an unwanted side effect of the import.
if (require.main === module) {
  main().catch((err) => {
    console.error('\nRealism check failed:', err);
    process.exitCode = 1;
  });
}
