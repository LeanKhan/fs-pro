/* eslint-disable no-prototype-builtins */
/* eslint-disable no-case-declarations */
import { IFieldPlayer, IPositions } from '../../../../interfaces/Player';
import CO from '../../../utils/coordinates';
import * as playerFunc from '../../../utils/players';
import { MatchSide } from '../../../classes/MatchSide';
import { IBlock, ICoordinate } from '../../ImmutableState/FieldGrid';
import Ball, { IBall } from '../../../classes/Ball';
import { matchEvents, createMatchEvent } from '../../../utils/events';
import {
  IReferee,
  IShot,
  IPass,
  IDribble,
  ITackle,
  IFoul,
} from '../../../classes/Referee';
import { Decider, IStrategy } from './Decider';
import { Match, IMatchData } from '../../../classes/Match';
import log from '../../../../helpers/logger';
import { createRandomSource, RandomInput, RandomSource } from '../../../randomness';
import { determineIntent } from '../../../team/TeamController';
import { buildObservation } from '../../../player/ObservationBuilder';
import { toStrategy } from '../../../player/PlayerIntent';
import { RuleBasedPlayerPolicy } from '../../../player/RuleBasedPlayerPolicy';
import { PlayerPolicy } from '../../../player/PlayerPolicy';
import { PassResolver } from '../../../resolver/PassResolver';
import { TackleResolver } from '../../../resolver/TackleResolver';
import { ShotResolver } from '../../../resolver/ShotResolver';
import { MatchPhase } from '../../../possession/MatchPhase';
import {
  AttackingOffBallIntent,
  DefensiveIntent,
  DefensiveAssignment,
  decideAttackingOffBallIntent,
  decideDefensiveIntent,
  planDefensiveAssignments,
} from '../../../player/OffBallPolicy';
import { deriveTendencies } from '../../../player/PlayerRole';

/** Milestone 16 - one collected-but-not-yet-executed off-ball decision:
 * who, doing what, headed where. See `resolveOffBallMoves()`. */
interface OffBallMove<Intent extends string> {
  player: IFieldPlayer;
  intent: Intent;
  target: IBlock;
}

/**
 * Percent chance the defending side actively presses the ball carrier
 * this tick rather than dropping into shape, by phase. Before this
 * milestone this was a flat 50/50 regardless of situation - these center
 * around that same midpoint so the aggregate mix doesn't swing wildly,
 * while still meaningfully differentiating `press`/`defensive-transition`
 * (win it back fast) from `defensive-shape` (protect the box instead of
 * chasing).
 */
const DEFEND_PRESS_CHANCE: Record<MatchPhase, number> = {
  press: 65,
  'defensive-transition': 75,
  'defensive-shape': 35,
  restart: 50,
  'build-up': 50,
  progression: 50,
  'final-third': 50,
  chance: 50,
  'attacking-transition': 50,
  counter: 50,
};

/**
 * Milestone 12 (Formation Anchors And Team Shape) - `getShapeTarget()`'s
 * per-role forward/back multiplier: how strongly a player is pulled off
 * their formation anchor at all, under an identical team-wide bias.
 * Defenders anchor hardest (a back line that surges as eagerly as the
 * attack isn't a back line), attackers drift most freely. GK is
 * deliberately absent - goalkeepers never go through this shape system at
 * all (see `getOutfield()`), their positioning stays the existing
 * keeper-reset logic in `Referee.ts`.
 */
const ROLE_SHAPE_BIAS: Partial<Record<string, number>> = {
  DEF: 0.3,
  MID: 0.85,
  ATT: 1,
};

/** How strongly the ball's flank pulls a player off their anchor's own
 * width, at a tactic's most width-permissive (`style.width` near 0 -
 * "narrow" tactics resist the pull less, not more; see `getShapeTarget()`).
 * Kept modest - this is a shape-preserving drift, not ball-chasing. */
const WIDTH_DRIFT_SCALE = 0.25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Milestone 13 - how close (in `findClosestToSegment`'s lane-width units,
 * see `Actions.pass()`'s own doc comment on why this ISN'T run through
 * `scaleDistance()`) a defender must be to the pass line to be considered
 * a plausible interceptor, by pass type. Longer/riskier pass shapes travel
 * through more of the pitch, so a wider band of defenders can plausibly
 * step into the lane. Previously only 'long'/'pass to post' got the wider
 * band (3); every other type defaulted to 2. */
const INTERCEPTOR_DISTANCE_BY_PASS_TYPE: Record<string, number> = {
  short: 2,
  backward: 2,
  long: 3,
  'pass to post': 3,
  through: 3,
  wide: 3,
};

export class Actions {
  public referee: IReferee;
  public decider: Decider;
  /** Milestone 7 - wraps `this.decider` (same instance, not a second
   * one - see RuleBasedPlayerPolicy's own doc comment for why that
   * matters). Only decision-making (`makeDecision`) goes through the
   * policy - outcome resolution moved to passResolver/tackleResolver/
   * shotResolver below in Milestone 8 (Decider no longer has outcome
   * methods at all). */
  public playerPolicy: PlayerPolicy;
  /** Milestone 8 - moved out of Decider (see resolver/*.ts's own doc
   * comments for the exact formula-preservation/random-sharing notes). */
  public passResolver: PassResolver;
  public tackleResolver: TackleResolver;
  public shotResolver: ShotResolver;
  public interruption: boolean;
  public activePlayerAS: IFieldPlayer | undefined;
  public activePlayerDS: IFieldPlayer | undefined;
  public attackingSide: MatchSide | undefined;
  public defendingSide: MatchSide | undefined;
  public teams: MatchSide[];
  private match: Match;
  private readonly random: RandomSource;

  constructor(
    ref: IReferee,
    teams: MatchSide[],
    match: Match,
    as?: MatchSide,
    ds?: MatchSide,
    activePlayerAS?: IFieldPlayer,
    activePlayerDS?: IFieldPlayer,
    random?: RandomInput
  ) {
    this.referee = ref;
    this.interruption = false;
    this.activePlayerAS = activePlayerAS;
    this.activePlayerDS = activePlayerDS;
    this.attackingSide = as;
    this.defendingSide = ds;
    this.teams = teams;
    this.match = match;
    this.random = createRandomSource(random);

    log(`Teams => ${this.teams[0].Name} ${this.teams[1].Name}`);

    this.decider = new Decider(this.teams, this.random.fork('decider'));
    this.playerPolicy = new RuleBasedPlayerPolicy(this.decider);
    this.passResolver = new PassResolver();
    this.tackleResolver = new TackleResolver();
    // Shares Decider's OWN random instance (not a fresh fork) - see
    // ShotResolver's doc comment for why that matters.
    this.shotResolver = new ShotResolver(this.teams, this.decider.random);

    matchEvents.on(`${this.match.id}-game-halt`, (data: IFoul) => {
      this.interruption = data.interruption;
      // Referee.foul() already emits this, but nothing ever actually ran
      // the free-kick/penalty/card setup it implies - handleFoul()
      // (fully written, never called) does that.
      this.referee.handleFoul(data, this);
    });

    matchEvents.on(`${this.match.id}-shot`, (data: IShot) => {
      this.interruption = data.interruption;
      this.referee.handleShot(data, this);
    });

    matchEvents.on(
      `${this.match.id}-setting-playing-sides`,
      (data: IMatchData) => {
        this.setSides(data);
      }
    );
  }

  get getPlayingSides(): IMatchData {
    const data = {
      activePlayerAS: this.activePlayerAS,
      attackingSide: this.attackingSide,
      activePlayerDS: this.activePlayerDS,
      defendingSide: this.defendingSide,
    } as IMatchData;
    return data;
  }

  // TODO TAKE ACTION FOR ALL PLAYERS!
  // Well... the 'action' taken by the other players is to move forward lol
  // But actually I should consider this.

  public takeAction(
    attackingPlayer: IFieldPlayer,
    attackingSide: MatchSide,
    defendingSide: MatchSide,
    defendingPlayer: IFieldPlayer
  ) {
    // First of all, check what the attacking side should do
    //  then check what the defensive side should do...

    // const option = getOption();

    this.setSides({
      activePlayerAS: attackingPlayer,
      attackingSide,
      activePlayerDS: defendingPlayer,
      defendingSide,
    } as IMatchData);

    // Milestone 11 (Possession And Match Phases) - what's true "as of the
    // start of this tick" (which possession sequence is running, how it
    // began, for how long) - read once, fed to both sides' TeamIntent so
    // attacking/defending phase agree on the same underlying facts.
    const possessionContext = this.match.getPossessionContext();
    const phaseContext = {
      reason: possessionContext.reason,
      minutesSinceStart: possessionContext.minutesSinceStart,
      ballPosition: attackingPlayer.BlockPosition,
    };

    // Milestone 7 (Team Intent And Player Policy) - team intent and the
    // player's observation are genuinely computed and passed to the
    // policy every decision (satisfying "player policy receives
    // observation and team intent"); the wrapped Decider's own internals
    // still recompute equivalent values themselves rather than consuming
    // these yet - see RuleBasedPlayerPolicy's doc comment. toStrategy()
    // converts back losslessly so everything below is unchanged.
    const teamIntent = determineIntent(attackingSide, defendingSide, {
      hasBall: true,
      ...phaseContext,
    });
    // Milestone 11 - the defending side's own intent (phase in particular)
    // is now genuinely computed too, not just the possessing side's - see
    // `continueGamePlay()`'s press/drop-off gate below for its one
    // consumer so far.
    const defendingIntent = determineIntent(defendingSide, attackingSide, {
      hasBall: false,
      ...phaseContext,
    });
    this.match.setCurrentPhase(teamIntent.phase);

    const observation = buildObservation(attackingPlayer, attackingSide, defendingSide);
    // Milestone 15 (Player Roles And Tendencies) - this player's own
    // derived tendencies, independent of the team-wide teamIntent above.
    const tendencies = deriveTendencies(attackingPlayer);
    const intent = this.playerPolicy.decide(
      attackingPlayer,
      observation,
      teamIntent,
      tendencies,
      attackingSide,
      defendingSide
    );
    const strategy = toStrategy(intent);

    this.interruption = false;

    log(
      `Taking Action... \nStrategy is => ${strategy.detail} ${strategy.type}`
    );
    const log_data = {
      Player: attackingPlayer.FirstName + ' ' + attackingPlayer.LastName,
      Club: attackingSide.ClubCode,
      Position: attackingPlayer.Position,
    };

    log(log_data, 'table');

    switch (strategy.type) {
      case 'pass':
        // Milestone 13 (Passing Options And Decision Evaluation) -
        // previously a switch re-dispatching to the exact same
        // `this.pass()` call for each of three known detail strings
        // (silently doing nothing for anything else). `Decider` can now
        // produce five pass shapes plus the pre-existing 'pass to post'
        // special case, all handled identically here - `Actions.pass()`
        // itself is what actually branches on `type`/`strategy.target`.
        if (strategy.detail) {
          this.pass(
            attackingPlayer,
            strategy.detail,
            attackingSide,
            defendingSide,
            strategy.target
          );
        }

        matchEvents.emit(`${this.match.id}-set-playing-sides`);
        break;
      case 'shoot':
        log('SHOOOOOOT!!!!!');
        this.shoot(attackingPlayer, attackingSide.ScoringSide, 'shot');
        break;

      case 'move':
        log('Move attempt');

        // Routed through movePlayersForward (not a raw move(...ScoringSide))
        // so the ball carrier's own decided movement gets the same
        // shape-aware, tactic-biased target as everyone else - otherwise
        // the player WITH the ball beelines dead straight for the exact
        // goal block regardless of their formation slot.
        this.movePlayersForward(attackingPlayer, attackingSide);

        break;
    }

    // Move attackers and midfielders forward

    if (this.interruption) {
      // handle interruption
      log('handling interruption...');
    } else {
      matchEvents.emit(`${this.match.id}-set-playing-sides`);
      //  Continue gameplay
      this.continueGamePlay(
        attackingPlayer,
        attackingSide,
        defendingPlayer,
        defendingSide,
        teamIntent.phase,
        defendingIntent.phase
      );
    }
  }

  public pass(
    player: IFieldPlayer,
    type: string,
    squad: MatchSide,
    defendingSide: MatchSide,
    /** Milestone 13 (Passing Options And Decision Evaluation) - the
     * receiver `Decider`'s scored candidate system already chose, when
     * present. Takes priority over the type-based lookups below, which
     * stay exactly as they were for the paths that don't produce a
     * `target` yet (`keeperPass`, the near-post backpass special case,
     * and the two "escape a tight mark"/"had nowhere further to go"
     * fallback callers elsewhere in this class). */
    targetId?: string
  ) {
    // I am only doing this because of an error :!!!!:
    let teammate: IFieldPlayer;

    let situation: ISituation;

    let interceptorDistance = INTERCEPTOR_DISTANCE_BY_PASS_TYPE[type] ?? 2;

    // situation = { status: false, reason: 'no where to move' };

    const targeted = targetId
      ? squad.ActivePlayers.find((p) => p._id === targetId)
      : undefined;

    if (targeted) {
      teammate = targeted;
    } else {
      switch (type) {
        case 'short':
          teammate = CO.co.findClosestPlayer(
            player.BlockPosition,
            squad.ActivePlayers,
            player
          );
          break;

        case 'long':
          teammate = CO.co.findLongPlayer(
            player.BlockPosition,
            squad.ActivePlayers,
            player
          );
          break;
        // Find the keeper! but keeper may alos be not gien the ball
        case 'pass to post':
          teammate = CO.co.findClosestPlayerByPosition(
            squad.KeepingSide,
            'GK',
            player,
            squad.ActivePlayers
          );
          break;
        default:
          teammate = player;
          break;
      }
    }

    /**
     * Find the opponent best placed to intercept - i.e. standing closest to
     * the actual passing lane between player and teammate, not merely
     * closest to the receiver. Deliberately NOT run through
     * Coordinates.scaleDistance() - unlike the REACH thresholds in
     * Decider.ts (how far you can pass/shoot to), this is a LANE-WIDTH
     * concept like Decider.laneIsClear's laneWidth: how close a defender
     * must be to the actual pass line to plausibly stick a leg out and cut
     * it out. The finer 33x21 grid gives that a smaller, more precise
     * real-world footprint, which is correct, not stale - scaling it up
     * (as briefly tried) made interceptors show up far more often than
     * intended and tanked pass completion into the 30s%.
     */
    const interceptor = CO.co.findClosestToSegment(
      player.BlockPosition,
      teammate.BlockPosition,
      defendingSide.ActivePlayers,
      interceptorDistance
    );

    if (!interceptor) {
      // This player can't intercept the ball hohoho, let it pass.
      player.pass(
        CO.co.calculateDifference(teammate.BlockPosition, player.BlockPosition),
        teammate._id!
      );
      matchEvents.emit(`${this.match.id}-pass-made`, {
        passer: player,
        receiver: teammate,
        intercepted: false,
        passType: type,
      } as IPass);
    } else {
      // This player is close enough to intercept

      // Actually from now on it is the Decider class that will handle all this success rate...

      // Decider class, handle!
      /**
       * pass the player, the reciever and the nearest interceptor if possible...
       */

      // PassResolver.resolve() returns true when the PASSER wins the duel
      // (per getResult(passerStats, interceptorStats, ...) => $a > $b).
      // This was previously named `fail` and checked as `if (!fail)`,
      // which inverted the outcome - a pass only "succeeded" when the
      // formula said the INTERCEPTOR won. Every threshold tuned to favor
      // the passer was therefore making interceptions MORE likely, not
      // less - this is the actual reason completion rate never responded
      // to that tuning.
      const passSucceeds = this.passResolver.resolve(
        player,
        teammate,
        type,
        interceptor
      );

      if (passSucceeds) {
        player.pass(
          CO.co.calculateDifference(
            teammate.BlockPosition,
            player.BlockPosition
          ),
          teammate._id!
        );
        matchEvents.emit(`${this.match.id}-pass-made`, {
          passer: player,
          receiver: teammate,
          intercepted: false,
          passType: type,
        } as IPass);
        situation = { status: true, reason: 'Player pass successful' };
      } else {
        player.pass(
          CO.co.calculateDifference(
            interceptor.BlockPosition,
            player.BlockPosition
          ),
          interceptor._id!
        );
        matchEvents.emit(`${this.match.id}-pass-intercepted`, {
          passer: player,
          interceptor: interceptor,
          intercepted: true,
          passType: type,
        } as IPass);

        situation = { status: true, reason: 'pass intercepted' };
      }
    }
  }

  /**
   * Move player
   *
   * @param player player that is moving
   * @param type type of movement: 'forwards' , 'towards ball' etc.
   * @param ref where you want to move the player to
   */
  public move(player: IFieldPlayer, type: string, ref: IBlock): ISituation {
    const around = player.checkNextBlocks();

    let situation: ISituation = {
      status: false,
      reason: 'no free block around',
    };

    let path = CO.co.findPath(ref, player.BlockPosition);

    // Check if there's a free block around the player -- if not do something else
    if (playerFunc.findFreeBlock(around) !== undefined) {
      switch (type) {
        case 'towards ball':
          // const ball = ref;

          situation = {
            status: true,
            reason: 'move towards ball',
          };

          // // Find the path to the ball

          // // Make move towards that path
          // if (this.makeMove(player, path, around)) {
          //   // It means move was successful
          //   situation = {
          //     status: true,
          //     reason: 'move towards ball successful',
          //   };
          // } else {
          //   // means no where to move
          //   situation = {
          //     status: true,
          //     reason: 'no where to move, no interruption',
          //   };
          // }
          break;

        case 'fallback':
          // const keepingSide = ref;

          // // Find the path to the ball
          // path = CO.co.findPath(keepingSide, player.BlockPosition);

          situation = {
            status: true,
            reason: 'move fallback',
          };

          // Make move towards that path
          // if (this.makeMove(player, path, around)) {
          //   // It means move was successful
          //   situation = {
          //     status: true,
          //     reason: 'move back to side successful',
          //   };
          // } else {
          //   // means no where to move
          //   situation = {
          //     status: true,
          //     reason: 'no where to move, no interruption',
          //   };
          // }
          break;

        case 'forward':
          situation = { status: true, reason: 'move forward' };

          break;
      }

      const opponentBlock = this.findMarkingOpponent(
        player,
        around
      ) as IFieldPlayer;

      log('Moving Forward!');
      // r being where you want to move the player to
      const r = ref;

      // asin x: -1 or y: 1
      // const p = CO.co.findPath(ref, player.BlockPosition);

      // If there is no marking opponent nearby just move
      // But if there is a marking opponent nearby, the opponent will try to take the ball from
      // the attackingPlayer
      if (!opponentBlock) {
        if (this.makeMove(player, path, around)) {
          situation.status = true;
        } else if (player.WithBall) {
          // path was {x:0,y:0} - this player already reached their
          // computed forward-shape target (see getShapeTarget) and
          // there's no marking opponent to dribble/tackle past either.
          // That target never changes on its own, so without this
          // fallback the ball carrier would freeze in place holding
          // the ball for the rest of the match (observed for 65+
          // straight ticks in a real game). Look up the player's own
          // squad directly rather than assuming this.attackingSide/
          // defendingSide line up with them - move() is also called
          // for defending-side players elsewhere in this class.
          const playerSquad = this.teams.find(
            (t) => t.ClubCode === player.ClubCode
          );
          const opponentSquad = this.teams.find(
            (t) => t.ClubCode !== player.ClubCode
          );
          if (playerSquad && opponentSquad) {
            this.pass(player, 'short', playerSquad, opponentSquad);
            situation = {
              status: true,
              reason: `move ${type} had nowhere further to go, passed instead`,
            };
          } else {
            situation.status = false;
          }
        } else {
          situation.status = false;
        }
        // If the player is with the ball and there is a bad guy around
      } else if (player.WithBall && opponentBlock) {
        // Tackle about to happen :0
        log(`Ball x,y => ${player.Ball.Position.x} ${player.Ball.Position.y}`);
        const success = this.tackleResolver.resolveDribble(player, opponentBlock);
        if (success) {
          // this.makeMove(player, p, around);
          this.successfulDribble(player, path, around, opponentBlock);
          // this.makeMove(player, p, around);
          situation = {
            status: true,
            reason: `move ${type} successful via dribble`,
          };
        } else {
          if (this.tackle(player, opponentBlock)) {
            situation = {
              status: false,
              reason: `move ${type} tackle successful, possession lost`,
            };
          } else {
            this.makeMove(player, path, around);
            situation = {
              status: true,
              reason: `move ${type} tackle failed, possession kept`,
            };
          }
        }
        // If the player is not with the ball even though bad guy around, still move.
      } else {
        if (this.makeMove(player, path, around)) {
          situation = {
            status: true,
            reason: `move ${type} successful, tho bad guy`,
          };
        } else {
          situation = {
            status: false,
            reason: `no where to move ${type}, tho bad guy`,
          };
        }
      }
    } else {
      console.log(
        'In the empty else for Actions. No free block around player.'
      );
      log(around);
      // situation = { status: false, reason: 'move towards ball successful' };
      // Player should pass now.

      // find the nearest Marker to this player.
      const marker = this.findMarkingOpponent(player, around) as IFieldPlayer;

      const markerTeammate = this.findMarkingTeammate(
        player,
        around
      ) as IFieldPlayer;

      /**
       * If a player has a marker nearby, do a dribble
       * - if dribble is successful, swap positions of players.
       * */

      if (player.WithBall) {
        console.log('With ball and tightly marked :/');

        if (marker) {
          // Give the player a real chance to pass out of trouble instead of
          // ALWAYS dribbling/contesting the tackle - previously dribble-or-
          // tackle was the only option ever considered here, so two closely
          // matched players (e.g. a winger and their marking fullback) could
          // keep re-contesting the exact same duel indefinitely, since
          // nothing ever routed the ball away from them.
          if (
            this.attackingSide &&
            this.defendingSide &&
            this.decider.gimmeAChance() <= 50
          ) {
            this.pass(player, 'short', this.attackingSide, this.defendingSide);
            return { status: true, reason: 'passed out of tight marking' };
          }

          let successOfTightDribble = this.tackleResolver.resolveDribble(
            player,
            marker
          );

          if (successOfTightDribble) {
            // swap positions away from this guy - a full jump to the
            // target block (not a single step), so the player actually
            // clears the contested area in one go. A 1-block-per-tick
            // shuffle here let an equally fast marker re-close the gap
            // just as quickly, recreating the same jam next tick.
            situation = {
              status: true,
              reason: 'dribbled successfully while tightly marked',
            };

            const toMoveTo = playerFunc.findFarthestFreeBlock(marker, 5);
            player.move(
              CO.co.calculateDifference(toMoveTo, player.BlockPosition)
            );

            matchEvents.emit(`${this.match.id}-dribble`, {
              dribbler: player,
              dribbled: marker,
            } as IDribble);
            createMatchEvent(
              this.match.id,
              `${player.FirstName} ${player.LastName} [${player.ClubCode}]
              dribbled ${marker.FirstName} ${marker.LastName}`,
              'dribble',
              player._id,
              player.ClubCode
            );
          } else {
            // Real tackle odds, not a forced win - and whoever ends up
            // with the ball jumps clear of the contested area afterwards.
            // Without this, neither player's position ever changes here
            // (tackle() only moves the ball), so the very next tick
            // re-triggers this exact same "no free block" branch - just
            // with roles reversed - producing an endless tackle-trade
            // between the same two players instead of the duel resolving.
            const tackleSuccess = this.tackle(player, marker);
            const ballHolder = tackleSuccess ? marker : player;

            const escapeTo = playerFunc.findFarthestFreeBlock(ballHolder, 5);
            ballHolder.move(
              CO.co.calculateDifference(escapeTo, ballHolder.BlockPosition)
            );

            situation = {
              status: tackleSuccess,
              reason: tackleSuccess
                ? 'tackle successful in close position, possession lost'
                : 'tackle failed in close position, possession kept',
            };
          }
        } else if (markerTeammate) {
          // pass
          situation = {
            status: true,
            reason: `move ${type} | ran away from closely marking teammate XD`,
          };

          const toMoveTo = playerFunc.findFarthestFreeBlock(markerTeammate, 5);
          player.move(
            CO.co.calculateDifference(toMoveTo, player.BlockPosition)
          );
        }
      } else {
        // I guess do nothing lol
        console.log(
          'Not with ball. Everyone is blocking me :(. Will stay here'
        );
      }
    }
    // console.log('situation -> ', situation);
    return situation;
  }

  public movePlayersForward(player: IFieldPlayer, team: MatchSide) {
    // Bias toward goal, not the goal block itself - a higher defensive
    // line pushes further forward, but every player advances from THEIR
    // OWN anchor (see getShapeTarget), preserving shape instead of the
    // whole line collapsing onto the single ScoringSide point.
    const bias = 0.2 + team.Tactic.style.defensiveLineHeight * 0.5;
    const target = this.getShapeTarget(
      player,
      team,
      team.ScoringSide,
      bias,
      player.Ball.Position
    );
    this.move(player, 'forward', target);
  }

  public movePlayersBackward(player: IFieldPlayer, team: MatchSide) {
    // Inverse of the above: a deep/low-block style retreats further when
    // regrouping, a high-line style barely drops off.
    const bias = 0.2 + (1 - team.Tactic.style.defensiveLineHeight) * 0.5;
    const target = this.getShapeTarget(
      player,
      team,
      team.KeepingSide,
      bias,
      player.Ball.Position
    );
    this.move(player, 'fallback', target);
  }

  /**
   * Milestone 12 (Formation Anchors And Team Shape) - blends a player's
   * formation anchor (`FieldPlayer.StartingPosition` - the stable per-
   * player "home" block, kept current by `MatchSide.setFormation()`/
   * `changeTactic()`; see `state/PersistentState/Formations.ts`'s
   * `FormationAnchor`) with a forward/back destination and the ball's
   * current flank, into one target block - the "gravitational home
   * position" the plan doc describes, not a fixed destination.
   *
   * Two axes, blended independently:
   *  - x (forward/back): `home` pulled toward `destination` by `bias`,
   *    scaled by this player's own role - defenders anchor harder than
   *    midfielders/attackers under the same tactic and phase (a back line
   *    should hold its shape even when the team as a whole pushes up).
   *  - y (width): `home` pulled toward `lateralReference` (almost always
   *    the ball) - `style.width` controls how much a team's own tactic
   *    resists that pull (a narrow-width tactic holds its lane closer to
   *    the anchor; a wide-play tactic still holds its OWN flank rather
   *    than following the ball across, since width means "stretch the
   *    pitch", not "collapse onto the ball").
   *
   * Previously this only moved x - y always stayed pinned to the anchor,
   * so width/wide-vs-narrow play had no positioning effect at all, and
   * every player's lateral spread was permanently identical to kickoff.
   */
  private getShapeTarget(
    player: IFieldPlayer,
    team: MatchSide,
    destination: ICoordinate,
    bias: number,
    lateralReference: ICoordinate
  ): IBlock {
    const home = player.StartingPosition;
    const style = team.Tactic.style;
    const roleBias = ROLE_SHAPE_BIAS[player.Position] ?? 1;

    const forwardBias = bias * roleBias;
    const widthBias = bias * roleBias * (1 - style.width) * WIDTH_DRIFT_SCALE;

    const maxX = CO.co.Field.mapWidth - 1;
    const maxY = CO.co.Field.mapHeight - 1;

    const x = clamp(
      Math.round(home.x + (destination.x - home.x) * forwardBias),
      0,
      maxX
    );
    const y = clamp(
      Math.round(home.y + (lateralReference.y - home.y) * widthBias),
      0,
      maxY
    );

    return CO.co.coordinateToBlock({ x, y });
  }

  /**
   * Continue gameplay...
   * * Push attacking side forward
   * * Move Defending player towards the ball
   * * Defending side pressures the ball
   * @param attackingPlayer
   * @param attackingSide
   * @param defendingPlayer
   * @param defendingSide
   */
  public continueGamePlay(
    attackingPlayer: IFieldPlayer,
    attackingSide: MatchSide,
    defendingPlayer: IFieldPlayer,
    defendingSide: MatchSide,
    attackingPhase: MatchPhase,
    defendingPhase: MatchPhase
  ) {
    const ballPosition = attackingPlayer.Ball.Position;

    // Milestone 16 (Simultaneous Intentions And Tick Loop) - "collect
    // player intentions before mutating state" / "conflicts are resolved
    // by the resolver layer, not by loop order". Every off-ball player's
    // intent AND target is computed here, from state nothing in this pass
    // has touched yet (StartingPosition/team posts/tactic/the one
    // `ballPosition` captured above - none of it changes as a result of
    // ANOTHER off-ball player's target being computed, confirmed by
    // inspection of resolveAttackingOffBallTarget/resolveDefensiveOffBallTarget
    // below) - only the EXECUTION loop after it (`this.move()`, which
    // reads live block occupancy) can actually contend with itself.
    // Previously decide-and-move were the same step, in raw `getOutfield()`
    // array order - whichever player happened to be enumerated first
    // silently won any contested free block. Executing in ball-distance
    // order instead (see below) replaces that accidental precedence with
    // a real, documented policy: whoever's nearest the actual play acts
    // with priority, not whoever the roster array lists first.
    const attackingPlan: OffBallMove<AttackingOffBallIntent>[] = playerFunc
      .getOutfield(attackingSide)
      .map((p) => {
        const intent = decideAttackingOffBallIntent(
          p,
          attackingPlayer,
          attackingSide,
          defendingSide,
          attackingPhase
        );
        const target = this.resolveAttackingOffBallTarget(
          p,
          attackingSide,
          intent,
          ballPosition
        );
        return { player: p, intent, target };
      });

    this.resolveOffBallMoves(attackingPlan, ballPosition);

    // After every action by the attacking team, the defensive player must
    // move towards the ball - TWICE this tick (here, and again below as a
    // guaranteed 'press'), matching the pre-Milestone-14 behavior this
    // replaces: the old pressureBall()/markBall() never excluded this same
    // nearest defender from its own presser selection, so they were always
    // both explicitly moved toward the ball AND (virtually always, being
    // already the nearest) selected as a presser too - moving twice in the
    // same tick. Confirmed live via an isolated A/B: excluding them from
    // the second move (the "obviously correct, no double-move" version,
    // tried first) halved the lead engaging defender's effective closing
    // speed and measurably hurt shots/goals while inflating dribble-
    // contest counts (a slower-closing primary marker leaves the ball
    // carrier loosely marked for longer, extending contests instead of
    // resolving them). Keeping the double move preserves that pacing;
    // excluding `defendingPlayer` from the intent-assignment pool below
    // (rather than letting `decideDefensiveIntent` pick for them) keeps
    // them dedicated to engaging the ball, not pulled into a mark/
    // block-lane duty elsewhere on the pitch.
    this.move(defendingPlayer, 'towards ball', defendingPlayer.Ball.Position);
    this.move(defendingPlayer, 'press', ballPosition);

    // Milestone 11's phase-weighted press/drop-off roll still decides HOW
    // MANY of the REMAINING defenders also actively close the ball down
    // this tick (0 when the roll says no, per possession/MatchPhase.ts's
    // getDefendingPhase reasoning) - Milestone 14 is what decides what
    // everyone ELSE does instead of a blanket holdShape/pushBackward.
    const shouldPress =
      this.decider.gimmeAChance() < DEFEND_PRESS_CHANCE[defendingPhase];
    const pressingIntensity = shouldPress
      ? defendingSide.Tactic.style.pressingIntensity
      : 0;

    const assignment = planDefensiveAssignments(
      attackingPlayer,
      attackingSide,
      defendingSide
    );

    const defendingOutfield = playerFunc
      .getOutfield(defendingSide)
      .filter((p) => p !== defendingPlayer);

    // Milestone 15 - a high-pressing player (a box-to-box midfielder, a
    // wing-back) effectively "counts as closer" than their raw distance
    // to the ball, and a low-pressing one (a centre-back, a deep-
    // playmaker) effectively counts as further - so the eager presser a
    // step further away gets picked over the reluctant one a step closer,
    // rather than pure distance deciding it regardless of who the players
    // actually are.
    const pressingWeight = (p: IFieldPlayer) =>
      CO.co.calculateDistance(p.BlockPosition, ballPosition) *
      (1.3 - deriveTendencies(p).pressing * 0.5);

    const pressingIds = new Set(
      [...defendingOutfield]
        .sort((a, b) => pressingWeight(a) - pressingWeight(b))
        .slice(0, pressingIntensity)
        .map((p) => p._id)
    );

    const defendingPlan: OffBallMove<DefensiveIntent>[] = defendingOutfield.map(
      (p) => {
        const intent = decideDefensiveIntent(
          p,
          defendingPhase,
          assignment,
          pressingIds.has(p._id)
        );
        const markedOpponentId = assignment.markAssignments.get(p._id!);
        const markedOpponent = markedOpponentId
          ? attackingSide.ActivePlayers.find((o) => o._id === markedOpponentId)
          : undefined;
        const target = this.resolveDefensiveOffBallTarget(
          p,
          defendingSide,
          intent,
          ballPosition,
          assignment,
          markedOpponent?.BlockPosition
        );
        return { player: p, intent, target };
      }
    );

    this.resolveOffBallMoves(defendingPlan, ballPosition);
  }

  /**
   * Milestone 16 - the "resolver layer" the acceptance criteria ask for:
   * executes a batch of already-decided off-ball moves (collected above,
   * from state none of them mutate) in one deterministic order - nearest
   * to the ball first - rather than whatever order the roster happened to
   * be enumerated in. Only the actual movement (`this.move()`, which reads
   * live block occupancy) can contend for the same free block; ordering
   * by relevance to the current play is a real, documented priority
   * instead of an accidental one.
   */
  private resolveOffBallMoves<Intent extends string>(
    plan: OffBallMove<Intent>[],
    ballPosition: ICoordinate
  ): void {
    [...plan]
      .sort(
        (a, b) =>
          CO.co.calculateDistance(a.player.BlockPosition, ballPosition) -
          CO.co.calculateDistance(b.player.BlockPosition, ballPosition)
      )
      .forEach(({ player, intent, target }) => {
        this.move(player, intent, target);
      });
  }

  /**
   * Milestone 14 - turns an `AttackingOffBallIntent` into a concrete
   * target block. Every case but the pure man-marking-style defensive
   * ones (see `resolveDefensiveOffBallTarget`) is fundamentally "drift
   * toward X by some bias" - reuses Milestone 12's `getShapeTarget` (same
   * anchor-blend, same role/width handling) with a different
   * (destination, bias, lateralReference) tuple per intent, instead of
   * one shared bias applied to the whole team.
   */
  private resolveAttackingOffBallTarget(
    player: IFieldPlayer,
    team: MatchSide,
    intent: AttackingOffBallIntent,
    ballPosition: ICoordinate
  ): IBlock {
    const home = player.StartingPosition;
    const centerY = (CO.co.Field.mapHeight - 1) / 2;

    switch (intent) {
      case 'attack-box':
        // Push hard toward goal, narrowing only halfway toward the
        // goal-mouth rather than the exact single ScoringSide point -
        // multiple attackers all targeting that one point at once (tried
        // first) collapsed them on top of each other right in front of
        // goal, which is exactly the "players collapse onto one shared
        // destination" failure Milestone 12 was built to prevent, and
        // measurably tanked shots/goals by congesting the box instead of
        // creating chances in it.
        return this.getShapeTarget(player, team, team.ScoringSide, 0.7, {
          x: home.x,
          y: (home.y + centerY) / 2,
        });
      case 'overlap':
        // Push forward while holding station on the OWN flank (lateral
        // reference is the player's own anchor, so the width-blend pulls
        // toward itself - no drift toward the ball's, more central, side).
        return this.applyWidthTendency(
          this.getShapeTarget(player, team, team.ScoringSide, 0.55, home),
          player
        );
      case 'underlap':
        // Push forward while cutting inside toward the central channel.
        return this.applyWidthTendency(
          this.getShapeTarget(player, team, team.ScoringSide, 0.5, {
            x: home.x,
            y: centerY,
          }),
          player
        );
      case 'hold-width':
        // Barely move at all - anchor and destination are the same point.
        return this.applyWidthTendency(
          this.getShapeTarget(player, team, home, 0.15, home),
          player
        );
      case 'move-between-lines':
        // Drift into the ball-side pocket without fully committing width,
        // pulled slightly central rather than following the ball's flank.
        return this.getShapeTarget(player, team, ballPosition, 0.45, {
          x: home.x,
          y: centerY,
        });
      case 'make-run':
        // Burst forward aggressively into the space that's already been
        // confirmed open (see decideAttackingOffBallIntent).
        return this.applyWidthTendency(
          this.getShapeTarget(player, team, team.ScoringSide, 0.6, ballPosition),
          player
        );
      case 'drop-deep':
        // Come short toward own goal to offer an out-ball under pressure.
        return this.getShapeTarget(
          player,
          team,
          team.KeepingSide,
          0.35,
          ballPosition
        );
      case 'support':
      default: {
        // The pre-Milestone-14 default behavior, preserved verbatim as
        // the fallback: hold near the ball, tactic-driven bias.
        const bias = 1 - team.Tactic.style.positionalDiscipline;
        return this.getShapeTarget(player, team, ballPosition, bias, ballPosition);
      }
    }
  }

  /**
   * Milestone 15 (Player Roles And Tendencies) - nudges a computed target
   * further toward this player's own natural flank (high
   * `PlayerTendencies.width` - a winger) or back toward the centre (low
   * width - an inside-forward), on top of whatever `getShapeTarget()`
   * already produced from team tactic width. Bounded and symmetric: a
   * role-average width tendency (0.5) leaves the target untouched.
   */
  private applyWidthTendency(target: IBlock, player: IFieldPlayer): IBlock {
    const maxY = CO.co.Field.mapHeight - 1;
    const centerY = maxY / 2;
    const home = player.StartingPosition;
    const widthTendency = deriveTendencies(player).width;

    const pull = (widthTendency - 0.5) * 0.5;
    if (pull === 0) {
      return target;
    }

    const extremeY = home.y >= centerY ? maxY : 0;
    const reference = pull > 0 ? extremeY : centerY;
    const y = clamp(
      Math.round(target.y + (reference - target.y) * Math.abs(pull) * 2),
      0,
      maxY
    );

    return CO.co.coordinateToBlock({ x: target.x, y });
  }

  /**
   * Milestone 14 - turns a `DefensiveIntent` into a concrete target block.
   * `'mark'`/`'track-run'`/`'block-lane'`/`'press'` target a live point
   * (an opponent, a lane midpoint, the ball itself) directly rather than
   * blending off the player's own anchor - man-marking a specific
   * opponent or standing in a specific lane isn't a "drift by some bias"
   * shape at all.
   */
  private resolveDefensiveOffBallTarget(
    player: IFieldPlayer,
    team: MatchSide,
    intent: DefensiveIntent,
    ballPosition: ICoordinate,
    assignment: DefensiveAssignment,
    markedOpponentPosition?: ICoordinate
  ): IBlock {
    switch (intent) {
      case 'mark':
      case 'track-run':
        return CO.co.coordinateToBlock(markedOpponentPosition ?? ballPosition);
      case 'block-lane':
        return CO.co.coordinateToBlock(assignment.blockLaneTarget ?? ballPosition);
      case 'press':
        return CO.co.coordinateToBlock(ballPosition);
      case 'drop':
        // Actively retreating into a deeper block - the one defensive
        // default that still pulls toward the own goal rather than the
        // ball (matches the old pushBackward's intent).
        return this.getShapeTarget(
          player,
          team,
          team.KeepingSide,
          0.4,
          ballPosition
        );
      case 'cover':
      case 'hold-line':
      default: {
        // The common-case default for most defenders most of the time -
        // drift toward the ball rather than retreating toward goal
        // (matches the pre-Milestone-14 holdShape default this replaces,
        // which is why it's the fallback most defenders land on).
        // 'cover' sits a shade further off the ball than 'hold-line' -
        // still shading toward protecting space rather than jumping in.
        const bias =
          (1 - team.Tactic.style.positionalDiscipline) *
          (intent === 'cover' ? 0.7 : 1);
        return this.getShapeTarget(player, team, ballPosition, bias, ballPosition);
      }
    }
  }

  public kick(player: IFieldPlayer, direction: IBlock) {
    player.shoot(CO.co.calculateDifference(direction, player.BlockPosition));
    matchEvents.emit(`${this.match.id}-kick`, { subject: player });
  }

  public shoot(player: IFieldPlayer, post: IBlock, reason: string) {
    // matchEvents.emit(`${this.match.id}-shot`, { subject: player });

    // Use a reference to the player's team...
    const teamIndex = this.teams.findIndex(
      (t) => t.ClubCode === player.ClubCode
    );
    // Found by Position, not by exact block occupancy - the goalkeeper
    // isn't guaranteed to be standing precisely on the ScoringSide block at
    // the moment of the shot (more so on a finer-resolution grid), and
    // `.occupant` being null here was reaching downstream code that assumes
    // there's always a real keeper (e.g. Match.ts's goal handler).
    const defendingTeam = this.teams[teamIndex === 0 ? 1 : 0];
    const keeper = playerFunc.getGK(
      defendingTeam.StartingSquad
    ) as IFieldPlayer;

    const result = this.shotResolver.resolve(player, keeper as IFieldPlayer);

    if (result.goal) {
      // Shot is a goal, fine and good
      player.shoot(CO.co.calculateDifference(post, player.BlockPosition));
      matchEvents.emit(`${this.match.id}-shot`, {
        shooter: player,
        keeper,
        where: player.BlockPosition,
        interruption: true,
        result: 'goal',
        reason,
      } as IShot);
    } else if (result.onTarget && !result.goal) {
      // Shot is a miss
      player.shoot(CO.co.calculateDifference(post, player.BlockPosition));
      matchEvents.emit(`${this.match.id}-shot`, {
        shooter: player,
        keeper,
        where: player.BlockPosition,
        interruption: true,
        result: 'save',
        reason,
      } as IShot);
    } else if (!result.onTarget) {
      // Here put the ball at a random block hehehe
      // find free blocks around the scoring and pick a random one...

      let freeBlocksAroundScoringSide = CO.co.getBlocksAround(
        this.teams[teamIndex].ScoringSide!,
        5
      );

      // Filter the undefined or occupied ones
      freeBlocksAroundScoringSide = freeBlocksAroundScoringSide.filter(
        (block: IBlock) => {
          if (block === undefined || block.occupant !== null) {
            return false;
          } else {
            return true;
          }
        }
      );

      // Then return a random one...

      const randomIndex = this.random.nextInt(freeBlocksAroundScoringSide.length);

      const landingBlock = freeBlocksAroundScoringSide[randomIndex];

      // when a player misses a shot, they 'shoot' somewhere else.
      player.shoot(
        CO.co.calculateDifference(landingBlock, player.BlockPosition)
      );

      log('Free Blocks around keeper =>', freeBlocksAroundScoringSide);

      log('landing block =>', landingBlock);

      // Shot is off target
      matchEvents.emit(`${this.match.id}-shot`, {
        shooter: player,
        keeper,
        where: player.BlockPosition,
        interruption: true,
        result: 'miss',
        reason,
      } as IShot);
    }
  }

  public freekick(player: IFieldPlayer, ball: IBall, direction: IBlock) {
    // Move the ball to the player taking the freekick
    ball.move(CO.co.calculateDifference(player.BlockPosition, ball.Position));

    const where = CO.co.calculateDistance(player.BlockPosition, direction);

    if (where <= 3) {
      this.shoot(player, direction, 'freekick');
    } else {
      this.kick(player, direction);
    }
  }

  /**
   * Set Match data
   *
   */

  private setSides(data: IMatchData) {
    const { activePlayerAS, attackingSide, activePlayerDS, defendingSide } =
      data;

    this.activePlayerAS = activePlayerAS;
    this.attackingSide = attackingSide;
    this.activePlayerDS = activePlayerDS;
    this.defendingSide = defendingSide;
  }

  /**
   * Find an opponent block around the player
   * @param player
   * @param around
   */
  /**
   * Milestone 17 (Independent Ball Model) - `occupant` is excluded when
   * it's no longer an active player. Block occupancy isn't reliably
   * cleared for a sent-off/substituted player at every single place that
   * could later reposition them (e.g. `Referee.setUpSetPiece()` moving a
   * just-sent-off foul subject away from the restart spot) - rather than
   * chase every such call site, this is the one real chokepoint both
   * `findMarkingOpponent()`/`findMarkingTeammate()` already shared: a
   * player who isn't `MatchStatus === 'active'` can't plausibly still be
   * marking anyone, regardless of what a stale `occupant` reference says.
   * Found live via a dedicated verification script (see the tracker's own
   * Milestone 17 notes) - a phantom marker could "win" a tackle duel and
   * end up as `Ball.holderId` despite no longer being in the match.
   */
  private isMarkableOccupant(occupant: IFieldPlayer | null): occupant is IFieldPlayer {
    return occupant !== null && occupant.MatchStatus === 'active';
  }

  private findMarkingOpponent(player: IFieldPlayer, around: IPositions) {
    const arr: IFieldPlayer[] = [];
    for (const key in around) {
      if (around.hasOwnProperty(key) && around[key] !== undefined) {
        const block = around[key] as IBlock;
        const occupant = block.occupant;

        if (this.isMarkableOccupant(occupant)) {
          arr.push(occupant);
        }
      }
    }

    return arr.find((p) => {
      return p.ClubCode !== player.ClubCode;
    });
  }

  /** find closest teammate around */
  private findMarkingTeammate(player: IFieldPlayer, around: IPositions) {
    const arr: IFieldPlayer[] = [];
    for (const key in around) {
      if (around.hasOwnProperty(key) && around[key] !== undefined) {
        const block = around[key] as IBlock;
        const occupant = block.occupant;

        // if there is an active occupant, push it!
        if (this.isMarkableOccupant(occupant)) {
          arr.push(occupant);
        }
      }
    }

    return arr.find((p) => {
      return p.ClubCode == player.ClubCode;
    });
  }

  /**
   * Resolve a (possibly diagonal) single-step path into an actual move.
   *
   * `path` can have both x and y set (e.g. moving up-and-left). The
   * diagonal target block isn't tracked by `around` (which only knows the
   * four cardinal neighbours), so it's looked up directly via `blockAt`.
   * If the diagonal is blocked or off the pitch, each axis is tried on its
   * own before falling back to any free block around the player.
   */
  private makeMove(
    player: IFieldPlayer,
    path: ICoordinate,
    around: IPositions
  ) {
    const { x, y } = path;

    if (x !== 0 && y !== 0) {
      const diagonal = this.blockAt(player.BlockPosition, x, y);
      if (diagonal && diagonal.occupant == null) {
        player.move(path);
        return true;
      }

      const horizontal = x === -1 ? around.left : around.right;
      if (horizontal && horizontal.occupant == null) {
        player.move({ x, y: 0 });
        return true;
      }

      const vertical = y === -1 ? around.top : around.bottom;
      if (vertical && vertical.occupant == null) {
        player.move({ x: 0, y });
        return true;
      }

      return this.moveToAnyFreeBlock(player, around);
    }

    if (x !== 0) {
      const target = x === -1 ? around.left : around.right;
      if (target && target.occupant == null) {
        player.move(path);
        return true;
      }
      return this.moveToAnyFreeBlock(player, around);
    }

    if (y !== 0) {
      const target = y === -1 ? around.top : around.bottom;
      if (target && target.occupant == null) {
        player.move(path);
        return true;
      }
      return this.moveToAnyFreeBlock(player, around);
    }

    return false;
  }

  /** Bounds-checked lookup of the block offset from `pos` by (dx, dy). */
  private blockAt(pos: IBlock, dx: number, dy: number): IBlock | undefined {
    const maxX = pos.Field.mapWidth - 1;
    const maxY = pos.Field.mapHeight - 1;
    const x = pos.x + dx;
    const y = pos.y + dy;

    if (x < 0 || x > maxX || y < 0 || y > maxY) {
      return undefined;
    }

    return CO.co.coordinateToBlock({ x, y });
  }

  private moveToAnyFreeBlock(
    player: IFieldPlayer,
    around: IPositions
  ): boolean {
    const free = playerFunc.findFreeBlock(around) as IBlock;
    if (free === undefined) {
      return false;
    }
    const p = CO.co.findPath(free, player.BlockPosition);
    player.move(p);
    return true;
  }

  private successfulDribble(
    player: IFieldPlayer,
    path: ICoordinate,
    around: IPositions,
    dribbled: IFieldPlayer
  ) {
    // `path` is the player's general forward-shape step for this tick,
    // computed once at the top of move() - it's frequently {x:0,y:0} once
    // a player has already reached their current shape target. makeMove()
    // correctly no-ops in that case, but this function used to log a
    // "successful dribble" regardless, leaving the player and their
    // marker frozen on the exact same blocks. Since nothing about that
    // state ever changes on its own, the very next tick re-rolled the same
    // dribble and repeated the fake "success" indefinitely - a real match
    // was observed with a player stuck like this for 38 straight ticks.
    // Falling back to a genuine escape step away from the just-beaten
    // marker guarantees a dribble that actually succeeded always moves
    // the player somewhere.
    const moved = this.makeMove(player, path, around);
    if (!moved) {
      const escapeTo = playerFunc.findFarthestFreeBlock(dribbled, 3);
      player.move(CO.co.calculateDifference(escapeTo, player.BlockPosition));
    }
    matchEvents.emit(`${this.match.id}-dribble`, {
      dribbler: player,
      dribbled,
    } as IDribble);
    createMatchEvent(
      this.match.id,
      `${player.FirstName} ${player.LastName} [${player.ClubCode}] 
      dribbled ${dribbled.FirstName} ${dribbled.LastName}`,
      'dribble',
      player.PlayerID,
      player.ClubCode
    );
  }

  private tackle(
    player: IFieldPlayer,
    tackler: IFieldPlayer,
    predetermined = false
  ) {
    // log(`${tackler.LastName} is tackling ${player.LastName}`);
    const success = predetermined
      ? true
      : this.tackleResolver.resolveTackle(tackler, player);

    // A mistimed/aggressive tackle can draw a foul independent of whether
    // it actually wins the ball - higher Aggression and lower Tackling
    // skill make it more likely. Previously nothing in the engine ever
    // called Referee.foul() at all, despite the whole foul/card/set-piece
    // system (Referee.foul/handleFoul/setUpSetPiece) already being fully
    // written and simply never wired up - fouls were always exactly 0.
    const foulChance = Math.max(
      0,
      Math.min(
        100,
        30 + (tackler.Attributes.Aggression - tackler.Attributes.Tackling) * 0.3
      )
    );
    const fouled = this.decider.gimmeAChance() <= foulChance;
    if (fouled) {
      this.referee.foul(tackler, player);
    }

    matchEvents.emit(`${this.match.id}-tackle`, {
      tackler,
      tackled: player,
      success,
    } as ITackle);

    // A foul on this exact attempt already routed the restart (free-kick/
    // penalty taker + ball placement) through Referee.setUpSetPiece(),
    // which moves the ball relative to its own actual current position.
    // Unconditionally also moving it here - using a diff computed from the
    // pre-foul tackler/player positions - would stomp that correct
    // placement with a bogus offset, stranding the ball on an arbitrary,
    // almost certainly unoccupied block for the rest of the half (nothing
    // else ever explicitly reclaims it). Skip the ball move (and the
    // "tackled the ball from" narrative, which would contradict the foul
    // that was just called on the same challenge) whenever fouled.
    if (success && !fouled) {
      tackler.Ball.move(
        CO.co.calculateDifference(tackler.BlockPosition, player.BlockPosition),
        tackler._id!
      );
      createMatchEvent(
        this.match.id,
        `${tackler.FirstName} ${tackler.LastName} [${tackler.ClubCode}]
        tackled the ball from ${player.FirstName} ${player.LastName}`,
        'tackle',
        tackler.PlayerID,
        tackler.ClubCode
      );
    }

    return success;
  }

}

interface ISituation {
  status?: boolean;
  reason: string;
}
