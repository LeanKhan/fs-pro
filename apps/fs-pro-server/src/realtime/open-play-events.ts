import { publish } from './world-events';

/**
 * Open-play events (docs/OPEN-PLAY-COMPETITIONS-SPEC.md, "Realtime"), sent
 * through the multiplayer gateway (world-events.ts). Payloads carry ids
 * only; clients refetch what they show. Every event goes to the `world`
 * topic; events about particular clubs also go to those clubs' private
 * topics, so an owner hears about them even off the world screens. A no-op
 * when the gateway is unreachable (scripts, checks).
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

function clubsOf(payload: Record<string, unknown>): string[] {
  const ids = [payload.clubId, ...((payload.clubIds as unknown[]) ?? [])];
  return ids.filter((id): id is string => typeof id === 'string');
}

export function emitOpenPlay<K extends keyof OpenPlayEvents>(event: K, payload: OpenPlayEvents[K]) {
  const topics = ['world', ...clubsOf(payload as Record<string, unknown>).map((id) => `club:${id}`)];
  publish(topics, event, payload);
}
