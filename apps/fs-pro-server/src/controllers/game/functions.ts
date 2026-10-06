import {
  IMatchDetails,
  IMatchEvent,
  IMatchSideDetails,
} from '../../simulation/classes/Match';
import { updateFixtureFields } from '../fixtures/fixture.service';
import { createManyPlayerMatches } from '../player-match/player-match.service';
import { PlayerMatchDetailsInterface } from '../player-match/player-match.model';
import { createClubMatch } from '../club-match/club-match.service';
import { PlayerFitnessService } from '../../services/players/player-fitness.service';
import { getClubById, updateClubFields } from '../clubs/club.service';
import { getAssetEffects } from '../../services/facilities/facilities.service';
import {
  applyMatchResult,
  attendanceFill,
  ensureStanding,
} from '../../services/world/club-standing.service';

interface Team {
  id: string;
  name: string;
  clubCode: string;
  manager: string | null;
}

// };

/**
 * Maybe we will update a player's rating only at the end of the season...
 */

export async function updateFixture(
  MatchDetails: IMatchDetails,
  events: IMatchEvent[],
  home: Team,
  away: Team,
  fixture_id: string,
  saveStats = true
) {
  const matchDetails = {
    ...MatchDetails,
    MOTM: MatchDetails.MOTM.id,
    Winner: MatchDetails.Winner ? MatchDetails.Winner.id : null,
    Loser: MatchDetails.Loser ? MatchDetails.Loser.id : null,
  };
  const Events = events;
  const HomeSideDetails = MatchDetails.HomeTeamDetails;
  const AwaySideDetails = MatchDetails.AwayTeamDetails;

  // Save PlayerStats then save it in Club Details...

  if (matchDetails.Draw) {
    HomeSideDetails.Won = false;
    AwaySideDetails.Won = false;
    HomeSideDetails.Drew = true;
    AwaySideDetails.Drew = true;
  } else {
    HomeSideDetails.Won = MatchDetails.Winner!.id === home.id;
    AwaySideDetails.Won = MatchDetails.Winner!.id === away.id;
  }

  const HSD = { ...HomeSideDetails };
  const ASD = { ...AwaySideDetails };

  //  { _id: fixture_id, Played: false }, TODO - Change back to this!
  //  Find that particular fixture that has not been played of course...

  const savePlayerAndClubStats = async (club: IMatchSideDetails, teamId?: string) => {
    // ClubMatchDetails is created first (with an empty PlayerStats) so each
    // PlayerMatchDetails row can set its own ClubMatchDetails FK back to it
    // - the reverse FK Postgres uses instead of a PlayerStats array (that
    // array doesn't exist on Postgres at all). This is the opposite order
    // from before (PlayerMatchDetails used to be created first, purely to
    // get ids for Mongo's array) - harmless reorder on Mongo, since nothing
    // there depends on which side gets created first.
    const clubMatch: any = await createClubMatch({
      ...club,
      FixtureId: fixture_id,
      PlayerStats: [],
    } as any);
    const clubMatchId = clubMatch._id;

    if (saveStats) {
      // Apply player fitness loss and in-match injury rolls (modulated by team's Medical Centre)
      await PlayerFitnessService.applyMatchFatigueAndInjuries(
        club.PlayerStats as PlayerMatchDetailsInterface[],
        teamId
      );

      club.PlayerStats = club.PlayerStats.map((p: any) => ({
        ...p,
        FixtureId: fixture_id,
        ClubMatchDetailsId: clubMatchId,
      }));

      const res = await createManyPlayerMatches(
        club.PlayerStats as PlayerMatchDetailsInterface[]
      );
      // res is the ids...
      club.PlayerStats = res.map((r: any) => r._id) as string[];
    } else {
      // Not counting this match toward permanent player stats history -
      // skip the PlayerMatch inserts entirely. The club's box score (goals,
      // shots, etc.) is still saved below via ClubMatchDetails so the match
      // can be viewed, just without per-player career-stat rows.
      club.PlayerStats = [];
    }

    return clubMatchId;
  };

  const [homeMatchDetailsID, awayMatchDetailsID] = await Promise.all([
    savePlayerAndClubStats(HomeSideDetails, home.id),
    savePlayerAndClubStats(AwaySideDetails, away.id),
  ]);

  // Home team matchday attendance and gate receipts
  try {
    const homeClub = await getClubById(home.id);
    if (homeClub) {
      // Capacity comes from the club's Stands level (services/facilities);
      // how much of it fills comes from the fanbase, form going into this
      // match and the opponent's pull (world/club-standing.service.ts).
      const stadiumCapacity = (await getAssetEffects(home.id)).capacity;
      const [homeStanding, awayStanding] = await Promise.all([
        ensureStanding(home.id),
        ensureStanding(away.id),
      ]);
      const attendance = Math.round(
        stadiumCapacity *
          attendanceFill({
            fans: homeStanding.Fans,
            capacity: stadiumCapacity,
            form: homeStanding.Form,
            opponentReputation: awayStanding.Reputation,
          })
      );
      const ticketPrice = 28;
      const matchdayRevenue = attendance * ticketPrice;
      // Per-head running costs plus ground upkeep that grows with stadium size.
      const matchdayCosts = Math.round(attendance * 6 + 1000 + stadiumCapacity * 0.5);
      const netProfit = matchdayRevenue - matchdayCosts;

      const currentBudget = homeClub.Budget ?? 1000000;
      const newBudget = currentBudget + netProfit;

      const finances = (homeClub.Finances as any) || {
        totalMatchdayRevenue: 0,
        totalMatchdayCosts: 0,
        history: [],
      };

      finances.totalMatchdayRevenue = (finances.totalMatchdayRevenue || 0) + matchdayRevenue;
      finances.totalMatchdayCosts = (finances.totalMatchdayCosts || 0) + matchdayCosts;
      if (!Array.isArray(finances.history)) finances.history = [];
      finances.history.unshift({
        fixtureId: fixture_id,
        date: new Date(),
        attendance,
        capacity: stadiumCapacity,
        revenue: matchdayRevenue,
        costs: matchdayCosts,
        net: netProfit,
      });
      if (finances.history.length > 25) finances.history.pop();

      await updateClubFields(home.id, {
        Budget: newBudget,
        Finances: finances,
      });
    }
  } catch (e) {
    console.error('Error applying matchday financials:', e);
  }

  // The one seam where results move the world: fans, reputation, board
  // confidence, form and squad morale for both clubs. League matchdays and
  // PLAY matches both pass through here - don't call it anywhere else.
  try {
    await applyMatchResult(
      home.id,
      away.id,
      Number((MatchDetails as any).HomeTeamScore ?? HomeSideDetails.Goals ?? 0),
      Number((MatchDetails as any).AwayTeamScore ?? AwaySideDetails.Goals ?? 0)
    );
  } catch (e) {
    console.error('Error applying club standing:', e);
  }

  return {
    fixture: await updateFixtureFields(fixture_id, {
      Played: true,
      PlayedAt: new Date(),
      Details: matchDetails,
      Events,
      HomeSideDetailsId: homeMatchDetailsID,
      AwaySideDetailsId: awayMatchDetailsID,
      HomeManagerId: home.manager && typeof home.manager === 'string' && home.manager.trim() ? home.manager : null,
      AwayManagerId: away.manager && typeof away.manager === 'string' && away.manager.trim() ? away.manager : null,
    } as any),
    HSD,
    ASD,
  };

  // Here we just need to save this data in the database...
}
