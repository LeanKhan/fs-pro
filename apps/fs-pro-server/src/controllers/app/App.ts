/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import Coordinates from '../../utils/coordinates';
import { matchEvents } from '../../utils/events';
import { getClubs } from '../clubs/club.service';
import { IClub } from '../../interfaces/Club';
import Game from '../Game';
import { resolveManagerTactic } from '../managers/manager.service';
import { ITactic } from '../../state/PersistentState/Formations';

export default class App {
  public static instance: App;

  public static instances = 0;

  public static create() {
    if (!App.instance) {
      App.instance = new App();
    }
  }

  public static get _app() {
    return App.instance;
  }

  public Game: Game | undefined;

  private Coordinates!: Coordinates;

  constructor() {
    App.instances++;
  }

  /** Setup Game => Run this first */
  /**
   * @param prefetchedClubs when provided (e.g. from a worker_thread that
   * can't touch the DB itself), used instead of fetching clubs here.
   * @param prefetchedTactics same idea, for each side's starting tactic -
   * when provided, skips the manager lookup entirely (a worker_thread has
   * no DB connection to do that lookup with).
   */
  public async setupGame(
    clubs: string[],
    sides: { home: string; away: string },
    prefetchedClubs?: IClub[],
    prefetchedTactics?: { home: ITactic; away: ITactic }
  ) {
    try {
      this.Coordinates = new Coordinates();

      // `withPlayersAndManager` populates both Players (needed for the
      // match roster) and Manager (a full object) in one repository call -
      // Manager is flattened straight back to a bare id here since
      // everything downstream (resolveManagerTactic, updateFixture's
      // HomeManager/AwayManager) expects that shape, matching IClub.Manager.
      const teams =
        prefetchedClubs ??
        (await getClubs({ ids: clubs }, { withPlayersAndManager: true })).map(
          (c) => ({
            ...c,
            Manager:
              c.Manager && typeof c.Manager === 'object'
                ? (c.Manager as unknown as { _id: string })._id
                : c.Manager,
          })
        );

      // Kickoff spot, resolved as the exact center of the pitch regardless
      // of grid resolution (previously PlayingField[82], a flat-index hack
      // that only pointed to the center on a 15x11 grid).
      const centerBlock = this.Coordinates.Field.getBlockByFraction(0.5, 0.5);

      this.Game = new Game(
        teams as any,
        sides,
        { color: '#ffffff', cb: centerBlock },
        { fname: 'Anjus', lname: 'Banjus', level: 'normal' },
        centerBlock,
        this.Coordinates.Field,
        this.Coordinates
      );

      this.Game.refAssignMatch();

      this.Game.setClubPlayers();

      // Formation shapes are no longer HOME/AWAY-specific - each side's
      // attacking direction is derived from its ScoringSide/KeepingSide.
      const homeClub = teams.find((c) => c._id?.toString() === sides.home);
      const awayClub = teams.find((c) => c._id?.toString() === sides.away);

      const tactics = prefetchedTactics ?? {
        home: await resolveManagerTactic(homeClub?.Manager),
        away: await resolveManagerTactic(awayClub?.Manager),
      };

      this.Game.setClubFormations(tactics.home, tactics.away);

      this.listenForGameEvents();

      return this.Game;
    } catch (err) {
      console.log('Error setting up game! (in App) =>', err);
      throw new Error(err as any);
    }
  }

  /** Start Game => Run this after setting up Game */
  public startGame() {
    try {
      return this.Game!.startHalf();
    } catch (error) {
      console.log('Error starting game! =>', error);
    }
  }

  /** [EXPERIMENTAL] Run this last! */
  public endGame() {
    try {
      this.Game = undefined;
    } catch (error) {
      console.log('Error ending game! =>', error);
    }
  }

  public listenForGameEvents() {
    matchEvents.on(`${this.Game!.Match.id}-set-playing-sides`, () => {
      const playingSides = this.Game!.setPlayingSides();

      matchEvents.emit(
        `${this.Game!.Match.id}-setting-playing-sides`,
        playingSides
      );
    });
  }
}
