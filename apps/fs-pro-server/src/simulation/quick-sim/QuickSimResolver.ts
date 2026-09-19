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

    const homeOvr = homeClub.Rating ?? 60;
    const awayOvr = awayClub.Rating ?? 60;

    const homeAtt = computeUnitRating(homeSquad.attackers, homeClub.AttackingClass ?? homeOvr);
    const homeMid = computeUnitRating(homeSquad.midfielders, homeOvr);
    const homeDef = computeUnitRating(homeSquad.defenders, homeClub.DefensiveClass ?? homeOvr);
    const homeGk = homeSquad.gk?.Rating ?? homeOvr;

    const awayAtt = computeUnitRating(awaySquad.attackers, awayClub.AttackingClass ?? awayOvr);
    const awayMid = computeUnitRating(awaySquad.midfielders, awayOvr);
    const awayDef = computeUnitRating(awaySquad.defenders, awayClub.DefensiveClass ?? awayOvr);
    const awayGk = awaySquad.gk?.Rating ?? awayOvr;

    // Tactical influence
    let homeTacticalBonusAtt = 0;
    let homeTacticalBonusDef = 0;
    const homeStyle = tactics.home?.styleName?.toLowerCase() ?? '';
    if (homeStyle.includes('press') || homeStyle.includes('attack')) {
      homeTacticalBonusAtt += 0.2;
      homeTacticalBonusDef -= 0.15;
    } else if (homeStyle.includes('block') || homeStyle.includes('defend')) {
      homeTacticalBonusDef += 0.25;
      homeTacticalBonusAtt -= 0.2;
    }

    let awayTacticalBonusAtt = 0;
    let awayTacticalBonusDef = 0;
    const awayStyle = tactics.away?.styleName?.toLowerCase() ?? '';
    if (awayStyle.includes('press') || awayStyle.includes('attack')) {
      awayTacticalBonusAtt += 0.2;
      awayTacticalBonusDef -= 0.15;
    } else if (awayStyle.includes('block') || awayStyle.includes('defend')) {
      awayTacticalBonusDef += 0.25;
      awayTacticalBonusAtt -= 0.2;
    }

    // Baseline Expected Goals (xG): Real-world averages ~1.45 home, ~1.15 away
    const homeAdvantage = 0.25;
    const homeStrengthDiff = (homeAtt + homeMid - (awayDef + awayGk)) / 25;
    const awayStrengthDiff = (awayAtt + awayMid - (homeDef + homeGk)) / 25;

    const lambdaHome = clamp(1.4 + homeAdvantage + homeStrengthDiff + homeTacticalBonusAtt - awayTacticalBonusDef, 0.2, 5.0);
    const lambdaAway = clamp(1.15 + awayStrengthDiff + awayTacticalBonusAtt - homeTacticalBonusDef, 0.15, 4.5);

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

    const isDraw = homeGoals === awayGoals;
    const winnerClub = isDraw ? null : homeGoals > awayGoals ? homeClub : awayClub;
    const loserClub = isDraw ? null : homeGoals > awayGoals ? awayClub : homeClub;

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
      Won: !isDraw && homeGoals > awayGoals,
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
      Won: !isDraw && awayGoals > homeGoals,
      Drew: isDraw,
    };

    const halfTimeHomeGoals = Math.min(homeGoals, randomInt(0, homeGoals));
    const halfTimeAwayGoals = Math.min(awayGoals, randomInt(0, awayGoals));

    const details: IMatchDetails = {
      Title: `${homeClub.Name} vs ${awayClub.Name}`,
      LeagueName: homeClub.LeagueCode ?? '',
      Draw: isDraw,
      Played: true,
      Time: new Date(),
      FirstHalfScore: `${halfTimeHomeGoals} - ${halfTimeAwayGoals}`,
      FullTimeScore: `${homeGoals} - ${awayGoals}`,
      HomeTeamScore: homeGoals,
      AwayTeamScore: awayGoals,
      Winner: winnerClub ? { code: winnerClub.ClubCode, id: winnerClub._id as string } : null,
      Loser: loserClub ? { code: loserClub.ClubCode, id: loserClub._id as string } : null,
      MOTM: motm,
      TotalPasses: homePasses + awayPasses,
      Goals: homeGoals + awayGoals,
      HomeTeamDetails: homeSideDetails,
      AwayTeamDetails: awaySideDetails,
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
