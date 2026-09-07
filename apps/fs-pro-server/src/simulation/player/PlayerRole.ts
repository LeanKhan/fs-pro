import { IFieldPlayer, IPlayerAttributes } from '../../interfaces/Player';
import { Role } from '../../controllers/players/player.model';

/**
 * Milestone 15 (Player Roles And Tendencies) - the tracker's own 15 roles,
 * unchanged from its sketch. This sits one level finer than two things
 * that already existed and stay unchanged: `Position` (`GK`/`DEF`/`MID`/
 * `ATT` - the broadest, what every branch in `Decider.ts` still switches
 * on) and the squad `Role` (`LW`/`RW`/`ST`/`CB`/... - `controllers/players/
 * player.model.ts`, assigned once at generation, already carried through
 * onto every live `FieldPlayer` via `Player.ts`'s constructor, but never
 * once read anywhere in `src/simulation/` before this milestone). Two
 * players can share both of those and still play completely differently -
 * a `ST` can be a poacher, a target-forward, or a false-nine.
 */
export type PlayerRole =
  | 'goalkeeper'
  | 'sweeper-keeper'
  | 'centre-back'
  | 'ball-playing-defender'
  | 'full-back'
  | 'wing-back'
  | 'holding-midfielder'
  | 'deep-playmaker'
  | 'box-to-box'
  | 'attacking-midfielder'
  | 'winger'
  | 'inside-forward'
  | 'target-forward'
  | 'poacher'
  | 'false-nine';

/**
 * The tracker's own field list ("width, directness, dribbling, shooting,
 * pressing, discipline"), each 0-1 - deliberately the same vocabulary/
 * scale as `IPlayingStyle` (team-level tactics) where the concept overlaps
 * (`width`/`directness`/`pressing`-as-`pressingIntensity`/`discipline`-as-
 * `positionalDiscipline`), since "tactics, role, ability, and tendencies
 * combine" (this milestone's own acceptance criterion) reads most
 * naturally when role tendencies and team tactics are blended on the same
 * scale rather than translated between two different ones.
 */
export interface PlayerTendencies {
  /** 0 = drifts inside/central, 1 = clings to the touchline. */
  width: number;
  /** 0 = short/patient passing bias, 1 = direct/forward-passing bias. */
  directness: number;
  /** 0 = avoids 1v1 duels, 1 = actively seeks them out over passing. */
  dribbling: number;
  /** 0 = reluctant to shoot, 1 = shoots on sight given half a chance. */
  shooting: number;
  /** 0 = conservative off the ball, 1 = presses aggressively. */
  pressing: number;
  /** 0 = drifts freely off the ball, 1 = holds position strictly. */
  discipline: number;
}

/**
 * Hand-tuned starting values - tunable constants, not load-bearing
 * precision, same treatment as `PLAYING_STYLES` in `Formations.ts`. Not
 * meant to be read directly by callers - see `deriveTendencies()`, which
 * nudges these by the player's own attributes.
 */
const ROLE_TENDENCIES: Record<PlayerRole, PlayerTendencies> = {
  goalkeeper: {
    width: 0.1,
    directness: 0.6,
    dribbling: 0.05,
    shooting: 0,
    pressing: 0.1,
    discipline: 0.95,
  },
  'sweeper-keeper': {
    width: 0.15,
    directness: 0.3,
    dribbling: 0.1,
    shooting: 0,
    pressing: 0.3,
    discipline: 0.7,
  },
  'centre-back': {
    width: 0.15,
    directness: 0.55,
    dribbling: 0.15,
    shooting: 0.1,
    pressing: 0.35,
    discipline: 0.9,
  },
  'ball-playing-defender': {
    width: 0.2,
    directness: 0.3,
    dribbling: 0.3,
    shooting: 0.15,
    pressing: 0.3,
    discipline: 0.8,
  },
  'full-back': {
    width: 0.85,
    directness: 0.5,
    dribbling: 0.3,
    shooting: 0.1,
    pressing: 0.45,
    discipline: 0.7,
  },
  'wing-back': {
    width: 0.95,
    directness: 0.5,
    dribbling: 0.45,
    shooting: 0.15,
    pressing: 0.55,
    discipline: 0.55,
  },
  'holding-midfielder': {
    width: 0.35,
    directness: 0.35,
    dribbling: 0.25,
    shooting: 0.15,
    pressing: 0.6,
    discipline: 0.85,
  },
  'deep-playmaker': {
    width: 0.4,
    directness: 0.2,
    dribbling: 0.35,
    shooting: 0.2,
    pressing: 0.35,
    discipline: 0.7,
  },
  'box-to-box': {
    width: 0.5,
    directness: 0.5,
    dribbling: 0.5,
    shooting: 0.4,
    pressing: 0.65,
    discipline: 0.5,
  },
  'attacking-midfielder': {
    width: 0.4,
    directness: 0.5,
    dribbling: 0.6,
    shooting: 0.55,
    pressing: 0.4,
    discipline: 0.4,
  },
  winger: {
    width: 0.9,
    directness: 0.6,
    dribbling: 0.8,
    shooting: 0.45,
    pressing: 0.35,
    discipline: 0.3,
  },
  'inside-forward': {
    width: 0.4,
    directness: 0.55,
    dribbling: 0.7,
    shooting: 0.65,
    pressing: 0.35,
    discipline: 0.3,
  },
  'target-forward': {
    width: 0.35,
    directness: 0.75,
    dribbling: 0.25,
    shooting: 0.7,
    pressing: 0.3,
    discipline: 0.55,
  },
  poacher: {
    width: 0.25,
    directness: 0.65,
    dribbling: 0.3,
    shooting: 0.9,
    pressing: 0.25,
    discipline: 0.6,
  },
  'false-nine': {
    width: 0.35,
    directness: 0.3,
    dribbling: 0.65,
    shooting: 0.55,
    pressing: 0.4,
    discipline: 0.35,
  },
};

/** Position-keyed fallback for the (should-be-rare, `Role` is a nullable
 * DB column) case where a player has no squad `Role` set at all. */
const POSITION_FALLBACK_ROLE: Record<string, PlayerRole> = {
  GK: 'goalkeeper',
  DEF: 'centre-back',
  MID: 'box-to-box',
  ATT: 'poacher',
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Which of two role candidates for the same squad `Role` fits this
 * player's actual attributes better - `preferA` is a positive attribute
 * differential favoring the first candidate (e.g. passing/vision stats
 * for a "plays it out from the back" defender vs a "wins the ball, gets
 * rid of it" one).
 */
function pickByAttributes<T>(a: T, b: T, favorA: number): T {
  return favorA >= 0 ? a : b;
}

/**
 * Milestone 15 - derives a tactical `PlayerRole` from the player's squad
 * `Role` (which slot they line up in) and attributes (how they actually
 * play once there). Deterministic given fixed attributes - same player,
 * same role, every time, no randomness - so two players who happen to
 * share identical attributes would also share a derived role, which is
 * correct: the variation this milestone adds comes from real attribute
 * differences, not from inventing a coin flip.
 */
export function deriveRole(player: IFieldPlayer): PlayerRole {
  const a = player.Attributes;
  const squadRole = player.Role as Role | undefined;

  if (!squadRole) {
    return POSITION_FALLBACK_ROLE[player.Position] ?? 'box-to-box';
  }

  switch (squadRole) {
    case 'GK':
      return (a.Speed + a.ShortPass + a.Control) / 3 > 60
        ? 'sweeper-keeper'
        : 'goalkeeper';
    case 'CB':
      return pickByAttributes(
        'ball-playing-defender',
        'centre-back',
        (a.ShortPass + a.LongPass + a.Vision) / 3 -
          (a.Tackling + a.Strength + a.Marking) / 3
      );
    case 'LB':
    case 'RB':
      return (a.Speed + a.Crossing + a.Stamina) / 3 > 60
        ? 'wing-back'
        : 'full-back';
    case 'CDM':
      return 'holding-midfielder';
    case 'CM':
      return pickByAttributes(
        'deep-playmaker',
        'box-to-box',
        (a.Vision + a.LongPass) / 2 - (a.Stamina + a.Tackling) / 2
      );
    case 'CAM':
      return 'attacking-midfielder';
    case 'LM':
    case 'RM':
      return a.Dribbling > a.Crossing ? 'inside-forward' : 'winger';
    case 'ST':
      if (a.Shooting >= a.Strength && a.Shooting >= a.Vision) return 'poacher';
      if (a.Strength > a.Vision) return 'target-forward';
      return 'false-nine';
    default:
      return POSITION_FALLBACK_ROLE[player.Position] ?? 'box-to-box';
  }
}

/**
 * Role defaults nudged by the player's own attributes ("allow player
 * attributes, personality/tendencies to modify role defaults" - this
 * milestone's own task). Same small `(attribute - 50) / scale` nudge
 * pattern `Decider.confidenceThreshold()` already uses for composure/
 * pressure, applied per tendency to the attribute that actually describes
 * it - a winger with unusually high `Dribbling` for the role dribbles a
 * little more than the role default alone would suggest, not a
 * completely different player.
 */
export function deriveTendencies(player: IFieldPlayer): PlayerTendencies {
  const role = deriveRole(player);
  const base = ROLE_TENDENCIES[role];
  const a = player.Attributes as IPlayerAttributes;

  return {
    // Width is a positional trait (which channel this role occupies), not
    // an attribute-driven one - left as the pure role default.
    width: base.width,
    directness: clamp01(
      base.directness + (a.LongPass - a.ShortPass) / 200
    ),
    dribbling: clamp01(base.dribbling + (a.Dribbling - 50) / 150),
    shooting: clamp01(
      base.shooting + (a.Shooting + a.Positioning - 100) / 300
    ),
    pressing: clamp01(base.pressing + (a.Aggression - 50) / 150),
    discipline: clamp01(base.discipline - (a.Aggression - 50) / 250),
  };
}
