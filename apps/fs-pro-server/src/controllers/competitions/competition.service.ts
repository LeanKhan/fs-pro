import { CompetitionInterface } from './competition.model';
import { CompetitionRepositoryFactory } from '../../repositories/CompetitionRepositoryFactory';
import {
  ICompetitionFilter,
  ICompetitionReadOptions,
} from '../../repositories/CompetitionRepository';
import { getClubs } from '../clubs/club.service';
import { getSeasons } from '../seasons/season.service';

/**
 * Repository-backed functions below are for the identity/CRUD surface that
 * has no Club/Season membership-mutation in play - `update()` only accepts
 * plain fields. `addClubToCompetition`/`addSeasonToCompetition` (Club- and
 * Season-coupled) and any arbitrary-query fetch stay on the raw functions
 * below/exported, unchanged. See FUTURE-PLANS.md for the full writeup.
 */
let competitionRepo: ReturnType<
  typeof CompetitionRepositoryFactory.create
> | null = null;

function getCompetitionRepo() {
  if (!competitionRepo) {
    competitionRepo = CompetitionRepositoryFactory.create();
  }
  return competitionRepo;
}

export async function getCompetitionById(
  id: string,
  options?: ICompetitionReadOptions
) {
  return getCompetitionRepo().findById(id, options);
}

export async function getCompetitions(
  filter?: ICompetitionFilter,
  options?: ICompetitionReadOptions
) {
  return getCompetitionRepo().findAll(filter, options);
}

export async function createCompetition(data: Partial<CompetitionInterface>) {
  return getCompetitionRepo().create(data);
}

export async function updateCompetitionFields(
  id: string,
  data: Partial<CompetitionInterface>
) {
  return getCompetitionRepo().update(id, data);
}

export async function deleteCompetitionById(id: string) {
  return getCompetitionRepo().delete(id);
}

/**
 * Repository-backed equivalent of the raw `fetchOneById(id, true)`'s
 * default populate - `Competition.Clubs`/`Competition.Seasons` don't exist
 * on Postgres (dropped in favor of the reverse `Clubs.League` FK and
 * `Seasons.Competition` FK respectively - see `addClubToCompetition`'s doc
 * comment for why `Clubs.League`, not the `competitionClubs` join table),
 * so this composes the two reverse lookups instead of a single populated
 * read.
 */
export async function getCompetitionWithClubsAndSeasons(id: string) {
  const [competition, clubs, seasons] = await Promise.all([
    getCompetitionById(id, { withCountry: true }),
    getClubs({ LeagueId: id }),
    getSeasons({ CompetitionId: id }),
  ]);

  if (!competition) return null;

  return { ...competition, Clubs: clubs, Seasons: seasons };
}
