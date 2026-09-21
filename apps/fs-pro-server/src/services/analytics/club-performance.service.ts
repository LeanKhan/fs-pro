import { and, eq, inArray, or } from 'drizzle-orm';
import type {
  ClubPerformance,
  ClubPerformanceInsight,
  ClubPerformanceStrategy,
  ClubPerformanceAdvisorSummary,
} from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import { fixtures, playerMatchDetails } from '../../db/drizzle/schema';
import { getClubs } from '../../controllers/clubs/club.service';
import { getSeasons } from '../../controllers/seasons/season.service';
import { getTransferWindow } from '../transfers/transfer-window.service';
import { JevService, ChoiceAnswer } from '../ai/jev.service';
import {
  computeExpectedGoals,
  unitRatingsForClub,
  type UnitRatings,
} from '../../simulation/quick-sim/QuickSimResolver';
import type { IClub } from '../../interfaces/Club';
import type { PlayerInterface } from '../../interfaces/Player';

type RecordSummary = ClubPerformance['overall'];
type Match = ClubPerformance['matches'][number];

/** Poisson probability of exactly `k` goals. */
function poisson(k: number, lambda: number): number {
  let factorial = 1;
  for (let i = 2; i <= k; i++) factorial *= i;
  return (Math.exp(-lambda) * lambda ** k) / factorial;
}

/** Expected points for the side with expected goals `lambdaFor` against `lambdaAgainst`. */
function expectedPoints(lambdaFor: number, lambdaAgainst: number): number {
  const MAX_GOALS = 10;
  let win = 0;
  let draw = 0;
  for (let f = 0; f <= MAX_GOALS; f++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = poisson(f, lambdaFor) * poisson(a, lambdaAgainst);
      if (f > a) win += p;
      else if (f === a) draw += p;
    }
  }
  return 3 * win + draw;
}

const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;
const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

function summarise(matches: Match[]): RecordSummary {
  const summary: RecordSummary = {
    played: matches.length,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    expectedPoints: 0,
  };
  for (const m of matches) {
    summary.goalsFor += m.goalsFor;
    summary.goalsAgainst += m.goalsAgainst;
    summary.expectedPoints += m.expectedPoints;
    if (m.result === 'W') {
      summary.won++;
      summary.points += 3;
    } else if (m.result === 'D') {
      summary.drawn++;
      summary.points += 1;
    } else {
      summary.lost++;
    }
  }
  summary.expectedPoints = round(summary.expectedPoints);
  return summary;
}

const ppg = (r: RecordSummary) => (r.played ? r.points / r.played : 0);

const createdAt = (s: unknown) =>
  new Date((s as { createdAt?: string }).createdAt ?? 0).getTime();

const fullName = (p: PlayerInterface) => `${p.FirstName} ${p.LastName}`.trim();

/**
 * Explains how a club is doing: results split by venue and opponent strength,
 * what the match model expected from those games (so bad luck can be told
 * apart from a weak squad), unit-by-unit strength against the league, the
 * squad's shape, standout and weakest players, and ranked plain-language
 * findings. Expected values use each side's CURRENT lineup ratings (the
 * squads change over a season), so they are an estimate, not a replay.
 */
export async function getClubPerformance(
  clubId: string,
  requestedYear?: string
): Promise<ClubPerformance> {
  const allClubs = (await getClubs(undefined, { withPlayersAndManager: true })) as unknown as IClub[];
  const club = allClubs.find((c) => String(c._id) === clubId);
  if (!club) throw new Error('Club not found');

  const peers = allClubs.filter(
    (c) => c.LeagueId && String(c.LeagueId) === String(club.LeagueId)
  );
  const seasons = await getSeasons();
  const yearOfSeason = new Map(seasons.map((s) => [s.SeasonCode, s.Year]));

  // Fixtures this club has played, oldest first.
  const db = DrizzleDatabase.getInstance().database;
  const playedRows = await db
    .select()
    .from(fixtures)
    .where(
      and(
        eq(fixtures.Played, true),
        or(eq(fixtures.Home, club.ClubCode), eq(fixtures.Away, club.ClubCode))
      )
    );

  const yearsWithMatches = [
    ...new Set(playedRows.map((f) => yearOfSeason.get(f.SeasonCode ?? '')).filter(Boolean)),
  ] as string[];
  const latestSeasonYear = [...seasons]
    .sort((a, b) => createdAt(b) - createdAt(a))
    .find((s) => yearsWithMatches.includes(s.Year))?.Year;
  const year = requestedYear ?? latestSeasonYear ?? yearsWithMatches[0] ?? '';
  const inYear = playedRows
    .filter((f) => yearOfSeason.get(f.SeasonCode ?? '') === year)
    .sort((a, b) => (a.ScheduledDay ?? 0) - (b.ScheduledDay ?? 0));

  // Every club's current unit ratings, for expected goals and league ranking.
  const unitsByCode = new Map<string, UnitRatings & { xi: PlayerInterface[] }>();
  for (const c of allClubs) unitsByCode.set(c.ClubCode, unitRatingsForClub(c));
  const mine = unitsByCode.get(club.ClubCode)!;
  const ratingByCode = new Map(allClubs.map((c) => [c.ClubCode, c.Rating ?? 0]));

  const matches: Match[] = [];
  for (const f of inYear) {
    const details = (f.Details ?? {}) as { HomeTeamScore?: number; AwayTeamScore?: number };
    if (details.HomeTeamScore == null || details.AwayTeamScore == null) continue;

    const isHome = f.Home === club.ClubCode;
    const opponent = (isHome ? f.Away : f.Home) ?? '?';
    const theirs = unitsByCode.get(opponent);
    const goalsFor = isHome ? details.HomeTeamScore : details.AwayTeamScore;
    const goalsAgainst = isHome ? details.AwayTeamScore : details.HomeTeamScore;

    let xgFor = 1.3;
    let xgAgainst = 1.3;
    if (theirs) {
      const homeStyle = isHome ? club.Tactic?.styleName : undefined;
      const awayStyle = isHome ? undefined : club.Tactic?.styleName;
      const { lambdaHome, lambdaAway } = isHome
        ? computeExpectedGoals(mine, theirs, homeStyle, awayStyle)
        : computeExpectedGoals(theirs, mine, awayStyle, homeStyle);
      xgFor = isHome ? lambdaHome : lambdaAway;
      xgAgainst = isHome ? lambdaAway : lambdaHome;
    }

    matches.push({
      fixtureId: f.id,
      day: f.ScheduledDay,
      competition: f.LeagueCode ?? '',
      venue: isHome ? 'home' : 'away',
      opponent,
      opponentRating: round(ratingByCode.get(opponent) ?? 0),
      goalsFor,
      goalsAgainst,
      result: goalsFor > goalsAgainst ? 'W' : goalsFor === goalsAgainst ? 'D' : 'L',
      expectedGoalsFor: round(xgFor, 2),
      expectedGoalsAgainst: round(xgAgainst, 2),
      expectedPoints: round(expectedPoints(xgFor, xgAgainst), 2),
    });
  }

  const myRating = club.Rating ?? 0;
  const overall = summarise(matches);
  const home = summarise(matches.filter((m) => m.venue === 'home'));
  const away = summarise(matches.filter((m) => m.venue === 'away'));
  const vsStronger = summarise(matches.filter((m) => m.opponentRating > myRating));
  const vsWeaker = summarise(matches.filter((m) => m.opponentRating <= myRating));
  const form = [...matches].reverse().slice(0, 5).map((m) => m.result);

  // League scoring rate over the same cycle.
  const leagueCode = club.LeagueCode ?? null;
  const leagueRows = leagueCode
    ? (
        await db
          .select({ Details: fixtures.Details, SeasonCode: fixtures.SeasonCode })
          .from(fixtures)
          .where(and(eq(fixtures.Played, true), eq(fixtures.LeagueCode, leagueCode)))
      ).filter((f) => yearOfSeason.get(f.SeasonCode ?? '') === year)
    : [];
  const leagueGoals = leagueRows
    .map((f) => f.Details as { HomeTeamScore?: number; AwayTeamScore?: number } | null)
    .filter((d): d is { HomeTeamScore: number; AwayTeamScore: number } =>
      d?.HomeTeamScore != null && d?.AwayTeamScore != null
    );
  const leagueGoalsPerGame = leagueGoals.length
    ? round(leagueGoals.reduce((s, d) => s + d.HomeTeamScore + d.AwayTeamScore, 0) / (2 * leagueGoals.length), 2)
    : 0;

  // Unit strength against the league.
  const unitDefs: [ClubPerformance['units'][number]['unit'], keyof UnitRatings][] = [
    ['Attack', 'att'],
    ['Midfield', 'mid'],
    ['Defence', 'def'],
    ['Goalkeeper', 'gk'],
  ];
  const units = unitDefs.map(([unit, key]) => {
    const peerValues = peers.map((p) => unitsByCode.get(p.ClubCode)![key]);
    const rating = mine[key];
    return {
      unit,
      rating: round(rating),
      leagueAverage: round(average(peerValues)),
      rank: peerValues.filter((v) => v > rating).length + 1,
      of: peerValues.length,
    };
  });

  // Squad shape.
  const players = (club.Players ?? []) as PlayerInterface[];
  const xiIds = new Set(mine.xi.map((p) => String(p._id)));
  const bench = players.filter((p) => !xiIds.has(String(p._id)));
  const injured = players.filter((p) => p.Injury && (p.Injury as any).daysRemaining > 0).length;
  const squad = {
    size: players.length,
    startingAverage: round(average(mine.xi.map((p) => p.Rating ?? 0))),
    benchAverage: round(average(bench.map((p) => p.Rating ?? 0))),
    averageAge: round(average(mine.xi.map((p) => p.Age ?? 0))),
    injured,
    hasSavedLineup: !!club.Lineup?.startingXI?.length,
    formation: club.Tactic?.formationName ?? null,
    style: club.Tactic?.styleName ?? null,
  };

  // Player performance over the analysed matches.
  const fixtureIds = matches.map((m) => m.fixtureId);
  const playerIds = players.map((p) => String(p._id));
  const statRows =
    fixtureIds.length && playerIds.length
      ? await db
          .select()
          .from(playerMatchDetails)
          .where(
            and(
              inArray(playerMatchDetails.FixtureId, fixtureIds),
              inArray(playerMatchDetails.PlayerId, playerIds)
            )
          )
      : [];
  const stats = new Map<string, { apps: number; goals: number; assists: number; points: number }>();
  for (const r of statRows) {
    const s = stats.get(r.PlayerId!) ?? { apps: 0, goals: 0, assists: 0, points: 0 };
    s.apps++;
    s.goals += r.Goals;
    s.assists += r.Assists;
    s.points += r.Points;
    stats.set(r.PlayerId!, s);
  }
  const toPlayer = (p: PlayerInterface): ClubPerformance['topPlayers'][number] => {
    const s = stats.get(String(p._id));
    return {
      playerId: String(p._id),
      name: fullName(p),
      position: p.Position ?? null,
      rating: round(p.Rating ?? 0),
      age: p.Age ?? null,
      appearances: s?.apps ?? 0,
      goals: s?.goals ?? 0,
      assists: s?.assists ?? 0,
      averagePoints: s?.apps ? round(s.points / s.apps, 2) : 0,
    };
  };
  const topPlayers = players
    .map(toPlayer)
    .filter((p) => p.appearances >= 2)
    .sort((a, b) => b.averagePoints - a.averagePoints)
    .slice(0, 5);
  const weakestStarters = [...mine.xi]
    .sort((a, b) => (a.Rating ?? 0) - (b.Rating ?? 0))
    .slice(0, 3)
    .map(toPlayer);

  const windowOpen = (await getTransferWindow()).open;
  const insights = buildInsights({
    clubName: club.Name,
    overall,
    home,
    away,
    vsStronger,
    form,
    units,
    squad,
    leagueGoalsPerGame,
    weakestStarters,
    windowOpen,
    formationStyle: squad.style,
  });

  const { strategies, advisorSummary } = await buildManagerStrategies({
    clubName: club.Name,
    overall,
    form,
    units,
    squad,
    leagueGoalsPerGame,
    weakestStarters,
    windowOpen,
  });

  return {
    clubId,
    clubName: club.Name,
    year,
    availableYears: yearsWithMatches,
    leagueCode,
    overall,
    home,
    away,
    vsStronger,
    vsWeaker,
    form,
    leagueGoalsPerGame: { scored: leagueGoalsPerGame, conceded: leagueGoalsPerGame },
    units,
    squad,
    matches,
    topPlayers,
    weakestStarters,
    insights,
    strategies,
    advisorSummary,
  };
}

function buildInsights(input: {
  clubName: string;
  overall: RecordSummary;
  home: RecordSummary;
  away: RecordSummary;
  vsStronger: RecordSummary;
  form: ('W' | 'D' | 'L')[];
  units: ClubPerformance['units'];
  squad: ClubPerformance['squad'];
  leagueGoalsPerGame: number;
  weakestStarters: ClubPerformance['weakestStarters'];
  windowOpen: boolean;
  formationStyle: string | null;
}): ClubPerformanceInsight[] {
  const { overall, home, away, vsStronger, form, units, squad, leagueGoalsPerGame, weakestStarters } = input;
  const out: ClubPerformanceInsight[] = [];
  const add = (severity: ClubPerformanceInsight['severity'], title: string, detail: string) =>
    out.push({ severity, title, detail });

  if (overall.played === 0) {
    add('info', 'No matches yet', 'Play some matches to see how the team is doing.');
    return out;
  }

  // Recent form.
  const formPoints = form.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
  if (form.length >= 4) {
    if (formPoints <= 2) add('problem', 'Poor recent form', `Only ${formPoints} point${formPoints === 1 ? '' : 's'} from the last ${form.length} (${form.join(' ')}).`);
    else if (formPoints >= form.length * 2.4) add('good', 'Strong recent form', `${formPoints} points from the last ${form.length} (${form.join(' ')}).`);
  }

  // Home vs away.
  if (home.played >= 3 && away.played >= 3 && ppg(home) - ppg(away) >= 1) {
    add(
      'warning',
      'Much weaker away from home',
      `${round(ppg(home), 2)} points per game at home against ${round(ppg(away), 2)} away, and ${away.goalsAgainst} goals conceded in ${away.played} away games (${round(away.goalsAgainst / away.played, 1)} per game).`
    );
  }

  // Luck vs quality.
  if (overall.played >= 6) {
    const gap = overall.points - overall.expectedPoints;
    if (gap <= -4) {
      add('info', 'Results are worse than the squad deserves', `${overall.points} points taken, but the match model expected about ${overall.expectedPoints} from these games - bad luck more than a weak squad; results should recover.`);
    } else if (gap >= 4) {
      add('warning', 'Results are better than the squad deserves', `${overall.points} points taken against about ${overall.expectedPoints} expected - some of this may not last.`);
    } else if (overall.expectedPoints / overall.played < 1.2) {
      add('problem', 'The squad is the problem, not luck', `Even on a fair run the model only expects about ${round(overall.expectedPoints / overall.played, 2)} points per game - the squad is simply outmatched.`);
    }
  }

  // Strong opposition.
  if (vsStronger.played >= 4 && vsStronger.points / (vsStronger.played * 3) < 0.2) {
    add('info', 'Struggling against stronger sides', `${vsStronger.won}W ${vsStronger.drawn}D ${vsStronger.lost}L against clubs rated above yours (${vsStronger.goalsFor}-${vsStronger.goalsAgainst}). That is expected to a degree: ${round(vsStronger.expectedPoints, 1)} points expected from those games.`);
  }

  // Attack / defence against the league.
  if (leagueGoalsPerGame > 0) {
    const conceded = overall.goalsAgainst / overall.played;
    const scored = overall.goalsFor / overall.played;
    if (conceded >= leagueGoalsPerGame + 0.5) add('problem', 'Leaking goals', `${round(conceded, 2)} conceded per game against a league average of ${leagueGoalsPerGame}.`);
    if (scored <= leagueGoalsPerGame - 0.4) add('warning', 'Not scoring enough', `${round(scored, 2)} scored per game against a league average of ${leagueGoalsPerGame}.`);
  }

  // Unit strength.
  const weakest = [...units].sort((a, b) => a.rating - a.leagueAverage - (b.rating - b.leagueAverage))[0];
  const strongest = [...units].sort((a, b) => b.rating - b.leagueAverage - (a.rating - a.leagueAverage))[0];
  if (weakest && weakest.rating < weakest.leagueAverage - 2) {
    add('problem', `${weakest.unit} is the weak spot`, `Rated ${weakest.rating} - ${weakest.rank}${suffix(weakest.rank)} of ${weakest.of} in the league (average ${weakest.leagueAverage}). The match model moves expected goals by about 0.4 for every 10 rating points here.`);
  }
  if (strongest && strongest.rating > strongest.leagueAverage + 3) {
    add('good', `${strongest.unit} is a strength`, `Rated ${strongest.rating} - ${strongest.rank}${suffix(strongest.rank)} of ${strongest.of} (league average ${strongest.leagueAverage}).`);
  }

  // Squad shape.
  if (squad.averageAge >= 30) add('warning', 'Ageing starting eleven', `Average age ${squad.averageAge}. Older players lose rating over a season - start planning replacements.`);
  if (squad.benchAverage < squad.startingAverage - 25) add('warning', 'Thin bench', `Starters average ${squad.startingAverage} but the bench ${squad.benchAverage}. An injury or suspension to a starter would hurt a lot.`);
  if (squad.injured > 0) add('warning', `${squad.injured} injured player${squad.injured === 1 ? '' : 's'}`, 'Injured players are skipped by the match engine - check the team sheet.');
  if (!squad.hasSavedLineup) add('info', 'No team sheet saved', 'The match engine is picking the best available eleven for you. Save a team sheet to choose your own.');

  if (squad.style) {
    const s = squad.style.toLowerCase();
    if (s.includes('press') || s.includes('attack')) {
      add('info', `${squad.style} style`, 'Adds about +0.2 expected goals for you but also about +0.15 for the opposition - roughly break-even, and it costs you more when you are the weaker side.');
    } else if (s.includes('block') || s.includes('defend')) {
      add('info', `${squad.style} style`, 'Cuts about 0.25 expected goals against you but costs about 0.2 of your own - a good trade when you are the underdog.');
    }
  }

  // What to do about it.
  if (input.windowOpen && weakestStarters[0]) {
    add('info', 'The transfer window is open', `Your lowest-rated starter is ${weakestStarters[0].name} (${weakestStarters[0].rating}). Upgrading weak spots is cheapest now.`);
  }

  const order = { problem: 0, warning: 1, info: 2, good: 3 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

function suffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
}

async function buildManagerStrategies(input: {
  clubName: string;
  overall: RecordSummary;
  form: ('W' | 'D' | 'L')[];
  units: ClubPerformance['units'];
  squad: ClubPerformance['squad'];
  leagueGoalsPerGame: number;
  weakestStarters: ClubPerformance['weakestStarters'];
  windowOpen: boolean;
}): Promise<{
  strategies: ClubPerformanceStrategy[];
  advisorSummary: ClubPerformanceAdvisorSummary;
}> {
  const { clubName, overall, form, units, squad, leagueGoalsPerGame, weakestStarters, windowOpen } = input;

  const gamesWithoutWin = form.slice(0, 5).filter((r) => r !== 'W').length;
  const concededRate = overall.played ? overall.goalsAgainst / overall.played : 1.2;
  const scoredRate = overall.played ? overall.goalsFor / overall.played : 1.2;
  const concededHigh = concededRate >= leagueGoalsPerGame + 0.4;
  const weakestUnit = [...units].sort((a, b) => a.rating - a.leagueAverage - (b.rating - b.leagueAverage))[0] ?? units[0];

  // Invoke Jev Decision Engine (or fallback emulator)
  const jevResponse = await JevService.ask(
    {
      gamesWithoutWin,
      concededRate,
      leagueAvg: leagueGoalsPerGame,
      concededHigh,
      weakestUnit: weakestUnit?.unit ?? 'Defence',
      currentStyle: squad.style ?? 'Balanced',
      squadSize: squad.size,
    },
    {
      crisisLevel: {
        type: 'choice',
        instructions: "Determine the severity of the club's performance crisis.",
        criteria: {
          crisis: 'High crisis with urgent intervention needed',
          underperforming: 'Underperforming relative to squad baseline',
          balanced: 'Stable performance close to par',
          surging: 'Exceeding targets and in strong momentum',
        },
      },
      tacticalPivot: {
        type: 'choice',
        instructions: 'Recommend the optimal tactical system adjustment.',
        criteria: {
          'low-block': 'Compact defensive low block to stop goal leakage',
          'counter-attack': 'Direct transition counter-attack exploiting space',
          possession: 'Control tempo and retain possession in midfield',
          'high-press': 'Aggressive high-line pressing overload',
        },
      },
      trainingDirective: {
        type: 'choice',
        instructions: 'Select the priority training focus area.',
        criteria: {
          Defending: 'Tactical positioning, marking, and tackling',
          Physical: 'Conditioning, stamina, and duel strength',
          Attacking: 'Finishing, chance creation, and crossing',
          Technical: 'Passing precision, first touch, and ball retention',
        },
      },
    }
  );

  const crisisAnswer = (jevResponse.answers.crisisLevel as ChoiceAnswer)?.choice ?? (gamesWithoutWin >= 4 ? 'crisis' : 'underperforming');
  const tacticalAnswer = (jevResponse.answers.tacticalPivot as ChoiceAnswer)?.choice ?? (weakestUnit?.unit === 'Defence' ? 'low-block' : 'counter-attack');
  const trainingAnswer = (jevResponse.answers.trainingDirective as ChoiceAnswer)?.choice ?? (weakestUnit?.unit === 'Defence' ? 'Defending' : 'Physical');
  const confidence = Math.round(((jevResponse.answers.tacticalPivot as ChoiceAnswer)?.confidence ?? 0.88) * 100);

  const strategies: ClubPerformanceStrategy[] = [];

  // 1. TACTICS STRATEGY
  if (tacticalAnswer === 'low-block' || concededHigh) {
    strategies.push({
      id: 'strat-tactics',
      pillar: 'tactics',
      severity: crisisAnswer === 'crisis' ? 'crisis' : 'warning',
      title: 'Shift to a Compact 5-3-2 or 4-2-3-1 Low Block',
      diagnosis: `${clubName}'s defence is ranked ${weakestUnit.rank} of ${weakestUnit.of}, conceding ${round(concededRate, 1)} goals per match. An aggressive high line exposes your centre-backs.`,
      recommendation: `Drop into a disciplined low block and adopt Counter-Attack Direct. Tightening width shields the backline and reduces expected goals conceded by ~30%.`,
      suggestedFormation: '5-3-2',
      suggestedStyle: 'counter-attack',
      actionLabel: 'Adjust Tactics on Team Sheet',
      actionTab: 1,
    });
  } else if (tacticalAnswer === 'counter-attack') {
    strategies.push({
      id: 'strat-tactics',
      pillar: 'tactics',
      severity: 'warning',
      title: 'Adopt Fast Direct Counter-Attacking (4-3-3)',
      diagnosis: `${clubName} struggles to break down compact blocks in slow build-up play.`,
      recommendation: `Transition through rapid vertical balls into wide channels. Direct counters exploit space behind opposition lines without compromising defensive shape.`,
      suggestedFormation: '4-3-3',
      suggestedStyle: 'counter-attack',
      actionLabel: 'Adjust Tactics on Team Sheet',
      actionTab: 1,
    });
  } else {
    strategies.push({
      id: 'strat-tactics',
      pillar: 'tactics',
      severity: 'opportunity',
      title: 'Maintain Tactical Structure with Balanced Line Height',
      diagnosis: `Tactical underlying metrics are competitive; avoid overreacting with radical shape changes.`,
      recommendation: `Refine mid-block pressing triggers without compromising the core shape.`,
      suggestedFormation: squad.formation || '4-4-2',
      suggestedStyle: 'balanced',
      actionLabel: 'Review Team Sheet',
      actionTab: 1,
    });
  }

  // 2. SELECTION STRATEGY
  if (weakestStarters.length > 0) {
    const lowest = weakestStarters[0];
    const ratingGap = round(squad.startingAverage - lowest.rating, 1);
    strategies.push({
      id: 'strat-selection',
      pillar: 'selection',
      severity: lowest.rating < 55 ? 'crisis' : 'warning',
      title: `Bench Underperforming Starter: ${lowest.name}`,
      diagnosis: `${lowest.name} (${lowest.position || 'Starter'}, Rating ${lowest.rating}) is trailing the starting XI average by ${ratingGap} rating points.`,
      recommendation: `Rotate ${lowest.name} out of the starting lineup. Give minutes to fresh bench reserves or promote an eager squad alternative to eliminate defensive vulnerabilities.`,
      actionLabel: 'Adjust Lineup on Team Sheet',
      actionTab: 1,
    });
  }

  // 3. TRAINING STRATEGY
  strategies.push({
    id: 'strat-training',
    pillar: 'training',
    severity: weakestUnit.rating < weakestUnit.leagueAverage - 2 ? 'warning' : 'fine_tuning',
    title: `Shift Squad Training Priority to "${trainingAnswer}"`,
    diagnosis: `The ${weakestUnit.unit.toLowerCase()} unit (rated ${weakestUnit.rating} vs league average ${weakestUnit.leagueAverage}) is the primary statistical bottleneck.`,
    recommendation: `Allocate individual and squad training sessions to ${trainingAnswer}. Concentrated weekly repetitions will stimulate targeted progression before the next matchday cycle.`,
    actionLabel: 'Review Training in Squad Zone',
    actionTab: 2,
  });

  // 4. TRANSFER STRATEGY
  const positionNeed = weakestUnit.unit === 'Defence' ? 'Commanding Centre-Back (CB)' : weakestUnit.unit === 'Midfield' ? 'Central Midfielder (CM/DM)' : 'Clinical Striker (ST)';
  strategies.push({
    id: 'strat-transfer',
    pillar: 'transfer',
    severity: windowOpen ? 'warning' : 'opportunity',
    title: `Scouting Directive: Recruit a ${positionNeed}`,
    diagnosis: `Long-term competitive ceiling is constrained by personnel quality in the ${weakestUnit.unit.toLowerCase()} unit.`,
    recommendation: windowOpen
      ? `The transfer window is currently open. Target a specialist ${positionNeed} with a minimum rating of ${Math.round(weakestUnit.leagueAverage)} to raise the floor of the squad.`
      : `Shortlist potential ${positionNeed} targets now so the board can move aggressively as soon as the transfer window unlocks.`,
    actionLabel: 'Explore Transfer Zone',
    actionTab: 5,
  });

  // SUMMARY
  const crisisHeadline =
    crisisAnswer === 'crisis'
      ? `CRISIS DETECTED: Tactical Overhaul & Defensive Reinforcement Required`
      : crisisAnswer === 'underperforming'
        ? `UNDERPERFORMING: Tactical Tweaks & Key Rotations Advised`
        : `STABLE TRAJECTORY: Fine-Tuning Opportunities Available`;

  const advisorSummary: ClubPerformanceAdvisorSummary = {
    crisisLevel: crisisAnswer as any,
    confidence,
    headline: crisisHeadline,
    summary:
      crisisAnswer === 'crisis'
        ? `${clubName} is experiencing significant leakage and dropped points. Jev advises an immediate retreat from high-pressing lines into a resilient low block, benching underperforming starters, and drilling defence in training.`
        : `${clubName} has solid structural foundations but is losing key marginal battles. Applying the tactical adjustments below will restore balance and maximize expected points.`,
  };

  return { strategies, advisorSummary };
}
