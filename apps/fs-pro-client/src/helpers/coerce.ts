/**
 * Defensive readers for untrusted JSON payloads.
 *
 * Several Track A routes (`season.*`, `legacy.*`, `honours.*`, `associations.*`,
 * `abilities.*`, `orders.*`) declare their response body as `z.unknown()` — the
 * Go handlers build column-keyed `map[string]any` by hand, so the client must
 * treat every field as untrusted. These tiny pure readers let each view-model
 * coerce once, without sprinkling `any` or non-null assertions. No Vue, no
 * network, no clock.
 */

/** A JSON object (and not an array / null). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A string, or `fallback` when the value is not a string. */
export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** A finite integer, truncated; `fallback` otherwise. */
export function int(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
}

/** A finite number; `fallback` otherwise. */
export function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A boolean; `fallback` otherwise. */
export function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** An array (never null); `[]` for anything else. */
export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** A non-empty string, or `null`. */
export function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** A finite integer, or `null` (for nullable server fields). */
export function nullableInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}

/** A record, or an empty object (for map fields such as `perks`). */
export function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/** Map a record's numeric values to `{ key, count }` rows, sorted by key. */
export function counts(value: unknown): { key: string; count: number }[] {
  const src = record(value);
  return Object.keys(src)
    .sort()
    .map((key) => ({ key, count: int(src[key], 0) }))
    .filter((row) => row.count > 0);
}
