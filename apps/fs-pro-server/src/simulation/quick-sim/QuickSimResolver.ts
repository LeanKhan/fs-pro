import { IClub } from '../../interfaces/Club';
import { PlayerInterface } from '../../interfaces/Player';
import { ITactic } from '../state/PersistentState/Formations';
import {
  IMatchDetails,
  IMatchEvent,
  IMatchSideDetails,
} from '../classes/Match';
import { PlayerMatchDetailsInterface } from '../../controllers/player-match/player-match.model';
import {
  SimulateMatchRequest,
  SimulatedMatchData,
} from '../../jobs/simulationContract';

/**
 * Samples a Poisson distribution using Knuth's algorithm.
 * Standard statistical model for football goal distribution (Dixon-Coles).
 */
function samplePoisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return Math.max(0, k - 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

/**
 * Fast Statistical Match Resolver.
 * Computes realistic match outcomes, team statistics, player match details, and
 * chronological events in < 5ms without spinning up worker threads or 2D spatial loops.
 */
export class QuickSimResolver {
  public static resolve(request: SimulateMatchRequest): SimulatedMatchData {
    const { fixtureId, clubs, sides, tactics } = request;

    const homeClub = clubs.find((c) => String(c._id) === String(sides.home));
    const awayClub = clubs.find((c) => String(c._id) === String(sides.away));

    if (!homeClub || !awayClub) {
      throw new Error(`QuickSim: Club not found for sides ${sides.home} vs ${sides.away}`);
    }

    const homeSquad = selectStartingLineup(homeClub.Players ?? [], homeClub.Lineup?.startingXI);
    const awaySquad = selectStartingLineup(awayClub.Players ?? [], awayClub.Lineup?.startingXI);

    const homeUnits = unitRatingsForSquad(homeSquad, homeClub);
    const awayUnits = unitRatingsForSquad(awaySquad, awayClub);
    const homeMid = homeUnits.mid;
    const awayMid = awayUnits.mid;

    const { lambdaHome, lambdaAway } = computeExpectedGoals(
      homeUnits,
      awayUnits,
      tactics.home?.styleName,
      tactics.away?.styleName
    );

    const homeGoals = samplePoisson(lambdaHome);
    const awayGoals = samplePoisson(lambdaAway);

    // Possession % based on midfield comparison
    const midTotal = homeMid + awayMid;
    const baseHomePossession = midTotal > 0 ? (homeMid / midTotal) * 100 : 50;
    const homePossession = Math.round(clamp(baseHomePossession + randomInt(-4, 4), 32, 68));
    const awayPossession = 100 - homePossession;

    // Shots and Passes
    const homeShotsOnTarget = Math.max(homeGoals, Math.round(lambdaHome * 2 + randomInt(0, 3)));
    const homeShotsTotal = homeShotsOnTarget + randomInt(3, 8);
    const awayShotsOnTarget = Math.max(awayGoals, Math.round(lambdaAway * 2 + randomInt(0, 3)));
    const awayShotsTotal = awayShotsOnTarget + randomInt(3, 8);

    const homePasses = Math.round((homePossession / 100) * randomInt(750, 950));
    const awayPasses = Math.round((awayPossession / 100) * randomInt(750, 950));

    const homeFouls = randomInt(7, 15);
    const awayFouls = randomInt(7, 15);
    const homeYellows = Math.min(randomInt(1, 3), homeFouls);
    const awayYellows = Math.min(randomInt(1, 3), awayFouls);
    const homeReds = Math.random() < 0.04 ? 1 : 0;
    const awayReds = Math.random() < 0.04 ? 1 : 0;

    // Assign Events and Player Stats
    const events: IMatchEvent[] = [];
    const homePlayerStatsMap = new Map<string, PlayerMatchDetailsInterface>();
    const awayPlayerStatsMap = new Map<string, PlayerMatchDetailsInterface>();

    function initStats(player: PlayerInterface): PlayerMatchDetailsInterface {
      return {
        PlayerId: player._id,
        Player: player,
        FixtureId: fixtureId,
        Goals: 0,
        Saves: 0,
        YellowCards: 0,
        Fouls: 0,
        RedCards: 0,
        Passes: randomInt(15, 55),
        Tackles: randomInt(1, 5),
        Assists: 0,
        CleanSheets: 0,
        Points: 6.0,
        Dribbles: randomInt(0, 4),
        Interceptions: randomInt(1, 4),
        Form: 6.0,
      };
    }

    homeSquad.startingXI.forEach((p) => {
      if (p._id) homePlayerStatsMap.set(p._id, initStats(p));
    });
    awaySquad.startingXI.forEach((p) => {
      if (p._id) awayPlayerStatsMap.set(p._id, initStats(p));
    });

    // Helper to pick a goalscorer weighted by position
    function pickScorer(squad: PickedSquad): PlayerInterface {
      const roll = Math.random();
      if (roll < 0.60 && squad.attackers.length) {
        return squad.attackers[randomInt(0, squad.attackers.length - 1)];
      }
      if (roll < 0.90 && squad.midfielders.length) {
        return squad.midfielders[randomInt(0, squad.midfielders.length - 1)];
      }
      if (squad.defenders.length) {
        return squad.defenders[randomInt(0, squad.defenders.length - 1)];
      }
      return squad.startingXI[randomInt(0, squad.startingXI.length - 1)];
    }

    // Helper to pick assist provider
    function pickAssister(squad: PickedSquad, scorerId?: string): PlayerInterface | null {
      if (Math.random() < 0.25) return null; // Unassisted goal
      const candidates = squad.startingXI.filter((p) => p._id !== scorerId && p.Position !== 'GK');
      if (!candidates.length) return null;
      return candidates[randomInt(0, candidates.length - 1)];
    }

    // Generate Home Goals
    for (let i = 0; i < homeGoals; i++) {
      const minute = randomInt(1, 90);
      const scorer = pickScorer(homeSquad);
      const assister = pickAssister(homeSquad, scorer._id);

      if (scorer._id && homePlayerStatsMap.has(scorer._id)) {
        const stats = homePlayerStatsMap.get(scorer._id)!;
        stats.Goals += 1;
        stats.Points += 4;
      }

      if (assister?._id && homePlayerStatsMap.has(assister._id)) {
        const stats = homePlayerStatsMap.get(assister._id)!;
        stats.Assists += 1;
        stats.Points += 3;
      }

      events.push({
        type: 'goal',
        minute,
        playerID: scorer._id as string,
        playerTeamID: homeClub.ClubCode,
        message: `GOAL! ${scorer.FirstName} ${scorer.LastName} scores for ${homeClub.Name}!`,
      } as any);
    }

    // Generate Away Goals
    for (let i = 0; i < awayGoals; i++) {
      const minute = randomInt(1, 90);
      const scorer = pickScorer(awaySquad);
      const assister = pickAssister(awaySquad, scorer._id);

      if (scorer._id && awayPlayerStatsMap.has(scorer._id)) {
        const stats = awayPlayerStatsMap.get(scorer._id)!;
        stats.Goals += 1;
        stats.Points += 4;
      }

      if (assister?._id && awayPlayerStatsMap.has(assister._id)) {
        const stats = awayPlayerStatsMap.get(assister._id)!;
        stats.Assists += 1;
        stats.Points += 3;
      }

      events.push({
        type: 'goal',
        minute,
        playerID: scorer._id as string,
        playerTeamID: awayClub.ClubCode,
        message: `GOAL! ${scorer.FirstName} ${scorer.LastName} scores for ${awayClub.Name}!`,
      } as any);
    }

    // Distribute Cards
    function assignCards(
      yellowCount: number,
      redCount: number,
      squad: PickedSquad,
      statsMap: Map<string, PlayerMatchDetailsInterface>,
      club: IClub
    ) {
      const outfield = squad.startingXI.filter((p) => p.Position !== 'GK');
      for (let y = 0; y < yellowCount; y++) {
        const p = outfield[randomInt(0, outfield.length - 1)];
        if (!p?._id) continue;
        const stats = statsMap.get(p._id);
        if (stats) {
          stats.YellowCards += 1;
          stats.Points -= 1;
          events.push({
            type: 'yellow-card',
            minute: randomInt(10, 88),
            playerID: p._id,
            playerTeamID: club.ClubCode,
            message: `Yellow card shown to ${p.FirstName} ${p.LastName} (${club.Name}).`,
          } as any);
        }
      }
      for (let r = 0; r < redCount; r++) {
        const p = outfield[randomInt(0, outfield.length - 1)];
        if (!p?._id) continue;
        const stats = statsMap.get(p._id);
        if (stats) {
          stats.RedCards += 1;
          stats.Points -= 3;
          events.push({
            type: 'red-card',
            minute: randomInt(25, 85),
            playerID: p._id,
            playerTeamID: club.ClubCode,
            message: `RED CARD! ${p.FirstName} ${p.LastName} is sent off for ${club.Name}!`,
          } as any);
        }
      }
    }

    assignCards(homeYellows, homeReds, homeSquad, homePlayerStatsMap, homeClub);
    assignCards(awayYellows, awayReds, awaySquad, awayPlayerStatsMap, awayClub);

    // Goalkeeper Saves & CleanSheets
    if (homeSquad.gk?._id && homePlayerStatsMap.has(homeSquad.gk._id)) {
      const gkStats = homePlayerStatsMap.get(homeSquad.gk._id)!;
      gkStats.Saves = Math.max(0, awayShotsOnTarget - awayGoals);
      if (awayGoals === 0) {
        gkStats.CleanSheets = 1;
        gkStats.Points += 3;
        homeSquad.defenders.forEach((d) => {
          if (d._id && homePlayerStatsMap.has(d._id)) {
            const defStats = homePlayerStatsMap.get(d._id)!;
            defStats.CleanSheets = 1;
            defStats.Points += 2;
          }
        });
      }
    }

    if (awaySquad.gk?._id && awayPlayerStatsMap.has(awaySquad.gk._id)) {
      const gkStats = awayPlayerStatsMap.get(awaySquad.gk._id)!;
      gkStats.Saves = Math.max(0, homeShotsOnTarget - homeGoals);
      if (homeGoals === 0) {
        gkStats.CleanSheets = 1;
        gkStats.Points += 3;
        awaySquad.defenders.forEach((d) => {
          if (d._id && awayPlayerStatsMap.has(d._id)) {
            const defStats = awayPlayerStatsMap.get(d._id)!;
            defStats.CleanSheets = 1;
            defStats.Points += 2;
          }
        });
      }
    }

    // Sort events chronologically
    events.sort((a, b) => ((a as any).minute ?? 0) - ((b as any).minute ?? 0));

    // Determine MOTM (Man of the Match)
    const allStats = [...homePlayerStatsMap.values(), ...awayPlayerStatsMap.values()];
    const bestPlayer = allStats.sort((a, b) => b.Points - a.Points)[0];
    const motmPlayer = bestPlayer?.Player ?? homeSquad.startingXI[0];
    const motm = {
      id: motmPlayer._id ?? '',
      name: `${motmPlayer.FirstName} ${motmPlayer.LastName}`,
    };

    let isDraw = homeGoals === awayGoals;
    let winnerClub = isDraw ? null : homeGoals > awayGoals ? homeClub : awayClub;
    let loserClub = isDraw ? null : homeGoals > awayGoals ? awayClub : homeClub;
    let penalties: { Home: number; Away: number; Winner: string } | undefined = undefined;

    const isKnockout =
      request.isKnockout === true ||
      request.fixtureType === 'cup' ||
      (request.stage &&
        (request.stage.toLowerCase().includes('knockout') ||
          request.stage.toLowerCase().includes('round') ||
          request.stage.toLowerCase().includes('quarter') ||
          request.stage.toLowerCase().includes('semi') ||
          request.stage.toLowerCase().includes('final')));

    if (isDraw && isKnockout) {
      let hPens = 0;
      let aPens = 0;
      let hKicks = 0;
      let aKicks = 0;

      // Best of 5 kicks
      while (hKicks < 5 || aKicks < 5) {
        if (hKicks <= aKicks) {
          hKicks++;
          if (Math.random() < 0.76) hPens++;
        } else {
          aKicks++;
          if (Math.random() < 0.74) aPens++;
        }
        const hRemaining = 5 - hKicks;
        const aRemaining = 5 - aKicks;
        if (hPens > aPens + aRemaining || aPens > hPens + hRemaining) {
          break;
        }
      }

      // Sudden death
      while (hPens === aPens) {
        const hScore = Math.random() < 0.75;
        const aScore = Math.random() < 0.72;
        if (hScore) hPens++;
        if (aScore) aPens++;
      }

      const penWinner = hPens > aPens ? homeClub : awayClub;
      const penLoser = hPens > aPens ? awayClub : homeClub;
      winnerClub = penWinner;
      loserClub = penLoser;
      isDraw = false;
      penalties = {
        Home: hPens,
        Away: aPens,
        Winner: penWinner.ClubCode,
      };

      events.push({
        type: 'penalty-shootout',
        minute: 120,
        playerTeamID: penWinner.ClubCode,
        message: `PENALTIES: ${penWinner.Name} win ${Math.max(hPens, aPens)} - ${Math.min(hPens, aPens)} on penalties!`,
      } as any);
    }

    const homeSideDetails: IMatchSideDetails = {
      ClubId: homeClub._id as string,
      FixtureId: fixtureId,
      TimesWithBall: Math.round(homePossession * 1.5),
      Possession: homePossession,
      Goals: homeGoals,
      TotalShots: homeShotsTotal,
      ShotsOnTarget: homeShotsOnTarget,
      ShotsOffTarget: homeShotsTotal - homeShotsOnTarget,
      Fouls: homeFouls,
      YellowCards: homeYellows,
      RedCards: homeReds,
      Passes: homePasses,
      Events: events.filter((e: any) => e.playerTeamID === homeClub.ClubCode),
      PlayerStats: Array.from(homePlayerStatsMap.values()),
      Won: !isDraw && winnerClub === homeClub,
      Drew: isDraw,
    };

    const awaySideDetails: IMatchSideDetails = {
      ClubId: awayClub._id as string,
      FixtureId: fixtureId,
      TimesWithBall: Math.round(awayPossession * 1.5),
      Possession: awayPossession,
      Goals: awayGoals,
      TotalShots: awayShotsTotal,
      ShotsOnTarget: awayShotsOnTarget,
      ShotsOffTarget: awayShotsTotal - awayShotsOnTarget,
      Fouls: awayFouls,
      YellowCards: awayYellows,
      RedCards: awayReds,
      Passes: awayPasses,
      Events: events.filter((e: any) => e.playerTeamID === awayClub.ClubCode),
      PlayerStats: Array.from(awayPlayerStatsMap.values()),
      Won: !isDraw && winnerClub === awayClub,
      Drew: isDraw,
    };

    const halfTimeHomeGoals = Math.min(homeGoals, randomInt(0, homeGoals));
    const halfTimeAwayGoals = Math.min(awayGoals, randomInt(0, awayGoals));

    const fullTimeScore = penalties
      ? `${homeGoals} - ${awayGoals} (${penalties.Home} - ${penalties.Away} pens)`
      : `${homeGoals} - ${awayGoals}`;

    const details: IMatchDetails = {
      Title: `${homeClub.Name} vs ${awayClub.Name}`,
      LeagueName: homeClub.LeagueCode ?? '',
      Draw: isDraw,
      Played: true,
      Time: new Date(),
      FirstHalfScore: `${halfTimeHomeGoals} - ${halfTimeAwayGoals}`,
      FullTimeScore: fullTimeScore,
      HomeTeamScore: homeGoals,
      AwayTeamScore: awayGoals,
      Winner: winnerClub ? { code: winnerClub.ClubCode, id: winnerClub._id as string } : null,
      Loser: loserClub ? { code: loserClub.ClubCode, id: loserClub._id as string } : null,
      MOTM: motm,
      TotalPasses: homePasses + awayPasses,
      Goals: homeGoals + awayGoals,
      HomeTeamDetails: homeSideDetails,
      AwayTeamDetails: awaySideDetails,
      Penalties: penalties,
    };

    return {
      Home: {
        _id: homeClub._id as string,
        Name: homeClub.Name,
        ClubCode: homeClub.ClubCode,
        ManagerId: homeClub.ManagerId ? (homeClub.ManagerId as string) : (null as any),
      },
      Away: {
        _id: awayClub._id as string,
        Name: awayClub.Name,
        ClubCode: awayClub.ClubCode,
        ManagerId: awayClub.ManagerId ? (awayClub.ManagerId as string) : (null as any),
      },
      Frames: [],
      Details: details,
      Events: events,
    };
  }
}
