/**
 * The one shared Villa (V) money formatter (phase-2 L13, DECISIONS.md D2).
 *
 * Villa is a **display unit only**: stored numbers never change (1 stored unit
 * = V1). This module is the single formatter used by server-written text
 * (inbox, news, welcome, advisor) and by the client, so the symbol/format can
 * never drift between them.
 *
 * Format (D2): `V1.5M` at or above V1M, `V1,500,000` below. Negative amounts
 * keep their sign (`-V1.5M`), which the wage/fee displays need.
 */

/** Format a stored number of Villa for display, e.g. `V1.5M` / `V1,500,000`. */
export function formatVilla(n: number | null | undefined): string {
  const value = Math.round(Number(n ?? 0));
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs >= 1_000_000) {
    // One decimal, but trim a trailing `.0` so a whole million reads `V1M`
    // (the spec's step-0 copy) while `V1.5M` stays exact.
    const millions = (abs / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}V${millions}M`;
  }

  return `${sign}V${abs.toLocaleString('en-US')}`;
}

/**
 * A compact form for tight UI (the resource ticker): `V1.5M`, `V500k`,
 * `V750`. Only the display style changes; the unit is still the Villa.
 */
export function formatVillaCompact(n: number | null | undefined): string {
  const value = Math.round(Number(n ?? 0));
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs >= 1_000_000) {
    const millions = (abs / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}V${millions}M`;
  }
  if (abs >= 1_000) return `${sign}V${Math.round(abs / 1_000)}k`;
  return `${sign}V${abs}`;
}
