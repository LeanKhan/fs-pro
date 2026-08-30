import DB from '../../db';
import { IReplayableMatch } from '../../realtime/matchBroadcaster';

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
  return DB.Models.MatchReplay.findOneAndUpdate(
    { Fixture: fixtureId },
    {
      Fixture: fixtureId,
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
    },
    { upsert: true, new: true }
  )
    .lean()
    .exec();
}

export function fetchReplay(fixtureId: string) {
  return DB.Models.MatchReplay.findOne({ Fixture: fixtureId }).lean().exec();
}
