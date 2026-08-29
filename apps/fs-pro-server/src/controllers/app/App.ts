/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import Coordinates from '../../utils/coordinates';
import { matchEvents } from '../../utils/events';
import { fetchClubs } from '../clubs/club.service';
import Game from '../Game';

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
  public async setupGame(
    clubs: string[],
    sides: { home: string; away: string }
  ) {
    try {
      this.Coordinates = new Coordinates();

      const teams = await fetchClubs({ _id: { $in: clubs } });

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
      this.Game.setClubFormations('433', '433');

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

      matchEvents.emit(`${this.Game!.Match.id}-setting-playing-sides`, playingSides);
    });
  }
}