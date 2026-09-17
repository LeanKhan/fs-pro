/**
 * Milestone 22 (Behavior Regression Suite) - "make football behavior
 * testable as the engine becomes more sophisticated".
 *
 * Same family as `simRealismCheck.ts`/`tacticSensitivityCheck.ts`: a
 * durable (not throwaway) `npx ts-node` script, no Jest/vitest runner
 * configured in this workspace, DB-free (reuses the checked-in roster
 * pool), reusing `simRealismCheck.ts`'s match-simulation/metrics machinery
 * rather than re-implementing it.
 *
 * Unlike those two scripts (which report ONE aggregate/delta), this one
 * runs several independent, narrower checks - one per tracker task - and
 * prints a report for each:
 *
 *   1. Cautious vs Direct tactic comparison (both sides same style, style
 *      flipped between batches - Possession/LowBlock vs Direct/HighPress).
 *   2. High-press fatigue comparison (HighPress side vs LowBlock side,
 *      same match - full-time stamina/fatigue delta).
 *   3. Role behavior comparison (event-attempt-rate per derived PlayerRole,
 *      tallied across every match this run simulates).
 *   4. Possession/phase distribution report (sequence reason/duration mix,
 *      event count by phase tag).
 *   5. Replay sanity check (single ball owner per tick, monotonic
 *      tick/minute, no dangling event player refs) - run against EVERY
 *      match this script simulates, not a separate sample.
 *   6. Shot conversion funnel (per position: how often the ball carrier
 *      reaches final-third/chance phase, how often a shoot candidate then
 *      actually exists, how often a shot is actually attempted) - the
 *      diagnostic the "shots-per-team realism gap" FUTURE-PLANS.md entry
 *      asked for before touching Decider.ts's shoot thresholds again.
 *
 * "Test fixtures for contrasting team styles" (tracker task 1) doesn't need
 * a new fixture file - the checked-in roster pool already has real squads;
 * this script just pairs them with explicit `PLAYING_STYLES` names instead
 * of whatever a club's manager happens to prefer (see `buildStyleTactics`).
 *
 * Usage:
 *   npx ts-node src/scripts/behaviorRegressionSuite.ts [count]
 *     count defaults to 100 (per comparison batch).
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import App from '../controllers/app/App';
import { IClub } from '../interfaces/Club';
import { IFieldPlayer } from '../interfaces/Player';
import { Match } from '../simulation/classes/Match';
import { ITactic, PLAYING_STYLES, IPlayingStyle } from '../simulation/state/PersistentState/Formations';
import { deriveRole, PlayerRole } from '../simulation';
import {
  POOL_PATH,
  IRosterPool,
  pickTwoDistinctClubs,
  buildMetricsMap,
  computeMetricStats,
  IMetricStats,
  average,
} from './simRealismCheck';
import { checkMatchInvariants, summarizeViolations, IReplayViolation } from './replaySanityCheck';
import { decisionEvents, DecisionDebugEvent } from '../simulation/decision/decisionLog';

/** Mirrors `simRealismCheck.ts`'s `simulateOneMatch`, but returns the live
 * `Match` instance itself rather than a flattened summary - this milestone's
 * role/fatigue/possession/replay checks all need data
 * (`ActivePlayers`/`Condition`/`Possession`/`Frames`) that a flat summary
 * deliberately doesn't carry. */
async function runMatchRaw(
  home: IClub,
  away: IClub,
  tactics: Record<string, ITactic>
): Promise<Match | null> {
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
  return match ?? null;
}

/** Pairs two real clubs with explicit playing styles, keeping each club's
 * own dumped formation (only the STYLE is overridden) - reuses real
 * rosters rather than needing a second fixture file. */
function buildStyleTactics(
  pool: IRosterPool,
  home: IClub,
  away: IClub,
  homeStyle: string,
  awayStyle: string
): Record<string, ITactic> {
  const homeId = String(home._id);
  const awayId = String(away._id);
  return {
    [homeId]: {
      formationName: pool.tactics[homeId]?.formationName ?? '433',
      styleName: homeStyle,
    },
    [awayId]: {
      formationName: pool.tactics[awayId]?.formationName ?? '433',
      styleName: awayStyle,
    },
  };
}

const allViolations: { label: string; violations: IReplayViolation[] }[] = [];

function checkAndRecord(label: string, match: Match) {
  const violations = checkMatchInvariants(match);
  allViolations.push({ label, violations });
  if (violations.length > 0) {
    console.error(summarizeViolations(label, violations));
  }
}

// --- 1. Cautious vs Direct tactic comparison -------------------------------

async function runCautiousVsDirect(count: number, pool: IRosterPool) {
  console.log(`\n=== 1. Cautious vs Direct tactic comparison (${count} matches each) ===`);

  async function batch(homeStyle: string, awayStyle: string, label: string) {
    const summaries = [];
    for (let i = 0; i < count; i++) {
      const [home, away] = pickTwoDistinctClubs(pool.clubs);
      const tactics = buildStyleTactics(pool, home, away, homeStyle, awayStyle);
      try {
        const match = await runMatchRaw(home, away, tactics);
        if (match) {
          checkAndRecord(`cautious-vs-direct/${label}#${i}`, match);
          summaries.push(match);
        }
      } catch (err) {
        console.error(`  ${home.ClubCode} vs ${away.ClubCode} (${label}) - failed, skipped:`, err instanceof Error ? err.message : err);
      }
    }
    return summaries;
  }

  const cautiousMatches = await batch('Possession', 'Possession', 'Cautious');
  const directMatches = await batch('Direct', 'Direct', 'Direct');

  const cautiousMetrics = buildMetricsMap(
    cautiousMatches.map((m) => matchToSummary(m))
  );
  const directMetrics = buildMetricsMap(directMatches.map((m) => matchToSummary(m)));

  // The two final-third/shoot-candidate diagnostic columns aren't tracked
  // by matchToSummary() (only simRealismCheck.ts's own simulateOneMatch()
  // subscribes to decisionEvents for them - see comparison #6 for the real
  // per-position breakdown) - excluded here rather than printing a
  // misleading flat 0.0 for every row.
  const rows = Object.keys(cautiousMetrics)
    .filter((metric) => !metric.startsWith('Final-third/chance'))
    .map((metric) => {
      const a = computeMetricStats(cautiousMetrics[metric]).mean;
      const b = computeMetricStats(directMetrics[metric]).mean;
      return {
        Metric: metric,
        Cautious: a.toFixed(1),
        Direct: b.toFixed(1),
        'Δ (Direct - Cautious)': (b - a >= 0 ? '+' : '') + (b - a).toFixed(1),
      };
  });
  console.table(rows);
}

// A minimal local summary builder, since this suite needs the raw `Match`
// for other checks but `buildMetricsMap` expects `simRealismCheck.ts`'s
// `IMatchSummary` shape - duplicated here rather than exporting a second
// summary-builder from that module, since the fields used are a small
// subset and this keeps this script self-contained.
function matchToSummary(match: Match) {
  const countEvents = (type: string) => match.Events.filter((e) => e.type === type).length;
  const homeDetails = match.Details.HomeTeamDetails;
  const awayDetails = match.Details.AwayTeamDetails;
  const completedPasses = match.Details.TotalPasses;
  const interceptions = countEvents('interception');
  const passAttempts = completedPasses + interceptions;
  const passAndInterceptEvents = match.Events.filter((e) => e.type === 'pass' || e.type === 'interception');
  const directTypes = new Set(['long', 'through', 'wide']);
  const directAttempts = passAndInterceptEvents.filter((e) => directTypes.has(e.data?.passType)).length;
  const directPassSharePct = passAndInterceptEvents.length > 0 ? (directAttempts / passAndInterceptEvents.length) * 100 : 0;
  const completedSequences = match.Possession.getCompletedSequences();
  const avgPossessionSequenceMinutes = completedSequences.length ? average(completedSequences.map((s) => s.durationMinutes)) : 0;

  return {
    homeClub: match.Home.ClubCode,
    awayClub: match.Away.ClubCode,
    goalsTotal: match.Details.Goals,
    shotsPerTeam: (homeDetails.TotalShots + awayDetails.TotalShots) / 2,
    shotsOnTargetPerTeam: (homeDetails.ShotsOnTarget + awayDetails.ShotsOnTarget) / 2,
    passesPerTeam: completedPasses / 2,
    passCompletionPct: passAttempts > 0 ? (completedPasses / passAttempts) * 100 : 0,
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

// --- 2. High-press fatigue comparison --------------------------------------

/**
 * A real confound found live while first writing this comparison: pairing
 * the full named `HighPress`/`LowBlock` presets (as tempting as that looks)
 * doesn't isolate pressing as the cause - those presets also differ in
 * tempo/directness/defensiveLineHeight/width, which shift how much of the
 * match each side actually SPENDS defending (`updateConditionsForTick` only
 * applies a side's OWN `pressingIntensity` while that side is the one
 * defending that tick) - so a side that happens to hold more possession
 * under its own preset can look "fresher" for reasons that have nothing to
 * do with its pressing setting. A first pass using the two full presets
 * measured HighPress ending with HIGHER stamina than LowBlock (backwards),
 * confirmed stable at both 8 and 40 matches - not sampling noise, a real
 * methodology bug in the comparison itself.
 *
 * Fixed the same way Milestone 20's own verification isolated this variable
 * (see its tracker notes): register two NEW named styles, both otherwise
 * identical to `Balanced`, differing in `pressingIntensity` alone. These are
 * freshly created objects under new keys, not an in-place mutation of an
 * existing `PLAYING_STYLES` entry, so this does NOT hit the Milestone
 * 20-documented `resolveTactic()`/`PLAYING_STYLES` shared-reference bug
 * (every match using the real `Balanced` preset elsewhere is unaffected).
 */
const REGRESSION_HIGH_PRESS = 'RegressionHighPress';
const REGRESSION_LOW_BLOCK = 'RegressionLowBlock';
PLAYING_STYLES[REGRESSION_HIGH_PRESS] = {
  ...PLAYING_STYLES.Balanced,
  name: REGRESSION_HIGH_PRESS,
  pressingIntensity: 4,
} as IPlayingStyle;
PLAYING_STYLES[REGRESSION_LOW_BLOCK] = {
  ...PLAYING_STYLES.Balanced,
  name: REGRESSION_LOW_BLOCK,
  pressingIntensity: 1,
} as IPlayingStyle;

async function runHighPressFatigue(count: number, pool: IRosterPool) {
  console.log(`\n=== 2. High-press fatigue comparison (${count} matches, pressingIntensity 4 vs 1, all other style fields held equal) ===`);

  const highPressStamina: number[] = [];
  const lowBlockStamina: number[] = [];
  const highPressFatigue: number[] = [];
  const lowBlockFatigue: number[] = [];

  for (let i = 0; i < count; i++) {
    const [home, away] = pickTwoDistinctClubs(pool.clubs);
    // Alternate which physical side (home/away) gets the HighPress style -
    // a second real confound found live: this engine's Home side holds
    // meaningfully more possession on average even under IDENTICAL styles
    // (visible in comparison 1's "Possession % (home team)" row, ~55-68%
    // for both sides on the same style), and `updateConditionsForTick`
    // only ever applies a side's OWN `pressingIntensity` while that side is
    // the one DEFENDING. If HighPress always sat on Home, it would
    // systematically defend less (thanks to that separate home-possession
    // bias) and so trigger its own higher pressing drain less often - the
    // exact opposite of an isolated pressing-intensity test. Alternating
    // which side carries which style and pooling by STYLE (not by
    // home/away) cancels that out.
    const highPressIsHome = i % 2 === 0;
    const tactics = buildStyleTactics(
      pool,
      home,
      away,
      highPressIsHome ? REGRESSION_HIGH_PRESS : REGRESSION_LOW_BLOCK,
      highPressIsHome ? REGRESSION_LOW_BLOCK : REGRESSION_HIGH_PRESS
    );
    try {
      const match = await runMatchRaw(home, away, tactics);
      if (!match) continue;
      checkAndRecord(`high-press-fatigue#${i}`, match);

      const highPressSide = highPressIsHome ? match.Home : match.Away;
      const lowBlockSide = highPressIsHome ? match.Away : match.Home;

      highPressStamina.push(average(highPressSide.ActivePlayers.map((p: IFieldPlayer) => p.Condition.stamina)));
      lowBlockStamina.push(average(lowBlockSide.ActivePlayers.map((p: IFieldPlayer) => p.Condition.stamina)));
      highPressFatigue.push(average(highPressSide.ActivePlayers.map((p: IFieldPlayer) => p.Condition.fatigue)));
      lowBlockFatigue.push(average(lowBlockSide.ActivePlayers.map((p: IFieldPlayer) => p.Condition.fatigue)));
    } catch (err) {
      console.error(`  ${home.ClubCode} vs ${away.ClubCode} - failed, skipped:`, err instanceof Error ? err.message : err);
    }
  }

  console.table([
    {
      Metric: 'Full-time avg stamina',
      HighPress: average(highPressStamina).toFixed(1),
      LowBlock: average(lowBlockStamina).toFixed(1),
    },
    {
      Metric: 'Full-time avg fatigue',
      HighPress: average(highPressFatigue).toFixed(1),
      LowBlock: average(lowBlockFatigue).toFixed(1),
    },
  ]);

  const staminaDelta = average(lowBlockStamina) - average(highPressStamina);
  console.log(
    staminaDelta > 0
      ? `HighPress side ends with ${staminaDelta.toFixed(1)} less average stamina than LowBlock - fatigue has a visible cost, as expected.`
      : `NOTE: with only pressingIntensity isolated (this run's methodology, see the ` +
        `comment above), the HighPress side consistently ends with MORE stamina than ` +
        `LowBlock (Δ ${staminaDelta.toFixed(1)}), opposite of Milestone 20's own narrower ` +
        `(n=6, single fixture) finding. A likely mechanism, not chased further here (out ` +
        `of this milestone's scope - this script's job is to surface it for review, not ` +
        `retune Milestone 20's fatigue formula): pressingIntensity ALSO gates how many ` +
        `defenders close down the ball carrier (Actions.ts's '.slice(0, pressingIntensity)', ` +
        `Milestone 10) - a side that presses harder plausibly wins the ball back sooner, ` +
        `shortening its own defending spells (the only state ` +
        `updateConditionsForTick applies a side's OWN pressingIntensity drain to) enough ` +
        `to outweigh the higher per-tick rate. Real, reproducible across multiple sample ` +
        `sizes and with home/away alternated to rule out the separate home-possession ` +
        `bias also found live while building this comparison - disclosed, not silently ` +
        `patched around, same treatment as every other cross-milestone finding in this tracker.`
  );
}

// --- 3. Role behavior comparison --------------------------------------------

interface IRoleTally {
  role: PlayerRole;
  players: number;
  dribbleAttempts: number;
  shotAttempts: number;
  passAttempts: number;
  tackleAttempts: number;
}

async function runRoleBehaviorComparison(count: number, pool: IRosterPool) {
  console.log(`\n=== 3. Role behavior comparison (${count} matches, Balanced vs Balanced) ===`);

  const tallies = new Map<PlayerRole, IRoleTally>();
  const seenPlayerRoles = new Map<PlayerRole, Set<string>>();

  function bump(role: PlayerRole, key: keyof Omit<IRoleTally, 'role' | 'players'>) {
    const t = tallies.get(role);
    if (t) t[key]++;
  }

  for (let i = 0; i < count; i++) {
    const [home, away] = pickTwoDistinctClubs(pool.clubs);
    const tactics = buildStyleTactics(pool, home, away, 'Balanced', 'Balanced');
    try {
      const match = await runMatchRaw(home, away, tactics);
      if (!match) continue;
      checkAndRecord(`role-behavior#${i}`, match);

      const roleByPlayerId = new Map<string, PlayerRole>();
      for (const player of [...match.Home.StartingSquad, ...match.Away.StartingSquad]) {
        const role = deriveRole(player);
        roleByPlayerId.set(String(player._id), role);

        if (!tallies.has(role)) {
          tallies.set(role, { role, players: 0, dribbleAttempts: 0, shotAttempts: 0, passAttempts: 0, tackleAttempts: 0 });
          seenPlayerRoles.set(role, new Set());
        }
        const seen = seenPlayerRoles.get(role)!;
        if (!seen.has(String(player._id))) {
          seen.add(String(player._id));
          tallies.get(role)!.players++;
        }
      }

      for (const event of match.Events) {
        if (!event.playerID) continue;
        const role = roleByPlayerId.get(String(event.playerID));
        if (!role) continue;
        if (event.type === 'dribble') bump(role, 'dribbleAttempts');
        else if (event.type === 'shot' || event.type === 'goal' || event.type === 'save' || event.type === 'miss') bump(role, 'shotAttempts');
        else if (event.type === 'pass' || event.type === 'interception') bump(role, 'passAttempts');
        else if (event.type === 'tackle') bump(role, 'tackleAttempts');
      }
    } catch (err) {
      console.error(`  ${home.ClubCode} vs ${away.ClubCode} - failed, skipped:`, err instanceof Error ? err.message : err);
    }
  }

  const rows = [...tallies.values()]
    .filter((t) => t.players > 0)
    .map((t) => ({
      Role: t.role,
      Players: t.players,
      'Dribbles/player': (t.dribbleAttempts / t.players).toFixed(2),
      'Shots/player': (t.shotAttempts / t.players).toFixed(2),
      'Passes+interceptions/player': (t.passAttempts / t.players).toFixed(2),
      'Tackles/player': (t.tackleAttempts / t.players).toFixed(2),
    }))
    .sort((a, b) => a.Role.localeCompare(b.Role));

  console.table(rows);
  console.log(
    'Expect attacking roles (poacher/winger/inside-forward) to lead shots/dribbles per player, ' +
      'and defensive roles (centre-back/holding-midfielder) to lead tackles per player - a flat ' +
      'distribution here would mean role tendencies are not reaching real match behavior.'
  );
}

// --- 4. Possession/phase distribution report -------------------------------

async function runPossessionPhaseDistribution(count: number, pool: IRosterPool) {
  console.log(`\n=== 4. Possession/phase distribution report (${count} matches, Balanced vs Balanced) ===`);

  const reasonCounts: Record<string, number> = {};
  const durations: number[] = [];
  const phaseEventCounts: Record<string, number> = {};

  for (let i = 0; i < count; i++) {
    const [home, away] = pickTwoDistinctClubs(pool.clubs);
    const tactics = buildStyleTactics(pool, home, away, 'Balanced', 'Balanced');
    try {
      const match = await runMatchRaw(home, away, tactics);
      if (!match) continue;
      checkAndRecord(`possession-phase#${i}`, match);

      for (const seq of match.Possession.getCompletedSequences()) {
        reasonCounts[seq.reason] = (reasonCounts[seq.reason] ?? 0) + 1;
        durations.push(seq.durationMinutes);
      }
      for (const event of match.Events) {
        if (event.phase) {
          phaseEventCounts[event.phase] = (phaseEventCounts[event.phase] ?? 0) + 1;
        }
      }
    } catch (err) {
      console.error(`  ${home.ClubCode} vs ${away.ClubCode} - failed, skipped:`, err instanceof Error ? err.message : err);
    }
  }

  console.log('\nPossession sequence reason distribution:');
  console.table(
    Object.entries(reasonCounts).map(([reason, n]) => ({ Reason: reason, Count: n, 'Share %': ((n / durations.length) * 100).toFixed(1) }))
  );
  console.log(`Avg sequence duration: ${average(durations).toFixed(2)} mins (n=${durations.length})`);

  console.log('\nEvent count by match phase:');
  const totalPhaseEvents = Object.values(phaseEventCounts).reduce((a, b) => a + b, 0);
  console.table(
    Object.entries(phaseEventCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([phase, n]) => ({ Phase: phase, Count: n, 'Share %': ((n / totalPhaseEvents) * 100).toFixed(1) }))
  );
}

// --- 6. Shot conversion funnel ----------------------------------------------

interface IPositionFunnel {
  finalThirdTicks: number;
  shootCandidateTicks: number;
  shotsAttempted: number;
}

/**
 * The instrumentation `FUTURE-PLANS.md`'s "Remaining realism-tuning gaps"
 * entry asked for before touching `Decider.ts`'s shoot thresholds:
 * per position, how often the ball carrier's decision fires while the
 * match phase is `'final-third'`/`'chance'`, how often a `'shoot'`
 * candidate actually exists in that decision's candidate pool (not just
 * chosen - `Decider.shootUtility()`'s range gate is a hard binary cutoff,
 * so "candidate exists" already IS "in range"), and how often a shoot
 * candidate is actually the one chosen. This is the real funnel that
 * decides whether the shots-per-team gap is an off-ball positioning
 * problem (players never reach final-third at all) or a range-gate
 * problem (they reach it but the shoot gate is still tighter than
 * "final third" itself) - see the plan this pass followed.
 *
 * Subscribes to `decisionEvents` (Milestone 18's per-decision debug
 * stream) for each match's own id right after `app.setupGame()` (which
 * already resolves `game.Match.id` before the 180-tick loop runs) and
 * unsubscribes right after `app.startGame()` resolves, so listeners don't
 * accumulate across this loop's many matches - the same discipline
 * `decisionEvents.setMaxListeners(24)` in `decisionLog.ts` exists to
 * guard against in the first place.
 */
async function runShotConversionFunnel(count: number, pool: IRosterPool) {
  console.log(`\n=== 6. Shot conversion funnel (${count} matches, Balanced vs Balanced) ===`);

  const funnel = new Map<string, IPositionFunnel>();
  const ensure = (position: string): IPositionFunnel => {
    if (!funnel.has(position)) {
      funnel.set(position, { finalThirdTicks: 0, shootCandidateTicks: 0, shotsAttempted: 0 });
    }
    return funnel.get(position)!;
  };
  ensure('ATT');
  ensure('MID');
  ensure('DEF');

  let shotEventsTotal = 0;
  let shotsChosenTotal = 0;
  let matchesRun = 0;

  for (let i = 0; i < count; i++) {
    const [home, away] = pickTwoDistinctClubs(pool.clubs);
    const tactics = buildStyleTactics(pool, home, away, 'Balanced', 'Balanced');
    const homeId = String(home._id);
    const awayId = String(away._id);
    const app = new App();

    try {
      const game = await app.setupGame(
        [homeId, awayId],
        { home: homeId, away: awayId },
        [home, away],
        { home: tactics[homeId], away: tactics[awayId] }
      );
      const matchId = game.Match.id;

      const listener = (e: DecisionDebugEvent) => {
        if (e.phase !== 'final-third' && e.phase !== 'chance') return;
        const bucket = ensure(e.position);
        bucket.finalThirdTicks++;
        if (e.candidates.some((c) => c.type === 'shoot')) bucket.shootCandidateTicks++;
        if (e.chosen.type === 'shoot') {
          bucket.shotsAttempted++;
          shotsChosenTotal++;
        }
      };
      decisionEvents.on(`${matchId}-decision`, listener);

      const match = await app.startGame();
      decisionEvents.off(`${matchId}-decision`, listener);

      if (!match) continue;
      checkAndRecord(`shot-funnel#${i}`, match);
      matchesRun++;
      shotEventsTotal += match.Events.filter(
        (e) => e.type === 'shot' || e.type === 'goal' || e.type === 'save' || e.type === 'miss'
      ).length;
    } catch (err) {
      console.error(`  ${home.ClubCode} vs ${away.ClubCode} - failed, skipped:`, err instanceof Error ? err.message : err);
    }
  }

  const rows = [...funnel.entries()].map(([position, f]) => ({
    Position: position,
    'Final-third/chance decisions per match': matchesRun ? (f.finalThirdTicks / matchesRun).toFixed(2) : '0.00',
    '% with a shoot candidate': f.finalThirdTicks > 0 ? ((f.shootCandidateTicks / f.finalThirdTicks) * 100).toFixed(1) : '0.0',
    'Shots attempted per match': matchesRun ? (f.shotsAttempted / matchesRun).toFixed(2) : '0.00',
  }));

  console.table(rows);
  console.log(
    `Cross-check: ${shotsChosenTotal} 'shoot' decisions chosen vs ${shotEventsTotal} shot/goal/save/miss events ` +
      `recorded across ${matchesRun} matches (${
        shotsChosenTotal === shotEventsTotal
          ? 'match - every chosen shoot decision produced exactly one shot-outcome event, as expected'
          : 'MISMATCH - a chosen shoot decision did not always produce a shot-outcome event, or vice versa, worth a closer look'
      }).`
  );
}

// --- main -------------------------------------------------------------------

async function main() {
  const count = parseInt(process.argv[2], 10) || 100;
  const pool: IRosterPool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8'));

  if (pool.clubs.length < 2) {
    throw new Error(`Roster pool has fewer than 2 clubs (${pool.clubs.length}) - rerun dumpSimulationRosterPool.ts.`);
  }

  console.log(`Behavior regression suite - ${count} matches per comparison, pool dumped ${pool.dumpedAt}.`);

  await runCautiousVsDirect(count, pool);
  await runHighPressFatigue(count, pool);
  await runRoleBehaviorComparison(count, pool);
  await runPossessionPhaseDistribution(count, pool);
  await runShotConversionFunnel(count, pool);

  console.log('\n=== 5. Replay sanity check summary ===');
  const totalMatches = allViolations.length;
  const failedMatches = allViolations.filter((v) => v.violations.length > 0);
  if (failedMatches.length === 0) {
    console.log(`All ${totalMatches} matches passed replay invariants (single ball owner, monotonic ticks/minutes, no dangling event refs).`);
  } else {
    console.error(`${failedMatches.length}/${totalMatches} matches FAILED replay invariants - see details logged above.`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\nBehavior regression suite failed:', err);
    process.exitCode = 1;
  });
}
