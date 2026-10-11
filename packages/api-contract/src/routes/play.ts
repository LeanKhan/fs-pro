// packages/api-contract/src/routes/play.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import {
  BoardVaultClaimSchema,
  DefenseLogSchema,
  InboxSchema,
  MatchResultSchema,
  OpponentSchema,
  PlayStateSchema,
  ShopCollectSchema,
} from '../schemas/play';
import {
  MatchPlanSchema,
  MatchPrepSchema,
  MatchdayFixtureSchema,
  MatchdaySchema,
  PlanPreviewSchema,
} from '../schemas/match-plan';
import { ScoutOpponentReportSchema } from '../schemas/scout-screen';
import { OrderSchema } from '../schemas/ability';
import { PitchGridDocumentSchema } from '../schemas/layout';

const c = initContract();

/** One resolved trait/ability effect (sim-core `RawEffect`, 07 §1a). */
const EffectSchema = z.object({
  kind: z.string(),
  params: z.record(z.number()).optional(),
});

export const playContract = c.router(
  {
    /** The club's play screen: level/XP, match cooldown, the active challenge
     * (issued on demand) and the last few matchmade results. */
    getPlayState: {
      method: 'GET',
      path: '/:clubId',
      pathParams: z.object({ clubId: z.string() }),
      responses: {
        200: successEnvelope(PlayStateSchema),
        404: failEnvelope(),
      },
    },

    /** Matchmaking preview: 1 + Scouting-level opponent options of similar
     * power, the first being the recommended one. Nothing is played or reserved. */
    findOpponents: {
      method: 'GET',
      path: '/:clubId/opponents',
      pathParams: z.object({ clubId: z.string() }),
      responses: {
        200: successEnvelope(z.array(OpponentSchema)),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Press PLAY: matchmake an opponent of similar power, resolve the async
     * raid (0-3★, loot, Standing, shield) and pay out rewards. Owner only;
     * refused during the post-match cooldown. The body may carry Manager
     * Orders, a one-match layout override and `practice` (a no-stakes friendly
     * that suppresses every persistent side-effect, 02 §D2). */
    playMatch: {
      method: 'POST',
      path: '/:clubId/match',
      pathParams: z.object({ clubId: z.string() }),
      /** Optional: fight a specific opponent from the matchmaking preview.
       * `watch`: record the replay so the Matchzone can play it (otherwise
       * the match is played headless - straight to the result). `orders`:
       * Manager Orders for this raid. `layout`: a one-match grid override.
       * `effects`: resolved trait/ability deltas keyed by player id. */
      body: z
        .object({
          opponentId: z.string().optional(),
          watch: z.boolean().optional(),
          practice: z.boolean().optional(),
          orders: z.array(OrderSchema).optional(),
          layout: PitchGridDocumentSchema.optional(),
          effects: z.record(z.array(EffectSchema)).optional(),
        })
        .optional(),
      responses: {
        200: successEnvelope(MatchResultSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        // The owner-program PLAY gate (services/program/squad-gate.ts):
        // "Sign a manager before your first match...". Declared so the client
        // decodes the message instead of treating the refusal as a transport
        // error (U-06 / P02-19).
        409: failEnvelope(),
      },
    },

    /** The club's inbox: how fans, the board and the dressing room reacted
     * to results. Owner (or admin) only. */
    getInbox: {
      method: 'GET',
      path: '/:clubId/inbox',
      pathParams: z.object({ clubId: z.string() }),
      responses: {
        200: successEnvelope(InboxSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Bank the club shop's takings (docs/CORE-LOOP.md). Owner only. */
    collectShop: {
      method: 'POST',
      path: '/:clubId/shop/collect',
      pathParams: z.object({ clubId: z.string() }),
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(ShopCollectSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** The club's matches: upcoming (with plan status and countdown) and
     * recent (with scores and replays). Owner only. */
    getMatchday: {
      method: 'GET',
      path: '/:clubId/matchday',
      pathParams: z.object({ clubId: z.string() }),
      responses: {
        200: successEnvelope(MatchdaySchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Book a match with a club from the matchmaking preview: it kicks off
     * on a later game day, giving both sides time to prepare. Owner only. */
    bookMatch: {
      method: 'POST',
      path: '/:clubId/book',
      pathParams: z.object({ clubId: z.string() }),
      body: z.object({ opponentId: z.string() }),
      responses: {
        200: successEnvelope(MatchdayFixtureSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Match prep for one of the club's fixtures: the plan (saved, or the
     * club's defaults), the squad, the scouting report. Owner only. */
    getMatchPrep: {
      method: 'GET',
      path: '/:clubId/fixtures/:fixtureId/prep',
      pathParams: z.object({ clubId: z.string(), fixtureId: z.string() }),
      responses: {
        200: successEnvelope(MatchPrepSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Save the plan for a fixture (refused once it has kicked off). */
    saveMatchPlan: {
      method: 'PUT',
      path: '/:clubId/fixtures/:fixtureId/plan',
      pathParams: z.object({ clubId: z.string(), fixtureId: z.string() }),
      body: z.object({
        plan: MatchPlanSchema,
        asDefault: z.boolean().optional(),
      }),
      responses: {
        200: successEnvelope(MatchPrepSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Win chance for a plan: the engine plays it a few dozen times
     * against the opponent's plan. Nothing is saved. */
    previewMatchPlan: {
      method: 'POST',
      path: '/:clubId/fixtures/:fixtureId/preview',
      pathParams: z.object({ clubId: z.string(), fixtureId: z.string() }),
      body: z.object({ plan: MatchPlanSchema }),
      responses: {
        200: successEnvelope(PlanPreviewSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Mark every inbox message read. */
    markInboxRead: {
      method: 'POST',
      path: '/:clubId/inbox/read',
      pathParams: z.object({ clubId: z.string() }),
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(InboxSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Scout an opponent (docs/coc-mapping/03 §1.7): their Home Grid plus a
     * coarse threat read, masked by the caller's Scouting facility. Owner only;
     * never returns the opponent's player names or ratings. */
    scoutOpponent: {
      method: 'POST',
      path: '/:clubId/scout/:oppId',
      pathParams: z.object({ clubId: z.string(), oppId: z.string() }),
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(ScoutOpponentReportSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Claim the club's protected Board Vault into Cash (04 §5.2). Owner only;
     * an empty vault is a 409 so the client can hide the button. */
    claimBoardVault: {
      method: 'POST',
      path: '/:clubId/board-vault/claim',
      pathParams: z.object({ clubId: z.string() }),
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(BoardVaultClaimSchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },

    /** The defender's recent raid results (the defense inbox, 02 §E). Owner only. */
    defenseLog: {
      method: 'GET',
      path: '/:clubId/defenses',
      pathParams: z.object({ clubId: z.string() }),
      responses: {
        200: successEnvelope(DefenseLogSchema),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/play', strictStatusCodes: true }
);
