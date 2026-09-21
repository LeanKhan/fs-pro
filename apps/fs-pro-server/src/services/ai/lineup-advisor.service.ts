import { getClubById } from '../../controllers/clubs/club.service';
import { JevService, ChoiceAnswer } from './jev.service';

export type SlotPos = 'GK' | 'DEF' | 'MID' | 'ATT';
export type LineupApproach = 'balanced' | 'attacking' | 'solid';

export interface LineupSlot {
  label: string;
  pos: SlotPos;
}

interface AdvisorPlayer {
  id: string;
  name: string;
  position: SlotPos;
  rating: number;
  fitness: number;
  attrs: Record<string, number>;
}

export interface SlotAssignment {
  slot: number;
  label: string;
  slotPos: SlotPos;
  playerId: string;
  playerName: string;
  naturalPos: SlotPos;
  rating: number;
  outOfPosition: boolean;
}

export interface LineupCandidate {
  approach: LineupApproach;
  score: number;
  outOfPosition: number;
  avgRating: number;
  starters: SlotAssignment[];
  bench: string[];
}

export interface LineupSuggestion {
  approach: LineupApproach;
  source: 'jev' | 'local';
  confidence: number | null;
  reasoning: string;
  starters: SlotAssignment[];
  bench: string[];
  candidates: {
    approach: LineupApproach;
    score: number;
    outOfPosition: number;
    avgRating: number;
  }[];
  excludedInjured: string[];
}

/** Rating points knocked off when a player is out of his natural position. */
const OUT_OF_POSITION_PENALTY: Record<string, number> = {
  'DEF>MID': 12,
  'MID>DEF': 14,
  'MID>ATT': 12,
  'ATT>MID': 12,
  'DEF>ATT': 30,
  'ATT>DEF': 30,
};
const GK_MISMATCH_PENALTY = 80;
const BENCH_SIZE = 7;

const ATTACK_ATTRS = ['Shooting', 'Positioning', 'Speed', 'Dribbling'];
const DEFENCE_ATTRS = ['Tackling', 'Marking', 'Interception', 'Strength'];

function avgAttrs(p: AdvisorPlayer, keys: string[]): number {
  const vals = keys.map((k) => p.attrs[k]).filter((v) => typeof v === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : p.rating;
}

/** Value of `p` playing `slot` under an approach: rating, tilted toward the
 * attributes that approach cares about, minus an out-of-position penalty. */
function fit(p: AdvisorPlayer, slot: LineupSlot, approach: LineupApproach): number {
  let base = p.rating;
  if (approach === 'attacking' && (slot.pos === 'ATT' || slot.pos === 'MID')) {
    base = base * 0.5 + avgAttrs(p, ATTACK_ATTRS) * 0.5;
  } else if (approach === 'solid' && (slot.pos === 'DEF' || slot.pos === 'MID')) {
    base = base * 0.5 + avgAttrs(p, DEFENCE_ATTRS) * 0.5;
  }
  const fitnessFactor = 0.9 + 0.1 * Math.min(Math.max(p.fitness, 0), 100) / 100;
  let penalty = 0;
  if (p.position !== slot.pos) {
    penalty =
      p.position === 'GK' || slot.pos === 'GK'
        ? GK_MISMATCH_PENALTY
        : OUT_OF_POSITION_PENALTY[`${p.position}>${slot.pos}`] ?? 20;
  }
  return base * fitnessFactor - penalty;
}

/** Best assignment of players to slots: greedy by scarcity, then pairwise
 * swaps until no swap improves the total (plenty for 11 slots). */
function assign(
  pool: AdvisorPlayer[],
  slots: LineupSlot[],
  approach: LineupApproach
): (AdvisorPlayer | undefined)[] {
  const chosen: (AdvisorPlayer | undefined)[] = new Array(slots.length).fill(undefined);
  const used = new Set<string>();

  const order = slots
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.pos === 'GK' ? -1 : b.s.pos === 'GK' ? 1 : 0));

  for (const { s, i } of order) {
    let best: AdvisorPlayer | undefined;
    let bestScore = -Infinity;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      const v = fit(p, s, approach);
      if (v > bestScore) {
        bestScore = v;
        best = p;
      }
    }
    if (best) {
      chosen[i] = best;
      used.add(best.id);
    }
  }

  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    // Swap two starters.
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = chosen[i];
        const b = chosen[j];
        if (!a || !b) continue;
        const before = fit(a, slots[i], approach) + fit(b, slots[j], approach);
        const after = fit(b, slots[i], approach) + fit(a, slots[j], approach);
        if (after > before + 0.01) {
          chosen[i] = b;
          chosen[j] = a;
          improved = true;
        }
      }
    }
    // Swap a starter for someone not in the XI.
    for (let i = 0; i < slots.length; i++) {
      const a = chosen[i];
      if (!a) continue;
      for (const p of pool) {
        if (chosen.includes(p)) continue;
        if (fit(p, slots[i], approach) > fit(a, slots[i], approach) + 0.01) {
          chosen[i] = p;
          improved = true;
          break;
        }
      }
    }
  }
  return chosen;
}

/** Bench: a back-up keeper, at least one of each outfield unit if the squad
 * has them, then the best remaining by rating. */
function pickBench(pool: AdvisorPlayer[], startersIds: Set<string>): string[] {
  const remaining = pool
    .filter((p) => !startersIds.has(p.id))
    .sort((a, b) => b.rating - a.rating);
  const bench: AdvisorPlayer[] = [];
  const take = (p?: AdvisorPlayer) => {
    if (p && bench.length < BENCH_SIZE && !bench.includes(p)) bench.push(p);
  };
  for (const pos of ['GK', 'DEF', 'MID', 'ATT'] as SlotPos[]) {
    take(remaining.find((p) => p.position === pos));
  }
  for (const p of remaining) take(p);
  return bench.map((p) => p.id);
}

function buildCandidate(
  pool: AdvisorPlayer[],
  slots: LineupSlot[],
  approach: LineupApproach
): LineupCandidate {
  const chosen = assign(pool, slots, approach);
  const starters: SlotAssignment[] = [];
  let score = 0;
  let oop = 0;
  let ratingSum = 0;
  chosen.forEach((p, i) => {
    if (!p) return;
    const outOfPosition = p.position !== slots[i].pos;
    if (outOfPosition) oop++;
    score += fit(p, slots[i], 'balanced');
    ratingSum += p.rating;
    starters.push({
      slot: i,
      label: slots[i].label,
      slotPos: slots[i].pos,
      playerId: p.id,
      playerName: p.name,
      naturalPos: p.position,
      rating: Math.round(p.rating),
      outOfPosition,
    });
  });
  return {
    approach,
    score: Math.round(score * 10) / 10,
    outOfPosition: oop,
    avgRating: starters.length ? Math.round((ratingSum / starters.length) * 10) / 10 : 0,
    starters,
    bench: pickBench(pool, new Set(starters.map((s) => s.playerId))),
  };
}

const APPROACH_BLURB: Record<LineupApproach, string> = {
  balanced: 'Best overall players in each slot by rating.',
  attacking: 'Favours shooting, positioning, pace and dribbling in attack and midfield.',
  solid: 'Favours tackling, marking, interceptions and strength in defence and midfield.',
};

export async function suggestLineup(input: {
  clubId: string;
  formation: string;
  style?: string;
  slots: LineupSlot[];
}): Promise<LineupSuggestion> {
  const club: any = await getClubById(input.clubId, { withPlayersAndManager: true });
  if (!club) throw new Error('Club not found');
  if (input.slots.length !== 11) throw new Error('A formation needs exactly 11 slots');

  const all: AdvisorPlayer[] = (club.Players ?? []).map((p: any) => ({
    id: String(p._id),
    name: `${p.FirstName} ${p.LastName}`,
    position: (p.Position ?? 'MID') as SlotPos,
    rating: p.Rating ?? 50,
    fitness: p.Fitness ?? 100,
    attrs: (p.Attributes ?? {}) as Record<string, number>,
    injured: Boolean(p.Injury && Number(p.Injury.daysRemaining) > 0),
  }));
  const injured = all.filter((p: any) => p.injured);
  const pool = all.filter((p: any) => !p.injured);
  if (pool.length < 11) throw new Error(`Only ${pool.length} fit players available`);

  const approaches: LineupApproach[] = ['balanced', 'attacking', 'solid'];
  const candidates = approaches.map((a) => buildCandidate(pool, input.slots, a));
  const byApproach = new Map(candidates.map((c) => [c.approach, c]));

  const response = await JevService.ask(
    {
      formation: input.formation,
      style: input.style ?? 'Balanced',
      candidates: candidates.map((c) => ({
        approach: c.approach,
        score: c.score,
        outOfPosition: c.outOfPosition,
        avgRating: c.avgRating,
      })),
    },
    {
      lineupApproach: {
        type: 'choice',
        instructions:
          'Which lineup approach best suits this formation and playing style, given how each candidate scores and how many players are out of position?',
        criteria: {
          balanced: APPROACH_BLURB.balanced,
          attacking: APPROACH_BLURB.attacking,
          solid: APPROACH_BLURB.solid,
        },
      },
    }
  );

  const answer = response.answers.lineupApproach as ChoiceAnswer<LineupApproach> | undefined;
  const approach: LineupApproach =
    answer?.choice && byApproach.has(answer.choice) ? answer.choice : 'balanced';
  const picked = byApproach.get(approach)!;

  const oopNote = picked.outOfPosition
    ? ` ${picked.outOfPosition} player${picked.outOfPosition === 1 ? ' is' : 's are'} out of position - the squad lacks natural players there.`
    : ' Every starter is in his natural position.';

  return {
    approach,
    source: response.source ?? 'local',
    confidence: answer?.confidence ?? null,
    reasoning: `${approach[0].toUpperCase()}${approach.slice(1)}: ${APPROACH_BLURB[approach]}${oopNote}`,
    starters: picked.starters,
    bench: picked.bench,
    candidates: candidates.map((c) => ({
      approach: c.approach,
      score: c.score,
      outOfPosition: c.outOfPosition,
      avgRating: c.avgRating,
    })),
    excludedInjured: injured.map((p) => p.name),
  };
}
