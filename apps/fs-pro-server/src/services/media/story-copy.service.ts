import { pick, ord } from './story-angles.service';

/**
 * Data-driven copy for the transfer wire and the season finale. Purely local
 * (no Jev): every angle is decided from numbers already on hand, so these
 * cards cost nothing to generate. Phrasing is stable per seed and varies
 * between deals / seasons.
 */

const money = (n: number) => (n > 0 ? `€${Math.round(n).toLocaleString()}` : 'a free transfer');

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export type TransferAngle =
  | 'need'
  | 'gk_shortage'
  | 'statement'
  | 'bargain'
  | 'premium'
  | 'youth'
  | 'veteran'
  | 'free_agent'
  | 'depth';

export interface TransferInput {
  seed: string;
  playerName: string;
  firstName: string;
  position: string;
  age: number;
  rating: number;
  value: number;
  fee: number;
  buyerName: string;
  sellerName: string | null;
  note: string | null;
  /** Buyer's other players in this position (excluding the signing). */
  peersInPosition: { rating: number }[];
}

export interface TransferStory {
  angle: TransferAngle;
  title: string;
  summary: string;
  insight: string;
  fullStory: string;
  managerQuote: string;
  scoutingVerdict: string;
  directorQuote: string;
}

function transferAngle(t: TransferInput): { angle: TransferAngle; insight: string } {
  const peers = t.peersInPosition.length;
  const best = peers ? Math.max(...t.peersInPosition.map((p) => p.rating)) : 0;
  const ratio = t.value > 0 ? t.fee / t.value : 1;
  const isFree = !t.sellerName;

  if (t.note?.includes('need signing')) {
    return {
      angle: 'need',
      insight: `${t.buyerName} had ${peers} other ${t.position}${peers === 1 ? '' : 's'} on the books - this fills a gap.`,
    };
  }
  if (t.position === 'GK' && peers <= 1) {
    return {
      angle: 'gk_shortage',
      insight: `${t.buyerName} were down to ${peers} other goalkeeper${peers === 1 ? '' : 's'} - cover was badly needed.`,
    };
  }
  if (t.fee >= 10_000_000 || (t.rating >= 75 && t.rating >= best + 5)) {
    return {
      angle: 'statement',
      insight: best
        ? `Rated ${t.rating}, ${t.firstName} is ${t.rating - best >= 0 ? `${t.rating - best} point(s) above` : `${best - t.rating} below`} the best ${t.position} already at the club (${best}).`
        : `Rated ${t.rating}, the first ${t.position} of any quality at the club.`,
    };
  }
  if (t.fee > 0 && ratio <= 0.7) {
    return {
      angle: 'bargain',
      insight: `${money(t.fee)} is ${Math.round((1 - ratio) * 100)}% below his ${money(t.value)} valuation.`,
    };
  }
  if (t.fee > 0 && ratio >= 1.25) {
    return {
      angle: 'premium',
      insight: `${t.buyerName} paid ${Math.round((ratio - 1) * 100)}% over his ${money(t.value)} valuation.`,
    };
  }
  if (t.age <= 20) {
    return { angle: 'youth', insight: `Only ${t.age}, with plenty of development still ahead.` };
  }
  if (t.age >= 31) {
    return { angle: 'veteran', insight: `At ${t.age}, he brings experience rather than resale value.` };
  }
  if (isFree) {
    return { angle: 'free_agent', insight: `A free agent, so no fee - just wages.` };
  }
  return {
    angle: 'depth',
    insight: peers
      ? `Adds to a ${t.position} group of ${peers + 1}.`
      : `Rated ${t.rating}.`,
  };
}

export function buildTransferStory(t: TransferInput): TransferStory {
  const { angle, insight } = transferAngle(t);
  const fee = money(t.fee);
  const from = t.sellerName ? `from ${t.sellerName}` : 'on a free transfer';
  const s = (salt: string, items: string[]) => pick(t.seed, salt, items);

  const headlines: Record<TransferAngle, string[]> = {
    need: [`${t.buyerName} Fill the ${t.position} Gap With ${t.playerName}`, `Answering a Need: ${t.playerName} Joins ${t.buyerName}`],
    gk_shortage: [`${t.buyerName} Sign Goalkeeper ${t.playerName} to Shore Up Cover`, `Keeper Cover Arrives: ${t.playerName} to ${t.buyerName}`],
    statement: [`STATEMENT SIGNING: ${t.buyerName} Land ${t.playerName}`, `${t.buyerName} Make Their Move: ${t.playerName} Signs`],
    bargain: [`Bargain Business: ${t.buyerName} Sign ${t.playerName} for ${fee}`, `${t.buyerName} Pick Up ${t.playerName} Below Value`],
    premium: [`${t.buyerName} Pay Up for ${t.playerName}`, `Big Money: ${t.playerName} Joins ${t.buyerName} for ${fee}`],
    youth: [`${t.buyerName} Bring In Young ${t.position} ${t.playerName}`, `Eye on the Future: ${t.playerName}, ${t.age}, Joins ${t.buyerName}`],
    veteran: [`Experience Added: ${t.playerName} Joins ${t.buyerName}`, `${t.buyerName} Turn to Veteran ${t.playerName}`],
    free_agent: [`${t.playerName} Signs for ${t.buyerName} on a Free`, `Free Agent ${t.playerName} Lands at ${t.buyerName}`],
    depth: [`DONE DEAL: ${t.playerName} to ${t.buyerName}`, `${t.buyerName} Complete Signing of ${t.playerName}`],
  };

  const summaries = [
    `${t.buyerName} have signed ${t.position} ${t.playerName} (${t.age}, rated ${t.rating}) ${from}${t.fee > 0 ? ` for ${fee}` : ''}. ${insight}`,
    `${t.playerName}, a ${t.age}-year-old ${t.position} rated ${t.rating}, is a ${t.buyerName} player ${from}. ${insight}`,
    `Done: ${t.playerName} joins ${t.buyerName} ${from}${t.fee > 0 ? `, the fee ${fee}` : ''}. ${insight}`,
  ];

  const quotes: Record<TransferAngle, string[]> = {
    need: [`We identified a gap and moved quickly. ${t.firstName} gives us the balance we were missing.`, `It was a priority position for us, and ${t.firstName} was the right solution.`],
    gk_shortage: [`You can't run a squad on one keeper. ${t.firstName} gives us security.`, `Goalkeeping was our concern. Bringing ${t.firstName} in settles that.`],
    statement: [`We wanted to show ambition, and ${t.firstName} is a big part of that.`, `A player of ${t.firstName}'s quality lifts the whole group.`],
    bargain: [`Good value, and a good player. That's what we look for.`, `We're pleased with the price, but more so with what ${t.firstName} brings.`],
    premium: [`We paid what it took because ${t.firstName} was our first choice.`, `He was the one we wanted, and we didn't want to lose him over the price.`],
    youth: [`${t.firstName} has real potential, and we'll give the right development to reach it.`, `He's young and hungry. We're excited to work with him.`],
    veteran: [`${t.firstName} has seen it all. That calm is worth a lot to a squad.`, `Experience matters, and ${t.firstName} has plenty of it.`],
    free_agent: [`It's great to add ${t.firstName} without a fee - pure benefit to the squad.`, `${t.firstName} was available and we moved quickly.`],
    depth: [`${t.firstName} strengthens the group and pushes others for places.`, `More competition in the squad is healthy, and ${t.firstName} adds that.`],
  };

  const verdicts: Record<TransferAngle, string> = {
    need: `Fills a genuine hole at ${t.position}; expect immediate minutes.`,
    gk_shortage: `Restores goalkeeping depth. Not a headline signing, but an important one.`,
    statement: `A clear upgrade on what ${t.buyerName} had, and a sign of intent.`,
    bargain: `Strong value: the rating (${t.rating}) is above what the fee suggests.`,
    premium: `The price is steep against his valuation; he'll need to deliver quickly.`,
    youth: `Long-term project. Rated ${t.rating} now, but the growth is the point.`,
    veteran: `Low resale, high experience. Useful now, less so in three years.`,
    free_agent: `No fee, so the only cost is the wage. Good risk-free depth.`,
    depth: `A solid ${t.position} option (${t.rating}) that adds cover.`,
  };

  const story = [
    `${t.buyerName} have completed the signing of ${t.playerName}, a ${t.age}-year-old ${t.position} ${from}${t.fee > 0 ? ` in a deal worth ${fee}` : ''}.`,
    insight,
    `Rated ${t.rating}, he is valued at ${money(t.value)}.`,
  ].join(' ');

  return {
    angle,
    title: s('title', headlines[angle]),
    summary: s('summary', summaries),
    insight,
    fullStory: story,
    managerQuote: s('quote', quotes[angle]),
    scoutingVerdict: verdicts[angle],
    directorQuote: s('director', [
      `Signing ${t.firstName} fits the plan we set out for this window.`,
      `${t.firstName} was high on our list, and we're glad to have got it done.`,
      `We're pleased to welcome ${t.firstName}; the work behind this deal was thorough.`,
    ]),
  };
}

// ---------------------------------------------------------------------------
// Season finale
// ---------------------------------------------------------------------------

export interface FinaleRow {
  ClubCode: string;
  Points: number;
  Played: number;
  Wins: number;
  Draws: number;
  Losses: number;
  GF: number;
  GA: number;
  GD: number;
}

export interface FinaleInput {
  seed: string;
  compName: string;
  year: string;
  table: FinaleRow[];
  names: Record<string, string>;
  /** The viewer's club and finish, when it took part. */
  user: { code: string; name: string; rank: number } | null;
}

export type FinaleAngle = 'photo_finish' | 'runaway' | 'invincible' | 'attack' | 'defence' | 'standard';

export interface FinaleStory {
  angle: FinaleAngle;
  headline: string;
  summary: string;
  fullStory: string;
  championQuote: string;
  bullets: string[];
  postMortem: { title: string; summary: string; bullets: string[]; fullStory: string; quote: string };
}

export function buildFinaleStory(f: FinaleInput): FinaleStory {
  const { table, names } = f;
  const nm = (code: string) => names[code] ?? code;
  const champ = table[0];
  const second = table[1];
  const margin = second ? champ.Points - second.Points : champ.Points;
  const bestAttack = [...table].sort((a, b) => b.GF - a.GF)[0];
  const bestDefence = [...table].sort((a, b) => a.GA - b.GA)[0];
  const champName = nm(champ.ClubCode);
  const s = (salt: string, items: string[]) => pick(f.seed, salt, items);

  let angle: FinaleAngle = 'standard';
  if (second && margin <= 2) angle = 'photo_finish';
  else if (champ.Losses === 0 && champ.Played >= 5) angle = 'invincible';
  else if (second && margin >= 8) angle = 'runaway';
  else if (bestAttack.ClubCode === champ.ClubCode && champ.GF >= 2 * champ.Played * 0.9) angle = 'attack';
  else if (bestDefence.ClubCode === champ.ClubCode) angle = 'defence';

  const record = `${champ.Wins}W ${champ.Draws}D ${champ.Losses}L, ${champ.GF} scored and ${champ.GA} conceded`;
  const headlines: Record<FinaleAngle, string[]> = {
    photo_finish: [`${champName} Edge ${f.compName} Title by ${margin === 0 ? 'Goal Difference' : `${margin} Point${margin === 1 ? '' : 's'}`}`, `Down to the Wire: ${champName} Crowned in ${f.compName}`],
    runaway: [`${champName} Run Away With the ${f.compName}`, `${champName} Crowned by ${margin} Points`],
    invincible: [`Unbeaten! ${champName} Win the ${f.compName}`, `${champName} Finish Undefeated to Take the Title`],
    attack: [`${champName}'s Goals Win the ${f.compName}`, `Free-Scoring ${champName} Are Champions`],
    defence: [`${champName} Win the ${f.compName} on Defence`, `Meanest Defence Wins It: ${champName} Champions`],
    standard: [`${champName} Crowned ${f.compName} Champions`, `${champName} Take the ${f.compName} Title`],
  };
  const angleLine: Record<FinaleAngle, string> = {
    photo_finish: second ? `It was as close as it gets: ${nm(second.ClubCode)} finished ${margin} point(s) behind.` : '',
    runaway: second ? `${nm(second.ClubCode)} finished ${margin} points adrift in second.` : '',
    invincible: `They went the entire campaign without a defeat (${record}).`,
    attack: `${champ.GF} goals, the most in the league, did the damage.`,
    defence: `Only ${champ.GA} conceded, the best record in the league, was the foundation.`,
    standard: `They finished on ${champ.Points} points (${record}).`,
  };

  const summary = f.user?.rank === 1
    ? `${f.user.name} are champions! ${angleLine[angle]}`
    : `${champName} take the ${f.compName} with ${champ.Points} points from ${champ.Played}. ${angleLine[angle]}`;

  const bullets = [
    `🥇 Champion: ${champName} (${champ.ClubCode}), ${champ.Points} pts (${record}).`,
    ...(second ? [`🥈 Runners-up: ${nm(second.ClubCode)} (${second.ClubCode}), ${second.Points} pts, ${margin} behind.`] : []),
    `⚽ Best attack: ${nm(bestAttack.ClubCode)} (${bestAttack.GF} goals). 🧤 Best defence: ${nm(bestDefence.ClubCode)} (${bestDefence.GA} conceded).`,
  ];
  const drop = table[table.length - 1];
  if (drop && drop.ClubCode !== champ.ClubCode) {
    bullets.push(`🔻 Bottom: ${nm(drop.ClubCode)} (${drop.ClubCode}), ${drop.Points} pts.`);
  }

  // Post-mortem is written for the viewer's own club when it took part.
  const u = f.user;
  const row = u ? table.find((r) => r.ClubCode === u.code) : undefined;
  let pm: FinaleStory['postMortem'];
  if (u && row) {
    const gap = champ.Points - row.Points;
    const tier =
      u.rank === 1 ? 'champion' : u.rank <= 3 ? 'podium' : u.rank <= Math.ceil(table.length / 2) ? 'upper' : u.rank <= table.length - 3 ? 'lower' : 'bottom';
    const record2 = `${row.Wins}W ${row.Draws}D ${row.Losses}L, GD ${row.GD >= 0 ? '+' : ''}${row.GD}`;
    const tierTitle: Record<string, string[]> = {
      champion: [`${u.name}: A Title Season to Remember`, `Champions ${u.name}: The Board's Verdict`],
      podium: [`${u.name}: Board Pleased With ${ord(u.rank)} Place`, `${u.name} Take Stock After a Podium Finish`],
      upper: [`${u.name}: Solid Year, Room to Grow`, `${u.name} Finish ${ord(u.rank)} - Board Wants More`],
      lower: [`${u.name}: Board Demands Improvement`, `${u.name} Face Questions After ${ord(u.rank)}-Place Finish`],
      bottom: [`${u.name}: Relegation Worries Dominate the Boardroom`, `${u.name} Reflect on a Struggle at the Bottom`],
    };
    const tierSummary: Record<string, string> = {
      champion: `${u.name} finished 1st on ${row.Points} points (${record2}). The talk now is retaining the squad and winning again.`,
      podium: `${u.name} finished ${ord(u.rank)} on ${row.Points} points (${record2}), ${gap} behind the champions. The board is pleased but wants the last step.`,
      upper: `${u.name} finished ${ord(u.rank)} of ${table.length} on ${row.Points} points (${record2}), ${gap} off the top. A stable year, though the board expects progress.`,
      lower: `${u.name} finished ${ord(u.rank)} of ${table.length} on ${row.Points} points (${record2}). The board wants clear improvement next season.`,
      bottom: `${u.name} finished ${ord(u.rank)} of ${table.length} on just ${row.Points} points (${record2}). Survival, and the squad, are under review.`,
    };
    const tierQuote: Record<string, string> = {
      champion: `We won it together. Now we look to the next one; nobody is standing still.`,
      podium: `So close. The gap is small and we know where to find it.`,
      upper: `A decent base, but we finished where we deserved. We need reinforcements.`,
      lower: `It wasn't good enough. We'll be honest about that and fix it.`,
      bottom: `It was a hard year. We stay together, make the right changes and come back stronger.`,
    };
    pm = {
      title: s('pmtitle', tierTitle[tier]),
      summary: tierSummary[tier],
      bullets: [
        `Finish: ${ord(u.rank)} of ${table.length}, ${row.Points} pts (${record2}).`,
        `Attack ${row.GF} scored, defence ${row.GA} conceded (league best: ${bestAttack.GF} / ${bestDefence.GA}).`,
        tier === 'champion' ? `Priority: keep the core together into the new window.` : `Gap to the champions: ${gap} point(s).`,
      ],
      fullStory: `${tierSummary[tier]}\n\n${row.GA >= bestDefence.GA + 8 ? 'The defence conceded far more than the best in the league and will be looked at first. ' : ''}${row.GF <= bestAttack.GF - 10 ? 'Goals were a problem, and the attack needs reinforcing. ' : ''}The transfer window is next.`,
      quote: tierQuote[tier],
    };
  } else {
    pm = {
      title: `${champName} Celebrates ${angle === 'invincible' ? 'an Unbeaten' : 'a'} Title`,
      summary: `Supporters filled the streets to celebrate ${champName}'s ${f.compName} title.`,
      bullets: [`${champ.Points} points, ${margin} clear of second.`],
      fullStory: `${champName} won the ${f.compName} on ${champ.Points} points.`,
      quote: `A brilliant year for everyone connected with the club.`,
    };
  }

  return {
    angle,
    headline: s('headline', headlines[angle]),
    summary,
    fullStory: [
      `${champName} are the ${f.compName} champions for ${f.year}, finishing on ${champ.Points} points from ${champ.Played} matches.`,
      angleLine[angle],
      `${nm(bestAttack.ClubCode)} scored the most (${bestAttack.GF}); ${nm(bestDefence.ClubCode)} conceded the fewest (${bestDefence.GA}).`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    championQuote: s('quote', [
      `This title is down to a squad that never let up, and to the supporters.`,
      `Every one of these ${champ.Points} points was earned. Proud of every player.`,
      angle === 'photo_finish'
        ? `It went to the last moment. We never stopped believing.`
        : `We kept our standards high all season, and this is the result.`,
    ]),
    bullets,
    postMortem: pm,
  };
}
