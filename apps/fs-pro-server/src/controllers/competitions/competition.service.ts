import DB from '../../db';
import { CompetitionInterface, CompetitionModel } from './competition.model';
import { CompetitionRepositoryFactory } from '../../repositories/CompetitionRepositoryFactory';
import { ICompetitionFilter } from '../../repositories/CompetitionRepository';
import { getClubs } from '../clubs/club.service';
import { getSeasons } from '../seasons/season.service';

/**
 * Repository-backed functions below are for the identity/CRUD surface that
 * has no Club/Season membership-mutation in play - `update()` only accepts
 * plain fields. `addClubToCompetition`/`addSeasonToCompetition` (Club- and
 * Season-coupled) and any arbitrary-query fetch stay on the raw functions
 * below/exported, unchanged. See FUTURE-PLANS.md for the full writeup.
 */
let competitionRepo: ReturnType<typeof CompetitionRepositoryFactory.create> | null = null;

function getCompetitionRepo() {
  if (!competitionRepo) {
    competitionRepo = CompetitionRepositoryFactory.create();
  }
  return competitionRepo;
}

export async function getCompetitionById(id: string) {
  return getCompetitionRepo().findById(id);
}

export async function getCompetitions(filter?: ICompetitionFilter) {
  return getCompetitionRepo().findAll(filter);
}

export async function createCompetition(data: Partial<CompetitionInterface>) {
  return getCompetitionRepo().create(data);
}

export async function updateCompetitionFields(id: string, data: Partial<CompetitionInterface>) {
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
    getCompetitionById(id),
    getClubs({ League: id }),
    getSeasons({ Competition: id }),
  ]);

  if (!competition) return null;

  return { ...competition, Clubs: clubs, Seasons: seasons };
}

/**
 * fetchAll Competitions
 */
export function fetchAll(query = {}, select = '') {
  if(select){
  return DB.Models.Competition.find(query).select(select).lean().exec();    
  }
  return DB.Models.Competition.find(query).lean().exec();
}

/**
 * Find One Competition that matches the Query
 * @param query
 * @returns
 */
export function findOne(query: Record<string, any>) {
  return DB.Models.Competition.findOne(query).lean().exec();
}

/**
 * create new competition
 */

export function createNew(data: any) {
  // tslint:disable-next-line: variable-name
  const _competition = new DB.Models.Competition(data);

  return _competition
    .save()
    .then((competition: any) => ({ error: false, result: competition }))
    .catch((error: any) => ({ error: true, result: error }));
}

export function update(id: string, data: any): Promise<CompetitionInterface> {
  return DB.Models.Competition.findByIdAndUpdate(id, data, { new: true })
    .lean()
    .exec();
}

export function deleteById(id: string) {
  return DB.Models.Competition.findByIdAndDelete(id).lean().exec();
}

/**
 * Delete by remove()
 * So that it invokes a 'remove' middleware in Mongoose
 * @param id Competition Id
 * @returns
 */
export async function deleteByRemove(id: string) {

   const doc = await DB.Models.Competition.findById(id);

   if(!doc) {
     throw new Error(`Competition [${id}] does not exist`);
   }

   return doc.remove();
  }

// TODO: Yo! Add a limit or 'size' for the max number of clubs

/**
 * Add Club to Competition
 */
export function addClub(competitionId: string, clubId: string) {
  return DB.Models.Competition.findByIdAndUpdate(
    competitionId,
    {
      $push: { Clubs: clubId },
    },
    { new: true }
  )
    .lean()
    .exec();
}

/**
 * Update Competition by ID
 */
export function updateCompetition(
  competitionId: string,
  update: Record<string, never>
) {
  return DB.Models.Competition.findByIdAndUpdate(competitionId, update, {
    new: true,
  })
    .lean()
    .exec();
}

/**
 * Add Season to Competition
 * @param competitiionId
 * @param seasonId
 */
export function addSeason(competitionId: string, seasonId: string) {
  return DB.Models.Competition.findByIdAndUpdate(
    competitionId,
    {
      $push: { Seasons: seasonId },
    },
    { new: true }
  )
    .lean()
    .exec();
}
