import 'dotenv/config';
import assert from 'assert';
import type { AddressInfo } from 'net';
import express from 'express';
import { createExpressEndpoints } from '@ts-rest/express';
import { apiContract } from '@repo/api-contract';
import { eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';
import {
  calendars,
  clubMatchDetails,
  clubs,
  competitions,
  fixtures,
  users,
} from '../db/drizzle/schema';
import {
  accept,
  cancel,
  ChallengeError,
  decline,
  eligibleOpponents,
  expireChallenges,
  findSlot,
  propose,
} from '../services/competitions/challenge.service';
import {
  createEdition,
  publishEdition,
  register,
  tickEditions,
} from '../services/competitions/edition.service';
import {
  applyResult,
  getStageTable,
} from '../services/competitions/ranking.service';
import {
  challengeTsRestRoutes,
  editionTsRestRoutes,
} from '../controllers/open-play/open-play.router';

/**
 * Checks for challenges, the scheduler and the editions/challenges HTTP
 * routes (docs/OPEN-PLAY-COMPETITIONS-SPEC.md). Needs an EMPTY scratch
 * database with the current schema; refuses to run if Clubs has any rows.
 *
 *   CHALLENGE_CHECK_DB=1 DATABASE_URL=... npx ts-node src/scripts/checkChallengeService.ts
 */

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

async function refused(
  fn: () => Promise<unknown>,
  code: ChallengeError['code'],
  text?: string
) {
  try {
    await fn();
  } catch (err) {
    assert.ok(
      err instanceof ChallengeError,
      `expected ChallengeError, got ${String(err)}`
    );
    assert.strictEqual(err.code, code, err.message);
    if (text)
      assert.ok(
        err.message.includes(text),
        `"${err.message}" should mention "${text}"`
      );
    return;
  }
  assert.fail(`expected ${code}`);
}

async function main() {
  if (process.env.CHALLENGE_CHECK_DB !== '1') {
    console.log(
      'skipped (set CHALLENGE_CHECK_DB=1 and use an empty scratch database)'
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
  await db
    .insert(calendars)
    .values({ CurrentDate: now, CurrentDay: 0, updatedAt: now });
  const setDay = (day: number) => db.update(calendars).set({ CurrentDay: day });

  const [owner0, owner1, admin] = await db
    .insert(users)
    .values([
      { FullName: 'Owner 0', Username: 'o0', Password: 'x', updatedAt: now },
      { FullName: 'Owner 1', Username: 'o1', Password: 'x', updatedAt: now },
      {
        FullName: 'Admin',
        Username: 'admin',
        Password: 'x',
        isAdmin: true,
        updatedAt: now,
      },
    ])
    .returning();
  const made = await db
    .insert(clubs)
    .values(
      Array.from({ length: 6 }, (_, i) => ({
        Name: `Club ${i}`,
        ClubCode: `C${i}`,
        Elo: 1800 - i * 50,
        Budget: 1_000,
        UserId: i === 0 ? owner0!.id : i === 1 ? owner1!.id : null,
        updatedAt: now,
      }))
    )
    .returning();
  const club = made.map((c) => c.id);

  const [league] = await db
    .insert(competitions)
    .values({
      Name: 'Open League',
      Type: 'League',
      CompetitionCode: 'OPEN',
      CompetitionID: 'OPEN',
      Entry: { mode: 'open', minClubs: 2, maxClubs: null },
      Stages: [
        {
          type: 'league',
          days: 10,
          rules: {
            respondWithinDays: 2,
            maxVsSameOpponent: 1,
            rematchCooldownDays: 0,
            challengeRange: 0,
            maxOpenChallenges: 2,
            minDeclinesBeforeForfeit: 1,
            minGamesToRank: 0,
          },
        },
      ],
      updatedAt: now,
    })
    .returning();
  const edition = await createEdition(league!.id, {
    registrationOpensDay: 0,
    registrationClosesDay: 0,
    startDay: 0,
  });
  await publishEdition(edition.id);
  await tickEditions(); // opens
  for (let i = 0; i < 5; i++) await register(edition.id, club[i]!); // club 5 stays out
  await tickEditions(); // starts, stage runs days 0-9
  const E = edition.id;

  console.log('service');
  const first = await propose(E, club[0]!, club[1]!);
  await check(
    'a proposal: challenged club at home, answer due in 2 days',
    () => {
      assert.strictEqual(first.ChallengeStatus, 'proposed');
      assert.strictEqual(first.HomeTeamId, club[1]);
      assert.strictEqual(first.AwayTeamId, club[0]);
      assert.strictEqual(first.ChallengerClubId, club[0]);
      assert.strictEqual(first.RespondBy, 2);
    }
  );
  await check('rules refuse bad proposals with reasons', async () => {
    await refused(
      () => propose(E, club[0]!, club[1]!),
      'ineligible',
      'already pending'
    );
    await refused(
      () => propose(E, club[1]!, club[0]!),
      'ineligible',
      'already pending'
    );
    await refused(() => propose(E, club[0]!, club[0]!), 'ineligible', 'itself');
    await refused(
      () => propose(E, club[0]!, club[5]!),
      'ineligible',
      'not playing'
    );
    await propose(E, club[0]!, club[2]!);
    await refused(
      () => propose(E, club[0]!, club[3]!),
      'ineligible',
      'open challenges'
    );
  });
  await check('only the challenged club may accept', () =>
    refused(() => accept(first.id, club[0]!), 'not-allowed')
  );
  const a1 = await accept(first.id, club[1]!);
  await check('accepting books the first free day', () => {
    assert.strictEqual(a1.ChallengeStatus, 'accepted');
    assert.strictEqual(a1.ScheduledDay, 1);
  });
  const second = await propose(E, club[3]!, club[1]!);
  const a2 = await accept(second.id, club[1]!);
  await check('a club busy on day 1 gets day 2', () =>
    assert.strictEqual(a2.ScheduledDay, 2)
  );
  await check('the scheduler ignores cancelled challenges', async () => {
    const third = await propose(E, club[4]!, club[3]!);
    const booked = await accept(third.id, club[3]!);
    assert.strictEqual(booked.ScheduledDay, 1);
    await cancel(third.id, 'admin');
    assert.strictEqual(await findSlot(db, [club[3]!, club[4]!], 1, 9), 1);
  });

  // Play the day-1 match: club 1 (home) beats club 0.
  const [h, w] = await db
    .insert(clubMatchDetails)
    .values([
      { ClubId: club[1]!, FixtureId: first.id, Goals: 2, updatedAt: now },
      { ClubId: club[0]!, FixtureId: first.id, Goals: 1, updatedAt: now },
    ])
    .returning();
  await db
    .update(fixtures)
    .set({ Played: true, HomeSideDetailsId: h!.id, AwaySideDetailsId: w!.id })
    .where(eq(fixtures.id, first.id));
  await applyResult(first.id);
  await check(
    'a played challenge is marked played and counts for the pair cap',
    async () => {
      const [f] = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.id, first.id));
      assert.strictEqual(f!.ChallengeStatus, 'played');
      await refused(
        () => propose(E, club[1]!, club[0]!),
        'ineligible',
        'Already played 1 time'
      );
    }
  );

  await check('eligible opponents come with reasons', async () => {
    const options = await eligibleOpponents(E, club[0]!);
    assert.strictEqual(options.length, 4);
    const vs1 = options.find((o) => o.clubId === club[1]);
    assert.ok(
      vs1 &&
        !vs1.eligible &&
        vs1.reasons.some((r) => r.startsWith('Already played'))
    );
    assert.ok(options[0]!.eligible || options.every((o) => !o.eligible));
  });

  await check('the challenger can cancel; nobody else can', async () => {
    const [pending] = await db
      .select()
      .from(fixtures)
      .where(
        sql`${fixtures.ChallengerClubId} = ${club[0]} and ${fixtures.ChallengeStatus} = 'proposed'`
      );
    await refused(() => cancel(pending!.id, club[2]!), 'not-allowed');
    const c = await cancel(pending!.id, club[0]!);
    assert.strictEqual(c.ChallengeStatus, 'cancelled');
  });

  await check(
    'first decline is a decline; past the threshold it is a 3-0 forfeit',
    async () => {
      const p1 = await propose(E, club[2]!, club[4]!);
      assert.deepStrictEqual(await decline(p1.id, club[4]!), {
        forfeited: false,
      });
      const p2 = await propose(E, club[3]!, club[4]!);
      assert.deepStrictEqual(await decline(p2.id, club[4]!), {
        forfeited: true,
      });
      const [f] = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.id, p2.id));
      assert.strictEqual(f!.ChallengeStatus, 'forfeited');
      assert.strictEqual(f!.Played, true);
      const table = await getStageTable(E, 0);
      const row4 = table.groups[0]!.rows.find(
        (r) => r.row.ClubId === club[4]
      )!.row;
      assert.deepStrictEqual([row4.Played, row4.GA, row4.Forfeits], [1, 3, 1]);
    }
  );

  await check('unanswered challenges expire after RespondBy', async () => {
    const p = await propose(E, club[2]!, club[3]!);
    await setDay(3);
    const result = await expireChallenges();
    assert.deepStrictEqual(result, { expired: 1, forfeited: 0 });
    const [f] = await db.select().from(fixtures).where(eq(fixtures.id, p.id));
    assert.strictEqual(f!.ChallengeStatus, 'expired');
  });

  await check(
    'no free day before the stage ends: accept is refused',
    async () => {
      await setDay(9);
      const p = await propose(E, club[2]!, club[0]!);
      await refused(() => accept(p.id, club[0]!), 'no-slot');
    }
  );
  await setDay(3);

  console.log('http');
  let as: string | undefined;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { session: { userID?: string } }).session = {
      userID: as,
    };
    next();
  });
  createExpressEndpoints(apiContract.editions, editionTsRestRoutes, app);
  createExpressEndpoints(apiContract.challenges, challengeTsRestRoutes, app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  };

  try {
    await check('browse with eligibility', async () => {
      const r = await call('GET', `/editions?eligibleFor=${club[5]}`);
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.payload[0].id, E);
      assert.ok(
        r.body.payload[0].eligibility.reasons.includes('Registration is closed')
      );
    });
    await check('edition detail and rankings', async () => {
      const d = await call('GET', `/editions/${E}`);
      assert.strictEqual(d.status, 200);
      assert.strictEqual(d.body.payload.entries.length, 5);
      const r = await call('GET', `/editions/${E}/rankings`);
      assert.strictEqual(r.status, 200);
      // Clubs 1 (2-1 win) and 3 (3-0 forfeit win) both have 3 points per game;
      // club 3 leads on goal difference.
      assert.deepStrictEqual(
        r.body.payload.groups[0].rows.slice(0, 2).map((row: any) => row.clubId),
        [club[3], club[1]]
      );
    });
    await check('proposing needs a login and the right club', async () => {
      as = undefined;
      assert.strictEqual(
        (
          await call('POST', '/challenges', {
            editionId: E,
            challengerClubId: club[0],
            opponentClubId: club[3],
          })
        ).status,
        401
      );
      as = owner1!.id;
      assert.strictEqual(
        (
          await call('POST', '/challenges', {
            editionId: E,
            challengerClubId: club[0],
            opponentClubId: club[3],
          })
        ).status,
        403
      );
    });
    let challengeId = '';
    await check('owner proposes, opponent owner accepts', async () => {
      as = owner0!.id;
      const p = await call('POST', '/challenges', {
        editionId: E,
        challengerClubId: club[0],
        opponentClubId: club[3],
      });
      assert.strictEqual(p.status, 201, JSON.stringify(p.body));
      challengeId = p.body.payload.id;
      // Club 3 has no owner: only an admin can act for it.
      as = owner1!.id;
      assert.strictEqual(
        (
          await call('POST', `/challenges/${challengeId}/accept`, {
            clubId: club[3],
          })
        ).status,
        403
      );
      as = admin!.id;
      const a = await call('POST', `/challenges/${challengeId}/accept`, {
        clubId: club[3],
      });
      assert.strictEqual(a.status, 200, JSON.stringify(a.body));
      assert.strictEqual(a.body.payload.challenge.status, 'accepted');
    });
    await check('a refused proposal is a 409 with reasons', async () => {
      as = owner0!.id;
      const r = await call('POST', '/challenges', {
        editionId: E,
        challengerClubId: club[0],
        opponentClubId: club[3],
      });
      assert.strictEqual(r.status, 409);
      assert.ok(Array.isArray(r.body.payload) && r.body.payload.length > 0);
    });
    await check("a club's challenges, incoming and outgoing", async () => {
      const r = await call(
        'GET',
        `/challenges/club/${club[0]}?status=accepted,played`
      );
      assert.strictEqual(r.status, 200);
      const found = r.body.payload.map((c: any) => [
        c.id,
        c.direction,
        c.status,
      ]);
      assert.ok(
        found.some(
          (f: any[]) =>
            f[0] === challengeId && f[1] === 'outgoing' && f[2] === 'accepted'
        )
      );
      assert.ok(
        found.some(
          (f: any[]) =>
            f[0] === first.id && f[1] === 'outgoing' && f[2] === 'played'
        )
      );
      // Club 2's day-9 challenge to club 0 is incoming and still proposed.
      const incoming = await call(
        'GET',
        `/challenges/club/${club[0]}?status=proposed`
      );
      assert.ok(
        incoming.body.payload.every((c: any) => c.direction === 'incoming')
      );
      assert.strictEqual(incoming.body.payload.length, 1);
    });
    await check('opponents list over HTTP', async () => {
      const r = await call('GET', `/editions/${E}/opponents/${club[0]}`);
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.payload.length, 4);
    });
    await check('admin-only edition routes', async () => {
      as = owner0!.id;
      const body = {
        competitionId: league!.id,
        registrationOpensDay: 5,
        registrationClosesDay: 6,
        startDay: 6,
      };
      assert.strictEqual((await call('POST', '/editions', body)).status, 403);
      as = admin!.id;
      const created = await call('POST', '/editions', body);
      assert.strictEqual(created.status, 201, JSON.stringify(created.body));
      const pub = await call(
        'POST',
        `/editions/${created.body.payload.id}/status/publish`,
        {}
      );
      assert.strictEqual(pub.status, 200);
      assert.strictEqual(pub.body.payload.published, true);
      const inv = await call(
        'POST',
        `/editions/${created.body.payload.id}/invite`,
        { clubIds: [club[5]] }
      );
      assert.strictEqual(inv.status, 200);
    });
    await check(
      'register over HTTP, refused with reasons when ineligible',
      async () => {
        as = owner0!.id;
        const r = await call('POST', `/editions/${E}/entries/${club[0]}`, {});
        assert.strictEqual(r.status, 409);
        assert.ok(Array.isArray(r.body.payload));
      }
    );
  } finally {
    server.close();
  }

  console.log(`${passed} checks passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
