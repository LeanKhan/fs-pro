import crypto from 'crypto';
import log from '../helpers/logger';

/**
 * Publishing to the multiplayer gateway (apps/fs-pro-realtime, Go). Browsers
 * hold their live connection there; this API only POSTs events to it, signed
 * with REALTIME_SECRET. Payloads carry ids only, and clients refetch what
 * they show, so a lost event costs at most one poll interval.
 *
 * Topics: `world` (everyone), `club:<id>` (the owner only), `campus:<id>`,
 * `edition:<id>`, `fixture:<id>`, and the news scopes `town:<id>`,
 * `region:<id>`, `country:<id>` (docs/WORLD-PYRAMID-SPEC.md). See the
 * gateway's hub.go.
 */

const DEV_SECRET = 'fs-pro-dev-realtime-secret';
const TICKET_SECONDS = 10 * 60;

export function realtimeConfig() {
  const secret = process.env.REALTIME_SECRET?.trim() || DEV_SECRET;
  const url = (process.env.REALTIME_URL?.trim() || 'http://localhost:3005').replace(/\/$/, '');
  // Where browsers connect; differs from `url` behind a proxy.
  const publicUrl = (process.env.REALTIME_PUBLIC_URL?.trim() || url).replace(/^http/, 'ws').replace(/\/$/, '');
  return { secret, url, publicUrl, enabled: process.env.REALTIME_URL?.trim() !== 'off' };
}

if (!process.env.REALTIME_SECRET?.trim()) {
  console.warn('[realtime] REALTIME_SECRET is not set - using the insecure development secret.');
}

export interface TicketClaims {
  uid: string;
  name: string;
  clubs: string[];
  code?: string;
  admin?: boolean;
  /** The account's email is confirmed (or confirmation isn't required): it may chat. */
  ver?: boolean;
}

/** A signed, short-lived ticket the browser presents to the gateway. */
export function issueTicket(claims: TicketClaims) {
  const { secret } = realtimeConfig();
  const payload = Buffer.from(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + TICKET_SECONDS }));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest();
  return `${payload.toString('base64url')}.${sig.toString('base64url')}`;
}

/** Calls a signed moderator endpoint on the gateway (apps/fs-pro-realtime/moderation.go). */
export async function gatewayAdmin(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const { secret, url, enabled } = realtimeConfig();
  if (!enabled) return { ok: false, status: 503, data: { error: 'Realtime is off' } };
  const text = JSON.stringify(body);
  const signature = crypto.createHmac('sha256', secret).update(text).digest('hex');
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': signature },
    body: text,
    signal: AbortSignal.timeout(5000),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { ok: res.ok, status: res.status, data };
}

let lastFailureLog = 0;

/** Fire-and-forget: publish `event` to each topic. Never throws. */
export function publish(topics: string | string[], event: string, data: unknown) {
  const { secret, url, enabled } = realtimeConfig();
  if (!enabled) return;
  const body = JSON.stringify({ topics: Array.isArray(topics) ? topics : [topics], event, data });
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  fetch(`${url}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': signature },
    body,
    signal: AbortSignal.timeout(2000),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    })
    .catch((err) => {
      // Scripts and checks run without the gateway; say so once a minute at most.
      if (Date.now() - lastFailureLog > 60_000) {
        lastFailureLog = Date.now();
        log(`[realtime] gateway unreachable at ${url} (${err instanceof Error ? err.message : String(err)})`);
      }
    });
}

/** World-level happenings anyone can see. Results reach the world only as
 * escalated news (services/world/news-scope.service.ts), never one by one. */
export interface WorldEvents {
  'world:founded': {
    kind: 'country' | 'town' | 'club';
    id: string;
    name: string;
    /** For a club: where it went, and the places it opened. */
    townId?: string;
    countryId?: string;
    opened?: ('town' | 'region' | 'country')[];
  };
}

export function publishWorldEvent<K extends keyof WorldEvents>(event: K, payload: WorldEvents[K]) {
  publish('world', event, payload);
}

/** A private notification for a club's owner (e.g. "your grounds were attacked"). */
export function publishClubEvent(clubId: string, event: string, payload: unknown) {
  publish(`club:${clubId}`, event, payload);
}
