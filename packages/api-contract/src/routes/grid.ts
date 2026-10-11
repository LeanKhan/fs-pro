// packages/api-contract/src/routes/grid.ts
//
// The Pitch Grid routes (docs/coc-mapping/05 §3, 03 §1.7-1.9): a club's stored
// layout slots (home defends offline, match is the attacking default, derby is
// the Association Derby shape), the server-authoritative validation, and the
// publish/import share-code loop. The grid document shape is the shared
// PitchGrid in grid.ts; validity is mirrored so the client preview and the
// server never disagree.
//
// These paths carry no pathPrefix: the club-scoped routes hang off /clubs and
// the share-code import hangs off /layouts, so each path is written in full
// relative to the /api mount.

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import {
  LayoutSlotSchema,
  LayoutsSchema,
  PitchGridDocumentSchema,
} from '../schemas/layout';

const clubParam = z.object({ id: z.string() });
const clubSlotParam = z.object({ id: z.string(), slot: LayoutSlotSchema });

const c = initContract();

export const gridContract = c.router(
  {
    /** Every stored slot (home/match/derby) for a club, plus the Clubhouse tier
     * that gates the columns each slot may use. */
    getLayouts: {
      method: 'GET',
      path: '/clubs/:id/layouts',
      pathParams: clubParam,
      responses: {
        200: successEnvelope(z.object({ layouts: LayoutsSchema, tier: z.number() })),
        404: failEnvelope(),
      },
    },

    /** One stored slot. 404 when the slot holds no layout yet. */
    getLayout: {
      method: 'GET',
      path: '/clubs/:id/layouts/:slot',
      pathParams: clubSlotParam,
      responses: {
        200: successEnvelope(
          z.object({ slot: LayoutSlotSchema, grid: PitchGridDocumentSchema, tier: z.number() })
        ),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Save a slot. Server-authoritative: the grid is validated against the
     * club's Clubhouse tier before it persists. Owner-only. */
    putLayout: {
      method: 'PUT',
      path: '/clubs/:id/layouts/:slot',
      pathParams: clubSlotParam,
      body: z.object({ grid: PitchGridDocumentSchema }),
      responses: {
        200: successEnvelope(
          z.object({ slot: LayoutSlotSchema, grid: PitchGridDocumentSchema, tier: z.number() })
        ),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Authoritative verdict plus the advisory preview (auras, links,
     * directness, synergies) without persisting anything. */
    validateLayout: {
      method: 'POST',
      path: '/clubs/:id/layouts/validate',
      pathParams: clubParam,
      body: z.object({ grid: PitchGridDocumentSchema }),
      responses: {
        200: successEnvelope(
          z.object({
            valid: z.boolean(),
            reason: z.string().nullable(),
            tier: z.number(),
            preview: z.unknown(),
          })
        ),
        400: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Publish a slot as a share code anyone can import. */
    publishLayout: {
      method: 'POST',
      path: '/clubs/:id/layouts/:slot/publish',
      pathParams: clubSlotParam,
      body: z.object({}).optional(),
      responses: {
        200: successEnvelope(
          z.object({ code: z.string(), slot: LayoutSlotSchema, clubId: z.string() })
        ),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },

    /** Clone a published layout into one of the caller's slots. When clubId is
     * omitted the server resolves the caller's own club. */
    importLayout: {
      method: 'POST',
      path: '/layouts/import',
      body: z.object({
        code: z.string(),
        clubId: z.string().optional(),
        slot: LayoutSlotSchema,
      }),
      responses: {
        200: successEnvelope(
          z.object({ slot: LayoutSlotSchema, grid: PitchGridDocumentSchema, tier: z.number() })
        ),
        400: failEnvelope(),
        401: failEnvelope(),
        404: failEnvelope(),
      },
    },
  },
  { strictStatusCodes: true }
);
