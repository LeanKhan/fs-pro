import { Router } from 'express';
import { initServer } from '@ts-rest/express';
import { eq, sql } from 'drizzle-orm';
import { apiContract as contract, isCrestDesign, renderCrestSvg, renderKitSvg } from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs } from '../../db/drizzle/schema';
import { FoundingError, checkName, foundCountry, foundTown, getAtlas } from '../../services/world/atlas.service';
import { foundClub } from '../../services/world/club-founding.service';
import { publishWorldEvent } from '../../realtime/world-events';

const s = initServer();

type Session = { userID?: string } | undefined;

function failure(err: unknown) {
  if (err instanceof FoundingError) {
    const status = err.status === 403 && /logged in/i.test(err.message) ? 401 : err.status;
    return { status, body: { success: false as const, message: err.message } } as const;
  }
  const message = err instanceof Error ? err.message : String(err);
  return { status: 400 as const, body: { success: false as const, message } };
}

export const atlasTsRestRoutes = s.router(contract.atlas, {
  getAtlas: async ({ req }) => {
    try {
      const atlas = await getAtlas((req.session as Session)?.userID ?? null);
      return { status: 200, body: { success: true, message: 'Atlas', payload: atlas } };
    } catch (err) {
      return failure(err) as any;
    }
  },

  checkName: async ({ query }) => {
    try {
      return { status: 200, body: { success: true, message: 'Checked', payload: await checkName(query) } };
    } catch (err) {
      return failure(err) as any;
    }
  },

  foundCountry: async ({ body, req }) => {
    try {
      const country = await foundCountry((req.session as Session)?.userID, body);
      publishWorldEvent('world:founded', { kind: 'country', id: country.id, name: country.name });
      return { status: 200, body: { success: true, message: `${country.name} is founded`, payload: country } };
    } catch (err) {
      return failure(err) as any;
    }
  },

  foundTown: async ({ body, req }) => {
    try {
      const town = await foundTown((req.session as Session)?.userID, body);
      publishWorldEvent('world:founded', { kind: 'town', id: town.id, name: town.name });
      return { status: 200, body: { success: true, message: `${town.name} is founded`, payload: town } };
    } catch (err) {
      return failure(err) as any;
    }
  },

  foundClub: async ({ body, req }) => {
    try {
      const founded = await foundClub((req.session as Session)?.userID, body);
      publishWorldEvent('world:founded', { kind: 'club', id: founded.clubId, name: body.name });
      return { status: 200, body: { success: true, message: 'Club founded', payload: founded } };
    } catch (err) {
      return failure(err) as any;
    }
  },
});

/** GET /api/crests/:code.svg - the crest of a club founded in the game. The
 * original clubs' crests are static files on the client (/club-icons). */
export const crestRouter = Router();

crestRouter.get('/:file', async (req, res) => {
  const code = req.params.file.replace(/\.svg$/i, '').toUpperCase();
  if (!/^[A-Z0-9]{1,8}$/.test(code)) return res.status(400).end();
  const [club] = await DrizzleDatabase.getInstance()
    .database.select({ crest: clubs.Crest, name: clubs.Name })
    .from(clubs)
    .where(eq(sql`upper(${clubs.ClubCode})`, code))
    .limit(1);
  if (!club || !isCrestDesign(club.crest)) return res.status(404).end();
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.send(renderCrestSvg(club.crest, { id: code.toLowerCase() }));
});

/** GET /api/kits/:code.svg - a founded club's shirt drawn from its crest; the
 * original clubs' kits are image files, so those redirect there. */
export const kitRouter = Router();

kitRouter.get('/:file', async (req, res) => {
  const code = req.params.file.replace(/\.svg$/i, '').toUpperCase();
  if (!/^[A-Z0-9]{1,8}$/.test(code)) return res.status(400).end();
  const [club] = await DrizzleDatabase.getInstance()
    .database.select({ crest: clubs.Crest, code: clubs.ClubCode })
    .from(clubs)
    .where(eq(sql`upper(${clubs.ClubCode})`, code))
    .limit(1);
  if (!club) return res.status(404).end();
  if (!isCrestDesign(club.crest)) return res.redirect(302, `/img/clubs/kits/${encodeURIComponent(club.code)}-kit.png`);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.send(renderKitSvg(club.crest, { id: code.toLowerCase() }));
});
