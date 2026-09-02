/* eslint-disable no-prototype-builtins */
/* eslint-disable no-case-declarations */
import { IFieldPlayer, IPositions } from '../../../interfaces/Player';
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
import log from '../../../helpers/logger';

export class Actions {
  public referee: IReferee;
  public decider: Decider;
  public interruption: boolean;
  public activePlayerAS: IFieldPlayer | undefined;
  public activePlayerDS: IFieldPlayer | undefined;
  public attackingSide: MatchSide | undefined;
  public defendingSide: MatchSide | undefined;
  public teams: MatchSide[];
  private match: Match;

  constructor(
    ref: IReferee,
    teams: MatchSide[],
    match: Match,
    as?: MatchSide,
    ds?: MatchSide,
    activePlayerAS?: IFieldPlayer,
    activePlayerDS?: IFieldPlayer
  ) {
    this.referee = ref;
    this.interruption = false;
    this.activePlayerAS = activePlayerAS;
    this.activePlayerDS = activePlayerDS;
    this.attackingSide = as;
    this.defendingSide = ds;
    this.teams = teams;
    this.match = match;

    log(`Teams => ${this.teams[0].Name} ${this.teams[1].Name}`);

    this.decider = new Decider(this.teams);

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

    const strategy = this.decider.makeDecision(
      attackingPlayer,
      attackingSide,
      defendingSide
    );

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
        switch (strategy.detail) {
          case 'short':
            this.pass(attackingPlayer, 'short', attackingSide, defendingSide);
            break;

          case 'long':
            this.pass(attackingPlayer, 'long', attackingSide, defendingSide);
            break;
          case 'pass to post':
            this.pass(
              attackingPlayer,
              'pass to post',
              attackingSide,
              defendingSide
            );
            break;

          default:
            break;
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
        defendingSide
      );
    }
  }

  public pass(
    player: IFieldPlayer,
    type: string,
    squad: MatchSide,
    defendingSide: MatchSide
  ) {
    // I am only doing this because of an error :!!!!:
    let teammate: IFieldPlayer;

    let situation: ISituation;

    let interceptorDistance = 2;

    // situation = { status: false, reason: 'no where to move' };

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
        interceptorDistance = 3;
        break;
      // Find the keeper! but keeper may alos be not gien the ball
      case 'pass to post':
        teammate = CO.co.findClosestPlayerByPosition(
          squad.KeepingSide,
          'GK',
          player,
          squad.ActivePlayers
        );
        interceptorDistance = 3;
        break;
      default:
        teammate = player;
        break;
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
        CO.co.calculateDifference(teammate.BlockPosition, player.BlockPosition)
      );
      matchEvents.emit(`${this.match.id}-pass-made`, {
        passer: player,
        receiver: teammate,
        intercepted: false,
      } as IPass);
    } else {
      // This player is close enough to intercept

      // Actually from now on it is the Decider class that will handle all this success rate...

      // Decider class, handle!
      /**
       * pass the player, the reciever and the nearest interceptor if possible...
       */

      // getPassResult() returns true when the PASSER wins the duel (per
      // getResult(passerStats, interceptorStats, ...) => $a > $b). This was
      // previously named `fail` and checked as `if (!fail)`, which
      // inverted the outcome - a pass only "succeeded" when the formula
      // said the INTERCEPTOR won. Every threshold tuned in
      // Decider.getPassResult to favor the passer was therefore making
      // interceptions MORE likely, not less - this is the actual reason
      // completion rate never responded to that tuning.
      const passSucceeds = this.decider.getPassResult(
        player,
        teammate,
        type,
        40,
        interceptor
      );

      if (passSucceeds) {
        player.pass(
          CO.co.calculateDifference(
            teammate.BlockPosition,
            player.BlockPosition
          )
        );
        matchEvents.emit(`${this.match.id}-pass-made`, {
          passer: player,
          receiver: teammate,
          intercepted: false,
        } as IPass);
        situation = { status: true, reason: 'Player pass successful' };
      } else {
        player.pass(
          CO.co.calculateDifference(
            interceptor.BlockPosition,
            player.BlockPosition
          )
        );
        matchEvents.emit(`${this.match.id}-pass-intercepted`, {
          passer: player,
          interceptor: interceptor,
          intercepted: true,
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
        const success = this.decider.getDribbleResult(player, opponentBlock);
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

          let successOfTightDribble = this.decider.getDribbleResult(
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
    // OWN slot (see getShapeTarget), preserving width instead of the whole
    // line collapsing onto the single ScoringSide point.
    const bias = 0.2 + team.Tactic.style.defensiveLineHeight * 0.5;
    const target = this.getShapeTarget(player, team.ScoringSide, bias);
    this.move(player, 'forward', target);
  }

  public movePlayersBackward(player: IFieldPlayer, team: MatchSide) {
    // Inverse of the above: a deep/low-block style retreats further when
    // regrouping, a high-line style barely drops off.
    const bias = 0.2 + (1 - team.Tactic.style.defensiveLineHeight) * 0.5;
    const target = this.getShapeTarget(player, team.KeepingSide, bias);
    this.move(player, 'fallback', target);
  }

  /**
   * A point between a player's formation slot (FieldPlayer.StartingPosition
   * - the stable per-player "home" block, kept current by
   * MatchSide.setFormation/changeTactic) and a destination block, blended
   * by `bias` (0 = stay at the slot, 1 = the destination itself). Only x
   * moves - y stays at the player's own slot, so the team's shape/width is
   * preserved instead of every player converging on one shared point.
   */
  private getShapeTarget(
    player: IFieldPlayer,
    destination: IBlock,
    bias: number
  ): IBlock {
    const home = player.StartingPosition;
    const x = Math.round(home.x + (destination.x - home.x) * bias);
    return CO.co.coordinateToBlock({ x, y: home.y });
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
    defendingSide: MatchSide
  ) {
    this.pushForward(attackingSide);

    // After every action by the attacking team, the defensive player must move towards the ball
    // and the attacking team must move forward towards opposition lines
    this.move(defendingPlayer, 'towards ball', defendingPlayer.Ball.Position);

    // Another function that makes midfielders and attackers move towards the ball
    // TODO: Change this depending on the playing style of Club...
    const shouldFallBack = this.decider.gimmeAChance();
    if (shouldFallBack < 50) {
      this.pressureBall(defendingSide);
    } else {
      this.pushBackward(defendingSide);
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

    const result = this.decider.getShotResult(player, keeper as IFieldPlayer);

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

      const randomIndex = Math.round(
        Math.random() * (freeBlocksAroundScoringSide.length - 1)
      );

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
  private findMarkingOpponent(player: IFieldPlayer, around: IPositions) {
    const arr: IFieldPlayer[] = [];
    for (const key in around) {
      if (around.hasOwnProperty(key) && around[key] !== undefined) {
        const block = around[key] as IBlock;
        const occupant = block.occupant;

        // if there is an occupant, push it!
        occupant && arr.push(occupant);
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

        // if there is an occupant, push it!
        occupant && arr.push(occupant);
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
      : this.decider.getTackleResult(tackler, player);

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
        CO.co.calculateDifference(tackler.BlockPosition, player.BlockPosition)
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

  private markBall(player: IFieldPlayer) {
    this.move(player, 'towards ball', player.Ball.Position);
  }

  /** Hold formation shape instead of chasing the ball - what every
   * non-pressing player does now, instead of piling on (see pressureBall). */
  private holdShape(player: IFieldPlayer, team: MatchSide) {
    const bias = 1 - team.Tactic.style.positionalDiscipline;
    const target = this.getShapeTarget(player, player.Ball.Position, bias);
    this.move(player, 'hold shape', target);
  }

  private pushForward(team: MatchSide) {
    // const chance = Math.round(Math.random() * 100);
    log('*-- Attacking Side pushing forward --*');

    const attackingPlayers = playerFunc.getATTMID(team);

    attackingPlayers.forEach((p) => {
      this.movePlayersForward(p, team);
    });
  }

  private pushBackward(team: MatchSide) {
    // const chance = Math.round(Math.random() * 100);
    log('*-- Team pushing backward --*');

    const attackingPlayers = playerFunc.getATTMID(team);

    attackingPlayers.forEach((p) => {
      this.movePlayersBackward(p, team);
    });
  }

  private pressureBall(team: MatchSide) {
    log('*-- Defending Side pressuring ball --*');

    // Find midfielders and attackers
    const defendingPlayers = playerFunc.getATTMID(team);

    if (defendingPlayers.length === 0) {
      return;
    }

    // Only the nearest few (per the team's playing style) actually close
    // the ball down - previously EVERY ATT/MID player beelined for the
    // exact ball coordinate every tick, which just swarmed the ball
    // carrier (whoever got there first tackled it, nobody held a passing
    // lane open). Everyone else holds their formation shape instead.
    const ballPosition = defendingPlayers[0].Ball.Position;
    const pressingIntensity = team.Tactic.style.pressingIntensity;

    const sortedByBallDistance = [...defendingPlayers].sort(
      (a, b) =>
        CO.co.calculateDistance(a.BlockPosition, ballPosition) -
        CO.co.calculateDistance(b.BlockPosition, ballPosition)
    );

    const pressers = sortedByBallDistance.slice(0, pressingIntensity);
    const holders = sortedByBallDistance.slice(pressingIntensity);

    pressers.forEach((p) => this.markBall(p));
    holders.forEach((p) => this.holdShape(p, team));
  }
}

interface ISituation {
  status?: boolean;
  reason: string;
}
