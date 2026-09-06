import { IStrategy } from '../state/ImmutableState/Actions/Decider';

/**
 * Milestone 7 - a cleaner, better-named TYPE than today's `IStrategy`
 * (`{type, detail?: string}`), not yet a RICHER one. The actual pass
 * receiver still isn't chosen here - `Actions.pass()` still resolves it
 * from `passType` alone, exactly as it resolves it from `detail` today.
 * Giving this a real `targetId` needs real candidate-receiver scoring -
 * that's Milestone 13's job (Passing Options And Decision Evaluation),
 * not this one. Note `shotType`/passing detail for a `'move'` intent
 * were already unread by `Actions.takeAction()`'s switch before this
 * pass (confirmed: `shoot()`/`movePlayersForward()` never inspected
 * `IStrategy.detail`) - that stays true here too, nothing regresses.
 */
export type PlayerIntent =
  | { kind: 'pass'; passType: 'short' | 'long' | 'pass-to-post' }
  | { kind: 'shoot'; shotType: 'normal' | 'long' }
  | { kind: 'move' };

/** Lossless mapper from today's Decider output - see the round-trip
 * check in the simulation-engine-isolation plan's verification section. */
export function toPlayerIntent(strategy: IStrategy): PlayerIntent {
  if (strategy.type === 'pass') {
    const passType: 'short' | 'long' | 'pass-to-post' =
      strategy.detail === 'pass to post'
        ? 'pass-to-post'
        : strategy.detail === 'long'
          ? 'long'
          : 'short';
    return { kind: 'pass', passType };
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
    };
  }

  if (intent.kind === 'shoot') {
    return { type: 'shoot', detail: intent.shotType };
  }

  return { type: 'move', detail: 'normal' };
}
