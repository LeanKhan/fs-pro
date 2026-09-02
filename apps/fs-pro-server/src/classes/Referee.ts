/* eslint-disable no-case-declarations */
import { IFieldPlayer } from '../interfaces/Player';
import { matchEvents, createMatchEvent } from '../utils/events';
import { Actions } from '../state/ImmutableState/Actions/Actions';
import { IBlock } from '../state/ImmutableState/FieldGrid';
import * as playerFunc from '../utils/players';
import CO from '../utils/coordinates';
import { Match, IMatchData } from './Match';
import { MatchSide } from './MatchSide';
import { IBall } from './Ball';
import log from '../helpers/logger';

export default class Referee {
  public FirstName: string;
  public LastName: string;
  public MatchBall: IBall;
  public Difficulty: string;
  public Match?: Match;
  private Teams?: MatchSide[];

  constructor(
    fname: string,
    lname: string,
    diff: string,
    ball: IBall,
    m?: Match
  ) {
    this.FirstName = fname;
    this.LastName = lname;
    this.Difficulty = diff;
    this.MatchBall = ball;
    this.Match = m;

    if (this.Match) {
      matchEvents.on(`${this.Match.id}-reset-ball-position`, () => {
        this.handleMatchRestart();
      });

      matchEvents.on(`${this.Match.id}-ball-out`, (outData) => {
        this.handleBallOut(outData);
      });
    }
  }

  public assignMatch(match: Match) {
    this.Match = match;
    this.Teams = [this.Match.Home, this.Match.Away];
  }

  /**
   * Move a player back to a specific block only if it's actually free (or
   * already theirs) - guards the handful of direct repositioning calls in
   * this class (keeper resets, sent-off replacements) against silently
   * displacing whoever another part of the engine still thinks occupies
   * that block, which is exactly the class of desync that produced the
   * ball-possession corruption fixed in FieldPlayer.move()/Actions.tackle().
   */
  private moveToBlockIfFree(player: IFieldPlayer, target: IBlock) {
    if (target.occupant !== null && target.occupant !== player) {
      return;
    }
    player.move(CO.co.calculateDifference(target, player.BlockPosition));
  }

  /**
   * Handle foul
   * @param subject The tackler (the offender)
   * @param object The Offended (the victim) ?
   */
  public foul(subject: IFieldPlayer, object: IFieldPlayer) {
    // Previously: chance (0-12) >= level ? yellow : chance < level ? red :
    // foul. Since >= and < are complementary and exhaustive over the same
    // range, the third branch was dead code - every foul resolved to
    // EITHER a yellow or a red, with roughly a 46% chance of red at the
    // default difficulty. Real fouls draw a card only a minority of the
    // time, and red cards are rare even among those. Replaced with a
    // proper three-way split on a 0-100 roll, most fouls drawing no card.
    const chance = Math.round(Math.random() * 100);
    const difficultyMultiplier =
      this.Difficulty === 'tough'
        ? 1.5
        : this.Difficulty === 'lenient'
          ? 0.6
          : 1;

    const redThreshold = 3 * difficultyMultiplier; // ~2-4.5% of fouls
    const yellowThreshold = 25 * difficultyMultiplier; // next ~15-37% of fouls

    const reason: IFoul['reason'] =
      chance <= redThreshold
        ? 'red card'
        : chance <= yellowThreshold
          ? 'yellow card'
          : 'foul';

    log(
      `Referee ruling: ${reason} (roll ${chance}, difficulty ${this.Difficulty})`
    );

    matchEvents.emit(`${this.Match!.id}-game-halt`, {
      reason,
      subject,
      object,
      where: subject.BlockPosition,
      interruption: true,
    } as IFoul);
  }

  public handleFoul(data: IFoul, matchActions: Actions) {
    switch (data.reason) {
      case 'yellow card':
        log('yellow card! [Y]');
        this.bookPlayer(data.subject, 'yellow');
        this.setUpSetPiece(data, data.where);
        break;
      case 'red card':
        log('red card! [R]');
        this.bookPlayer(data.subject, 'red');
        this.setUpSetPiece(data, data.where);
        break;
      case 'foul':
        log('foul! [FK]');
        this.setUpSetPiece(data, data.where);
        break;
      default:
        break;
    }
  }

  /**
   * Applies a card's real effect. This is the template for future
   * match-dynamic incidents (injury, morale-affecting events, etc.):
   * mutate player state once, emit an event, and let the rest of the
   * simulation - which already reads MatchStatus/ActivePlayers/Attributes -
   * react naturally. No special-casing needed anywhere else.
   */
  private bookPlayer(player: IFieldPlayer, card: 'yellow' | 'red') {
    if (card === 'yellow') {
      player.GameStats.YellowCards++;
      if (player.GameStats.YellowCards >= 2) {
        this.sendOff(player, true);
        return;
      }
    } else {
      this.sendOff(player, false);
    }
  }

  /** Removes a player from ActivePlayers for the rest of the match. */
  private sendOff(player: IFieldPlayer, secondYellow: boolean) {
    if (player.MatchStatus === 'sent-off') {
      return; // already off - avoid double-counting a repeat incident
    }

    player.MatchStatus = 'sent-off';
    player.GameStats.RedCards++;

    // Fouls are usually committed by the non-possessing side, but if this
    // player somehow has the ball, hand it to the nearest active teammate
    // rather than leaving it with someone no longer in the match.
    if (player.WithBall) {
      const team = this.Teams!.find((t) => t.ClubCode === player.ClubCode);
      const replacement = team
        ? CO.co.findClosestFieldPlayer(
            player.BlockPosition,
            team.ActivePlayers,
            player
          )
        : undefined;

      if (replacement) {
        replacement.changePosition(player.BlockPosition);
        this.MatchBall.move(
          CO.co.calculateDifference(
            replacement.BlockPosition,
            this.MatchBall.Position
          )
        );
      }
    }

    matchEvents.emit(`${this.Match!.id}-player-sent-off`, {
      player,
      secondYellow,
    } as ISentOff);
  }

  public setUpSetPiece(foulData: IFoul, where: IBlock) {
    const i = this.Teams!.findIndex(
      (t) => t.ClubCode === foulData.object.ClubCode
    );

    //  Get distance from ScoringSide
    const distance = CO.co.calculateDistance(this.Teams![i].ScoringSide, where);
    // Calibrated for the original 15-wide grid, same as every other
    // distance threshold in Decider.ts - see Coordinates.scaleDistance.
    const penaltyDistance = CO.co.scaleDistance(2);
    const freeKickDistance = CO.co.scaleDistance(5);

    if (distance < penaltyDistance) {
      log('<== Penalty Kick ==>');

      // Get an attacker or midfielder to take the PK
      const teamIndex = this.Teams!.findIndex(
        (t) => t.ClubCode === foulData.object.ClubCode
      );
      const taker = playerFunc.getRandomATTMID(this.Teams![teamIndex]);

      // Move the tackler away from the penalty spot
      const b2 = playerFunc.findRandomFreeBlock(foulData.subject);
      const p2 = CO.co.findPath(b2, foulData.subject.BlockPosition);
      foulData.subject.move(p2);

      // Give the taker the ball at the penalty spot - previously this was
      // just a comment ("Give him the ball :)"), so nobody ever actually
      // had the ball after a penalty was awarded. Now the taker gets
      // possession the same way every other restart does (see
      // Referee.handleMatchRestart), and the normal decision loop takes it
      // from there - this close to goal, Decider will very likely choose
      // to shoot on its own, so no separate "penalty" shot logic is needed.
      const takerPath = CO.co.calculateDifference(
        foulData.where,
        taker.BlockPosition
      );
      taker.move(takerPath);
      taker.Ball.move(
        CO.co.calculateDifference(taker.BlockPosition, taker.Ball.Position)
      );

      log(
        `${taker.FirstName} ${taker.LastName} [${taker.Position}] is taking the penalty`
      );
    } else if (distance >= penaltyDistance && distance < freeKickDistance) {
      log('<== Set Piece Free Kick! ==>');

      // Move freekick taker to spot
      const teamIndex = this.Teams!.findIndex(
        (t) => t.ClubCode === foulData.object.ClubCode
      );
      const taker = playerFunc.getRandomATTMID(this.Teams![teamIndex]);

      const takerPath = CO.co.calculateDifference(
        foulData.where,
        taker.BlockPosition
      );

      taker.move(takerPath);

      // Move ball to freekick taker's position

      taker.Ball.move(
        CO.co.calculateDifference(taker.BlockPosition, taker.Ball.Position)
      );

      log(
        `${taker.FirstName} ${taker.LastName} [${taker.Position}] is taking the freekick`
      );

      // Move involved players away
      // Move tackled
      const b1 = playerFunc.findRandomFreeBlock(foulData.object);

      const p1 = CO.co.findPath(b1, foulData.object.BlockPosition);
      foulData.object.move(p1);

      // Move tackler
      const b2 = playerFunc.findRandomFreeBlock(foulData.subject);

      const p2 = CO.co.findPath(b2, foulData.subject.BlockPosition);
      foulData.subject.move(p2);
    } else {
      log('<== Pass Free Kick ==>');

      // Move freekick taker to spot

      const teamIndex = this.Teams!.findIndex(
        (t) => t.ClubCode === foulData.object.ClubCode
      );
      const taker = playerFunc.getRandomATTMID(this.Teams![teamIndex]);

      const takerPath = CO.co.calculateDifference(
        foulData.where,
        taker.BlockPosition
      );

      taker.move(takerPath);

      // Move ball to freekick taker's position

      taker.Ball.move(
        CO.co.calculateDifference(taker.BlockPosition, taker.Ball.Position)
      );

      log(
        `${taker.FirstName} ${taker.LastName} [${taker.Position}] is taking the freekick`
      );

      // Move involved players away
      // Move tackled
      const b1 = playerFunc.findRandomFreeBlock(foulData.object);

      const p1 = CO.co.findPath(b1, foulData.object.BlockPosition);
      foulData.object.move(p1);

      // Move tackler
      const b2 = playerFunc.findRandomFreeBlock(foulData.subject);

      const p2 = CO.co.findPath(b2, foulData.subject.BlockPosition);
      foulData.subject.move(p2);
    }
  }

  public handleShot(data: IShot, matchActions: Actions) {
    // Keeper to his StartingPosition
    const defendingSide = matchActions.getPlayingSides
      .defendingSide as MatchSide;

    const keeper = playerFunc.getGK(
      defendingSide.StartingSquad
    ) as IFieldPlayer;

    this.moveToBlockIfFree(keeper, keeper.StartingPosition);

    switch (data.result) {
      case 'goal':
        // Emit goal event
        matchEvents.emit(`${this.Match!.id}-goal!`, data);

        // Move ball to keeper position
        keeper.Ball.move(
          CO.co.calculateDifference(keeper.BlockPosition, keeper.Ball.Position)
        );
        // log('resume gameplay :)')
        // Move players to starting position

        createMatchEvent(
          this.Match!.id,
          `${data.shooter.FirstName} ${data.shooter.LastName} [${data.shooter.ClubCode}] scored`,
          'goal',
          data.shooter._id,
          data.shooter.ClubCode
        );

        matchEvents.emit(`${this.Match!.id}-reset-formations`);

        // matchEvents.emit(`${this.Match.id}-set-playing-sides`);
        break;
      case 'miss':
        log('missed shot');
        // matchEvents.emit(`${this.Match.id}-set-playing-sides`);

        this.moveToBlockIfFree(keeper, keeper.StartingPosition);

        // Move ball to keeper position (goal kick) - this was commented
        // out with a note claiming it's "handled in Actions", but
        // Actions.shoot() sends an off-target shot to a random UNOCCUPIED
        // block near the goal by design, so nobody ever had the ball after
        // a miss. That left the match with no active player until someone
        // incidentally wandered onto that exact block.
        keeper.Ball.move(
          CO.co.calculateDifference(keeper.BlockPosition, keeper.Ball.Position)
        );

        createMatchEvent(
          this.Match!.id,
          `${data.shooter.FirstName} ${data.shooter.LastName} [${data.shooter.ClubCode}] missed a shot`,
          'miss',
          data.shooter._id,
          data.shooter.ClubCode
        );
        // console.log('Player shot -> ', data.shooter);
        // console.log('Keeper when ball out -> ', keeper);

        // NOTE: This is already handled in the Actions class
        // matchEvents.emit(`${this.Match!.id}-reset-formations`);
        matchEvents.emit(`${this.Match!.id}-missed-shot`, data);
        break;
      case 'save':
        log('shot saved');

        this.moveToBlockIfFree(keeper, keeper.StartingPosition);

        // Move ball to keeper position - was commented out (same stale
        // "handled elsewhere" assumption as the miss case above).
        // Actions.shoot() sends a saved shot to the exact goal-line block,
        // not to wherever the keeper actually stands, so nothing ever gave
        // the keeper possession after a save without this.
        keeper.Ball.move(
          CO.co.calculateDifference(keeper.BlockPosition, keeper.Ball.Position)
        );

        // console.log('Player shot -> ', data.shooter);
        // console.log('Keeper caught -> ', keeper);

        createMatchEvent(
          this.Match!.id,
          `${data.keeper.FirstName} ${data.keeper.LastName} [${data.keeper.ClubCode}] saved a shot from ${data.shooter.FirstName} ${data.shooter.LastName}`,
          'save',
          data.keeper._id,
          data.keeper.ClubCode
        );
        matchEvents.emit(`${this.Match!.id}-saved-shot`, data);
        // reset formations here also...
        break;
      default:
        break;
    }
  }

  public handleBallOut(outData: any) {
    /**
     * If the Ball is taken outside the boundary box...
     * - Find the nearest free block and move the nearest opposition player to that position
     * - move the ball to that position also
     * - continue the match...
     *  */

    // TODO: FINISH!
    console.log('<<< BALL OUT >>>', outData);
    //  console.log('Free blocks -> ', CO.co.getBlocksAround(outData.where, 3));
    /**
     * Find the opposing team and give them the ball...
     * */
    // NOTE: THIS IS VERY TEMPORARY!
    matchEvents.emit(`${this.Match!.id}-reset-formations`);
  }

  /**
   * Restart play from the center circle - kickoff, after a goal, after the
   * ball goes out. Previously this only moved the BALL to the center
   * block; nothing ever gave a player possession, and FieldPlayer.WithBall
   * only becomes true when a player's own block happens to exactly
   * coincide with the ball's. Since no formation slot sits exactly at the
   * center circle, that coincidence was rare, so most matches spent nearly
   * the whole simulation with no active player at all (Game.setPlayingSides
   * finds nobody WithBall, falls back to moveTowardsBall() every tick,
   * and takeAction() - where all passing/shooting/tackling logic lives -
   * never runs). Now the nearest outfield player is physically placed on
   * the ball's new block before it moves there, so WithBall is
   * unambiguously true for them the moment the ball arrives.
   */
  public handleMatchRestart() {
    const centerBlock = this.Match!.CenterBlock;

    console.log('Handling Match Restart! ', centerBlock.key);

    const taker = this.pickRestartTaker();
    if (taker) {
      taker.changePosition(centerBlock);
    }

    // Moving the ball fires the ball-moved event every player already
    // listens to, which re-checks WithBall for all of them - so this must
    // happen AFTER placing the taker, not before.
    this.MatchBall.move(
      CO.co.calculateDifference(centerBlock, this.MatchBall.Position)
    );
  }

  /** Whichever outfield player is currently closest to the center circle -
   * a simple, stateless heuristic for "who takes the restart", not a claim
   * about which team actually earned it (kickoff/goal/throw-in possession
   * rules aren't modeled here). */
  private pickRestartTaker(): IFieldPlayer | undefined {
    const allPlayers = this.Match!.Home.ActivePlayers.concat(
      this.Match!.Away.ActivePlayers
    );

    return CO.co.findClosestFieldPlayer(this.Match!.CenterBlock, allPlayers);
  }
}

export interface IReferee {
  FirstName: string;
  LastName: string;
  Difficulty: string;
  assignMatch(match: Match): void;
  foul(subject: IFieldPlayer, object: IFieldPlayer): void;
  handleFoul(data: IFoul, matchActions: Actions): void;
  handleShot(data: IShot, matchActions: Actions): void;
}

export interface ISentOff {
  player: IFieldPlayer;
  /** Whether this dismissal came from a second yellow rather than a straight red. */
  secondYellow: boolean;
}

/**
 * Reason this
 */
export interface IFoul {
  reason: 'foul' | 'yellow card' | 'red card';
  subject: IFieldPlayer;
  object: IFieldPlayer;
  where: IBlock;
  interruption: boolean;
}

export interface IShot {
  reason: string;
  result: 'goal' | 'miss' | 'save';
  shooter: IFieldPlayer;
  keeper: IFieldPlayer;
  where: IBlock;
  interruption: boolean;
}

export interface IPass {
  reason?: string;
  intercepted: boolean;
  passer: IFieldPlayer;
  receiver: IFieldPlayer;
  interceptor?: IFieldPlayer | undefined;
}

export interface IDribble {
  dribbler: IFieldPlayer;
  dribbled: IFieldPlayer;
}

export interface ITackle {
  tackler: IFieldPlayer;
  tackled: IFieldPlayer;
  success: boolean;
}

export interface IInterception {
  passer: IFieldPlayer;
  interceptor: IFieldPlayer;
}

export const GamePoints = {
  Pass: 0.25,
  Goal: 1,
  Save: 1,
  Tackle: 0.25,
  Dribble: 0.5,
  Assist: 0.5,
  Interception: 0.25,
};
