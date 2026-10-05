import { publish } from './world-events';

/**
 * Open-play events (docs/OPEN-PLAY-COMPETITIONS-SPEC.md, "Realtime"), sent
 * through the multiplayer gateway (world-events.ts). Payloads carry ids
 * only; clients refetch what they show. Scoped so a 10k-player world isn't
 * told everything (docs/WORLD-PYRAMID-SPEC.md, "Realtime"): edition and
 * ranking updates go to each `edition:<id>` topic, club events to the
 * clubs' private topics, and only the day and year turning go to `world`.
 * A no-op when the gateway is unreachable (scripts, checks).
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

const WORLD_EVENTS = new Set<keyof OpenPlayEvents>(['world:day', 'world:year-ended']);

export function emitOpenPlay<K extends keyof OpenPlayEvents>(event: K, payload: OpenPlayEvents[K]) {
  const p = payload as Record<string, unknown>;
  const editions = Array.isArray(p.editionIds) ? (p.editionIds as string[]) : [];
  const topics = [
    ...(WORLD_EVENTS.has(event) ? ['world'] : []),
    ...editions.map((id) => `edition:${id}`),
    ...clubsOf(p).map((id) => `club:${id}`),
  ];
  if (topics.length) publish(topics, event, payload);
}
