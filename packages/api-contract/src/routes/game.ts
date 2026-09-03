// packages/api-contract/src/routes/game.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import { booleanQuery } from '../schemas/query';
import { GameResultsSchema, PlayResultSchema, TacticSchema } from '../schemas/game';

const c = initContract();

// Note: `GET /kickoff/:fixture` (the old `restPlayGame`+`restUpdateStandings`
// 2-middleware chain, driven by the `App._app` static singleton) is
// intentionally NOT part of this contract - confirmed zero client callers
// (the real app, and PitchPreview.html's debug tool, both use
// `/kickoff-new/:fixture` instead) and dropped rather than ported, same
// treatment as season's dead `/is-finished` and calendar's dead
// `/update-ages`. `App._app` was only ever used by this dead pair.
export const gameContract = c.router(
  {
    /** Runs a fixture's match simulation synchronously and returns the
     * result. `send_other_results=true` + `simulate_rest=true` also plays
     * every other unplayed fixture scheduled the same day inline, returning
     * `{main, others}` instead of just `main`. */
    kickoffNew: {
      method: 'GET',
      path: '/kickoff-new/:fixture',
      pathParams: z.object({
        fixture: z.string(),
      }),
      query: z.object({
        send_other_results: booleanQuery().optional(),
        simulate_rest: booleanQuery().optional(),
      }),
      responses: {
        200: successEnvelope(z.union([GameResultsSchema, PlayResultSchema])),
        400: failEnvelope(),
      },
    },

    /** Enqueues a fixture to be simulated in a background worker and
     * replayed live over Socket.IO, instead of running the simulation
     * synchronously inline - returns immediately, before the match is
     * actually played. Used by the standalone PitchPreview.html debug tool,
     * not the real client app (which uses kickoffNew). */
    enqueueMatch: {
      method: 'GET',
      path: '/enqueue/:fixture',
      pathParams: z.object({
        fixture: z.string(),
      }),
      responses: {
        202: successEnvelope(z.object({ fixture_id: z.string() })),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** Re-streams a previously-played match's recorded Frames over the
     * /match-replay Socket.IO room, without re-simulating anything. The
     * client is expected to have already joined the fixture's room before
     * calling this. */
    rewatchMatch: {
      method: 'GET',
      path: '/replay/:fixture',
      pathParams: z.object({
        fixture: z.string(),
      }),
      responses: {
        202: successEnvelope(z.object({ fixture_id: z.string() })),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** The formation/style names a client can offer in a tactic picker. */
    tacticOptions: {
      method: 'GET',
      path: '/tactic-options',
      responses: {
        200: successEnvelope(
          z.object({
            formations: z.array(z.string()),
            styles: z.array(z.string()),
          })
        ),
      },
    },

    /** Creates a season-less Fixture (Type: 'friendly') between two
     * arbitrary clubs, with an explicit tactic per side, playable through
     * the same /matchzone/:fixture flow as a real match. */
    createFriendly: {
      method: 'POST',
      path: '/friendly',
      body: z.object({
        homeClubId: z.string(),
        awayClubId: z.string(),
        homeTactic: TacticSchema.optional(),
        awayTactic: TacticSchema.optional(),
        saveStats: z.boolean().optional(),
      }),
      responses: {
        200: successEnvelope(z.object({ fixture_id: z.string() })),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/game', strictStatusCodes: true }
);
