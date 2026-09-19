/** Season status the server writes once `endSeasonCycle` has run for a year. */
export const CYCLE_ENDED_STATUS = 'ended';

export interface CycleSeason {
  _id?: string;
  SeasonCode: string;
  CompetitionCode: string;
  Year: string;
  isStarted: boolean;
  isFinished: boolean;
  Status: string;
  createdAt?: string;
  /** True for cup/tournament seasons, which finish themselves once their
   * Final is played; leagues need an explicit "finish season". */
  selfFinishing?: boolean;
}

/** Fixture progress for one unfinished season. */
export interface SeasonProgress {
  unplayed: number;
  /** Highest ScheduledDay among the season's unplayed fixtures. */
  lastUnplayedDay: number | null;
}

export type CycleStepKind = 'start' | 'play' | 'advance' | 'finish' | 'end';

export interface CycleStep {
  kind: CycleStepKind;
  title: string;
  detail: string;
  /** Cycle the step is about (absent for `start`). */
  year?: string;
  /** Label to prefill when starting the next cycle. */
  suggestedYear?: string;
  /** Day to simulate to (`play` / `advance`). */
  targetDay?: number;
  /** Seasons the step acts on (`finish`). */
  seasonIds?: string[];
}

/** "XPY-2026" -> "XPY-2027"; a label without a trailing number gets "-2". */
export function nextYearLabel(label: string): string {
  const match = /^(.*?)(\d+)$/.exec(label.trim());
  if (!match) return `${label.trim()}-2`;
  return `${match[1]}${Number(match[2]) + 1}`;
}

/** The cycle that was started most recently (seasons of the latest `createdAt`). */
export function latestCycle(seasons: CycleSeason[]): CycleSeason[] {
  if (!seasons.length) return [];
  const stamp = (s: CycleSeason) => (s.createdAt ? Date.parse(s.createdAt) : 0);
  const newest = seasons.reduce((a, b) => (stamp(b) > stamp(a) ? b : a));
  return seasons.filter((s) => s.Year === newest.Year);
}

/**
 * Works out the one thing the admin should do next:
 * play out fixtures -> (advance knockouts) -> finish leagues -> end the cycle
 * -> start the next one.
 *
 * `progress` is keyed by season id and only needs entries for unfinished seasons.
 */
export function computeCycleStep(
  seasons: CycleSeason[],
  progress: Record<string, SeasonProgress>,
  currentDay: number
): CycleStep {
  const cycle = latestCycle(seasons);
  if (!cycle.length) {
    return {
      kind: 'start',
      title: 'Start the first season cycle',
      detail: 'No seasons exist yet. Pick a year label and start the cycle.',
    };
  }

  const year = cycle[0].Year;

  if (cycle.every((s) => s.Status === CYCLE_ENDED_STATUS)) {
    return {
      kind: 'start',
      year,
      title: 'Start the next season cycle',
      detail: `${year} has ended. Start the next cycle to create new seasons.`,
      suggestedYear: nextYearLabel(year),
    };
  }

  const unfinished = cycle.filter((s) => !s.isFinished);
  const withFixturesLeft = unfinished.filter(
    (s) => (progress[s._id ?? '']?.unplayed ?? 0) > 0
  );

  if (withFixturesLeft.length) {
    const left = withFixturesLeft.reduce(
      (sum, s) => sum + progress[s._id ?? ''].unplayed,
      0
    );
    const lastDay = Math.max(
      ...withFixturesLeft.map((s) => progress[s._id ?? ''].lastUnplayedDay ?? 0)
    );
    return {
      kind: 'play',
      year,
      title: `Play the remaining ${left} fixture${left === 1 ? '' : 's'}`,
      detail: `${withFixturesLeft
        .map((s) => s.CompetitionCode)
        .join(', ')} still ${withFixturesLeft.length === 1 ? 'has' : 'have'} unplayed matches, the last scheduled on day ${lastDay}.`,
      targetDay: Math.max(lastDay, currentDay + 1),
    };
  }

  // Everything scheduled is played but some seasons are not finished.
  const cups = unfinished.filter((s) => s.selfFinishing);
  if (cups.length) {
    return {
      kind: 'advance',
      year,
      title: 'Advance a day so the knockout rounds can progress',
      detail: `${cups
        .map((s) => s.CompetitionCode)
        .join(', ')} finished its current round; the next round (or the final result) is generated when the day advances.`,
      targetDay: currentDay + 1,
    };
  }

  if (unfinished.length) {
    return {
      kind: 'finish',
      year,
      title: `Finish ${unfinished.length} season${unfinished.length === 1 ? '' : 's'}`,
      detail: `All matches are played. Finishing crowns the champions and records promotion and relegation: ${unfinished
        .map((s) => s.CompetitionCode)
        .join(', ')}.`,
      seasonIds: unfinished.map((s) => s._id as string),
    };
  }

  return {
    kind: 'end',
    year,
    title: `End season cycle ${year}`,
    detail:
      'Every season is finished. Ending the cycle moves clubs between leagues, ages and retires players, pays wages and runs youth intake.',
  };
}
