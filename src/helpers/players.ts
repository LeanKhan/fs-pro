import {
  AttackerMultipliers,
  MidfielderMultipliers,
  DefenderMultipliers,
  GoalkeeperMultipliers,
  Multipliers,
  PlayerAttributes,
} from '@/interfaces/player';

function calculateTotal(multiplier: Multipliers, attributes: PlayerAttributes) {
  const total =
    attributes.Shooting * multiplier.Shooting +
    attributes.ShortPass * multiplier.ShortPass +
    attributes.LongPass * multiplier.LongPass +
    attributes.Control * multiplier.Control +
    attributes.Mental * multiplier.Mental +
    attributes.Speed * multiplier.Speed +
    attributes.Stamina * multiplier.Stamina +
    attributes.Strength * multiplier.Strength +
    attributes.Tackling * multiplier.Tackling +
    attributes.SetPiece * multiplier.SetPiece +
    attributes.Keeping * multiplier.Keeping +
    attributes.Dribbling * multiplier.Dribbling;

  return total;
}

/**
 * calculate player rating!
 */
export function calculatePlayerRating(
  attributes: PlayerAttributes,
  position: string
) {
  let multiplier: Multipliers;
  let rating = 0;

  switch (position) {
    case 'ATT':
      multiplier = AttackerMultipliers;
      rating = calculateTotal(multiplier, attributes);
      break;
    case 'MID':
      multiplier = MidfielderMultipliers;
      rating = calculateTotal(multiplier, attributes);
      break;
    case 'DEF':
      multiplier = DefenderMultipliers;
      rating = calculateTotal(multiplier, attributes);
      break;
    case 'GK':
      multiplier = GoalkeeperMultipliers;
      rating = calculateTotal(multiplier, attributes);
      break;
    default:
      break;
  }

  return rating;
}
