/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Match } from '../classes/Match';
import Ball from '../classes/Ball';
import Field, { IBlock } from '../state/ImmutableState/FieldGrid';
import { IFieldPlayer } from '../interfaces/Player';
import { MatchSide } from '../classes/MatchSide';
import Referee from '../classes/Referee';
import { Actions } from '../state/ImmutableState/Actions/Actions';
import { matchEvents, createMatchEvent } from '../utils/events';
import { ClubInterface as IClub } from './clubs/club.model';
import CO, { default as Coordinates } from '../utils/coordinates';
import log from '../helpers/logger';
import { ITactic } from '../state/PersistentState/Formations';

// import log from ''

// import { EventEmitter } from 'events';

// const gameLoop = 90;

abstract class GameClass {
  public static instances: number;
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
  private Field: Field;
  private MatchActions: Actions;

  constructor(
    clubs: IClub[],
    sides: { home: string; away: string },
    ball: { color: string; cb: IBlock },
    ref: { fname: string; lname: string; level: string },
    centerBlock: any,
    field: Field,
    Co: Coordinates
  ) {

    this.Co = Co;
    this.Field = field;

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
      centerBlock
    );
    this.Clubs = clubs;

    this.MatchBall = new Ball('#ffffff', centerBlock, this.Match.id);

    this.Referee = new Referee('Anjus', 'Banjus', 'normal', this.MatchBall, this.Match);

    this.MatchActions = new Actions(this.Referee, [
      this.Match.Home,
      this.Match.Away,
    ],
    this.Match
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

    this.Match.Home.changeTactic(
      this.MatchSettings.homeTactic,
      this.Field,
      // new scoring side
      this.homePost,
      // new keeping side
      this.awayPost
    );

    this.Match.Away.changeTactic(
      this.MatchSettings.awayTactic,
      this.Field,
      // new scoring side
      this.awayPost,
      // new keeping side
      this.homePost
    );
  }

  /**
   * Change a side's tactic at any point in the match, not just half-time.
   * Emits a matchEvents event so the change lands in Match.Events/Frames
   * automatically, same as every other in-match action - no replay-system
   * changes needed for this to show up in a live watch.
   */
  public changeTactic(side: 'home' | 'away', tactic: ITactic) {
    const matchSide = side === 'home' ? this.Match.Home : this.Match.Away;

    matchSide.changeTactic(
      tactic,
      this.Field,
      matchSide.ScoringSide,
      matchSide.KeepingSide
    );

    if (side === 'home') {
      this.MatchSettings.homeTactic = tactic;
    } else {
      this.MatchSettings.awayTactic = tactic;
    }

    createMatchEvent(
      this.Match.id,
      `${matchSide.Name} [${matchSide.ClubCode}] changed tactics to ${tactic.formationName} (${tactic.styleName})`,
      'match'
    );

    matchEvents.emit(`${this.Match.id}-tactic-changed`, { side, tactic });
  }

  public getMatch() {
    return this.Match;
  }

  public setPlayingSides() {
    if (
      this.Match.Home.StartingSquad.find((p) => {
        return p.WithBall;
      })
    ) {
      this.AS = this.Match.Home;

      // Set the activePlayer in the attacking team to be the player with
      // the ball
      this.ActivePlayerAS = this.Match.Home.StartingSquad.find((p) => {
        return p.WithBall;
      }) as IFieldPlayer;

      this.DS = this.Match.Away;

      // Set the activePlayer in the defending team to be the player closest to
      // the ball
      this.ActivePlayerDS = this.Co.findClosestFieldPlayer(
        this.MatchBall.Position,
        this.DS.StartingSquad
      );

      return {
        activePlayerAS: this.ActivePlayerAS,
        AS: this.AS,
        activePlayerDS: this.ActivePlayerDS,
        DS: this.DS,
      };
    } else if (
      this.Match.Away.StartingSquad.find((p) => {
        return p.WithBall;
      })
    ) {
      this.AS = this.Match.Away;

      // Set the activePlayer in the attacking team to be the player with
      // the ball
      this.ActivePlayerAS = this.Match.Away.StartingSquad.find((p) => {
        return p.WithBall;
      }) as IFieldPlayer;

      this.DS = this.Match.Home;

      // Set the activePlayer in the defending team to be the player closest to
      // the ball
      this.ActivePlayerDS = this.Co.findClosestFieldPlayer(
        this.MatchBall.Position,
        this.DS.StartingSquad
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
      this.Match.Home.StartingSquad
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
      this.Match.Away.StartingSquad
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

    if(!this.ActivePlayerDS || !this.ActivePlayerAS){
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
    await this.gameLoop();
    matchEvents.emit(`${this.Match.id}-half-end`);
    createMatchEvent(this.Match.id, 'First Half Over', 'match');
    log('------------------ Second Half Start ------------------');
    this.swapClubFormations();
    matchEvents.emit(`${this.Match.id}-reset-formations`);
    await this.gameLoop(90, 180);
    matchEvents.emit(`${this.Match.id}-half-end`);
    createMatchEvent(this.Match.id, 'Match Over', 'match');
    log('------------------ Match Over --------------------');
    return this.getMatch();
  }

  private gameLoop(timestart = 0, timeend = 90) {
    this.matchComments();
    return new Promise((resolve, reject) => {
      for (let i = timestart; i < timeend; i++) {
        const playingSides = this.setPlayingSides();

        this.Match.setCurrentTime(Math.round((i + 1) / 2));

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
          this.Match.recordPossession(this.AS);
        }

        this.Match.captureFrame(i, this.MatchBall.Position);

        this.matchComments();
      }
      return resolve(true);
    });
  }
}