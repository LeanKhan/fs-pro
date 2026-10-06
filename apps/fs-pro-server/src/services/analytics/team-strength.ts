/**
 * Team strength estimates for analytics (club performance, previews): unit
 * ratings from a club's best XI and a rough expected-goals line for a
 * matchup. A heuristic, NOT a match engine - matches are only ever played
 * by the sim service (crates/sim-core).
 */
import { IClub } from '../../interfaces/Club';
import { PlayerInterface } from '../../interfaces/Player';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface PickedSquad {
  startingXI: PlayerInterface[];
  gk: PlayerInterface;
  defenders: PlayerInterface[];
  midfielders: PlayerInterface[];
  attackers: PlayerInterface[];
}

function selectStartingLineup(
  players: PlayerInterface[],
  preferredIds?: string[]
): PickedSquad {
  const healthyPlayers = players.filter(
    (p) => !(p.Injury && (p.Injury as any).daysRemaining > 0)
  );
  const sorted = [...healthyPlayers].sort((a, b) => (b.Rating ?? 50) - (a.Rating ?? 50));
  const startingSet = new Set<string>();
  const startingXI: PlayerInterface[] = [];

  // 0. If preferred starters are provided, select healthy preferred players first
  if (preferredIds?.length) {
    for (const pId of preferredIds) {
      if (startingXI.length >= 11) break;
      const found = healthyPlayers.find((p) => String(p._id) === pId);
      if (found && found._id && !startingSet.has(found._id)) {
        startingSet.add(found._id);
        startingXI.push(found);
      }
    }
  }

  // 1. Pick best GK if not yet picked
  if (!startingXI.some((p) => p.Position === 'GK')) {
    const gk = sorted.find((p) => p.Position === 'GK') ?? sorted[0];
    if (gk?._id && !startingSet.has(gk._id)) {
      startingSet.add(gk._id);
      startingXI.push(gk);
    }
  }

  // 2. Pick up to 4 DEF
  for (const p of sorted) {
    if (startingXI.filter((x) => x.Position === 'DEF').length >= 4) break;
    if (p.Position === 'DEF' && p._id && !startingSet.has(p._id)) {
      startingSet.add(p._id);
      startingXI.push(p);
    }
  }

  // 3. Pick up to 4 MID
  for (const p of sorted) {
    if (startingXI.filter((x) => x.Position === 'MID').length >= 4) break;
    if (p.Position === 'MID' && p._id && !startingSet.has(p._id)) {
      startingSet.add(p._id);
      startingXI.push(p);
    }
  }

  // 4. Pick up to 2 ATT
  for (const p of sorted) {
    if (startingXI.filter((x) => x.Position === 'ATT').length >= 2) break;
    if (p.Position === 'ATT' && p._id && !startingSet.has(p._id)) {
      startingSet.add(p._id);
      startingXI.push(p);
    }
  }

  // 5. Fill remaining slots up to 11 with highest-rated remaining players
  for (const p of sorted) {
    if (startingXI.length >= 11) break;
    if (p._id && !startingSet.has(p._id)) {
      startingSet.add(p._id);
      startingXI.push(p);
    }
  }

  return {
    startingXI,
    gk: startingXI.find((p) => p.Position === 'GK') ?? startingXI[0],
    defenders: startingXI.filter((p) => p.Position === 'DEF'),
    midfielders: startingXI.filter((p) => p.Position === 'MID'),
    attackers: startingXI.filter((p) => p.Position === 'ATT'),
  };
}

function computeUnitRating(players: PlayerInterface[], fallback: number): number {
  if (!players.length) return fallback;
  const sum = players.reduce((acc, p) => acc + (p.Rating ?? fallback), 0);
  return sum / players.length;
}

/** A side's four unit ratings, as the resolver derives them from its XI. */
export interface UnitRatings {
  att: number;
  mid: number;
  def: number;
  gk: number;
}

function unitRatingsForSquad(squad: PickedSquad, club: IClub): UnitRatings {
  const ovr = club.Rating ?? 60;
  return {
    att: computeUnitRating(squad.attackers, club.AttackingClass ?? ovr),
    mid: computeUnitRating(squad.midfielders, ovr),
    def: computeUnitRating(squad.defenders, club.DefensiveClass ?? ovr),
    gk: squad.gk?.Rating ?? ovr,
  };
}

/** The unit ratings the resolver would use for this club today (its saved
 * XI, or the auto-picked best XI), plus the XI itself. */
export function unitRatingsForClub(club: IClub): UnitRatings & { xi: PlayerInterface[] } {
  const squad = selectStartingLineup(club.Players ?? [], club.Lineup?.startingXI);
  return {
    ...unitRatingsForSquad(squad, club),
    xi: [...(squad.gk ? [squad.gk] : []), ...squad.defenders, ...squad.midfielders, ...squad.attackers],
  };
}

function styleBonus(styleName?: string): { att: number; def: number } {
  const style = styleName?.toLowerCase() ?? '';
  if (style.includes('press') || style.includes('attack')) return { att: 0.2, def: -0.15 };
  if (style.includes('block') || style.includes('defend')) return { att: -0.2, def: 0.25 };
  return { att: 0, def: 0 };
}

/**
 * The resolver's expected-goals model, exported so the performance analysis
 * uses exactly the same numbers as the matches themselves: each side's
 * expected goals move by (its attack + midfield - the opponent's defence +
 * goalkeeper) / 25, plus a home edge and a small tactical-style effect.
 */
export function computeExpectedGoals(
  home: UnitRatings,
  away: UnitRatings,
  homeStyle?: string,
  awayStyle?: string
): { lambdaHome: number; lambdaAway: number } {
  const homeTactic = styleBonus(homeStyle);
  const awayTactic = styleBonus(awayStyle);

  // Baseline Expected Goals (xG): Real-world averages ~1.45 home, ~1.15 away
  const homeAdvantage = 0.25;
  const homeStrengthDiff = (home.att + home.mid - (away.def + away.gk)) / 25;
  const awayStrengthDiff = (away.att + away.mid - (home.def + home.gk)) / 25;

  return {
    lambdaHome: clamp(1.4 + homeAdvantage + homeStrengthDiff + homeTactic.att - awayTactic.def, 0.2, 5.0),
    lambdaAway: clamp(1.15 + awayStrengthDiff + awayTactic.att - homeTactic.def, 0.15, 4.5),
  };
}
