/**
 * The checked-in roster pool: real squads dumped from the dev DB by
 * dumpSimulationRosterPool.ts, used by sim-service checks (simServiceE2E.ts)
 * and by the Rust engine's own tests and sim-lab
 * (crates/sim-core reads the same JSON file).
 */
import * as path from 'path';
import { IClub } from '../interfaces/Club';
import { ITactic } from '../match/tactics';

export const POOL_PATH = path.join(__dirname, 'fixtures', 'simulation-roster-pool.json');

export interface IRosterPool {
  dumpedAt: string;
  clubs: IClub[];
  tactics: Record<string, ITactic>;
}
