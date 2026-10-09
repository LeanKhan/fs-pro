import { randomUUID } from 'crypto';
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { calendars, clubs, fixtures, newsItems, places } from '../../db/drizzle/schema';
import { publish } from '../../realtime/world-events';

/**
 * Local news (docs/WORLD-PYRAMID-SPEC.md, "News scopes"). A story is posted
 * to the smallest place that holds every club in it (district, region,
 * country, or the world), then to each wider scope whose bar its importance
 * clears. The bar rises with how many active clubs a scope has, so a busy
 * country only hears its biggest stories and a quiet region hears its
 * districts' news: each reader gets a roughly steady flow wherever they are.
 *
 * Migration 0038 renamed the legacy `town` scope to `district` (the leaf
 * place). DECISIONS Q7 also wants a `city` scope; that is deferred because it
 * would need the client-facing WorldFeed contract and realtime topic scheme
 * (apps/fs-pro-client club-game.vue:804 subscribes town:/region:/country:) to
 * change with it. The wire keeps the legacy `town` name/topic for the
 * district so the merged client is untouched - see the B2-2C report.
 *
 * Every row is published to its scope's realtime topic (town:<districtId>,
 * region:<id>, country:<id>, world); clients join their own club's places
 * plus the world.
 */

const db = () => DrizzleDatabase.getInstance().database;

export type Scope = 'district' | 'region' | 'country' | 'world';
export const SCOPES: Scope[] = ['district', 'region', 'country', 'world'];

const BASE: Record<Scope, number> = { district: 0, region: 35, country: 60, world: 85 };
const TARGET: Record<Scope, number> = { district: 6, region: 48, country: 288, world: 2000 };
const K = 8;
/** "Active" = an owner request within this long (real time). */
const ACTIVE_MS = 7 * 24 * 60 * 60_000;
/** Below this many active clubs, a reader's local tab widens a level. */
const LOCAL_MIN: Partial<Record<Scope, number>> = { district: 3, region: 10 };

export interface Where {
  district: string | null;
  region: string | null;
  country: string | null;
}

// --- Active clubs per place, cached per game day ------------------------------

let activeCache: { key: string; at: number; counts: Map<string, number> } | null = null;

/** Active human clubs per district, region and country id (and 'world'). */
export async function activeCounts(): Promise<Map<string, number>> {
  const [cal] = await db().select({ day: calendars.CurrentDay }).from(calendars).limit(1);
  const key = String(cal?.day ?? 0);
  // Recount once per game day, and at least hourly in real time.
  if (activeCache && activeCache.key === key && Date.now() - activeCache.at < 60 * 60_000) return activeCache.counts;
  const rows = await db()
    .select({
      district: clubs.DistrictId,
      region: places.RegionId,
      country: clubs.AddressCountryId,
      n: sql<number>`count(*)::int`,
    })
    .from(clubs)
    .leftJoin(places, eq(places.id, clubs.DistrictId))
    .where(
      and(isNotNull(clubs.UserId), isNull(clubs.ReleasedAt), gt(clubs.LastActiveAt, new Date(Date.now() - ACTIVE_MS)))
    )
    .groupBy(clubs.DistrictId, places.RegionId, clubs.AddressCountryId);
  const counts = new Map<string, number>();
  const add = (id: string | null, n: number) => id && counts.set(id, (counts.get(id) ?? 0) + n);
  for (const r of rows) {
    add(r.district, r.n);
    add(r.region, r.n);
    add(r.country, r.n);
    add('world', r.n);
  }
  activeCache = { key, at: Date.now(), counts };
  return counts;
}

/** The importance a story needs to reach `scope` with `active` active clubs. */
export function bar(scope: Scope, active: number) {
  return BASE[scope] + K * Math.log2(Math.max(1, active / TARGET[scope]));
}

// --- Placing a story -------------------------------------------------------------

async function whereAre(clubIds: string[]): Promise<Where[]> {
  if (!clubIds.length) return [];
  return db()
    .select({ district: clubs.DistrictId, region: places.RegionId, country: clubs.AddressCountryId })
    .from(clubs)
    .leftJoin(places, eq(places.id, clubs.DistrictId))
    .where(inArray(clubs.id, clubIds));
}

/** The smallest scope holding every place in `wheres`, and the chain of
 * scope ids from there up to the world (smallest to widest). */
export function scopeChain(wheres: Where[]): { scope: Scope; id: string | null }[] {
  const same = (k: keyof Where) => wheres.length > 0 && wheres.every((w) => w[k] && w[k] === wheres[0]![k]);
  const first = wheres[0];
  const chain: { scope: Scope; id: string | null }[] = [];
  if (same('district')) chain.push({ scope: 'district', id: first!.district });
  if (same('region')) chain.push({ scope: 'region', id: first!.region });
  if (same('country')) chain.push({ scope: 'country', id: first!.country });
  chain.push({ scope: 'world', id: null });
  return chain;
}

/** The realtime topic for a scope. A `district` publishes on the legacy
 * `town:` prefix so the merged client's subscriptions (club-game.vue:804)
 * keep working; migration 0038 renamed the data but not the wire. */
const topicOf = (scope: Scope, id: string | null) =>
  scope === 'world' ? 'world' : `${scope === 'district' ? 'town' : scope}:${id}`;

export interface NewsInput {
  kind: string;
  importance: number;
  title: string;
  body?: string;
  clubIds: string[];
  fixtureId?: string | null;
  day?: number;
}

/** Post a story to its natural scope and every wider one it earns. Returns
 * the scopes it reached. */
export async function postNews(input: NewsInput): Promise<Scope[]> {
  if (input.importance <= 0) return [];
  const chain = scopeChain(await whereAre(input.clubIds));
  const counts = await activeCounts();
  const reached = chain.filter((c, i) => i === 0 || input.importance >= bar(c.scope, counts.get(c.id ?? 'world') ?? 0));
  if (!reached.length) return [];
  const day = input.day ?? (await db().select({ day: calendars.CurrentDay }).from(calendars).limit(1))[0]?.day ?? 0;
  const storyId = randomUUID();
  const rows = reached.map((c) => ({
    ScopeType: c.scope,
    ScopeId: c.id,
    StoryId: storyId,
    Kind: input.kind,
    Importance: Math.round(input.importance),
    Title: input.title,
    Body: input.body ?? '',
    ClubIds: input.clubIds,
    FixtureId: input.fixtureId ?? null,
    Day: day,
  }));
  const inserted = await db().insert(newsItems).values(rows).onConflictDoNothing().returning();
  for (const row of inserted) {
    publish(topicOf(row.ScopeType as Scope, row.ScopeId), 'news:item', toItem(row));
  }
  return reached.map((c) => c.scope);
}

// --- Results ----------------------------------------------------------------------

export interface ResultNews {
  fixtureId: string;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
}

/** How newsworthy a result is (docs/WORLD-PYRAMID-SPEC.md: ordinary 10,
 * derby +15, upset up to +30, rout +10). Friendlies make no news. */
export function resultImportance(r: {
  competitive: boolean;
  derby: boolean;
  winnerEloGap: number;
  margin: number;
}) {
  let score = r.competitive ? 10 : 5;
  if (r.derby) score += 15;
  if (r.winnerEloGap > 0) score += Math.min(30, Math.round(r.winnerEloGap / 10));
  if (r.margin >= 4) score += 10;
  return score;
}

/** News for one played match; called from the result seam (updateFixture). */
export async function postResultNews(r: ResultNews) {
  const [f] = await db()
    .select({ type: fixtures.Type, title: fixtures.Title, competition: fixtures.CompetitionId })
    .from(fixtures)
    .where(eq(fixtures.id, r.fixtureId));
  if (!f || f.type === 'friendly') return [];
  const rows = await db()
    .select({ id: clubs.id, name: clubs.Name, elo: clubs.Elo, district: clubs.DistrictId })
    .from(clubs)
    .where(inArray(clubs.id, [r.homeId, r.awayId]));
  const home = rows.find((c) => c.id === r.homeId);
  const away = rows.find((c) => c.id === r.awayId);
  if (!home || !away) return [];
  const margin = Math.abs(r.homeGoals - r.awayGoals);
  const winner = r.homeGoals > r.awayGoals ? home : r.awayGoals > r.homeGoals ? away : null;
  const loser = winner === home ? away : winner === away ? home : null;
  const gap = winner && loser ? loser.elo - winner.elo : 0;
  // A derby is two clubs in the same district (migration 0038: town -> district).
  const derby = !!home.district && home.district === away.district;
  const importance = resultImportance({ competitive: !!f.competition, derby, winnerEloGap: gap, margin });
  const upset = gap >= 150;
  const score = `${r.homeGoals}-${r.awayGoals}`;
  const title = !winner
    ? `${home.name} ${score} ${away.name}`
    : upset
      ? `Upset! ${winner.name} beat ${loser!.name}`
      : derby
        ? `Derby day: ${winner.name} win ${score}`
        : `${winner.name} beat ${loser!.name} ${winner === home ? score : `${r.awayGoals}-${r.homeGoals}`}`;
  return postNews({
    kind: upset ? 'upset' : derby ? 'derby' : 'result',
    importance,
    title,
    body: `${home.name} ${score} ${away.name}`,
    clubIds: [home.id, away.id],
    fixtureId: r.fixtureId,
  });
}

// --- Reading ------------------------------------------------------------------------

export interface NewsItemView {
  id: string;
  storyId: string;
  scope: Scope;
  scopeId: string | null;
  kind: string;
  importance: number;
  title: string;
  body: string;
  clubIds: string[];
  fixtureId: string | null;
  day: number;
  at: string;
}

function toItem(row: typeof newsItems.$inferSelect): NewsItemView {
  return {
    id: row.id,
    storyId: row.StoryId,
    scope: row.ScopeType as Scope,
    scopeId: row.ScopeId,
    kind: row.Kind,
    importance: row.Importance,
    title: row.Title,
    body: row.Body,
    clubIds: row.ClubIds,
    fixtureId: row.FixtureId,
    day: row.Day,
    at: row.createdAt.toISOString(),
  };
}

export interface ViewerScopes {
  where: Where;
  /** The scope the reader's "local" tab shows (widened when too quiet). */
  local: Scope;
  localId: string | null;
  localName: string | null;
}

/** A club's places, and which of them is "local" for its reader. */
export async function viewerScopes(clubId: string | null | undefined): Promise<ViewerScopes> {
  const none: ViewerScopes = { where: { district: null, region: null, country: null }, local: 'world', localId: null, localName: null };
  if (!clubId) return none;
  const [w] = await whereAre([clubId]);
  if (!w) return none;
  const counts = await activeCounts();
  let local: Scope = 'world';
  for (const scope of ['district', 'region', 'country'] as const) {
    const id = w[scope];
    if (!id) continue;
    const min = LOCAL_MIN[scope];
    if (min == null || (counts.get(id) ?? 0) >= min) {
      local = scope;
      break;
    }
  }
  const localId = local === 'world' ? null : w[local];
  const [place] = localId ? await db().select({ name: places.Name }).from(places).where(eq(places.id, localId)) : [];
  return { where: w, local, localId, localName: place?.name ?? null };
}

/** The reader's feed: their town, region, country and world stories, newest
 * first, one row per story. */
export async function readFeed(clubId: string | null | undefined, opts: { limit?: number; before?: Date } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const scopes = await viewerScopes(clubId);
  const w = scopes.where;
  const conds = [and(eq(newsItems.ScopeType, 'world'), isNull(newsItems.ScopeId))];
  if (w.district) conds.push(and(eq(newsItems.ScopeType, 'district'), eq(newsItems.ScopeId, w.district)));
  if (w.region) conds.push(and(eq(newsItems.ScopeType, 'region'), eq(newsItems.ScopeId, w.region)));
  if (w.country) conds.push(and(eq(newsItems.ScopeType, 'country'), eq(newsItems.ScopeId, w.country)));
  const rows = await db()
    .select()
    .from(newsItems)
    .where(and(or(...conds), opts.before ? lt(newsItems.createdAt, opts.before) : undefined))
    .orderBy(desc(newsItems.createdAt))
    .limit(limit * 3);
  // A story posted to several of the reader's scopes shows once, at its
  // narrowest (most local) one.
  const seen = new Set<string>();
  const out: NewsItemView[] = [];
  for (const row of rows) {
    if (seen.has(row.StoryId)) continue;
    seen.add(row.StoryId);
    out.push(toItem(row));
    if (out.length >= limit) break;
  }
  return { scopes, items: out };
}
