import { IStrategy } from '../state/ImmutableState/Actions/Decider';
import { PassType } from '../passing/PassingOption';

/**
 * Milestone 7 - a cleaner, better-named TYPE than today's `IStrategy`
 * (`{type, detail?: string}`). Milestone 13 (Passing Options And Decision
 * Evaluation) is what finally makes it a RICHER one too: `passType` now
 * covers all five scored pass shapes (`PassType`, plus the older
 * `'pass-to-post'` special case - see `Decider.whatKindaPass()`), and
 * `targetId` carries the actually-chosen receiver when one exists. Note
 * `shotType`/passing detail for a `'move'` intent were already unread by
 * `Actions.takeAction()`'s switch before Milestone 7's own pass (confirmed:
 * `shoot()`/`movePlayersForward()` never inspected `IStrategy.detail`) -
 * that stays true here too, nothing regresses.
 */
export type PlayerIntent =
  | { kind: 'pass'; passType: PassType | 'pass-to-post'; targetId?: string }
  | { kind: 'shoot'; shotType: 'normal' | 'long' }
  | { kind: 'move' };

/** Lossless mapper from today's Decider output - see the round-trip
 * check in the simulation-engine-isolation plan's verification section. */
export function toPlayerIntent(strategy: IStrategy): PlayerIntent {
  if (strategy.type === 'pass') {
    const passType = (
      strategy.detail === 'pass to post' ? 'pass-to-post' : strategy.detail
    ) as PassType | 'pass-to-post';
    return { kind: 'pass', passType, targetId: strategy.target };
  }

  if (strategy.type === 'shoot') {
    return { kind: 'shoot', shotType: strategy.detail === 'long' ? 'long' : 'normal' };
  }

  return { kind: 'move' };
}

/** Inverse of `toPlayerIntent` - lets `Actions.takeAction()`'s existing
 * switch-on-`IStrategy` (unchanged - the outcome/execution side) keep
 * working unmodified. */
export function toStrategy(intent: PlayerIntent): IStrategy {
  if (intent.kind === 'pass') {
    return {
      type: 'pass',
      detail: intent.passType === 'pass-to-post' ? 'pass to post' : intent.passType,
      target: intent.targetId,
    };
  }

  if (intent.kind === 'shoot') {
    return { type: 'shoot', detail: intent.shotType };
  }

  return { type: 'move', detail: 'normal' };
}
