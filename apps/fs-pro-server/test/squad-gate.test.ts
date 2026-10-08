import { describe, expect, it } from 'vitest';
import { MIN_GOALKEEPERS, MIN_SQUAD_SIZE, ProgramGateError, gateProblem } from '../src/services/program/squad-gate';

/**
 * The PLAY squad gate (L5): a club cannot play until it has a manager and a
 * legal matchday squad. `gateProblem` is the pure decision, so the exact
 * minimum is pinned here without a database.
 */

const legal = { total: 11, gk: 1 };

describe('gateProblem', () => {
  it('lets a club with a manager and 11 players (1 keeper) play', () => {
    expect(gateProblem('m1', legal)).toBeNull();
    expect(gateProblem('m1', { total: 16, gk: 2 })).toBeNull();
  });

  it('refuses without a manager', () => {
    const problem = gateProblem(null, legal);
    expect(problem).toBeInstanceOf(ProgramGateError);
    expect(problem?.code).toBe('no_manager');
  });

  it('refuses without a keeper, even at 11 players', () => {
    const problem = gateProblem('m1', { total: 11, gk: 0 });
    expect(problem?.code).toBe('no_keeper');
  });

  it('refuses below 11 players, even with a keeper', () => {
    const problem = gateProblem('m1', { total: 10, gk: 1 });
    expect(problem?.code).toBe('no_squad');
    expect(MIN_SQUAD_SIZE).toBe(11);
    expect(MIN_GOALKEEPERS).toBe(1);
  });

  it('checks the manager before the squad', () => {
    expect(gateProblem(null, { total: 0, gk: 0 })?.code).toBe('no_manager');
  });
});
