import { MatchSide } from '../classes/MatchSide';

/** Why the current possession sequence began. `restart` covers every
 * dead-ball handover (kickoff, half-time, post-goal, post-ball-out,
 * penalty/free-kick - see `Referee.markRestart()`'s two call sites);
 * `turnover` is any in-play change of possession the tracker detects on
 * its own (the team holding the ball this tick differs from last tick);
 * `continuation` is every other tick of an already-running spell. */
export type PossessionReason = 'restart' | 'turnover' | 'continuation';

export interface PossessionContext {
  /** 0 before the very first sequence has started (should never be
   * observed live - `Game.startHalf()` always restarts before the first
   * tick runs). */
  sequenceId: number;
  teamId?: string;
  reason: PossessionReason;
  /** Minutes elapsed since this sequence began (`Match.getCurrentTime` is
   * itself minute-granularity, so this is too - fine for a "was this
   * within the last minute" transition window, not meant for sub-minute
   * precision). */
  minutesSinceStart: number;
}

export interface PossessionSequenceSummary {
  sequenceId: number;
  teamId: string;
  teamCode: string;
  reason: PossessionReason;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
}

/**
 * Milestone 11 (Possession And Match Phases) - the engine never tracked
 * "how long has this team had the ball, and since when" as a first-class
 * thing before this; `WithBall` only ever said who has it *right now*.
 * One instance per match, owned by `Match` (mirrors `Details`/`Events`)
 * so `Referee` (restarts) and the possession-crediting transition
 * (turnovers, every tick) can both reach the same tracker.
 */
export class PossessionTracker {
  private nextSequenceId = 1;
  private currentSequenceId = 0;
  private currentTeamId?: string;
  private currentTeamCode?: string;
  private sequenceStartMinute = 0;
  private sequenceReason: PossessionReason = 'restart';
  private pendingRestart = false;
  private completed: PossessionSequenceSummary[] = [];

  /** Called ahead of any dead-ball handover (kickoff/half-time/post-goal/
   * post-ball-out/penalty/free-kick) so the next `update()` starts a fresh
   * sequence tagged 'restart' - even if the same team ends up with the
   * ball again (e.g. an attacking free-kick), since a restart is still a
   * distinct spell from whatever was happening before the stoppage. */
  public markRestart(): void {
    this.pendingRestart = true;
  }

  /**
   * Advance the tracker by one tick. `holder` is the side currently
   * holding the ball (undefined when the ball is loose - the tracker
   * doesn't start a sequence until someone actually has it). Call once per
   * tick, from the same chokepoint that already credits a tick's
   * possession stat (`applyPossessionChange`, transitions/index.ts).
   */
  public update(
    minute: number,
    holder: MatchSide | undefined
  ): PossessionContext & { isNew: boolean } {
    if (!holder) {
      return { ...this.context(minute), isNew: false };
    }

    const isFirstEver = this.currentTeamId === undefined;
    const isRestart = this.pendingRestart || isFirstEver;
    const teamChanged = !isFirstEver && holder._id !== this.currentTeamId;
    const startNew = isRestart || teamChanged;

    if (startNew) {
      if (!isFirstEver) {
        this.completed.push({
          sequenceId: this.currentSequenceId,
          teamId: this.currentTeamId!,
          teamCode: this.currentTeamCode!,
          reason: this.sequenceReason,
          startMinute: this.sequenceStartMinute,
          endMinute: minute,
          durationMinutes: minute - this.sequenceStartMinute,
        });
      }

      this.currentSequenceId = this.nextSequenceId++;
      this.currentTeamId = holder._id;
      this.currentTeamCode = holder.ClubCode;
      this.sequenceStartMinute = minute;
      this.sequenceReason = isRestart ? 'restart' : 'turnover';
    }

    this.pendingRestart = false;

    return { ...this.context(minute), isNew: startNew };
  }

  /** Read the current sequence's context without advancing anything -
   * used by decision-time code (`Actions.takeAction()`, via
   * `Match.getPossessionContext()`) that must ask "what's the state as of
   * the start of this tick", not force a tick's worth of bookkeeping just
   * to ask. */
  public peek(minute: number): PossessionContext {
    return this.context(minute);
  }

  public getCompletedSequences(): PossessionSequenceSummary[] {
    return [...this.completed];
  }

  private context(minute: number): PossessionContext {
    return {
      sequenceId: this.currentSequenceId,
      teamId: this.currentTeamId,
      reason: this.sequenceReason,
      minutesSinceStart: minute - this.sequenceStartMinute,
    };
  }
}
