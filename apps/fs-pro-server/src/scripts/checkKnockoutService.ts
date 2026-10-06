import 'dotenv/config';
import assert from 'assert';
import { and, eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';
import {
  calendars,
  clubMatchDetails,
  clubs,
  competitions,
  entries,
  fixtures,
  seasons,
} from '../db/drizzle/schema';
import {
  createEdition,
  publishEdition,
  register,
  tickEditions,
} from '../services/competitions/edition.service';
import {
  decideTie,
  pairRound,
  shootout,
} from '../services/competitions/knockout';
import {
  advanceKnockout,
  getBracket,
} from '../services/competitions/knockout.service';
import { applyResult } from '../services/competitions/ranking.service';

/**
 * Checks for knockout stages (docs/OPEN-PLAY-COMPETITIONS-SPEC.md). Pure
 * checks always run; database checks need an EMPTY scratch database and
 * refuse to run if Clubs has any rows.
 *
 *   KNOCKOUT_CHECK_DB=1 DATABASE_URL=... npx ts-node src/scripts/checkKnockoutService.ts
 */

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

/** Deterministic rng for repeatable shootouts and draws. */
function seededRng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

async function pureChecks() {
  console.log('pure');
  const seeds = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ clubId: `s${i + 1}`, seed: i + 1 }));

  await check('1 v 8, 2 v 7...', () => {
    const { pairs, bye } = pairRound(seeds(8));
    assert.strictEqual(bye, null);
    assert.deepStrictEqual(
      pairs.map((p) => [p.high, p.low]),
      [
        ['s1', 's8'],
        ['s2', 's7'],
        ['s3', 's6'],
        ['s4', 's5'],
      ]
    );
  });
  await check('odd count: top seed gets the bye', () => {
    const { pairs, bye } = pairRound(seeds(5));
    assert.strictEqual(bye, 's1');
    assert.deepStrictEqual(
      pairs.map((p) => [p.high, p.low]),
      [
        ['s2', 's5'],
        ['s3', 's4'],
      ]
    );
  });
  await check('random draw uses everyone once, better seed is "high"', () => {
    const { pairs } = pairRound(seeds(8), { random: true, rng: seededRng(7) });
    const used = pairs.flatMap((p) => [p.high, p.low]).sort();
    assert.deepStrictEqual(
      used,
      seeds(8)
        .map((s) => s.clubId)
        .sort()
    );
    for (const p of pairs)
      assert.ok(Number(p.high.slice(1)) < Number(p.low.slice(1)));
  });
  await check('a shootout never ends level', () => {
    for (let i = 1; i < 300; i++) {
      const r = shootout(seededRng(i));
      assert.notStrictEqual(r.home, r.away);
    }
  });

  const pair = { high: 'H', low: 'L' };
  const leg = (
    homeId: string,
    awayId: string,
    homeGoals: number,
    awayGoals: number,
    engineWinnerId?: string
  ) => ({
    homeId,
    awayId,
    homeGoals,
    awayGoals,
    engineWinnerId,
  });
  await check('single leg: score, engine shootout, higher seed', () => {
    assert.deepStrictEqual(
      decideTie(pair, [leg('H', 'L', 0, 1)], 'penalties'),
      {
        winnerId: 'L',
        loserId: 'H',
        decidedBy: 'score',
      }
    );
    assert.strictEqual(
      decideTie(pair, [leg('H', 'L', 1, 1, 'L')], 'penalties').winnerId,
      'L'
    );
    assert.strictEqual(
      decideTie(pair, [leg('H', 'L', 1, 1, 'L')], 'penalties').decidedBy,
      'penalties'
    );
    assert.strictEqual(
      decideTie(pair, [leg('H', 'L', 2, 2)], 'higher-seed').winnerId,
      'H'
    );
  });
  await check('two legs: aggregate, away goals, then penalties', () => {
    const agg = decideTie(
      pair,
      [leg('L', 'H', 2, 0), leg('H', 'L', 1, 0)],
      'away-goals'
    );
    assert.deepStrictEqual([agg.winnerId, agg.decidedBy], ['L', 'aggregate']);
    const away = decideTie(
      pair,
      [leg('L', 'H', 1, 0), leg('H', 'L', 2, 1)],
      'away-goals'
    );
    assert.deepStrictEqual(
      [away.winnerId, away.decidedBy],
      ['L', 'away-goals']
    );
    const pens = decideTie(
      pair,
      [leg('L', 'H', 1, 1), leg('H', 'L', 1, 1)],
      'away-goals',
      seededRng(3)
    );
    assert.strictEqual(pens.decidedBy, 'penalties');
    assert.ok(pens.penalties && pens.penalties.high !== pens.penalties.low);
  });
}

async function dbChecks() {
  console.log('database');
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
    .values({
      CurrentDate: now,
      CurrentDay: 0,
      updatedAt: now,
      MaxConcurrentEntries: 5,
    });
  const setDay = (day: number) => db.update(calendars).set({ CurrentDay: day });

  const made = await db
    .insert(clubs)
    .values(
      Array.from({ length: 5 }, (_, i) => ({
        Name: `Club ${i}`,
        ClubCode: `C${i}`,
        Elo: 1900 - i * 100,
        updatedAt: now,
      }))
    )
    .returning();
  const club = made.map((c) => c.id); // club[0] = best Elo = seed 1

  async function competition(code: string, def: Record<string, unknown>) {
    const [c] = await db
      .insert(competitions)
      .values({
        Name: code,
        Type: 'Cup',
        CompetitionCode: code,
        CompetitionID: code,
        updatedAt: now,
        ...def,
      })
      .returning();
    return c!;
  }

  /** Record a result on a fixture and apply it like the match flow does. */
  async function result(
    fixtureId: string,
    homeGoals: number,
    awayGoals: number,
    engineWinner?: string
  ) {
    const [f] = await db
      .select()
      .from(fixtures)
      .where(eq(fixtures.id, fixtureId));
    const [h, a] = await db
      .insert(clubMatchDetails)
      .values([
        {
          ClubId: f!.HomeTeamId!,
          FixtureId: f!.id,
          Goals: homeGoals,
          updatedAt: now,
        },
        {
          ClubId: f!.AwayTeamId!,
          FixtureId: f!.id,
          Goals: awayGoals,
          updatedAt: now,
        },
      ])
      .returning();
    await db
      .update(fixtures)
      .set({
        Played: true,
        HomeSideDetailsId: h!.id,
        AwaySideDetailsId: a!.id,
        Details: engineWinner
          ? { Winner: engineWinner, Penalties: { Home: 4, Away: 3 } }
          : {},
      })
      .where(eq(fixtures.id, f!.id));
    const applied = await applyResult(f!.id);
    assert.strictEqual(applied.status, 'applied');
  }

  // A league edition where club 1 (seed 2) has accepted challenges on days 1-3.
  const league = await competition('LG', {
    Type: 'League',
    Entry: { mode: 'open', minClubs: 2, maxClubs: null },
    Stages: [{ type: 'league', days: 30 }],
  });
  const lg = await createEdition(league.id, {
    registrationOpensDay: 0,
    registrationClosesDay: 0,
    startDay: 0,
  });
  await publishEdition(lg.id);
  await tickEditions();
  await register(lg.id, club[1]!);
  await register(lg.id, club[4]!);
  await tickEditions();
  const blockers = await db
    .insert(fixtures)
    .values(
      [1, 2, 3].map((day) => ({
        SeasonId: lg.id,
        CompetitionId: league.id,
        StageIndex: 0,
        HomeTeamId: club[1]!,
        AwayTeamId: club[4]!,
        ChallengeStatus: 'accepted',
        ScheduledDay: day,
        updatedAt: now,
      }))
    )
    .returning();

  // Cup: 5 clubs, single leg, penalties, Elo seeding, 3 days per tie.
  const cup = await competition('CUP', {
    Entry: { mode: 'open', minClubs: 2, maxClubs: null },
    Stages: [
      {
        type: 'knockout',
        legs: 1,
        tieDays: 3,
        seeding: 'elo',
        drawAtEnd: 'penalties',
      },
    ],
    Rewards: { prizeMoney: [{ position: 1, amount: 500 }], xp: [] },
  });
  const cu = await createEdition(cup.id, {
    registrationOpensDay: 0,
    registrationClosesDay: 0,
    startDay: 0,
  });
  await publishEdition(cu.id);
  await tickEditions();
  for (const id of club) await register(cu.id, id);
  await tickEditions(); // starts: draws round 1

  const r1 = await db
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.SeasonId, cu.id), eq(fixtures.Round, 1)));
  await check(
    'round 1: two ties, top seed has a bye, higher seed at home',
    async () => {
      assert.strictEqual(r1.length, 2);
      const pairs = r1.map((f) => [f.HomeTeamId, f.AwayTeamId]).sort();
      assert.deepStrictEqual(
        pairs,
        [
          [club[1], club[4]],
          [club[2], club[3]],
        ].sort()
      );
      assert.ok(
        r1.every(
          (f) =>
            f.PlayBy === 3 &&
            f.Stage === 'knockout' &&
            f.ChallengeStatus == null
        )
      );
      const bracket = await getBracket(cu.id);
      assert.strictEqual(bracket.rounds[0]!.byeClubId, club[0]);
    }
  );
  await check(
    'a free day is used; with none, the deadline is forced and the league match moves',
    async () => {
      const free = r1.find((f) => f.HomeTeamId === club[2])!;
      assert.strictEqual(free.ScheduledDay, 1);
      const forced = r1.find((f) => f.HomeTeamId === club[1])!;
      assert.strictEqual(forced.ScheduledDay, 3);
      const [moved] = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.id, blockers[2]!.id));
      assert.strictEqual(moved!.ScheduledDay, 4);
      assert.strictEqual(moved!.ChallengeStatus, 'accepted');
    }
  );

  // Round 1: club 1 beats club 4; club 2 v club 3 is 1-1, club 3 wins the engine's shootout.
  await result(r1.find((f) => f.HomeTeamId === club[2])!.id, 1, 1, club[3]);
  await setDay(1);
  await check(
    'an unfinished round waits (finished ties are settled)',
    async () => {
      assert.deepStrictEqual(await advanceKnockout(cu.id), {
        status: 'waiting',
      });
      const [e2] = await db
        .select()
        .from(entries)
        .where(and(eq(entries.SeasonId, cu.id), eq(entries.ClubId, club[2]!)));
      assert.strictEqual(e2!.Status, 'eliminated');
    }
  );
  await result(r1.find((f) => f.HomeTeamId === club[1])!.id, 2, 0);
  await setDay(3);
  await check(
    'the next round waits for the day after the last match',
    async () => {
      assert.deepStrictEqual(await advanceKnockout(cu.id), {
        status: 'waiting',
      });
    }
  );
  await setDay(4);
  const t4 = await tickEditions();
  const r2 = await db
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.SeasonId, cu.id), eq(fixtures.Round, 2)));
  await check('round 2 is drawn from the clubs still in', () => {
    assert.deepStrictEqual(t4.roundsDrawn, [cu.id]);
    assert.strictEqual(r2.length, 1);
    // Clubs 0, 1, 3 left: seed 1 (club 0) has the bye; club 1 hosts club 3.
    assert.deepStrictEqual(
      [r2[0]!.HomeTeamId, r2[0]!.AwayTeamId],
      [club[1], club[3]]
    );
  });
  await result(r2[0]!.id, 0, 2);
  await setDay(8);
  await tickEditions();
  const r3 = await db
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.SeasonId, cu.id), eq(fixtures.Round, 3)));
  await check('the final: the bye club hosts the survivor', () => {
    assert.strictEqual(r3.length, 1);
    assert.deepStrictEqual(
      [r3[0]!.HomeTeamId, r3[0]!.AwayTeamId],
      [club[0], club[3]]
    );
  });
  await result(r3[0]!.id, 3, 1);
  await setDay(12);
  const t12 = await tickEditions();
  const [doneCup] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, cu.id));
  await check('the last club standing wins; the edition finishes', () => {
    assert.deepStrictEqual(t12.finished, [cu.id]);
    assert.strictEqual(doneCup!.Status, 'finished');
    assert.strictEqual(doneCup!.WinnerId, club[0]);
  });
  await check('the bracket shows every round with winners', async () => {
    const b = await getBracket(cu.id);
    assert.deepStrictEqual(
      b.rounds.map((r) => [r.round, r.ties.length, r.byeClubId]),
      [
        [1, 2, club[0]],
        [2, 1, club[0]],
        [3, 1, null],
      ]
    );
    assert.strictEqual(b.rounds[2]!.ties[0]!.winnerId, club[0]);
    const pens = b.rounds[0]!.ties.find((t) => t.highSeedClubId === club[2])!;
    assert.deepStrictEqual(
      [pens.winnerId, pens.decidedBy],
      [club[3], 'penalties']
    );
  });

  // Groups (2 of 2, winners through) then a two-leg final on away goals.
  const combo = await competition('COMBO', {
    Type: 'League',
    Entry: { mode: 'open', minClubs: 4, maxClubs: 4 },
    Stages: [
      {
        type: 'groups',
        days: 5,
        groupSize: 2,
        rules: { minGamesToRank: 1, metric: 'points' },
        advance: { top: 1, perGroup: true },
      },
      {
        type: 'knockout',
        legs: 2,
        tieDays: 4,
        seeding: 'previous-stage',
        drawAtEnd: 'away-goals',
      },
    ],
  });
  await setDay(20);
  const co = await createEdition(combo.id, {
    registrationOpensDay: 20,
    registrationClosesDay: 20,
    startDay: 20,
  });
  await publishEdition(co.id);
  await tickEditions();
  for (const id of club.slice(0, 4)) await register(co.id, id);
  await tickEditions(); // groups: A = clubs 0 & 3, B = clubs 1 & 2
  const group = async (a: number, b: number, ga: number, gb: number) => {
    const [f] = await db
      .insert(fixtures)
      .values({
        SeasonId: co.id,
        CompetitionId: combo.id,
        StageIndex: 0,
        HomeTeamId: club[a]!,
        AwayTeamId: club[b]!,
        ChallengeStatus: 'accepted',
        ScheduledDay: 21,
        updatedAt: now,
      })
      .returning();
    await result(f!.id, ga, gb);
  };
  await group(0, 3, 0, 1); // club 3 wins group A
  await group(1, 2, 2, 0); // club 1 wins group B (bigger margin: seed 1 overall)
  await setDay(25);
  await tickEditions(); // groups end, final drawn
  const final = await db
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.SeasonId, co.id), eq(fixtures.StageIndex, 1)))
    .orderBy(fixtures.Leg);
  await check(
    'previous-stage seeding: the better group winner hosts the second leg',
    () => {
      assert.strictEqual(final.length, 2);
      assert.deepStrictEqual(
        final.map((f) => [f.Leg, f.HomeTeamId, f.AwayTeamId, f.Stage]),
        [
          [1, club[3], club[1], 'ko-leg'],
          [2, club[1], club[3], 'ko-leg'],
        ]
      );
      assert.ok(final[0]!.ScheduledDay! < final[1]!.ScheduledDay!);
      assert.ok(final[1]!.ScheduledDay! <= final[1]!.PlayBy!);
    }
  );
  await result(final[0]!.id, 1, 0); // club 3 wins leg 1 at home
  await result(final[1]!.id, 2, 1); // club 1 wins leg 2 at home: 2-2, club 3 scored away
  await setDay(final[1]!.ScheduledDay! + 1);
  await tickEditions();
  const [doneCombo] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, co.id));
  await check('two legs level on aggregate: away goals decide', async () => {
    assert.strictEqual(doneCombo!.Status, 'finished');
    assert.strictEqual(doneCombo!.WinnerId, club[3]);
    const b = await getBracket(co.id);
    assert.strictEqual(b.rounds[0]!.ties[0]!.decidedBy, 'away-goals');
  });
}

async function main() {
  await pureChecks();
  if (process.env.KNOCKOUT_CHECK_DB === '1') await dbChecks();
  else
    console.log(
      'database checks skipped (set KNOCKOUT_CHECK_DB=1 and use an empty scratch database)'
    );
  console.log(`${passed} checks passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
