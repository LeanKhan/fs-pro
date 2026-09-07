import { EventEmitter } from 'events';
import { CandidateAction } from './CandidateAction';

/**
 * Milestone 18 - "track decision score and chosen action in debug events"
 * (this milestone's own task). A separate, match-scoped stream from
 * `simulation/utils/events.ts`'s `matchEvents` - that one feeds
 * commentary/replay (`Match.Events`, bounded, user-facing); this one is a
 * full ranked-candidate record for every single decision a ball carrier
 * makes, useful for training-data collection (the plan doc's own Phase 21
 * framing) or a verification script, not something the match result
 * payload or commentary UI should ever be flooded with.
 */
export interface DecisionDebugEvent {
  matchId: string;
  playerId: string;
  position: string;
  candidates: CandidateAction[];
  chosen: CandidateAction;
}

export const decisionEvents = new EventEmitter();
decisionEvents.setMaxListeners(24);

export function recordDecision(event: DecisionDebugEvent): void {
  decisionEvents.emit(`${event.matchId}-decision`, event);
}
