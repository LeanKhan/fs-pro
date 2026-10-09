/**
 * Short club/country codes for the scale harness (seedScaleWorld.ts).
 *
 * The live game has no server-side club-code generator: a founder picks the
 * code and `codeProblem` (`@repo/api-contract`, world-geo.ts:170) accepts
 * `^[A-Z][A-Z0-9]{1,3}$`; uniqueness is enforced by `clubNameTaken`
 * (atlas.service.ts:253) and the `Clubs_ClubCode_unique` index. The only
 * generator the repo runs at scale is this one, so the 100k-club world needs
 * it to stay injective.
 *
 * A letter then three base-36 characters gives 26 * 36^3 = 1,213,056 unique
 * 4-char codes, well past the 100,000-club target. The previous letters-only
 * scheme (`Z` + three base-26 chars) wrapped at 26^3 = 17,576: code(17576)
 * collided with code(0) as "ZAAA", and founding failed with a 409 (B2-2D).
 * Kept in its own side-effect-free module so it is unit-testable
 * (test/scale-codes.test.ts).
 */

export const SCALE_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** The n-th 4-character short code: a letter followed by three base-36
 * characters, injective for n in [0, 26 * 36^3). */
export function scaleClubCode(n: number): string {
  let suffix = '';
  let k = Math.floor(n);
  for (let i = 0; i < 3; i++) {
    suffix = SCALE_CODE_ALPHABET[k % 36] + suffix;
    k = Math.floor(k / 36);
  }
  return SCALE_CODE_ALPHABET[k % 26] + suffix;
}
