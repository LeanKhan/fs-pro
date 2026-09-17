/**
 * Milestone 22 (Behavior Regression Suite) - "replay sanity checks for
 * shape, ball ownership, and event ordering" / "no match can finish with
 * invalid ball ownership or corrupted player state".
 *
 * Operates on a completed `Match` object's own recorded `Frames`/`Events`
 * (the same per-tick payload already sent over sockets for live replay -
 * see `IMatchFrame`/`IMatchEvent` in `simulation/classes/Match.ts`), not a
 * separate simulation pass - this is a pure, side-effect-free inspector.
 *
 * The single-ball-owner invariant in particular is the exact thing
 * Milestone 17 (Independent Ball Model, `Ball.holderId` as the one
 * canonical owner) was built to make "structurally impossible" to violate -
 * a passing result here is expected; a failure would mean a real
 * regression back into the pre-Milestone-17 "2 players simultaneously have
 * WithBall" bug class (see Milestone 1's tracker notes on that exact
 * intermittent crash).
 */
import { Match, IMatchEvent } from '../simulation/classes/Match';

export interface IReplayViolation {
  kind:
    | 'multiple-ball-owners'
    | 'non-monotonic-tick'
    | 'non-monotonic-minute'
    | 'unknown-event-type'
    | 'dangling-event-player'
    | 'invalid-half';
  detail: string;
}

const KNOWN_EVENT_TYPES = new Set<IMatchEvent['type']>([
  'match',
  'shot',
  'miss',
  'save',
  'goal',
  'dribble',
  'tackle',
  'pass',
  'interception',
  'foul',
  'substitution',
]);

/**
 * Checks one completed match's `Frames`/`Events` for the invariants this
 * milestone's acceptance criteria name. Returns an empty array for a clean
 * match - callers should treat any non-empty result as a real regression,
 * not a warning to ignore.
 */
export function checkMatchInvariants(match: Match): IReplayViolation[] {
  const violations: IReplayViolation[] = [];

  const knownPlayerIds = new Set<string>([
    ...match.Home.ActivePlayers.map((p) => String(p._id)),
    ...match.Away.ActivePlayers.map((p) => String(p._id)),
    // Substituted-off/sent-off players are excluded from ActivePlayers by
    // design (Milestone 6/17's own StartingSquad-vs-ActivePlayers fix) but
    // can still be the subject of a past event (e.g. their own
    // substitution-off event, or a goal scored before being subbed) - walk
    // the full StartingSquad too so those don't false-positive as dangling.
    ...match.Home.StartingSquad.map((p) => String(p._id)),
    ...match.Away.StartingSquad.map((p) => String(p._id)),
  ]);

  let lastTick = -Infinity;
  let lastMinute = -Infinity;

  for (const frame of match.Frames) {
    if (frame.half !== 1 && frame.half !== 2) {
      violations.push({
        kind: 'invalid-half',
        detail: `Frame at tick ${frame.tick} has half=${frame.half}`,
      });
    }

    if (frame.tick < lastTick) {
      violations.push({
        kind: 'non-monotonic-tick',
        detail: `Frame tick went from ${lastTick} to ${frame.tick}`,
      });
    }
    lastTick = frame.tick;

    if (frame.minute < lastMinute) {
      violations.push({
        kind: 'non-monotonic-minute',
        detail: `Frame minute went from ${lastMinute} to ${frame.minute} (tick ${frame.tick})`,
      });
    }
    lastMinute = frame.minute;

    const owners = frame.players.filter((p) => p.withBall);
    if (owners.length > 1) {
      violations.push({
        kind: 'multiple-ball-owners',
        detail: `Tick ${frame.tick} has ${owners.length} players simultaneously withBall (${owners.map((o) => o.id).join(', ')})`,
      });
    }

    for (const event of frame.events) {
      if (!KNOWN_EVENT_TYPES.has(event.type)) {
        violations.push({
          kind: 'unknown-event-type',
          detail: `Tick ${frame.tick} has event of unknown type "${event.type}"`,
        });
      }
      if (event.playerID && !knownPlayerIds.has(String(event.playerID))) {
        violations.push({
          kind: 'dangling-event-player',
          detail: `Tick ${frame.tick} event "${event.type}" references unknown playerID ${event.playerID}`,
        });
      }
    }
  }

  return violations;
}

export function summarizeViolations(
  label: string,
  violations: IReplayViolation[]
): string {
  if (violations.length === 0) {
    return `${label}: OK (0 violations)`;
  }
  return (
    `${label}: ${violations.length} violation(s):\n` +
    violations.map((v) => `  - [${v.kind}] ${v.detail}`).join('\n')
  );
}
