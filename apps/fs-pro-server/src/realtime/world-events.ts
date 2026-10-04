import crypto from 'crypto';
import log from '../helpers/logger';

/**
 * Publishing to the multiplayer gateway (apps/fs-pro-realtime, Go). Browsers
 * hold their live connection there; this API only POSTs events to it, signed
 * with REALTIME_SECRET. Payloads carry ids only, and clients refetch what
 * they show, so a lost event costs at most one poll interval.
 *
 * Topics: `world` (everyone), `club:<id>` (the owner only), `campus:<id>`,
 * `edition:<id>`, `fixture:<id>`. See the gateway's hub.go.
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
}

/** A signed, short-lived ticket the browser presents to the gateway. */
export function issueTicket(claims: TicketClaims) {
  const { secret } = realtimeConfig();
  const payload = Buffer.from(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + TICKET_SECONDS }));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest();
  return `${payload.toString('base64url')}.${sig.toString('base64url')}`;
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

/** World-level happenings anyone can see (founding, notable results). */
export interface WorldEvents {
  'world:founded': { kind: 'country' | 'town' | 'club'; id: string; name: string };
  'world:result': { fixtureId: string; homeClubId: string; awayClubId: string; score: string; kind: string };
}

export function publishWorldEvent<K extends keyof WorldEvents>(event: K, payload: WorldEvents[K]) {
  publish('world', event, payload);
}

/** A private notification for a club's owner (e.g. "your grounds were attacked"). */
export function publishClubEvent(clubId: string, event: string, payload: unknown) {
  publish(`club:${clubId}`, event, payload);
}
