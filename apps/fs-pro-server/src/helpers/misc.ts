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

/** Get a random number between min and max */
export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min);
}

/** Capitalize te first letter of the text */
export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** From https://stackoverflow.com/a/62943089 */
export function generateRandomNDigits(n: number): number {
  return Math.floor(Math.random() * (9 * (Math.pow(10, n)))) + (Math.pow(10, n));
}

// shuffle an array
// from https://stackoverflow.com/a/31811162/10382407
function swap(arr: unknown[], i: number, j: number) {
  // swaps two elements of an array in place
  const temp = arr[i];
  arr[i] = arr[j];
  arr[j] = temp;
}

/** Returns random integer between 0 and max-1 inclusive. */
function randInt(max: number) {
  return Math.floor(Math.random() * max);
}
/**
 * Shuffle an array
 *
 * @param arr array
 * @returns array
 */
export function shuffleArray(arr: unknown[]) {
  // For each slot in the array (starting at the end),
  // pick an element randomly from the unplaced elements and
  // place it in the slot, exchanging places with the
  // element in the slot.
  const a = [...arr];
  for (let slot = a.length - 1; slot > 0; slot--) {
    const element = randInt(slot + 1);
    swap(a, element, slot);
  }

  return a;
}

/**
 * Capitalize first letter of every word.
 * 
 * from => https://stackoverflow.com/a/32589289/10382407
 * */
export function titleCase(str: string) {
   var splitStr = str.toLowerCase().split(' ');
   for (var i = 0; i < splitStr.length; i++) {
       // You do not need to check if i is larger than splitStr length, as your for does that for you
       // Assign it back to the array
       splitStr[i] = splitStr[i].charAt(0).toUpperCase() + splitStr[i].substring(1);     
   }
   // Directly return the joined string
   return splitStr.join(' '); 
}

/** Select random element from array */
export function pickRandomFromArray(array: any[]) {
  return array[Math.floor(Math.random() * array.length)];
}