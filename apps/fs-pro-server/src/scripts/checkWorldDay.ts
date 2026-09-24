import 'dotenv/config';
import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import type { AddressInfo } from 'net';
import express from 'express';
import { createExpressEndpoints } from '@ts-rest/express';
import { apiContract } from '@repo/api-contract';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';
import {
  calendars,
  clubs,
  competitions,
  fixtures,
  places,
  players,
  rankings,
  seasonReports,
  seasons,
  users,
} from '../db/drizzle/schema';
import { accept, propose } from '../services/competitions/challenge.service';
import {
  createEdition,
  publishEdition,
  register,
} from '../services/competitions/edition.service';
import {
  runWorldDay,
  type WorldDayReport,
} from '../services/world/world-day.service';
import { endYear } from '../services/world/year.service';
import { worldTsRestRoutes } from '../controllers/world/world.router';

/**
 * End-to-end check of the open-play day loop (docs/OPEN-PLAY-COMPETITIONS-SPEC.md,
 * "Calendar clock" and "Year"): four real squads from the simulation roster
 * pool play a league through the actual match engine, one game day at a
 * time, across a year end. Needs an EMPTY scratch database; refuses to run
 * if Clubs has any rows.
 *
 *   WORLD_CHECK_DB=1 DATABASE_URL=... npx ts-node src/scripts/checkWorldDay.ts
 */

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

type PoolClub = {
  Name: string;
  ClubCode: string;
  Players: Record<string, unknown>[];
} & Record<string, unknown>;

async function main() {
  if (process.env.WORLD_CHECK_DB !== '1') {
    console.log(
      'skipped (set WORLD_CHECK_DB=1 and use an empty scratch database)'
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
  await db.delete(calendars);
  await db.insert(calendars).values({
    CurrentDate: now,
    CurrentDay: 0,
    YearLengthDays: 30,
    TransferWindows: [{ fromDay: 1, toDay: 3 }],
    updatedAt: now,
  });

  // Youth intake gives new players a nationality from the countries in Places.
  await db.insert(places).values([
    {
      Fullname: 'Republic of Kev',
      Name: 'kev',
      Code: 'kev',
      Type: 'country',
      updatedAt: now,
    },
    {
      Fullname: 'Bellean',
      Name: 'bellean',
      Code: 'bellean',
      Type: 'country',
      updatedAt: now,
    },
  ]);

  // Four squads from the roster pool (same data the sim realism checks use).
  const pool = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'fixtures', 'simulation-roster-pool.json'),
      'utf8'
    )
  ) as { clubs: PoolClub[] };
  const clubCols = new Set(Object.keys(getTableColumns(clubs)));
  const playerCols = new Set(Object.keys(getTableColumns(players)));
  const pick = (
    row: Record<string, unknown>,
    cols: Set<string>,
    drop: string[]
  ) =>
    Object.fromEntries(
      Object.entries(row).filter(([k]) => cols.has(k) && !drop.includes(k))
    );
  const drop = [
    'id',
    '_id',
    'ManagerId',
    'AddressCountryId',
    'LeagueId',
    'UserId',
    'NationalityId',
    'createdAt',
    'updatedAt',
  ];
  const club: string[] = [];
  for (const source of pool.clubs.slice(0, 4)) {
    const [c] = await db
      .insert(clubs)
      .values({
        ...(pick(source, clubCols, drop) as typeof clubs.$inferInsert),
        updatedAt: now,
      })
      .returning();
    club.push(c!.id);
    await db.insert(players).values(
      source.Players.map((p) => ({
        ...(pick(p, playerCols, [
          ...drop,
          'ClubId',
        ]) as typeof players.$inferInsert),
        ClubId: c!.id,
        ClubCode: c!.ClubCode,
        updatedAt: now,
      }))
    );
  }

  const [league] = await db
    .insert(competitions)
    .values({
      Name: 'Four Club League',
      Type: 'League',
      CompetitionCode: 'FOUR',
      CompetitionID: 'FOUR',
      NumberOfTeams: 0,
      NumberOfWeeks: 0,
      Entry: { mode: 'open', minClubs: 4, maxClubs: 4 },
      Stages: [
        {
          type: 'league',
          days: 10,
          rules: { minGamesToRank: 0, respondWithinDays: 3 },
        },
      ],
      Rewards: { prizeMoney: [], xp: [] },
      updatedAt: now,
    })
    .returning();
  const edition = await createEdition(league!.id, {
    registrationOpensDay: 0,
    registrationClosesDay: 1,
    startDay: 1,
  });
  await publishEdition(edition.id);

  const days: WorldDayReport[] = [];
  const dayOn = async () => {
    const r = await runWorldDay();
    days.push(r);
    return r;
  };
  const cal = async () => (await db.select().from(calendars).limit(1))[0]!;

  console.log('day loop');
  const d0 = await dayOn();
  await check(
    'day 0: registration opens, the transfer window opens, the calendar moves one day',
    async () => {
      assert.deepStrictEqual(d0.editions!.opened, [edition.id]);
      assert.strictEqual(d0.transferWindowOpened, true);
      assert.strictEqual(d0.advancedTo, 1);
      const c = await cal();
      assert.deepStrictEqual(
        [c.TransferWindowOpen, c.TransferWindowClosesDay],
        [true, 2]
      );
    }
  );
  for (const id of club) await register(edition.id, id);
  const d1 = await dayOn();
  await check('day 1: the edition starts', () =>
    assert.deepStrictEqual(d1.editions!.started, [edition.id])
  );

  // Day 2: two challenges accepted for day 3.
  const a = await propose(edition.id, club[0]!, club[1]!);
  const b = await propose(edition.id, club[2]!, club[3]!);
  assert.strictEqual((await accept(a.id, club[1]!)).ScheduledDay, 3);
  assert.strictEqual((await accept(b.id, club[3]!)).ScheduledDay, 3);
  const d2 = await dayOn();
  await check('an empty day plays nothing', () =>
    assert.strictEqual(d2.matches.total, 0)
  );
  const d3 = await dayOn();
  await check(
    'day 3: both challenges are played by the real engine and ranked',
    async () => {
      assert.deepStrictEqual(d3.matches, { total: 2, simulated: 2, failed: 0 });
      const played = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.SeasonId, edition.id));
      assert.ok(
        played.every((f) => f.Played && f.ChallengeStatus === 'played')
      );
      const rows = await db
        .select()
        .from(rankings)
        .where(eq(rankings.SeasonId, edition.id));
      assert.strictEqual(rows.length, 4);
      assert.ok(rows.every((r) => r.Played === 1));
      const [c0] = await db.select().from(clubs).where(eq(clubs.id, club[0]!));
      assert.ok(c0!.XP > 0 && c0!.Elo !== 1500);
    }
  );

  // Day 4: an unanswered challenge (answer by day 7) expires on day 8.
  const ignored = await propose(edition.id, club[0]!, club[2]!);
  while ((await cal()).CurrentDay < 8) await dayOn();
  const d8 = await dayOn();
  await check(
    'an unanswered challenge expires the day after its deadline',
    async () => {
      assert.deepStrictEqual(d8.challenges, { expired: 1, forfeited: 0 });
      const [f] = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.id, ignored.id));
      assert.strictEqual(f!.ChallengeStatus, 'expired');
    }
  );
  while ((await cal()).CurrentDay < 11) await dayOn();
  const d11 = await dayOn();
  await check(
    'the stage ends after its 10 days and the edition finishes',
    async () => {
      assert.deepStrictEqual(d11.editions!.finished, [edition.id]);
      const [s] = await db
        .select()
        .from(seasons)
        .where(eq(seasons.id, edition.id));
      assert.strictEqual(s!.Status, 'finished');
      assert.strictEqual(s!.EndDay, 11);
    }
  );

  const agesBefore = new Map(
    (await db.select().from(players)).map((p) => [p.id, p.Age])
  );
  while ((await cal()).CurrentDay < 30) await dayOn();
  const d30 = await dayOn();
  await check(
    'day 30: the year ends by itself and the new year starts today',
    async () => {
      assert.ok(d30.yearEnded, 'year should end on day 30');
      assert.deepStrictEqual(
        [
          d30.yearEnded!.label,
          d30.yearEnded!.fromDay,
          d30.yearEnded!.toDay,
          d30.yearEnded!.errors,
        ],
        ['Y1', 0, 29, []]
      );
      const c = await cal();
      assert.deepStrictEqual(
        [c.CurrentYear, c.YearStartDay, c.CurrentDay],
        [2, 30, 31]
      );
    }
  );
  await check(
    'year end ran the player year and wrote the Y1 report',
    async () => {
      const aged = (await db.select().from(players)).filter((p) =>
        agesBefore.has(p.id)
      );
      assert.ok(
        aged.some((p) => p.Age === (agesBefore.get(p.id) ?? 0) + 1),
        'players should age'
      );
      const [report] = await db
        .select()
        .from(seasonReports)
        .where(eq(seasonReports.Year, 'Y1'));
      const data = report!.Data as {
        competitions: { name: string; championId: string | null }[];
      };
      assert.deepStrictEqual(
        data.competitions.map((c) => c.name),
        ['Four Club League']
      );
    }
  );
  await check('the new year opens its transfer window on its first day', () =>
    assert.strictEqual(d30.transferWindowOpened, true)
  );
  await check('the loop never skipped a day', () => {
    days.forEach((d, i) => {
      assert.strictEqual(d.day, i);
      assert.strictEqual(d.advancedTo, i + 1);
    });
  });
  await check('ending a year that started today is refused', async () => {
    await db.update(calendars).set({ CurrentDay: 30 });
    assert.strictEqual(await endYear(), null);
    await db.update(calendars).set({ CurrentDay: 31 });
  });

  await db.update(calendars).set({ AutoRollover: false, ClockMode: 'live' });
  while ((await cal()).CurrentDay < 60) await dayOn();
  const d60 = await dayOn();
  await check(
    'with AutoRollover off the loop pauses at the year end and waits',
    async () => {
      assert.strictEqual(d60.pausedForYearEnd, true);
      const c = await cal();
      assert.deepStrictEqual(
        [c.CurrentDay, c.CurrentYear, c.ClockMode],
        [60, 2, 'paused']
      );
    }
  );

  console.log('http');
  const [admin, user] = await db
    .insert(users)
    .values([
      {
        FullName: 'Admin',
        Username: 'admin',
        Password: 'x',
        isAdmin: true,
        updatedAt: now,
      },
      { FullName: 'User', Username: 'user', Password: 'x', updatedAt: now },
    ])
    .returning();
  let as: string | undefined;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { session: { userID?: string } }).session = {
      userID: as,
    };
    next();
  });
  createExpressEndpoints(apiContract.world, worldTsRestRoutes, app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, p: string, body?: unknown) => {
    const res = await fetch(base + p, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  try {
    await check('settings are readable', async () => {
      const r = await call('GET', '/world/settings');
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(
        [r.body.payload.currentYear, r.body.payload.dayOfYear],
        [2, 31]
      );
    });
    await check(
      'only admins change settings; bad values are refused',
      async () => {
        as = user!.id;
        assert.strictEqual(
          (await call('PATCH', '/world/settings', { maxConcurrentEntries: 4 }))
            .status,
          403
        );
        as = admin!.id;
        assert.strictEqual(
          (
            await call('PATCH', '/world/settings', {
              transferWindows: [{ fromDay: 20, toDay: 40 }],
            })
          ).status,
          400
        );
        assert.strictEqual(
          (
            await call('PATCH', '/world/settings', {
              levelThresholds: [0, 100, 50],
            })
          ).status,
          400
        );
        const ok = await call('PATCH', '/world/settings', {
          maxConcurrentEntries: 4,
          levelThresholds: [0, 50, 150],
        });
        assert.strictEqual(ok.status, 200);
        assert.deepStrictEqual(
          [
            ok.body.payload.maxConcurrentEntries,
            ok.body.payload.levelThresholds,
          ],
          [4, [0, 50, 150]]
        );
      }
    );
    await check('end the year by hand, once', async () => {
      const r = await call('POST', '/world/end-year', {});
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.payload.label, 'Y2');
      assert.strictEqual(
        (await call('POST', '/world/end-year', {})).status,
        409
      );
    });
    await check('advance one day by hand', async () => {
      const r = await call('POST', '/world/advance-day', {});
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(
        [r.body.payload.day, r.body.payload.advancedTo],
        [60, 61]
      );
    });
  } finally {
    server.close();
  }

  const [s] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(seasons)
    .where(and(eq(seasons.CompetitionId, league!.id)));
  assert.strictEqual(s!.n, 1);
  console.log(`${passed} checks passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
