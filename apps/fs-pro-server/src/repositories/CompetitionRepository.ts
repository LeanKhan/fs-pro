import { CompetitionInterface } from '../controllers/competitions/competition.model';

export interface ICompetitionFilter {
  Type?: string;
  Division?: number;
  CountryId?: string;
}

export interface ICompetitionReadOptions {
  /** Populate `Country` (a full `Place`, not a bare id) - off by default.
   * `CountryId` always stays a bare id regardless. */
  withCountry?: boolean;
}

/**
 * No `findByNameOrCode`-style lookup, and `update()` takes plain fields
 * only - no Mongo `$push`/`$addToSet` operators. The membership-mutating
 * routes (`addClubToCompetition`, `addSeasonToCompetition`) stay on the raw
 * Mongo path - `Competition.Clubs`/`Competition.Seasons` were dropped from
 * the Postgres schema (Clubs -> the `competitionClubs` join table plus
 * `Clubs.League`, depending on competition type; Seasons -> the reverse
 * `seasons.Competition` FK), and picking the right one of those two
 * mechanisms per competition type is a real design decision, not a
 * mechanical conversion. See FUTURE-PLANS.md.
 */
export interface ICompetitionRepository {
  findById(
    id: string,
    options?: ICompetitionReadOptions
  ): Promise<CompetitionInterface | null>;
  findAll(
    filter?: ICompetitionFilter,
    options?: ICompetitionReadOptions
  ): Promise<CompetitionInterface[]>;
  create(data: Partial<CompetitionInterface>): Promise<CompetitionInterface>;
  update(
    id: string,
    data: Partial<CompetitionInterface>
  ): Promise<CompetitionInterface | null>;
  delete(id: string): Promise<CompetitionInterface>;
}
