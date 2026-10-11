import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { preseasonContract } from './routes/preseason';
import {
  PreseasonClaimResultSchema,
  PreseasonPlayResultSchema,
  PreseasonProgressSchema,
  type PreseasonProgress,
} from './schemas/preseason';

/** A payload with exactly the shape internal/preseason's read model emits. */
function sampleProgress(): PreseasonProgress {
  return {
    clubId: 'c1',
    name: 'Onboard United',
    stages: [
      {
        index: 1,
        code: 'PRE-01',
        name: 'Pre-Season Opener',
        opponent: 'Rusthall Rovers',
        rating: 12,
        requiredStars: 3,
        reward: { cash: 5000, fans: 50, scoutTokens: 0, sponsorCredits: 0 },
        bestStars: 3,
        attempts: 1,
        cleared: true,
        claimed: false,
        unlocked: true,
      },
      {
        index: 2,
        code: 'PRE-02',
        name: 'County Cup Warm-up',
        opponent: 'Marsh End Athletic',
        rating: 16,
        requiredStars: 3,
        reward: { cash: 8000, fans: 80, scoutTokens: 0, sponsorCredits: 0 },
        bestStars: 0,
        attempts: 0,
        cleared: false,
        claimed: false,
        unlocked: true,
      },
    ],
    cleared: 1,
    total: 10,
    totalStars: 3,
    onboarding: [
      { id: 'build_collector', title: 'Build your first collector', hint: 'Upgrade Turnstiles.', done: false },
    ],
    onboardingComplete: false,
    nextStage: 2,
  };
}

describe('preseason contract', () => {
  it('accepts the Go handler read-model shape', () => {
    const parsed = PreseasonProgressSchema.safeParse(sampleProgress());
    assert.equal(parsed.success, true);
  });

  it('rejects a stage star requirement outside 1..3', () => {
    const bad = sampleProgress();
    bad.stages[0]!.requiredStars = 4;
    assert.equal(PreseasonProgressSchema.safeParse(bad).success, false);
  });

  it('accepts the play result and claim result shapes', () => {
    const progress = sampleProgress();
    const play = {
      stage: 1,
      cleared: true,
      stars: 3,
      bestStars: 3,
      score: { you: 3, them: 0 },
      reward: { cash: 5000, fans: 50, scoutTokens: 0, sponsorCredits: 0 },
      claimable: true,
      progress,
    };
    assert.equal(PreseasonPlayResultSchema.safeParse(play).success, true);
    const claim = {
      stage: 1,
      granted: { cash: 5000, fans: 50, scoutTokens: 0, sponsorCredits: 0 },
      progress,
    };
    assert.equal(PreseasonClaimResultSchema.safeParse(claim).success, true);
  });

  it('is prefixed under /preseason with the declined status set', () => {
    assert.equal(preseasonContract.get.path, '/preseason/:clubId');
    assert.equal(preseasonContract.get.method, 'GET');
    assert.equal(preseasonContract.play.path, '/preseason/:clubId/play');
    assert.equal(preseasonContract.play.method, 'POST');
    assert.equal(preseasonContract.claim.path, '/preseason/:clubId/claim');
    assert.deepEqual(Object.keys(preseasonContract.play.responses).map(Number).sort((a, b) => a - b), [
      200, 400, 401, 403, 404, 409,
    ]);
  });
});
