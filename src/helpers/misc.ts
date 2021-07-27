/**
 * Round a number to a specified places
 */
export function roundTo(number: number, decimalPlaces: number) {
  if (isNaN(number)) return 0;

  try {
    decimalPlaces -= 1;
  } catch (error) {
    throw new Error('decimalPlaces has to be a number!');
  }

  if (isNaN(decimalPlaces) || decimalPlaces < 0) {
    decimalPlaces = -1;
  }

  const g = 10 * 10 ** decimalPlaces;

  return Math.round((number + Number.EPSILON) * g) / g;
}
