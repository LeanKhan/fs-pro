// Sockets...

import { getFixtureById } from '../fixtures/fixture.service';
import { Fixture } from '../fixtures/fixture.model';
import { updateFixture } from './functions';
import { RankingService } from '../../services/competitions/ranking.service';
import { EditionService } from '../../services/competitions/edition.service';
import log from '../../helpers/logger';
import { ClubStandings } from '../seasons/season.model';
import { saveReplay } from '../match-replays/match-replay.service';
import { ITactic } from '../../match/tactics';
import { simulateMatch } from '../../jobs/matchQueue';
import { buildSimulateMatchRequest } from '../../jobs/buildSimulateMatchRequest';
import { matchSeedFor } from '../../jobs/simulationContract';
import { seededRandom } from '../../match/random';
import { frameCount } from '../../realtime/packedFrames';

interface TeamObject {
  id: string;
  name: string;
  clubCode: string;
  manager: string | null;
}

interface CurrentMatch {
  SeasonCode?: string;
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
  homeTable: ClubStandings | undefined;
  awayTable: ClubStandings | undefined;
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

export interface PlayOptions {
  /** Nobody will watch this match: the engine plays it the same, but
   * records no replay frames (and none are streamed or saved). */
  headless?: boolean;
  skipStandings?: boolean;
  /** Skip the post-match wrap-up (the caller ends the game itself). */
  skipDayAdvance?: boolean;
  skipReplay?: boolean;
  /** Small home-side Rating nudge for this match only (never persisted) -
   * used by play.service.ts's playMatch() to apply Stadium Grounds/Staff
   * House facility effects without mutating the club's real Rating. */
  homeRatingBonus?: number;
  /** The away side takes no fatigue or injuries (see updateFixture). */
  restAway?: boolean;
}

export async function play(
  fixture_id: string,
  options?: PlayOptions
) {
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

  // Milestone 9: building the request (clubs fetch + tactics resolve)
  // still happens here, on the main thread - the worker_thread the
  // simulation itself runs in stays DB-free (see simulateMatch()/
  // buildSimulateMatchRequest.ts).
  const isKnockout =
    fixture.Type === 'cup' ||
    fixture.Stage === 'knockout' ||
    Boolean(fixture.Stage?.toLowerCase().includes('knockout')) ||
    Boolean(fixture.Stage?.toLowerCase().includes('round')) ||
    Boolean(fixture.Stage?.toLowerCase().includes('quarter')) ||
    Boolean(fixture.Stage?.toLowerCase().includes('semi')) ||
    Boolean(fixture.Stage?.toLowerCase().includes('final')) ||
    fixture.isFinalMatch === true;

  let simulateRequest;
  try {
    simulateRequest = await buildSimulateMatchRequest(
      fixture_id,
      home,
      away,
      prefetchedTactics,
      {
        fixtureType: fixture.Type ?? undefined,
        stage: fixture.Stage ?? undefined,
        isKnockout,
      },
      options?.homeRatingBonus
    );
    simulateRequest.includeFrames = !options?.headless;
  } catch (error) {
    log(`Error setting up game! (in Rest) => ${error}`);
    throw error;
  }

  // [3.1] Define helper functions
  /** Competition fixtures go to Rankings (and may finish a first-to
   * edition); the world day loop, not this match, moves the calendar on. */
  const updateRelatedData = async ({
    match,
    home,
    away,
    season_id,
    HomeSideDetails,
    AwaySideDetails,
  }: UpdateRelatedDataParams): Promise<AfterMatchParams> => {
    CurrentMatch = {
      ...CurrentMatch,
      match,
      home,
      away,
      season_id,
      HomeSideDetails,
      AwaySideDetails,
    };

    const applied = await RankingService.applyResult(String(match._id));
    if (applied.status === 'applied' && applied.firstToReachedBy) {
      await EditionService.finish(applied.seasonId, {
        firstToWinner: applied.firstToReachedBy,
      });
    }
    return { homeTable: undefined, awayTable: undefined };
  };

  const afterMatch = async ({ homeTable, awayTable }: AfterMatchParams) => {
    return {
      homeTable,
      awayTable,
      match: CurrentMatch.match,
      HomeSideDetails: CurrentMatch.HomeSideDetails,
      AwaySideDetails: CurrentMatch.AwaySideDetails,
      lastMatchOfSeason: false,
    };
  };

  // [4] Play the match - on the sim service, the one match engine. A
  // failure rejects here (no substitute engine); callers retry.
  return simulateMatch(simulateRequest)
    .then((result) => {
      if (!result.ok) {
        throw new Error(`Match ${fixture_id} could not be played: ${result.error}`);
      }
      return result.match;
    })
    .then(async (m) => {
      // If knockout match ended in draw, ensure winner is decided via penalties
      if (isKnockout && m.Details.Draw) {
        const shootout = { next: seededRandom(`${matchSeedFor(simulateRequest)}:shootout`) };
        let hPens = 0;
        let aPens = 0;
        let hKicks = 0;
        let aKicks = 0;
        while (hKicks < 5 || aKicks < 5) {
          if (hKicks <= aKicks) {
            hKicks++;
            if (shootout.next() < 0.75) hPens++;
          } else {
            aKicks++;
            if (shootout.next() < 0.75) aPens++;
          }
          const hRem = 5 - hKicks;
          const aRem = 5 - aKicks;
          if (hPens > aPens + aRem || aPens > hPens + hRem) break;
        }
        while (hPens === aPens) {
          if (shootout.next() < 0.75) hPens++;
          if (shootout.next() < 0.75) aPens++;
        }
        const homeWon = hPens > aPens;
        m.Details.Draw = false;
        m.Details.Penalties = {
          Home: hPens,
          Away: aPens,
          Winner: homeWon ? m.Home.ClubCode : m.Away.ClubCode,
        };
        m.Details.FullTimeScore = `${m.Details.HomeTeamScore} - ${m.Details.AwayTeamScore} (${hPens} - ${aPens} pens)`;
        m.Details.Winner = homeWon
          ? { code: m.Home.ClubCode, id: m.Home._id }
          : { code: m.Away.ClubCode, id: m.Away._id };
        m.Details.Loser = homeWon
          ? { code: m.Away.ClubCode, id: m.Away._id }
          : { code: m.Home.ClubCode, id: m.Home._id };
        if (m.Details.HomeTeamDetails) {
          m.Details.HomeTeamDetails.Won = homeWon;
          m.Details.HomeTeamDetails.Drew = false;
        }
        if (m.Details.AwayTeamDetails) {
          m.Details.AwayTeamDetails.Won = !homeWon;
          m.Details.AwayTeamDetails.Drew = false;
        }
      }

      // Persist the replay so the Matchzone can play it (GET
      // /game/replay/:fixture/data) without re-simulating. Headless matches
      // have no frames. Saving is gated by SaveStats like permanent stats -
      // a friendly played with SaveStats off leaves nothing behind.
      const hasFrames = frameCount(m.Frames) > 0;
      if (hasFrames && !options?.skipReplay && (isFriendly ? fixture.SaveStats === true : true)) {
        saveReplay(fixture_id, m).catch((err: any) => {
          console.error(`[replay] error saving replay for ${fixture_id}:`, err);
        });
      }

      // throw 'Ending match here :)';
      const homeObj = {
        id: m.Home._id,
        name: m.Home.Name,
        clubCode: m.Home.ClubCode,
        manager: m.Home.ManagerId && typeof m.Home.ManagerId === 'string' && m.Home.ManagerId.trim() ? m.Home.ManagerId : null,
      };

      const awayObj = {
        id: m.Away._id,
        name: m.Away.Name,
        clubCode: m.Away.ClubCode,
        manager: m.Away.ManagerId && typeof m.Away.ManagerId === 'string' && m.Away.ManagerId.trim() ? m.Away.ManagerId : null,
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
          isFriendly ? fixture.SaveStats === true : true,
          { restAway: options?.restAway }
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
    .then((result: any) =>
      isFriendly || options?.skipStandings ? result : updateRelatedData(result)
    )
    .then((result: any) =>
      isFriendly || options?.skipDayAdvance ? result : afterMatch(result)
    );

  // [5] Update standings and shii... do later :)
}
