import type { CompetitionDefinition } from '@repo/api-contract';
import { Fixture } from '../fixtures/fixture.model';

/** A Seasons row: one open-play edition of a competition
 * (docs/OPEN-PLAY-COMPETITIONS-SPEC.md). */
export interface SeasonInterface {
  _id?: string;
  SeasonCode: string;
  Title: string;
  CompetitionId?: string;
  CompetitionCode: string;
  WinnerId?: string;
  Status: string;
  StartDate: Date;
  EndDate: Date;
  EditionNumber?: number | null;
  StartDay?: number | null;
  EndDay?: number | null;
  CurrentStage?: number;
  Definition?: CompetitionDefinition | null;
  /** Populated on `findById` only - see ISeasonRepository's doc comment.
   * `undefined` (not an empty array) whenever it wasn't fetched, e.g. off
   * `findAll` - never a bare id/array of ids either way. */
  Fixtures?: Fixture[];
  Logs?: Record<string, unknown>[];
}

/** A club's line in a result's table snapshot (game results). */
export interface ClubStandings {
  ClubCode: string;
  ClubID: string;
  Points: number;
  Played: number;
  Wins: number;
  Losses: number;
  Draws: number;
  GF: number;
  GA: number;
  GD: number;
}
