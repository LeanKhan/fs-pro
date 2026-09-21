import { JevService, ChoiceAnswer } from '../ai/jev.service';
import type { ClubFacts, FixtureFacts } from './story-facts.service';

export type StoryAngle =
  | 'top_clash'
  | 'title_race'
  | 'relegation_fight'
  | 'winning_streak'
  | 'losing_streak'
  | 'unbeaten_run'
  | 'star_injury'
  | 'hot_scorer'
  | 'goal_drought'
  | 'leaky_defence'
  | 'rematch'
  | 'routine';

type Side = 'home' | 'away' | 'both';

export interface Candidate {
  id: string; // `${angle}:${side}`
  angle: StoryAngle;
  side: Side;
  score: number;
  /** One sentence with the real numbers - also what Jev reads. */
  blurb: string;
}

export interface MatchStory {
  angle: StoryAngle;
  side: Side;
  source: 'local' | 'jev';
  /** 1-5, feeds the card's hype badge. */
  intensity: number;
  summary: string;
  bullets: string[];
  fullStory: string;
  press: { title: string; summary: string; bullets: string[]; fullStory: string };
}

/** A clear leader among the candidates is chosen locally - Jev is only asked
 * when the top angles are close, and each answer is cached per fixture. */
const CLEAR_WINNER_MARGIN = 12;
const MIN_JEV_SCORE = 30;
const MAX_JEV_CANDIDATES = 3;
const CACHE_LIMIT = 300;
const jevCache = new Map<string, string>();

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable per-seed choice: same fixture always reads the same, different
 * fixtures read differently. */
export function pick<T>(seed: string, salt: string, items: T[]): T {
  return items[hash(`${seed}:${salt}`) % items.length];
}

export const ord = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** "12th, 10 pts" - or nothing claimed when the club isn't in the table. */
const standing = (c: ClubFacts) =>
  c.position !== null ? `${ord(c.position)}, ${c.points} pts` : 'not yet ranked';

const formString = (c: ClubFacts) => (c.form.length ? c.form.join('') : 'no games yet');

function candidatesFor(facts: FixtureFacts): Candidate[] {
  const out: Candidate[] = [];
  const { home, away } = facts;
  const sides: [Exclude<Side, 'both'>, ClubFacts][] = [
    ['home', home],
    ['away', away],
  ];
  const push = (angle: StoryAngle, side: Side, score: number, blurb: string) =>
    out.push({ id: `${angle}:${side}`, angle, side, score, blurb });

  const top = (c: ClubFacts) => c.position !== null && c.position <= 3 && c.played >= 3;
  if (top(home) && top(away)) {
    push('top_clash', 'both', 90, `${home.name} (${ord(home.position!)}) host ${away.name} (${ord(away.position!)}) in a top-three clash.`);
  }
  const bottom = (c: ClubFacts) =>
    c.position !== null && c.totalTeams >= 6 && c.position > c.totalTeams - 3 && c.played >= 3;
  if (bottom(home) && bottom(away)) {
    push('relegation_fight', 'both', 85, `Two clubs in the drop zone meet: ${home.name} (${ord(home.position!)}) v ${away.name} (${ord(away.position!)}).`);
  }

  for (const [side, c] of sides) {
    if (c.position !== null && c.position <= 2 && c.played >= 3) {
      push('title_race', side, c.position === 1 ? 70 : 62, `${c.name} are ${ord(c.position)} on ${c.points} points.`);
    }
    if (bottom(c) && !(bottom(home) && bottom(away))) {
      push('relegation_fight', side, 55, `${c.name} sit ${ord(c.position!)} of ${c.totalTeams} in the table.`);
    }
    if (c.streak?.type === 'W' && c.streak.length >= 3) {
      push('winning_streak', side, Math.min(80, 45 + c.streak.length * 5), `${c.name} have won ${c.streak.length} in a row.`);
    } else if (c.unbeaten >= 5) {
      push('unbeaten_run', side, Math.min(70, 40 + c.unbeaten * 3), `${c.name} are unbeaten in ${c.unbeaten}.`);
    }
    if (c.streak?.type === 'L' && c.streak.length >= 3) {
      push('losing_streak', side, Math.min(85, 50 + c.streak.length * 5), `${c.name} have lost ${c.streak.length} straight.`);
    }
    if (c.injured[0] && c.injured[0].rating >= 70) {
      push('star_injury', side, 50 + Math.min(20, c.injured[0].rating - 70), `${c.name} are without ${c.injured[0].name} (${c.injured[0].rating}) for ${c.injured[0].days} day(s).`);
    }
    if (c.topScorer && c.topScorer.goals >= 4) {
      push('hot_scorer', side, 40 + c.topScorer.goals * 3, `${c.topScorer.name} has ${c.topScorer.goals} goals for ${c.name}.`);
    }
    if (c.form.length >= 4 && c.goalsForLast5 <= 2) {
      push('goal_drought', side, 48, `${c.name} have scored ${c.goalsForLast5} in their last ${c.form.length}.`);
    }
    if (c.form.length >= 4 && c.goalsAgainstLast5 >= 10) {
      push('leaky_defence', side, 48, `${c.name} have conceded ${c.goalsAgainstLast5} in their last ${c.form.length}.`);
    }
  }
  if (facts.lastMeeting) {
    const m = facts.lastMeeting;
    const margin = Math.abs(m.homeGoals - m.awayGoals);
    push('rematch', 'both', 38 + (margin >= 3 ? 15 : 0), `They last met ${m.homeGoals}-${m.awayGoals} (${m.homeCode} at home).`);
  }
  push('routine', 'both', 10, 'A routine league fixture.');

  return out.sort((a, b) => b.score - a.score);
}

async function choose(fixtureId: string, facts: FixtureFacts, ranked: Candidate[]): Promise<{ picked: Candidate; source: 'local' | 'jev' }> {
  const [first, second] = ranked;
  const close =
    second && second.score >= MIN_JEV_SCORE && first.score - second.score < CLEAR_WINNER_MARGIN;
  if (!close) return { picked: first, source: 'local' };

  const contenders = ranked.filter((c) => c.score >= MIN_JEV_SCORE).slice(0, MAX_JEV_CANDIDATES);
  const cacheKey = `${fixtureId}:${contenders.map((c) => c.id).join('|')}`;
  const cached = jevCache.get(cacheKey);
  const byId = new Map(contenders.map((c) => [c.id, c]));
  if (cached && byId.has(cached)) return { picked: byId.get(cached)!, source: 'jev' };

  const criteria: Record<string, string> = {};
  contenders.forEach((c) => (criteria[c.id] = c.blurb));

  const response = await JevService.ask(
    {
      home: facts.home.name,
      away: facts.away.name,
      candidates: contenders.map((c) => ({ approach: c.id, score: c.score, outOfPosition: 0 })),
    },
    {
      storyAngle: {
        type: 'choice',
        instructions:
          'Which single story is the most compelling lead for a preview of this match?',
        criteria,
      },
    }
  );
  const answer = response.answers.storyAngle as ChoiceAnswer | undefined;
  const chosen = answer?.choice && byId.has(answer.choice) ? byId.get(answer.choice)! : first;

  if (jevCache.size >= CACHE_LIMIT) jevCache.delete(jevCache.keys().next().value as string);
  jevCache.set(cacheKey, chosen.id);
  return { picked: chosen, source: response.source === 'jev' ? 'jev' : 'local' };
}

// ---------------------------------------------------------------------------
// Copy: several phrasings per angle, filled with real numbers.
// ---------------------------------------------------------------------------

interface Copy {
  summary: string[];
  bullets: string[][];
  quote: string[];
}

function subjectOf(facts: FixtureFacts, side: Side): { s: ClubFacts; o: ClubFacts } {
  return side === 'away' ? { s: facts.away, o: facts.home } : { s: facts.home, o: facts.away };
}

function copyFor(angle: StoryAngle, facts: FixtureFacts, side: Side): Copy {
  const { s, o } = subjectOf(facts, side);
  const H = facts.home;
  const A = facts.away;
  switch (angle) {
    case 'top_clash':
      return {
        summary: [
          `${H.name} (${ord(H.position!)}, ${H.points} pts) meet ${A.name} (${ord(A.position!)}, ${A.points} pts) with the top of the table on the line.`,
          `A genuine early-season measuring stick: ${H.name} and ${A.name} both sit in the top three.`,
          `Third-place or better is all either side has known this year, and only one of ${H.name} and ${A.name} leaves with the momentum.`,
        ],
        bullets: [
          [`Table: ${H.name} ${ord(H.position!)} (${H.points}), ${A.name} ${ord(A.position!)} (${A.points}).`, `Form: ${H.code} ${formString(H)}, ${A.code} ${formString(A)}.`],
          [`${Math.abs(H.points - A.points)} point(s) separate the sides.`, `${H.name} last five: ${H.goalsForLast5} scored, ${H.goalsAgainstLast5} conceded.`],
        ],
        quote: [`Everyone knows what this means. We take it one game at a time, but we know where we want to be.`, `Top-of-the-table games are decided by small moments. We have to be ready for them.`],
      };
    case 'title_race':
      return {
        summary: [
          `${s.name} arrive ${ord(s.position!)} on ${s.points} points and eager to stay in the title conversation.`,
          `${s.name}'s ${s.form.length ? `${formString(s)} run` : 'start'} has them ${ord(s.position!)}; ${o.name} are the next obstacle.`,
          `With ${s.points} points from ${s.played}, ${s.name} are firmly in the race and will not want to slip against ${o.name}.`,
        ],
        bullets: [
          [`${s.name}: ${ord(s.position!)} on ${s.points} points.`, s.gapToBelow !== null ? `${s.gapToBelow} point(s) clear of the club below.` : `Form: ${formString(s)}.`],
          [`Last five: ${formString(s)}.`, `${s.goalsForLast5} scored, ${s.goalsAgainstLast5} conceded in that spell.`],
        ],
        quote: [`We're not looking at the table, we're looking at the next ninety minutes against ${o.name}.`, `Good position, but it means nothing if we don't turn up on Saturday.`],
      };
    case 'relegation_fight':
      return {
        summary: [
          side === 'both'
            ? `${H.name} (${ord(H.position!)}) and ${A.name} (${ord(A.position!)}) are both in the bottom three, and this could shape the season.`
            : `${s.name} sit ${ord(s.position!)} of ${s.totalTeams} and desperately need points against ${o.name}.`,
          side === 'both'
            ? `A six-pointer: the loser will be left looking over their shoulder.`
            : s.gapToAbove
              ? `${s.name} are ${s.gapToAbove} point(s) behind the club above them and cannot afford another slip.`
              : `${s.name} are stuck in the bottom three and cannot afford another slip.`,
        ],
        bullets: [
          [`${H.name}: ${standing(H)}. ${A.name}: ${standing(A)}.`],
          [`${s.name} form: ${formString(s)}.`, `${s.goalsAgainstLast5} conceded in their last ${s.form.length}.`],
        ],
        quote: [`Nobody is panicking. We need points, and we know it, and we'll fight for every one.`, `It's a big game, but we've been in these situations. We stay calm and do the basics well.`],
      };
    case 'winning_streak':
      return {
        summary: [
          `${s.name} come in flying: ${s.streak!.length} straight wins, and ${o.name} are next in line.`,
          `${s.streak!.length} wins on the bounce have ${s.name} confident, but ${o.name} will try to end it.`,
          `Momentum is with ${s.name}, whose last ${s.streak!.length} league games all ended in victory.`,
        ],
        bullets: [
          [`${s.streak!.length} consecutive wins for ${s.name}.`, `${s.goalsForLast5} goals scored in their last ${s.form.length}.`],
          [`Form: ${formString(s)}.`, s.position !== null ? `Currently ${ord(s.position)}.` : `Table position pending.`],
        ],
        quote: [`The confidence is there, but streaks end if you stop working. We stay hungry.`, `The lads are enjoying it, and we want to keep the run going.`],
      };
    case 'losing_streak':
      return {
        summary: [
          `${s.name} have lost ${s.streak!.length} in a row and face ${o.name} under real pressure.`,
          `A run of ${s.streak!.length} defeats has ${s.name} looking for an answer against ${o.name}.`,
          `${s.name}'s slide is ${s.streak!.length} games long. ${o.name} could deepen it.`,
        ],
        bullets: [
          [`${s.streak!.length} straight defeats for ${s.name}.`, `${s.goalsAgainstLast5} conceded in their last ${s.form.length}.`],
          [`Form: ${formString(s)}.`, s.position !== null ? `Now ${ord(s.position)}.` : `Table position pending.`],
        ],
        quote: [`It's been tough and I won't hide from that. We have to stop the rot this weekend.`, `Confidence is low, so we go back to basics and make the small things right.`],
      };
    case 'unbeaten_run':
      return {
        summary: [
          `${s.name} are unbeaten in ${s.unbeaten} and will fancy their chances against ${o.name}.`,
          `${s.unbeaten} games without defeat: ${s.name} are hard to beat, and ${o.name} know it.`,
        ],
        bullets: [[`Unbeaten in ${s.unbeaten} for ${s.name}.`, `Form: ${formString(s)}.`], [`${s.goalsForLast5} scored, ${s.goalsAgainstLast5} conceded in the last ${s.form.length}.`]],
        quote: [`We're a hard side to beat right now. We want to keep it that way.`, `Not losing is a good habit. Winning is a better one.`],
      };
    case 'star_injury': {
      const inj = s.injured[0];
      return {
        summary: [
          `${s.name} will be without ${inj.name} (rated ${inj.rating}) against ${o.name}, a blow they'll have to absorb.`,
          `The big talking point: ${inj.name} is out for ${s.name} with ${inj.days} day(s) to go.`,
          `${s.name} hope to cope without ${inj.name}, one of their best players, when ${o.name} visit.`,
        ],
        bullets: [
          [`${inj.name} (${inj.rating}) out for ${inj.days} more day(s).`, s.injured[1] ? `Also out: ${s.injured[1].name} (${s.injured[1].rating}).` : `Form: ${formString(s)}.`],
          [`${s.name} form: ${formString(s)}.`],
        ],
        quote: [`Losing ${inj.name} hurts, no question. Somebody gets a chance and we need them to take it.`, `Injuries are part of it. The squad is there to cover moments like this.`],
      };
    }
    case 'hot_scorer':
      return {
        summary: [
          `${s.topScorer!.name} has ${s.topScorer!.goals} goals for ${s.name} and ${o.name}'s defence has been warned.`,
          `All eyes on ${s.topScorer!.name}, whose ${s.topScorer!.goals} goals have carried ${s.name} this season.`,
        ],
        bullets: [[`${s.topScorer!.name}: ${s.topScorer!.goals} goals this season.`, `${s.name} form: ${formString(s)}.`], [`${o.name} conceded ${o.goalsAgainstLast5} in their last ${o.form.length}.`]],
        quote: [`${s.topScorer!.name} is in great form, but this is a team game and everyone contributes.`, `Goals come from the whole group, though it helps when ${s.topScorer!.name} is on it.`],
      };
    case 'goal_drought':
      return {
        summary: [
          `${s.name} have scored just ${s.goalsForLast5} in their last ${s.form.length} and need to find the net against ${o.name}.`,
          `Goals are the problem for ${s.name}: ${s.goalsForLast5} in ${s.form.length} games.`,
        ],
        bullets: [[`${s.goalsForLast5} goals in the last ${s.form.length}.`, `Form: ${formString(s)}.`], [`${o.name} have conceded ${o.goalsAgainstLast5} in their last ${o.form.length}.`]],
        quote: [`We create chances, we just have to finish them. It'll come.`, `We've worked hard on the final third this week.`],
      };
    case 'leaky_defence':
      return {
        summary: [
          `${s.name} have shipped ${s.goalsAgainstLast5} in ${s.form.length} games and must shore up against ${o.name}.`,
          `Defence is the concern: ${s.goalsAgainstLast5} goals conceded in the last ${s.form.length} for ${s.name}.`,
        ],
        bullets: [[`${s.goalsAgainstLast5} conceded in ${s.form.length} games.`, `Form: ${formString(s)}.`], [`${o.name} scored ${o.goalsForLast5} in their last ${o.form.length}.`]],
        quote: [`We're giving away too much. It's about concentration as much as shape.`, `Clean sheets win matches. We've been working on it all week.`],
      };
    case 'rematch': {
      const m = facts.lastMeeting!;
      return {
        summary: [
          `${H.name} and ${A.name} last met ${m.homeGoals}-${m.awayGoals} (${m.homeCode} at home), and this is the return.`,
          `The rematch: the previous meeting finished ${m.homeGoals}-${m.awayGoals}. Neither side will have forgotten it.`,
        ],
        bullets: [[`Last meeting: ${m.homeGoals}-${m.awayGoals}.`, `Form: ${H.code} ${formString(H)}, ${A.code} ${formString(A)}.`]],
        quote: [`We remember the last time. It'll be a different game, but we're ready.`, `There's history there and the players know it.`],
      };
    }
    default:
      return {
        summary: [
          `${H.name} host ${A.name}${H.position && A.position ? ` (${ord(H.position)} v ${ord(A.position)})` : ''} in a fixture with three points at stake.`,
          H.form.length || A.form.length
            ? `${H.name} v ${A.name}: form ${H.code} ${formString(H)}, ${A.code} ${formString(A)}.`
            : `${H.name} and ${A.name} meet with everything still to play for.`,
        ],
        bullets:
          H.form.length || A.form.length
            ? [
                [`Form: ${H.code} ${formString(H)}, ${A.code} ${formString(A)}.`],
                [`${H.name}: ${standing(H)}. ${A.name}: ${standing(A)}.`],
              ]
            : [[`Neither side has a result to lean on yet - a fresh start for ${H.name} and ${A.name}.`]],
        quote: [`Every game is important. We prepare the same way and go from there.`, `Three points is what matters. We'll see how it goes.`],
      };
  }
}

const INTENSITY: Record<StoryAngle, number> = {
  top_clash: 5,
  relegation_fight: 4,
  title_race: 4,
  losing_streak: 4,
  winning_streak: 3,
  star_injury: 3,
  unbeaten_run: 3,
  hot_scorer: 3,
  goal_drought: 2,
  leaky_defence: 2,
  rematch: 3,
  routine: 2,
};

/** The story for one fixture: real facts, an angle (Jev only when the top
 * angles are close), and stable, varied copy. */
export async function buildMatchStory(fixtureId: string, facts: FixtureFacts): Promise<MatchStory> {
  const ranked = candidatesFor(facts);
  const { picked, source } = await choose(fixtureId, facts, ranked);
  const copy = copyFor(picked.angle, facts, picked.side);
  const seed = `${fixtureId}:${picked.id}`;
  const { s } = subjectOf(facts, picked.side);

  const summary = pick(seed, 'summary', copy.summary);
  const bullets = pick(seed, 'bullets', copy.bullets);
  // Secondary angles add depth to the full story without changing the lead.
  const extras = ranked
    .filter((c) => c.id !== picked.id && c.angle !== 'routine' && c.score >= MIN_JEV_SCORE)
    .slice(0, 2)
    .map((c) => c.blurb);
  const fullStory = [summary, ...extras].join('\n\n');

  const quote = pick(seed, 'quote', copy.quote);
  const press = {
    title: `Press Conference: ${s.name} on ${
      picked.angle === 'routine' ? 'the matchday ahead' : picked.angle.replace(/_/g, ' ')
    }`,
    summary: `"${quote}" - ${s.name}, ahead of ${facts.home.name} v ${facts.away.name}.`,
    bullets: [
      ...bullets,
      ...(facts.home.injured[0] || facts.away.injured[0]
        ? [
            `Injury news: ${[facts.home.injured[0], facts.away.injured[0]]
              .filter(Boolean)
              .map((i) => `${i!.name} (${i!.days}d)`)
              .join(', ')}.`,
          ]
        : []),
    ],
    fullStory: `"${quote}"\n\n${extras.join(' ') || summary}`,
  };

  return {
    angle: picked.angle,
    side: picked.side,
    source,
    intensity: INTENSITY[picked.angle],
    summary,
    bullets,
    fullStory,
    press,
  };
}
