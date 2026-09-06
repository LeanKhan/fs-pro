import type {
  IFieldPlayer,
  IGameStats,
  IPlayerAttributes,
  PlayerInterface,
  PlayerMatchStatus,
} from '../../interfaces/Player';
import type { IMatchDetails, IMatchEvent, IMatchFrame } from '../classes/Match';
import type { Match } from '../classes/Match';
import type { MatchSide } from '../classes/MatchSide';
import type { IActiveTactic } from './PersistentState/Formations';
import type { RandomState } from '../randomness';

export type MatchSideKey = 'home' | 'away';

export interface SimulationCoordinate {
  x: number;
  y: number;
  key?: string;
}

export interface PossessionState {
  teamId?: string;
  teamCode?: string;
  playerId?: string;
  playerCode?: string;
  status: 'held' | 'loose';
}

export interface BallState {
  id?: string;
  color?: string;
  matchId: string;
  position: SimulationCoordinate;
  possession: PossessionState;
}

export interface PlayerPermanentState {
  id: string;
  playerId: string;
  firstName: string;
  lastName: string;
  age: number;
  role: string;
  position: string;
  rating: number;
  value: number;
  wage?: number;
  attributes: IPlayerAttributes;
}

export interface PlayerMatchState {
  permanent: PlayerPermanentState;
  match: {
    side: MatchSideKey;
    teamId: string;
    teamCode: string;
    shirtNumber: string;
    status: PlayerMatchStatus;
    isStarting: boolean;
    isSubstitute: boolean;
    onPitch: boolean;
    hasBall: boolean;
    position: SimulationCoordinate;
    startingPosition: SimulationCoordinate;
    points: number;
    goalsScored: number;
    stats: IGameStats;
  };
}

export interface TeamMatchState {
  side: MatchSideKey;
  teamId: string;
  teamCode: string;
  name: string;
  goalsScored: number;
  scoringSide: SimulationCoordinate;
  keepingSide: SimulationCoordinate;
  tactic?: IActiveTactic;
  stats: IMatchDetails['HomeTeamDetails'];
  startingPlayerIds: string[];
  activePlayerIds: string[];
  substitutePlayerIds: string[];
}

export interface MatchState {
  id: string;
  minute: number;
  centerBlock: SimulationCoordinate;
  ball: BallState;
  possession: PossessionState;
  teams: {
    home: TeamMatchState;
    away: TeamMatchState;
  };
  players: PlayerMatchState[];
  events: IMatchEvent[];
  frames: IMatchFrame[];
  details: IMatchDetails;
  random?: RandomState;
}

export interface MatchStateSnapshotOptions {
  random?: RandomState;
}

const toCoordinate = (block: { x: number; y: number; key?: string }) => ({
  x: block.x,
  y: block.y,
  key: block.key,
});

const playerIdentity = (player: Pick<PlayerInterface, '_id' | 'PlayerID'>) =>
  player._id ?? player.PlayerID;

const findCanonicalHolder = (match: Match): IFieldPlayer | undefined => {
  const players = [
    ...match.Home.StartingSquad,
    ...match.Away.StartingSquad,
  ].filter((player) => player.WithBall);

  if (players.length <= 1) {
    return players[0];
  }

  const ballPosition = players[0].Ball?.Position;
  const matchingBallPosition = players.find(
    (player) => player.BlockPosition.key === ballPosition?.key
  );

  return matchingBallPosition ?? players[0];
};

const createPossessionState = (
  holder: IFieldPlayer | undefined
): PossessionState => {
  if (!holder) {
    return { status: 'loose' };
  }

  return {
    status: 'held',
    teamId: holder.ClubId,
    teamCode: holder.ClubCode,
    playerId: playerIdentity(holder),
    playerCode: holder.PlayerID,
  };
};

const createPlayerState = (
  player: IFieldPlayer,
  side: MatchSideKey,
  team: MatchSide,
  possession: PossessionState
): PlayerMatchState => ({
  permanent: {
    id: playerIdentity(player),
    playerId: player.PlayerID,
    firstName: player.FirstName,
    lastName: player.LastName,
    age: player.Age,
    role: String(player.Role),
    position: player.Position,
    rating: player.Rating,
    value: player.Value,
    wage: player.Wage,
    attributes: { ...player.Attributes },
  },
  match: {
    side,
    teamId: team._id,
    teamCode: team.ClubCode,
    shirtNumber: player.ShirtNumber,
    status: player.MatchStatus,
    isStarting: player.isStarting,
    isSubstitute: player.Substitute,
    onPitch: player.MatchStatus === 'active',
    hasBall: possession.playerId === playerIdentity(player),
    position: toCoordinate(player.BlockPosition),
    startingPosition: toCoordinate(player.StartingPosition),
    points: player.Points,
    goalsScored: player.GoalsScored,
    stats: { ...player.GameStats },
  },
});

const createTeamState = (
  side: MatchSideKey,
  team: MatchSide,
  details: IMatchDetails['HomeTeamDetails']
): TeamMatchState => ({
  side,
  teamId: team._id,
  teamCode: team.ClubCode,
  name: team.Name,
  goalsScored: team.GoalsScored,
  scoringSide: toCoordinate(team.ScoringSide),
  keepingSide: toCoordinate(team.KeepingSide),
  tactic: team.Tactic,
  stats: { ...details },
  startingPlayerIds: team.StartingSquad.map(playerIdentity),
  activePlayerIds: team.ActivePlayers.map(playerIdentity),
  substitutePlayerIds: team.Substitutes.map(playerIdentity),
});

export const createMatchStateSnapshot = (
  match: Match,
  options: MatchStateSnapshotOptions = {}
): MatchState => {
  const holder = findCanonicalHolder(match);
  const possession = createPossessionState(holder);
  const ball = holder?.Ball ?? match.Home.StartingSquad[0]?.Ball;
  const ballPosition = ball?.Position ?? match.CenterBlock;

  return {
    id: match.id,
    minute: match.getCurrentTime,
    centerBlock: toCoordinate(match.CenterBlock),
    ball: {
      id: ball?.id,
      color: ball?.Color,
      matchId: match.id,
      position: toCoordinate(ballPosition),
      possession,
    },
    possession,
    teams: {
      home: createTeamState('home', match.Home, match.Details.HomeTeamDetails),
      away: createTeamState('away', match.Away, match.Details.AwayTeamDetails),
    },
    players: [
      ...match.Home.StartingSquad.map((player) =>
        createPlayerState(player, 'home', match.Home, possession)
      ),
      ...match.Away.StartingSquad.map((player) =>
        createPlayerState(player, 'away', match.Away, possession)
      ),
    ],
    events: [...match.Events],
    frames: [...match.Frames],
    details: { ...match.Details },
    random: options.random,
  };
};

export const matchStateToDetails = (
  state: MatchState,
  previous: Partial<IMatchDetails> = {}
): IMatchDetails => {
  const homeScore = state.teams.home.goalsScored;
  const awayScore = state.teams.away.goalsScored;

  return {
    ...previous,
    ...state.details,
    HomeTeamScore: homeScore,
    AwayTeamScore: awayScore,
    FullTimeScore: `${homeScore} : ${awayScore}`,
    Goals: homeScore + awayScore,
    Draw: homeScore === awayScore,
    Winner:
      homeScore === awayScore
        ? null
        : homeScore > awayScore
          ? { code: state.teams.home.teamCode, id: state.teams.home.teamId }
          : { code: state.teams.away.teamCode, id: state.teams.away.teamId },
    Loser:
      homeScore === awayScore
        ? null
        : homeScore > awayScore
          ? { code: state.teams.away.teamCode, id: state.teams.away.teamId }
          : { code: state.teams.home.teamCode, id: state.teams.home.teamId },
    HomeTeamDetails: { ...state.teams.home.stats },
    AwayTeamDetails: { ...state.teams.away.stats },
  } as IMatchDetails;
};
