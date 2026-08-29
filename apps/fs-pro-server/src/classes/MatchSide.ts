import { Club } from './Club';
import { IFieldPlayer, PlayerInterface } from '../interfaces/Player';
import FieldPlayer from './FieldPlayer';
import Field, { IBlock } from '../state/ImmutableState/FieldGrid';
import Ball from './Ball';
import {
  resolveFormation,
  ResolvedFormationSlot,
  AttackingDirection,
} from '../state/PersistentState/Formations';
import Player from './Player';
import { ClubInterface } from '../controllers/clubs/club.model';
import { sortFromKeeperDown } from '../utils/players';
import log from '../helpers/logger';

/** MatchSide
 *
 * Represents a team playing in a match.
 * @extends Club
 */

export class MatchSide extends Club {
  public AttackingForm = 0;
  public DefensiveForm = 0;
  public GoalsScored = 0;
  public StartingSquad: IFieldPlayer[] = [];
  public Substitutes: IFieldPlayer[] = [];
  public MatchSquad: Player[] = [];
  public Formation: ResolvedFormationSlot[] = [];
  /**
   * ScoringSide is where this team will be scoring
   * that is, it is the opponents post :p
   */
  public ScoringSide: IBlock;
  public KeepingSide: IBlock;
  /**
   *
   * @param club
   * @param scoringSide
   * @param KeepingSide
   */

  constructor(club: ClubInterface, scoringSide: IBlock, keepingSide: IBlock) {
    super(club);
    this.ScoringSide = scoringSide;
    this.KeepingSide = keepingSide;
  }

  public setPlayers() {
    this.MatchSquad = this.Players.map((p: PlayerInterface, i) => {
      return new Player(p);
    });
  }

  /**
   * Resolve which way this side is currently attacking, based on which
   * post is further along the x-axis. This stays correct automatically
   * across the half-time end-swap, since ScoringSide/KeepingSide get
   * swapped there rather than direction being tracked separately.
   */
  private getAttackingDirection(): AttackingDirection {
    return this.ScoringSide.x >= this.KeepingSide.x
      ? 'left-to-right'
      : 'right-to-left';
  }

  public setFormation(formation: string, ball: Ball, field: Field) {
    const direction = this.getAttackingDirection();

    this.Formation = resolveFormation(formation, field, direction);

    log('Formation =>', this.Formation);

    const currentFormation = [...this.Formation];

    // Sort them here...
    this.MatchSquad = sortFromKeeperDown(this.MatchSquad);

    this.StartingSquad = this.MatchSquad.map((p: PlayerInterface, i) => {
      // Find the first formation slot that fits this player's position
      const { block: startingBlock, index: foundIndex } = this.getBlock(
        p,
        currentFormation
      );

      currentFormation.splice(foundIndex, 1);

      return new FieldPlayer(p, true, startingBlock, ball);
    });
  }

  public changeFormation(
    formation: string,
    field: Field,
    scoringSide: IBlock,
    keepingSide: IBlock
  ) {
    this.ScoringSide = scoringSide;
    this.KeepingSide = keepingSide;

    const direction = this.getAttackingDirection();

    this.Formation = resolveFormation(formation, field, direction);

    log('Formation =>', this.Formation);

    const currentFormation = [...this.Formation];

    // Sort them here...
    this.StartingSquad = sortFromKeeperDown(
      this.StartingSquad
    ) as IFieldPlayer[];

    // just change each StartingSquad player to the new block position
    this.StartingSquad.forEach((player: IFieldPlayer, i) => {
      const { block: newStartingBlock, index: foundIndex } = this.getBlock(
        player,
        currentFormation
      );

      currentFormation.splice(foundIndex, 1);

      player.changePosition(newStartingBlock);
      player.changeStartingPosition(newStartingBlock);
    });
  }

  public resetFormation() {
    this.StartingSquad.forEach((player) => {
      player.changePosition(player.StartingPosition);
    });
  }

  public rollCall() {
    log('------ ======== -----');
    log('ROLL-CALL WAS ERE - DELETE SOON :)');
    log('-----------');
  }

  public setStartingSquad(starting: IFieldPlayer[]) {
    this.StartingSquad = starting;
  }

  public getPlayerStats() {
    return this.StartingSquad.map((p) => ({ ...p.GameStats, Player: p._id }));
  }

  public setSubstitutes(subs: IFieldPlayer[]) {
    this.Substitutes = subs;
  }

  public matchSquad() {
    return null;
  }

  /**
   * Find the first resolved formation slot that accommodates this player's
   * position, falling back to the first slot if nothing matches.
   */
  public getBlock(p: PlayerInterface, formation: ResolvedFormationSlot[]) {
    if (formation.length === 1) {
      return { block: formation[0].block, index: 0 };
    }

    let index = -1;
    let formationSlot = formation.find((slot, id) => {
      index = id;
      return slot.positions.includes(p.Position);
    });

    if (!formationSlot) {
      // give him something...
      formationSlot = formation[0];
    }

    return { block: formationSlot.block, index };
  }
}