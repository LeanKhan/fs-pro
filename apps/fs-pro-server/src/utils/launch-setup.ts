/** Pure helpers for the launch setup (phase-1 B5A). Kept dependency-free so
 * they can be unit-tested without touching the database. */

/** The username a fresh admin gets from their email. */
export function usernameFromEmail(email: string): string {
  const local = email.trim().toLowerCase().split('@')[0] ?? '';
  const cleaned = local.replace(/[^a-z0-9._-]/g, '');
  return cleaned.length >= 3 ? cleaned : `admin${cleaned}`;
}

/** Pick a username that is not in `taken` (case-insensitive), suffixing 2, 3… */
export function uniqueUsername(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((u) => u.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}${i}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
