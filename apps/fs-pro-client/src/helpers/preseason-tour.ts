/**
 * The Pre-Season Tour surface's pure core (docs/coc-mapping/02 §J, 04 §8,
 * 08 §2 P9, OW-N12).
 *
 * `preseason.get` returns a fixed 10-stage AI ladder (rating 12→36, 3★ per
 * stage, guaranteed ledgered rewards) plus the scripted onboarding checklist.
 * The payload is fully typed (`PreseasonProgressSchema`); this module derives
 * the per-stage call-to-action and the onboarding rail progress so the panel
 * stays declarative.
 *
 * Pure: no Vue, no network, no clock. Unit-tested in `preseason-tour.test.ts`.
 */
import type {
  PreseasonOnboardingStep,
  PreseasonProgress,
  PreseasonReward,
  PreseasonStage,
} from '@repo/api-contract';

/** The reward as chip rows (only non-zero currencies). */
export interface RewardChips {
  cash: number;
  fans: number;
  scoutTokens: number;
  sponsorCredits: number;
  isEmpty: boolean;
}

/** Convert a reward bundle into display parts. */
export function rewardChips(reward: PreseasonReward): RewardChips {
  return {
    cash: reward.cash,
    fans: reward.fans,
    scoutTokens: reward.scoutTokens,
    sponsorCredits: reward.sponsorCredits,
    isEmpty:
      reward.cash === 0 &&
      reward.fans === 0 &&
      reward.scoutTokens === 0 &&
      reward.sponsorCredits === 0,
  };
}

export type StageAction = 'play' | 'claim' | 'claimed' | 'locked';

/** The one action a stage card offers. */
export function stageAction(stage: PreseasonStage): StageAction {
  if (stage.cleared && !stage.claimed) return 'claim';
  if (stage.claimed) return 'claimed';
  if (stage.unlocked) return 'play';
  return 'locked';
}

/** The button copy for a stage action. */
export function stageActionLabel(action: StageAction): string {
  switch (action) {
    case 'play':
      return 'Play stage';
    case 'claim':
      return 'Claim reward';
    case 'claimed':
      return 'Claimed';
    default:
      return 'Locked';
  }
}

/** "2 / 10 stages" progress for the rail header. */
export function tourProgress(p: PreseasonProgress): {
  cleared: number;
  total: number;
  pct: number;
} {
  const total = p.total > 0 ? p.total : p.stages.length;
  return {
    cleared: p.cleared,
    total,
    pct: total > 0 ? Math.min(1, Math.max(0, p.cleared / total)) : 0,
  };
}

/** The scripted onboarding checklist as a rail. */
export function onboardingProgress(steps: readonly PreseasonOnboardingStep[]): {
  done: number;
  total: number;
  complete: boolean;
  pct: number;
} {
  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  return {
    done,
    total,
    complete: total > 0 && done === total,
    pct: total > 0 ? Math.min(1, done / total) : 0,
  };
}

/** The next playable stage, or null when the ladder is complete. */
export function nextPlayable(
  stages: readonly PreseasonStage[]
): PreseasonStage | null {
  return (
    stages.find((s) => s.unlocked && !s.cleared) ??
    stages.find((s) => s.unlocked && !s.claimed) ??
    null
  );
}

/** Whether any stage has a claim waiting. */
export function claimableStages(
  stages: readonly PreseasonStage[]
): PreseasonStage[] {
  return stages.filter((s) => s.cleared && !s.claimed);
}
