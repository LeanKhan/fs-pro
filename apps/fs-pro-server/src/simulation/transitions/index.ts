/**
 * Milestone 6 (Explicit Transitions) - see the simulation-engine-isolation
 * plan for the full scoping rationale. Six named ways a match's state can
 * legitimately change, each validated (rejects instead of silently
 * corrupting state) and each reporting the structured event(s) it caused.
 *
 * Investigation before writing this found that "validation that can
 * reject" is a genuinely new concept here - every existing mutation path
 * (tactic change, substitution, card, goal, possession) is unconditional
 * today, and nothing live ever attempts an invalid one (the half-time sub
 * auto-planner and the tactic-swap caller are both structurally incapable
 * of producing bad input). So these functions are infrastructure for a
 * *future* caller (a human/AI manager decision surface - Milestone 7/21,
 * not built yet) - they validate + delegate to the existing, unmodified
 * mutation code, rather than replacing any calibrated internals.
 *
 * All six take already-resolved domain objects, never raw ID strings -
 * resolving an id to an object is the caller's job, same as it already is
 * everywhere else at this layer.
 *
 * `Match`/`Referee`/`Game` are imported as types only (never constructed
 * here) - keeps this module type-only in their direction of the module
 * graph even though `Match.ts`/`Referee.ts` import this module for real
 * calls, avoiding a runtime circular-require.
 */
import type { Match } from '../classes/Match';
import type Referee from '../classes/Referee';
import type Game from '../controllers/Game';
import { MatchSide, MAX_SUBSTITUTIONS } from '../classes/MatchSide';
import Player from '../classes/Player';
import { IFieldPlayer } from '../../interfaces/Player';
import { IBlock } from '../state/ImmutableState/FieldGrid';
import { IMatchEvent } from '../classes/Match';
import { createMatchEvent } from '../utils/events';
import {
  ITactic,
  formationShapes,
  PLAYING_STYLES,
} from '../state/PersistentState/Formations';

export type TransitionResult<T = void> =
  | { success: true; data: T; events: IMatchEvent[] }
  | { success: false; error: string };

function ok<T>(data: T, events: IMatchEvent[] = []): TransitionResult<T> {
  return { success: true, data, events };
}

function fail(error: string): TransitionResult<never> {
  return { success: false, error };
}

/** Emits via the existing single event chokepoint and hands back the
 * plain event object too, so callers can inspect what just landed in
 * Match.Events without re-reading it back out. */
function emit(
  matchId: string,
  message: string,
  type: IMatchEvent['type'],
  playerID?: string,
  playerTeamID?: string
): IMatchEvent {
  createMatchEvent(matchId, message, type, playerID, playerTeamID);
  return { message, type, playerID, playerTeamID } as IMatchEvent;
}

/**
 * Change a side's tactic (formation + playing style). Rejects if the
 * squad isn't in the one shape `MatchSide.changeTactic()` can safely
 * re-walk, or if the tactic doesn't resolve to a known formation/style.
 *
 * The check is `StartingSquad.length !== 11`, NOT `ActivePlayers.length`
 * - `changeTactic()` re-walks the raw `StartingSquad` array (which keeps
 * growing across substitutions - an outgoing player is marked
 * 'substituted' but never removed, same as 'sent-off'), not the
 * ActivePlayers-filtered view. A single substitution leaves
 * ActivePlayers.length back at 11 (10 still-active originals + 1
 * incoming) while StartingSquad.length is 12 - checking ActivePlayers
 * here would pass validation and then crash inside changeTactic() itself
 * (confirmed live while writing this - see the simulation-engine-
 * isolation plan's verification notes).
 */
export function applyTacticalChange(params: {
  game: Game;
  side: MatchSide;
  tactic: ITactic;
  /** Defaults to the side's current ends - pass explicit new ones for a
   * half-time end-swap (see Game.swapClubFormations()), which changes
   * ends as well as (optionally) the tactic itself. */
  scoringSide?: IBlock;
  keepingSide?: IBlock;
}): TransitionResult<void> {
  const { game, side, tactic } = params;
  const scoringSide = params.scoringSide ?? side.ScoringSide;
  const keepingSide = params.keepingSide ?? side.KeepingSide;

  if (side.StartingSquad.length !== 11) {
    return fail(
      `Cannot change tactic - ${side.Name} has ${side.StartingSquad.length} squad entries, not 11 (changeTactic() can only safely re-walk a full, unsubstituted squad - once a substitution has happened this side can no longer have its tactic changed this pass).`
    );
  }

  if (!formationShapes[tactic.formationName]) {
    return fail(`Unknown formation "${tactic.formationName}".`);
  }

  if (!PLAYING_STYLES[tactic.styleName]) {
    return fail(`Unknown playing style "${tactic.styleName}".`);
  }

  side.changeTactic(tactic, game.Field, scoringSide, keepingSide);

  const event = emit(
    game.Match.id,
    `${side.Name} [${side.ClubCode}] changed tactics to ${tactic.formationName} (${tactic.styleName})`,
    'match'
  );

  return ok(undefined, [event]);
}

/**
 * Substitute one player for another on the same side. Rejects if either
 * player isn't where they need to be (outgoing on the pitch, incoming on
 * the bench), if either is a GK (see `MatchSide.planHalfTimeSubstitutions()`'s
 * doc comment for why goalkeeper subs aren't supported at all), or if
 * this side has already used its `MAX_SUBSTITUTIONS` for the match.
 */
export function applySubstitution(params: {
  game: Game;
  side: MatchSide;
  outgoing: IFieldPlayer;
  incoming: Player;
}): TransitionResult<void> {
  const { game, side, outgoing, incoming } = params;

  if (!side.ActivePlayers.includes(outgoing)) {
    return fail(
      `${outgoing.FirstName} ${outgoing.LastName} is not an active player for ${side.Name}.`
    );
  }

  if (!side.Substitutes.includes(incoming)) {
    return fail(
      `${incoming.FirstName} ${incoming.LastName} is not on ${side.Name}'s bench.`
    );
  }

  if (outgoing.Position === 'GK' || incoming.Position === 'GK') {
    return fail('Goalkeeper substitutions are not supported.');
  }

  if (side.SubstitutionsUsed >= MAX_SUBSTITUTIONS) {
    return fail(
      `${side.Name} has already used all ${MAX_SUBSTITUTIONS} substitutions.`
    );
  }

  side.substitutePlayer(outgoing, incoming, game.MatchBall);
  side.SubstitutionsUsed++;

  const event = emit(
    game.Match.id,
    `${side.Name} [${side.ClubCode}] substitution: ${incoming.FirstName} ${incoming.LastName} replaces ${outgoing.FirstName} ${outgoing.LastName}`,
    'substitution',
    incoming._id,
    side.ClubCode
  );

  return ok(undefined, [event]);
}

/**
 * Book a card. Rejects if the player is already sent off (today's one
 * pre-existing guard, `Referee.sendOff()`'s double-send-off bail, now a
 * real rejection here instead of a silent no-op several calls deep).
 * Delegates to the existing `Referee.bookPlayer()` (yellow-count/second-
 * yellow/red/send-off logic, unchanged) rather than re-implementing it.
 *
 * Deliberately emits NO event of its own - the engine's existing foul
 * narration (`Match`'s `-game-halt` listener, which fires for every foul
 * whether carded or not, and `-player-sent-off` for the send-off itself)
 * already covers this. A future caller issuing a card OUTSIDE that foul
 * chain (e.g. a standalone referee-override tool) can call
 * `applyMatchEvent` alongside this one for its own narration - kept
 * separate rather than this function guessing whether narration is
 * wanted, since duplicating it here would double-up events for every
 * live in-match card.
 */
export function applyCard(params: {
  referee: Referee;
  player: IFieldPlayer;
  cardType: 'yellow' | 'red';
}): TransitionResult<void> {
  const { referee, player, cardType } = params;

  if (player.MatchStatus === 'sent-off') {
    return fail(
      `${player.FirstName} ${player.LastName} has already been sent off.`
    );
  }

  referee.bookPlayer(player, cardType);

  return ok(undefined, []);
}

/**
 * Record a goal. Rejects if the scorer isn't currently an active player
 * (sent off/substituted players can't score). Delegates to
 * `Match.recordGoal()` - an extract-method of the exact score/stat
 * mutation the engine's own `-goal!` listener already performs; that
 * listener now calls this same transition instead of inlining it.
 *
 * Deliberately emits NO event of its own - `Referee.handleShot()`'s
 * `'goal'` case already narrates every goal (separately from the score
 * mutation this function performs - see the simulation-engine-isolation
 * plan's note on goal being two independent listener chains off one
 * `Actions.shoot()` call). Emitting here too would double every live
 * goal's event. A future caller recording a goal outside that shot-
 * resolution chain can call `applyMatchEvent` alongside this one.
 */
export function applyGoal(params: {
  match: Match;
  scorer: IFieldPlayer;
  keeper: IFieldPlayer;
}): TransitionResult<void> {
  const { match, scorer, keeper } = params;

  if (scorer.MatchStatus !== 'active') {
    return fail(
      `${scorer.FirstName} ${scorer.LastName} is not an active player and cannot score.`
    );
  }

  match.recordGoal(scorer, keeper);

  return ok(undefined, []);
}

/**
 * Credit one tick's possession to a side. Rejects if `side` isn't one of
 * this match's own two sides. Delegates to the existing
 * `Match.recordPossession()`, unchanged - a stats counter only.
 *
 * Deliberately emits NO event - this runs every tick (~180x/match) and
 * would flood `Match.Events` with noise. Also deliberately does NOT
 * touch `WithBall` - today's real "who has the ball" mechanism is
 * implicit (FieldPlayer.pass()/shoot()/checkWithBall() and the shared
 * ball-move broadcast), not a discrete, ownable thing yet. Making
 * possession a real, validatable transition in that sense is Milestone
 * 17's job (Independent Ball Model) - this function only formalizes
 * today's stats-counter side effect, not the underlying mechanism.
 */
export function applyPossessionChange(params: {
  match: Match;
  side: MatchSide;
}): TransitionResult<void> {
  const { match, side } = params;

  if (side !== match.Home && side !== match.Away) {
    return fail('Side does not belong to this match.');
  }

  match.recordPossession(side);

  return ok(undefined, []);
}

/**
 * Generic structured match event - thin pass-through to the existing
 * `createMatchEvent()`, which was already the single chokepoint every
 * other transition's own narration (and every other in-match event -
 * shots, saves, dribbles, tackles, interceptions) already flows through.
 * Kept here for naming symmetry with the tracker's six-name list; always
 * succeeds (nothing to validate - it's just an event).
 */
export function applyMatchEvent(params: {
  matchId: string;
  message: string;
  type: IMatchEvent['type'];
  playerID?: string;
  playerTeamID?: string;
}): TransitionResult<void> {
  const { matchId, message, type, playerID, playerTeamID } = params;
  const event = emit(matchId, message, type, playerID, playerTeamID);
  return ok(undefined, [event]);
}
