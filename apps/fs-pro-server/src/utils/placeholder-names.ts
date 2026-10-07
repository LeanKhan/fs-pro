/**
 * Small static first/last-name pool - a stand-in for worldgen's
 * `/names/generate` endpoint. worldgen and its services API
 * (`POST /api/services/worldgen/names`, see services/worldgen/client.ts)
 * now exist; this module is the remaining wiring: youth intake and founding
 * could call the service (with this pool as the offline fallback), after
 * which it can be deleted. Used only by youth-intake generation for now
 * (player-lifecycle.service.ts's runYouthIntakeForYear) - NOT wired into
 * the existing (broken) GET /players/generate-players dev route, which
 * stays on its own separate (currently non-functional) path.
 */
import { pickRandomFromArray } from '../helpers/misc';

export const PLACEHOLDER_FIRST_NAMES = [
  'Aiden', 'Beckett', 'Callum', 'Dorian', 'Elio', 'Finnegan', 'Gideon',
  'Hartley', 'Idris', 'Jasper', 'Kellan', 'Lior', 'Marcus', 'Nolan',
  'Oisin', 'Percy', 'Quinlan', 'Reuben', 'Silas', 'Tobias', 'Ulric',
  'Vance', 'Wesley', 'Xavier', 'Yusuf', 'Zane', 'Amos', 'Brendan',
  'Cyrus', 'Declan',
];

export const PLACEHOLDER_LAST_NAMES = [
  'Ashworth', 'Blackwood', 'Carrow', 'Dunmore', 'Ellery', 'Fairweather',
  'Gantry', 'Halloway', 'Ivester', 'Jorvik', 'Kestrel', 'Lockhart',
  'Marrow', 'Norwick', 'Osgood', 'Pembrook', 'Quarrington', 'Ravenscar',
  'Stonebridge', 'Thackery', 'Underhill', 'Vexley', 'Wrenfield',
  'Yardley', 'Ashgrove', 'Blythe', 'Corvin', 'Draven', 'Everhart',
  'Fenwick',
];

export function pickPlaceholderName(): { firstName: string; lastName: string } {
  return {
    firstName: pickRandomFromArray(PLACEHOLDER_FIRST_NAMES),
    lastName: pickRandomFromArray(PLACEHOLDER_LAST_NAMES),
  };
}
