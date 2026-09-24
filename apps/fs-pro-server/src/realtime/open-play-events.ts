import { getIO } from './io';

/**
 * Open-play events on the default Socket.IO namespace
 * (docs/OPEN-PLAY-COMPETITIONS-SPEC.md, "Realtime"). Payloads carry ids
 * only; clients refetch what they show. Broadcast to every signed-in client
 * (the namespace only admits sockets with a session); each client keeps the
 * events about its own club. A no-op outside the server (scripts, checks).
 */

export interface OpenPlayEvents {
  'edition:updated': { editionIds: string[]; reason: string };
  'challenge:received': { fixtureId: string; clubId: string; editionId: string | null };
  'challenge:updated': { fixtureId: string; clubIds: string[]; status: string };
  'rankings:updated': { editionIds: string[] };
  'world:day': { day: number; nextDay: number | null; matches: number };
  'world:year-ended': { year: number; label: string };
  'club:level-changed': { clubId: string; from: number; to: number; source: string };
}

export function emitOpenPlay<K extends keyof OpenPlayEvents>(event: K, payload: OpenPlayEvents[K]) {
  try {
    getIO()?.emit(event, payload);
  } catch (err) {
    console.error(`[realtime] ${event} failed`, err);
  }
}
