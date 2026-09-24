import { initServer } from '@ts-rest/express';
import { and, desc, eq } from 'drizzle-orm';
import { apiContract as contract } from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import {
  clubs,
  competitions,
  entries,
  fixtures,
  seasons,
} from '../../db/drizzle/schema';
import {
  ChallengeError,
  ChallengeService,
} from '../../services/competitions/challenge.service';
import {
  EditionError,
  EditionService,
} from '../../services/competitions/edition.service';
import { getStageTable } from '../../services/competitions/ranking.service';
import { accessDenied, canManageClub, isAdmin } from '../auth/club-access';

/**
 * HTTP layer for open-play editions and challenges
 * (docs/OPEN-PLAY-COMPETITIONS-SPEC.md, "API"). Business rules live in the
 * services; this file maps them to responses and checks who may act.
 */

const s = initServer();
const db = () => DrizzleDatabase.getInstance().database;
type Session = { userID?: string } | undefined;

const ok = <T>(payload: T, message = 'OK') => ({
  status: 200 as const,
  body: { success: true as const, message, payload },
});

/** Maps service errors to status codes; anything else is a 400. */
function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const reasons =
    err instanceof ChallengeError
      ? err.reasons
      : err instanceof EditionError
        ? err.details
        : undefined;
  const code =
    err instanceof ChallengeError || err instanceof EditionError
      ? err.code
      : null;
  const status =
    code === 'not-found'
      ? (404 as const)
      : code === 'not-allowed'
        ? (403 as const)
        : code === 'wrong-status' || code === 'no-slot' || code === 'ineligible'
          ? (409 as const)
          : (400 as const);
  if (status === 400 && !code) console.error('[open-play]', err);
  return {
    status,
    body: { success: false as const, message, payload: reasons },
  };
}

type SeasonRow = typeof seasons.$inferSelect;

function toEdition(season: SeasonRow) {
  return {
    id: season.id,
    competitionId: season.CompetitionId,
    code: season.SeasonCode,
    title: season.Title,
    editionNumber: season.EditionNumber,
    status: season.Status,
    published: season.Definition != null,
    registrationOpensDay: season.RegistrationOpensDay,
    registrationClosesDay: season.RegistrationClosesDay,
    startDay: season.StartDay,
    endDay: season.EndDay,
    currentStage: season.CurrentStage,
    stageStartedDay: season.StageStartedDay,
    winnerId: season.WinnerId,
    definition: season.Definition,
  };
}

function toEntry(e: typeof entries.$inferSelect) {
  return {
    seasonId: e.SeasonId,
    clubId: e.ClubId,
    status: e.Status,
    seed: e.Seed,
    group: e.Group,
    feePaid: e.FeePaid,
    eliminatedAtStage: e.EliminatedAtStage,
  };
}

function toChallenge(
  f: typeof fixtures.$inferSelect,
  extra: {
    direction?: 'incoming' | 'outgoing';
    competitionName?: string | null;
  } = {}
) {
  return {
    id: f.id,
    seasonId: f.SeasonId,
    competitionId: f.CompetitionId,
    stageIndex: f.StageIndex,
    status: f.ChallengeStatus,
    challengerClubId: f.ChallengerClubId,
    homeClubId: f.HomeTeamId,
    awayClubId: f.AwayTeamId,
    title: f.Title,
    respondBy: f.RespondBy,
    scheduledDay: f.ScheduledDay,
    played: f.Played,
    ...extra,
  };
}

/** Admin gate. */
async function requireAdmin(session: Session) {
  const access = await isAdmin(session);
  return access === 'ok' ? null : accessDenied(access);
}

/** Club gate: owner or admin. */
async function requireClub(session: Session, clubId: string) {
  const access = await canManageClub(session, clubId);
  return access === 'ok' ? null : accessDenied(access);
}

export const editionTsRestRoutes = s.router(contract.editions, {
  list: async ({ query }) => {
    try {
      const rows = await db()
        .select({ season: seasons, competitionName: competitions.Name })
        .from(seasons)
        .innerJoin(competitions, eq(competitions.id, seasons.CompetitionId))
        .where(
          and(
            query.status ? eq(seasons.Status, query.status) : undefined,
            query.competitionId
              ? eq(seasons.CompetitionId, query.competitionId)
              : undefined
          )
        )
        .orderBy(desc(seasons.StartDay))
        .limit(200);
      const items = [];
      for (const r of rows) {
        // Only published editions are shown to clubs.
        if (query.eligibleFor && !r.season.Definition) continue;
        items.push({
          ...toEdition(r.season),
          competitionName: r.competitionName,
          eligibility: query.eligibleFor
            ? await EditionService.checkEligibility(
                r.season.id,
                query.eligibleFor
              )
            : undefined,
        });
      }
      return ok(items);
    } catch (err) {
      return fail(err);
    }
  },

  create: async ({ body, req }) => {
    try {
      const denied = await requireAdmin(req.session as Session);
      if (denied) return denied;
      const season = await EditionService.createEdition(
        body.competitionId,
        body
      );
      return {
        status: 201 as const,
        body: {
          success: true as const,
          message: 'Edition created',
          payload: toEdition(season),
        },
      };
    } catch (err) {
      return fail(err);
    }
  },

  get: async ({ params }) => {
    try {
      const [season] = await db()
        .select()
        .from(seasons)
        .where(eq(seasons.id, params.id));
      if (!season)
        return fail(new EditionError('Edition not found', 'not-found'));
      const rows = await db()
        .select({
          entry: entries,
          clubName: clubs.Name,
          clubCode: clubs.ClubCode,
        })
        .from(entries)
        .innerJoin(clubs, eq(clubs.id, entries.ClubId))
        .where(eq(entries.SeasonId, season.id))
        .orderBy(entries.Seed);
      return ok({
        ...toEdition(season),
        entries: rows.map((r) => ({
          ...toEntry(r.entry),
          clubName: r.clubName,
          clubCode: r.clubCode,
        })),
      });
    } catch (err) {
      return fail(err);
    }
  },

  action: async ({ params, body, req }) => {
    try {
      const denied = await requireAdmin(req.session as Session);
      if (denied) return denied;
      const season =
        params.action === 'publish'
          ? await EditionService.publishEdition(params.id)
          : await EditionService.cancelEdition(params.id, body?.reason);
      return ok(
        toEdition(season),
        `Edition ${params.action === 'publish' ? 'published' : 'cancelled'}`
      );
    } catch (err) {
      return fail(err);
    }
  },

  invite: async ({ params, body, req }) => {
    try {
      const denied = await requireAdmin(req.session as Session);
      if (denied) return denied;
      const invited = await EditionService.invite(params.id, body.clubIds);
      return ok(invited.map(toEntry), `${invited.length} club(s) invited`);
    } catch (err) {
      return fail(err);
    }
  },

  eligibility: async ({ params }) => {
    try {
      return ok(
        await EditionService.checkEligibility(params.id, params.clubId)
      );
    } catch (err) {
      return fail(err);
    }
  },

  register: async ({ params, req }) => {
    try {
      const denied = await requireClub(req.session as Session, params.clubId);
      if (denied) return denied;
      return ok(
        toEntry(await EditionService.register(params.id, params.clubId)),
        'Registered'
      );
    } catch (err) {
      return fail(err);
    }
  },

  withdraw: async ({ params, req }) => {
    try {
      const denied = await requireClub(req.session as Session, params.clubId);
      if (denied) return denied;
      const [entry] = await db()
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.SeasonId, params.id),
            eq(entries.ClubId, params.clubId)
          )
        );
      if (entry?.Status === 'invited')
        await EditionService.declineInvite(params.id, params.clubId);
      else await EditionService.withdraw(params.id, params.clubId);
      return ok({ ok: true as const }, 'Withdrawn');
    } catch (err) {
      return fail(err);
    }
  },

  rankings: async ({ params, query }) => {
    try {
      const [season] = await db()
        .select()
        .from(seasons)
        .where(eq(seasons.id, params.id));
      if (!season)
        return fail(new EditionError('Edition not found', 'not-found'));
      const table = await getStageTable(
        params.id,
        query.stage ?? season.CurrentStage
      );
      return ok({
        seasonId: table.seasonId,
        stageIndex: table.stageIndex,
        metric: table.rules.metric,
        tiebreakers: table.rules.tiebreakers,
        minGamesToRank: table.rules.minGamesToRank,
        groups: table.groups.map((g) => ({
          group: g.group,
          rows: g.rows.map(({ row, rank, gamesNeeded }) => ({
            clubId: row.ClubId,
            rank,
            gamesNeeded,
            played: row.Played,
            wins: row.Wins,
            draws: row.Draws,
            losses: row.Losses,
            gf: row.GF,
            ga: row.GA,
            gd: row.GD,
            points: row.Points,
            cleanSheets: row.CleanSheets,
            forfeits: row.Forfeits,
            bestUnbeatenRun: row.BestUnbeatenRun,
          })),
        })),
      });
    } catch (err) {
      return fail(err);
    }
  },

  eligibleOpponents: async ({ params }) => {
    try {
      return ok(
        await ChallengeService.eligibleOpponents(params.id, params.clubId)
      );
    } catch (err) {
      return fail(err);
    }
  },

  clubEntries: async ({ params }) => {
    try {
      const rows = await db()
        .select({
          entry: entries,
          season: seasons,
          competitionName: competitions.Name,
        })
        .from(entries)
        .innerJoin(seasons, eq(seasons.id, entries.SeasonId))
        .innerJoin(competitions, eq(competitions.id, seasons.CompetitionId))
        .where(eq(entries.ClubId, params.clubId))
        .orderBy(desc(seasons.StartDay));
      return ok(
        rows.map((r) => ({
          ...toEntry(r.entry),
          edition: {
            ...toEdition(r.season),
            competitionName: r.competitionName,
          },
        }))
      );
    } catch (err) {
      return fail(err);
    }
  },
});

export const challengeTsRestRoutes = s.router(contract.challenges, {
  propose: async ({ body, req }) => {
    try {
      const denied = await requireClub(
        req.session as Session,
        body.challengerClubId
      );
      if (denied) return denied;
      const fixture = await ChallengeService.propose(
        body.editionId,
        body.challengerClubId,
        body.opponentClubId
      );
      return {
        status: 201 as const,
        body: {
          success: true as const,
          message: 'Challenge sent',
          payload: toChallenge(fixture, { direction: 'outgoing' }),
        },
      };
    } catch (err) {
      return fail(err);
    }
  },

  respond: async ({ params, body, req }) => {
    try {
      const session = req.session as Session;
      // Admins may cancel any challenge; everything else acts for a club.
      const adminCancel =
        params.action === 'cancel' && (await isAdmin(session)) === 'ok';
      if (!adminCancel) {
        const denied = await requireClub(session, body.clubId);
        if (denied) return denied;
      }

      let forfeited: boolean | undefined;
      if (params.action === 'accept')
        await ChallengeService.accept(params.fixtureId, body.clubId);
      else if (params.action === 'decline') {
        forfeited = (
          await ChallengeService.decline(params.fixtureId, body.clubId)
        ).forfeited;
      } else
        await ChallengeService.cancel(
          params.fixtureId,
          adminCancel ? 'admin' : body.clubId
        );

      const [fixture] = await db()
        .select()
        .from(fixtures)
        .where(eq(fixtures.id, params.fixtureId));
      return ok(
        { challenge: toChallenge(fixture!), forfeited },
        forfeited
          ? 'Declined too often: recorded as a forfeit'
          : `Challenge ${fixture!.ChallengeStatus}`
      );
    } catch (err) {
      return fail(err);
    }
  },

  forClub: async ({ params, query }) => {
    try {
      const statuses = query.status?.split(',').filter(Boolean);
      const list = await ChallengeService.clubChallenges(
        params.clubId,
        statuses
      );
      return ok(
        list.map((c) =>
          toChallenge(c.fixture, {
            direction: c.direction,
            competitionName: c.competitionName,
          })
        )
      );
    } catch (err) {
      return fail(err);
    }
  },
});
