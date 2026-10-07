import { inArray } from 'drizzle-orm';
import { isPacked } from '@repo/api-contract';
import { DrizzleDatabase } from '../../db/drizzle';
import { players } from '../../db/drizzle/schema';
import { IReplayableMatch } from '../../realtime/matchBroadcaster';
import { MatchReplayRepositoryFactory } from '../../repositories/MatchReplayRepositoryFactory';

let matchReplayRepo: ReturnType<
  typeof MatchReplayRepositoryFactory.create
> | null = null;

function getMatchReplayRepo() {
  if (!matchReplayRepo) {
    matchReplayRepo = MatchReplayRepositoryFactory.create();
  }
  return matchReplayRepo;
}

/**
 * Upserts the finished match's frames under its fixture id, so it can be
 * re-streamed later via restRewatchMatch without re-running the simulation.
 * Upsert (not insert) because a fixture can in principle be replayed more
 * than once in dev/testing flows - the latest simulation should win.
 */
export function saveReplay(
  fixtureId: string,
  match: IReplayableMatch,
  tickMs = 300
) {
  return getMatchReplayRepo().upsertByFixtureId(fixtureId, {
    Home: {
      id: match.Home._id,
      name: match.Home.Name,
      code: match.Home.ClubCode,
    },
    Away: {
      id: match.Away._id,
      name: match.Away.Name,
      code: match.Away.ClubCode,
    },
    Frames: match.Frames,
    Details: match.Details,
    TickMs: tickMs,
  } as any);
}

export function fetchReplay(fixtureId: string) {
  return getMatchReplayRepo().findByFixtureId(fixtureId);
}

/** Display names ("F. Lastname") for everyone in a replay's roster, so
 * the Matchzone can label players without a second request. */
export async function replayPlayerNames(frames: unknown): Promise<Record<string, string>> {
  const ids = new Set<string>();
  if (isPacked(frames as any)) {
    for (const r of (frames as { roster: { id: string }[] }).roster) ids.add(r.id);
  } else if (Array.isArray(frames)) {
    for (const f of frames as { players?: { id: string }[] }[]) for (const p of f.players ?? []) ids.add(p.id);
  }
  if (!ids.size) return {};
  const rows = await DrizzleDatabase.getInstance()
    .database.select({ id: players.id, first: players.FirstName, last: players.LastName })
    .from(players)
    .where(inArray(players.id, [...ids]));
  return Object.fromEntries(rows.map((r) => [r.id, `${r.first.charAt(0)}. ${r.last}`]));
}
