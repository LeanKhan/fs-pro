import 'dotenv/config';
import assert from 'assert';
import { and, eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';
import {
  calendars,
  clubs,
  competitionClubs,
  competitions,
  entries,
  fixtures,
  rankings,
  seasons,
} from '../db/drizzle/schema';
import { CompetitionDefinitionSchema } from '@repo/api-contract';
import { migrateOpenPlayData } from './migration/open-play-data';
import { publishEdition } from '../services/competitions/edition.service';
import { getStageTable } from '../services/competitions/ranking.service';
import { xpForLevel } from '../services/world/level';

/**
 * Checks the one-off open-play data migration against legacy-shaped data.
 * Needs an EMPTY scratch database; refuses to run if Clubs has any rows.
 *
 *   MIGRATION_CHECK_DB=1 DATABASE_URL=... npx ts-node src/scripts/checkOpenPlayDataMigration.ts
 */

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

async function main() {
  if (process.env.MIGRATION_CHECK_DB !== '1') {
    console.log(
      'skipped (set MIGRATION_CHECK_DB=1 and use an empty scratch database)'
    );
    process.exit(0);
  }
  const db = DrizzleDatabase.getInstance().database;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(clubs);
  assert.strictEqual(
    n,
    0,
    'Refusing to run: the Clubs table is not empty (use a scratch database)'
  );
  const now = new Date();
  const day = (d: number) => new Date(Date.UTC(2029, 0, d));
  await db.delete(calendars);
  await db
    .insert(calendars)
    .values({ CurrentDate: now, CurrentDay: 100, updatedAt: now });

  // Legacy world: two divisions, a cup, a tournament.
  const comp = async (
    code: string,
    extra: Partial<typeof competitions.$inferInsert>
  ) =>
    (
      await db
        .insert(competitions)
        .values({
          Name: code,
          Type: 'League',
          CompetitionCode: code,
          CompetitionID: code,
          NumberOfTeams: 4,
          NumberOfWeeks: 6,
          updatedAt: now,
          ...extra,
        })
        .returning()
    )[0]!;
  const L1 = await comp('L1', { League: true, Division: 1 });
  const L2 = await comp('L2', { League: true, Division: 2, NumberOfTeams: 2 });
  const CUP = await comp('CUP', { Type: 'Cup', Cup: true, NumberOfTeams: 0 });
  const TOUR = await comp('TOUR', {
    Type: 'Tournament',
    Tournament: true,
    NumberOfTeams: 8,
  });

  const club = (
    await db
      .insert(clubs)
      .values(
        ['A', 'B', 'C', 'D', 'E', 'F'].map((c, i) => ({
          Name: `Club ${c}`,
          ClubCode: c,
          LeagueId: i < 4 ? L1.id : L2.id,
          XP: c === 'A' ? 5000 : 0,
          updatedAt: now,
        }))
      )
      .returning()
  ).reduce<Record<string, string>>(
    (m, c) => ({ ...m, [c.ClubCode]: c.id }),
    {}
  );
  await db
    .insert(competitionClubs)
    .values([
      ...['A', 'B', 'C', 'D'].map((c) => ({
        CompetitionId: L1.id,
        ClubId: club[c]!,
        updatedAt: now,
      })),
      ...['E', 'F'].map((c) => ({
        CompetitionId: L2.id,
        ClubId: club[c]!,
        updatedAt: now,
      })),
      ...['A', 'E'].map((c) => ({
        CompetitionId: CUP.id,
        ClubId: club[c]!,
        updatedAt: now,
      })),
    ]);

  const row = (c: string, pts: number, gf: number, ga: number) => ({
    ClubCode: c,
    ClubID: club[c],
    Points: pts,
    Played: 1,
    Wins: pts === 3 ? 1 : 0,
    Draws: pts === 1 ? 1 : 0,
    Losses: pts === 0 ? 1 : 0,
    GF: gf,
    GA: ga,
    GD: gf - ga,
  });
  const season = async (
    code: string,
    c: typeof L1,
    year: string,
    start: number,
    extra: Partial<typeof seasons.$inferInsert>
  ) =>
    (
      await db
        .insert(seasons)
        .values({
          SeasonCode: code,
          Title: code,
          StartDate: day(start),
          EndDate: day(start + 30),
          CompetitionId: c.id,
          CompetitionCode: c.CompetitionCode,
          Year: year,
          updatedAt: now,
          ...extra,
        })
        .returning()
    )[0]!;
  // L1 2029: two weeks; B tops the combined table (6 pts), then A.
  await season('L1-2029', L1, '2029', 1, {
    isStarted: true,
    isFinished: true,
    Status: 'finished',
    WinnerId: club.B,
    Standings: [
      {
        Week: 1,
        Table: [
          row('A', 3, 2, 0),
          row('B', 3, 1, 0),
          row('C', 0, 0, 1),
          row('D', 0, 0, 2),
        ],
      },
      {
        Week: 2,
        Table: [
          row('B', 3, 3, 0),
          row('A', 1, 1, 1),
          row('C', 1, 1, 1),
          row('D', 0, 0, 3),
        ],
      },
    ],
  });
  await season('L1-2030', L1, '2030', 40, {
    isStarted: true,
    isFinished: true,
    Status: 'ended',
    WinnerId: club.A,
    Standings: [{ Week: 1, Table: [row('A', 3, 1, 0), row('B', 0, 0, 1)] }],
  });
  const pending = await season('L1-2031', L1, '2031', 80, {
    Status: 'pending',
  });
  await db
    .insert(fixtures)
    .values({
      SeasonId: pending.id,
      HomeTeamId: club.A,
      AwayTeamId: club.B,
      ScheduledDay: 120,
      updatedAt: now,
    });
  const cup = await season('CUP-2030', CUP, '2030', 40, {
    isStarted: true,
    isFinished: true,
    Status: 'finished',
    WinnerId: club.E,
  });
  await db
    .insert(fixtures)
    .values({
      SeasonId: cup.id,
      HomeTeamId: club.A,
      AwayTeamId: club.E,
      Played: true,
      ScheduledDay: 60,
      updatedAt: now,
    });
  const running = await season('L2-2031', L2, '2031', 80, {
    isStarted: true,
    Status: 'started',
  });
  const [playedLegacy, unplayedLegacy] = await db
    .insert(fixtures)
    .values([
      {
        SeasonId: running.id,
        HomeTeamId: club.E,
        AwayTeamId: club.F,
        Played: true,
        ScheduledDay: 95,
        updatedAt: now,
      },
      {
        SeasonId: running.id,
        HomeTeamId: club.F,
        AwayTeamId: club.E,
        ScheduledDay: 110,
        updatedAt: now,
      },
    ])
    .returning();

  const untouched = async () => {
    const [c] = await db
      .select()
      .from(competitions)
      .where(eq(competitions.id, L1.id));
    const [s] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.SeasonCode, 'L1-2029'));
    return c!.Stages == null && s!.EditionNumber == null;
  };

  const blocked = await migrateOpenPlayData({ apply: true, abandon: false });
  await check(
    'a part-played legacy season blocks the migration, and nothing is written',
    async () => {
      assert.deepStrictEqual(blocked.blockedBy, ['L2-2031']);
      assert.strictEqual(blocked.applied, false);
      assert.ok(await untouched());
    }
  );

  const dry = await migrateOpenPlayData({ apply: false, abandon: true });
  await check(
    'a dry run reports the full plan and writes nothing',
    async () => {
      assert.strictEqual(dry.applied, false);
      assert.strictEqual(dry.competitionsConverted.length, 4);
      assert.strictEqual(dry.editionsNumbered, 5);
      assert.ok(await untouched());
    }
  );

  const applied = await migrateOpenPlayData({ apply: true, abandon: true });
  await check('applying matches the dry run', () => {
    assert.strictEqual(applied.applied, true);
    const strip = (r: typeof dry) => ({
      ...r,
      applied: true,
      clubsSeeded: r.clubsSeeded.map((c) => c.code),
    });
    assert.deepStrictEqual(strip(applied), strip(dry));
  });

  const comps = await db.select().from(competitions);
  const byCode = Object.fromEntries(comps.map((c) => [c.CompetitionCode, c]));
  await check(
    'each competition gets a valid definition matching its old shape',
    () => {
      assert.deepStrictEqual(
        ['L1', 'L2', 'CUP', 'TOUR'].map((c) =>
          byCode[c]!.Stages!.map((s) => s.type).join('+')
        ),
        ['league', 'league', 'knockout', 'groups+knockout']
      );
      for (const c of comps) {
        const parsed = CompetitionDefinitionSchema.safeParse({
          Name: c.Name,
          Prestige: c.Prestige,
          Entry: c.Entry,
          Stages: c.Stages,
          WinCondition: c.WinCondition,
          Rewards: c.Rewards,
        });
        assert.ok(
          parsed.success,
          `${c.CompetitionCode}: ${JSON.stringify(parsed.error?.issues)}`
        );
      }
      assert.strictEqual(byCode.L1!.Entry!.mode, 'invite');
      assert.deepStrictEqual(
        [byCode.L1!.Prestige, byCode.L2!.Prestige, byCode.TOUR!.Prestige],
        [3, 2, 4]
      );
    }
  );
  await check(
    'old seasons become numbered editions; unstarted ones are cancelled',
    async () => {
      const l1 = await db
        .select()
        .from(seasons)
        .where(eq(seasons.CompetitionId, L1.id))
        .orderBy(seasons.EditionNumber);
      assert.deepStrictEqual(
        l1.map((s) => [s.SeasonCode, s.EditionNumber, s.Status]),
        [
          ['L1-2029', 1, 'finished'],
          ['L1-2030', 2, 'finished'],
          ['L1-2031', 3, 'cancelled'],
          ['L1-E4', 4, 'draft'],
        ]
      );
      const [f] = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.SeasonId, pending.id));
      assert.deepStrictEqual(
        [f!.ChallengeStatus, f!.ScheduledDay],
        ['cancelled', null]
      );
    }
  );
  await check(
    'week tables become one ranked stage with final positions',
    async () => {
      const [e1] = await db
        .select()
        .from(seasons)
        .where(eq(seasons.SeasonCode, 'L1-2029'));
      const table = await getStageTable(e1!.id, 0);
      assert.deepStrictEqual(
        table.groups[0]!.rows.map((r) => [r.row.ClubId, r.row.Points]),
        [
          [club.B, 6],
          [club.A, 4],
          [club.C, 1],
          [club.D, 0],
        ]
      );
      const es = await db
        .select()
        .from(entries)
        .where(eq(entries.SeasonId, e1!.id));
      assert.deepStrictEqual(
        Object.fromEntries(es.map((e) => [e.ClubId, e.FinalPosition])),
        { [club.B!]: 1, [club.A!]: 2, [club.C!]: 3, [club.D!]: 4 }
      );
    }
  );
  await check(
    'a cup without tables keeps its winner and entrants',
    async () => {
      const es = await db
        .select()
        .from(entries)
        .where(eq(entries.SeasonId, cup.id));
      assert.deepStrictEqual(
        Object.fromEntries(es.map((e) => [e.ClubId, e.FinalPosition])),
        { [club.A!]: null, [club.E!]: 1 }
      );
    }
  );
  await check(
    'a part-played season is abandoned with --abandon; played matches stay',
    async () => {
      const [s] = await db
        .select()
        .from(seasons)
        .where(eq(seasons.id, running.id));
      assert.strictEqual(s!.Status, 'cancelled');
      const [p] = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.id, playedLegacy!.id));
      const [u] = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.id, unplayedLegacy!.id));
      assert.deepStrictEqual(
        [p!.Played, p!.ChallengeStatus, u!.ChallengeStatus],
        [true, null, 'cancelled']
      );
    }
  );
  await check('members are invited to a new unpublished draft', async () => {
    const [draft] = await db
      .select()
      .from(seasons)
      .where(
        and(eq(seasons.CompetitionId, L1.id), eq(seasons.Status, 'draft'))
      );
    assert.strictEqual(draft!.Definition, null);
    const invited = await db
      .select()
      .from(entries)
      .where(eq(entries.SeasonId, draft!.id));
    assert.strictEqual(invited.length, 4);
    assert.ok(invited.every((e) => e.Status === 'invited'));
    const published = await publishEdition(draft!.id);
    assert.ok(published.Definition);
  });
  await check('the year continues from the old year labels', async () => {
    const [c] = await db.select().from(calendars).limit(1);
    assert.deepStrictEqual([c!.CurrentYear, c!.YearStartDay], [4, 100]);
  });
  await check(
    'club XP is seeded from the old division, never lowered',
    async () => {
      const rows = Object.fromEntries(
        (await db.select().from(clubs)).map((c) => [c.ClubCode, c.XP])
      );
      assert.deepStrictEqual(rows, {
        A: 5000,
        B: xpForLevel(2),
        C: xpForLevel(2),
        D: xpForLevel(2),
        E: xpForLevel(1),
        F: xpForLevel(1),
      });
    }
  );

  const again = await migrateOpenPlayData({ apply: true, abandon: false });
  await check('running it again changes nothing', () => {
    assert.deepStrictEqual(
      [
        again.applied,
        again.competitionsConverted.length,
        again.editionsNumbered,
        again.clubsSeeded.length,
        again.year,
      ],
      [true, 0, 0, 0, null]
    );
  });
  const [{ rows }] = await db
    .select({ rows: sql<number>`count(*)::int` })
    .from(rankings);
  assert.strictEqual(rows, 6);

  console.log(`${passed} checks passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
