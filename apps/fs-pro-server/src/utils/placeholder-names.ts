/**
 * Small static first/last-name pool - an explicit stand-in for
 * worldgen-service's deferred `/names/generate` integration (see the
 * `worldgen_service_integration` memory for that later piece of work).
 * Every name below is a placeholder; this whole module is meant to be
 * deleted once that integration lands. Used only by youth-intake
 * generation for now (player-lifecycle.service.ts's runYouthIntakeForYear)
 * - NOT wired into the existing (broken) GET /players/generate-players dev
 * route, which stays on its own separate (currently non-functional) path.
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
