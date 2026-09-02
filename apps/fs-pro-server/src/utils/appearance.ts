/**
 * Static list of available player-avatar feature variants/styles - used to
 * be a raw Mongo collection (`db.appearance`, 6 fixed documents, never
 * written to by any code path), so it's just fixed application config, not
 * real per-game data. Kept here as a plain constant instead of a table.
 */
const APPEARANCE_FEATURES = [
  { feature: 'eyes', variants: ['default'], styles: ['black'] },
  { feature: 'mouth', variants: ['default'], styles: ['light'] },
  { feature: 'hair', variants: ['default'], styles: ['brown'] },
  { feature: 'eyebrows', variants: ['default'], styles: ['brown'] },
  { feature: 'head', variants: ['default'], styles: ['light'] },
  { feature: 'nose', variants: ['default'], styles: ['light'] },
];

export function fetchAppearance() {
  return Promise.resolve(APPEARANCE_FEATURES);
}
