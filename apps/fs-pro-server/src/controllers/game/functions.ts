import {
  IMatchDetails,
  IMatchEvent,
  IMatchSideDetails,
} from '../../classes/Match';
import { ClubStandings } from '../seasons/season.model';
import { getSeasonById, updateSeasonFields } from '../seasons/season.service';
import { updateFixtureFields, allFixturesPlayedForDay } from '../fixtures/fixture.service';
import { Fixture } from '../fixtures/fixture.model';
import { createManyPlayerMatches } from '../player-match/player-match.service';
import { PlayerMatchDetailsInterface } from '../player-match/player-match.model';
import { createClubMatch } from '../club-match/club-match.service';

interface Team {
  id: string;
  name: string;
  clubCode: string;
  manager: string;
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

  const HSD = {...HomeSideDetails};
  const ASD = {...AwaySideDetails};

  //  { _id: fixture_id, Played: false }, TODO - Change back to this!
  //  Find that particular fixture that has not been played of course...

  const savePlayerAndClubStats = async (club: IMatchSideDetails) => {
    // ClubMatchDetails is created first (with an empty PlayerStats) so each
    // PlayerMatchDetails row can set its own ClubMatchDetails FK back to it
    // - the reverse FK Postgres uses instead of a PlayerStats array (that
    // array doesn't exist on Postgres at all). This is the opposite order
    // from before (PlayerMatchDetails used to be created first, purely to
    // get ids for Mongo's array) - harmless reorder on Mongo, since nothing
    // there depends on which side gets created first.
    const clubMatch: any = await createClubMatch({ ...club, Fixture: fixture_id, PlayerStats: [] } as any);
    const clubMatchId = clubMatch._id;

    if (saveStats) {
      club.PlayerStats = club.PlayerStats.map((p: any) => ({
        ...p,
        Fixture: fixture_id,
        ClubMatchDetails: clubMatchId,
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
    savePlayerAndClubStats(HomeSideDetails),
    savePlayerAndClubStats(AwaySideDetails),
  ]);

  return {
    fixture: await updateFixtureFields(fixture_id, {
      Played: true,
      PlayedAt: new Date(),
      Details: matchDetails,
      Events,
      HomeSideDetails: homeMatchDetailsID,
      AwaySideDetails: awayMatchDetailsID,
      HomeManager: home.manager,
      AwayManager: away.manager,
    } as any),
    HSD,
    ASD,
  };

  // Here we just need to save this data in the database...
}

export async function updateStandings(
  homeDetails: IMatchSideDetails,
  awayDetails: IMatchSideDetails,
  fixture: Fixture,
  home: Team,
  away: Team,
  seasonID: string
): Promise<{ homeTable: ClubStandings; awayTable: ClubStandings; allMatchesPlayedThatDay: boolean }> {
  // Find out who...
  // HomeSideDetails.Won = MatchDetails.Winner?.id === home.id;
  // AwaySideDetails.Won = MatchDetails.Winner?.id === away.id;
  // Maybe we should only update these one by one...
  // const homePoints = homeDetails.Goals > awayDetails.Goals ? '3' : homeDetails.Goals == awayDetails

  // Maybe you should use the fixture code to get the day then the week...

  const homeTable: ClubStandings = {
    ClubCode: home.clubCode,
    ClubID: home.id,
    Points: 0,
    Played: 1,
    Wins: 0,
    Losses: 0,
    Draws: 0,
    GF: homeDetails.Goals,
    GA: awayDetails.Goals,
    GD: homeDetails.Goals - awayDetails.Goals,
  };
  const awayTable: ClubStandings = {
    ClubCode: away.clubCode,
    ClubID: away.id,
    Points: 0,
    Played: 1,
    Wins: 0,
    Losses: 0,
    Draws: 0,
    GF: awayDetails.Goals,
    GA: homeDetails.Goals,
    GD: awayDetails.Goals - homeDetails.Goals,
  };

  if (homeDetails.Goals > awayDetails.Goals) {
    homeTable.Draws = 0;
    homeTable.Points = 3;
    homeTable.Wins = 1;
    homeTable.Losses = 0;

    awayTable.Draws = 0;
    awayTable.Points = 0;
    awayTable.Wins = 0;
    awayTable.Losses = 1;
  } else if (awayDetails.Goals > homeDetails.Goals) {
    awayTable.Draws = 0;
    awayTable.Points = 3;
    awayTable.Wins = 1;
    awayTable.Losses = 0;

    homeTable.Draws = 0;
    homeTable.Points = 0;
    homeTable.Wins = 0;
    homeTable.Losses = 1;
  } else if (homeDetails.Goals === awayDetails.Goals) {
    // A draw...
    homeTable.Draws = 1;
    homeTable.Points = 1;
    homeTable.Wins = 0;
    homeTable.Losses = 0;

    awayTable.Draws = 1;
    awayTable.Points = 1;
    awayTable.Wins = 0;
    awayTable.Losses = 0;
  }

  /**
   * Update the standings based on the match result :) - a read-modify-write
   * against `Season.Standings` since Postgres has no positional-array-
   * element update the way Mongo's `arrayFilters`/`$[home]`/`$[away]` did;
   * safe since two matches never update the same season+week concurrently.
   * `fixture.Week` is a stored column, so no Day lookup is needed to find
   * which week this match belongs to.
   */
  try {
    const week = fixture.Week as number;
    const season = await getSeasonById(seasonID);
    if (!season) {
      throw new Error('Season does not exist!');
    }

    const standings = season.Standings.map((weekStandings, i) => {
      if (i !== week - 1) return weekStandings;

      return {
        ...weekStandings,
        Table: weekStandings.Table.map((row: ClubStandings) => {
          if (row.ClubCode === home.clubCode) return homeTable;
          if (row.ClubCode === away.clubCode) return awayTable;
          return row;
        }),
      };
    });

    await updateSeasonFields(seasonID, { Standings: standings });

    const allMatchesPlayedThatDay =
      fixture.ScheduledDay != null ? await allFixturesPlayedForDay(fixture.ScheduledDay) : true;

    return { homeTable, awayTable, allMatchesPlayedThatDay };
  } catch (error) {
    console.error('Error updating Season! :(', error);
    throw new Error(error as any);
  }
}
