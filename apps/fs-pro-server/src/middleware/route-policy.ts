import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { apiContract } from '@repo/api-contract';
import { DrizzleDatabase } from '../db/drizzle';
import { clubs, fixtures, players, users } from '../db/drizzle/schema';
import log from '../helpers/logger';

/**
 * Who may call which API route, in one table. Runs in front of every
 * ts-rest route (routers/index.ts), so a route can't ship unguarded by
 * accident: a GET with no rule is public, anything else with no rule is
 * admin-only, and the server logs every such route at startup.
 *
 * Rules:
 *  - 'public'     anyone
 *  - 'signedIn'   any signed-in user
 *  - 'admin'      admins only
 *  - 'handler'    the handler checks access itself (facilities, play,
 *                 open play, world settings, competition definitions, atlas)
 *  - self         the :param user id is the caller (or an admin)
 *  - club         the caller owns that club (or is an admin); `fields`
 *                 limits what a non-admin may write
 *  - player       the caller owns the player's club; `fields` as above
 *  - fixture      the caller owns a club in the fixture; `adminQuery` names
 *                 query flags only admins may set
 */

type Rule =
  | 'public'
  | 'signedIn'
  | 'admin'
  | 'handler'
  | { self: string; fields?: string[] }
  | { club: (req: Request) => unknown; fields?: string[] }
  | { player: string; fields?: string[] }
  | { fixture: string; adminQuery?: string[] };

const param = (name: string) => (req: Request) => req.params?.[name];
const bodyField = (name: string) => (req: Request) => (req.body as Record<string, unknown> | undefined)?.[name];
const queryField = (name: string) => (req: Request) => req.query?.[name];

export const POLICIES: Record<string, Rule> = {
  // Clubs: owners set their team sheet; everything else is admin work.
  'clubs.updateClub': { club: param('id'), fields: ['Lineup', 'Tactic'] },
  'clubs.suggestLineup': { club: param('id') },
  'clubs.recruitYouthPlayers': { club: param('id') },
  'clubs.createClub': 'admin',
  'clubs.deleteClub': 'admin',
  'clubs.addPlayerToClub': 'admin',
  'clubs.addManyPlayersToClub': 'admin',
  'clubs.refreshAllClubsRatings': 'admin',
  'clubs.hireManager': 'admin',
  'clubs.fireManager': 'admin',
  'clubs.removePlayerFromClub': 'admin',

  'players.updatePlayer': { player: 'id', fields: ['TrainingFocus'] },
  'players.generatePlayers': 'admin',

  // Users: you manage your own account; ownership changes go through the
  // atlas (found a club) or the admin.
  'users.joinUser': 'public',
  'users.loginUser': 'public',
  'users.enterSession': 'public',
  'users.changePassword': 'signedIn',
  'users.logoutUser': { self: 'id' },
  'users.updateUser': { self: 'id', fields: ['FullName', 'Avatar', 'Age', 'Alerts'] },
  'users.addClubsToUser': 'admin',
  'users.addClubToUser': 'admin',
  'users.removeClubFromUser': { self: 'id' },

  'game.kickoffNew': { fixture: 'fixture', adminQuery: ['simulate_rest'] },
  'game.enqueueMatch': 'admin',
  'game.createFriendly': { club: bodyField('homeClubId') },

  'transfers.purchasePlayer': { club: bodyField('buyingClubId') },
  'transfers.placeBid': { club: bodyField('biddingClubId') },
  'transfers.respondToOffer': { club: bodyField('clubId') },
  'transfers.listPlayerForSale': { club: bodyField('clubId') },
  'transfers.scoutPlayerTransfer': { club: bodyField('clubId') },
  'transfers.requestBudgetIncrease': { club: bodyField('clubId') },
  'transfers.getOffers': { club: queryField('clubId') },
  'transfers.setTransferWindow': 'admin',

  'facilities.startUpgrade': 'handler',
  'facilities.savePlacement': 'handler',
  'facilities.squadRecovery': 'handler',
  'facilities.treatPlayer': 'handler',
  'play.playMatch': 'handler',
  'play.markInboxRead': 'handler',
  'play.getInbox': 'handler',
  'editions.create': 'handler',
  'editions.action': 'handler',
  'editions.invite': 'handler',
  'editions.register': 'handler',
  'editions.withdraw': 'handler',
  'editions.setEntryPolicy': 'handler',
  'challenges.propose': 'handler',
  'challenges.respond': 'handler',
  'challenges.setPolicy': 'handler',
  'world.updateSettings': 'handler',
  'world.endYear': 'handler',
  'world.advanceDay': 'handler',
  'competitionDefinitions.validate': 'handler',
  'competitionDefinitions.create': 'handler',
  'competitionDefinitions.update': 'handler',
  'competitionDefinitions.archive': 'handler',
  'atlas.foundCountry': 'signedIn',
  'atlas.foundTown': 'signedIn',
  'atlas.foundClub': 'signedIn',

  'fixtures.deleteFixture': 'admin',
  'players.createPlayer': 'admin',
  'players.deletePlayer': 'admin',
  'managers.createManager': 'admin',
  'managers.updateManager': 'admin',
  'managers.deleteManager': 'admin',
  'calendar.deleteDay': 'admin',
  'calendar.setClock': 'admin',
  'calendar.tickClock': 'admin',
  'calendar.healCalendar': 'admin',
  'calendar.simulateToDate': 'admin',
  'places.importFromWorld': 'admin',
  'places.syncFromWorld': 'admin',
  'places.resolveAnchor': 'admin',
  'places.updatePlace': 'admin',
  'seasons.deleteSeason': 'admin',
};

interface CompiledRoute {
  key: string;
  method: string;
  re: RegExp;
  params: string[];
  specificity: number;
}

function compile(): CompiledRoute[] {
  const out: CompiledRoute[] = [];
  const walk = (node: Record<string, unknown>, prefix: string) => {
    for (const [name, value] of Object.entries(node)) {
      const route = value as { method?: string; path?: string };
      if (route && typeof route.method === 'string' && typeof route.path === 'string') {
        const parts = route.path.replace(/\/+$/, '').split('/').filter(Boolean);
        const params: string[] = [];
        const re = parts
          .map((p) => {
            if (p.startsWith(':')) {
              params.push(p.slice(1));
              return '([^/]+)';
            }
            return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          })
          .join('/');
        out.push({
          key: `${prefix}${name}`,
          method: route.method.toUpperCase(),
          re: new RegExp(`^/${re}/?$`),
          params,
          specificity: parts.length * 10 - params.length,
        });
      } else if (value && typeof value === 'object') {
        walk(value as Record<string, unknown>, `${prefix}${name}.`);
      }
    }
  };
  walk(apiContract as unknown as Record<string, unknown>, '');
  // Static segments win over params ("/clubs/refresh-ratings" before "/clubs/:id").
  return out.sort((a, b) => b.specificity - a.specificity);
}

const ROUTES = compile();

/** Routes with no explicit rule (mutations default to admin-only). */
export function unlistedMutations() {
  return ROUTES.filter((r) => r.method !== 'GET' && !(r.key in POLICIES)).map((r) => `${r.method} ${r.key}`);
}

export function matchRoute(method: string, path: string) {
  const clean = path.split('?')[0]!.replace(/\/+$/, '') || '/';
  for (const r of ROUTES) {
    if (r.method !== method) continue;
    const m = r.re.exec(clean);
    if (m) return { route: r, params: Object.fromEntries(r.params.map((p, i) => [p, decodeURIComponent(m[i + 1]!)])) };
  }
  return null;
}

const db = () => DrizzleDatabase.getInstance().database;

function deny(res: Response, status: 401 | 403 | 404, message: string) {
  res.status(status).json({ success: false, message });
}

async function ownsClub(userId: string, clubId: unknown) {
  if (typeof clubId !== 'string' || !clubId) return 'missing' as const;
  const [club] = await db().select({ owner: clubs.UserId }).from(clubs).where(eq(clubs.id, clubId));
  if (!club) return 'missing' as const;
  return club.owner === userId ? ('yes' as const) : ('no' as const);
}

function keepFields(req: Request, fields: string[] | undefined) {
  if (!fields || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return;
  for (const k of Object.keys(req.body)) if (!fields.includes(k)) delete (req.body as Record<string, unknown>)[k];
}

export async function routePolicy(req: Request, res: Response, next: NextFunction) {
  const hit = matchRoute(req.method, req.path);
  if (!hit) return next();
  const rule: Rule = POLICIES[hit.route.key] ?? (hit.route.method === 'GET' ? 'public' : 'admin');
  if (rule === 'public' || rule === 'handler') return next();

  try {
    const userId = (req.session as { userID?: string } | undefined)?.userID;
    if (!userId) return deny(res, 401, 'Not logged in');
    if (rule === 'signedIn') return next();

    const [user] = await db().select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId));
    if (!user) return deny(res, 401, 'Not logged in');
    if (user.isAdmin) return next();
    if (rule === 'admin') return deny(res, 403, 'Admins only');

    // Express hasn't routed yet, so params come from our own match.
    const params = hit.params;
    if ('self' in rule) {
      if (params[rule.self] !== userId) return deny(res, 403, 'That is not your account');
      keepFields(req, rule.fields);
      return next();
    }
    if ('club' in rule) {
      const clubId = rule.club({ ...req, params } as unknown as Request);
      const owns = await ownsClub(userId, clubId);
      if (owns === 'missing') return deny(res, 404, 'Club not found');
      if (owns === 'no') return deny(res, 403, 'You do not manage this club');
      keepFields(req, rule.fields);
      return next();
    }
    if ('player' in rule) {
      const [player] = await db().select({ club: players.ClubId }).from(players).where(eq(players.id, params[rule.player] ?? ''));
      if (!player) return deny(res, 404, 'Player not found');
      if ((await ownsClub(userId, player.club)) !== 'yes') return deny(res, 403, 'That player is not at your club');
      keepFields(req, rule.fields);
      return next();
    }
    if ('fixture' in rule) {
      for (const flag of rule.adminQuery ?? []) {
        const v = req.query?.[flag];
        if (v !== undefined && v !== 'false' && v !== '0') return deny(res, 403, `${flag} is for admins only`);
      }
      const [fx] = await db()
        .select({ home: fixtures.HomeTeamId, away: fixtures.AwayTeamId })
        .from(fixtures)
        .where(eq(fixtures.id, params[rule.fixture] ?? ''));
      if (!fx) return deny(res, 404, 'Fixture not found');
      const mine = await Promise.all([fx.home, fx.away].map((id) => ownsClub(userId, id)));
      if (!mine.includes('yes')) return deny(res, 403, 'You are not playing in this match');
      return next();
    }
    return deny(res, 403, 'Not allowed');
  } catch (err) {
    log(`[route-policy] ${hit.route.key}: ${err instanceof Error ? err.message : String(err)}`);
    return deny(res, 403, 'Not allowed');
  }
}

const missing = unlistedMutations();
if (missing.length) {
  console.warn(`[route-policy] ${missing.length} mutation(s) have no rule and are admin-only: ${missing.join(', ')}`);
}
