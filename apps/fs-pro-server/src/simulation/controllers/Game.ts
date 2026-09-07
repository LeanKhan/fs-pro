/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Match } from '../classes/Match';
import Ball from '../classes/Ball';
import Field, { IBlock } from '../state/ImmutableState/FieldGrid';
import { IFieldPlayer } from '../../interfaces/Player';
import { MatchSide } from '../classes/MatchSide';
import Referee from '../classes/Referee';
import { Actions } from '../state/ImmutableState/Actions/Actions';
import { matchEvents, createMatchEvent } from '../utils/events';
import { ClubInterface as IClub } from '../../controllers/clubs/club.model';
import CO, { default as Coordinates } from '../utils/coordinates';
import log from '../../helpers/logger';
import { ITactic } from '../state/PersistentState/Formations';
import {
  createRandomSource,
  RandomInput,
  RandomSource,
  setSimulationRandomSource,
} from '../randomness';
import {
  applyTacticalChange,
  applySubstitution,
  applyPossessionChange,
} from '../transitions';
import {
  TICKS_PER_MINUTE,
  HALF_TIME_TICK,
  FULL_TIME_TICK,
} from '../utils/matchClock';

// import log from ''

// import { EventEmitter } from 'events';

abstract class GameClass {
  public static instances: number;
}

/**
 * Milestone 5 (Chunked Simulation) - same-process pause/resume only (see
 * the simulation-engine-isolation plan's scope decision). `{minute:N}` is
 * clamped to [0,180] ticks (2 ticks/minute); `next-stoppage` is
 * deliberately not supported yet - it would need Actions.interruption to
 * bubble up as a real pause point, a bigger behavioral change than this
 * pass's scope.
 */
export type AdvanceUntil =
  | { minute: number }
  | { event: 'half-time' }
  | { event: 'full-time' };

export interface AdvanceResult {
  half: 1 | 2;
  minute: number;
  finished: boolean;
}

// tslint:disable-next-line: max-classes-per-file
export default class Game implements GameClass {
  public static instances = 0;
  public homePost: IBlock;
  public awayPost: IBlock;
  public Referee: Referee;
  public AS?: MatchSide;
  public DS?: MatchSide;
  public ActivePlayerAS?: IFieldPlayer;
  public ActivePlayerDS?: IFieldPlayer;
  public Match: Match;
  public MatchBall: Ball;
  public MatchSettings: any;
  public Co: Coordinates;
  private Clubs: IClub[];
  /** Public since Milestone 6's `applyTacticalChange` transition
   * (transitions/index.ts) needs it to delegate to MatchSide.changeTactic() -
   * no other behavior change. */
  public Field: Field;
  private MatchActions: Actions;
  /** Tick cursor for advanceMatch() - 0-180 (2 ticks/minute), resumable
   * across multiple calls within the same still-running Game instance. */
  private currentTick = 0;
  private halfTimeTransitionDone = false;
  private readonly random: RandomSource;

  constructor(
    clubs: IClub[],
    sides: { home: string; away: string },
    ball: { color: string; cb: IBlock },
    ref: { fname: string; lname: string; level: string },
    centerBlock: any,
    field: Field,
    Co: Coordinates,
    random?: RandomInput
  ) {
    this.Co = Co;
    this.Field = field;
    this.random = createRandomSource(random);
    setSimulationRandomSource(this.random);

    // Goal posts are resolved as fractions of the pitch (0 = one end,
    // 1 = the other), so they land in the right place regardless of the
    // grid's actual xBlocks/yBlocks. Previously these were hardcoded as
    // {x:0,y:5}/{x:14,y:5}, which only lined up with a 15x11 grid.
    this.homePost = this.Field.getBlockByFraction(0, 0.5);
    this.awayPost = this.Field.getBlockByFraction(1, 0.5);

    // save match config and all
    this.MatchSettings = {};

    // Get the club that is meant to be home
    const homeIndex = clubs.findIndex(
      (club) => club._id?.toString() === sides.home
    );

    log(`home club => ${homeIndex}`);

    // Get the club that is meant to be away
    const awayIndex = clubs.findIndex(
      (club) => club._id!.toString() === sides.away
    );

    this.Match = new Match(
      clubs[homeIndex],
      clubs[awayIndex],
      this.awayPost,
      this.homePost,
      centerBlock,
      this.random.fork('match')
    );
    this.Clubs = clubs;

    this.MatchBall = new Ball(
      '#ffffff',
      centerBlock,
      this.Match.id,
      this.random.fork('ball')
    );

    this.Referee = new Referee(
      'Anjus',
      'Banjus',
      'normal',
      this.MatchBall,
      this.Match,
      this.random.fork('referee')
    );

    this.MatchActions = new Actions(
      this.Referee,
      [this.Match.Home, this.Match.Away],
      this.Match,
      undefined,
      undefined,
      undefined,
      undefined,
      this.random.fork('actions')
    );

    /* ---------- COUNT CLASS INSTANCES ----------- */
    Game.instances++;
  }

  public setMatchBall(ball: Ball) {
    this.MatchBall = ball;
  }

  public refAssignMatch() {
    this.Referee.assignMatch(this.Match);
  }

  public setClubPlayers() {
    this.Match.Home.setPlayers();

    this.Match.Away.setPlayers();
  }

  /**
   * Initial Club Tactics (formation + playing style)
   *
   * @param homeTactic e.g. { formationName: '433', styleName: 'Balanced' }
   * (not tied to a side - attacking direction is derived from each
   * MatchSide's ScoringSide)
   * @param awayTactic
   */
  public setClubFormations(homeTactic: ITactic, awayTactic: ITactic) {
    this.MatchSettings.homeTactic = homeTactic;
    this.MatchSettings.awayTactic = awayTactic;

    this.Match.Home.setFormation(
      this.MatchSettings.homeTactic,
      this.MatchBall,
      this.Field
    );

    this.Match.Away.setFormation(
      this.MatchSettings.awayTactic,
      this.MatchBall,
      this.Field
    );
  }

  /** Swap ends at half time, keeping each side's tactic as-is. */
  public swapClubFormations() {
    // copy value
    let awayTactic = this.MatchSettings.awayTactic;
    let homeTactic = this.MatchSettings.homeTactic;

    this.MatchSettings.homeTactic = awayTactic;
    this.MatchSettings.awayTactic = homeTactic;

    // Milestone 6 (Explicit Transitions) - goes through the same
    // validated transition a live mid-match tactic change would use,
    // instead of mutating MatchSide directly. Squad is always exactly 11
    // active players here (this always runs strictly before
    // performHalfTimeSubstitutions()), so this is expected to always
    // succeed - logged if it somehow doesn't, see the simulation-engine-
    // isolation plan.
    const homeResult = applyTacticalChange({
      game: this,
      side: this.Match.Home,
      tactic: this.MatchSettings.homeTactic,
      scoringSide: this.homePost,
      keepingSide: this.awayPost,
    });
    if (!homeResult.success) {
      log(`Unexpected: half-time tactic swap rejected for Home - ${homeResult.error}`);
    }

    const awayResult = applyTacticalChange({
      game: this,
      side: this.Match.Away,
      tactic: this.MatchSettings.awayTactic,
      scoringSide: this.awayPost,
      keepingSide: this.homePost,
    });
    if (!awayResult.success) {
      log(`Unexpected: half-time tactic swap rejected for Away - ${awayResult.error}`);
    }
  }

  /**
   * Auto-select and apply up to MAX_SUBSTITUTIONS substitutions per side
   * at half-time only (locked scope: no in-match-minute or live-triggered
   * subs - see MatchSide.planHalfTimeSubstitutions()'s doc comment for
   * why, and MatchSide.changeTactic()'s doc comment for why this MUST run
   * only after swapClubFormations(), never before).
   */
  public performHalfTimeSubstitutions() {
    this.substituteSide(this.Match.Home);
    this.substituteSide(this.Match.Away);
  }

  private substituteSide(side: MatchSide) {
    const pairs = side.planHalfTimeSubstitutions();

    // Milestone 6 (Explicit Transitions) - the auto-planner above only
    // ever generates valid pairs by construction (bench-only source,
    // position-matched, GK-excluded, capped at MAX_SUBSTITUTIONS), so
    // this is expected to always succeed - logged if it somehow doesn't,
    // see the simulation-engine-isolation plan.
    pairs.forEach(({ outgoing, incoming }) => {
      const result = applySubstitution({ game: this, side, outgoing, incoming });
      if (!result.success) {
        log(`Unexpected: half-time substitution rejected - ${result.error}`);
      }
    });
  }

  /**
   * Change a side's tactic at any point in the match, not just half-time.
   * Ergonomic 'home'/'away' wrapper around the validated
   * `applyTacticalChange` transition (Milestone 6) - see the
   * simulation-engine-isolation plan. Zero live callers today (kept as a
   * public entry point for whatever calls it next, e.g. a future manager
   * decision surface); `MatchSettings`/the `-tactic-changed` event only
   * update if the transition actually succeeds.
   */
  public changeTactic(side: 'home' | 'away', tactic: ITactic) {
    const matchSide = side === 'home' ? this.Match.Home : this.Match.Away;

    const result = applyTacticalChange({ game: this, side: matchSide, tactic });

    if (result.success) {
      if (side === 'home') {
        this.MatchSettings.homeTactic = tactic;
      } else {
        this.MatchSettings.awayTactic = tactic;
      }

      matchEvents.emit(`${this.Match.id}-tactic-changed`, { side, tactic });
    }

    return result;
  }

  public getMatch() {
    return this.Match;
  }

  public setPlayingSides() {
    // Milestone 17 (Independent Ball Model) - previously scanned both
    // squads for `.WithBall`, warning loudly if more than one came back
    // (a real, historically-observed symptom - see Ball.ts's own doc
    // comment on the bug this used to guard against) before scanning
    // AGAIN, twice more, to actually find the one player each branch
    // needed. Now there is exactly one canonical answer to "who has the
    // ball" (`this.MatchBall.holderId`) - a single lookup, and no shape
    // of code left that could even ask "how many holders are there"
    // ambiguously, so there's nothing left to warn about.
    const holderId = this.MatchBall.holderId;
    const holder = holderId
      ? ([...this.Match.Home.StartingSquad, ...this.Match.Away.StartingSquad].find(
          (p) => p._id === holderId
        ) as IFieldPlayer | undefined)
      : undefined;

    if (holder) {
      const isHome = this.Match.Home.StartingSquad.includes(holder);
      this.AS = isHome ? this.Match.Home : this.Match.Away;
      this.ActivePlayerAS = holder;
      this.DS = isHome ? this.Match.Away : this.Match.Home;

      // Set the activePlayer in the defending team to be the player closest to
      // the ball
      this.ActivePlayerDS = this.Co.findClosestFieldPlayer(
        this.MatchBall.Position,
        this.DS.ActivePlayers
      );

      return {
        activePlayerAS: this.ActivePlayerAS,
        AS: this.AS,
        activePlayerDS: this.ActivePlayerDS,
        DS: this.DS,
      };
    } else {
      this.AS = undefined;
      this.DS = undefined;
      return false;
    }
  }

  public moveTowardsBall() {
    this.ActivePlayerAS = this.Co.findClosestFieldPlayer(
      this.MatchBall.Position,
      this.Match.Home.ActivePlayers
    );

    if (this.ActivePlayerAS) {
      this.MatchActions.move(
        this.ActivePlayerAS,
        'towards ball',
        this.MatchBall.Position
      );
    }

    this.ActivePlayerDS = this.Co.findClosestFieldPlayer(
      this.MatchBall.Position,
      this.Match.Away.ActivePlayers
    );

    if (this.ActivePlayerDS) {
      this.MatchActions.move(
        this.ActivePlayerDS,
        'towards ball',
        this.MatchBall.Position
      );
    }
  }

  public matchComments() {
    const _log = console.log;

    if (!this.ActivePlayerDS || !this.ActivePlayerAS) {
      return _log('NO ACTIVE PLAYERS');
    }
  }

  public startHalf() {
    createMatchEvent(this.Match.id, 'Match Kick-Off', 'match');
    log('Half is starting!');

    // Unlike half-time/post-goal/post-ball-out restarts, the very first
    // kickoff never goes through the `-reset-ball-position` event chain, so
    // nothing ever gave a player the ball here - no formation slot sits
    // exactly on the center block, so every match previously started with
    // WithBall false for all 22 players. Reusing the Referee's restart
    // handler here gives kickoff the same explicit possession assignment.
    this.Referee.handleMatchRestart();

    return this.gamePlay();
  }

  private async gamePlay() {
    // Anything you want to do to change the game, do it before 'gameLoop' is called :)
    // Expressed as two advanceMatch() calls (Milestone 5) rather than two
    // direct gameLoop() calls - identical behavior/ordering, but now the
    // same boundary-crossing logic is available to any caller that wants
    // to stop somewhere in between instead of always running straight
    // through both halves in one go.
    await this.advanceMatch({ event: 'half-time' });
    await this.advanceMatch({ event: 'full-time' });
    return this.getMatch();
  }

  /**
   * Advance the match to a named boundary (half-time/full-time) or an
   * arbitrary minute, resumable across multiple calls on this same Game
   * instance - see the simulation-engine-isolation plan's Milestone 5
   * scope note (same-process pause/resume only, no serialize/rehydrate).
   * Never runs past the half-time or full-time tick without first running
   * the required transition (formation swap/subs, or match-over events),
   * even if a single call's target tick is on the far side of one.
   */
  public async advanceMatch(until: AdvanceUntil): Promise<AdvanceResult> {
    const targetTick = this.resolveTargetTick(until);

    while (this.currentTick < targetTick && this.currentTick < FULL_TIME_TICK) {
      const boundary =
        this.currentTick < HALF_TIME_TICK ? HALF_TIME_TICK : FULL_TIME_TICK;
      const nextStop = Math.min(targetTick, boundary);

      await this.gameLoop(this.currentTick, nextStop);
      this.currentTick = nextStop;

      if (this.currentTick === HALF_TIME_TICK && !this.halfTimeTransitionDone) {
        this.halfTimeTransitionDone = true;
        matchEvents.emit(`${this.Match.id}-half-end`);
        createMatchEvent(this.Match.id, 'First Half Over', 'match');
        log('------------------ Second Half Start ------------------');
        this.swapClubFormations();
        this.performHalfTimeSubstitutions();
        matchEvents.emit(`${this.Match.id}-reset-formations`);
      }

      if (this.currentTick === FULL_TIME_TICK) {
        matchEvents.emit(`${this.Match.id}-half-end`);
        createMatchEvent(this.Match.id, 'Match Over', 'match');
        log('------------------ Match Over --------------------');
      }
    }

    return {
      half: this.currentTick < HALF_TIME_TICK ? 1 : 2,
      minute: Math.round(this.currentTick / TICKS_PER_MINUTE),
      finished: this.currentTick >= FULL_TIME_TICK,
    };
  }

  private resolveTargetTick(until: AdvanceUntil): number {
    if ('minute' in until) {
      return Math.max(
        0,
        Math.min(FULL_TIME_TICK, Math.round(until.minute * TICKS_PER_MINUTE))
      );
    }
    return until.event === 'half-time' ? HALF_TIME_TICK : FULL_TIME_TICK;
  }

  private gameLoop(timestart = 0, timeend = HALF_TIME_TICK) {
    this.matchComments();
    return new Promise((resolve, reject) => {
      for (let i = timestart; i < timeend; i++) {
        const playingSides = this.setPlayingSides();

        this.Match.setCurrentTime(Math.round((i + 1) / TICKS_PER_MINUTE));

        if (this.AS === undefined || this.DS === undefined) {
          log('Mvng Towards ball');
          this.moveTowardsBall();
        } else {
          log('-- TAKING ACTION --');
          this.MatchActions.takeAction(
            this.ActivePlayerAS as IFieldPlayer,
            this.AS,
            this.DS,
            this.ActivePlayerDS as IFieldPlayer
          );
          const playingSides = this.setPlayingSides();
          applyPossessionChange({ match: this.Match, side: this.AS });
        }

        this.Match.captureFrame(i, this.MatchBall.Position);

        this.matchComments();
      }
      return resolve(true);
    });
  }
}
