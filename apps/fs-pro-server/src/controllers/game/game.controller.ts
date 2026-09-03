// Sockets...

import { getFixtureById } from '../fixtures/fixture.service';
import { Fixture } from '../fixtures/fixture.model';
import { updateFixture, updateStandings } from './functions';
import { advanceDayIfDone } from '../calendar/calendar.service';
import App from '../app/App';
import log from '../../helpers/logger';
import { SeasonInterface, ClubStandings } from '../seasons/season.model';
import { getSeasonById } from '../seasons/season.service';
import { startMatchReplay } from '../../realtime/matchBroadcaster';
import { saveReplay } from '../match-replays/match-replay.service';
import { ITactic } from '../../state/PersistentState/Formations';

/** Fetches a Season by id, but only returns it if it's still in progress -
 * replaces the raw `fetchSeason({_id, isStarted: true, isFinished: false})`
 * query both call sites below used to make. */
export async function getInProgressSeason(
  id: string
): Promise<SeasonInterface | null> {
  const season = await getSeasonById(id);
  return season && season.isStarted && !season.isFinished ? season : null;
}

interface TeamObject {
  id: string;
  name: string;
  clubCode: string;
  manager: string;
}

interface CurrentMatch {
  SeasonCode?: string;
  App?: App;
  match?: Fixture;
  home?: TeamObject;
  away?: TeamObject;
  season_id?: string;
  HomeSideDetails?: any;
  AwaySideDetails?: any;
}

interface UpdateRelatedDataParams {
  match: Fixture;
  home: TeamObject;
  away: TeamObject;
  season_id: string;
  HomeSideDetails: any;
  AwaySideDetails: any;
}

interface AfterMatchParams {
  homeTable: ClubStandings;
  awayTable: ClubStandings;
  allMatchesPlayedThatDay: boolean;
}

/** `play()`'s resolved shape - matches the contract's `PlayResult` in
 * `packages/api-contract/src/schemas/game.ts` (kept as a separate local
 * type since this is implementation detail, not something else in this
 * file needs to import from the contract package). */
export interface PlayResult {
  homeTable?: ClubStandings;
  awayTable?: ClubStandings;
  match: Fixture | undefined;
  HomeSideDetails: any;
  AwaySideDetails: any;
  lastMatchOfSeason: boolean | undefined;
}

export async function play(fixture_id: string) {
  let CurrentMatch: CurrentMatch = {};

  // [1]
  if (!fixture_id) {
    // SEND IT BACK!
    throw new Error('No Fixture ID sent! ' + fixture_id);
  }

  // [2]
  let fixture: Fixture;

  // fetch fixture...
  // get fixture and its details...
  fixture = (await getFixtureById(fixture_id)) as Fixture;
  // We also need to get the associated calendar day...

  if (!fixture) {
    throw new Error('Fixture not found [f =>' + fixture_id + ' ]');
  }

  // UNCOMMENT O => Check if Fixture is played already
  // if (!fixture.Played) {
  //   throw new Error({msg: 'Fixture already played!', data: {
  //     match: fixture_id,
  //     matchErrorResponseCode: 1
  //   }});
  // };

  // [3]
  CurrentMatch.SeasonCode = fixture.SeasonCode;
  CurrentMatch.App = new App();
  const SeasonCode = fixture.SeasonCode;

  // Friendlies (created via POST /api/game/friendly) are season-less
  // Fixture docs - they carry an explicit tactic per side and skip the
  // standings/day-advance bookkeeping real fixtures need (see the branch
  // at the end of this function).
  const isFriendly = fixture.Type === 'friendly';
  // HomeTactic/AwayTactic are stored as a JSON-stringified `text` column
  // (see game.router.ts's createFriendly - the column isn't `jsonb`), so
  // they come back as strings here, not the ITactic objects the model type
  // claims - parse before use.
  const prefetchedTactics: { home: ITactic; away: ITactic } | undefined =
    fixture.HomeTactic && fixture.AwayTactic
      ? {
          home: JSON.parse(fixture.HomeTactic as unknown as string),
          away: JSON.parse(fixture.AwayTactic as unknown as string),
        }
      : undefined;

  const { HomeTeamId: home, AwayTeamId: away } = fixture;

  try {
    await CurrentMatch.App.setupGame(
      [home, away],
      {
        home,
        away,
      },
      undefined,
      prefetchedTactics
    );
  } catch (error) {
    log(`Error setting up game! (in Rest) => ${error}`);
    throw error;
  }

  // [3.1] Define helper functions
  const updateRelatedData = ({
    match,
    home,
    away,
    season_id,
    HomeSideDetails,
    AwaySideDetails,
  }: UpdateRelatedDataParams) => {
    CurrentMatch = {
      ...CurrentMatch,
      match,
      home,
      away,
      season_id,
      HomeSideDetails,
      AwaySideDetails,
    };

    return updateStandings(
      HomeSideDetails,
      AwaySideDetails,
      match,
      home,
      away,
      season_id
    );
  };

  const afterMatch = async ({
    homeTable,
    awayTable,
    allMatchesPlayedThatDay,
  }: AfterMatchParams) => {
    /** If all matches scheduled for this day have been played, advance the
     * Calendar's CurrentDay/CurrentDate to the next day with an unplayed
     * fixture. */
    if (allMatchesPlayedThatDay && CurrentMatch.match?.ScheduledDay != null) {
      try {
        await advanceDayIfDone(CurrentMatch.match.ScheduledDay);
        // App._app.endGame();
      } catch (error: any) {
        console.log('Error changing current Calendar Day!', error);
        // throw error;
        throw new Error('Error updating current Day ' + error.toString());
      }
    }

    // check the fixture position...
    let season: SeasonInterface | null;
    let lastMatchOfSeason;

    // season.Competition maybe find the competition and do the needful...

    try {
      season = CurrentMatch.season_id
        ? await getInProgressSeason(CurrentMatch.season_id)
        : null;
      // We also need to get the associated calendar day...
      if (season) {
        //  if this fixture's
        lastMatchOfSeason =
          (season.Fixtures ?? []).findIndex((f) => fixture_id == f._id) ==
          (season.Fixtures ?? []).length - 1;
      }

      // THIS SHOULD BE THE LAST THING!

      /**
       * 1. Get current Day with other Matches
       * 2. Check their Played status.
       * 3. Call this same function for all Fixtures which have not been played yet.
       * 4. When you're done, collect the results and send back to client...
       */
      CurrentMatch.App!.endGame();
      log('GAME ENDED from App');

      // console.log(`The Match instances ${Match.instances}`);
      // console.log(`The Game instances ${Game.instances}`);
      // console.log(CurrentMatch.App.Game);
      // console.log(`The Ball instances ${Ball.instances}`);
      // console.log(`The FieldPlayer instances ${FieldPlayer.instances}`);

      // check
      return {
        homeTable,
        awayTable,
        match: CurrentMatch.match,
        HomeSideDetails: CurrentMatch.HomeSideDetails,
        AwaySideDetails: CurrentMatch.AwaySideDetails,
        lastMatchOfSeason,
      };
    } catch (error: any) {
      console.log(`Error at afterMatch -> ` + error.toString());

      console.log(
        'Could not check if Season is over, you should do that manually!'
      );

      throw error;
    }
  };

  // [4] Play Match
  log('Here in startGame!');
  // NOTE: removing static App method.
  return CurrentMatch.App.startGame()
    ?.then(async (m) => {
      // Fire-and-forget: stream the recorded match live over sockets,
      // keyed by fixture_id (known ahead of the kickoff call, unlike
      // match.id) so a debug client can join the room before triggering it.
      startMatchReplay(m, fixture_id);

      // Also persist the same Frames so this match can be re-streamed later
      // on demand (see restRewatchMatch) without re-simulating it. Gated by
      // the same SaveStats flag used for permanent stats below - a friendly
      // played with SaveStats off is meant to leave nothing behind.
      if (isFriendly ? fixture.SaveStats === true : true) {
        saveReplay(fixture_id, m).catch((err: any) => {
          console.error(`[replay] error saving replay for ${fixture_id}:`, err);
        });
      }

      // throw 'Ending match here :)';
      const homeObj = {
        id: m.Home._id,
        name: m.Home.Name,
        clubCode: m.Home.ClubCode,
        manager: m.Home.ManagerId,
      };

      const awayObj = {
        id: m.Away._id,
        name: m.Away.Name,
        clubCode: m.Away.ClubCode,
        manager: m.Away.ManagerId,
      };

      let match: Fixture;
      let HomeSideDetails;
      let AwaySideDetails;

      try {
        const {
          fixture: matchFixture,
          HSD,
          ASD,
        } = await updateFixture(
          m.Details,
          m.Events,
          homeObj,
          awayObj,
          fixture_id,
          isFriendly ? fixture.SaveStats === true : true
        );

        if (!fixture) {
          throw new Error('Error updating Fixture, Match not found!');
        }

        // console.log(`The Match instances ${Match.instances}`);
        // console.log(`The Game instances ${Game.instances}`);
        // console.log(`The Ball instances ${Ball.instances}`);
        // console.log(CurrentMatch.App.Game.MatchBall);
        // console.log(`The FieldPlayer instances ${FieldPlayer.instances}`);

        CurrentMatch.match = matchFixture as Fixture | undefined;
        CurrentMatch.home = homeObj;
        CurrentMatch.away = awayObj;
        CurrentMatch.HomeSideDetails = HSD;
        CurrentMatch.AwaySideDetails = ASD;

        if (isFriendly) {
          // No Season/Day exists for a friendly - skip updateStandings and
          // afterMatch entirely (they'd throw looking for a Day/Season that
          // was never created) and end the game here.
          CurrentMatch.App!.endGame();
          log('GAME ENDED from App (friendly)');

          return {
            homeTable: undefined,
            awayTable: undefined,
            match: matchFixture,
            HomeSideDetails: HSD,
            AwaySideDetails: ASD,
            lastMatchOfSeason: false,
          };
        }

        return {
          home: homeObj,
          away: awayObj,
          match: matchFixture,
          HomeSideDetails: HSD,
          AwaySideDetails: ASD,
          season_id: fixture.SeasonId,
        };
      } catch (error) {
        console.error('Error updating fixture! :( => \n', error);

        throw error;

        //  throw new Error({msg: 'Error updating Fixture ' + error.toString(), data: {
        //       error,
        //       match: fixture_id,
        //       matchErrorResponseCode: 6
        // }});
      }
    })
    .then((result: any) => (isFriendly ? result : updateRelatedData(result)))
    .then((result: any) => (isFriendly ? result : afterMatch(result)));

  // [5] Update standings and shii... do later :)
}
