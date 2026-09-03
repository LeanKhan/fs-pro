import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type {
  GameResults as ContractGameResults,
  PlayResult as ContractPlayResult,
} from '@repo/api-contract';

import { play, getInProgressSeason } from './game.controller';
import { getFixturesByDay } from '../fixtures/fixture.service';
import { createFixture } from '../fixtures/fixture.service';
import { getClubById } from '../clubs/club.service';
import { startMatchReplay } from '../../realtime/matchBroadcaster';
import { enqueueMatchPlay } from '../../jobs/matchQueue';
import { fetchReplay } from '../match-replays/match-replay.service';
import {
  DEFAULT_TACTIC,
  formationShapes,
  PLAYING_STYLES,
} from '../../state/PersistentState/Formations';

const s = initServer();

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export const gameTsRestRoutes = s.router(contract.game, {
  /** Plays the 'main' fixture synchronously; when `simulate_rest` is also
   * set, plays every other unplayed fixture scheduled the same day right
   * after (sequentially, not in parallel - matches the original's `for`
   * loop, since two matches updating the same season+week's standings
   * concurrently isn't safe - see `functions.ts`'s `updateStandings`). */
  kickoffNew: async ({ params, query }) => {
    const fixture_id = params.fixture;

    try {
      const main = await play(fixture_id);
      const results: ContractGameResults = {
        main: main as ContractPlayResult,
        others: [],
      };

      if (query.simulate_rest) {
        const scheduledDay = main.match?.ScheduledDay;

        if (scheduledDay == null) {
          return {
            status: 400 as const,
            body: { success: false, message: 'Match Day not found!' },
          };
        }

        const dayFixtures = await getFixturesByDay(scheduledDay);
        const fixturesNotPlayed = dayFixtures
          .filter((f) => !f.Played)
          .map((f) => f._id as string);

        for (const otherId of fixturesNotPlayed) {
          const other = await play(otherId);
          results.others.push(other as ContractPlayResult);
        }
      }

      return {
        status: 200 as const,
        body: {
          success: true,
          message: '[New] Match Played successfully!',
          payload: query.send_other_results ? results : (main as ContractPlayResult),
        },
      };
    } catch (err) {
      console.error('Error Playing Match with new endpoint => ', err);
      return {
        status: 400 as const,
        body: {
          success: false,
          message: '[New] Error Playing Match and updating Standings! ',
          payload: fail(err),
        },
      };
    }
  },

  /** Enqueues a fixture to be simulated in a background worker and replayed
   * live over Socket.IO, instead of running the whole simulation
   * synchronously inline. Returns immediately - it does not wait for the
   * match to be played, and does not persist anything. Used by
   * PitchPreview.html, not the real client app (kickoffNew above). */
  enqueueMatch: async ({ params }) => {
    const fixture_id = params.fixture;
    const result = enqueueMatchPlay(fixture_id);

    if (!result.queued) {
      return {
        status: 409 as const,
        body: {
          success: false,
          message: result.reason || 'Match already queued or in progress',
          payload: { fixture_id },
        },
      };
    }

    return {
      status: 202 as const,
      body: {
        success: true,
        message: 'Match enqueued for simulation',
        payload: { fixture_id },
      },
    };
  },

  /** Re-streams a previously-played match's recorded Frames over the same
   * /match-replay Socket.IO room a live kickoff uses, reading them back
   * from the MatchReplay record `play()` wrote instead of re-simulating
   * anything. The client is expected to have already joined the fixture's
   * room before calling this. */
  rewatchMatch: async ({ params }) => {
    const fixture_id = params.fixture;

    let replay;
    try {
      replay = await fetchReplay(fixture_id);
    } catch (err) {
      console.error('Error fetching match replay =>', err);
      return {
        status: 400 as const,
        body: { success: false, message: 'Error fetching match replay', payload: fail(err) },
      };
    }

    if (!replay) {
      return {
        status: 404 as const,
        body: { success: false, message: 'No replay saved for this match' },
      };
    }

    startMatchReplay(
      {
        Home: {
          _id: replay.Home.id,
          Name: replay.Home.name,
          ClubCode: replay.Home.code,
        },
        Away: {
          _id: replay.Away.id,
          Name: replay.Away.name,
          ClubCode: replay.Away.code,
        },
        Frames: replay.Frames,
        Details: replay.Details,
      },
      fixture_id,
      replay.TickMs
    );

    return {
      status: 202 as const,
      body: {
        success: true,
        message: 'Match replay started',
        payload: { fixture_id },
      },
    };
  },

  /** The formation/style names a client can offer in a tactic picker -
   * sourced straight from Formations.ts so there's exactly one place that
   * defines what a valid ITactic looks like. */
  tacticOptions: async () => {
    return {
      status: 200 as const,
      body: {
        success: true,
        message: 'Tactic options fetched successfully',
        payload: {
          formations: Object.keys(formationShapes),
          styles: Object.keys(PLAYING_STYLES),
        },
      },
    };
  },

  /** Creates a season-less Fixture (Type: 'friendly') between two arbitrary
   * clubs, with an explicit tactic per side, playable through the exact
   * same /matchzone/:fixture flow as a real match - see `play()`'s
   * `isFriendly` branch for how kickoff treats it differently. */
  createFriendly: async ({ body }) => {
    const { homeClubId, awayClubId, homeTactic, awayTactic, saveStats } = body;

    if (homeClubId === awayClubId) {
      return {
        status: 400 as const,
        body: {
          success: false,
          message: 'homeClubId and awayClubId must be different clubs',
        },
      };
    }

    try {
      const [homeClub, awayClub] = await Promise.all([
        getClubById(homeClubId),
        getClubById(awayClubId),
      ]);

      if (!homeClub || !awayClub) {
        return {
          status: 404 as const,
          body: { success: false, message: 'One or both clubs could not be found' },
        };
      }

      const result = await createFixture({
        Title: `${homeClub.Name} vs ${awayClub.Name} (Friendly)`,
        Home: homeClub.ClubCode,
        Away: awayClub.ClubCode,
        HomeTeamId: homeClubId,
        AwayTeamId: awayClubId,
        Type: 'friendly',
        Status: 'friendly',
        Played: false,
        // `HomeTactic`/`AwayTactic` are a `text` column (see db/drizzle/
        // schema.ts), not `jsonb` - the repository's create() passes
        // values straight through with no serialization, so an object
        // here would otherwise be written as the literal string
        // "[object Object]" (confirmed live) - see the matching
        // JSON.parse in game.controller.ts's play().
        HomeTactic: JSON.stringify(homeTactic || DEFAULT_TACTIC),
        AwayTactic: JSON.stringify(awayTactic || DEFAULT_TACTIC),
        SaveStats: saveStats === true,
      } as any);

      return {
        status: 200 as const,
        body: {
          success: true,
          message: 'Friendly fixture created successfully',
          payload: { fixture_id: result._id as string },
        },
      };
    } catch (err) {
      console.error('Error creating friendly fixture =>', err);
      return {
        status: 400 as const,
        body: {
          success: false,
          message: 'Error creating friendly fixture',
          payload: fail(err),
        },
      };
    }
  },
});
