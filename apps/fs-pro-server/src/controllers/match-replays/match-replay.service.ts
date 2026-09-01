import { IReplayableMatch } from '../../realtime/matchBroadcaster';
import { MatchReplayRepositoryFactory } from '../../repositories/MatchReplayRepositoryFactory';

let matchReplayRepo: ReturnType<typeof MatchReplayRepositoryFactory.create> | null = null;

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
