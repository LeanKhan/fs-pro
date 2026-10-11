/**
 * Decode the multiplayer gateway ticket's claims (docs/coc-mapping/08 §4, OW-N10).
 *
 * The ticket is `base64url(json).base64url(hmac-sha256)` with claims
 * `{ uid, name, clubs, assocs, code, admin, exp }`. The gateway trusts the
 * claims; the client can read the same first segment — cheaply, with no extra
 * request — to discover **which associations this manager's clubs belong to**,
 * which is otherwise not exposed by any REST route. This module only reads the
 * `assocs` claim; it never verifies the signature (the server does that).
 *
 * Pure: no Vue, no network. Unit-tested in `realtime-ticket.test.ts`.
 */
import { isRecord } from './coerce';

export interface TicketClaims {
  uid?: string;
  name?: string;
  clubs?: string[];
  assocs?: string[];
  code?: string;
  admin?: boolean;
}

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  // `atob` is a global in every browser and in Node >= 16, so no polyfill is
  // needed and the browser bundle never references Buffer.
  return atob(padded);
}

/** The ticket's JSON claims, or null when the ticket is malformed. */
export function decodeTicketClaims(ticket: string): TicketClaims | null {
  if (typeof ticket !== 'string') return null;
  const segment = ticket.split('.')[0];
  if (!segment) return null;
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(segment));
    return isRecord(parsed) ? (parsed as TicketClaims) : null;
  } catch {
    return null;
  }
}

/** The association ids in a ticket's `assocs` claim (deduped, in order). */
export function associationIdsFrom(ticket: string): string[] {
  const claims = decodeTicketClaims(ticket);
  const raw = claims?.assocs;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id === 'string' && id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
