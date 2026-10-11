import type { AdvisorLine } from '@repo/api-contract';
import type { AdvisorSource } from './advisor/use-advisor';

/**
 * The launch onboarding: five first goals that teach the loop (collect, build,
 * attack, grow the Clubhouse), each worked out from the club's real state - no
 * server program, nothing to fall out of sync. The advisor speaks the current
 * goal and points at its building; the HUD lists them with ticks.
 */
export interface GoalState {
  collected: boolean;
  trainingTier: number;
  trainingBuilding: boolean;
  academyTier: number;
  academyBuilding: boolean;
  wonAttack: boolean;
  clubhouseTier: number;
  clubhouseBuilding: boolean;
}

export interface Goal {
  id: string;
  label: string;
  hint: string;
  icon: string;
  /** The campus building the advisor points at, if any. */
  target: string | null;
  /** The HUD action that gets you there. */
  action: string;
  done: boolean;
}

export function launchGoals(s: GoalState): Goal[] {
  return [
    {
      id: 'collect',
      label: 'Collect your takings',
      hint: 'Tap the coins over your Stadium to bank the gate money.',
      icon: 'coins',
      target: 'stadium_grounds',
      action: 'collect',
      done: s.collected,
    },
    {
      id: 'training',
      label: 'Build a Training Ground',
      hint: 'It trains your squad and unlocks player abilities. Tap the plot, then Upgrade.',
      icon: 'hammer',
      target: 'training_ground',
      action: 'build',
      done: s.trainingTier >= 1 || s.trainingBuilding,
    },
    {
      id: 'academy',
      label: 'Build a Youth Academy',
      hint: 'Your new players come through the academy. Build it next.',
      icon: 'people',
      target: 'youth_academy',
      action: 'build',
      done: s.academyTier >= 1 || s.academyBuilding,
    },
    {
      id: 'attack',
      label: 'Win your first stars',
      hint: 'Press Attack, pick a club and beat their grid. Stars bring loot and climb the ladder.',
      icon: 'ball',
      target: null,
      action: 'attack',
      done: s.wonAttack,
    },
    {
      id: 'clubhouse',
      label: 'Clubhouse to Tier 2',
      hint: 'A bigger Clubhouse lifts every building’s cap and adds a builder.',
      icon: 'up',
      target: 'office',
      action: 'build',
      done: s.clubhouseTier >= 2 || s.clubhouseBuilding,
    },
  ];
}

/** The goal the player is on (the first not done), or null when all are done. */
export const currentGoal = (goals: Goal[]) => goals.find((g) => !g.done) ?? null;

/** An advisor source that speaks the current goal (no server program). */
export function goalAdvisorSource(get: () => Goal | null): AdvisorSource {
  return {
    async stepLine(): Promise<AdvisorLine | null> {
      const g = get();
      if (!g) return null;
      return {
        id: `goal.${g.id}`,
        speaker: 'Vintra',
        text: g.hint,
        expr: g.id === 'attack' ? 'excited' : 'happy',
        pose: g.target ? 'point-right' : 'idle',
        target: g.target,
        priority: 90,
        dismissible: true,
        maxShows: 3,
        cooldownSeconds: 90,
        once: false,
      };
    },
    async tip() {
      return null;
    },
    async dismiss() {},
  };
}
