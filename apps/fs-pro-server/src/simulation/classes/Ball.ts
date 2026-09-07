import { ballMove, matchEvents } from '../utils/events';
import CO from '../utils/coordinates';
import { IBlock, ICoordinate } from '../state/ImmutableState/FieldGrid';
import log from '../../helpers/logger';
import {
  createRandomSource,
  randomNDigits,
  RandomInput,
  RandomSource,
} from '../randomness';

class BallClass {
  public static instances: number;
}

/**
 * Milestone 17 (Independent Ball Model) - the two ball states this engine
 * can actually ever OBSERVE as distinct, given every pass/shot/tackle/
 * restart resolves fully synchronously within a single tick (established
 * since Milestone 1's own tick loop): `'controlled'` (`holderId` is set)
 * and `'loose'` (nobody's holding it - the real, already-existing
 * "NO ACTIVE PLAYERS" case `Game.setPlayingSides()` falls back to
 * `moveTowardsBall()` for, which can genuinely persist across tick
 * boundaries until someone reaches it). The tracker's own sketch also
 * lists `'passing'`/`'shooting'`/`'out-of-play'` - deliberately NOT added:
 * each would be set and then immediately overwritten again within the
 * same synchronous call stack before anything could ever read it (a shot
 * goes loose, then the very next line of `Referee.handleShot()` already
 * reassigns it to the keeper; a ball going out freezes position but
 * `handleBallOut()` resolves synchronously too) - adding enum values with
 * zero observable effect anywhere in this codebase would be exactly the
 * premature-abstraction pattern this project avoids elsewhere. Modeling
 * them for real would need actual multi-tick ball flight (an `arrivalTick`
 * a pass/shot doesn't resolve until), which is the same class of
 * deliberately-deferred, large recalibration risk already flagged for the
 * field grid's resolution and the simulation tick length itself - see
 * Milestone 16's own notes.
 */
export type BallPossessionState = 'controlled' | 'loose';

// tslint:disable-next-line: max-classes-per-file
export default class Ball implements IBall, BallClass {
  public get created(): Date {
    return this._created;
  }
  public static instances = 0;
  public Color: string;
  public Position: IBlock;
  public id: string;
  public Match_id: string;
  /** Milestone 17 - the single, canonical source of "who has the ball"
   * (the tracker's own "make BallState the canonical source of ball
   * ownership"). Previously there was no such field at all - each of the
   * ~22 `FieldPlayer`s independently maintained its OWN `WithBall`
   * boolean, reactively recomputed on every ball move by comparing its
   * own block key to the ball's - 22 redundant computations of the same
   * fact, each one capable of independently drifting from the others if
   * upstream block-occupancy ever desynced (the exact, long-documented
   * "2 players simultaneously have WithBall" warning `Game.
   * setPlayingSides()` has logged since Milestone 9). With a single
   * `holderId` field, "two players both have the ball" is now structurally
   * impossible, not just unlikely - there is only one value to disagree
   * with. `FieldPlayer.WithBall` is now a derived getter reading this
   * field (see `FieldPlayer.ts`), not an independently-tracked boolean. */
  public holderId?: string;
  public state: BallPossessionState = 'loose';
  // private Observers: IFieldPlayer[] = [];
  private ballMove = ballMove;
  private readonly _created: Date;
  private readonly random: RandomSource;

  constructor(color: string, pos: IBlock, match_id: string, random?: RandomInput) {
    this.Color = color;
    this.Position = pos;
    this._created = new Date();
    this.random = createRandomSource(random);
    this.id = '' + randomNDigits(5, this.random);
    this.Match_id = match_id;
    Ball.instances++;
  }

  /**
   * @param pos movement delta (unchanged - every existing caller already
   *   computes a delta via `Coordinates.calculateDifference()`).
   * @param holderId Milestone 17's new parameter, EXPLICIT rather than
   *   inferred from position - the caller always already knows who's
   *   about to have the ball (the pass receiver, the interceptor, the
   *   tackler, the restart taker) at the moment they call this, so there's
   *   no reason to re-derive it from position matching afterward, the way
   *   the old per-player reactive listeners did. Omit entirely (`undefined`,
   *   the default) to leave the current holder unchanged - a dribble/carry,
   *   still the same player, see `FieldPlayer.move()`. Pass `null`
   *   explicitly to clear it (the ball is now loose - `shoot()`, in flight
   *   until a keeper/restart claims it). Pass a player id to assign that
   *   player as the new holder (a completed pass, a won tackle, a restart
   *   taker).
   */
  public move(pos: ICoordinate, holderId?: string | null) {
    // console.log('Position => ', this.Position, 'pos => ', pos);
    log(
      `old Coordinates ${JSON.stringify({ x: this.Position.x, y: this.Position.y })}`
    );

    log(`sent coordinates ${JSON.stringify({ x: pos.x, y: pos.y })}`);

    const newCoordinates = {
      x: this.Position.x + pos.x,
      y: this.Position.y + pos.y,
    };

    // this.Position.x += pos.x;
    // this.Position.y += pos.y;
    // this.Position.key = 'P' + XYToIndex(this.Position.x, this.Position.y, 12);

    let newPosition = CO.co.coordinateToBlock(newCoordinates);
    // if Position is undefined, the Block does not exist.
    // i.e the ball is out!

    if (!newPosition) {
      // meaning this ball would have gone out by the flanks
      // e.g original position is 8, 5 and the movement coords is 0, -6
      // the new position would be 8, -1 which is out.
      const isGoingOutAtFlanks =
        this.Position.y + pos.y < 0 ||
        this.Position.y + pos.y > this.Position.Field.mapHeight - 1;
      const isGoingOutAtEnds =
        this.Position.x + pos.x < 0 ||
        this.Position.x + pos.x > this.Position.Field.mapWidth - 1;

      // The ball has left whoever's control it was in, regardless of
      // whether the caller passed an explicit holderId for this attempt -
      // nobody can be "holding" a ball that's gone out.
      this.holderId = undefined;
      this.state = 'loose';

      matchEvents.emit(`${this.Match_id}-ball-out`, {
        where: this.Position,
        towards: isGoingOutAtEnds
          ? 'ends'
          : isGoingOutAtFlanks
            ? 'flanks'
            : 'idk',
      });
    } else {
      this.Position = newPosition;

      if (holderId !== undefined) {
        this.holderId = holderId ?? undefined;
        this.state = holderId ? 'controlled' : 'loose';
      }
    }

    log(
      `New Ball position ${JSON.stringify({
        x: this.Position.x,
        y: this.Position.y,
        key: this.Position.key,
      })}`
    );

    // this.notifyObservers();
    // Milestone 17 - kept as a hook other systems could subscribe to (live
    // replay broadcasting, say) even though nothing currently does -
    // FieldPlayer's own former listener (the actual reason this existed)
    // is gone now that WithBall is a derived getter, not something that
    // needed reactively pushing to 22 players on every move.
    this.ballMove.emit(`${this.id}-ball-moved`, this.Position);
  }
}

/**
 * Historical bug report, kept for context: neither player involved in a
 * tackle appeared to have the ball afterward - two players' own
 * independently-tracked `WithBall` booleans had drifted apart from each
 * other and from the ball's actual position. That was a structural
 * consequence of the old design (22 players, each reactively recomputing
 * its own belief about possession from position-key matching, with
 * nothing forcing them to agree) rather than one specific reproducible
 * step - which is exactly why it kept resurfacing across this file's own
 * "I believe this has been fixed!" history. Milestone 17 (Independent Ball
 * Model) is the actual structural fix: `holderId` above is the single,
 * canonical answer to "who has the ball" - `FieldPlayer.WithBall` reads
 * it, nothing computes its own independent copy anymore, so there is
 * nothing left to drift.
 */

export interface IBall {
  Color: string;
  Position: IBlock;
  created: Date;
  // unique ball id
  id: string;
  holderId?: string;
  state: BallPossessionState;
  move(pos: ICoordinate, holderId?: string | null): void;
}
