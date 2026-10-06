import 'dotenv/config';
import assert from 'assert';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';
import {
  calendars,
  clubMatchDetails,
  clubPerformance,
  clubs,
  competitions,
  entries,
  fixtures,
  levelHistory,
  places,
  players,
  seasons,
  users,
} from '../db/drizzle/schema';
import {
  applyChallengePolicy,
  paceTarget,
  runCompetitionAi,
  suitability,
} from '../services/competitions/ai-competitions.service';
import { propose } from '../services/competitions/challenge.service';
import {
  createEdition,
  finish,
  publishEdition,
  register,
  tickEditions,
} from '../services/competitions/edition.service';
import { applyResult } from '../services/competitions/ranking.service';
import {
  expectedScore,
  getPerformance,
  knockoutScore,
  positionScore,
} from '../services/world/performance.service';
import { endYear } from '../services/world/year.service';
import { xpForLevel } from '../services/world/level';

/**
 * Checks for AI competition decisions, human policies, the performance
 * score and the year-end Level review (docs/OPEN-PLAY-COMPETITIONS-SPEC.md).
 * Pure checks always run; database checks need an EMPTY scratch database
 * and refuse to run if Clubs has any rows.
 *
 *   AI_CHECK_DB=1 DATABASE_URL=... npx ts-node src/scripts/checkCompetitionAi.ts
 */

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

function seededRng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

async function pureChecks() {
  console.log('pure');
  await check('suitability peaks in the middle of the Elo band', () => {
    assert.strictEqual(suitability(1500, { minElo: 1400, maxElo: 1600 }), 1);
    assert.strictEqual(suitability(1400, { minElo: 1400, maxElo: 1600 }), 0);
    assert.strictEqual(suitability(1450, { minElo: 1400, maxElo: 1600 }), 0.5);
    assert.strictEqual(suitability(1900, {}), 1);
  });
  await check('pace target grows with the stage', () => {
    const rules = { maxGames: null, minGamesToRank: 6 };
    assert.deepStrictEqual(
      [1, 5, 10].map((d) => paceTarget(rules, 10, d)),
      [1, 3, 6]
    );
    assert.strictEqual(paceTarget({ maxGames: 4, minGamesToRank: 0 }, 8, 4), 2);
  });
  await check(
    'finish scores: by position, unranked 0, knockout by rounds',
    () => {
      assert.deepStrictEqual(
        [1, 2, 5].map((p) => positionScore(p, 5, true)),
        [1, 0.75, 0]
      );
      assert.strictEqual(positionScore(1, 5, false), 0);
      assert.deepStrictEqual(
        [knockoutScore(null, 3), knockoutScore(3, 3), knockoutScore(1, 3)],
        [1, 0.667, 0]
      );
    }
  );
  await check('board target rises with Level', () => {
    const none = { LevelTargets: null };
    assert.strictEqual(expectedScore(0, none), 0.4);
    assert.ok(expectedScore(10, none) > expectedScore(2, none));
    assert.strictEqual(expectedScore(3, { LevelTargets: [0.3, 0.5] }), 0.5);
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
      YearLengthDays: 60,
    });
  const setDay = (day: number) => db.update(calendars).set({ CurrentDay: day });
  // Year end's youth intake gives new players a nationality from these.
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

  const [owner] = await db
    .insert(users)
    .values({
      FullName: 'Owner',
      Username: 'owner',
      Password: 'x',
      updatedAt: now,
    })
    .returning();
  // Clubs 0-5 AI (club 5 is broke), club 6 human with an entry policy, club 7 human without.
  const made = await db
    .insert(clubs)
    .values(
      Array.from({ length: 8 }, (_, i) => ({
        Name: `Club ${i}`,
        ClubCode: `C${i}`,
        Elo: 1600 - i * 20,
        Budget: i === 5 ? 100 : 10_000,
        XP: xpForLevel(2),
        UserId: i >= 6 ? owner!.id : null,
        EntryPolicy: i === 6 ? { autoRegister: true, maxFee: 200 } : null,
        updatedAt: now,
      }))
    )
    .returning();
  const club = made.map((c) => c.id);

  const [league] = await db
    .insert(competitions)
    .values({
      Name: 'AI League',
      Type: 'League',
      CompetitionCode: 'AIL',
      CompetitionID: 'AIL',
      Entry: { mode: 'open', minClubs: 4, maxClubs: 6, entryFee: 100 },
      Stages: [
        {
          type: 'league',
          days: 6,
          rules: {
            minGamesToRank: 2,
            maxGames: null,
            challengeRange: 0,
            minDeclinesBeforeForfeit: 3,
            rematchCooldownDays: 0,
          },
        },
      ],
      Rewards: { prizeMoney: [], xp: [] },
      updatedAt: now,
    })
    .returning();
  const e1 = await createEdition(league!.id, {
    registrationOpensDay: 0,
    registrationClosesDay: 3,
    startDay: 3,
  });
  await publishEdition(e1.id);
  await tickEditions();

  const rng = seededRng(42);
  await runCompetitionAi(rng); // day 0: choosy
  await setDay(2);
  const lastDay = await runCompetitionAi(rng); // day 2 = the day before the start: keen
  const registered = await db
    .select()
    .from(entries)
    .where(and(eq(entries.SeasonId, e1.id), eq(entries.Status, 'registered')));
  const ids = new Set(registered.map((r) => r.ClubId));
  await check(
    'AI clubs fill the edition by the last registration day, within its size',
    () => {
      assert.strictEqual(registered.length, 6);
      assert.ok(
        lastDay.registered > 0,
        'the keen last day should register someone'
      );
    }
  );
  await check("an AI club won't pay a fee over a fifth of its budget", () =>
    assert.ok(!ids.has(club[5]!))
  );
  await check('a human club registers only through its own policy', () => {
    assert.ok(ids.has(club[6]!));
    assert.ok(!ids.has(club[7]!));
  });

  // A second edition while every club is capped at 1 entry: nobody doubles up.
  await db.update(calendars).set({ MaxConcurrentEntries: 1 });
  const e2 = await createEdition(league!.id, {
    registrationOpensDay: 2,
    registrationClosesDay: 3,
    startDay: 3,
  });
  await publishEdition(e2.id);
  await tickEditions();
  await runCompetitionAi(rng);
  await check('the entry cap stops a club entering two editions', async () => {
    const both = await db
      .select({ clubId: entries.ClubId })
      .from(entries)
      .where(inArray(entries.SeasonId, [e1.id, e2.id]));
    const count = new Map<string, number>();
    for (const b of both) count.set(b.clubId, (count.get(b.clubId) ?? 0) + 1);
    assert.ok([...count.values()].every((c) => c === 1));
  });
  await db.update(calendars).set({ MaxConcurrentEntries: 3 });

  await setDay(3);
  await tickEditions(); // e1 starts (e2 is cancelled: too few)
  const members = [...ids];
  // One AI member is exhausted: its squad is at 30 fitness.
  const tired = members.find((id) => id !== club[6])!;
  await db.insert(players).values(
    Array.from({ length: 11 }, (_, i) => ({
      FirstName: 'T',
      LastName: `${i}`,
      Position: 'CM',
      Role: 'MF',
      Age: 25,
      Rating: 60,
      Value: 1,
      Wage: 1,
      isSigned: true,
      Fitness: 30,
      ClubId: tired,
      ClubCode: 'X',
      Attributes: {},
      updatedAt: now,
    })) as (typeof players.$inferInsert)[]
  );

  const day3 = await runCompetitionAi(rng);
  await check('AI clubs behind pace send challenges', () =>
    assert.ok(day3.proposed >= 3, `proposed ${day3.proposed}`)
  );
  const sent = await db
    .select()
    .from(fixtures)
    .where(eq(fixtures.SeasonId, e1.id));
  await check(
    'every AI proposal is between members, one pending per pair',
    () => {
      for (const f of sent)
        assert.ok(
          members.includes(f.HomeTeamId!) && members.includes(f.AwayTeamId!)
        );
      const pairs = sent.map((f) =>
        [f.HomeTeamId, f.AwayTeamId].sort().join('|')
      );
      assert.strictEqual(new Set(pairs).size, pairs.length);
    }
  );

  await setDay(4);
  const day4 = await runCompetitionAi(rng);
  const afterAnswers = await db
    .select()
    .from(fixtures)
    .where(eq(fixtures.SeasonId, e1.id));
  await check('AI clubs answer their challenges', () => {
    assert.ok(day4.accepted + day4.declined > 0);
    const aiAnswerable = afterAnswers.filter(
      (f) => f.HomeTeamId !== club[6] && sent.some((s) => s.id === f.id)
    );
    assert.ok(
      aiAnswerable.every(
        (f) => f.ChallengeStatus !== 'proposed' || f.HomeTeamId === tired
      )
    );
  });
  await check('a tired AI club declines, but never into a forfeit', () => {
    const toTired = afterAnswers.filter(
      (f) => f.HomeTeamId === tired && sent.some((s) => s.id === f.id)
    );
    assert.ok(
      toTired.every(
        (f) =>
          f.ChallengeStatus !== 'accepted' && f.ChallengeStatus !== 'forfeited'
      )
    );
  });

  // Human auto-accept: near Elo accepted at once, far Elo declined.
  await db
    .update(clubs)
    .set({
      ChallengePolicy: {
        autoAccept: true,
        maxEloGap: 50,
        declineOutsidePolicy: true,
      },
    })
    .where(eq(clubs.id, club[6]!));
  await db.update(clubs).set({ Elo: 1480 }).where(eq(clubs.id, club[6]!));
  const others = members.filter((m) => m !== club[6]);
  const [near, far] = await db
    .select()
    .from(clubs)
    .where(inArray(clubs.id, others));
  await db.update(clubs).set({ Elo: 1500 }).where(eq(clubs.id, near!.id));
  await db.update(clubs).set({ Elo: 1900 }).where(eq(clubs.id, far!.id));
  await check(
    'auto-accept: a challenge inside the policy is accepted straight away',
    async () => {
      await db
        .update(fixtures)
        .set({ ChallengeStatus: 'cancelled', ScheduledDay: null })
        .where(
          and(
            eq(fixtures.SeasonId, e1.id),
            inArray(fixtures.ChallengeStatus, ['proposed', 'accepted'])
          )
        );
      const f = await propose(e1.id, near!.id, club[6]!);
      assert.strictEqual(await applyChallengePolicy(f.id), 'accepted');
    }
  );
  await check(
    'auto-accept: outside the policy it is declined (declineOutsidePolicy)',
    async () => {
      const f = await propose(e1.id, far!.id, club[6]!);
      assert.strictEqual(await applyChallengePolicy(f.id), 'declined');
    }
  );

  // Finish: club members play one match each (higher Elo wins), then finish.
  await db
    .update(fixtures)
    .set({ ChallengeStatus: 'cancelled', ScheduledDay: null })
    .where(
      and(
        eq(fixtures.SeasonId, e1.id),
        inArray(fixtures.ChallengeStatus, ['proposed', 'accepted'])
      )
    );
  const order = (
    await db.select().from(clubs).where(inArray(clubs.id, members))
  ).sort((a, b) => b.Elo - a.Elo);
  for (let i = 0; i + 1 < order.length; i += 2) {
    for (const [h, a, hg, ag] of [
      [order[i]!, order[i + 1]!, 2, 0],
      [order[i + 1]!, order[i]!, 0, 1],
    ] as const) {
      const [f] = await db
        .insert(fixtures)
        .values({
          SeasonId: e1.id,
          CompetitionId: league!.id,
          StageIndex: 0,
          HomeTeamId: h.id,
          AwayTeamId: a.id,
          Played: true,
          ChallengeStatus: 'played',
          ScheduledDay: 4,
          updatedAt: now,
        })
        .returning();
      const [hd, ad] = await db
        .insert(clubMatchDetails)
        .values([
          { ClubId: h.id, FixtureId: f!.id, Goals: hg, updatedAt: now },
          { ClubId: a.id, FixtureId: f!.id, Goals: ag, updatedAt: now },
        ])
        .returning();
      await db
        .update(fixtures)
        .set({ HomeSideDetailsId: hd!.id, AwaySideDetailsId: ad!.id })
        .where(eq(fixtures.id, f!.id));
      await applyResult(f!.id);
    }
  }
  await setDay(9);
  const summary = await finish(e1.id);
  await check(
    'finishing writes final positions and finish scores',
    async () => {
      assert.ok(summary);
      const rows = await db
        .select()
        .from(entries)
        .where(eq(entries.SeasonId, e1.id));
      const winner = rows.find((r) => r.ClubId === summary!.winnerId)!;
      assert.deepStrictEqual(
        [winner.FinalPosition, winner.FinishScore],
        [1, 1]
      );
      assert.ok(
        rows.every((r) => r.FinalPosition != null && r.FinishScore != null)
      );
    }
  );
  await check(
    'the performance score: finish + Elo term + trophy, against the Level target',
    async () => {
      const perf = await getPerformance(summary!.winnerId!);
      const eloTerm = Math.min(
        0.1,
        Math.max(-0.1, (perf.eloEnd - perf.eloStart) / 400)
      );
      assert.ok(
        Math.abs(perf.score - (1 + eloTerm + 0.05)) < 0.002,
        `score ${perf.score}`
      );
      assert.deepStrictEqual(
        [perf.entries, perf.trophies, perf.finishes.length],
        [1, 1, 1]
      );
      assert.strictEqual(
        perf.gap,
        Math.round((perf.score - perf.expected) * 1000) / 1000
      );
      const idle = await getPerformance(club[7]!);
      assert.deepStrictEqual([idle.score, idle.entries], [0, 0]);
    }
  );

  // Year end with the Level review on: top of each Level up, bottom down.
  await db
    .update(calendars)
    .set({ LevelReview: { enabled: true, promoteCount: 1, relegateCount: 1 } });
  await setDay(60);
  const year = await endYear();
  await check('year end freezes scores and runs the Level review', async () => {
    assert.strictEqual(year!.errors.length, 0, year!.errors.join('; '));
    assert.strictEqual(year!.levelReviewMoves, 2);
    const frozen = await db
      .select()
      .from(clubPerformance)
      .where(eq(clubPerformance.Year, 1));
    assert.ok(frozen.length === 8 && frozen.every((r) => r.Frozen));
    const moves = await db
      .select()
      .from(levelHistory)
      .where(eq(levelHistory.Source, 'review'));
    assert.deepStrictEqual(
      moves.map((m) => m.Day),
      [59, 59]
    );
    const up = moves.find((m) => m.ToLevel > m.FromLevel)!;
    assert.strictEqual(up.ClubId, summary!.winnerId);
    const next = await db
      .select()
      .from(clubPerformance)
      .where(eq(clubPerformance.Year, 2));
    assert.strictEqual(next.length, 8);
  });
  await check('past years stay readable', async () => {
    const past = await getPerformance(summary!.winnerId!, 1);
    assert.deepStrictEqual(
      [past.year, past.current, past.finishes.length],
      [1, false, 1]
    );
  });

  const [s] = await db.select().from(seasons).where(eq(seasons.id, e2.id));
  assert.strictEqual(s!.Status, 'cancelled');
}

async function main() {
  await pureChecks();
  if (process.env.AI_CHECK_DB === '1') await dbChecks();
  else
    console.log(
      'database checks skipped (set AI_CHECK_DB=1 and use an empty scratch database)'
    );
  console.log(`${passed} checks passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
