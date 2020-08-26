import DB from '../../db';
import { DayInterface } from './day.model';
/**
 * fetchAll Days
 */
export function fetchAll(query: {} = {}) {
  return DB.Models.Day.find(query).lean().exec();
}

/**
 * fetch many Days
 * @param query
 */
export function fetchMany(
  query: {} = {},
  populate = true,
  page = 1,
  limit = 14
) {
  return DB.Models.Day.find(query).lean().exec();
}

/**
 * Fetch One By Id
 *
 * Fetch a specific day by its id
 * @param id
 */
export function fetchOneById(
  id: string,
  populate: string | object | boolean
): Promise<DayInterface> {
  if (populate) {
    return DB.Models.Day.findById(id).populate(populate).lean().exec();
  }

  return DB.Models.Day.findById(id).lean().exec();
}

/**
 * Find a One Day By any condition...
 *
 *
 * @param query the condition e.g Matche.length == 0
 */
export function findOne(
  query: any,
  populate: string | object | boolean
): Promise<DayInterface> {
  if (populate) {
    return DB.Models.Day.findOne(query).populate(populate).lean().exec();
  }

  return DB.Models.Day.findOne(query).lean().exec();
}

/**
 * create new day
 * @param data
 */
export function createNew(data: any) {
  const DAY = new DB.Models.Day(data);

  return DAY.save()
    .then((day) => {
      // incrementCounter('day_counter');
      return { error: false, result: day };
    })
    .catch((error) => ({ error: true, result: error }));
}

/**
 * Delete a Day by its id
 * @param id
 */
export async function deleteById(id: string) {
  return DB.Models.Day.findByIdAndDelete(id).lean().exec();
}

/**
 * Find one Day and update
 * @param {} query
 * @param update
 */
export function findOneAndUpdate(
  query: {},
  update: any
): Promise<DayInterface> {
  return DB.Models.Day.findOneAndUpdate(query, update, { new: true })
    .lean()
    .exec();
}

/**
 * Create many Day documents from raw day objects
 * @param {DayInterface} days raw day objects
 */
export function createMany(days: DayInterface[]) {
  return DB.Models.Day.insertMany(days, { ordered: true });
}
