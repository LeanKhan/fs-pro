import { describe, expect, it } from 'vitest';
import type { MatchPlan } from '@repo/api-contract';
import {
  applyPlanToClub,
  counterTo,
  NO_HALF_TIME,
  nudgeSkills,
  parseSideTactic,
  planEffect,
  PLAN_TUNING,
  planTactic,
  styleKey,
  styleMatchup,
} from '../src/services/play/plan-effects';

/**
 * Unit tests for src/services/play/plan-effects.ts (pure module: no DB, no
 * match pipeline). These lock the current behaviour the match-day preview
 * and the engine request share; see the module's header comment.
 */

const plan = (over: Partial<MatchPlan> = {}): MatchPlan => ({
  formation: '433',
  style: 'Balanced',
  startingXI: [],
  bench: [],
  halfTime: { losing: null, drawing: null, winning: null },
  training: 'none',
  teamTalk: 'calm',
  ...over,
});

const ctx = (over: Partial<Parameters<typeof planEffect>[1]> = {}) => ({
  myPower: 50,
  oppPower: 50,
  morale: 60,
  trainingTier: 0,
  ...over,
});

describe('styleKey', () => {
  it('normalises spacing, separators and case', () => {
    expect(styleKey('High Press')).toBe('HighPress');
    expect(styleKey('high_press')).toBe('HighPress');
    expect(styleKey('HighPress')).toBe('HighPress');
    expect(styleKey('low-block')).toBe('LowBlock');
    expect(styleKey('possession')).toBe('Possession');
    expect(styleKey('direct')).toBe('Direct');
    expect(styleKey('balanced')).toBe('Balanced');
  });

  it('falls back to Balanced for anything it does not know', () => {
    expect(styleKey('gegenpress')).toBe('Balanced');
    expect(styleKey(undefined)).toBe('Balanced');
    expect(styleKey(null)).toBe('Balanced');
    expect(styleKey(42)).toBe('Balanced');
    expect(styleKey('')).toBe('Balanced');
  });
});

describe('styleMatchup (engine counter cycle)', () => {
  it('returns 1 when own counters opp, -1 the other way', () => {
    expect(styleMatchup('HighPress', 'Possession')).toBe(1);
    expect(styleMatchup('Possession', 'HighPress')).toBe(-1);
    expect(styleMatchup('Possession', 'LowBlock')).toBe(1);
    expect(styleMatchup('LowBlock', 'Direct')).toBe(1);
    expect(styleMatchup('Direct', 'HighPress')).toBe(1);
  });

  it('returns 0 for neutral pairs and Balanced', () => {
    expect(styleMatchup('HighPress', 'LowBlock')).toBe(0);
    expect(styleMatchup('HighPress', 'HighPress')).toBe(0);
    expect(styleMatchup('Balanced', 'Direct')).toBe(0);
    expect(styleMatchup('Direct', 'Balanced')).toBe(0);
  });
});

describe('counterTo', () => {
  it('names the style that beats the given style', () => {
    expect(counterTo('Possession')).toBe('HighPress');
    expect(counterTo('LowBlock')).toBe('Possession');
    expect(counterTo('Direct')).toBe('LowBlock');
    expect(counterTo('HighPress')).toBe('Direct');
  });

  it('has no counter for Balanced', () => {
    expect(counterTo('Balanced')).toBeNull();
  });
});

describe('planTactic', () => {
  it('maps sliders onto the engine fields and keeps the whole plan', () => {
    const p = plan({
      style: 'HighPress',
      sliders: { pressing: 0.7, line: 0.2 },
    });
    const tactic = planTactic(p);
    expect(tactic.formationName).toBe('433');
    expect(tactic.styleName).toBe('HighPress');
    expect(tactic.pressingIntensity).toBe(0.7);
    expect(tactic.defensiveLineHeight).toBe(0.2);
    expect(tactic.width).toBeUndefined();
    expect(tactic.tempo).toBeUndefined();
    expect(tactic.directness).toBeUndefined();
    expect(tactic.halfTime).toEqual(NO_HALF_TIME);
    expect(tactic.plan).toBe(p);
  });

  it('tolerates a plan with no sliders', () => {
    const tactic = planTactic(plan());
    expect(tactic.pressingIntensity).toBeUndefined();
    expect(tactic.plan).toBeDefined();
  });
});

describe('planEffect', () => {
  it('does nothing for calm + no training', () => {
    const effect = planEffect(plan(), ctx());
    expect(effect.skill).toBe(0);
    expect(effect.starterFitness).toBe(0);
    expect(effect.notes).toEqual([]);
  });

  it('recovery freshens the starters by the tuning value', () => {
    const effect = planEffect(plan({ training: 'recovery' }), ctx());
    expect(effect.skill).toBe(0);
    expect(effect.starterFitness).toBe(PLAN_TUNING.recoveryFitness);
    expect(effect.notes).toHaveLength(1);
    expect(effect.notes[0]!.label).toBe('Recovery session');
    expect(effect.notes[0]!.tone).toBe('good');
  });

  it('drills add sharpness scaled by the training tier and cost fitness', () => {
    const effect = planEffect(plan({ training: 'drills' }), ctx({ trainingTier: 4 }));
    const sharp = PLAN_TUNING.drillsBase + PLAN_TUNING.drillsPerTrainingTier * 4;
    expect(sharp).toBeCloseTo(2.0, 10);
    expect(effect.skill).toBeCloseTo(sharp, 10);
    expect(effect.starterFitness).toBe(-PLAN_TUNING.drillsFitnessCost);
    expect(effect.notes[0]!.label).toBe('Tactical drills');
  });

  it('motivate saves the big lift for underdogs', () => {
    const favourite = planEffect(plan({ teamTalk: 'motivate' }), ctx({ myPower: 50, oppPower: 50 }));
    expect(favourite.skill).toBeCloseTo(PLAN_TUNING.motivateFavourite, 10);

    const underdog = planEffect(plan({ teamTalk: 'motivate' }), ctx({ myPower: 50, oppPower: 55 }));
    expect(underdog.skill).toBeCloseTo(PLAN_TUNING.motivateUnderdog, 10);
  });

  it('demand lands only for a confident, non-underdog side', () => {
    const lands = planEffect(plan({ teamTalk: 'demand' }), ctx({ myPower: 60, oppPower: 50, morale: 58 }));
    expect(lands.skill).toBeCloseTo(PLAN_TUNING.demandConfident, 10);
    expect(lands.notes[0]!.tone).toBe('good');
  });

  it('demand backfires on low morale', () => {
    const bad = planEffect(plan({ teamTalk: 'demand' }), ctx({ myPower: 60, oppPower: 50, morale: 57 }));
    expect(bad.skill).toBeCloseTo(PLAN_TUNING.demandBackfire, 10);
    expect(bad.notes[0]!.tone).toBe('bad');
  });

  it('demand backfires when the side is the underdog, however good the morale', () => {
    const bad = planEffect(plan({ teamTalk: 'demand' }), ctx({ myPower: 50, oppPower: 55, morale: 90 }));
    expect(bad.skill).toBeCloseTo(PLAN_TUNING.demandBackfire, 10);
    expect(bad.notes[0]!.detail).toBe('Too much pressure against a stronger side');
  });

  it('combines training and team talk', () => {
    const effect = planEffect(
      plan({ training: 'drills', teamTalk: 'motivate' }),
      ctx({ trainingTier: 2, myPower: 40, oppPower: 50 })
    );
    const sharp = PLAN_TUNING.drillsBase + PLAN_TUNING.drillsPerTrainingTier * 2;
    expect(effect.skill).toBeCloseTo(sharp + PLAN_TUNING.motivateUnderdog, 10);
    expect(effect.starterFitness).toBe(-PLAN_TUNING.drillsFitnessCost);
    expect(effect.notes).toHaveLength(2);
  });
});

describe('nudgeSkills', () => {
  it('shifts the club, every player and numeric attributes', () => {
    const club = {
      Rating: 50,
      Players: [{ Rating: 50, Attributes: { Pace: 50, Shooting: 99 } }],
    };
    nudgeSkills(club, 3);
    expect(club.Rating).toBe(53);
    expect(club.Players[0]!.Rating).toBe(53);
    expect(club.Players[0]!.Attributes).toEqual({ Pace: 53, Shooting: 99 });
  });

  it('clamps attributes to 1..99', () => {
    const club = { Players: [{ Attributes: { High: 99, Low: 1 } }] };
    nudgeSkills(club, 5);
    expect(club.Players[0]!.Attributes).toEqual({ High: 99, Low: 6 });
    nudgeSkills(club, -10);
    expect(club.Players[0]!.Attributes).toEqual({ High: 89, Low: 1 });
  });

  it('is a no-op at 0 points and tolerates a missing Attributes object', () => {
    const club = { Rating: 10, Players: [{ Rating: 10 }] };
    nudgeSkills(club, 0);
    expect(club).toEqual({ Rating: 10, Players: [{ Rating: 10 }] });

    nudgeSkills(club, 2);
    expect(club.Rating).toBe(12);
    expect(club.Players[0]!.Rating).toBe(12);
  });
});

describe('applyPlanToClub', () => {
  it('sets the lineup from the plan and moves only the starters', () => {
    const club = {
      Players: [
        { id: 'a', Fitness: 5 },
        { id: 'b', Fitness: 20 },
        { id: 'c', Fitness: 100 },
      ],
    };
    applyPlanToClub(club, plan({ startingXI: ['a', 'b'], bench: ['c'] }), {
      skill: 0,
      starterFitness: -10,
      notes: [],
    });
    expect(club.Lineup).toEqual({ startingXI: ['a', 'b'], bench: ['c'] });
    expect(club.Players.map((p) => p.Fitness)).toEqual([0, 10, 100]);
  });

  it('leaves the club alone without a plan or effect', () => {
    const club = { Players: [{ id: 'a', Fitness: 50 }] };
    applyPlanToClub(club, undefined, null);
    expect(club.Lineup).toBeUndefined();
    expect(club.Players[0]!.Fitness).toBe(50);

    applyPlanToClub(club, plan(), { skill: 0, starterFitness: 20, notes: [] });
    // No lineup set -> no starter matches, nothing changes.
    expect(club.Players[0]!.Fitness).toBe(50);
  });
});

describe('parseSideTactic', () => {
  it('parses a stored JSON string', () => {
    expect(parseSideTactic('{"formationName":"433","styleName":"Direct"}')).toEqual({
      formationName: '433',
      styleName: 'Direct',
    });
  });

  it('passes an already-parsed object through', () => {
    const tactic = { formationName: '442', styleName: 'Balanced' };
    expect(parseSideTactic(tactic)).toBe(tactic);
  });

  it('returns undefined for missing or invalid input', () => {
    expect(parseSideTactic(null)).toBeUndefined();
    expect(parseSideTactic(undefined)).toBeUndefined();
    expect(parseSideTactic('')).toBeUndefined();
    expect(parseSideTactic('not json')).toBeUndefined();
  });
});
