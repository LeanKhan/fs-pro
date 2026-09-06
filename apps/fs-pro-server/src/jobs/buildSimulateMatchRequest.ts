import { getClubs } from '../controllers/clubs/club.service';
import { resolveManagerTactic } from '../controllers/managers/manager.service';
import { ITactic } from '../simulation/state/PersistentState/Formations';
import { SimulateMatchRequest } from './simulationContract';

/**
 * Milestone 9 - the clubs-fetch + tactics-resolve-if-not-prefetched logic
 * that used to live in two places (inline in App.setupGame() for the old
 * synchronous kickoffNew path, duplicated in matchQueue.ts's runMatchJob
 * for the debug enqueue path). Both real callers of simulateMatch() now
 * build their request through this one function instead.
 *
 * Deliberately does NOT fetch the Fixture itself - both callers already
 * have it (for reasons of their own: play() needs it for SeasonCode/
 * isFriendly/SaveStats, the debug queue just needs Home/AwayTeamId) - this
 * only turns club ids into the plain, worker-safe SimulateMatchRequest.
 */
export async function buildSimulateMatchRequest(
  fixtureId: string,
  home: string,
  away: string,
  prefetchedTactics?: { home: ITactic; away: ITactic }
): Promise<SimulateMatchRequest> {
  // `withPlayersAndManager` populates Players (needed for the match
  // roster) - ManagerId stays a bare id regardless (see IClubReadOptions).
  const clubs = await getClubs(
    { ids: [home, away] },
    { withPlayersAndManager: true }
  );

  const homeClub = clubs.find((c: any) => c._id?.toString() === home);
  const awayClub = clubs.find((c: any) => c._id?.toString() === away);

  const tactics =
    prefetchedTactics ??
    ({
      home: await resolveManagerTactic(homeClub?.ManagerId),
      away: await resolveManagerTactic(awayClub?.ManagerId),
    } as { home: ITactic; away: ITactic });

  // Strip Mongoose/BSON ObjectId instances etc. down to plain data before
  // this crosses the worker_thread boundary (workerData is structured
  // clone, not every Mongoose-lean() field survives that cleanly).
  const plainClubs = JSON.parse(JSON.stringify(clubs));

  return {
    fixtureId,
    clubs: plainClubs,
    sides: { home, away },
    tactics,
  };
}
