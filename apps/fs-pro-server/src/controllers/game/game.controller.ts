// Sockets...

import { Request, Response, NextFunction } from 'express';

import { getFixtureById } from '../fixtures/fixture.service';
import { findDayByFixtureId } from '../days/day.service';
import { Fixture } from '../fixtures/fixture.model';
import { updateFixture, updateStandings } from './functions';
import { changeCurrentDay } from '../calendar/calendar.controller';
import responseHandler from '../../helpers/responseHandler';
import { Match } from '../../classes/Match';
import Ball from '../../classes/Ball';
import FieldPlayer from '../../classes/FieldPlayer';
import App from '../app/App';
import Game from '../Game';
import log from '../../helpers/logger';
import { SeasonInterface, ClubStandings } from '../seasons/season.model';
import { fetchSeason } from '../seasons/season.service';
import axios from 'axios';
import { CalendarMatchInterface, DayInterface } from '../days/day.model';
import { startMatchReplay } from '../../realtime/matchBroadcaster';
import { enqueueMatchPlay } from '../../jobs/matchQueue';
import { saveReplay, fetchReplay } from '../match-replays/match-replay.service';
import {
  ITactic,
  DEFAULT_TACTIC,
  formationShapes,
  PLAYING_STYLES,
} from '../../state/PersistentState/Formations';
import { createFixture } from '../fixtures/fixture.service';
import { fetchSingleClubById } from '../clubs/club.service';

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
  matches: CalendarMatchInterface[];
  currentDay: DayInterface;
}

interface PlayResult {
  homeTable: ClubStandings;
  awayTable: ClubStandings;
  match: Fixture | undefined;
  HomeSideDetails: any;
  AwaySideDetails: any;
  lastMatchOfSeason: boolean | undefined;
}

interface GameResults {
  main: PlayResult | undefined;
  others: PlayResult[];
}

async function play(fixture_id: string) {
  let CurrentMatch: CurrentMatch = {};

  // [1]
  if (!fixture_id) {
    // SEND IT BACK!
    throw new Error('No Fixture ID sent! ' + fixture_id);
  }

  // [2]
  let fixture: Fixture;

  // fetch fixture...
  try {
    // get fixture and its details...
    fixture = (await getFixtureById(fixture_id)) as Fixture;
    // We also need to get the associated calendar day...
  } catch (error) {
    throw error;
  }

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
  const prefetchedTactics: { home: ITactic; away: ITactic } | undefined =
    fixture.HomeTactic && fixture.AwayTactic
      ? { home: fixture.HomeTactic, away: fixture.AwayTactic }
      : undefined;

  let { HomeTeam: home, AwayTeam: away } = fixture;

  home = home.toString();
  away = away.toString();

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
      fixture_id,
      home,
      away,
      season_id
    );
  };

  const afterMatch = async ({ homeTable, awayTable, matches, currentDay }: AfterMatchParams) => {
    // Check if we need to update Calendar day
    const allMatchesPlayed = matches.every((m) => m.Played);

    /** If all matches in the Day have been played, we can change the
     * CurrentDay...
     */
    if (allMatchesPlayed) {
      // We have to get this from the kini...
      // TODO there should be a better way to get these constants...
      const currentYear = CurrentMatch.SeasonCode!.split('-')
        .splice(1)
        .join('-');

      try {
        await changeCurrentDay(currentYear, currentDay);
        // App._app.endGame();
      } catch (error: any) {
        console.log('Error changing current Calendar Day!', error);
        // throw error;
        throw new Error('Error updating current Day ' + error.toString());
      }
    }

    // check the fixture position...
    let season: SeasonInterface;
    let lastMatchOfSeason;

    // season.Competition maybe find the competition and do the needful...

    try {
      const q = {
        _id: CurrentMatch.season_id,
        isStarted: true,
        isFinished: false,
      };
      // get fixture and its details...
      // tho, part of the query should be the year. Year should be the CurrentYear
      season = await fetchSeason(q, 'Fixtures', false);
      // We also need to get the associated calendar day...
      if (season) {
        //  if this fixture's
        lastMatchOfSeason =
          season.Fixtures.findIndex((f) => fixture_id == f._id) ==
          season.Fixtures.length - 1;
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
  return CurrentMatch.App
    .startGame()
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
        manager: m.Home.Manager,
      };

      const awayObj = {
        id: m.Away._id,
        name: m.Away.Name,
        clubCode: m.Away.ClubCode,
        manager: m.Away.Manager,
      };

      let match: Fixture;
      let HomeSideDetails;
      let AwaySideDetails;

      try {
        const { fixture: matchFixture, HSD, ASD } = await updateFixture(
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
          season_id: fixture.Season,
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
    .then((result: any) =>
      isFriendly ? result : updateRelatedData(result)
    )
    .then((result: any) => (isFriendly ? result : afterMatch(result)));

  // [5] Update standings and shii... do later :)
}

export async function restPlayGameNew(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const fixture_id = req.params.fixture;
  const send_other_results = req.query.send_other_results == "true";
  const simulate_rest  = req.query.simulate_rest == "true";
  // Play the 'main' fixture
  play(fixture_id)
    .then(async (d) => {

      const results: GameResults = {
        main: d,
        others: []
      };

      // for the other matches
      // TODO: THIS IS TEMPORARY.
      // I want to try to put these api stuff in a function and just call it, once.

      if (simulate_rest) {
        // call siumlate sequence...
        const matchDay = await findDayByFixtureId(fixture_id, { populate: false });

        if (!matchDay || matchDay.isFree) {
          return responseHandler.fail(
              res,
              400,
              'Match Day not found!'
            );
        }

        const matches_not_played = matchDay.Matches.filter((m) => !m.Played);
        // Don't play last matches!
        const fixtures_not_played = matches_not_played.map((m) => m.Fixture);

        try {

        // const fixtures_not_played_endpoints = fixtures_not_played
        // .map(f => `http://${req.header('Host')}/api/game/kickoff/${f}`);

        // NOTE: doing this in a foreach would not be synchronous (one by one)
        for (let index = 0; index < fixtures_not_played.length; index++){
          // let r = await axios.get(fixtures_not_played_endpoints[index]);
          let r = await play(fixtures_not_played[index].toString());
          let result: any;
          if((r as any).data && (r as any).data.payload) {
            result = (r as any).data.payload;
          } else {
            result = r;
          };
          results.others.push(result);
        }

        // console.log(results);
           // return responseHandler.success(
           //    res,
           //    200,
           //    '[New] Match(es) Played successfully!',
           //    results
           //  );

      } catch (error: any) {
        console.log(error);
         return responseHandler.fail(
        res,
        400,
        '[New] Error Playing Match(es) and updating Standings! ',
        { msg: error.toString(), error, fixture_id, matchErrorResponseCode: 2 }
      );
      }
      }

      return responseHandler.success(
        res,
        200,
        '[New] Match Played successfully!',
        send_other_results ? results : results.main
      );
    })
    .catch((error) => {
      console.error('Error Playing Match with new endpoint => ', error);
      return responseHandler.fail(
        res,
        400,
        '[New] Error Playing Match and updating Standings! ',
        { msg: error.toString(), error, fixture_id, matchErrorResponseCode: 2 }
      );
    });
}

export async function restPlayGame(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { fixture: fixture_id } = req.params;

  if (!fixture_id) {
    // SEND IT BACK!
    return responseHandler.fail(res, 404, 'No Fixture ID sent!', {
      matchErrorResponseCode: 1,
    });
  }

  let fixture: Fixture;

  try {
    // get fixture and its details...
    fixture = (await getFixtureById(fixture_id)) as Fixture;
    // We also need to get the associated calendar day...
  } catch (error: any) {
    console.error('Error! Fetching Fixture to play match =>', error);

    return responseHandler.fail(
      res,
      400,
      'Error Playing Match! and fetching Fixture!',
      {
        ...error,
        matchErrorResponseCode: 1,
      }
    );
  }

  // TODO - UNCOMMENT O!
  // if (fixture!.Played) {
  //   // has been played!
  //   return responseHandler.fail(res, 400, 'Match has been played already!', {
  //     matchErrorResponseCode: 2,
  //   });
  // }

  req.body.SeasonCode = fixture.SeasonCode;

  let { HomeTeam: home, AwayTeam: away } = fixture;

  home = home.toString();
  away = away.toString();

  try {
    await App._app.setupGame([home, away], {
      home,
      away,
    });
  } catch (error: any) {
    log(`Error setting up game! (in Rest) => ${error}`);
    return responseHandler.fail(res, 400, 'Error starting Game!', {
      ...error,
      matchErrorResponseCode: 4,
    });
  }

  log('Here in startGame!');
  App._app
    .startGame()
    ?.then(async (m) => {
      // Fire-and-forget: stream the recorded match live over sockets,
      // keyed by fixture_id (known ahead of the kickoff call, unlike
      // match.id) so a debug client can join the room before triggering it.
      startMatchReplay(m, fixture_id);

      // Also persist the same Frames so this match can be re-streamed later
      // on demand (see restRewatchMatch) without re-simulating it.
      saveReplay(fixture_id, m).catch((err: any) => {
        console.error(`[replay] error saving replay for ${fixture_id}:`, err);
      });

      const homeObj = {
        id: m.Home._id,
        name: m.Home.Name,
        clubCode: m.Home.ClubCode,
        manager: m.Home.Manager,
      };

      const awayObj = {
        id: m.Away._id,
        name: m.Away.Name,
        clubCode: m.Away.ClubCode,
        manager: m.Away.Manager,
      };

      let match: Fixture;
      let HomeSideDetails;
      let AwaySideDetails;

      try {
        const { fixture: matchFixture, HSD, ASD } = await updateFixture(
          m.Details,
          m.Events,
          homeObj,
          awayObj,
          fixture_id
        );

        if (!fixture) {
          return responseHandler.fail(
            res,
            400,
            'Error updating fixtures! - Match cannot be found!',
            {
              matchErrorResponseCode: 3,
            }
          );
        }

        req.body.home = homeObj;
        req.body.away = awayObj;
        req.body.match = matchFixture;
        req.body.HomeSideDetails = HSD;
        req.body.AwaySideDetails = ASD;
        req.body.season_id = fixture.Season;

        // console.log(`The Match instances ${Match.instances}`);
        // console.log(`The Ball instances ${Ball.instances}`);
        // console.log(`The FieldPlayer instances ${FieldPlayer.instances}`);
      } catch (error) {
        console.error('Error updating fixture! :( => \n', error);

        return responseHandler.fail(res, 400, 'Error updating fixtures!', {
          matchErrorResponseCode: 6,
        });
      }

      return next();
    })
    .catch((err) => {
      console.log('ERROR PLAYING MATCH!', err);

      console.log(`Error updating fixture...`, err);

      return responseHandler.fail(res, 400, 'Error playing match!', {
        ...err,
        matchErrorResponseCode: 5,
      });
    });
}

export function restUpdateStandings(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Soon we will be getting it from the fixture object...
  const { fixture: fixture_id } = req.params;
  const {
    match,
    home,
    away,
    season_id,
    HomeSideDetails,
    AwaySideDetails,
  } = req.body;

  updateStandings(
    HomeSideDetails,
    AwaySideDetails,
    fixture_id,
    home,
    away,
    season_id
  )
    .then(async ({ homeTable, awayTable, matches, currentDay }) => {
      // Check if we need to update Calendar day
      const allMatchesPlayed = matches.every((m) => m.Played);

      // move current Day!
      req.body.homeTable = homeTable;
      req.body.awayTable = awayTable;

      /** If all matches in the Day have been played, we can change the
       * CurrentDay...
       */
      if (allMatchesPlayed) {
        // We have to get this from the kini...
        // TODO there should be a better way to get these constants...
        const currentYear = req.body.SeasonCode.split('-').splice(1).join('-');
        changeCurrentDay(currentYear, currentDay)
          .then(() => {
            console.log('Current Day changed successfully!');
            // App._app.endGame();
            // log('GAME ENDED from App');
          })
          .catch((err) => {
            console.log('Error changing current Calendar Day!', err);
            return responseHandler.fail(
              res,
              400,
              'Error changing current Calendar Day!',
              err
            );
          });
      }

      // check the fixture position...
      let season: SeasonInterface;
      let lastMatchOfSeason;

      // season.Competition maybe find the competition and do the needful...

      try {
        const q = { _id: season_id, isStarted: true, isFinished: false };
        // get fixture and its details...
        // tho, part of the query should be the year. Year should be the CurrentYear
        season = await fetchSeason(q, 'Fixtures', false);
        // We also need to get the associated calendar day...
        if (season) {
          //  if this fixture's
          lastMatchOfSeason =
            season.Fixtures.findIndex((f) => fixture_id == f._id) ==
            season.Fixtures.length - 1;
        }

        // THIS SHOULD BE THE LAST THING!

        /**
         * 1. Get current Day with other Matches
         * 2. Check their Played status.
         * 3. Call this same function for all Fixtures which have not been played yet.
         * 4. When you're done, collect the results and send back to client...
         */
        App._app.endGame();
        log('GAME ENDED from App');

        // check
        return responseHandler.success(res, 200, 'Match Played successfully!', {
          homeTable,
          awayTable,
          match,
          HomeSideDetails,
          AwaySideDetails,
          lastMatchOfSeason,
        });
      } catch (error) {
        console.log(`Error! => ${error}`);

        console.log(
          'Could not check if Season is over, you should do that manually!'
        );
      }
    })
    .catch((err) => {
      console.log(err);
      responseHandler.fail(
        res,
        400,
        'Error Playing Match and updating Standings!',
        { ...err, matchErrorResponseCode: 2 }
      );
    })
    .finally(() => {
      // Delete CurrentMatch Instance...
      // Why are we ending the game here? We already end it if the match was successful, so no need.
      // If it fails, there's no 'game' to end :p
      App._app.endGame();
      log('GAME ENDED from App');
    });
}

/**
 * Enqueues a fixture to be simulated in a background worker and replayed
 * live over Socket.IO (see src/jobs/matchQueue.ts), instead of running the
 * whole simulation synchronously inline like restPlayGame/restPlayGameNew
 * do. Returns immediately - it does not wait for the match to be played,
 * and does not persist anything (no updateFixture/updateStandings/day
 * advance). For exercising the record-then-replay pipeline (e.g. via
 * PitchPreview.html) without touching the existing, real-client-facing
 * kickoff flow.
 */
export function restEnqueueMatch(req: Request, res: Response) {
  const { fixture: fixture_id } = req.params;

  if (!fixture_id) {
    return responseHandler.fail(res, 404, 'No Fixture ID sent!', {
      matchErrorResponseCode: 1,
    });
  }

  const result = enqueueMatchPlay(fixture_id);

  if (!result.queued) {
    return responseHandler.fail(
      res,
      409,
      result.reason || 'Match already queued or in progress',
      { fixture_id }
    );
  }

  return responseHandler.success(res, 202, 'Match enqueued for simulation', {
    fixture_id,
  });
}

/**
 * Re-streams a previously-played match's recorded Frames over the same
 * `/match-replay` Socket.IO room a live kickoff uses (see
 * realtime/matchBroadcaster.ts), reading them back from the MatchReplay
 * record saveReplay() wrote when the match was originally played instead of
 * re-simulating anything. Returns immediately - the client is expected to
 * have already joined the fixture's room (MatchReplaySocket.watch) before
 * calling this, exactly like the live-kickoff flow.
 */
export async function restRewatchMatch(req: Request, res: Response) {
  const { fixture: fixture_id } = req.params;

  if (!fixture_id) {
    return responseHandler.fail(res, 404, 'No Fixture ID sent!', {
      matchErrorResponseCode: 1,
    });
  }

  let replay;
  try {
    replay = await fetchReplay(fixture_id);
  } catch (error: any) {
    console.error('Error fetching match replay =>', error);
    return responseHandler.fail(res, 400, 'Error fetching match replay', {
      msg: error.toString(),
      matchErrorResponseCode: 2,
    });
  }

  if (!replay) {
    return responseHandler.fail(res, 404, 'No replay saved for this match', {
      fixture_id,
      matchErrorResponseCode: 3,
    });
  }

  startMatchReplay(
    {
      Home: { _id: replay.Home.id, Name: replay.Home.name, ClubCode: replay.Home.code },
      Away: { _id: replay.Away.id, Name: replay.Away.name, ClubCode: replay.Away.code },
      Frames: replay.Frames,
      Details: replay.Details,
    },
    fixture_id,
    replay.TickMs
  );

  return responseHandler.success(res, 202, 'Match replay started', { fixture_id });
}

/**
 * The formation/style names a client can offer in a tactic picker - sourced
 * straight from Formations.ts so there's exactly one place that defines
 * what a valid ITactic looks like.
 */
export function restTacticOptions(req: Request, res: Response) {
  return responseHandler.success(res, 200, 'Tactic options fetched successfully', {
    formations: Object.keys(formationShapes),
    styles: Object.keys(PLAYING_STYLES),
  });
}

/**
 * Creates a season-less Fixture (Type: 'friendly') between two arbitrary
 * clubs, with an explicit tactic per side, that can be played and watched
 * through the exact same /matchzone/:fixture flow as a real match - see
 * play()'s isFriendly branch above for how kickoff treats it differently.
 */
export async function restCreateFriendly(req: Request, res: Response) {
  const { homeClubId, awayClubId, homeTactic, awayTactic, saveStats } = req.body;

  if (!homeClubId || !awayClubId) {
    return responseHandler.fail(res, 400, 'homeClubId and awayClubId are required', {
      matchErrorResponseCode: 1,
    });
  }

  if (homeClubId === awayClubId) {
    return responseHandler.fail(res, 400, 'homeClubId and awayClubId must be different clubs', {
      matchErrorResponseCode: 2,
    });
  }

  try {
    const [homeClub, awayClub] = await Promise.all([
      fetchSingleClubById(homeClubId, false),
      fetchSingleClubById(awayClubId, false),
    ]);

    if (!homeClub || !awayClub) {
      return responseHandler.fail(res, 404, 'One or both clubs could not be found', {
        matchErrorResponseCode: 3,
      });
    }

    const result = await createFixture({
      Title: `${homeClub.Name} vs ${awayClub.Name} (Friendly)`,
      Home: homeClub.ClubCode,
      Away: awayClub.ClubCode,
      HomeTeam: homeClubId,
      AwayTeam: awayClubId,
      Type: 'friendly',
      Status: 'friendly',
      Played: false,
      HomeTactic: homeTactic || DEFAULT_TACTIC,
      AwayTactic: awayTactic || DEFAULT_TACTIC,
      SaveStats: saveStats === true,
    } as any);

    return responseHandler.success(res, 200, 'Friendly fixture created successfully', {
      fixture_id: result._id,
    });
  } catch (error: any) {
    console.error('Error creating friendly fixture =>', error);
    return responseHandler.fail(res, 400, 'Error creating friendly fixture', {
      msg: error.toString(),
      matchErrorResponseCode: 4,
    });
  }
}
