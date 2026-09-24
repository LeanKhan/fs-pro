import 'dotenv/config';
import assert from 'assert';
import { eq, inArray } from 'drizzle-orm';
import { DrizzleDatabase } from '../db/drizzle';
import {
  calendars,
  clubMatchDetails,
  clubs,
  competitions,
  fixtures,
  levelHistory,
  rankingResults,
  rankings,
  seasons,
} from '../db/drizzle/schema';
import { DEFAULT_LEAGUE_RULES } from '../services/competitions/definition';
import {
  applyMatchToRow,
  eloAfter,
  rankRows,
  type RankingRow,
} from '../services/competitions/ranking';
import {
  applyResult,
  getStageTable,
} from '../services/competitions/ranking.service';

/**
 * Checks for open-play rankings (docs/OPEN-PLAY-COMPETITIONS-SPEC.md).
 * Pure checks always run. The database checks create their own clubs,
 * competition, edition and fixtures, and delete them afterwards; they only
 * run with RANKING_CHECK_DB=1 so they never touch a database by accident.
 *
 *   npx ts-node src/scripts/checkRankingService.ts
 *   RANKING_CHECK_DB=1 DATABASE_URL=... npx ts-node src/scripts/checkRankingService.ts
 */

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const zero = (id: string, extra: Partial<RankingRow> = {}): RankingRow => ({
  ClubId: id,
  Group: null,
  Played: 0,
  Wins: 0,
  Draws: 0,
  Losses: 0,
  GF: 0,
  GA: 0,
  GD: 0,
  Points: 0,
  CleanSheets: 0,
  Forfeits: 0,
  UnbeatenRun: 0,
  BestUnbeatenRun: 0,
  EloStart: 1500,
  ...extra,
});

function pureChecks() {
  console.log('pure');
  const rules = DEFAULT_LEAGUE_RULES;

  check('win, draw, loss update the row', () => {
    let r = applyMatchToRow(zero('a'), 2, 0, rules);
    r = applyMatchToRow(r, 1, 1, rules);
    r = applyMatchToRow(r, 0, 3, rules);
    assert.deepStrictEqual(
      [
        r.Played,
        r.Wins,
        r.Draws,
        r.Losses,
        r.GF,
        r.GA,
        r.GD,
        r.Points,
        r.CleanSheets,
      ],
      [3, 1, 1, 1, 3, 4, -1, 4, 1]
    );
    assert.strictEqual(r.UnbeatenRun, 0);
    assert.strictEqual(r.BestUnbeatenRun, 2);
  });

  check('forfeit counts', () => {
    const r = applyMatchToRow(zero('a'), 0, 3, rules, { forfeited: true });
    assert.strictEqual(r.Forfeits, 1);
    assert.strictEqual(r.Losses, 1);
  });

  check('Elo is zero-sum and favours upsets', () => {
    const even = eloAfter(1500, 1500, 1);
    assert.ok(
      Math.abs(even.home - 1512) < 1e-9 && Math.abs(even.away - 1488) < 1e-9
    );
    const upset = eloAfter(1300, 1700, 1);
    assert.ok(upset.home - 1300 > even.home - 1500);
    assert.ok(Math.abs(upset.home + upset.away - 3000) < 1e-9);
  });

  check('ppg orders ranked clubs, unranked go last', () => {
    const rows = [
      zero('a', { Played: 10, Points: 20 }),
      zero('b', { Played: 12, Points: 30 }),
      zero('c', { Played: 3, Points: 9 }),
    ];
    const ranked = rankRows(rows, rules);
    assert.deepStrictEqual(
      ranked.map((r) => [r.row.ClubId, r.rank, r.gamesNeeded]),
      [
        ['b', 1, 0],
        ['a', 2, 0],
        ['c', null, 7],
      ]
    );
  });

  check('tiebreakers then games played', () => {
    const rows = [
      zero('a', { Played: 10, Points: 20, GD: 3, GF: 10 }),
      zero('b', { Played: 10, Points: 20, GD: 5, GF: 8 }),
      zero('c', { Played: 10, Points: 20, GD: 5, GF: 12 }),
    ];
    assert.deepStrictEqual(
      rankRows(rows, rules).map((r) => r.row.ClubId),
      ['c', 'b', 'a']
    );
  });

  check('custom metric: goals scored', () => {
    const rows = [
      zero('a', { Played: 5, GF: 4 }),
      zero('b', { Played: 5, GF: 9 }),
    ];
    assert.strictEqual(
      rankRows(rows, { metric: 'gf', tiebreakers: [], minGamesToRank: 0 })[0]!
        .row.ClubId,
      'b'
    );
  });
}

async function dbChecks() {
  console.log('database');
  const db = DrizzleDatabase.getInstance().database;
  const tag = `RKCHK${Date.now().toString(36).toUpperCase()}`;
  const now = new Date();

  const createdCalendar =
    (await db.select().from(calendars).limit(1)).length === 0;
  if (createdCalendar) {
    await db
      .insert(calendars)
      .values({ CurrentDate: now, CurrentDay: 5, updatedAt: now });
  }

  const [home, away] = await db
    .insert(clubs)
    .values([
      { Name: `${tag} Home`, ClubCode: `${tag}H`, XP: 90, updatedAt: now },
      { Name: `${tag} Away`, ClubCode: `${tag}A`, XP: 0, updatedAt: now },
    ])
    .returning();
  const [competition] = await db
    .insert(competitions)
    .values({
      Name: `${tag} League`,
      Type: 'League',
      CompetitionCode: tag,
      CompetitionID: tag,
      NumberOfTeams: 0,
      NumberOfWeeks: 0,
      Stages: [{ type: 'league', days: 30, rules: { minGamesToRank: 1 } }],
      WinCondition: { type: 'first-to', metric: 'wins', target: 2 },
      Rewards: {
        prizeMoney: [],
        xp: [],
        xpPerMatch: { win: 30, draw: 15, loss: 5 },
      },
      updatedAt: now,
    })
    .returning();
  const [season] = await db
    .insert(seasons)
    .values({
      SeasonCode: `${tag}-E1`,
      Title: `${tag} E1`,
      StartDate: now,
      EndDate: now,
      CompetitionId: competition!.id,
      CompetitionCode: tag,
      EditionNumber: 1,
      Status: 'running',
      updatedAt: now,
    })
    .returning();

  const fixtureIds: string[] = [];
  async function playedFixture(
    homeGoals: number,
    awayGoals: number,
    played = true
  ) {
    const [f] = await db
      .insert(fixtures)
      .values({
        SeasonId: season!.id,
        CompetitionId: competition!.id,
        StageIndex: 0,
        HomeTeamId: home!.id,
        AwayTeamId: away!.id,
        Played: played,
        ChallengeStatus: played ? 'played' : 'accepted',
        ScheduledDay: 7,
        updatedAt: now,
      })
      .returning();
    const [h, a] = await db
      .insert(clubMatchDetails)
      .values([
        {
          ClubId: home!.id,
          FixtureId: f!.id,
          Goals: homeGoals,
          updatedAt: now,
        },
        {
          ClubId: away!.id,
          FixtureId: f!.id,
          Goals: awayGoals,
          updatedAt: now,
        },
      ])
      .returning();
    await db
      .update(fixtures)
      .set({ HomeSideDetailsId: h!.id, AwaySideDetailsId: a!.id })
      .where(eq(fixtures.id, f!.id));
    fixtureIds.push(f!.id);
    return f!.id;
  }

  try {
    const first = await playedFixture(2, 1);

    const r1 = await applyResult(first);
    check('applies a played competition fixture', () =>
      assert.strictEqual(r1.status, 'applied')
    );

    const r2 = await applyResult(first);
    check('second apply is a no-op', () =>
      assert.strictEqual(r2.status, 'already-applied')
    );

    const [h1] = await db.select().from(clubs).where(eq(clubs.id, home!.id));
    const [a1] = await db.select().from(clubs).where(eq(clubs.id, away!.id));
    check('Elo moved once', () => {
      assert.ok(Math.abs(h1!.Elo - 1512) < 1e-3, `home Elo ${h1!.Elo}`);
      assert.ok(Math.abs(a1!.Elo - 1488) < 1e-3, `away Elo ${a1!.Elo}`);
    });
    check('XP granted once (win 30, loss 5)', () => {
      assert.strictEqual(h1!.XP, 120);
      assert.strictEqual(a1!.XP, 5);
    });
    const history = await db
      .select()
      .from(levelHistory)
      .where(eq(levelHistory.ClubId, home!.id));
    check('crossing a Level threshold is logged', () => {
      assert.strictEqual(history.length, 1);
      assert.deepStrictEqual(
        [
          history[0]!.FromLevel,
          history[0]!.ToLevel,
          history[0]!.Source,
          history[0]!.Day,
        ],
        [0, 1, 'xp', 7]
      );
    });

    const unplayed = await playedFixture(0, 0, false);
    const r3 = await applyResult(unplayed);
    check('unplayed fixture is refused', () =>
      assert.strictEqual(r3.status, 'not-played')
    );

    const forfeit = await applyResult(unplayed, { forfeitedBy: away!.id });
    check('forfeit applies as 3-0 and reaches first-to 2 wins', () => {
      assert.strictEqual(forfeit.status, 'applied');
      assert.strictEqual(
        forfeit.status === 'applied' && forfeit.firstToReachedBy,
        home!.id
      );
    });

    const table = await getStageTable(season!.id, 0);
    const rows = table.groups[0]!.rows;
    check('stage table ranks both clubs', () => {
      assert.deepStrictEqual(
        rows.map((r) => [
          r.row.ClubId,
          r.rank,
          r.row.Played,
          r.row.GF,
          r.row.GA,
          r.row.Points,
        ]),
        [
          [home!.id, 1, 2, 5, 1, 6],
          [away!.id, 2, 2, 1, 5, 0],
        ]
      );
      assert.strictEqual(rows[1]!.row.Forfeits, 1);
    });

    const batch = await Promise.all(
      [1, 2, 3, 4, 5].map(() => playedFixture(1, 0))
    );
    const outcomes = await Promise.all(
      [...batch, ...batch].map((id) => applyResult(id))
    );
    const after = await getStageTable(season!.id, 0);
    check('concurrent results are neither lost nor doubled', () => {
      assert.strictEqual(
        outcomes.filter((o) => o.status === 'applied').length,
        5
      );
      assert.strictEqual(
        outcomes.filter((o) => o.status === 'already-applied').length,
        5
      );
      const homeRow = after.groups[0]!.rows.find(
        (r) => r.row.ClubId === home!.id
      )!.row;
      assert.strictEqual(homeRow.Played, 7);
      assert.strictEqual(homeRow.Wins, 7);
    });

    const friendly = await db
      .insert(fixtures)
      .values({
        HomeTeamId: home!.id,
        AwayTeamId: away!.id,
        Played: true,
        Type: 'friendly',
        updatedAt: now,
      })
      .returning();
    fixtureIds.push(friendly[0]!.id);
    const r4 = await applyResult(friendly[0]!.id);
    check('friendly is ignored', () =>
      assert.strictEqual(r4.status, 'not-competition')
    );
  } finally {
    await db
      .delete(rankingResults)
      .where(inArray(rankingResults.FixtureId, fixtureIds));
    await db.delete(rankings).where(eq(rankings.SeasonId, season!.id));
    await db
      .delete(levelHistory)
      .where(inArray(levelHistory.ClubId, [home!.id, away!.id]));
    await db
      .update(fixtures)
      .set({ HomeSideDetailsId: null, AwaySideDetailsId: null })
      .where(inArray(fixtures.id, fixtureIds));
    await db
      .delete(clubMatchDetails)
      .where(inArray(clubMatchDetails.FixtureId, fixtureIds));
    await db.delete(fixtures).where(inArray(fixtures.id, fixtureIds));
    await db.delete(seasons).where(eq(seasons.id, season!.id));
    await db.delete(competitions).where(eq(competitions.id, competition!.id));
    await db.delete(clubs).where(inArray(clubs.id, [home!.id, away!.id]));
    if (createdCalendar) await db.delete(calendars);
  }
}

async function main() {
  pureChecks();
  if (process.env.RANKING_CHECK_DB === '1') await dbChecks();
  else console.log('database checks skipped (set RANKING_CHECK_DB=1)');
  console.log(`${passed} checks passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
