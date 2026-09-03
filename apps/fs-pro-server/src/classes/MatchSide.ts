import { Club } from './Club';
import { IFieldPlayer, PlayerInterface } from '../interfaces/Player';
import FieldPlayer from './FieldPlayer';
import Field, { IBlock } from '../state/ImmutableState/FieldGrid';
import Ball from './Ball';
import {
  resolveTactic,
  ResolvedFormationSlot,
  AttackingDirection,
  ITactic,
  IActiveTactic,
} from '../state/PersistentState/Formations';
import Player from './Player';
import { ClubInterface } from '../controllers/clubs/club.model';
import { sortFromKeeperDown } from '../utils/players';
import log from '../helpers/logger';

/** Matchday bench cap - a placeholder default, not a considered balance
 * pass (same treatment as the Transfer Market feature's Budget/Wage
 * constants). */
export const BENCH_SIZE = 7;
/** Locked scope: up to 3 subs per match, half-time only - see
 * Game.performHalfTimeSubstitutions(). */
export const MAX_SUBSTITUTIONS = 3;

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
  /** Bench pool - plain Player instances (no pitch position/Ball) until
   * actually subbed on, same shape as MatchSquad. Populated by
   * setFormation()'s selectMatchdaySquad(); consumed by
   * substitutePlayer(). */
  public Substitutes: Player[] = [];
  public MatchSquad: Player[] = [];
  public Tactic!: IActiveTactic;
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

  /**
   * Outfield players currently available for selection - excludes anyone
   * sent off or substituted off. StartingSquad itself keeps growing (a
   * substituted-off player stays in it forever, same treatment as a
   * sent-off one), so end-of-match reporting (getPlayerStats/getMOTM) and
   * formation setup keep working unchanged; gameplay logic (marking,
   * passing targets, restarts, who's closest to the ball) should query
   * this instead.
   */
  public get ActivePlayers(): IFieldPlayer[] {
    return this.StartingSquad.filter(
      (p) => p.MatchStatus !== 'sent-off' && p.MatchStatus !== 'substituted'
    );
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

  public setFormation(tactic: ITactic, ball: Ball, field: Field) {
    const direction = this.getAttackingDirection();

    this.Tactic = resolveTactic(tactic, field, direction);

    log('Tactic =>', this.Tactic);

    const { startingXI, bench } = this.selectMatchdaySquad(this.Tactic.slots);

    this.Substitutes = bench;
    this.StartingSquad = startingXI.map(
      ({ player, block }) => new FieldPlayer(player, true, block, ball)
    );
  }

  /**
   * Pick the best 11 for this formation's slots (best-remaining-Rating per
   * slot's listed positions) and bench the rest (capped at BENCH_SIZE,
   * Rating-desc). Bounded by construction - can never hand more than
   * slots.length players to FieldPlayer, unlike the old player-driven
   * getBlock() walk this replaces, which crashed once a club's signed
   * roster exceeded 11 (empty `formation` array -> `formation[0]` is
   * undefined -> `.block` throws). isReserve is deliberately not
   * consulted - this is pure auto-pick, no manual squad selection yet.
   */
  private selectMatchdaySquad(slots: ResolvedFormationSlot[]): {
    startingXI: { player: Player; block: IBlock }[];
    bench: Player[];
  } {
    const pool = [...this.MatchSquad];
    const startingXI: { player: Player; block: IBlock }[] = [];

    slots.forEach((slot) => {
      let pick: Player | undefined;

      for (const pos of slot.positions) {
        const candidates = pool
          .filter((p) => p.Position === pos)
          .sort((a, b) => b.Rating - a.Rating);
        if (candidates.length) {
          pick = candidates[0];
          break;
        }
      }

      if (!pick) {
        // Nobody fits this slot's listed positions at all (thin roster at
        // that position) - fall back to the best remaining player overall,
        // same "give him something" spirit as the old getBlock() fallback,
        // but bounded (pool is finite, never crashes).
        pick = [...pool].sort((a, b) => b.Rating - a.Rating)[0];
      }

      if (pick) {
        startingXI.push({ player: pick, block: slot.block });
        pool.splice(pool.indexOf(pick), 1);
      }
      // If pick is still undefined here, the club has fewer signed players
      // than formation slots - pre-existing, out-of-scope edge case (no
      // minimum-squad-size validation added this pass); the slot is simply
      // left unfilled rather than crashing.
    });

    const bench = pool.sort((a, b) => b.Rating - a.Rating).slice(0, BENCH_SIZE);

    return { startingXI, bench };
  }

  /**
   * Resolve and apply a new tactic (formation + playing style), reassigning
   * every player to their new slot. Callable at any point in a match, not
   * just half-time - half-time is just one caller of this (see
   * Game.swapClubFormations), and it's what backs the eventual "change
   * tactics mid-match" capability.
   *
   * IMPORTANT: this re-walks the ENTIRE StartingSquad through getBlock()
   * against exactly `slots.length` formation slots - it must only ever run
   * while StartingSquad still has exactly 11 entries. Substitutions
   * (substitutePlayer()) grow StartingSquad past 11 by design (a
   * substituted-off player stays in the array, marked 'substituted', for
   * post-match stats). Today this is safe because changeTactic() only
   * ever runs once per match, via Game.swapClubFormations() at half-time,
   * strictly BEFORE Game.performHalfTimeSubstitutions() runs. If a future
   * live/mid-match tactic-change trigger is ever wired up (see
   * Game.changeTactic()'s doc comment), it MUST filter to ActivePlayers
   * before re-walking, not raw StartingSquad, or this will throw exactly
   * like the old unbounded setFormation() did.
   */
  public changeTactic(
    tactic: ITactic,
    field: Field,
    scoringSide: IBlock,
    keepingSide: IBlock
  ) {
    this.ScoringSide = scoringSide;
    this.KeepingSide = keepingSide;

    const direction = this.getAttackingDirection();

    this.Tactic = resolveTactic(tactic, field, direction);

    log('Tactic =>', this.Tactic);

    const currentFormation = [...this.Tactic.slots];

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

  public matchSquad() {
    return null;
  }

  /**
   * Weakest-active-outfield-starter -> best-Rating-remaining-bench-player-
   * of-the-same-Position pairing, up to maxSubs. GK is excluded from both
   * sides deliberately - getGK() (utils/players.ts, called from
   * Referee.ts/Actions.ts) does `squad.find(p => p.Position === 'GK')`
   * against StartingSquad, which would keep resolving to a stale
   * substituted-off keeper (they sit earlier in the array) if a keeper sub
   * were ever allowed. Returns [] once outgoing candidates or matching
   * bench players are exhausted - safe to call with an empty bench (a
   * club with exactly 11 signed players never subs, doesn't throw).
   */
  public planHalfTimeSubstitutions(
    maxSubs: number = MAX_SUBSTITUTIONS
  ): { outgoing: IFieldPlayer; incoming: Player }[] {
    const outgoingCandidates = this.ActivePlayers.filter(
      (p) => p.Position !== 'GK'
    ).sort((a, b) => a.Rating - b.Rating);

    const benchPool = this.Substitutes.filter((p) => p.Position !== 'GK');

    const pairs: { outgoing: IFieldPlayer; incoming: Player }[] = [];

    for (const outgoing of outgoingCandidates) {
      if (pairs.length >= maxSubs) break;

      const idx = benchPool.findIndex((p) => p.Position === outgoing.Position);
      if (idx === -1) continue;

      const [incoming] = benchPool.splice(idx, 1);
      pairs.push({ outgoing, incoming });
    }

    return pairs;
  }

  /**
   * Executes one substitution: marks the outgoing player 'substituted'
   * (kept in StartingSquad forever, same pattern as 'sent-off' -
   * getPlayerStats()/getMOTM()/Match.captureFrame() all keep working
   * unmodified) and pushes the incoming player on as a new FieldPlayer at
   * the outgoing player's slot.
   */
  public substitutePlayer(outgoing: IFieldPlayer, incoming: Player, ball: Ball) {
    outgoing.MatchStatus = 'substituted';

    const incomingPlayer = new FieldPlayer(
      incoming,
      false,
      outgoing.StartingPosition,
      ball
    );

    this.StartingSquad.push(incomingPlayer);
    this.Substitutes = this.Substitutes.filter((p) => p._id !== incoming._id);
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
