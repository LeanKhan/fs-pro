// packages/api-contract/src/routes/atlas.ts

import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { successEnvelope, failEnvelope } from '../schemas/envelope';
import {
  AtlasChromeSchema,
  AtlasCountrySchema,
  AtlasSchema,
  AtlasSearchResultSchema,
  AtlasTownSchema,
  FoundClubSchema,
  FoundCountrySchema,
  FoundedClubSchema,
  FoundTownSchema,
  NameCheckSchema,
  PlacementSchema,
  TownInviteSchema,
} from '../schemas/atlas';

const c = initContract();

const writeErrors = {
  400: failEnvelope(),
  401: failEnvelope(),
  403: failEnvelope(),
  404: failEnvelope(),
  409: failEnvelope(),
};

/** The world atlas, and founding clubs in it (docs/WORLD-PYRAMID-SPEC.md).
 * Placement decides where a new club goes; its founder names any new town,
 * region or country it opens. Founding countries and towns directly is for
 * admins only. */
export const atlasContract = c.router(
  {
    /** Countries, regions and towns with club counts. Club lists come for
     * every town in a small world, else only for countryId's towns. */
    getAtlas: {
      method: 'GET',
      path: '',
      query: z.object({ countryId: z.string().optional() }),
      responses: { 200: successEnvelope(AtlasSchema), 400: failEnvelope() },
    },

    /** The map chrome a tile does not carry: country headers (spot + flag
     * colours) and the signed-in user's founding summary. Small and stable. */
    getChrome: {
      method: 'GET',
      path: '/chrome',
      responses: { 200: successEnvelope(AtlasChromeSchema), 400: failEnvelope() },
    },

    /** Find a place or club by name/code for the map's search box. */
    search: {
      method: 'GET',
      path: '/search',
      query: z.object({ q: z.string() }),
      responses: { 200: successEnvelope(z.array(AtlasSearchResultSchema)), 400: failEnvelope() },
    },

    /** Where a new club would go now (with an invite, if given). */
    getPlacement: {
      method: 'GET',
      path: '/placement',
      query: z.object({ invite: z.string().optional() }),
      responses: { 200: successEnvelope(PlacementSchema), 400: failEnvelope(), 401: failEnvelope() },
    },

    /** A club's live invite links to its town. */
    listInvites: {
      method: 'GET',
      path: '/invites',
      query: z.object({ clubId: z.string() }),
      responses: { 200: successEnvelope(z.array(TownInviteSchema)), ...writeErrors },
    },

    /** A new invite link for the club's town. */
    createInvite: {
      method: 'POST',
      path: '/invites',
      body: z.object({ clubId: z.string() }),
      responses: { 200: successEnvelope(TownInviteSchema), ...writeErrors },
    },

    /** Live validation for the founding forms: is this name/code free? */
    checkName: {
      method: 'GET',
      path: '/check',
      query: z.object({
        kind: z.enum(['country', 'region', 'town', 'club']),
        name: z.string(),
        code: z.string().optional(),
        countryId: z.string().optional(),
      }),
      responses: { 200: successEnvelope(NameCheckSchema), 400: failEnvelope() },
    },

    foundCountry: {
      method: 'POST',
      path: '/countries',
      body: FoundCountrySchema,
      responses: { 200: successEnvelope(AtlasCountrySchema), ...writeErrors },
    },

    foundTown: {
      method: 'POST',
      path: '/towns',
      body: FoundTownSchema,
      responses: { 200: successEnvelope(AtlasTownSchema), ...writeErrors },
    },

    /** Found a club where placement puts it: Level 0, a raw starting squad,
     * a small budget and the user as its owner. Answers 409 when new places
     * need names the body didn't send (fetch getPlacement again). */
    foundClub: {
      method: 'POST',
      path: '/clubs',
      body: FoundClubSchema,
      responses: { 200: successEnvelope(FoundedClubSchema), ...writeErrors },
    },
  },
  { pathPrefix: '/atlas' }
);
