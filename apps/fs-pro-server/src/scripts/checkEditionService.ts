import 'dotenv/config';
import assert from 'assert';
import { and, eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';
import {
  awards,
  calendars,
  clubMatchDetails,
  clubs,
  competitionAccess,
  competitions,
  entries,
  fixtures,
  levelHistory,
  seasons,
  transferLedger,
} from '../db/drizzle/schema';
import {
  advancingClubs,
  checkEligibility,
  createEdition,
  drawGroups,
  EditionError,
  finish,
  publishEdition,
  register,
  tickEditions,
  withdraw,
} from '../services/competitions/edition.service';
import { DEFAULT_LEAGUE_RULES } from '../services/competitions/definition';
import { applyResult } from '../services/competitions/ranking.service';
import { levelForXp, xpForLevel } from '../services/world/level';

/**
 * End-to-end checks for the edition lifecycle
 * (docs/OPEN-PLAY-COMPETITIONS-SPEC.md). Needs an EMPTY scratch database
 * with the current schema (e.g. `drizzle-kit push` into a new database); it
 * refuses to run if the Clubs table has any rows, so it can never touch real
 * game data.
 *
 *   EDITION_CHECK_DB=1 DATABASE_URL=... npx ts-node src/scripts/checkEditionService.ts
 */

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

async function rejects(fn: () => Promise<unknown>, code: EditionError['code']) {
  try {
    await fn();
  } catch (err) {
    assert.ok(
      err instanceof EditionError,
      `expected EditionError, got ${String(err)}`
    );
    assert.strictEqual(err.code, code);
    return err;
  }
  assert.fail(`expected ${code}`);
}

function pureChecks() {
  console.log('pure');
  const ids = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'];
  const groups = drawGroups(ids, 4);
  assert.deepStrictEqual(
    ids.map((id) => groups.get(id)),
    ['A', 'B', 'B', 'A', 'A', 'B', 'B', 'A']
  );
  passed++;
  console.log('  ok  snake draw spreads Elo pots across groups');

  const row = (ClubId: string, Group: string, Points: number) => ({
    ClubId,
    Group,
    Played: 3,
    Wins: 0,
    Draws: 0,
    Losses: 0,
    GF: 0,
    GA: 0,
    GD: 0,
    Points,
    CleanSheets: 0,
    Forfeits: 0,
    UnbeatenRun: 0,
    BestUnbeatenRun: 0,
    EloStart: 1500,
  });
  const rules = {
    ...DEFAULT_LEAGUE_RULES,
    minGamesToRank: 3,
    metric: 'points' as const,
  };
  const through = advancingClubs(
    {
      type: 'groups',
      days: 10,
      groupSize: 3,
      advance: { top: 1, perGroup: true, bestRunnersUp: 1 },
    },
    [
      row('a1', 'A', 9),
      row('a2', 'A', 6),
      row('b1', 'B', 7),
      row('b2', 'B', 4),
    ],
    rules
  );
  assert.deepStrictEqual(through, ['a1', 'b1', 'a2']);
  passed++;
  console.log('  ok  group winners first, then best runner-up');
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
    .values({ CurrentDate: now, CurrentDay: 0, updatedAt: now });
  const setDay = (day: number) => db.update(calendars).set({ CurrentDay: day });

  // Ten clubs: Elo 1900 down to 1450. Club 8 is broke, club 9 is too high a Level.
  const made = await db
    .insert(clubs)
    .values(
      Array.from({ length: 10 }, (_, i) => ({
        Name: `Club ${i}`,
        ClubCode: `C${i}`,
        Elo: 1900 - i * 50,
        Budget: i === 8 ? 50 : 10_000,
        XP: i === 9 ? xpForLevel(9) : xpForLevel(2),
        updatedAt: now,
      }))
    )
    .returning();
  const club = made.map((c) => c.id);

  const [cupB] = await db
    .insert(competitions)
    .values({
      Name: 'Elite Cup',
      Type: 'Cup',
      CompetitionCode: 'ELITE',
      CompetitionID: 'ELITE',
      Entry: { mode: 'invite', minClubs: 2, maxClubs: null },
      Stages: [{ type: 'league', days: 10 }],
      updatedAt: now,
    })
    .returning();

  const [rumble] = await db
    .insert(competitions)
    .values({
      Name: 'Summer Rumble',
      Type: 'League',
      CompetitionCode: 'RUMBLE',
      CompetitionID: 'RUMBLE',
      Entry: {
        mode: 'open',
        minClubs: 4,
        maxClubs: 8,
        maxLevel: 5,
        entryFee: 100,
      },
      Stages: [
        {
          type: 'groups',
          days: 10,
          groupSize: 4,
          rules: { minGamesToRank: 3, metric: 'points' },
          advance: { top: 2, perGroup: true },
        },
        {
          type: 'league',
          days: 10,
          rules: { minGamesToRank: 3, metric: 'points' },
        },
      ],
      Rewards: {
        prizeMoney: [
          { position: 1, amount: 1000 },
          { position: 2, amount: 500 },
        ],
        xp: [{ position: 1, amount: 200 }],
        trophy: 'Rumble Shield',
      },
      Outcomes: [
        { type: 'level', positions: [1, 1], change: 1 },
        { type: 'level', positions: [4, 4], change: -1 },
        { type: 'qualify', positions: [1, 2], targetCompetitionId: cupB!.id },
        {
          type: 'bar',
          positions: [4, 4],
          targetCompetitionId: cupB!.id,
          editions: 1,
        },
      ],
      Recurrence: { everyDays: 30, registrationDays: 5 },
      updatedAt: now,
    })
    .returning();

  const [broken] = await db
    .insert(competitions)
    .values({
      Name: 'Broken',
      Type: 'Cup',
      CompetitionCode: 'BROKEN',
      CompetitionID: 'BROKEN',
      Stages: [
        {
          type: 'knockout',
          legs: 1,
          tieDays: 5,
          seeding: 'elo',
          drawAtEnd: 'penalties',
        },
        { type: 'league', days: 5 },
      ],
      updatedAt: now,
    })
    .returning();

  await check('bad dates are refused', async () => {
    await rejects(
      () =>
        createEdition(rumble!.id, {
          registrationOpensDay: 5,
          registrationClosesDay: 2,
          startDay: 6,
        }),
      'bad-dates'
    );
  });
  await check('an invalid definition cannot be published', async () => {
    const e = await createEdition(broken!.id, {
      registrationOpensDay: 0,
      registrationClosesDay: 1,
      startDay: 1,
    });
    const err = await rejects(() => publishEdition(e.id), 'invalid-definition');
    assert.ok(Array.isArray(err.details) && err.details.length > 0);
  });

  const e1 = await createEdition(rumble!.id, {
    registrationOpensDay: 0,
    registrationClosesDay: 2,
    startDay: 2,
  });
  await check('draft is numbered and coded', () => {
    assert.strictEqual(e1.EditionNumber, 1);
    assert.strictEqual(e1.SeasonCode, 'RUMBLE-E1');
    assert.strictEqual(e1.Status, 'draft');
  });
  await check('an unpublished draft is not open', async () => {
    const r = await checkEligibility(e1.id, club[0]!);
    assert.deepStrictEqual(r.reasons, ['Not open for entry yet']);
  });
  await publishEdition(e1.id);
  const t0 = await tickEditions();
  await check('registration opens on its day', () =>
    assert.deepStrictEqual(t0.opened, [e1.id])
  );

  await check('ineligible clubs get reasons', async () => {
    assert.ok(
      (await checkEligibility(e1.id, club[8]!)).reasons.includes(
        "Can't afford the entry fee"
      )
    );
    assert.ok(
      (await checkEligibility(e1.id, club[9]!)).reasons.includes(
        'Only up to Level 5'
      )
    );
    await db.update(calendars).set({ MaxConcurrentEntries: 0 });
    assert.ok(
      (await checkEligibility(e1.id, club[0]!)).reasons.some((r) =>
        r.startsWith('Entry limit reached')
      )
    );
    await db.update(calendars).set({ MaxConcurrentEntries: 3 });
    await rejects(() => register(e1.id, club[8]!), 'ineligible');
  });

  for (let i = 0; i < 8; i++) await register(e1.id, club[i]!);
  await check(
    'registration takes the fee once, with a ledger row',
    async () => {
      const [c0] = await db.select().from(clubs).where(eq(clubs.id, club[0]!));
      assert.strictEqual(c0!.Budget, 9_900);
      const fees = await db
        .select()
        .from(transferLedger)
        .where(eq(transferLedger.Type, 'entry_fee'));
      assert.strictEqual(fees.length, 8);
    }
  );
  await check('places run out at maxClubs', async () => {
    await db.update(clubs).set({ XP: 0 }).where(eq(clubs.id, club[9]!));
    assert.ok(
      (await checkEligibility(e1.id, club[9]!)).reasons.includes(
        'No places left'
      )
    );
    await db
      .update(clubs)
      .set({ XP: xpForLevel(9) })
      .where(eq(clubs.id, club[9]!));
  });
  await check(
    'withdrawing before the start refunds, and re-entry works',
    async () => {
      await withdraw(e1.id, club[7]!);
      const [c7] = await db.select().from(clubs).where(eq(clubs.id, club[7]!));
      assert.strictEqual(c7!.Budget, 10_000);
      await register(e1.id, club[7]!);
    }
  );

  await setDay(2);
  const t2 = await tickEditions();
  const started = (
    await db.select().from(seasons).where(eq(seasons.id, e1.id))
  )[0]!;
  const e1Entries = await db
    .select()
    .from(entries)
    .where(eq(entries.SeasonId, e1.id));
  await check(
    'the edition starts, seeded by Elo, drawn into snake groups',
    () => {
      assert.deepStrictEqual(t2.started, [e1.id]);
      assert.strictEqual(started.Status, 'running');
      assert.ok(e1Entries.every((e) => e.Status === 'active'));
      const byClub = new Map(e1Entries.map((e) => [e.ClubId, e]));
      assert.deepStrictEqual(
        club
          .slice(0, 8)
          .map((c) => [byClub.get(c)!.Seed, byClub.get(c)!.Group]),
        [
          [1, 'A'],
          [2, 'B'],
          [3, 'B'],
          [4, 'A'],
          [5, 'A'],
          [6, 'B'],
          [7, 'B'],
          [8, 'A'],
        ]
      );
    }
  );

  // Play a match between two clubs; the higher Elo (lower index) wins 2-0
  // unless `result` says otherwise.
  async function play(
    stageIndex: number,
    a: number,
    b: number,
    goals: [number, number] = [2, 0],
    day = 5
  ) {
    const [f] = await db
      .insert(fixtures)
      .values({
        SeasonId: e1.id,
        CompetitionId: rumble!.id,
        StageIndex: stageIndex,
        HomeTeamId: club[a]!,
        AwayTeamId: club[b]!,
        Played: true,
        ChallengeStatus: 'played',
        ScheduledDay: day,
        updatedAt: now,
      })
      .returning();
    const [h, w] = await db
      .insert(clubMatchDetails)
      .values([
        { ClubId: club[a]!, FixtureId: f!.id, Goals: goals[0], updatedAt: now },
        { ClubId: club[b]!, FixtureId: f!.id, Goals: goals[1], updatedAt: now },
      ])
      .returning();
    await db
      .update(fixtures)
      .set({ HomeSideDetailsId: h!.id, AwaySideDetailsId: w!.id })
      .where(eq(fixtures.id, f!.id));
    const r = await applyResult(f!.id);
    assert.strictEqual(r.status, 'applied');
  }
  const roundRobin = async (stage: number, members: number[], day: number) => {
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++)
        await play(stage, members[i]!, members[j]!, [2, 0], day);
  };

  // Group A: clubs 0,3,4,7. Group B: 1,2,5,6. Lower index wins every time.
  await roundRobin(0, [0, 3, 4, 7], 5);
  await roundRobin(0, [1, 2, 5, 6], 5);
  // An open challenge and an accepted-but-unplayed one, both closed at stage end.
  const [openChallenge] = await db
    .insert(fixtures)
    .values([
      {
        SeasonId: e1.id,
        CompetitionId: rumble!.id,
        StageIndex: 0,
        HomeTeamId: club[0]!,
        AwayTeamId: club[3]!,
        ChallengeStatus: 'proposed',
        updatedAt: now,
      },
      {
        SeasonId: e1.id,
        CompetitionId: rumble!.id,
        StageIndex: 0,
        HomeTeamId: club[1]!,
        AwayTeamId: club[2]!,
        ChallengeStatus: 'accepted',
        ScheduledDay: 13,
        updatedAt: now,
      },
    ])
    .returning();

  await setDay(11);
  const early = await tickEditions();
  await check('a stage does not end before its last day', () =>
    assert.deepStrictEqual(early.stagesEnded, [])
  );

  await setDay(12);
  const t12 = await tickEditions();
  const afterGroups = (
    await db.select().from(seasons).where(eq(seasons.id, e1.id))
  )[0]!;
  const stage0Entries = await db
    .select()
    .from(entries)
    .where(eq(entries.SeasonId, e1.id));
  await check(
    'groups end: top 2 per group go through, the rest are eliminated',
    async () => {
      assert.deepStrictEqual(t12.stagesEnded, [e1.id]);
      assert.strictEqual(afterGroups.CurrentStage, 1);
      assert.strictEqual(afterGroups.StageStartedDay, 12);
      const active = stage0Entries
        .filter((e) => e.Status === 'active')
        .map((e) => e.ClubId)
        .sort();
      assert.deepStrictEqual(
        active,
        [club[0], club[1], club[2], club[3]].sort()
      );
      assert.ok(
        stage0Entries
          .filter((e) => e.Status === 'eliminated')
          .every((e) => e.EliminatedAtStage === 0)
      );
      const [proposed] = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.id, openChallenge!.id));
      assert.strictEqual(proposed!.ChallengeStatus, 'expired');
      const cancelled = await db
        .select()
        .from(fixtures)
        .where(eq(fixtures.ChallengeStatus, 'cancelled'));
      assert.strictEqual(cancelled.length, 1);
      assert.strictEqual(cancelled[0]!.ScheduledDay, null);
    }
  );

  // Final league: 0 beats everyone, 1 beats 2 and 3, 2 beats 3.
  await roundRobin(1, [0, 1, 2, 3], 15);

  const xpBefore = new Map(
    (await db.select().from(clubs)).map((c) => [c.id, c.XP])
  );
  await setDay(22);
  const t22 = await tickEditions();
  const done = (
    await db.select().from(seasons).where(eq(seasons.id, e1.id))
  )[0]!;
  await check(
    'the last stage ending finishes the edition with the right winner',
    () => {
      assert.deepStrictEqual(t22.finished, [e1.id]);
      assert.strictEqual(done.Status, 'finished');
      assert.strictEqual(done.WinnerId, club[0]);
      assert.strictEqual(done.EndDay, 22);
    }
  );
  await check('prizes, trophy and XP reward are paid', async () => {
    const prizes = await db
      .select()
      .from(transferLedger)
      .where(eq(transferLedger.Type, 'prize'));
    assert.deepStrictEqual(
      prizes.map((p) => [p.BuyerClubId, p.Amount]).sort(),
      [
        [club[0], 1000],
        [club[1], 500],
      ].sort()
    );
    const [trophy] = await db.select().from(awards);
    assert.strictEqual(trophy!.Name, 'Rumble Shield');
    assert.strictEqual(trophy!.RecipientId, club[0]);
  });
  await check(
    'the winner is promoted a Level, 4th is relegated, both logged',
    async () => {
      const [c0] = await db.select().from(clubs).where(eq(clubs.id, club[0]!));
      const [c3] = await db.select().from(clubs).where(eq(clubs.id, club[3]!));
      const before0 = xpBefore.get(club[0]!)!;
      assert.strictEqual(levelForXp(c0!.XP), levelForXp(before0 + 200) + 1);
      assert.strictEqual(c0!.XP, xpForLevel(levelForXp(before0 + 200) + 1));
      assert.strictEqual(
        c3!.XP,
        xpForLevel(levelForXp(xpBefore.get(club[3]!)!) - 1)
      );
      const moves = await db
        .select()
        .from(levelHistory)
        .where(sql`${levelHistory.Source} in ('promotion', 'relegation')`);
      assert.deepStrictEqual(
        moves.map((m) => [m.ClubId, m.Source]).sort(),
        [
          [club[0], 'promotion'],
          [club[3], 'relegation'],
        ].sort()
      );
    }
  );
  await check('finishing twice does nothing', async () => {
    assert.strictEqual(await finish(e1.id), null);
    const prizes = await db
      .select()
      .from(transferLedger)
      .where(eq(transferLedger.Type, 'prize'));
    assert.strictEqual(prizes.length, 2);
  });
  await check('qualify and bar outcomes are recorded', async () => {
    const access = await db.select().from(competitionAccess);
    assert.deepStrictEqual(
      access.map((a) => [a.ClubId, a.Kind, a.UntilEditionNumber]).sort(),
      [
        [club[0], 'qualified', null],
        [club[1], 'qualified', null],
        [club[3], 'barred', 1],
      ].sort()
    );
  });
  const [e2] = await db
    .select()
    .from(seasons)
    .where(
      and(eq(seasons.CompetitionId, rumble!.id), eq(seasons.EditionNumber, 2))
    );
  await check('recurrence schedules and publishes the next edition', () => {
    assert.ok(e2);
    assert.strictEqual(e2!.Status, 'draft');
    assert.ok(e2!.Definition);
    assert.deepStrictEqual([e2!.RegistrationOpensDay, e2!.StartDay], [27, 32]);
  });

  const b1 = await createEdition(cupB!.id, {
    registrationOpensDay: 22,
    registrationClosesDay: 25,
    startDay: 25,
  });
  await publishEdition(b1.id);
  await tickEditions();
  await check(
    'qualified clubs are invited to the next edition and may enter',
    async () => {
      const invited = await db
        .select()
        .from(entries)
        .where(eq(entries.SeasonId, b1.id));
      assert.deepStrictEqual(
        invited.map((e) => e.ClubId).sort(),
        [club[0], club[1]].sort()
      );
      assert.ok(invited.every((e) => e.Status === 'invited'));
      assert.ok((await checkEligibility(b1.id, club[0]!)).eligible);
      const used = await db
        .select()
        .from(competitionAccess)
        .where(eq(competitionAccess.Kind, 'qualified'));
      assert.ok(used.every((a) => a.Used));
    }
  );
  await check('barred clubs are refused', async () => {
    const r = await checkEligibility(b1.id, club[3]!);
    assert.ok(r.reasons.includes('Barred from this competition for now'));
  });

  // Edition 2: one club registers, then registration closes short of minClubs.
  await setDay(27);
  await tickEditions();
  await register(e2!.id, club[5]!);
  const budgetBefore = (
    await db.select().from(clubs).where(eq(clubs.id, club[5]!))
  )[0]!.Budget;
  await setDay(32);
  const t32 = await tickEditions();
  await check('too few clubs at the start cancels and refunds', async () => {
    assert.deepStrictEqual(t32.cancelled, [e2!.id]);
    const [c5] = await db.select().from(clubs).where(eq(clubs.id, club[5]!));
    assert.strictEqual(c5!.Budget, budgetBefore! + 100);
    const refunds = await db
      .select()
      .from(transferLedger)
      .where(eq(transferLedger.Type, 'entry_refund'));
    assert.ok(refunds.some((r) => r.BuyerClubId === club[5]));
  });

  // First-to: a two-club league where the first to 2 wins takes it.
  const [race] = await db
    .insert(competitions)
    .values({
      Name: 'First to Two',
      Type: 'League',
      CompetitionCode: 'RACE',
      CompetitionID: 'RACE',
      Entry: { mode: 'open', minClubs: 2, maxClubs: null },
      Stages: [{ type: 'league', days: 30, rules: { minGamesToRank: 1 } }],
      WinCondition: { type: 'first-to', metric: 'wins', target: 2 },
      updatedAt: now,
    })
    .returning();
  const r1 = await createEdition(race!.id, {
    registrationOpensDay: 32,
    registrationClosesDay: 32,
    startDay: 33,
  });
  await publishEdition(r1.id);
  await tickEditions();
  await register(r1.id, club[6]!);
  await register(r1.id, club[7]!);
  await setDay(33);
  await tickEditions();
  let reached: string | null = null;
  for (let k = 0; k < 2; k++) {
    const [f] = await db
      .insert(fixtures)
      .values({
        SeasonId: r1.id,
        CompetitionId: race!.id,
        StageIndex: 0,
        HomeTeamId: club[7]!,
        AwayTeamId: club[6]!,
        Played: true,
        ScheduledDay: 34,
        updatedAt: now,
      })
      .returning();
    const [h, w] = await db
      .insert(clubMatchDetails)
      .values([
        { ClubId: club[7]!, FixtureId: f!.id, Goals: 1, updatedAt: now },
        { ClubId: club[6]!, FixtureId: f!.id, Goals: 0, updatedAt: now },
      ])
      .returning();
    await db
      .update(fixtures)
      .set({ HomeSideDetailsId: h!.id, AwaySideDetailsId: w!.id })
      .where(eq(fixtures.id, f!.id));
    const r = await applyResult(f!.id);
    if (r.status === 'applied' && r.firstToReachedBy)
      reached = r.firstToReachedBy;
  }
  await check(
    'reaching a first-to target finishes the edition early',
    async () => {
      assert.strictEqual(reached, club[7]);
      const summary = await finish(r1.id, { firstToWinner: reached! });
      assert.strictEqual(summary!.winnerId, club[7]);
      const [s] = await db.select().from(seasons).where(eq(seasons.id, r1.id));
      assert.strictEqual(s!.Status, 'finished');
    }
  );
}

async function main() {
  pureChecks();
  if (process.env.EDITION_CHECK_DB === '1') await dbChecks();
  else
    console.log(
      'database checks skipped (set EDITION_CHECK_DB=1 and use an empty scratch database)'
    );
  console.log(`${passed} checks passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
