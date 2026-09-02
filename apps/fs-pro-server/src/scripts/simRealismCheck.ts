/**
 * Simulates a batch of matches back-to-back (real clubs from the DB, run
 * directly in-process - no HTTP/queue/worker involved) and reports
 * aggregate per-match statistics against well-known real-world football
 * benchmarks.
 *
 * This is a cheap, fast sanity check that the simulation engine's overall
 * output is in a plausible range (shots/passes/tackles per match, pass
 * completion %, etc.) - it does NOT tell you whether any single match
 * looked tactically sensible. Use PitchPreview.html for that; use this to
 * catch "shots per game is 3x too high" class of regressions quickly,
 * across many matches, without watching any of them.
 *
 * Usage: DEV_TEST=true npx ts-node src/scripts/simRealismCheck.ts [count]
 *   count defaults to 20.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import DB from '../db';
import App from '../controllers/app/App';
import { getClubs } from '../controllers/clubs/club.service';
import { ClubInterface } from '../controllers/clubs/club.model';

interface IMatchSummary {
  homeClub: string;
  awayClub: string;
  goalsTotal: number;
  shotsPerTeam: number;
  shotsOnTargetPerTeam: number;
  passesPerTeam: number;
  passCompletionPct: number;
  tacklesPerTeam: number;
  dribblesPerTeam: number;
  interceptionsPerTeam: number;
  foulsPerTeam: number;
  yellowCardsPerTeam: number;
  redCardsPerTeam: number;
}

/**
 * Rough real-world ranges for a single professional-level team's per-match
 * output (not this engine's - reference points to sanity-check against).
 * Deliberately generous bands, not precise targets - the point is catching
 * "off by a lot", not fine-tuning against them.
 */
const REFERENCE_RANGES: Record<string, [number, number]> = {
  'Goals per match (both teams)': [1.5, 4.5],
  'Shots per team': [7, 18],
  'Shots on target per team': [3, 8],
  'Passes per team': [250, 650],
  'Pass completion % (match-wide)': [70, 92],
  'Tackles per team (approx.)': [10, 25],
  'Dribbles (successful) per team (approx.)': [5, 20],
  'Interceptions per team (approx.)': [8, 20],
  'Fouls per team': [6, 16],
  'Yellow cards per team': [1, 3],
  'Red cards per team': [0, 0.3],
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

function pickTwoDistinctClubs(clubs: ClubInterface[]): [ClubInterface, ClubInterface] {
  const a = clubs[Math.floor(Math.random() * clubs.length)];
  let b = clubs[Math.floor(Math.random() * clubs.length)];
  while (b._id === a._id) {
    b = clubs[Math.floor(Math.random() * clubs.length)];
  }
  return [a, b];
}

async function simulateOneMatch(homeId: string, awayId: string): Promise<IMatchSummary | null> {
  const app = new App();

  await app.setupGame([homeId, awayId], { home: homeId, away: awayId });
  const match = await app.startGame();

  if (!match) {
    return null;
  }

  const countEvents = (type: string) => match.Events.filter((e) => e.type === type).length;

  const home = match.Details.HomeTeamDetails;
  const away = match.Details.AwayTeamDetails;

  const completedPasses = match.Details.TotalPasses;
  const interceptions = countEvents('interception');
  const passAttempts = completedPasses + interceptions;

  return {
    homeClub: match.Home.ClubCode,
    awayClub: match.Away.ClubCode,
    goalsTotal: match.Details.Goals,
    shotsPerTeam: (home.TotalShots + away.TotalShots) / 2,
    shotsOnTargetPerTeam: (home.ShotsOnTarget + away.ShotsOnTarget) / 2,
    passesPerTeam: completedPasses / 2,
    passCompletionPct: passAttempts > 0 ? (completedPasses / passAttempts) * 100 : 0,
    tacklesPerTeam: countEvents('tackle') / 2,
    dribblesPerTeam: countEvents('dribble') / 2,
    interceptionsPerTeam: interceptions / 2,
    foulsPerTeam: (home.Fouls + away.Fouls) / 2,
    yellowCardsPerTeam: (home.YellowCards + away.YellowCards) / 2,
    redCardsPerTeam: (home.RedCards + away.RedCards) / 2,
  };
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function printReport(summaries: IMatchSummary[]): void {
  const metrics: Record<string, number[]> = {
    'Goals per match (both teams)': summaries.map((s) => s.goalsTotal),
    'Shots per team': summaries.map((s) => s.shotsPerTeam),
    'Shots on target per team': summaries.map((s) => s.shotsOnTargetPerTeam),
    'Passes per team': summaries.map((s) => s.passesPerTeam),
    'Pass completion % (match-wide)': summaries.map((s) => s.passCompletionPct),
    'Tackles per team (approx.)': summaries.map((s) => s.tacklesPerTeam),
    'Dribbles (successful) per team (approx.)': summaries.map((s) => s.dribblesPerTeam),
    'Interceptions per team (approx.)': summaries.map((s) => s.interceptionsPerTeam),
    'Fouls per team': summaries.map((s) => s.foulsPerTeam),
    'Yellow cards per team': summaries.map((s) => s.yellowCardsPerTeam),
    'Red cards per team': summaries.map((s) => s.redCardsPerTeam),
  };

  console.log(`\n=== Realism check over ${summaries.length} simulated matches ===\n`);

  const rows = Object.entries(metrics).map(([label, values]) => {
    const mean = average(values);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const [lo, hi] = REFERENCE_RANGES[label];
    const inRange = mean >= lo && mean <= hi;
    const tickCapped = TICK_CAPPED_METRICS.has(label);

    return {
      Metric: label,
      'Sim avg': mean.toFixed(1),
      'Sim min-max': `${min.toFixed(1)} - ${max.toFixed(1)}`,
      'Real-world range': `${lo} - ${hi}`,
      Verdict: tickCapped ? 'CAPPED BY DESIGN' : inRange ? 'OK' : 'OUT OF RANGE',
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
}

async function main() {
  const count = parseInt(process.argv[2], 10) || 20;

  console.log(`Connecting to database...`);
  await DB.start();

  const clubs = (await getClubs(undefined, { withPlayersAndManager: true })).filter(
    (c: ClubInterface) => c.Players?.length >= 11
  );

  if (clubs.length < 2) {
    throw new Error(
      `Need at least 2 clubs with 11+ players to simulate matches - found ${clubs.length}.`
    );
  }

  console.log(`Simulating ${count} matches from a pool of ${clubs.length} clubs...\n`);

  const summaries: IMatchSummary[] = [];

  for (let i = 0; i < count; i++) {
    const [home, away] = pickTwoDistinctClubs(clubs);
    // .lean() gives a real Mongoose ObjectId at runtime despite ClubInterface._id's
    // `string` type - String(...) converts it properly; the `as string`
    // cast alone would just lie to TypeScript and break identity checks
    // downstream (Game's constructor matches clubs by this exact string).
    const homeId = String(home._id);
    const awayId = String(away._id);

    try {
      const summary = await simulateOneMatch(homeId, awayId);
      if (summary) {
        summaries.push(summary);
        console.log(
          `[${i + 1}/${count}] ${summary.homeClub} vs ${summary.awayClub} - ` +
            `${summary.goalsTotal} goals, ${(summary.shotsPerTeam * 2).toFixed(0)} shots total`
        );
      } else {
        console.log(`[${i + 1}/${count}] ${home.ClubCode} vs ${away.ClubCode} - simulation returned no result, skipped`);
      }
    } catch (err) {
      console.error(`[${i + 1}/${count}] ${home.ClubCode} vs ${away.ClubCode} - failed:`, err);
    }
  }

  if (summaries.length === 0) {
    throw new Error('No matches simulated successfully - nothing to report.');
  }

  printReport(summaries);
}

main()
  .catch((err) => {
    console.error('\nRealism check failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await DB.disconnect();
    process.exit(process.exitCode || 0);
  });
