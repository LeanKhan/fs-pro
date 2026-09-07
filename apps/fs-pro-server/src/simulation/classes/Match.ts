import { ClubInterface as Club } from '../../controllers/clubs/club.model';
import { MatchSide } from './MatchSide';
import { matchEvents, createMatchEvent, ballMove } from '../utils/events';
import { IBlock } from '../state/ImmutableState/FieldGrid';
import {
  IFieldPlayer,
  IPlayerStats,
  PlayerMatchStatus,
} from '../../interfaces/Player';
import {
  IShot,
  IPass,
  GamePoints,
  ITackle,
  IDribble,
  IFoul,
  ISentOff,
} from './Referee';
import log from '../../helpers/logger';
import { applyGoal } from '../transitions';
import {
  createMatchStateSnapshot,
  matchStateToDetails,
  MatchState,
} from '../state/MatchState';
import {
  PossessionTracker,
  PossessionContext,
} from '../possession/PossessionTracker';
import { MatchPhase } from '../possession/MatchPhase';
import {
  createRandomSource,
  randomNDigits,
  RandomInput,
  RandomSource,
} from '../randomness';

import { PlayerMatchDetailsInterface } from '../../controllers/player-match/player-match.model';

/** Event types that represent a shot outcome - tagged `phase: 'chance'`
 * regardless of the live phase context (see the `-event` listener below). */
const CHANCE_EVENT_TYPES = new Set<IMatchEvent['type']>([
  'goal',
  'miss',
  'save',
]);

/**
 * The Match Class gan gan
 */

abstract class MatchClass {
  public static instances: number;
}
// tslint:disable-next-line: max-classes-per-file
export class Match implements IMatch, MatchClass {
  public static instances = 0;
  public id: string;
  public Home: MatchSide;
  public Away: MatchSide;
  public CenterBlock: IBlock;
  public Details!: IMatchDetails;
  public Events: IMatchEvent[];
  public Actions: IMatchAction[] = [];
  /** Per-tick position/event snapshots, used to replay the match live over sockets. */
  public Frames: IMatchFrame[] = [];
  /** Milestone 11 (Possession And Match Phases) - which continuous spell
   * of one side's possession is running right now, and how it began.
   * Advanced once per tick via `advancePossession()` (called from the
   * `applyPossessionChange` transition, the same chokepoint that already
   * credits a tick's possession stat); reset ahead of every dead-ball
   * handover via `markPossessionRestart()` (called from `Referee`). */
  public Possession = new PossessionTracker();
  /** The phase `Actions.takeAction()` last computed for the side
   * currently in possession, this tick - read by the `-event` listener
   * below to stamp every event with the phase active when it fired. */
  private currentPhase: MatchPhase = 'restart';
  private lastFrameEventIndex = 0;
  private CurrentTime = 0;
  private Teams: MatchSide[];
  private readonly random: RandomSource;

  /**
   * Create a new match bro
   *
   *
   * @param {Team} home The Home Team
   * @param {Team} away The Away Team
   * @param {IBlock} awayPost The Post of the Away team (where Home will score)
   * @param {IBlock} homePost The Post of the Home team (where Away will score)
   */
  constructor(
    home: Club,
    away: Club,
    awayPost: IBlock,
    homePost: IBlock,
    centerBlock: IBlock,
    random?: RandomInput
  ) {
    this.random = createRandomSource(random);
    this.id = '' + randomNDigits(5, this.random);
    this.Home = new MatchSide(home, awayPost, homePost);
    this.Away = new MatchSide(away, homePost, awayPost);
    this.Teams = [this.Home, this.Away];
    this.CenterBlock = centerBlock;
    this.Events = [];
    this.Details = {
      HomeTeamScore: 0,
      AwayTeamScore: 0,
      TotalPasses: 0,
      Goals: 0,
      HomeTeamDetails: {
        ClubId: this.Home._id,
        Possession: 0,
        TimesWithBall: 0,
        Goals: 0,
        TotalShots: 0,
        ShotsOnTarget: 0,
        ShotsOffTarget: 0,
        Fouls: 0,
        YellowCards: 0,
        RedCards: 0,
        Passes: 0,
      },
      AwayTeamDetails: {
        ClubId: this.Away._id,
        Possession: 0,
        TimesWithBall: 0,
        Goals: 0,
        TotalShots: 0,
        ShotsOnTarget: 0,
        ShotsOffTarget: 0,
        Fouls: 0,
        YellowCards: 0,
        RedCards: 0,
        Passes: 0,
      },
    } as IMatchDetails;

    matchEvents.on(`${this.id}-shot`, (data: IShot) => {
      // const teamIndex = this.Teams!.findIndex(
      //   (t) => t.ClubCode === data.shooter.ClubCode
      // );
      if (this.Home.ClubCode === data.shooter.ClubCode) {
        this.Details.HomeTeamDetails.TotalShots++;
        switch (data.result) {
          case 'goal':
          case 'save':
            this.Details.HomeTeamDetails.ShotsOnTarget++;
            break;
          case 'miss':
            this.Details.HomeTeamDetails.ShotsOffTarget++;
            break;
        }
      } else {
        this.Details.AwayTeamDetails.TotalShots++;
        switch (data.result) {
          case 'goal':
          case 'save':
            this.Details.AwayTeamDetails.ShotsOnTarget++;
            break;
          case 'miss':
            this.Details.AwayTeamDetails.ShotsOffTarget++;
            break;
        }
      }
    });

    matchEvents.on(`${this.id}-goal!`, (data: IShot) => {
      log('GOAAAALLL!!!');
      // Milestone 6 (Explicit Transitions) - validates (scorer must still
      // be an active player) then calls recordGoal() below. The engine's
      // own shot-resolution flow always has a legitimate scorer here, so
      // this validation is a safety net, not expected to ever reject in
      // live play - see the simulation-engine-isolation plan.
      const result = applyGoal({
        match: this,
        scorer: data.shooter,
        keeper: data.keeper,
      });
      if (!result.success) {
        log(`Unexpected: live goal rejected - ${result.error}`);
      }
    });

    matchEvents.on(`${this.id}-event`, (data: IMatchEvent) => {
      data.time = this.getCurrentTime.toString();

      // Milestone 11 - stamp every event with which possession sequence
      // produced it and what phase was live when it fired, from the same
      // single chokepoint every event already flows through (see Milestone
      // 6's own note on why this listener is that chokepoint). 'chance'
      // overrides the live phase for shot outcomes specifically - only
      // knowable in hindsight, once the shot has actually happened.
      const context = this.getPossessionContext();
      data.possessionSequenceId = context.sequenceId;
      data.phase = CHANCE_EVENT_TYPES.has(data.type)
        ? 'chance'
        : this.currentPhase;

      this.Events.push(data);
    });

    matchEvents.on(`${this.id}-saved-shot`, (data: IShot) => {
      data.keeper.GameStats.Saves++;
      data.keeper.increasePoints(GamePoints.Save);
      log('Shot was saved yo');
    });

    matchEvents.on(`${this.id}-missed-shot`, (data: IShot) => {
      data.shooter.increasePoints(-GamePoints.Goal / 2);
      log('Missed shot though :(');
    });

    matchEvents.on(`${this.id}-pass-made`, (data: IPass) => {
      this.Details.TotalPasses++;
      data.passer.GameStats.Passes++;
      data.passer.increasePoints(GamePoints.Pass);

      // add to match actions...
      this.Actions.push({
        type: 'pass',
        playerID: data.passer._id!,
        playerTeam: data.passer.ClubCode!,
        timestamp: this.getCurrentTime,
      });

      createMatchEvent(
        this.id,
        `${data.passer.FirstName} ${data.passer.LastName} [${data.passer.ClubCode}]
       passed to ${data.receiver.FirstName} ${data.receiver.LastName} [${data.receiver.ClubCode}]`,
        'pass',
        data.passer._id,
        data.passer.ClubCode
      );

      // // give receiver some passes
      data.receiver.increasePoints(-GamePoints.Pass / 2);
      log(`Pass from ${data.passer.LastName} to ${data.receiver.LastName}`);
    });

    matchEvents.on(`${this.id}-pass-intercepted`, (data) => {
      log(
        `Attempted Pass from ${data.passer.FirstName} ${data.passer.LastName} [${data.passer.ClubCode}]
          intercepted by 
        ${data.interceptor.FirstName} ${data.interceptor.LastName} [${data.interceptor.ClubCode}]`
      );

      data.interceptor.GameStats.Interceptions++;
      data.interceptor.increasePoints(GamePoints.Interception);

      // reduce passer's points :p
      data.passer.increasePoints(-GamePoints.Interception);

      createMatchEvent(
        this.id,
        `${data.interceptor.FirstName} ${data.interceptor.LastName} [${data.interceptor.ClubCode}]
       intercepted pass from ${data.passer.FirstName} ${data.passer.LastName} [${data.passer.ClubCode}]`,
        'interception',
        data.interceptor._id,
        data.interceptor.ClubCode
      );

      this.Actions.push({
        type: 'interception',
        playerID: data.interceptor._id!,
        playerTeam: data.interceptor.ClubCode!,
        timestamp: this.getCurrentTime,
      });
    });

    matchEvents.on(`${this.id}-dribble`, (data: IDribble) => {
      data.dribbler.GameStats.Dribbles++;
      data.dribbler.increasePoints(GamePoints.Dribble);

      // Remove points from Dribbled :)
      data.dribbled.increasePoints(-GamePoints.Dribble / 2);

      log(`${data.dribbler.FirstName} ${data.dribbler.LastName} [${data.dribbler.ClubCode}] dribbled
      ${data.dribbled.FirstName} ${data.dribbled.LastName} [${data.dribbled.ClubCode}] successfully`);
    });

    matchEvents.on(`${this.id}-tackle`, (data: ITackle) => {
      // Increase points for somebori

      if (data.success) {
        data.tackler.GameStats.Tackles++;
        data.tackler.increasePoints(GamePoints.Tackle);

        log(
          `${data.tackler.FirstName} ${data.tackler.LastName} [with Ball? ${
            data.tackler.WithBall
          }] at ${JSON.stringify({
            x: data.tackler.BlockPosition.x,
            y: data.tackler.BlockPosition.y,
            key: data.tackler.BlockPosition.key,
          })} tackled the ball from ${data.tackled.FirstName} ${
            data.tackled.LastName
          } [with Ball? ${data.tackled.WithBall}] who was at ${JSON.stringify({
            x: data.tackled.BlockPosition.x,
            y: data.tackled.BlockPosition.y,
            key: data.tackled.BlockPosition.key,
          })} at ${this.getCurrentTime} mins`
        );
      } else {
        // Subtract points hehe
        data.tackler.increasePoints(-GamePoints.Tackle / 2);

        log(
          `Unsuccessful tackle attempt by ${data.tackler.FirstName} ${
            data.tackler.LastName
          } at ${JSON.stringify(data.tackler.BlockPosition.key)} on ${
            data.tackled.FirstName
          } ${data.tackled.LastName} who was at ${JSON.stringify(
            data.tackled.BlockPosition.key
          )} at ${this.getCurrentTime} mins`
        );
      }
    });

    matchEvents.on(`${this.id}-game-halt`, (data: IFoul) => {
      // Previously nothing ever tracked fouls/cards at all - Referee.foul()
      // existed and was fully wired to emit this by the time this listener
      // was added, but the stats it should feed (Fouls/YellowCards/
      // RedCards, all already present on IMatchSideDetails) never moved.
      const offendingSide =
        data.subject.ClubCode === this.Home.ClubCode
          ? this.Details.HomeTeamDetails
          : this.Details.AwayTeamDetails;

      offendingSide.Fouls++;
      if (data.reason === 'yellow card') {
        offendingSide.YellowCards++;
      }
      // RedCards is tracked below, off the -player-sent-off event instead -
      // a second yellow is ALSO a red card (a send-off), and counting it
      // here too (keyed off data.reason === 'red card') would miss that
      // case while double-counting a straight red.

      createMatchEvent(
        this.id,
        `${data.subject.FirstName} ${data.subject.LastName} [${data.subject.ClubCode}] ` +
          `committed a foul on ${data.object.FirstName} ${data.object.LastName}` +
          (data.reason !== 'foul' ? ` (${data.reason})` : ''),
        'foul',
        data.subject._id,
        data.subject.ClubCode
      );

      log(
        `Foul: ${data.reason} by ${data.subject.FirstName} ${data.subject.LastName}`
      );
    });

    matchEvents.on(`${this.id}-player-sent-off`, (data: ISentOff) => {
      const offendingSide =
        data.player.ClubCode === this.Home.ClubCode
          ? this.Details.HomeTeamDetails
          : this.Details.AwayTeamDetails;

      offendingSide.RedCards++;

      createMatchEvent(
        this.id,
        `${data.player.FirstName} ${data.player.LastName} [${data.player.ClubCode}] has been sent off` +
          (data.secondYellow ? ' (second yellow card)' : ' (red card)'),
        'foul',
        data.player._id,
        data.player.ClubCode
      );

      log(
        `${data.player.FirstName} ${data.player.LastName} sent off (${data.secondYellow ? 'second yellow' : 'red card'})`
      );
    });

    matchEvents.on(`${this.id}-reset-formations`, () => {
      log('********Resetting formations *********');
      this.resetClubFormations();
      matchEvents.emit(`${this.id}-reset-ball-position`);
    });

    matchEvents.on(`${this.id}-half-end`, () => {
      log('First half over!');
      log(
        `Match Result => [${this.Home.ClubCode}] ${this.Details.HomeTeamScore} : ${this.Details.AwayTeamScore} [${this.Away.ClubCode}]`
      );

      createMatchEvent(this.id, 'Half Over', 'match');

      // log(this.Events, 'table'); TODO - UNCOMMENT O

      log(`Home Team => ${this.Home.ClubCode}`);
      this.Home.StartingSquad.forEach((p) => {
        log(
          `[${p.FirstName} ${p.LastName}] - ${this.Home.ClubCode} ${p.Position}`
        );
        log(p.GameStats, 'table'); // TODO -UNCOMMENT O
      });

      log(`Away Team => ${this.Away.ClubCode}`);
      this.Away.StartingSquad.forEach((p) => {
        log(
          `[${p.FirstName} ${p.LastName}] - ${this.Away.ClubCode} ${p.Position}`
        );
        log(p.GameStats, 'table'); // TODO - UNCOMMENT O
      });

      this.endMatch();
    });

    Match.instances++;
  }

  public castEvent(data: IMatchEvent) {
    matchEvents.emit(`${this.id}-event`, data);
  }

  /** Create match report */
  public report = () => {
    // tslint:disable-next-line: no-debugger
    // debugger;
    if (this.Home.GoalsScored === this.Away.GoalsScored) {
      this.Details.Winner = null;
      this.Details.Loser = null;
      this.Details.Draw = true;
    } else if (this.Home.GoalsScored > this.Away.GoalsScored) {
      this.Details.Winner = { code: this.Home.ClubCode, id: this.Home._id };
      this.Details.Loser = { code: this.Away.ClubCode, id: this.Away._id };
    } else {
      this.Details.Winner = { code: this.Away.ClubCode, id: this.Away._id };
      this.Details.Loser = { code: this.Home.ClubCode, id: this.Home._id };
    }
    this.Details.Time = new Date();
    this.Details.Title = `${this.Home.Name} vs ${this.Away.Name} <-> ${this.Details.Time}`;
  };

  public resetClubFormations() {
    this.Home.resetFormation();
    this.Away.resetFormation();
  }

  public getWinners() {
    if (this.Details.HomeTeamScore > this.Details.AwayTeamScore) {
      this.Details.Winner = { code: this.Home.ClubCode, id: this.Home._id };
      this.Details.Loser = { code: this.Away.ClubCode, id: this.Away._id };
      this.Details.Draw = false;
    } else if (this.Details.HomeTeamScore === this.Details.AwayTeamScore) {
      this.Details.Draw = true;
      this.Details.Winner = null;
      this.Details.Loser = null;
    } else {
      this.Details.Winner = { code: this.Away.ClubCode, id: this.Away._id };
      this.Details.Loser = { code: this.Home.ClubCode, id: this.Home._id };
      this.Details.Draw = false;
    }
  }

  public setPlayerStats() {
    this.Details.HomeTeamDetails.PlayerStats =
      this.Home.getPlayerStats() as any;
    this.Details.AwayTeamDetails.PlayerStats =
      this.Away.getPlayerStats() as any;
  }

  public endMatch() {
    this.Details.Played = true;
    this.Details.FullTimeScore = `${this.Details.HomeTeamScore} : ${this.Details.AwayTeamScore}`;
    this.calculatePosession();
    this.setPlayerStats();
    this.getWinners();
    this.getMOTM();

    log(`ball-moved listeners: ${ballMove.listenerCount('ball-moved')}`);
    if (this.getCurrentTime >= 90) {
      // Only remove the listeners at the end of the match :)
      ballMove.removeAllListeners();
      matchEvents.removeAllListeners();
    }
    log('Match Details =>', this.Details);
  }

  public setCurrentTime(time: number) {
    this.CurrentTime = time;
  }

  public get getCurrentTime(): number {
    return this.CurrentTime;
  }

  public toState(): MatchState {
    return createMatchStateSnapshot(this, {
      random: this.random.getState(),
    });
  }

  public toDetailsFromState(state: MatchState = this.toState()): IMatchDetails {
    return matchStateToDetails(state, this.Details);
  }

  /**
   * The actual score/stat mutation for a goal - extracted (Milestone 6)
   * out of the `-goal!` listener's inline body so it's independently
   * callable (by `applyGoal()`, `transitions/index.ts`) instead of only
   * reachable via the event chain. No validation here - trusts the
   * caller, same as before extraction; `applyGoal()` is where validation
   * lives now.
   */
  public recordGoal(scorer: IFieldPlayer, keeper: IFieldPlayer): void {
    // add to match actions...
    this.Actions.push({
      type: 'goal',
      // save player's actual ID from now on!
      playerID: scorer._id!,
      playerTeam: scorer.ClubCode!,
      timestamp: this.getCurrentTime,
    });

    scorer.increaseGoalTally();

    scorer.increasePoints(GamePoints.Goal);

    // now determine if there was an assist!

    const actionLength = this.Actions.length > 1 ? this.Actions.length : 2;

    if (
      this.Actions[actionLength - 2].type === 'goal' &&
      this.Actions[actionLength - 2].playerTeam === scorer.ClubCode
    ) {
      const playerID = this.Actions[actionLength - 2].playerID;

      const assister = this.fetchPlayerById(playerID);

      assister!.GameStats.Assists++;
      assister?.increasePoints(GamePoints.Assist);
    }

    // subtract from keeper's points :3
    keeper.increasePoints(-GamePoints.Save / 2);

    if (scorer.ClubCode === this.Home.ClubCode) {
      this.Details.HomeTeamScore++;
      this.Details.HomeTeamDetails.Goals++;
    } else if (scorer.ClubCode === this.Away.ClubCode) {
      this.Details.AwayTeamScore++;
      this.Details.AwayTeamDetails.Goals++;
    }

    log(
      `Goal from ${scorer.FirstName} ${scorer.LastName} now at ${scorer.GameStats.Goals}`
    );

    this.Details.Goals++;
  }

  public recordPossession(team: MatchSide) {
    if (team) {
      if (team.ClubCode === this.Home.ClubCode) {
        this.Details.HomeTeamDetails.TimesWithBall++;
      } else {
        this.Details.AwayTeamDetails.TimesWithBall++;
      }
    }
  }

  /** Milestone 11 - advance the possession-sequence tracker by one tick.
   * Called from the `applyPossessionChange` transition, right alongside
   * `recordPossession()` above - same tick, same side, same chokepoint. */
  public advancePossession(side: MatchSide | undefined) {
    return this.Possession.update(this.getCurrentTime, side);
  }

  /** Read the current possession sequence's context without advancing it -
   * used by `Actions.takeAction()` (via `getPossessionContext()`) to ask
   * "what's true as of the start of this tick" when computing this tick's
   * `TeamIntent.phase`, and by the `-event` listener to stamp events. */
  public getPossessionContext(): PossessionContext {
    return this.Possession.peek(this.getCurrentTime);
  }

  /** Called by `Referee` ahead of every dead-ball handover (kickoff,
   * half-time, post-goal, post-ball-out, penalty/free-kick) so the next
   * `advancePossession()` starts a fresh sequence tagged 'restart'. */
  public markPossessionRestart(): void {
    this.Possession.markRestart();
  }

  /** Set by `Actions.takeAction()` once per tick, from the possessing
   * side's freshly-computed `TeamIntent.phase` - read back by the
   * `-event` listener above to stamp every event fired during this tick. */
  public setCurrentPhase(phase: MatchPhase): void {
    this.currentPhase = phase;
  }

  public fetchPlayerById(id: string) {
    const allPlayers = this.Home.StartingSquad.concat(this.Away.StartingSquad);

    return allPlayers.find((player) => {
      return player._id === id;
    });
  }

  public showActions() {
    // log(this.Actions, 'table'); TODO: UNCOMMENT O
  }

  /**
   * Snapshot all player/ball positions plus any new Events entries since the
   * last snapshot. Called once per gameLoop tick so the match can be
   * replayed live afterwards (see src/realtime/matchBroadcaster.ts) without
   * slowing down the simulation itself.
   */
  public captureFrame(
    tick: number,
    ballPosition: { x: number; y: number }
  ): void {
    const events = this.Events.slice(this.lastFrameEventIndex);
    this.lastFrameEventIndex = this.Events.length;

    this.Frames.push({
      tick,
      minute: this.getCurrentTime,
      half: tick < 90 ? 1 : 2,
      ball: { x: ballPosition.x, y: ballPosition.y },
      players: [
        ...this.Home.StartingSquad.map((p) => this.toFramePlayer(p, 'home')),
        ...this.Away.StartingSquad.map((p) => this.toFramePlayer(p, 'away')),
      ],
      events,
    });
  }

  private toFramePlayer(
    p: IFieldPlayer,
    side: 'home' | 'away'
  ): IMatchFramePlayer {
    return {
      id: p._id!,
      side,
      num: p.ShirtNumber,
      pos: p.Position,
      x: p.BlockPosition.x,
      y: p.BlockPosition.y,
      withBall: p.WithBall,
      matchStatus: p.MatchStatus,
      yellowCards: p.GameStats.YellowCards,
      redCards: p.GameStats.RedCards,
    };
  }

  public calculatePosession() {
    const totalPossession =
      this.Details.HomeTeamDetails.TimesWithBall +
      this.Details.AwayTeamDetails.TimesWithBall;

    this.Details.HomeTeamDetails.Possession = Math.round(
      (this.Details.HomeTeamDetails.TimesWithBall / totalPossession) * 100
    );

    this.Details.AwayTeamDetails.Possession = Math.round(
      (this.Details.AwayTeamDetails.TimesWithBall / totalPossession) * 100
    );
  }

  public getMOTM() {
    let allSquads = this.Home.StartingSquad.concat(this.Away.StartingSquad);

    allSquads = allSquads.sort(
      (a, b) => a.GameStats.Points - b.GameStats.Points
    );

    const motm = allSquads[allSquads.length - 1];
    // log('MOTM =>', motm); TODO - UNCOMMENT O

    this.Details.MOTM = {
      playerID: motm.PlayerID,
      id: motm._id,
      name: motm.FirstName + ' ' + motm.LastName,
      clubcode: motm.ClubCode,
      points: motm.GameStats.Points,
    };
  }
}

export interface IMatchData {
  attackingSide?: MatchSide;
  activePlayerAS?: IFieldPlayer;
  defendingSide?: MatchSide;
  activePlayerDS?: IFieldPlayer;
}

export interface IMatchEvent {
  type:
    | 'match'
    | 'shot'
    | 'miss'
    | 'save'
    | 'goal'
    | 'dribble'
    | 'tackle'
    | 'pass'
    | 'interception'
    | 'foul'
    | 'substitution';
  message: string;
  time?: string;
  playerID?: string;
  playerTeamID?: string;
  data?: any;
  /** Milestone 11 - which continuous possession spell produced this event.
   * Stamped centrally by the `-event` listener above from
   * `Match.Possession`'s current sequence as of this tick. */
  possessionSequenceId?: number;
  /** The match phase live when this event fired - 'chance' for any
   * shot/save/miss/goal outcome regardless of context, otherwise whatever
   * `Actions.takeAction()` last computed for the possessing side. */
  phase?: MatchPhase;
}

export interface IMatchFramePlayer {
  id: string;
  side: 'home' | 'away';
  num: string;
  pos: string;
  x: number;
  y: number;
  withBall: boolean;
  matchStatus: PlayerMatchStatus;
  yellowCards: number;
  redCards: number;
}

export interface IMatchFrame {
  tick: number;
  minute: number;
  half: 1 | 2;
  ball: { x: number; y: number };
  players: IMatchFramePlayer[];
  events: IMatchEvent[];
}

export interface IMatchDetails {
  Title: string;
  LeagueName: string;
  Draw: boolean;
  Played: boolean;
  Time: Date;
  FirstHalfScore: string;
  FullTimeScore: string;
  HomeTeamScore: number;
  AwayTeamScore: number;
  Winner: { code: string; id: string } | null;
  Loser: { code: string; id: string } | null;
  MOTM: any;
  TotalPasses: number;
  Goals: number;
  HomeTeamDetails: IMatchSideDetails;
  AwayTeamDetails: IMatchSideDetails;
}

export interface IMatch {
  /** Unique ID*/
  id: string;
  Home: MatchSide;
  Away: MatchSide;
  Details: IMatchDetails;
  Events: IMatchEvent[];
  getCurrentTime: number;
  setCurrentTime(time: number): any;
  report(): void;
}

export interface IMatchSideDetails {
  ClubId: string;
  FixtureId?: string;
  TimesWithBall: number;
  Possession: number;
  Goals: number;
  TotalShots: number;
  ShotsOnTarget: number;
  ShotsOffTarget: number;
  Fouls: number;
  YellowCards: number;
  RedCards: number;
  Passes: number;
  Events: IMatchEvent[];
  PlayerStats: PlayerMatchDetailsInterface[] | string[];
  Won: boolean;
  Drew: boolean;
  [key: string]: any;
}

interface IMatchAction {
  type: 'pass' | 'goal' | 'interception';
  playerID: string;
  playerTeam: string;
  timestamp: number;
}
