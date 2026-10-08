/**
 * Round a number to a specified places
 */
export function roundTo(number: number, decimalPlaces: number) {
  if (isNaN(number)) return 0;

  try {
    decimalPlaces -= 1;
  } catch (error: any) {
    throw new Error('decimalPlaces has to be a number! => ', error);
  }

  if (isNaN(decimalPlaces) || decimalPlaces < 0) {
    decimalPlaces = -1;
  }

  const g = 10 * 10 ** decimalPlaces;

  return Math.round((number + Number.EPSILON) * g) / g;
}

/** Capitalize te first letter of the text */
export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

import { formatVilla } from '@repo/api-contract';

/** Villa display (L13): delegates to the one shared formatter. Kept under the
 * historical name `currency` so every existing call site converts at once. */
export function currency(value: number | null | undefined) {
  return formatVilla(value ?? 0);
}

/** Formats to Ordinal 1st, 2nd, 3rd etc from
 *
 * https://stackoverflow.com/a/31615643/10382407
 *  */
export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'],
    v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
