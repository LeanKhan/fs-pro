/**
 * Agency check - do a manager's decisions actually move results?
 *
 * simRealismCheck.ts asks "does a match look like football?". This asks
 * the strategy-game question: holding everything else fixed, how much do
 * squad quality, individual attributes, playing style and formation change
 * what happens? Every experiment uses common random numbers - control and
 * variant replay the SAME fixtures with the SAME seeds - so a difference
 * is caused by the change, not by luck.
 *
 * Experiments:
 *   quality     - does the stronger XI win, by how much, how often upset?
 *   boost       - every home attribute +8: points/goal-diff gained
 *   attributes  - one attribute +20 across the home XI: which ones matter
 *   styles      - 5x5 home-style x away-style points matrix + signatures
 *   formations  - 4x4 home-formation x away-formation points matrix
 *
 * Usage:
 *   npx ts-node --transpile-only src/scripts/agencyCheck.ts [pairs] [experiment...]
 *     pairs defaults to 200; experiments default to all.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import App from '../controllers/app/App';
import { IClub } from '../interfaces/Club';
import { Match } from '../simulation/classes/Match';
import {
  ITactic,
  PLAYING_STYLES,
  formationShapes,
} from '../simulation/state/PersistentState/Formations';
import { POOL_PATH, IRosterPool } from './simRealismCheck';
import { eligibleClubs, buildPairs, quietly, IFixturePair } from './simBenchmark';

const BASE_TACTIC: ITactic = { formationName: '433', styleName: 'Balanced' };
const STYLES = Object.keys(PLAYING_STYLES);
const FORMATIONS = Object.keys(formationShapes);
const NUMERIC_ATTRIBUTES = [
  'Speed', 'Mental', 'Vision', 'Agility', 'Control', 'Keeping', 'Marking',
  'Stamina', 'Crossing', 'LongPass', 'LongShot', 'SetPiece', 'Shooting',
  'Strength', 'Tackling', 'Dribbling', 'ShortPass', 'ShotPower',
  'Aggression', 'Positioning', 'Interception',
];

interface IOutcome {
  homeGoals: number;
  awayGoals: number;
  homePossession: number;
  homeShots: number;
  awayShots: number;
  homePasses: number;
  awayPasses: number;
}

type ClubTransform = (club: IClub) => IClub;

const points = (gf: number, ga: number) => (gf > ga ? 3 : gf === ga ? 1 : 0);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/** Average Rating of the club's best 11 - the "squad quality" a manager
 * builds through transfers/training. */
export function xiRating(club: IClub): number {
  const ratings = (club.Players ?? [])
    .map((p) => p.Rating ?? 0)
    .sort((a, b) => b - a)
    .slice(0, 11);
  return mean(ratings);
}

function withAttributes(delta: (name: string, value: number) => number): ClubTransform {
  return (club) => ({
    ...club,
    Players: (club.Players ?? []).map((p) => ({
      ...p,
      Attributes: Object.fromEntries(
        Object.entries(p.Attributes).map(([k, v]) =>
          typeof v === 'number' ? [k, Math.min(99, delta(k, v))] : [k, v]
        )
      ) as typeof p.Attributes,
    })),
  });
}

async function play(
  pair: IFixturePair,
  tactics: { home: ITactic; away: ITactic },
  transformHome: ClubTransform = (c) => c
): Promise<IOutcome> {
  const home = transformHome(pair.home);
  const away = pair.away;
  const homeId = String(home._id);
  const awayId = String(away._id);

  const match: Match | undefined = await quietly(async () => {
    const app = new App();
    await app.setupGame([homeId, awayId], { home: homeId, away: awayId }, [home, away], tactics, pair.seed);
    return app.startGame();
  });
  if (!match) throw new Error(`no result for ${pair.seed}`);

  const h = match.Details.HomeTeamDetails;
  const a = match.Details.AwayTeamDetails;
  return {
    homeGoals: match.Details.HomeTeamScore,
    awayGoals: match.Details.AwayTeamScore,
    homePossession: h.Possession,
    homeShots: h.TotalShots,
    awayShots: a.TotalShots,
    homePasses: h.Passes,
    awayPasses: a.Passes,
  };
}

async function playAll(
  pairs: IFixturePair[],
  tactics: { home: ITactic; away: ITactic },
  transformHome?: ClubTransform
): Promise<IOutcome[]> {
  const out: IOutcome[] = [];
  for (const pair of pairs) out.push(await play(pair, tactics, transformHome));
  return out;
}

const homePoints = (os: IOutcome[]) => os.map((o) => points(o.homeGoals, o.awayGoals));
const homeGoalDiff = (os: IOutcome[]) => os.map((o) => o.homeGoals - o.awayGoals);

/** Paired difference with its standard error - the CRN payoff: noise that
 * hits control and variant identically cancels out of the difference. */
function pairedDelta(control: number[], variant: number[]): { delta: number; se: number } {
  const diffs = variant.map((v, i) => v - control[i]);
  return { delta: mean(diffs), se: sd(diffs) / Math.sqrt(diffs.length) };
}

const fmt = (n: number, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d);

async function experimentQuality(pairs: IFixturePair[], baseline: IOutcome[]) {
  const rows = pairs.map((p, i) => ({
    gap: xiRating(p.home) - xiRating(p.away),
    gd: baseline[i].homeGoals - baseline[i].awayGoals,
  }));

  // Least-squares slope + R^2 of goal difference on rating gap.
  const mg = mean(rows.map((r) => r.gap));
  const md = mean(rows.map((r) => r.gd));
  const cov = mean(rows.map((r) => (r.gap - mg) * (r.gd - md)));
  const varG = mean(rows.map((r) => (r.gap - mg) ** 2));
  const varD = mean(rows.map((r) => (r.gd - md) ** 2));
  const slope = cov / varG;
  const r2 = (cov * cov) / (varG * varD);

  const bucket = (lo: number, hi: number) => {
    const rs = rows.filter((r) => Math.abs(r.gap) >= lo && Math.abs(r.gap) < hi);
    const strongerResult = rs.map((r) => Math.sign(r.gap) * Math.sign(r.gd));
    return {
      matches: rs.length,
      'stronger wins %': ((strongerResult.filter((x) => x > 0).length / rs.length) * 100).toFixed(0),
      'draw %': ((strongerResult.filter((x) => x === 0).length / rs.length) * 100).toFixed(0),
      'upset %': ((strongerResult.filter((x) => x < 0).length / rs.length) * 100).toFixed(0),
    };
  };

  console.log('\n=== Quality: does the stronger XI win? (all teams 433/Balanced) ===');
  console.table({
    'gap < 3': bucket(0, 3),
    'gap 3-8': bucket(3, 8),
    'gap 8-15': bucket(8, 15),
    'gap 15+': bucket(15, 100),
  });
  const gds = baseline.map((o) => o.homeGoals - o.awayGoals);
  console.log(
    `goal diff per rating point: ${slope.toFixed(3)} | quality explains ${(r2 * 100).toFixed(0)}% of goal-diff variance` +
      ` | home W/D/L %: ${((gds.filter((g) => g > 0).length / gds.length) * 100).toFixed(0)}/` +
      `${((gds.filter((g) => g === 0).length / gds.length) * 100).toFixed(0)}/` +
      `${((gds.filter((g) => g < 0).length / gds.length) * 100).toFixed(0)}` +
      ` | goals/match ${mean(baseline.map((o) => o.homeGoals + o.awayGoals)).toFixed(2)}`
  );
  return { slope, r2 };
}

async function experimentBoost(pairs: IFixturePair[], baseline: IOutcome[]) {
  const boosted = await playAll(
    pairs,
    { home: BASE_TACTIC, away: BASE_TACTIC },
    withAttributes((_k, v) => v + 8)
  );
  const pts = pairedDelta(homePoints(baseline), homePoints(boosted));
  const gd = pairedDelta(homeGoalDiff(baseline), homeGoalDiff(boosted));
  console.log('\n=== Boost: every home attribute +8 (a strong transfer window / season of training) ===');
  console.log(
    `points/match ${fmt(pts.delta)} (±${pts.se.toFixed(2)}) | goal diff/match ${fmt(gd.delta)} (±${gd.se.toFixed(2)})`
  );
  return pts.delta;
}

async function experimentAttributes(pairs: IFixturePair[], baseline: IOutcome[]) {
  const rows: Record<string, Record<string, string>> = {};
  for (const attr of NUMERIC_ATTRIBUTES) {
    const variant = await playAll(
      pairs,
      { home: BASE_TACTIC, away: BASE_TACTIC },
      withAttributes((k, v) => (k === attr ? v + 20 : v))
    );
    const gd = pairedDelta(homeGoalDiff(baseline), homeGoalDiff(variant));
    const shots = pairedDelta(
      baseline.map((o) => o.homeShots),
      variant.map((o) => o.homeShots)
    );
    rows[attr] = {
      'goal diff Δ': `${fmt(gd.delta)} ±${gd.se.toFixed(2)}`,
      'home shots Δ': fmt(shots.delta, 1),
      matters: Math.abs(gd.delta) > 2 * gd.se ? 'yes' : '-',
    };
  }
  console.log('\n=== Attributes: +20 on ONE attribute across the home squad ===');
  console.table(rows);
}

async function experimentStyles(pairs: IFixturePair[]) {
  const matrix: Record<string, Record<string, string>> = {};
  const signature: Record<string, Record<string, string>> = {};
  const vsBalanced: Record<string, IOutcome[]> = {};

  for (const homeStyle of STYLES) {
    matrix[homeStyle] = {};
    for (const awayStyle of STYLES) {
      const os = await playAll(pairs, {
        home: { formationName: '433', styleName: homeStyle },
        away: { formationName: '433', styleName: awayStyle },
      });
      matrix[homeStyle][`vs ${awayStyle}`] = mean(homePoints(os)).toFixed(2);
      if (awayStyle === 'Balanced') vsBalanced[homeStyle] = os;
    }
    const os = vsBalanced[homeStyle];
    signature[homeStyle] = {
      'possession %': mean(os.map((o) => o.homePossession)).toFixed(0),
      passes: mean(os.map((o) => o.homePasses)).toFixed(0),
      'shots for': mean(os.map((o) => o.homeShots)).toFixed(1),
      'shots against': mean(os.map((o) => o.awayShots)).toFixed(1),
      'goals for': mean(os.map((o) => o.homeGoals)).toFixed(2),
      'goals against': mean(os.map((o) => o.awayGoals)).toFixed(2),
    };
  }

  const cells = Object.values(matrix).flatMap((r) => Object.values(r).map(Number));
  console.log('\n=== Styles: home points/match (rows = home style, 433 v 433) ===');
  console.table(matrix);
  console.log(`spread across matchups: ${Math.min(...cells).toFixed(2)} - ${Math.max(...cells).toFixed(2)} points/match`);
  console.log('\n=== Style signatures (home style vs Balanced) ===');
  console.table(signature);
}

async function experimentFormations(pairs: IFixturePair[]) {
  const matrix: Record<string, Record<string, string>> = {};
  for (const homeFormation of FORMATIONS) {
    matrix[homeFormation] = {};
    for (const awayFormation of FORMATIONS) {
      const os = await playAll(pairs, {
        home: { formationName: homeFormation, styleName: 'Balanced' },
        away: { formationName: awayFormation, styleName: 'Balanced' },
      });
      matrix[homeFormation][`vs ${awayFormation}`] = mean(homePoints(os)).toFixed(2);
    }
  }
  const cells = Object.values(matrix).flatMap((r) => Object.values(r).map(Number));
  console.log('\n=== Formations: home points/match (Balanced v Balanced) ===');
  console.table(matrix);
  console.log(`spread across matchups: ${Math.min(...cells).toFixed(2)} - ${Math.max(...cells).toFixed(2)} points/match`);
}

async function main() {
  const args = process.argv.slice(2);
  const count = parseInt(args[0], 10) || 200;
  const wanted = args.filter((a) => isNaN(Number(a)));
  const run = (name: string) => wanted.length === 0 || wanted.includes(name);

  const pool: IRosterPool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8'));
  const clubs = await eligibleClubs(pool);
  const pairs = buildPairs(clubs, count);
  const started = Date.now();

  const baseline = await playAll(pairs, { home: BASE_TACTIC, away: BASE_TACTIC });
  if (run('quality')) await experimentQuality(pairs, baseline);
  if (run('boost')) await experimentBoost(pairs, baseline);
  if (run('attributes')) await experimentAttributes(pairs, baseline);
  if (run('styles')) await experimentStyles(pairs);
  if (run('formations')) await experimentFormations(pairs);

  console.log(`\n(${count} seeded fixtures per cell, ${((Date.now() - started) / 1000).toFixed(0)}s)`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('Agency check failed:', err);
      process.exitCode = 1;
    })
    .finally(() => setImmediate(() => process.exit()));
}
