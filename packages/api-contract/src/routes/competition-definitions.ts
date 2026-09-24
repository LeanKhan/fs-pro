// packages/api-contract/src/routes/competition-definitions.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import {
  EntryConditionsSchema,
  OutcomeSchema,
  RecurrenceSchema,
  RewardsSchema,
  StageDefinitionSchema,
  WinConditionSchema,
} from '../schemas/competition-definition';

const c = initContract();

/** What the admin sends: anything with a default may be left out. */
export const CompetitionDefinitionInputSchema = z.object({
  Name: z.string().min(1),
  Description: z.string().optional(),
  Type: z.string().optional(),
  Prestige: z.number().int().min(1).max(5).optional(),
  Entry: EntryConditionsSchema.partial().optional(),
  Stages: z.array(StageDefinitionSchema).min(1),
  WinCondition: WinConditionSchema.optional(),
  Rewards: RewardsSchema.partial().optional(),
  Outcomes: z.array(OutcomeSchema).optional(),
  Recurrence: RecurrenceSchema.nullable().optional(),
});

export const CompetitionSummarySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  type: z.string(),
  description: z.string().nullable(),
  prestige: z.number(),
  archived: z.boolean(),
  definition: z.unknown().nullable(),
  latestEdition: z
    .object({ id: z.string(), code: z.string(), status: z.string(), editionNumber: z.number().nullable() })
    .nullable(),
});

const errors = z.array(z.object({ path: z.string(), message: z.string() }));

/** Admin: open-play competition definitions (docs/OPEN-PLAY-COMPETITIONS-SPEC.md). */
export const competitionDefinitionsContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/',
      query: z.object({ includeArchived: z.coerce.boolean().optional() }),
      responses: { 200: successEnvelope(z.array(CompetitionSummarySchema)), 400: failEnvelope() },
    },
    get: {
      method: 'GET',
      path: '/:id',
      pathParams: z.object({ id: z.string() }),
      responses: { 200: successEnvelope(CompetitionSummarySchema), 400: failEnvelope(), 404: failEnvelope() },
    },
    /** Fill defaults and check a definition without saving it. */
    validate: {
      method: 'POST',
      path: '/validate',
      body: CompetitionDefinitionInputSchema,
      responses: {
        200: successEnvelope(z.object({ ok: z.boolean(), definition: z.unknown().nullable(), errors })),
        400: failEnvelope(),
      },
    },
    create: {
      method: 'POST',
      path: '/',
      body: CompetitionDefinitionInputSchema.extend({ Code: z.string().min(2).max(12) }),
      responses: {
        201: successEnvelope(CompetitionSummarySchema),
        400: failEnvelope(errors.optional()),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
        409: failEnvelope(),
      },
    },
    update: {
      method: 'PUT',
      path: '/:id',
      pathParams: z.object({ id: z.string() }),
      body: CompetitionDefinitionInputSchema,
      responses: {
        200: successEnvelope(CompetitionSummarySchema),
        400: failEnvelope(errors.optional()),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },
    archive: {
      method: 'POST',
      path: '/:id/archive',
      pathParams: z.object({ id: z.string() }),
      body: z.object({ archived: z.boolean() }),
      responses: {
        200: successEnvelope(CompetitionSummarySchema),
        400: failEnvelope(),
        401: failEnvelope(),
        403: failEnvelope(),
        404: failEnvelope(),
      },
    },
  },
  { pathPrefix: '/competition-definitions', strictStatusCodes: true }
);
