/**
 * Public surface of the match-simulation engine - the "how do I actually
 * run a match" entry points, as opposed to the various internal types
 * (IMatchEvent, ITactic, etc) other server files reference directly from
 * their specific moved file. This barrel is deliberately narrow: it's
 * exactly what would become a future `packages/simulation`'s
 * `src/index.ts` if this ever gets extracted into a real workspace
 * package (see the simulation-engine-isolation plan) - keep it scoped to
 * genuine entry points, not every internal type.
 */
export { default as Game } from './controllers/Game';
export type { AdvanceUntil, AdvanceResult } from './controllers/Game';
export { default as Coordinates } from './utils/coordinates';
export { matchEvents, ballMove, createMatchEvent } from './utils/events';
export { createMatchStateSnapshot, matchStateToDetails } from './state/MatchState';
export { createRandomSource, SeededRandomSource } from './randomness';
export {
  applyTacticalChange,
  applySubstitution,
  applyCard,
  applyGoal,
  applyPossessionChange,
  applyMatchEvent,
} from './transitions';
export type { TransitionResult } from './transitions';
export type { ITactic } from './state/PersistentState/Formations';
export type {
  BallState,
  MatchState,
  PlayerMatchState,
  PossessionState,
  SimulationTactic,
  TeamMatchState,
} from './state/MatchState';
export type { RandomSource, RandomState } from './randomness';
