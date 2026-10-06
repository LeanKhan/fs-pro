/**
 * Match engine benchmark + determinism check.
 *
 * Runs seeded matches from the checked-in roster pool (same source as
 * simRealismCheck.ts - no DB, no HTTP) and reports:
 *   - in-process throughput: ms/match (mean/p50/p95) and matches/sec/core,
 *   - determinism: the same seed simulated twice must produce a
 *     byte-identical match (Details minus wall-clock fields, Events, Frames),
 *   - optionally, worker-pool throughput through jobs/matchQueue.ts - the
 *     path real fixtures take.
 *
 * Every match is seeded `bench:<i>` and its pairing is drawn from a seeded
 * source too, so `--fingerprints` output from two different commits can be
 * diffed with `--compare`: identical fingerprints prove a change (e.g. a
 * performance refactor) did not alter simulation behaviour at all.
 *
 * Usage:
 *   npx ts-node --transpile-only src/scripts/simBenchmark.ts [count] [--workers]
 *       [--fingerprints <out.json>]
 *   npx ts-node --transpile-only src/scripts/simBenchmark.ts --compare <a.json> <b.json>
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as crypto from 'crypto';
import * as fs from 'fs';
import App from '../controllers/app/App';
import { IClub } from '../interfaces/Club';
import { SeededRandomSource } from '../simulation/randomness';
import { Match } from '../simulation/classes/Match';
import { POOL_PATH, IRosterPool } from './simRealismCheck';
import { simulateMatch } from '../jobs/matchQueue';
import { SimulateMatchRequest } from '../jobs/simulationContract';

const WARMUP_MATCHES = 20;

export interface IFixturePair {
  seed: string;
  home: IClub;
  away: IClub;
}

/** Engine logging goes straight to console.log in a few places (e.g.
 * Referee's restart handler) - silenced while timing so the benchmark
 * measures simulation, not terminal I/O. */
export function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.log;
  console.log = () => undefined;
  return fn().finally(() => {
    console.log = original;
  });
}

export async function simulateInProcess(
  pair: IFixturePair,
  tactics: IRosterPool['tactics']
): Promise<Match | undefined> {
  const homeId = String(pair.home._id);
  const awayId = String(pair.away._id);
  const app = new App();
  await app.setupGame(
    [homeId, awayId],
    { home: homeId, away: awayId },
    [pair.home, pair.away],
    { home: tactics[homeId], away: tactics[awayId] },
    pair.seed
  );
  return app.startGame();
}

function fingerprint(match: Pick<Match, 'Details' | 'Events' | 'Frames'>): string {
  // Time/Title are wall-clock stamps, not simulation output.
  const { Time: _time, Title: _title, ...details } = match.Details;
  return crypto
    .createHash('sha1')
    .update(JSON.stringify({ details, events: match.Events, frames: match.Frames }))
    .digest('hex');
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/** Clubs that can actually field a starting XI (the pool has a few that
 * can't, e.g. no goalkeeper) - probed once so failures don't skew timing. */
export async function eligibleClubs(pool: IRosterPool): Promise<IClub[]> {
  const eligible: IClub[] = [];
  for (const club of pool.clubs) {
    const opponent = pool.clubs.find((c) => c._id !== club._id)!;
    try {
      await quietly(async () => {
        const app = new App();
        const ids = [String(club._id), String(opponent._id)];
        await app.setupGame(ids, { home: ids[0], away: ids[1] }, [club, opponent], {
          home: pool.tactics[ids[0]],
          away: pool.tactics[ids[1]],
        });
      });
      eligible.push(club);
    } catch {
      // not eligible - skipped
    }
  }
  return eligible;
}

export function buildPairs(clubs: IClub[], count: number): IFixturePair[] {
  const random = new SeededRandomSource('bench:pairings');
  return Array.from({ length: count }, (_, i) => {
    const home = clubs[random.nextInt(clubs.length)];
    let away = clubs[random.nextInt(clubs.length)];
    while (away._id === home._id) {
      away = clubs[random.nextInt(clubs.length)];
    }
    return { seed: `bench:${i}`, home, away };
  });
}

async function benchmarkInProcess(pairs: IFixturePair[], tactics: IRosterPool['tactics']) {
  for (const pair of pairs.slice(0, WARMUP_MATCHES)) {
    await quietly(() => simulateInProcess(pair, tactics));
  }

  const durations: number[] = [];
  const prints: string[] = [];
  const heapBefore = process.memoryUsage().heapUsed;
  const started = process.hrtime.bigint();

  for (const pair of pairs) {
    const t0 = process.hrtime.bigint();
    const match = await quietly(() => simulateInProcess(pair, tactics));
    durations.push(Number(process.hrtime.bigint() - t0) / 1e6);
    prints.push(match ? fingerprint(match) : 'no-result');
  }

  const totalMs = Number(process.hrtime.bigint() - started) / 1e6;
  const sorted = [...durations].sort((a, b) => a - b);
  console.log(`\n=== In-process engine (${pairs.length} matches, ${WARMUP_MATCHES} warm-up) ===`);
  console.table({
    'ms/match (mean)': (totalMs / pairs.length).toFixed(2),
    'ms/match (p50)': percentile(sorted, 0.5).toFixed(2),
    'ms/match (p95)': percentile(sorted, 0.95).toFixed(2),
    'matches/sec/core': ((pairs.length / totalMs) * 1000).toFixed(1),
    'heap delta (MB)': ((process.memoryUsage().heapUsed - heapBefore) / 1048576).toFixed(1),
  });

  return prints;
}

async function checkDeterminism(
  pairs: IFixturePair[],
  tactics: IRosterPool['tactics'],
  firstRun: string[]
): Promise<boolean> {
  const sample = pairs.slice(0, Math.min(25, pairs.length));
  let mismatches = 0;
  for (let i = 0; i < sample.length; i++) {
    const match = await quietly(() => simulateInProcess(sample[i], tactics));
    if ((match ? fingerprint(match) : 'no-result') !== firstRun[i]) {
      mismatches++;
      console.error(`  seed ${sample[i].seed}: re-run diverged`);
    }
  }
  console.log(
    `\n=== Determinism: ${sample.length - mismatches}/${sample.length} seeds reproduced identically ===`
  );
  return mismatches === 0;
}

async function benchmarkWorkers(pairs: IFixturePair[], tactics: IRosterPool['tactics']) {
  const toRequest = (pair: IFixturePair): SimulateMatchRequest => {
    const homeId = String(pair.home._id);
    const awayId = String(pair.away._id);
    return {
      fixtureId: pair.seed,
      seed: pair.seed,
      clubs: [pair.home, pair.away],
      sides: { home: homeId, away: awayId },
      tactics: { home: tactics[homeId], away: tactics[awayId] },
    };
  };

  // First wave spawns (and module-loads) the pool's workers - timed apart
  // from the steady state, since that cost is now paid once per worker.
  const concurrency = parseInt(process.env.SIMULATION_MAX_CONCURRENT_MATCHES ?? '2', 10);
  const coldStart = Date.now();
  await quietly(() =>
    Promise.all(pairs.slice(0, concurrency).map((p) => simulateMatch(toRequest(p))))
  );
  const coldMs = Date.now() - coldStart;

  const started = Date.now();
  const results = await quietly(() =>
    Promise.all(pairs.map((p) => simulateMatch(toRequest(p))))
  );
  const totalMs = Date.now() - started;
  const failed = results.filter((r) => !r.ok).length;

  console.log(`\n=== Worker pool (${pairs.length} matches, ${concurrency} workers) ===`);
  console.table({
    'pool cold start (ms)': coldMs,
    'ms/match (wall, steady)': (totalMs / pairs.length).toFixed(2),
    'matches/sec (wall)': ((pairs.length / totalMs) * 1000).toFixed(1),
    failed,
  });

  return results.map((r) => (r.ok ? fingerprint(r.match) : 'failed'));
}

function compareFingerprints(fileA: string, fileB: string) {
  const a: string[] = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
  const b: string[] = JSON.parse(fs.readFileSync(fileB, 'utf-8'));
  const n = Math.min(a.length, b.length);
  const diverged = a.slice(0, n).filter((print, i) => print !== b[i]).length;
  console.log(`${n - diverged}/${n} matches identical between ${fileA} and ${fileB}`);
  process.exitCode = diverged === 0 && a.length === b.length ? 0 : 1;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--compare') {
    compareFingerprints(args[1], args[2]);
    return;
  }

  const count = parseInt(args[0], 10) || 300;
  const fingerprintsOut = args.includes('--fingerprints')
    ? args[args.indexOf('--fingerprints') + 1]
    : undefined;

  const pool: IRosterPool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8'));
  const clubs = await eligibleClubs(pool);
  console.log(`${clubs.length}/${pool.clubs.length} pool clubs can field a starting XI.`);

  const pairs = buildPairs(clubs, count);
  const prints = await benchmarkInProcess(pairs, pool.tactics);
  const deterministic = await checkDeterminism(pairs, pool.tactics, prints);

  if (args.includes('--workers')) {
    const workerPrints = await benchmarkWorkers(pairs, pool.tactics);
    const agree = workerPrints.filter((p, i) => p === prints[i]).length;
    console.log(`Worker results identical to in-process: ${agree}/${pairs.length}`);
    if (agree !== pairs.length) process.exitCode = 1;
  }

  if (fingerprintsOut) {
    fs.writeFileSync(fingerprintsOut, JSON.stringify(prints));
    console.log(`Fingerprints written to ${fingerprintsOut}`);
  }

  if (!deterministic) process.exitCode = 1;
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('Benchmark failed:', err);
      process.exitCode = 1;
    })
    .finally(() => setImmediate(() => process.exit()));
}
