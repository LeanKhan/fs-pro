/**
 * Milestone 19 (Simulation Config And Calibration) - "add tactic
 * sensitivity tests" / "tactical changes produce measurable differences".
 * There's no Jest/vitest runner configured anywhere in this workspace
 * (`package.json`'s own `test` script is a stub - `echo "Error: no test
 * specified"`), so "tests" here means the same thing every prior
 * milestone's verification has meant: a durable, reusable script (kept,
 * unlike a throwaway verifyX.ts) run via `npx ts-node`, in the same family
 * as `simRealismCheck.ts` - reuses that script's own match-simulation/
 * metrics machinery rather than re-implementing it.
 *
 * Simulates the SAME roster-pool fixtures twice - once under the default
 * `SimulationConfig`, once under a deliberately shifted one - and reports
 * the delta. Proves "simulation behavior can be tuned from one config
 * surface" (this milestone's own acceptance criterion) empirically: if
 * changing `mergeSimulationConfig()` values didn't move the output, the
 * config surface would be decorative, not real.
 *
 * Usage:
 *   npx ts-node src/scripts/tacticSensitivityCheck.ts [count]
 *     count defaults to 200 (per variant - so 2*count matches total).
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import {
  POOL_PATH,
  IRosterPool,
  IMatchSummary,
  simulateOneMatch,
  pickTwoDistinctClubs,
  buildMetricsMap,
  computeMetricStats,
  IMetricStats,
} from './simRealismCheck';
import {
  getSimulationConfig,
  mergeSimulationConfig,
  resetSimulationConfig,
} from '../simulation/config';

/**
 * One deliberately extreme variant per config category the tracker names -
 * not a single blended change, so a reader can see which category actually
 * moved which metric. Each multiplies/shifts the DEFAULT value rather than
 * hardcoding a new absolute number, so this stays meaningful even if the
 * defaults themselves get re-tuned later.
 */
function buildDirectAndAggressiveVariant() {
  const base = getSimulationConfig();

  return {
    // shooting: much more eager to shoot from anywhere in range.
    shooting: { confidenceSwing: base.shooting.confidenceSwing * 2 },
    // passing: push scoring hard toward direct/risky passes regardless of
    // the tactic's own `style.directness` - a full-strength directness
    // coefficient rather than a fractional blend.
    passing: {
      scoringWeights: {
        retentionDirectnessCoeff: -1.0,
        threatDirectnessCoeff: 2.5,
        riskDirectnessCoeff: -1.0,
      },
    },
    // dribbling/tackling: a much more aggressive, higher-duel-stakes game.
    fouls: {
      chance: {
        base: base.fouls.chance.base * 1.8,
        aggressionCoefficient: base.fouls.chance.aggressionCoefficient * 2,
      },
    },
    // pressing: a much more compact, higher-press defensive setup.
    pressing: {
      offBallRadius: base.pressing.offBallRadius + 1,
      maxMarkedThreats: base.pressing.maxMarkedThreats + 2,
    },
  };
}

async function simulateBatch(
  count: number,
  pool: IRosterPool
): Promise<IMatchSummary[]> {
  const summaries: IMatchSummary[] = [];

  for (let i = 0; i < count; i++) {
    const [home, away] = pickTwoDistinctClubs(pool.clubs);
    try {
      const summary = await simulateOneMatch(home, away, pool.tactics);
      if (summary) {
        summaries.push(summary);
      }
    } catch (err) {
      // Same per-match resilience simRealismCheck.ts's own main() loop
      // already has - a single bad fixture (see this milestone's own
      // tracker notes on the roster pool's missing-goalkeeper club)
      // shouldn't take down the whole batch.
      console.error(
        `  ${home.ClubCode} vs ${away.ClubCode} - failed, skipped:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return summaries;
}

function reportDelta(
  label: string,
  baseline: Record<string, IMetricStats>,
  variant: Record<string, IMetricStats>
) {
  const rows = Object.keys(baseline).map((metric) => {
    const a = baseline[metric].mean;
    const b = variant[metric].mean;
    return {
      Metric: metric,
      Default: a.toFixed(1),
      [label]: b.toFixed(1),
      Δ: (b - a >= 0 ? '+' : '') + (b - a).toFixed(1),
    };
  });

  console.table(rows);
}

async function main() {
  const count = parseInt(process.argv[2], 10) || 200;
  const pool: IRosterPool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8'));

  if (pool.clubs.length < 2) {
    throw new Error(
      `Roster pool has fewer than 2 clubs (${pool.clubs.length}) - rerun dumpSimulationRosterPool.ts.`
    );
  }

  console.log(`Simulating ${count} matches under the DEFAULT config...`);
  resetSimulationConfig();
  const baselineSummaries = await simulateBatch(count, pool);
  const baselineMetrics: Record<string, IMetricStats> = {};
  for (const [k, v] of Object.entries(buildMetricsMap(baselineSummaries))) {
    baselineMetrics[k] = computeMetricStats(v);
  }

  console.log(
    `Simulating ${count} matches under the DIRECT-AND-AGGRESSIVE variant...`
  );
  mergeSimulationConfig(buildDirectAndAggressiveVariant());
  const variantSummaries = await simulateBatch(count, pool);
  const variantMetrics: Record<string, IMetricStats> = {};
  for (const [k, v] of Object.entries(buildMetricsMap(variantSummaries))) {
    variantMetrics[k] = computeMetricStats(v);
  }

  resetSimulationConfig();

  console.log(
    `\n=== Tactic sensitivity: default vs direct-and-aggressive (${count} matches each) ===\n`
  );
  reportDelta('Direct+Aggressive', baselineMetrics, variantMetrics);

  const directShareDelta =
    variantMetrics['Direct pass share % (diagnostic)'].mean -
    baselineMetrics['Direct pass share % (diagnostic)'].mean;
  const foulsDelta =
    variantMetrics['Fouls per team'].mean - baselineMetrics['Fouls per team'].mean;
  const shotsDelta =
    variantMetrics['Shots per team'].mean - baselineMetrics['Shots per team'].mean;

  console.log(
    `\nDirect pass share moved ${directShareDelta >= 0 ? '+' : ''}${directShareDelta.toFixed(1)} points, ` +
      `fouls per team moved ${foulsDelta >= 0 ? '+' : ''}${foulsDelta.toFixed(1)}, ` +
      `shots per team moved ${shotsDelta >= 0 ? '+' : ''}${shotsDelta.toFixed(1)} - ` +
      (Math.abs(directShareDelta) > 1 || Math.abs(foulsDelta) > 0.5 || Math.abs(shotsDelta) > 0.5
        ? 'config changes ARE measurably reaching match output.'
        : 'WARNING: deltas are small enough to be sampling noise - a config change may not be reaching match output. Investigate before trusting this config surface.')
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\nTactic sensitivity check failed:', err);
    process.exitCode = 1;
  });
}
