// router

import DB from '../../db';
import respond from '../../helpers/responseHandler';
import { Request, Response } from 'express';
import { AwardInterface } from './awards.model';
import { AwardRepositoryFactory } from '../../repositories/AwardRepositoryFactory';
import { IAwardFilter } from '../../repositories/AwardRepository';
import { getPlayerById } from '../players/player.service';
import { getManagerById } from '../managers/manager.service';
import { getClubById } from '../clubs/club.service';
import { getSeasonById } from '../seasons/season.service';

let awardRepo: ReturnType<typeof AwardRepositoryFactory.create> | null = null;

function getAwardRepo() {
  if (!awardRepo) {
    awardRepo = AwardRepositoryFactory.create();
  }
  return awardRepo;
}

/** Batch-resolves a set of Awards' `id` field (`Recipient`/`Club`/`Season`)
 * against distinct ids via `getById`, merging the results back - one query
 * per distinct id, not per Award (a season only ever has a handful of
 * Awards, so this stays simple rather than adding an `ids`-batch filter to
 * four different repositories for one small read). */
async function attachField<T extends Record<string, any>>(
  rows: T[],
  field: keyof T,
  getById: (id: string) => Promise<any>
): Promise<T[]> {
  const ids = [...new Set(rows.map((r) => r[field]).filter(Boolean))] as string[];
  const resolved = await Promise.all(ids.map((id) => getById(id)));
  const map = new Map(ids.map((id, i) => [id, resolved[i]]));
  return rows.map((r) => (r[field] ? { ...r, [field]: map.get(r[field] as string) ?? r[field] } : r));
}

/**
 * `SERVICES`
 *
 * `Recipient` is polymorphic - `recipient` ('player' or 'manager') tells us
 * which repository to resolve it against, replacing the old runtime
 * `model: capitalize(recipient)` Mongoose populate (there's no equivalent
 * "populate against whichever model this string names" on Postgres, and
 * genuinely doesn't need one - two known types, a small switch is simpler
 * than what it replaces).
 */
export async function fetchAll(
  query: IAwardFilter = {},
  recipient: string,
  populate: string
): Promise<AwardInterface[]> {
  let awardRows: any[] = await getAwardRepo().findAll(query);
  if (!populate) return awardRows;

  const getRecipientById = recipient === 'manager' ? getManagerById : getPlayerById;
  awardRows = await attachField(awardRows, 'Recipient', getRecipientById);

  if (populate === 'club' || populate === 'club-season') {
    awardRows = await attachField(awardRows, 'Club', getClubById);
  }

  if (populate === 'club-season') {
    awardRows = await attachField(awardRows, 'Season', getSeasonById);
  }

  return awardRows;
}

/**
 * FetchOneById
 *
 * Fetch a specific Award by id
 * @param id
 */
export function fetchOneById(
  id: string,
  populate = false
): Promise<AwardInterface> {
  if (populate) {
    return DB.Models.Award.findById(id).populate('Club').lean().exec();
  }
  return DB.Models.Award.findById(id).lean().exec();
}

/**
 * Fetch one specific Award by a query
 *
 * Fetch a specific Award by id
 * @param query
 */
export function fetchOne(query: any): Promise<AwardInterface> {
  return DB.Models.Award.findOne(query).lean().exec();
}

/** ROUTER */
// export function allAwards(req: Request, res: Response) {
//   fetchAll({})
//     .then((awards) => {
//       respond.success(res, 200, 'Awards fetched successfully', awards);
//     })
//     .catch((err) => {
//       respond.fail(res, 400, 'Error fetching Awards', err);
//     });
// }

/**
 * Create Many Award docs
 */
export function createAwards(awards: Partial<AwardInterface>[]) {
  return getAwardRepo().createMany(awards);
}

// controller

// services

// model :)
// router
