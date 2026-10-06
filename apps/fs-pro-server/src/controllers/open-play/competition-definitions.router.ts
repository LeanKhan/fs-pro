import { initServer } from '@ts-rest/express';
import { desc, eq, inArray } from 'drizzle-orm';
import { apiContract as contract } from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import { competitions, seasons } from '../../db/drizzle/schema';
import { buildDefinition, type CompetitionDefinitionInput } from '../../services/competitions/definition';
import { accessDenied, isAdmin } from '../auth/club-access';

/**
 * Admin CRUD for open-play competition definitions
 * (docs/OPEN-PLAY-COMPETITIONS-SPEC.md, "Competition definition"). Every
 * write fills defaults and validates; editing never changes a published
 * edition (editions keep their own snapshot).
 */

const s = initServer();
const db = () => DrizzleDatabase.getInstance().database;
type Session = { userID?: string } | undefined;
type Row = typeof competitions.$inferSelect;

async function summaries(rows: Row[]) {
  const ids = rows.map((r) => r.id);
  const editions = ids.length
    ? await db()
        .select({
          id: seasons.id,
          code: seasons.SeasonCode,
          status: seasons.Status,
          editionNumber: seasons.EditionNumber,
          competitionId: seasons.CompetitionId,
        })
        .from(seasons)
        .where(inArray(seasons.CompetitionId, ids))
        .orderBy(desc(seasons.EditionNumber))
    : [];
  return rows.map((r) => {
    const latest = editions.find((e) => e.competitionId === r.id);
    return {
      id: r.id,
      code: r.CompetitionCode,
      name: r.Name,
      type: r.Type,
      description: r.Description,
      prestige: r.Prestige,
      archived: r.Archived,
      definition: r.Stages
        ? {
            Name: r.Name,
            Description: r.Description ?? undefined,
            Prestige: r.Prestige,
            Entry: r.Entry,
            Stages: r.Stages,
            WinCondition: r.WinCondition,
            Rewards: r.Rewards,
            Outcomes: r.Outcomes ?? undefined,
            Recurrence: r.Recurrence ?? null,
          }
        : null,
      latestEdition: latest
        ? { id: latest.id, code: latest.code, status: latest.status, editionNumber: latest.editionNumber }
        : null,
    };
  });
}

function columns(def: ReturnType<typeof buildDefinition> & { ok: true }, type?: string) {
  const d = def.definition;
  return {
    Name: d.Name,
    Description: d.Description ?? null,
    Type: type ?? (d.Stages.every((st) => st.type === 'knockout') ? 'Cup' : 'League'),
    Prestige: d.Prestige,
    Entry: d.Entry,
    Stages: d.Stages,
    WinCondition: d.WinCondition,
    Rewards: d.Rewards,
    Outcomes: d.Outcomes ?? null,
    Recurrence: d.Recurrence ?? null,
    updatedAt: new Date(),
  };
}

const bad = (message: string, payload?: { path: string; message: string }[]) => ({
  status: 400 as const,
  body: { success: false as const, message, payload },
});

export const competitionDefinitionTsRestRoutes = s.router(contract.competitionDefinitions, {
  list: async ({ query }) => {
    try {
      const rows = await db().select().from(competitions).orderBy(competitions.Name);
      const visible = query.includeArchived ? rows : rows.filter((r) => !r.Archived);
      return { status: 200 as const, body: { success: true as const, message: 'Competitions', payload: await summaries(visible) } };
    } catch (err) {
      return bad(err instanceof Error ? err.message : String(err));
    }
  },

  get: async ({ params }) => {
    try {
      const [row] = await db().select().from(competitions).where(eq(competitions.id, params.id));
      if (!row) return { status: 404 as const, body: { success: false as const, message: 'Competition not found' } };
      return { status: 200 as const, body: { success: true as const, message: 'Competition', payload: (await summaries([row]))[0]! } };
    } catch (err) {
      return { status: 404 as const, body: { success: false as const, message: err instanceof Error ? err.message : String(err) } };
    }
  },

  validate: async ({ body }) => {
    const built = buildDefinition(body as CompetitionDefinitionInput);
    return {
      status: 200 as const,
      body: {
        success: true as const,
        message: built.ok ? 'Valid' : 'Invalid',
        payload: built.ok
          ? { ok: true, definition: built.definition, errors: [] }
          : { ok: false, definition: null, errors: built.errors },
      },
    };
  },

  create: async ({ body, req }) => {
    const access = await isAdmin(req.session as Session);
    if (access !== 'ok') return accessDenied(access);
    const built = buildDefinition(body as CompetitionDefinitionInput);
    if (!built.ok) return bad('The competition definition is invalid', built.errors);
    const code = body.Code.toUpperCase();
    const [clash] = await db().select({ id: competitions.id }).from(competitions).where(eq(competitions.CompetitionCode, code));
    if (clash) return { status: 409 as const, body: { success: false as const, message: `Code ${code} is taken` } };
    const [row] = await db()
      .insert(competitions)
      .values({ ...columns(built, body.Type), CompetitionCode: code, CompetitionID: code })
      .returning();
    return { status: 201 as const, body: { success: true as const, message: 'Competition created', payload: (await summaries([row!]))[0]! } };
  },

  update: async ({ params, body, req }) => {
    const access = await isAdmin(req.session as Session);
    if (access !== 'ok') return accessDenied(access);
    const built = buildDefinition(body as CompetitionDefinitionInput);
    if (!built.ok) return bad('The competition definition is invalid', built.errors);
    const [row] = await db()
      .update(competitions)
      .set(columns(built, body.Type))
      .where(eq(competitions.id, params.id))
      .returning();
    if (!row) return { status: 404 as const, body: { success: false as const, message: 'Competition not found' } };
    return { status: 200 as const, body: { success: true as const, message: 'Competition saved', payload: (await summaries([row]))[0]! } };
  },

  archive: async ({ params, body, req }) => {
    const access = await isAdmin(req.session as Session);
    if (access !== 'ok') return accessDenied(access);
    const [row] = await db()
      .update(competitions)
      .set({ Archived: body.archived, updatedAt: new Date() })
      .where(eq(competitions.id, params.id))
      .returning();
    if (!row) return { status: 404 as const, body: { success: false as const, message: 'Competition not found' } };
    return { status: 200 as const, body: { success: true as const, message: body.archived ? 'Archived' : 'Restored', payload: (await summaries([row]))[0]! } };
  },
});
