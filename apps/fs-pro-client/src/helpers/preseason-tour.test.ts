import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PreseasonProgress, PreseasonStage } from '@repo/api-contract';
import {
  claimableStages,
  nextPlayable,
  onboardingProgress,
  rewardChips,
  stageAction,
  stageActionLabel,
  tourProgress,
} from './preseason-tour';

function stage(overrides: Partial<PreseasonStage> = {}): PreseasonStage {
  return {
    index: 1,
    code: 'PRE-01',
    name: 'Stage 1',
    opponent: 'Acorn Athletic',
    rating: 12,
    requiredStars: 3,
    reward: { cash: 1000, fans: 500, scoutTokens: 0, sponsorCredits: 0 },
    bestStars: 0,
    attempts: 0,
    cleared: false,
    claimed: false,
    unlocked: true,
    ...overrides,
  };
}

describe('stageAction', () => {
  it('plays an unlocked, uncleared stage', () => {
    assert.equal(stageAction(stage()), 'play');
    assert.equal(stageActionLabel('play'), 'Play stage');
  });
  it('claims a cleared, unclaimed stage', () => {
    assert.equal(stageAction(stage({ cleared: true })), 'claim');
    assert.equal(stageActionLabel('claim'), 'Claim reward');
  });
  it('marks a claimed stage', () => {
    assert.equal(stageAction(stage({ cleared: true, claimed: true })), 'claimed');
  });
  it('locks a not-yet-unlocked stage', () => {
    assert.equal(stageAction(stage({ unlocked: false })), 'locked');
  });
});

describe('rewardChips', () => {
  it('flags an empty reward bundle', () => {
    assert.equal(
      rewardChips({ cash: 0, fans: 0, scoutTokens: 0, sponsorCredits: 0 }).isEmpty,
      true
    );
    const r = rewardChips({ cash: 1000, fans: 500, scoutTokens: 2, sponsorCredits: 0 });
    assert.equal(r.isEmpty, false);
    assert.equal(r.cash, 1000);
  });
});

describe('tourProgress / onboardingProgress', () => {
  it('measures cleared stages against the ladder length', () => {
    const p: PreseasonProgress = {
      clubId: 'c1',
      name: 'Lakeside FC',
      stages: [stage(), stage({ index: 2, unlocked: false })],
      cleared: 1,
      total: 10,
      totalStars: 3,
      onboarding: [],
      onboardingComplete: false,
      nextStage: 2,
    };
    assert.deepEqual(tourProgress(p), { cleared: 1, total: 10, pct: 0.1 });
  });

  it('counts scripted onboarding steps', () => {
    const rail = onboardingProgress([
      { id: 'build', title: 'Build a collector', hint: 'Tap build', done: true },
      { id: 'collect', title: 'Collect', hint: 'Tap the stands', done: false },
    ]);
    assert.equal(rail.done, 1);
    assert.equal(rail.total, 2);
    assert.equal(rail.complete, false);
    assert.equal(rail.pct, 0.5);
  });

  it('is complete when every step is done', () => {
    const rail = onboardingProgress([
      { id: 'a', title: 'A', hint: '', done: true },
    ]);
    assert.equal(rail.complete, true);
  });
});

describe('nextPlayable / claimableStages', () => {
  it('finds the next playable and the claimable stages', () => {
    const stages = [
      stage({ index: 1, cleared: true }),
      stage({ index: 2 }),
      stage({ index: 3, unlocked: false }),
    ];
    assert.equal(nextPlayable(stages)?.index, 2);
    assert.deepEqual(
      claimableStages(stages).map((s) => s.index),
      [1]
    );
  });

  it('falls back to a cleared-but-unclaimed stage', () => {
    const stages = [stage({ index: 1, cleared: true, unlocked: true })];
    assert.equal(nextPlayable(stages)?.index, 1);
  });

  it('is null when the ladder is done', () => {
    assert.equal(
      nextPlayable([stage({ cleared: true, claimed: true })]),
      null
    );
  });
});
