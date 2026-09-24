import { ref } from 'vue';
import type { Club } from '@repo/api-contract';
import { client } from '@/services/api';

/** Labels and small helpers for the open-play screens. */

export const METRIC_LABELS: Record<string, string> = {
  points: 'Points',
  ppg: 'Points per game',
  wins: 'Wins',
  'win-rate': 'Win rate',
  gd: 'Goal difference',
  gf: 'Goals scored',
  'ga-low': 'Fewest conceded',
  'clean-sheets': 'Clean sheets',
  'unbeaten-run': 'Longest unbeaten run',
  'elo-gain': 'Elo gained',
  played: 'Games played',
};

export const STATUS_COLORS: Record<string, string> = {
  draft: 'grey',
  registration: 'teal',
  running: 'amber',
  finished: 'indigo',
  cancelled: 'red-darken-2',
  proposed: 'amber',
  accepted: 'teal',
  played: 'indigo',
  declined: 'grey',
  expired: 'grey',
  forfeited: 'red',
  invited: 'purple',
  registered: 'teal',
  active: 'green',
  eliminated: 'grey',
  withdrawn: 'grey',
};

export const STATUS_LABELS: Record<string, string> = {
  registration: 'Open for entry',
  running: 'Running',
  finished: 'Finished',
  cancelled: 'Cancelled',
  draft: 'Draft',
};

export interface StageLike {
  type: 'league' | 'groups' | 'knockout';
  days?: number;
  groupSize?: number;
  legs?: number;
  advance?: { top: number; perGroup?: boolean; bestRunnersUp?: number };
}

/** "4 groups of 4 over 20 days, top 2 into a single-leg knockout". */
export function formatSummary(def: {
  Stages?: StageLike[];
  Entry?: { maxClubs?: number | null; minLevel?: number; maxLevel?: number; minElo?: number; maxElo?: number; entryFee?: number; mode?: string };
} | null | undefined): string {
  if (!def?.Stages?.length) return 'No stages yet';
  const parts: string[] = [];
  const e = def.Entry ?? {};
  const who: string[] = [];
  if (e.maxClubs) who.push(`${e.maxClubs} clubs`);
  if (e.minLevel != null || e.maxLevel != null) {
    who.push(
      e.minLevel != null && e.maxLevel != null
        ? `Levels ${e.minLevel}-${e.maxLevel}`
        : e.minLevel != null
          ? `Level ${e.minLevel}+`
          : `up to Level ${e.maxLevel}`
    );
  }
  if (e.maxElo != null) who.push(`under ${e.maxElo} Elo`);
  if (e.minElo != null) who.push(`${e.minElo}+ Elo`);
  if (e.mode === 'invite') who.push('invitation only');
  if (who.length) parts.push(who.join(', '));
  const stages = def.Stages.map((s) => {
    if (s.type === 'league') return `a ${s.days}-day league`;
    if (s.type === 'groups') return `groups of ${s.groupSize} over ${s.days} days`;
    return `a ${s.legs === 2 ? 'two-leg' : 'single-leg'} knockout`;
  });
  parts.push(stages.join(', then '));
  if (e.entryFee) parts.push(`€${e.entryFee.toLocaleString()} to enter`);
  return parts.join(' · ');
}

export function stageName(stage: StageLike | undefined, index: number) {
  if (!stage) return `Stage ${index + 1}`;
  return stage.type === 'league' ? 'League' : stage.type === 'groups' ? 'Groups' : 'Knockout';
}

export function roundName(round: number, totalRounds: number) {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-finals';
  if (fromEnd === 2) return 'Quarter-finals';
  return `Round ${round}`;
}

export function money(n: number | null | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n ?? 0);
}

/** Level from XP with the world's thresholds (same rule as the server). */
export function levelForXp(xp: number, thresholds?: number[] | null) {
  const curve = (n: number) => 100 * n * n;
  const at = (n: number) => (thresholds && n < thresholds.length ? thresholds[n]! : curve(n));
  let level = 0;
  while (at(level + 1) <= Math.max(0, xp)) level++;
  return level;
}

export function xpForLevel(level: number, thresholds?: number[] | null) {
  return thresholds && level < thresholds.length ? thresholds[level]! : 100 * level * level;
}

// Club directory: names and codes by id, loaded once and shared.
type ClubLite = Pick<Club, 'Name' | 'ClubCode' | 'XP' | 'Elo' | 'Budget' | 'homePlaceId' | 'CampusLayout' | 'Rating' | 'Address' | 'Form' | 'UserId'> & { _id: string };
const directory = ref<Map<string, ClubLite>>(new Map());
let loading: Promise<void> | null = null;

export type { ClubLite };

export function useClubDirectory() {
  if (!loading) {
    loading = client.clubs.getClubs
      .query({ query: { withPlayersAndManager: false } })
      .then((res) => {
        if (res.status !== 200) return;
        const map = new Map<string, ClubLite>();
        for (const c of res.body.payload as unknown as ClubLite[]) map.set(String(c._id), c);
        directory.value = map;
      })
      .catch(() => {
        loading = null;
      });
  }
  const name = (id: string | null | undefined) => (id ? (directory.value.get(id)?.Name ?? '…') : '—');
  const code = (id: string | null | undefined) => (id ? (directory.value.get(id)?.ClubCode ?? '') : '');
  const get = (id: string | null | undefined) => (id ? directory.value.get(id) : undefined);
  return { clubs: directory, name, code, get };
}
